/**
 * Trasy publiczne dla launchera
 * Endpointy używane przez klienta launchera
 */
import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { GameConfig, Mod, Broadcast, LauncherVersion, ActivityLog, ServerRules, News, Server } from '../models/index.js';
import { authenticateUser, optionalAuth } from '../middleware/index.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { getClientIp, getUploadsPath } from '../utils/helpers.js';
import { pingMinecraftServer, simplePing } from '../utils/mcPing.js';
import db from '../config/database.js';

// Cache dla statusu serwerów (odswiezany co 30 sekund)
const serverStatusCaches = {};
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

    // Pobierz listę serwerów
    const servers = Server.getForLauncher();

    res.json({
        success: true,
        data: {
            config,
            servers,
            mods, // Zachowujemy dla kompatybilności wstecznej
            files, // Nowa zunifikowana lista
            broadcasts,
            // Metadane dla launchera
            meta: {
                apiVersion: '1.1.0',
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
    const serverId = req.query.serverId ? parseInt(req.query.serverId) : null;
    const now = Date.now();

    // Określ IP i port serwera do pingowania
    let targetIp = config.serverIp;
    let targetPort = config.serverPort;
    let serverName = null;

    if (serverId) {
        const server = Server.getById(serverId);
        if (server && server.is_enabled) {
            targetIp = server.ip;
            targetPort = server.port;
            serverName = server.name;
        }
    }

    const cacheKey = `${targetIp}:${targetPort}`;

    // Sprawdz cache
    if (serverStatusCaches[cacheKey] && (now - serverStatusCaches[cacheKey].time) < CACHE_TTL) {
        return res.json({
            success: true,
            data: {
                ...serverStatusCaches[cacheKey].data,
                cached: true,
                serverId: serverId,
                serverName: serverName,
                maintenanceMode: config.maintenanceMode,
                maintenanceMessage: config.maintenanceMessage
            }
        });
    }

    // Ping serwera MC
    let serverData = {
        ip: targetIp,
        port: targetPort,
        online: false,
        players: { online: 0, max: 0, sample: [] },
        version: null,
        latency: null,
        description: null
    };

    try {
        if (targetIp && !config.maintenanceMode) {
            const pingResult = await pingMinecraftServer(
                targetIp,
                targetPort || 25565,
                5000
            );

            if (pingResult.online) {
                serverData = {
                    ip: targetIp,
                    port: targetPort,
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
    serverStatusCaches[cacheKey] = { data: serverData, time: now };

    res.json({
        success: true,
        data: {
            ...serverData,
            cached: false,
            serverId: serverId,
            serverName: serverName,
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

// ============================================
// REGULAMIN SERWERA
// ============================================

/**
 * GET /api/launcher/rules
 * Pobiera aktywny regulamin serwera
 */
router.get('/rules', asyncHandler(async (req, res) => {
    const rules = ServerRules.getActive();

    if (!rules) {
        return res.json({
            success: true,
            data: null,
            message: 'Brak aktywnego regulaminu'
        });
    }

    res.json({
        success: true,
        data: {
            id: rules.id,
            version: rules.version,
            title: rules.title,
            content: rules.content,
            requiresAcceptance: !!rules.requires_acceptance,
            activatedAt: rules.activated_at
        }
    });
}));

/**
 * GET /api/launcher/rules/check
 * Sprawdza czy użytkownik zaakceptował aktywny regulamin
 */
router.get('/rules/check',
    authenticateUser,
    asyncHandler(async (req, res) => {
        const result = ServerRules.hasUserAccepted(req.userId);

        res.json({
            success: true,
            data: {
                accepted: result.accepted,
                rules: result.rules ? {
                    id: result.rules.id,
                    version: result.rules.version,
                    title: result.rules.title,
                    content: result.rules.content,
                    requiresAcceptance: !!result.rules.requires_acceptance
                } : null,
                acceptedAt: result.acceptance?.accepted_at || null
            }
        });
    })
);

/**
 * POST /api/launcher/rules/accept
 * Akceptuje aktywny regulamin
 */
router.post('/rules/accept',
    authenticateUser,
    asyncHandler(async (req, res) => {
        const activeRules = ServerRules.getActive();

        if (!activeRules) {
            return res.status(400).json({
                success: false,
                error: 'Brak aktywnego regulaminu do zaakceptowania'
            });
        }

        const clientIp = getClientIp(req);
        const acceptance = ServerRules.acceptByUser(req.userId, activeRules.id, clientIp);

        // Loguj akceptację
        ActivityLog.log({
            action: 'rules_accepted',
            category: 'user',
            userId: req.userId,
            details: `Zaakceptowano regulamin v${activeRules.version}`,
            ipAddress: clientIp
        });

        res.json({
            success: true,
            message: 'Regulamin został zaakceptowany',
            data: acceptance
        });
    })
);

// ============================================
// AKTUALNOŚCI (NEWS)
// ============================================

/**
 * GET /api/launcher/news
 * Pobiera opublikowane wiadomości
 */
router.get('/news', asyncHandler(async (req, res) => {
    const options = {
        limit: Math.min(parseInt(req.query.limit) || 10, 50),
        offset: parseInt(req.query.offset) || 0,
        type: req.query.type || null,
        tag: req.query.tag || null
    };

    const news = News.getPublished(options);

    res.json({
        success: true,
        data: news
    });
}));

/**
 * GET /api/launcher/news/types
 * Pobiera dostępne typy wiadomości
 */
router.get('/news/types', asyncHandler(async (req, res) => {
    res.json({
        success: true,
        data: News.getTypes()
    });
}));

/**
 * GET /api/launcher/news/tags
 * Pobiera popularne tagi
 */
router.get('/news/tags', asyncHandler(async (req, res) => {
    const tags = News.getAllTags();

    res.json({
        success: true,
        data: tags
    });
}));

/**
 * GET /api/launcher/news/:id
 * Pobiera szczegóły wiadomości
 */
router.get('/news/:id', asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    const news = News.getById(id);

    if (!news || !news.is_published) {
        return res.status(404).json({
            success: false,
            error: 'Wiadomość nie znaleziona'
        });
    }

    // Zwiększ licznik wyświetleń
    News.incrementViews(id);

    res.json({
        success: true,
        data: news
    });
}));

// ============================================
// ELECTRON-UPDATER: Auto-update endpoints
// Serwuje latest.yml i pliki instalatora
// electron-updater (generic provider) wymaga:
//   GET /latest.yml -> metadane aktualizacji
//   GET /<filename> -> plik instalatora
// ============================================

/**
 * GET /api/launcher/releases/latest.yml
 * Dynamicznie generuje latest.yml z najnowszej wersji w bazie
 * Format kompatybilny z electron-updater generic provider
 */
router.get('/releases/latest.yml', asyncHandler(async (req, res) => {
    const latest = LauncherVersion.getLatest();

    if (!latest) {
        return res.status(404).send('No versions available');
    }

    // electron-updater wymaga sha512 w base64
    // Jeśli nie mamy sha512, użyj sha256 jako fallback (będzie pominięty)
    const sha512 = latest.sha512 || '';
    const fileSize = latest.file_size || 0;

    // Nazwa pliku - jeśli mamy filename z uploadu, użyj go
    // W innym przypadku skonstruuj z wersji
    const filename = latest.filename || `XsusLauncher-${latest.version}-x64.exe`;

    const releaseDate = latest.created_at || new Date().toISOString();

    // Generuj YAML w formacie electron-updater
    const yaml = [
        `version: ${latest.version}`,
        `files:`,
        `  - url: ${filename}`,
        sha512 ? `    sha512: ${sha512}` : null,
        fileSize ? `    size: ${fileSize}` : null,
        `path: ${filename}`,
        sha512 ? `sha512: ${sha512}` : null,
        `releaseDate: '${releaseDate}'`,
    ].filter(Boolean).join('\n') + '\n';

    res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(yaml);
}));

/**
 * GET /api/launcher/releases/:filename
 * Serwuje pliki instalatora dla electron-updater
 * Przekierowuje do właściwego endpointu download
 */
router.get('/releases/:filename', asyncHandler(async (req, res) => {
    const { filename } = req.params;

    // Zabezpieczenie przed path traversal
    const safeName = path.basename(filename);
    if (safeName !== filename || filename.includes('..')) {
        return res.status(400).json({ success: false, error: 'Nieprawidłowa nazwa pliku' });
    }

    const filePath = path.join(getUploadsPath(), 'launcher', safeName);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({
            success: false,
            error: 'Plik nie istnieje'
        });
    }

    const stat = fs.statSync(filePath);

    // Obsługa Range requests (wznowienie pobierania)
    const range = req.headers.range;
    if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;

        res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${stat.size}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': end - start + 1,
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${safeName}"`
        });

        fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Length', stat.size);
        res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
        res.setHeader('Accept-Ranges', 'bytes');

        fs.createReadStream(filePath).pipe(res);
    }
}));

export default router;
