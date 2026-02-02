/**
 * Trasy publiczne dla launchera
 * Endpointy używane przez klienta launchera
 */
import { Router } from 'express';
import { GameConfig, Mod, Broadcast, LauncherVersion, ActivityLog } from '../models/index.js';
import { authenticateUser, optionalAuth } from '../middleware/index.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { getClientIp } from '../utils/helpers.js';

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

    res.json({
        success: true,
        data: {
            config,
            mods,
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
 * (prosty endpoint - w przyszłości można rozbudować o rzeczywiste sprawdzanie)
 */
router.get('/server-status', asyncHandler(async (req, res) => {
    const config = GameConfig.getPublicConfig();

    res.json({
        success: true,
        data: {
            ip: config.serverIp,
            port: config.serverPort,
            online: !config.maintenanceMode,
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
