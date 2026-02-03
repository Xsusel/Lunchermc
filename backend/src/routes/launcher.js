/**
 * Trasy publiczne dla launchera
 * Endpointy używane przez klienta launchera
 */
import { Router } from 'express';
import { GameConfig, Mod, Broadcast, LauncherVersion, ActivityLog } from '../models/index.js';
import { authenticateUser, optionalAuth } from '../middleware/index.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { getClientIp } from '../utils/helpers.js';
import { pingMinecraftServer, simplePing } from '../utils/mcPing.js';
import db from '../config/database.js';

// Cache dla statusu serwera (odswiezany co 30 sekund)
let serverStatusCache = null;
let serverStatusCacheTime = 0;
const CACHE_TTL = 30000; // 30 sekund

const router = Router();

/**
 * GET /api/launcher/config
 * Pobiera konfigurację gry dla launchera
 * Nie wymaga autoryzacji
 */
router.get('/config', asyncHandler(async (req, res) => {
    const config = GameConfig.getPublicConfig();
    const mods = Mod.getForLauncher();
    const broadcasts = Broadcast.getActive();

    // Pobierz inne pliki (datapacks, configs, etc.)
    const otherFiles = db.prepare(`
        SELECT file_type, filename, relative_path, url, sha256, file_size, is_required
        FROM game_files_extended
        WHERE is_enabled = 1
    `).all();

    // Połącz wszystko w jedną listę plików
    const files = [
        ...mods.map(m => ({
            type: 'mod',
            path: `mods/${m.filename}`,
            filename: m.filename,
            url: m.url,
            sha256: m.sha256,
            size: m.fileSize,
            required: m.required
        })),
        ...otherFiles.map(f => ({
            type: f.file_type,
            path: f.relative_path,
            filename: f.filename,
            url: f.url || `/api/files/download/${f.file_type}/${f.filename}`,
            sha256: f.sha256,
            size: f.file_size,
            required: !!f.is_required
        }))
    ];

    res.json({
        success: true,
        data: {
            config,
            mods, // Zachowujemy dla kompatybilności wstecznej
            files, // Nowa zunifikowana lista
            broadcasts,
            // Metadane dla launchera
            meta: {
                apiVersion: '1.0.0',
                timestamp: new Date().toISOString()
            }
        }
    });
}));

/**
 * GET /api/launcher/mods
 * Pobiera listę modów do pobrania
 */
router.get('/mods', asyncHandler(async (req, res) => {
    const mods = Mod.getForLauncher();

    res.json({
        success: true,
        data: mods
    });
}));

/**
 * GET /api/launcher/broadcasts
 * Pobiera aktywne powiadomienia
 */
router.get('/broadcasts', asyncHandler(async (req, res) => {
    const broadcasts = Broadcast.getActive();

    res.json({
        success: true,
        data: broadcasts
    });
}));

/**
 * GET /api/launcher/check-update
 * Sprawdza dostępność aktualizacji launchera
 */
router.get('/check-update', asyncHandler(async (req, res) => {
    const currentVersion = req.query.version || '0.0.0';
    const updateInfo = LauncherVersion.checkForUpdate(currentVersion);

    res.json({
        success: true,
        data: updateInfo
    });
}));

/**
 * POST /api/launcher/game-start
 * Loguje uruchomienie gry (wymaga autoryzacji)
 */
router.post('/game-start',
    authenticateUser,
    asyncHandler(async (req, res) => {
        const config = GameConfig.getPublicConfig();

        ActivityLog.logGameStart(
            req.userId,
            config.gameVersion,
            getClientIp(req)
        );

        res.json({
            success: true,
            message: 'Uruchomienie gry zostało zalogowane'
        });
    })
);

/**
 * GET /api/launcher/server-status
 * Sprawdza status serwera Minecraft
 * Pinguje serwer MC i zwraca informacje o graczach online
 */
router.get('/server-status', asyncHandler(async (req, res) => {
    const config = GameConfig.getPublicConfig();
    const now = Date.now();

    // Sprawdz cache
    if (serverStatusCache && (now - serverStatusCacheTime) < CACHE_TTL) {
        return res.json({
            success: true,
            data: {
                ...serverStatusCache,
                cached: true,
                maintenanceMode: config.maintenanceMode,
                maintenanceMessage: config.maintenanceMessage
            }
        });
    }

    // Ping serwera MC
    let serverData = {
        ip: config.serverIp,
        port: config.serverPort,
        online: false,
        players: { online: 0, max: 0, sample: [] },
        version: null,
        latency: null,
        description: null
    };

    try {
        if (config.serverIp && !config.maintenanceMode) {
            const pingResult = await pingMinecraftServer(
                config.serverIp,
                config.serverPort || 25565,
                5000
            );

            if (pingResult.online) {
                serverData = {
                    ip: config.serverIp,
                    port: config.serverPort,
                    online: true,
                    players: pingResult.players || { online: 0, max: 0, sample: [] },
                    version: pingResult.version,
                    latency: pingResult.latency,
                    description: pingResult.description
                };
            }
        }
    } catch (error) {
        console.error('Error pinging MC server:', error);
    }

    // Zapisz do cache
    serverStatusCache = serverData;
    serverStatusCacheTime = now;

    res.json({
        success: true,
        data: {
            ...serverData,
            cached: false,
            maintenanceMode: config.maintenanceMode,
            maintenanceMessage: config.maintenanceMessage
        }
    });
}));

/**
 * GET /api/launcher/manifest
 * Pobiera pełny manifest plików do synchronizacji
 * Używany do sprawdzania integralności plików
 */
router.get('/manifest', asyncHandler(async (req, res) => {
    const config = GameConfig.getPublicConfig();
    const mods = Mod.getForLauncher();

    // Budujemy manifest plików
    const manifest = {
        version: config.gameVersion,
        loaderType: config.loaderType,
        forgeVersion: config.forgeVersion,
        fabricVersion: config.fabricVersion,
        files: mods.map(mod => ({
            path: `mods/${mod.filename}`,
            url: mod.url,
            sha256: mod.sha256,
            size: mod.fileSize,
            required: mod.required
        })),
        javaArgs: config.javaArgs,
        server: {
            ip: config.serverIp,
            port: config.serverPort
        },
        generatedAt: new Date().toISOString()
    };

    res.json({
        success: true,
        data: manifest
    });
}));

/**
 * POST /api/launcher/verify-files
 * Weryfikuje integralność plików klienta
 * Klient wysyła listę posiadanych plików z sumami kontrolnymi
 */
router.post('/verify-files',
    optionalAuth,
    asyncHandler(async (req, res) => {
        const { files } = req.body;

        if (!Array.isArray(files)) {
            return res.status(400).json({
                success: false,
                error: 'Wymagana jest tablica plików'
            });
        }

        const serverMods = Mod.getForLauncher();
        const serverModsMap = new Map(serverMods.map(m => [m.filename, m]));

        const result = {
            toDownload: [],  // Pliki do pobrania (brakujące lub nieprawidłowe)
            toDelete: [],    // Pliki do usunięcia (nie są na serwerze)
            valid: []        // Pliki poprawne
        };

        // Sprawdzamy pliki klienta
        const clientFilesMap = new Map(files.map(f => [f.filename, f.sha256]));

        // Sprawdzamy które pliki serwera brakuje lub są nieprawidłowe
        for (const mod of serverMods) {
            const clientSha256 = clientFilesMap.get(mod.filename);

            if (!clientSha256) {
                // Plik nie istnieje u klienta
                result.toDownload.push({
                    filename: mod.filename,
                    url: mod.url,
                    sha256: mod.sha256,
                    size: mod.fileSize,
                    reason: 'missing'
                });
            } else if (clientSha256 !== mod.sha256) {
                // Plik istnieje ale ma złą sumę kontrolną
                result.toDownload.push({
                    filename: mod.filename,
                    url: mod.url,
                    sha256: mod.sha256,
                    size: mod.fileSize,
                    reason: 'checksum_mismatch'
                });
            } else {
                result.valid.push(mod.filename);
            }
        }

        // Sprawdzamy które pliki klienta powinny być usunięte
        for (const clientFile of files) {
            if (!serverModsMap.has(clientFile.filename)) {
                result.toDelete.push(clientFile.filename);
            }
        }

        res.json({
            success: true,
            data: result
        });
    })
);

export default router;
