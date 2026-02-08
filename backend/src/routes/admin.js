/**
 * Trasy panelu administracyjnego
 * Wymaga autoryzacji administratora
 */
import { Router } from 'express';
import { body, param, validationResult } from 'express-validator';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import {
    User, Admin, GameConfig, Mod, Broadcast, ActivityLog, LauncherVersion, PlayerStats, ScheduledMaintenance, Session, Ban, ServerRules, News, Server
} from '../models/index.js';
import { authenticateAdmin, generateAdminToken, adminLimiter, authLimiter, rateLimitAdmin } from '../middleware/index.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
    calculateSHA256, sanitizeFilename, isAllowedModFile,
    getModsPath, ensureDir, getClientIp, formatFileSize, verifyFileSHA256
} from '../utils/helpers.js';
import {
    createBackup, listBackups, restoreBackup, deleteBackup, getBackupStats
} from '../utils/backup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// Konfiguracja multer dla uploadu plików
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const modsPath = getModsPath();
        ensureDir(modsPath);
        cb(null, modsPath);
    },
    filename: (req, file, cb) => {
        const safeName = sanitizeFilename(file.originalname);
        cb(null, safeName);
    }
});

const upload = multer({
    storage,
    limits: {
        fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB) || 100) * 1024 * 1024 // Domyślnie 100MB
    },
    fileFilter: (req, file, cb) => {
        if (isAllowedModFile(file.originalname)) {
            cb(null, true);
        } else {
            cb(new Error('Dozwolone są tylko pliki .jar i .zip'), false);
        }
    }
});

// ============================================
// AUTORYZACJA ADMINA
// ============================================

/**
 * POST /api/admin/login
 * Logowanie administratora
 */
router.post('/login',
    authLimiter,
    [
        body('username').trim().notEmpty().withMessage('Nazwa użytkownika jest wymagana'),
        body('password').notEmpty().withMessage('Hasło jest wymagane')
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Błąd walidacji',
                details: errors.array()
            });
        }

        const { username, password } = req.body;
        const admin = Admin.verifyPassword(username, password);

        if (!admin) {
            return res.status(401).json({
                success: false,
                error: 'Nieprawidłowe dane logowania'
            });
        }

        // Logujemy akcję
        ActivityLog.logAdminAction('login', { admin: username }, getClientIp(req));

        const token = generateAdminToken(admin);

        res.json({
            success: true,
            data: {
                admin: {
                    id: admin.id,
                    username: admin.username
                },
                token
            }
        });
    })
);

// Wszystkie poniższe trasy wymagają autoryzacji admina
router.use(adminLimiter);
router.use(authenticateAdmin);

// ============================================
// INFORMACJE O ADMINIE
// ============================================

/**
 * GET /api/admin/me
 * Pobiera dane aktualnie zalogowanego administratora
 */
router.get('/me', asyncHandler(async (req, res) => {
    res.json({
        success: true,
        data: {
            id: req.admin.id,
            username: req.admin.username
        }
    });
}));

// ============================================
// DASHBOARD / STATYSTYKI
// ============================================

/**
 * GET /api/admin/dashboard
 * Pobiera statystyki dla dashboardu
 */
router.get('/dashboard', asyncHandler(async (req, res) => {
    const usersCount = User.count();
    const modsStats = Mod.getStats();
    const gameConfig = GameConfig.get();
    const recentActivity = ActivityLog.getAll(10, 0);
    const activeBroadcasts = Broadcast.getActive().length;

    res.json({
        success: true,
        data: {
            users: {
                total: usersCount
            },
            mods: modsStats,
            game: {
                version: gameConfig.game_version,
                loaderType: gameConfig.loader_type,
                maintenanceMode: !!gameConfig.maintenance_mode
            },
            broadcasts: {
                active: activeBroadcasts
            },
            recentActivity
        }
    });
}));

// ============================================
// ZARZĄDZANIE UŻYTKOWNIKAMI
// ============================================

/**
 * GET /api/admin/users
 * Lista użytkowników
 */
router.get('/users', asyncHandler(async (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const users = User.getAll(limit, offset);
    const total = User.count();

    res.json({
        success: true,
        data: {
            users,
            pagination: {
                total,
                limit,
                offset,
                hasMore: offset + limit < total
            }
        }
    });
}));

/**
 * GET /api/admin/users/:id
 * Szczegóły użytkownika
 */
router.get('/users/:id', asyncHandler(async (req, res) => {
    const user = User.findById(parseInt(req.params.id));

    if (!user) {
        return res.status(404).json({
            success: false,
            error: 'Użytkownik nie istnieje'
        });
    }

    const activity = ActivityLog.getByUser(user.id, 20);

    res.json({
        success: true,
        data: {
            user,
            activity
        }
    });
}));

/**
 * POST /api/admin/users/:id/ban
 * Banuje użytkownika
 */
router.post('/users/:id/ban',
    [body('reason').optional().isString()],
    asyncHandler(async (req, res) => {
        const userId = parseInt(req.params.id);
        const { reason } = req.body;

        const user = User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'Użytkownik nie istnieje'
            });
        }

        User.ban(userId, reason || '');

        ActivityLog.logAdminAction('user_ban', {
            userId,
            username: user.username,
            reason
        }, getClientIp(req));

        res.json({
            success: true,
            message: `Użytkownik ${user.username} został zbanowany`
        });
    })
);

/**
 * POST /api/admin/users/:id/unban
 * Odbanowuje użytkownika
 */
router.post('/users/:id/unban', asyncHandler(async (req, res) => {
    const userId = parseInt(req.params.id);

    const user = User.findById(userId);
    if (!user) {
        return res.status(404).json({
            success: false,
            error: 'Użytkownik nie istnieje'
        });
    }

    User.unban(userId);

    ActivityLog.logAdminAction('user_unban', {
        userId,
        username: user.username
    }, getClientIp(req));

    res.json({
        success: true,
        message: `Użytkownik ${user.username} został odbanowany`
    });
}));

/**
 * DELETE /api/admin/users/:id
 * Usuwa użytkownika
 */
router.delete('/users/:id', asyncHandler(async (req, res) => {
    const userId = parseInt(req.params.id);

    const user = User.findById(userId);
    if (!user) {
        return res.status(404).json({
            success: false,
            error: 'Użytkownik nie istnieje'
        });
    }

    User.delete(userId);

    ActivityLog.logAdminAction('user_delete', {
        userId,
        username: user.username
    }, getClientIp(req));

    res.json({
        success: true,
        message: 'Użytkownik został usunięty'
    });
}));

// ============================================
// KONFIGURACJA GRY
// ============================================

/**
 * GET /api/admin/config
 * Pobiera konfigurację gry
 */
router.get('/config', asyncHandler(async (req, res) => {
    const config = GameConfig.get();

    res.json({
        success: true,
        data: config
    });
}));

/**
 * PUT /api/admin/config
 * Aktualizuje konfigurację gry
 */
router.put('/config',
    [
        body('game_version').optional().matches(/^\d+\.\d+(\.\d+)?$/),
        body('loader_type').optional().isIn(['vanilla', 'forge', 'fabric']),
        body('server_ip').optional().isString(),
        body('server_port').optional().isInt({ min: 1, max: 65535 }),
        body('java_args').optional().isString()
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Błąd walidacji',
                details: errors.array()
            });
        }

        const config = GameConfig.update(req.body);

        ActivityLog.logAdminAction('config_update', req.body, getClientIp(req));

        res.json({
            success: true,
            message: 'Konfiguracja została zaktualizowana',
            data: config
        });
    })
);

/**
 * POST /api/admin/config/maintenance
 * Włącza/wyłącza tryb konserwacji
 */
router.post('/config/maintenance',
    [
        body('enabled').isBoolean(),
        body('message').optional().isString()
    ],
    asyncHandler(async (req, res) => {
        const { enabled, message } = req.body;

        GameConfig.setMaintenanceMode(enabled, message);

        ActivityLog.logAdminAction('maintenance_mode', { enabled, message }, getClientIp(req));

        res.json({
            success: true,
            message: enabled ? 'Tryb konserwacji włączony' : 'Tryb konserwacji wyłączony'
        });
    })
);

// ============================================
// ZARZĄDZANIE MODAMI
// ============================================

/**
 * GET /api/admin/mods
 * Lista wszystkich modów
 */
router.get('/mods', asyncHandler(async (req, res) => {
    const mods = Mod.getAll();

    res.json({
        success: true,
        data: mods.map(mod => ({
            ...mod,
            fileSizeFormatted: formatFileSize(mod.file_size)
        }))
    });
}));

/**
 * POST /api/admin/mods
 * Dodaje nowy mod (przez upload pliku)
 */
router.post('/mods',
    upload.single('file'),
    asyncHandler(async (req, res) => {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'Nie przesłano pliku'
            });
        }

        const { name, description, is_required, mod_type } = req.body;
        const filePath = req.file.path;
        const filename = req.file.filename;

        // Obliczamy sumę kontrolną
        const sha256 = await calculateSHA256(filePath);

        // Sprawdzamy czy mod już istnieje
        const existingMod = Mod.findByFilename(filename);
        if (existingMod) {
            // Usuwamy przesłany plik
            fs.unlinkSync(filePath);
            return res.status(409).json({
                success: false,
                error: 'Mod o tej nazwie już istnieje'
            });
        }

        // Tworzymy wpis w bazie
        const mod = Mod.create({
            name: name || filename.replace(/\.[^.]+$/, ''),
            filename,
            url: `/api/download/mods/${filename}`,
            sha256,
            file_size: req.file.size,
            is_required: is_required === 'true' || is_required === true,
            mod_type: mod_type || 'mod',
            description
        });

        ActivityLog.logAdminAction('mod_upload', {
            modId: mod.id,
            filename
        }, getClientIp(req));

        res.status(201).json({
            success: true,
            message: 'Mod został dodany',
            data: mod
        });
    })
);

/**
 * POST /api/admin/mods/url
 * Dodaje mod przez URL (zewnętrzny link)
 */
router.post('/mods/url',
    [
        body('name').trim().notEmpty().withMessage('Nazwa jest wymagana'),
        body('filename').trim().notEmpty().withMessage('Nazwa pliku jest wymagana'),
        body('url').isURL().withMessage('Nieprawidłowy URL'),
        body('sha256').isLength({ min: 64, max: 64 }).withMessage('Nieprawidłowa suma SHA256')
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Błąd walidacji',
                details: errors.array()
            });
        }

        const { name, filename, url, sha256, file_size, is_required, mod_type, description } = req.body;

        // Sprawdzamy czy mod już istnieje
        if (Mod.findByFilename(filename)) {
            return res.status(409).json({
                success: false,
                error: 'Mod o tej nazwie już istnieje'
            });
        }

        const mod = Mod.create({
            name,
            filename,
            url,
            sha256,
            file_size: file_size || 0,
            is_required: is_required !== false,
            mod_type: mod_type || 'mod',
            description
        });

        ActivityLog.logAdminAction('mod_add_url', {
            modId: mod.id,
            filename,
            url
        }, getClientIp(req));

        res.status(201).json({
            success: true,
            message: 'Mod został dodany',
            data: mod
        });
    })
);

/**
 * PUT /api/admin/mods/:id
 * Aktualizuje mod
 */
router.put('/mods/:id', asyncHandler(async (req, res) => {
    const modId = parseInt(req.params.id);
    const mod = Mod.findById(modId);

    if (!mod) {
        return res.status(404).json({
            success: false,
            error: 'Mod nie istnieje'
        });
    }

    const updated = Mod.update(modId, req.body);

    ActivityLog.logAdminAction('mod_update', {
        modId,
        changes: req.body
    }, getClientIp(req));

    res.json({
        success: true,
        message: 'Mod został zaktualizowany',
        data: updated
    });
}));

/**
 * POST /api/admin/mods/:id/toggle
 * Włącza/wyłącza mod
 */
router.post('/mods/:id/toggle', asyncHandler(async (req, res) => {
    const modId = parseInt(req.params.id);
    const mod = Mod.findById(modId);

    if (!mod) {
        return res.status(404).json({
            success: false,
            error: 'Mod nie istnieje'
        });
    }

    const newState = !mod.is_enabled;
    Mod.setEnabled(modId, newState);

    ActivityLog.logAdminAction('mod_toggle', {
        modId,
        enabled: newState
    }, getClientIp(req));

    res.json({
        success: true,
        message: newState ? 'Mod został włączony' : 'Mod został wyłączony',
        data: { enabled: newState }
    });
}));

/**
 * DELETE /api/admin/mods/:id
 * Usuwa mod
 */
router.delete('/mods/:id', asyncHandler(async (req, res) => {
    const modId = parseInt(req.params.id);
    const mod = Mod.findById(modId);

    if (!mod) {
        return res.status(404).json({
            success: false,
            error: 'Mod nie istnieje'
        });
    }

    // Usuwamy plik jeśli jest lokalny
    if (mod.url && mod.url.startsWith('/api/download/mods/')) {
        const filePath = path.join(getModsPath(), mod.filename);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }

    Mod.delete(modId);

    ActivityLog.logAdminAction('mod_delete', {
        modId,
        filename: mod.filename
    }, getClientIp(req));

    res.json({
        success: true,
        message: 'Mod został usunięty'
    });
}));

// ============================================
// POWIADOMIENIA (BROADCAST)
// ============================================

/**
 * GET /api/admin/broadcasts
 * Lista wszystkich powiadomień
 */
router.get('/broadcasts', asyncHandler(async (req, res) => {
    const broadcasts = Broadcast.getAll();

    res.json({
        success: true,
        data: broadcasts
    });
}));

/**
 * POST /api/admin/broadcasts
 * Tworzy nowe powiadomienie
 */
router.post('/broadcasts',
    [
        body('title').trim().notEmpty().withMessage('Tytuł jest wymagany'),
        body('message').trim().notEmpty().withMessage('Treść jest wymagana'),
        body('type').optional().isIn(['info', 'warning', 'error', 'success']),
        body('expires_at').optional().isISO8601()
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Błąd walidacji',
                details: errors.array()
            });
        }

        const broadcast = Broadcast.create(req.body);

        ActivityLog.logAdminAction('broadcast_create', {
            broadcastId: broadcast.id,
            title: broadcast.title
        }, getClientIp(req));

        res.status(201).json({
            success: true,
            message: 'Powiadomienie zostało utworzone',
            data: broadcast
        });
    })
);

/**
 * PUT /api/admin/broadcasts/:id
 * Aktualizuje powiadomienie
 */
router.put('/broadcasts/:id', asyncHandler(async (req, res) => {
    const broadcastId = parseInt(req.params.id);
    const broadcast = Broadcast.findById(broadcastId);

    if (!broadcast) {
        return res.status(404).json({
            success: false,
            error: 'Powiadomienie nie istnieje'
        });
    }

    const updated = Broadcast.update(broadcastId, req.body);

    res.json({
        success: true,
        message: 'Powiadomienie zostało zaktualizowane',
        data: updated
    });
}));

/**
 * POST /api/admin/broadcasts/:id/toggle
 * Włącza/wyłącza powiadomienie
 */
router.post('/broadcasts/:id/toggle', asyncHandler(async (req, res) => {
    const broadcastId = parseInt(req.params.id);
    const broadcast = Broadcast.findById(broadcastId);

    if (!broadcast) {
        return res.status(404).json({
            success: false,
            error: 'Powiadomienie nie istnieje'
        });
    }

    const newState = !broadcast.is_active;
    Broadcast.setActive(broadcastId, newState);

    res.json({
        success: true,
        message: newState ? 'Powiadomienie aktywowane' : 'Powiadomienie dezaktywowane',
        data: { active: newState }
    });
}));

/**
 * DELETE /api/admin/broadcasts/:id
 * Usuwa powiadomienie
 */
router.delete('/broadcasts/:id', asyncHandler(async (req, res) => {
    const broadcastId = parseInt(req.params.id);

    if (!Broadcast.findById(broadcastId)) {
        return res.status(404).json({
            success: false,
            error: 'Powiadomienie nie istnieje'
        });
    }

    Broadcast.delete(broadcastId);

    res.json({
        success: true,
        message: 'Powiadomienie zostało usunięte'
    });
}));

// ============================================
// WERSJE LAUNCHERA
// ============================================

/**
 * GET /api/admin/launcher-versions
 * Lista wersji launchera
 */
router.get('/launcher-versions', asyncHandler(async (req, res) => {
    const versions = LauncherVersion.getAll();

    res.json({
        success: true,
        data: versions
    });
}));

/**
 * POST /api/admin/launcher-versions
 * Dodaje nową wersję launchera
 */
router.post('/launcher-versions',
    [
        body('version').matches(/^\d+\.\d+\.\d+$/).withMessage('Nieprawidłowy format wersji'),
        body('download_url').isURL().withMessage('Nieprawidłowy URL'),
        body('sha256').isLength({ min: 64, max: 64 }).withMessage('Nieprawidłowa suma SHA256')
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Błąd walidacji',
                details: errors.array()
            });
        }

        const version = LauncherVersion.create(req.body);

        ActivityLog.logAdminAction('launcher_version_add', {
            version: version.version
        }, getClientIp(req));

        res.status(201).json({
            success: true,
            message: 'Wersja launchera została dodana',
            data: version
        });
    })
);

/**
 * DELETE /api/admin/launcher-versions/:id
 * Usuwa wersję launchera
 */
router.delete('/launcher-versions/:id', asyncHandler(async (req, res) => {
    const versionId = parseInt(req.params.id);

    if (!LauncherVersion.findById(versionId)) {
        return res.status(404).json({
            success: false,
            error: 'Wersja nie istnieje'
        });
    }

    LauncherVersion.delete(versionId);

    res.json({
        success: true,
        message: 'Wersja została usunięta'
    });
}));

// ============================================
// LOGI AKTYWNOŚCI (ROZSZERZONE)
// ============================================

/**
 * GET /api/admin/logs
 * Lista logów aktywności z zaawansowanym filtrowaniem
 */
router.get('/logs', asyncHandler(async (req, res) => {
    const options = {
        limit: parseInt(req.query.limit) || 100,
        offset: parseInt(req.query.offset) || 0,
        action: req.query.action || null,
        category: req.query.category || null,
        severity: req.query.severity || null,
        userId: req.query.userId ? parseInt(req.query.userId) : null,
        adminId: req.query.adminId ? parseInt(req.query.adminId) : null,
        resourceType: req.query.resourceType || null,
        resourceId: req.query.resourceId || null,
        ipAddress: req.query.ipAddress || null,
        startDate: req.query.startDate || null,
        endDate: req.query.endDate || null,
        search: req.query.search || null
    };

    const result = ActivityLog.getAll(options);

    res.json({
        success: true,
        data: result.logs,
        pagination: {
            total: result.total,
            page: result.page,
            pages: result.pages,
            limit: result.limit
        }
    });
}));

/**
 * GET /api/admin/logs/categories
 * Lista dostępnych kategorii i severity levels
 */
router.get('/logs/categories', asyncHandler(async (req, res) => {
    res.json({
        success: true,
        data: {
            categories: ActivityLog.Categories,
            severityLevels: ActivityLog.Severity,
            resourceTypes: ActivityLog.ResourceTypes
        }
    });
}));

/**
 * GET /api/admin/logs/stats
 * Rozszerzone statystyki logów
 */
router.get('/logs/stats', asyncHandler(async (req, res) => {
    const days = parseInt(req.query.days) || 7;
    const stats = ActivityLog.getExtendedStats(days);

    res.json({
        success: true,
        data: stats
    });
}));

/**
 * GET /api/admin/logs/security
 * Logi security (warning+ severity)
 */
router.get('/logs/security', asyncHandler(async (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    const logs = ActivityLog.getSecurityLogs(limit);

    res.json({
        success: true,
        data: logs
    });
}));

/**
 * GET /api/admin/logs/suspicious
 * Podejrzane logowania (wiele nieudanych prób z tego samego IP)
 */
router.get('/logs/suspicious', asyncHandler(async (req, res) => {
    const threshold = parseInt(req.query.threshold) || 5;
    const hoursBack = parseInt(req.query.hours) || 24;
    const suspicious = ActivityLog.getSuspiciousLogins(threshold, hoursBack);

    res.json({
        success: true,
        data: suspicious
    });
}));

/**
 * GET /api/admin/logs/by-user/:userId
 * Logi konkretnego użytkownika
 */
router.get('/logs/by-user/:userId', asyncHandler(async (req, res) => {
    const userId = parseInt(req.params.userId);
    const limit = parseInt(req.query.limit) || 50;
    const logs = ActivityLog.getByUser(userId, limit);

    res.json({
        success: true,
        data: logs
    });
}));

/**
 * GET /api/admin/logs/by-resource/:resourceType/:resourceId
 * Logi dla konkretnego zasobu
 */
router.get('/logs/by-resource/:resourceType/:resourceId', asyncHandler(async (req, res) => {
    const { resourceType, resourceId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const logs = ActivityLog.getByResource(resourceType, resourceId, limit);

    res.json({
        success: true,
        data: logs
    });
}));

/**
 * GET /api/admin/logs/export
 * Eksport logów do CSV
 */
router.get('/logs/export', asyncHandler(async (req, res) => {
    const options = {
        action: req.query.action || null,
        category: req.query.category || null,
        severity: req.query.severity || null,
        startDate: req.query.startDate || null,
        endDate: req.query.endDate || null
    };

    const csv = ActivityLog.exportToCsv(options);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=logs_${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csv);
}));

/**
 * GET /api/admin/logs/summary
 * Podsumowanie logów dla okresu
 */
router.get('/logs/summary', asyncHandler(async (req, res) => {
    const startDate = req.query.startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = req.query.endDate || new Date().toISOString();

    const summary = ActivityLog.getSummary(startDate, endDate);

    res.json({
        success: true,
        data: summary
    });
}));

/**
 * DELETE /api/admin/logs/cleanup
 * Czyści stare logi
 */
router.delete('/logs/cleanup', asyncHandler(async (req, res) => {
    const days = parseInt(req.query.days) || 30;
    const deleted = ActivityLog.deleteOlderThan(days);

    ActivityLog.logAdminAction('logs_cleanup', { days, deleted }, getClientIp(req));

    res.json({
        success: true,
        message: `Usunięto ${deleted} logów starszych niż ${days} dni`
    });
}));

/**
 * GET /api/admin/logs/:id
 * Szczegóły pojedynczego logu
 */
router.get('/logs/:id', asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    const log = ActivityLog.findById(id);

    if (!log) {
        return res.status(404).json({
            success: false,
            error: 'Log nie znaleziony'
        });
    }

    res.json({
        success: true,
        data: log
    });
}));

/**
 * POST /api/admin/mods/sync
 * Synchronizuje listę modów z plikami na dysku
 */
router.post('/mods/sync', asyncHandler(async (req, res) => {
    const modsPath = getModsPath();
    ensureDir(modsPath);

    const filesOnDisk = fs.readdirSync(modsPath).filter(f =>
        f.endsWith('.jar') || f.endsWith('.zip')
    );

    const modsInDb = Mod.getAll();
    const dbFilenames = new Set(modsInDb.map(m => m.filename));
    const diskFilenames = new Set(filesOnDisk);

    const results = { added: 0, removed: 0 };

    // 1. Dodaj nowe pliki
    for (const filename of filesOnDisk) {
        if (!dbFilenames.has(filename)) {
            const filePath = path.join(modsPath, filename);
            const sha256 = await calculateSHA256(filePath);
            const stats = fs.statSync(filePath);

            Mod.create({
                name: filename.replace(/\.[^.]+$/, ''),
                filename,
                url: `/api/download/mods/${filename}`,
                sha256,
                file_size: stats.size,
                is_required: true,
                mod_type: 'mod',
                description: 'Zsynchornizowano automatycznie'
            });
            results.added++;
        }
    }

    // 2. Usuń nieistniejące pliki z bazy (tylko te lokalne)
    for (const mod of modsInDb) {
        if (mod.url && mod.url.startsWith('/api/download/mods/') && !diskFilenames.has(mod.filename)) {
            Mod.delete(mod.id);
            results.removed++;
        }
    }

    ActivityLog.logAdminAction('mods_sync', results, getClientIp(req));

    res.json({
        success: true,
        message: `Synchronizacja zakończona: Dodano ${results.added}, usunięto ${results.removed}`,
        data: results
    });
}));

/**
 * POST /api/admin/mods/verify
 * Weryfikuje integralność wszystkich modów na serwerze
 * Porównuje pliki z sumami SHA256 w bazie danych
 */
router.post('/mods/verify',
    authenticateAdmin,
    asyncHandler(async (req, res) => {
        const modsPath = getModsPath();
        const modsInDb = Mod.getAll();

        const results = {
            verified: [],      // Pliki z poprawnymi checksumami
            corrupted: [],     // Pliki z nieprawidłowymi checksumami
            missing: [],       // Pliki w bazie ale nie na dysku
            orphaned: [],      // Pliki na dysku ale nie w bazie
            errors: []         // Błędy weryfikacji
        };

        // Pobierz pliki na dysku
        let filesOnDisk = [];
        if (fs.existsSync(modsPath)) {
            filesOnDisk = fs.readdirSync(modsPath)
                .filter(f => isAllowedModFile(f));
        }
        const diskFilenames = new Set(filesOnDisk);

        // Weryfikuj każdy mod z bazy
        for (const mod of modsInDb) {
            const filePath = path.join(modsPath, mod.filename);

            // Tylko lokalne pliki (nie zewnętrzne URL)
            if (mod.url && !mod.url.startsWith('/api/download/mods/')) {
                // Pomiń zewnętrzne mody - nie możemy ich weryfikować
                continue;
            }

            const verification = await verifyFileSHA256(filePath, mod.sha256);

            if (verification.error === 'file_not_found') {
                results.missing.push({
                    id: mod.id,
                    filename: mod.filename,
                    expectedSha256: mod.sha256
                });
            } else if (!verification.valid) {
                results.corrupted.push({
                    id: mod.id,
                    filename: mod.filename,
                    expectedSha256: mod.sha256,
                    actualSha256: verification.actual
                });
            } else {
                results.verified.push({
                    id: mod.id,
                    filename: mod.filename,
                    sha256: mod.sha256
                });
            }

            // Usuń z listy dyskowej
            diskFilenames.delete(mod.filename);
        }

        // Pozostałe pliki na dysku to "orphaned" (nie w bazie)
        for (const filename of diskFilenames) {
            const filePath = path.join(modsPath, filename);
            try {
                const sha256 = await calculateSHA256(filePath);
                const stats = fs.statSync(filePath);
                results.orphaned.push({
                    filename,
                    sha256,
                    size: stats.size
                });
            } catch (error) {
                results.errors.push({
                    filename,
                    error: error.message
                });
            }
        }

        // Loguj akcję
        ActivityLog.logAdminAction('mods_verify', {
            verified: results.verified.length,
            corrupted: results.corrupted.length,
            missing: results.missing.length,
            orphaned: results.orphaned.length
        }, getClientIp(req));

        res.json({
            success: true,
            message: `Weryfikacja zakończona: ${results.verified.length} OK, ${results.corrupted.length} uszkodzonych, ${results.missing.length} brakujących`,
            data: results
        });
    })
);

/**
 * POST /api/admin/mods/:id/recalculate-sha256
 * Przelicza SHA256 dla konkretnego moda i aktualizuje w bazie
 */
router.post('/mods/:id/recalculate-sha256',
    authenticateAdmin,
    [
        param('id').isInt().withMessage('ID musi być liczbą całkowitą')
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Błąd walidacji',
                details: errors.array()
            });
        }

        const { id } = req.params;
        const mod = Mod.findById(parseInt(id));

        if (!mod) {
            return res.status(404).json({
                success: false,
                error: 'Mod nie znaleziony'
            });
        }

        const filePath = path.join(getModsPath(), mod.filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                error: 'Plik moda nie istnieje na serwerze'
            });
        }

        try {
            const newSha256 = await calculateSHA256(filePath);
            const stats = fs.statSync(filePath);

            // Aktualizuj w bazie
            Mod.update(parseInt(id), {
                sha256: newSha256,
                file_size: stats.size
            });

            ActivityLog.logAdminAction('mod_sha256_recalculate', {
                modId: id,
                filename: mod.filename,
                oldSha256: mod.sha256,
                newSha256
            }, getClientIp(req));

            res.json({
                success: true,
                message: 'SHA256 zaktualizowany',
                data: {
                    filename: mod.filename,
                    oldSha256: mod.sha256,
                    newSha256,
                    size: stats.size
                }
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: `Błąd przeliczania SHA256: ${error.message}`
            });
        }
    })
);

// ============================================
// STATYSTYKI GRACZY
// ============================================

/**
 * GET /api/admin/stats
 * Ogólne statystyki serwera
 */
router.get('/stats',
    authenticateAdmin,
    asyncHandler(async (req, res) => {
        const serverStats = PlayerStats.getServerStats();
        const activitySummary = PlayerStats.getActivitySummary();

        res.json({
            success: true,
            data: {
                ...serverStats,
                activity: activitySummary
            }
        });
    })
);

/**
 * GET /api/admin/stats/players/top
 * Top graczy według czasu gry
 */
router.get('/stats/players/top',
    authenticateAdmin,
    asyncHandler(async (req, res) => {
        const limit = Math.min(parseInt(req.query.limit) || 10, 100);
        const players = PlayerStats.getTopPlayersByPlaytime(limit);

        res.json({
            success: true,
            data: players
        });
    })
);

/**
 * GET /api/admin/stats/players/newest
 * Najnowsi gracze
 */
router.get('/stats/players/newest',
    authenticateAdmin,
    asyncHandler(async (req, res) => {
        const limit = Math.min(parseInt(req.query.limit) || 10, 100);
        const players = PlayerStats.getNewestPlayers(limit);

        res.json({
            success: true,
            data: players
        });
    })
);

/**
 * GET /api/admin/stats/players/active
 * Ostatnio aktywni gracze
 */
router.get('/stats/players/active',
    authenticateAdmin,
    asyncHandler(async (req, res) => {
        const limit = Math.min(parseInt(req.query.limit) || 10, 100);
        const players = PlayerStats.getRecentlyActivePlayers(limit);

        res.json({
            success: true,
            data: players
        });
    })
);

/**
 * GET /api/admin/stats/registrations
 * Statystyki rejestracji w czasie
 */
router.get('/stats/registrations',
    authenticateAdmin,
    asyncHandler(async (req, res) => {
        const days = Math.min(parseInt(req.query.days) || 30, 365);
        const stats = PlayerStats.getRegistrationStats(days);

        res.json({
            success: true,
            data: stats
        });
    })
);

/**
 * GET /api/admin/stats/activity
 * Statystyki aktywności w czasie
 */
router.get('/stats/activity',
    authenticateAdmin,
    asyncHandler(async (req, res) => {
        const days = Math.min(parseInt(req.query.days) || 30, 365);
        const stats = PlayerStats.getActivityStats(days);

        res.json({
            success: true,
            data: stats
        });
    })
);

/**
 * GET /api/admin/stats/playtime
 * Rozkład czasu gry
 */
router.get('/stats/playtime',
    authenticateAdmin,
    asyncHandler(async (req, res) => {
        const distribution = PlayerStats.getPlaytimeDistribution();

        res.json({
            success: true,
            data: distribution
        });
    })
);

/**
 * GET /api/admin/stats/players/:id
 * Szczegółowe statystyki gracza
 */
router.get('/stats/players/:id',
    authenticateAdmin,
    [
        param('id').isInt().withMessage('ID musi być liczbą całkowitą')
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Błąd walidacji',
                details: errors.array()
            });
        }

        const { id } = req.params;
        const player = PlayerStats.getPlayerDetails(parseInt(id));

        if (!player) {
            return res.status(404).json({
                success: false,
                error: 'Gracz nie znaleziony'
            });
        }

        res.json({
            success: true,
            data: player
        });
    })
);

/**
 * GET /api/admin/stats/players/search
 * Wyszukiwanie graczy
 */
router.get('/stats/players/search',
    authenticateAdmin,
    asyncHandler(async (req, res) => {
        const { q } = req.query;
        if (!q || q.length < 2) {
            return res.status(400).json({
                success: false,
                error: 'Query musi mieć minimum 2 znaki'
            });
        }

        const limit = Math.min(parseInt(req.query.limit) || 20, 100);
        const players = PlayerStats.searchPlayers(q, limit);

        res.json({
            success: true,
            data: players
        });
    })
);

// ============================================
// BACKUP BAZY DANYCH
// ============================================

/**
 * GET /api/admin/backups
 * Lista wszystkich backupów
 */
router.get('/backups',
    authenticateAdmin,
    asyncHandler(async (req, res) => {
        const backups = listBackups();
        const stats = getBackupStats();

        res.json({
            success: true,
            data: {
                backups,
                stats
            }
        });
    })
);

/**
 * POST /api/admin/backups
 * Tworzy nowy backup
 */
router.post('/backups',
    authenticateAdmin,
    [
        body('description').optional().trim().isLength({ max: 255 })
    ],
    asyncHandler(async (req, res) => {
        const { description } = req.body;

        const result = await createBackup({
            type: 'manual',
            description: description || 'Ręczny backup z panelu admina'
        });

        if (result.success) {
            ActivityLog.logAdminAction('backup_create', { filename: result.filename }, getClientIp(req));

            res.json({
                success: true,
                message: 'Backup utworzony pomyślnie',
                data: result
            });
        } else {
            res.status(500).json({
                success: false,
                error: result.error || 'Nie udało się utworzyć backupu'
            });
        }
    })
);

/**
 * POST /api/admin/backups/:filename/restore
 * Przywraca bazę danych z backupu
 */
router.post('/backups/:filename/restore',
    authenticateAdmin,
    [
        param('filename').trim().notEmpty().withMessage('Nazwa pliku jest wymagana')
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Błąd walidacji',
                details: errors.array()
            });
        }

        const { filename } = req.params;

        // Zabezpieczenie przed path traversal
        if (filename.includes('..') || filename.includes('/')) {
            return res.status(400).json({
                success: false,
                error: 'Nieprawidłowa nazwa pliku'
            });
        }

        const result = await restoreBackup(filename);

        if (result.success) {
            ActivityLog.logAdminAction('backup_restore', { filename }, getClientIp(req));

            res.json({
                success: true,
                message: result.message,
                data: {
                    preRestoreBackup: result.preRestoreBackup
                }
            });
        } else {
            res.status(400).json({
                success: false,
                error: result.error
            });
        }
    })
);

/**
 * DELETE /api/admin/backups/:filename
 * Usuwa backup
 */
router.delete('/backups/:filename',
    authenticateAdmin,
    [
        param('filename').trim().notEmpty().withMessage('Nazwa pliku jest wymagana')
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Błąd walidacji',
                details: errors.array()
            });
        }

        const { filename } = req.params;

        // Zabezpieczenie przed path traversal
        if (filename.includes('..') || filename.includes('/')) {
            return res.status(400).json({
                success: false,
                error: 'Nieprawidłowa nazwa pliku'
            });
        }

        const result = deleteBackup(filename);

        if (result.success) {
            ActivityLog.logAdminAction('backup_delete', { filename }, getClientIp(req));

            res.json({
                success: true,
                message: 'Backup usunięty'
            });
        } else {
            res.status(400).json({
                success: false,
                error: result.error
            });
        }
    })
);

/**
 * GET /api/admin/backups/stats
 * Statystyki backupów
 */
router.get('/backups/stats',
    authenticateAdmin,
    asyncHandler(async (req, res) => {
        const stats = getBackupStats();

        res.json({
            success: true,
            data: stats
        });
    })
);

// ============================================
// SCHEDULED MAINTENANCE
// ============================================

/**
 * GET /api/admin/maintenance/scheduled
 * Lista wszystkich zaplanowanych maintenance
 */
router.get('/maintenance/scheduled',
    authenticateAdmin,
    asyncHandler(async (req, res) => {
        const includeInactive = req.query.all === 'true';
        const maintenances = ScheduledMaintenance.getAll(includeInactive);

        res.json({
            success: true,
            data: maintenances
        });
    })
);

/**
 * GET /api/admin/maintenance/scheduled/upcoming
 * Nadchodzące maintenance (domyślnie 7 dni)
 */
router.get('/maintenance/scheduled/upcoming',
    authenticateAdmin,
    asyncHandler(async (req, res) => {
        const days = parseInt(req.query.days) || 7;
        const maintenances = ScheduledMaintenance.getUpcoming(days);

        res.json({
            success: true,
            data: maintenances
        });
    })
);

/**
 * GET /api/admin/maintenance/scheduled/current
 * Aktualnie trwające maintenance
 */
router.get('/maintenance/scheduled/current',
    authenticateAdmin,
    asyncHandler(async (req, res) => {
        const current = ScheduledMaintenance.getCurrentMaintenance();
        const next = ScheduledMaintenance.getNextMaintenance();

        res.json({
            success: true,
            data: {
                current,
                next
            }
        });
    })
);

/**
 * POST /api/admin/maintenance/scheduled
 * Tworzy nowe zaplanowane maintenance
 */
router.post('/maintenance/scheduled',
    authenticateAdmin,
    [
        body('title').trim().notEmpty().withMessage('Tytuł jest wymagany'),
        body('startTime').isISO8601().withMessage('Nieprawidłowy format daty rozpoczęcia'),
        body('endTime').isISO8601().withMessage('Nieprawidłowy format daty zakończenia')
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Błąd walidacji',
                details: errors.array()
            });
        }

        const { title, message, startTime, endTime, autoEnable, notifyBeforeMinutes } = req.body;

        // Walidacja dat
        const start = new Date(startTime);
        const end = new Date(endTime);

        if (end <= start) {
            return res.status(400).json({
                success: false,
                error: 'Data zakończenia musi być późniejsza niż data rozpoczęcia'
            });
        }

        const maintenance = ScheduledMaintenance.create({
            title,
            message,
            startTime,
            endTime,
            autoEnable: autoEnable !== false,
            notifyBeforeMinutes: notifyBeforeMinutes || 30,
            createdBy: req.admin.username
        });

        ActivityLog.logAdminAction('maintenance_schedule_create', {
            maintenanceId: maintenance.id,
            title,
            startTime,
            endTime
        }, getClientIp(req));

        res.json({
            success: true,
            message: 'Maintenance zaplanowany',
            data: maintenance
        });
    })
);

/**
 * PUT /api/admin/maintenance/scheduled/:id
 * Aktualizuje zaplanowane maintenance
 */
router.put('/maintenance/scheduled/:id',
    authenticateAdmin,
    [
        param('id').isInt().withMessage('ID musi być liczbą całkowitą')
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Błąd walidacji',
                details: errors.array()
            });
        }

        const { id } = req.params;
        const maintenance = ScheduledMaintenance.findById(parseInt(id));

        if (!maintenance) {
            return res.status(404).json({
                success: false,
                error: 'Maintenance nie znaleziony'
            });
        }

        const { title, message, startTime, endTime, autoEnable, notifyBeforeMinutes, isActive } = req.body;

        // Walidacja dat jeśli zmienione
        if (startTime && endTime) {
            const start = new Date(startTime);
            const end = new Date(endTime);
            if (end <= start) {
                return res.status(400).json({
                    success: false,
                    error: 'Data zakończenia musi być późniejsza niż data rozpoczęcia'
                });
            }
        }

        const updated = ScheduledMaintenance.update(parseInt(id), {
            title, message, startTime, endTime, autoEnable, notifyBeforeMinutes, isActive
        });

        ActivityLog.logAdminAction('maintenance_schedule_update', {
            maintenanceId: id
        }, getClientIp(req));

        res.json({
            success: true,
            message: 'Maintenance zaktualizowany',
            data: updated
        });
    })
);

/**
 * DELETE /api/admin/maintenance/scheduled/:id
 * Usuwa zaplanowane maintenance
 */
router.delete('/maintenance/scheduled/:id',
    authenticateAdmin,
    [
        param('id').isInt().withMessage('ID musi być liczbą całkowitą')
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Błąd walidacji',
                details: errors.array()
            });
        }

        const { id } = req.params;
        const result = ScheduledMaintenance.delete(parseInt(id));

        if (result) {
            ActivityLog.logAdminAction('maintenance_schedule_delete', { maintenanceId: id }, getClientIp(req));

            res.json({
                success: true,
                message: 'Maintenance usunięty'
            });
        } else {
            res.status(404).json({
                success: false,
                error: 'Maintenance nie znaleziony'
            });
        }
    })
);

/**
 * POST /api/admin/maintenance/scheduled/check
 * Ręcznie sprawdza i stosuje maintenance (dla testów)
 */
router.post('/maintenance/scheduled/check',
    authenticateAdmin,
    asyncHandler(async (req, res) => {
        const result = ScheduledMaintenance.checkAndApplyMaintenance();

        res.json({
            success: true,
            data: result
        });
    })
);

/**
 * GET /api/admin/maintenance/history
 * Historia maintenance
 */
router.get('/maintenance/history',
    authenticateAdmin,
    asyncHandler(async (req, res) => {
        const limit = parseInt(req.query.limit) || 10;
        const history = ScheduledMaintenance.getHistory(limit);

        res.json({
            success: true,
            data: history
        });
    })
);

// ============================================
// ZARZĄDZANIE SESJAMI
// ============================================

/**
 * GET /api/admin/sessions
 * Lista wszystkich sesji
 */
router.get('/sessions',
    authenticateAdmin,
    asyncHandler(async (req, res) => {
        const options = {
            limit: parseInt(req.query.limit) || 100,
            offset: parseInt(req.query.offset) || 0,
            userId: req.query.userId ? parseInt(req.query.userId) : null,
            userType: req.query.userType || null,
            activeOnly: req.query.activeOnly !== 'false',
            ipAddress: req.query.ipAddress || null
        };

        const result = Session.getAll(options);

        res.json({
            success: true,
            data: result.sessions,
            pagination: {
                total: result.total,
                page: result.page,
                pages: result.pages
            }
        });
    })
);

/**
 * GET /api/admin/sessions/stats
 * Statystyki sesji
 */
router.get('/sessions/stats',
    authenticateAdmin,
    asyncHandler(async (req, res) => {
        const stats = Session.getStats();

        res.json({
            success: true,
            data: stats
        });
    })
);

/**
 * GET /api/admin/sessions/by-user/:userId
 * Sesje konkretnego użytkownika
 */
router.get('/sessions/by-user/:userId',
    authenticateAdmin,
    asyncHandler(async (req, res) => {
        const userId = parseInt(req.params.userId);
        const userType = req.query.userType || 'user';
        const sessions = Session.getByUser(userId, userType);

        res.json({
            success: true,
            data: sessions
        });
    })
);

/**
 * GET /api/admin/sessions/:id
 * Szczegóły sesji
 */
router.get('/sessions/:id',
    authenticateAdmin,
    asyncHandler(async (req, res) => {
        const id = parseInt(req.params.id);
        const session = Session.findById(id);

        if (!session) {
            return res.status(404).json({
                success: false,
                error: 'Sesja nie znaleziona'
            });
        }

        res.json({
            success: true,
            data: session
        });
    })
);

/**
 * DELETE /api/admin/sessions/:id
 * Revokuje (wylogowuje) sesję
 */
router.delete('/sessions/:id',
    authenticateAdmin,
    asyncHandler(async (req, res) => {
        const id = parseInt(req.params.id);
        const reason = req.query.reason || 'admin_revoke';

        const session = Session.findById(id);
        if (!session) {
            return res.status(404).json({
                success: false,
                error: 'Sesja nie znaleziona'
            });
        }

        const revoked = Session.revoke(id, reason);

        if (revoked) {
            ActivityLog.logAdminAction('session_revoke', {
                sessionId: id,
                userId: session.user_id,
                reason
            }, getClientIp(req));
        }

        res.json({
            success: true,
            message: revoked ? 'Sesja została zrevokowana' : 'Nie udało się zrevokować sesji'
        });
    })
);

/**
 * DELETE /api/admin/sessions/by-user/:userId
 * Revokuje wszystkie sesje użytkownika
 */
router.delete('/sessions/by-user/:userId',
    authenticateAdmin,
    asyncHandler(async (req, res) => {
        const userId = parseInt(req.params.userId);
        const userType = req.query.userType || 'user';
        const reason = req.query.reason || 'admin_logout_all';

        const count = Session.revokeAllByUser(userId, userType, reason);

        ActivityLog.logAdminAction('sessions_revoke_all', {
            userId,
            userType,
            count,
            reason
        }, getClientIp(req));

        res.json({
            success: true,
            message: `Zrevokowano ${count} sesji użytkownika`
        });
    })
);

/**
 * DELETE /api/admin/sessions/by-ip/:ip
 * Revokuje wszystkie sesje z danego IP
 */
router.delete('/sessions/by-ip/:ip',
    authenticateAdmin,
    asyncHandler(async (req, res) => {
        const ip = req.params.ip;
        const reason = req.query.reason || 'ip_ban';

        const count = Session.revokeByIP(ip, reason);

        ActivityLog.logAdminAction('sessions_revoke_ip', {
            ip,
            count,
            reason
        }, getClientIp(req));

        res.json({
            success: true,
            message: `Zrevokowano ${count} sesji z IP ${ip}`
        });
    })
);

/**
 * POST /api/admin/sessions/cleanup
 * Czyści wygasłe sesje
 */
router.post('/sessions/cleanup',
    authenticateAdmin,
    asyncHandler(async (req, res) => {
        const deleted = Session.cleanupExpired();

        ActivityLog.logAdminAction('sessions_cleanup', { deleted }, getClientIp(req));

        res.json({
            success: true,
            message: `Usunięto ${deleted} wygasłych sesji`
        });
    })
);

// ============================================
// ROZSZERZONY SYSTEM BANÓW
// ============================================

/**
 * GET /api/admin/bans
 * Lista wszystkich banów
 */
router.get('/bans',
    authenticateAdmin,
    asyncHandler(async (req, res) => {
        const options = {
            limit: parseInt(req.query.limit) || 100,
            offset: parseInt(req.query.offset) || 0,
            activeOnly: req.query.activeOnly !== 'false',
            banType: req.query.banType || null,
            userId: req.query.userId ? parseInt(req.query.userId) : null,
            ipAddress: req.query.ipAddress || null
        };

        const result = Ban.getAll(options);

        res.json({
            success: true,
            data: result.bans,
            total: result.total
        });
    })
);

/**
 * GET /api/admin/bans/stats
 * Statystyki banów
 */
router.get('/bans/stats',
    authenticateAdmin,
    asyncHandler(async (req, res) => {
        const stats = Ban.getStats();

        res.json({
            success: true,
            data: stats
        });
    })
);

/**
 * GET /api/admin/bans/types
 * Dostępne typy banów
 */
router.get('/bans/types',
    authenticateAdmin,
    asyncHandler(async (req, res) => {
        res.json({
            success: true,
            data: {
                banTypes: Ban.BanTypes,
                appealStatus: Ban.AppealStatus
            }
        });
    })
);

/**
 * GET /api/admin/bans/check/:userId
 * Sprawdza status bana użytkownika
 */
router.get('/bans/check/:userId',
    authenticateAdmin,
    asyncHandler(async (req, res) => {
        const userId = parseInt(req.params.userId);
        const ipAddress = req.query.ipAddress || null;
        const result = Ban.checkBan(userId, ipAddress);

        res.json({
            success: true,
            data: result
        });
    })
);

/**
 * GET /api/admin/bans/user/:userId/history
 * Historia banów użytkownika
 */
router.get('/bans/user/:userId/history',
    authenticateAdmin,
    asyncHandler(async (req, res) => {
        const userId = parseInt(req.params.userId);
        const history = Ban.getUserBanHistory(userId);

        res.json({
            success: true,
            data: history
        });
    })
);

/**
 * GET /api/admin/bans/ip/:ip/history
 * Historia banów dla IP
 */
router.get('/bans/ip/:ip/history',
    authenticateAdmin,
    asyncHandler(async (req, res) => {
        const ip = req.params.ip;
        const history = Ban.getIPBanHistory(ip);

        res.json({
            success: true,
            data: history
        });
    })
);

/**
 * GET /api/admin/bans/:id
 * Szczegóły bana
 */
router.get('/bans/:id',
    authenticateAdmin,
    asyncHandler(async (req, res) => {
        const id = parseInt(req.params.id);
        const ban = Ban.findById(id);

        if (!ban) {
            return res.status(404).json({
                success: false,
                error: 'Ban nie znaleziony'
            });
        }

        res.json({
            success: true,
            data: ban
        });
    })
);

/**
 * POST /api/admin/bans/user
 * Banuje użytkownika
 */
router.post('/bans/user',
    authenticateAdmin,
    [
        body('userId').isInt().withMessage('userId musi być liczbą'),
        body('reason').notEmpty().withMessage('Powód jest wymagany')
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Błąd walidacji',
                details: errors.array()
            });
        }

        const { userId, reason, notes, expiresAt, isPermanent, alsoBanIP, ipAddress } = req.body;

        // Pobierz admina z tokenu (jeśli dostępne)
        const adminId = req.admin?.id || null;

        const ban = Ban.banUser(userId, reason, {
            notes,
            expiresAt,
            isPermanent: isPermanent !== false,
            bannedBy: adminId,
            alsobanIP: alsoBanIP,
            ipAddress
        });

        // Revokuj wszystkie sesje użytkownika
        Session.revokeAllByUser(userId, 'user', 'user_banned');

        ActivityLog.logBan(userId, null, adminId, getClientIp(req), reason);

        res.json({
            success: true,
            message: 'Użytkownik został zbanowany',
            data: ban
        });
    })
);

/**
 * POST /api/admin/bans/ip
 * Banuje IP
 */
router.post('/bans/ip',
    authenticateAdmin,
    [
        body('ipAddress').notEmpty().withMessage('ipAddress jest wymagane'),
        body('reason').notEmpty().withMessage('Powód jest wymagany')
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Błąd walidacji',
                details: errors.array()
            });
        }

        const { ipAddress, reason, notes, expiresAt, isPermanent } = req.body;
        const adminId = req.admin?.id || null;

        const ban = Ban.banIP(ipAddress, reason, {
            notes,
            expiresAt,
            isPermanent: isPermanent !== false,
            bannedBy: adminId
        });

        // Revokuj wszystkie sesje z tego IP
        Session.revokeByIP(ipAddress, 'ip_banned');

        ActivityLog.logAdminAction('ip_ban', { ipAddress, reason }, getClientIp(req), adminId);

        res.json({
            success: true,
            message: `IP ${ipAddress} zostało zbanowane`,
            data: ban
        });
    })
);

/**
 * POST /api/admin/bans/temporary
 * Tymczasowy ban użytkownika
 */
router.post('/bans/temporary',
    authenticateAdmin,
    [
        body('userId').isInt().withMessage('userId musi być liczbą'),
        body('reason').notEmpty().withMessage('Powód jest wymagany'),
        body('durationMinutes').isInt({ min: 1 }).withMessage('Czas trwania musi być liczbą dodatnią')
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Błąd walidacji',
                details: errors.array()
            });
        }

        const { userId, reason, durationMinutes, notes } = req.body;
        const adminId = req.admin?.id || null;

        const ban = Ban.temporaryBan(userId, reason, durationMinutes, {
            notes,
            bannedBy: adminId
        });

        Session.revokeAllByUser(userId, 'user', 'user_temp_banned');
        ActivityLog.logBan(userId, null, adminId, getClientIp(req), `${reason} (${durationMinutes} minut)`);

        res.json({
            success: true,
            message: `Użytkownik został tymczasowo zbanowany na ${durationMinutes} minut`,
            data: ban
        });
    })
);

/**
 * DELETE /api/admin/bans/:id
 * Usuwa (dezaktywuje) ban
 */
router.delete('/bans/:id',
    authenticateAdmin,
    asyncHandler(async (req, res) => {
        const id = parseInt(req.params.id);
        const reason = req.query.reason || '';
        const adminId = req.admin?.id || null;

        const ban = Ban.findById(id);
        if (!ban) {
            return res.status(404).json({
                success: false,
                error: 'Ban nie znaleziony'
            });
        }

        const unbanned = Ban.unban(id, adminId, reason);

        if (unbanned && ban.user_id) {
            ActivityLog.logUnban(ban.user_id, ban.banned_username, adminId, getClientIp(req));
        }

        res.json({
            success: true,
            message: unbanned ? 'Ban został usunięty' : 'Nie udało się usunąć bana'
        });
    })
);

/**
 * DELETE /api/admin/bans/user/:userId
 * Usuwa wszystkie bany użytkownika
 */
router.delete('/bans/user/:userId',
    authenticateAdmin,
    asyncHandler(async (req, res) => {
        const userId = parseInt(req.params.userId);
        const reason = req.query.reason || '';
        const adminId = req.admin?.id || null;

        const count = Ban.unbanUser(userId, adminId, reason);

        ActivityLog.logUnban(userId, null, adminId, getClientIp(req));

        res.json({
            success: true,
            message: `Usunięto ${count} banów użytkownika`
        });
    })
);

/**
 * DELETE /api/admin/bans/ip/:ip
 * Usuwa wszystkie bany IP
 */
router.delete('/bans/ip/:ip',
    authenticateAdmin,
    asyncHandler(async (req, res) => {
        const ip = req.params.ip;
        const reason = req.query.reason || '';
        const adminId = req.admin?.id || null;

        const count = Ban.unbanIP(ip, adminId, reason);

        ActivityLog.logAdminAction('ip_unban', { ip }, getClientIp(req), adminId);

        res.json({
            success: true,
            message: `Usunięto ${count} banów IP`
        });
    })
);

/**
 * POST /api/admin/bans/cleanup
 * Czyści wygasłe bany
 */
router.post('/bans/cleanup',
    authenticateAdmin,
    asyncHandler(async (req, res) => {
        const cleaned = Ban.cleanupExpired();

        ActivityLog.logAdminAction('bans_cleanup', { cleaned }, getClientIp(req));

        res.json({
            success: true,
            message: `Dezaktywowano ${cleaned} wygasłych banów`
        });
    })
);

// ============================================
// APELE
// ============================================

/**
 * GET /api/admin/bans/appeals
 * Lista apeli
 */
router.get('/bans/appeals',
    authenticateAdmin,
    asyncHandler(async (req, res) => {
        const options = {
            limit: parseInt(req.query.limit) || 50,
            offset: parseInt(req.query.offset) || 0,
            status: req.query.status || null
        };

        const result = Ban.getAppeals(options);

        res.json({
            success: true,
            data: result.appeals,
            total: result.total
        });
    })
);

/**
 * GET /api/admin/bans/appeals/:id
 * Szczegóły apelu
 */
router.get('/bans/appeals/:id',
    authenticateAdmin,
    asyncHandler(async (req, res) => {
        const id = parseInt(req.params.id);
        const appeal = Ban.findAppealById(id);

        if (!appeal) {
            return res.status(404).json({
                success: false,
                error: 'Apel nie znaleziony'
            });
        }

        res.json({
            success: true,
            data: appeal
        });
    })
);

/**
 * POST /api/admin/bans/appeals/:id/review
 * Rozpatruje apel
 */
router.post('/bans/appeals/:id/review',
    authenticateAdmin,
    [
        body('status').isIn(['approved', 'rejected']).withMessage('Status musi być approved lub rejected')
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Błąd walidacji',
                details: errors.array()
            });
        }

        const id = parseInt(req.params.id);
        const { status, notes } = req.body;
        const adminId = req.admin?.id || null;

        try {
            const appeal = Ban.reviewAppeal(id, adminId, status, notes || '');

            ActivityLog.logAdminAction('appeal_review', {
                appealId: id,
                status,
                notes
            }, getClientIp(req), adminId);

            res.json({
                success: true,
                message: status === 'approved' ? 'Apel zaakceptowany, ban usunięty' : 'Apel odrzucony',
                data: appeal
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                error: error.message
            });
        }
    })
);

// ============================================
// REGULAMIN SERWERA
// ============================================

/**
 * GET /api/admin/rules
 * Lista wszystkich wersji regulaminu
 */
router.get('/rules',
    authenticateAdmin,
    asyncHandler(async (req, res) => {
        const rules = ServerRules.getAll();

        res.json({
            success: true,
            data: rules
        });
    })
);

/**
 * GET /api/admin/rules/active
 * Pobiera aktywny regulamin
 */
router.get('/rules/active',
    authenticateAdmin,
    asyncHandler(async (req, res) => {
        const rules = ServerRules.getActive();

        res.json({
            success: true,
            data: rules || null
        });
    })
);

/**
 * GET /api/admin/rules/stats
 * Statystyki akceptacji regulaminu
 */
router.get('/rules/stats',
    authenticateAdmin,
    asyncHandler(async (req, res) => {
        const rulesId = req.query.rulesId ? parseInt(req.query.rulesId) : null;
        const stats = ServerRules.getAcceptanceStats(rulesId);

        res.json({
            success: true,
            data: stats
        });
    })
);

/**
 * GET /api/admin/rules/:id
 * Szczegóły regulaminu
 */
router.get('/rules/:id',
    authenticateAdmin,
    [
        param('id').isInt().withMessage('ID musi być liczbą')
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Błąd walidacji',
                details: errors.array()
            });
        }

        const id = parseInt(req.params.id);
        const rules = ServerRules.getById(id);

        if (!rules) {
            return res.status(404).json({
                success: false,
                error: 'Regulamin nie znaleziony'
            });
        }

        res.json({
            success: true,
            data: rules
        });
    })
);

/**
 * GET /api/admin/rules/:id/acceptances
 * Lista akceptacji dla danego regulaminu
 */
router.get('/rules/:id/acceptances',
    authenticateAdmin,
    [
        param('id').isInt().withMessage('ID musi być liczbą')
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Błąd walidacji',
                details: errors.array()
            });
        }

        const id = parseInt(req.params.id);
        const limit = parseInt(req.query.limit) || 100;
        const offset = parseInt(req.query.offset) || 0;

        const acceptances = ServerRules.getAcceptances(id, { limit, offset });

        res.json({
            success: true,
            data: acceptances
        });
    })
);

/**
 * POST /api/admin/rules
 * Tworzy nowy regulamin
 */
router.post('/rules',
    authenticateAdmin,
    [
        body('version').trim().notEmpty().withMessage('Wersja jest wymagana'),
        body('content').trim().notEmpty().withMessage('Treść regulaminu jest wymagana'),
        body('title').optional().trim(),
        body('requiresAcceptance').optional().isBoolean()
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Błąd walidacji',
                details: errors.array()
            });
        }

        const { version, title, content, requiresAcceptance } = req.body;

        const rules = ServerRules.create({
            version,
            title,
            content,
            requiresAcceptance: requiresAcceptance !== false,
            createdBy: req.admin.id
        });

        ActivityLog.logAdminAction('rules_create', {
            rulesId: rules.id,
            version
        }, getClientIp(req));

        res.status(201).json({
            success: true,
            message: 'Regulamin został utworzony',
            data: rules
        });
    })
);

/**
 * PUT /api/admin/rules/:id
 * Aktualizuje regulamin
 */
router.put('/rules/:id',
    authenticateAdmin,
    [
        param('id').isInt().withMessage('ID musi być liczbą')
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Błąd walidacji',
                details: errors.array()
            });
        }

        const id = parseInt(req.params.id);
        const rules = ServerRules.getById(id);

        if (!rules) {
            return res.status(404).json({
                success: false,
                error: 'Regulamin nie znaleziony'
            });
        }

        const { version, title, content, requiresAcceptance } = req.body;
        const updated = ServerRules.update(id, { version, title, content, requiresAcceptance });

        ActivityLog.logAdminAction('rules_update', {
            rulesId: id
        }, getClientIp(req));

        res.json({
            success: true,
            message: 'Regulamin został zaktualizowany',
            data: updated
        });
    })
);

/**
 * POST /api/admin/rules/:id/activate
 * Aktywuje regulamin
 */
router.post('/rules/:id/activate',
    authenticateAdmin,
    [
        param('id').isInt().withMessage('ID musi być liczbą')
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Błąd walidacji',
                details: errors.array()
            });
        }

        const id = parseInt(req.params.id);
        const rules = ServerRules.activate(id);

        if (!rules) {
            return res.status(404).json({
                success: false,
                error: 'Regulamin nie znaleziony'
            });
        }

        ActivityLog.logAdminAction('rules_activate', {
            rulesId: id,
            version: rules.version
        }, getClientIp(req));

        res.json({
            success: true,
            message: 'Regulamin został aktywowany',
            data: rules
        });
    })
);

/**
 * POST /api/admin/rules/:id/reset-acceptances
 * Resetuje akceptacje dla danego regulaminu
 */
router.post('/rules/:id/reset-acceptances',
    authenticateAdmin,
    [
        param('id').isInt().withMessage('ID musi być liczbą')
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Błąd walidacji',
                details: errors.array()
            });
        }

        const id = parseInt(req.params.id);
        const result = ServerRules.resetAcceptances(id);

        ActivityLog.logAdminAction('rules_reset_acceptances', {
            rulesId: id,
            deleted: result.deleted
        }, getClientIp(req));

        res.json({
            success: true,
            message: `Zresetowano ${result.deleted} akceptacji`,
            data: result
        });
    })
);

/**
 * DELETE /api/admin/rules/:id
 * Usuwa regulamin
 */
router.delete('/rules/:id',
    authenticateAdmin,
    [
        param('id').isInt().withMessage('ID musi być liczbą')
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Błąd walidacji',
                details: errors.array()
            });
        }

        const id = parseInt(req.params.id);

        try {
            const deleted = ServerRules.delete(id);

            if (!deleted) {
                return res.status(404).json({
                    success: false,
                    error: 'Regulamin nie znaleziony'
                });
            }

            ActivityLog.logAdminAction('rules_delete', {
                rulesId: id,
                version: deleted.version
            }, getClientIp(req));

            res.json({
                success: true,
                message: 'Regulamin został usunięty'
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                error: error.message
            });
        }
    })
);

/**
 * GET /api/admin/rules/user/:userId/history
 * Historia akceptacji regulaminów przez użytkownika
 */
router.get('/rules/user/:userId/history',
    authenticateAdmin,
    [
        param('userId').isInt().withMessage('userId musi być liczbą')
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Błąd walidacji',
                details: errors.array()
            });
        }

        const userId = parseInt(req.params.userId);
        const history = ServerRules.getUserAcceptanceHistory(userId);

        res.json({
            success: true,
            data: history
        });
    })
);

// ============================================
// AKTUALNOŚCI (NEWS)
// ============================================

/**
 * GET /api/admin/news
 * Lista wszystkich wiadomości
 */
router.get('/news',
    authenticateAdmin,
    asyncHandler(async (req, res) => {
        const options = {
            limit: parseInt(req.query.limit) || 50,
            offset: parseInt(req.query.offset) || 0,
            type: req.query.type || null,
            publishedOnly: req.query.publishedOnly === 'true'
        };

        const result = News.getAll(options);

        res.json({
            success: true,
            data: result.news,
            pagination: {
                total: result.total,
                page: result.page,
                pages: result.pages
            }
        });
    })
);

/**
 * GET /api/admin/news/stats
 * Statystyki wiadomości
 */
router.get('/news/stats',
    authenticateAdmin,
    asyncHandler(async (req, res) => {
        const stats = News.getStats();

        res.json({
            success: true,
            data: stats
        });
    })
);

/**
 * GET /api/admin/news/types
 * Dostępne typy wiadomości
 */
router.get('/news/types',
    authenticateAdmin,
    asyncHandler(async (req, res) => {
        res.json({
            success: true,
            data: News.getTypes()
        });
    })
);

/**
 * GET /api/admin/news/search
 * Wyszukiwanie wiadomości
 */
router.get('/news/search',
    authenticateAdmin,
    asyncHandler(async (req, res) => {
        const { q } = req.query;
        if (!q || q.length < 2) {
            return res.status(400).json({
                success: false,
                error: 'Fraza musi mieć minimum 2 znaki'
            });
        }

        const limit = Math.min(parseInt(req.query.limit) || 20, 100);
        const results = News.search(q, { limit, publishedOnly: false });

        res.json({
            success: true,
            data: results
        });
    })
);

/**
 * GET /api/admin/news/:id
 * Szczegóły wiadomości
 */
router.get('/news/:id',
    authenticateAdmin,
    [
        param('id').isInt().withMessage('ID musi być liczbą')
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Błąd walidacji',
                details: errors.array()
            });
        }

        const id = parseInt(req.params.id);
        const news = News.getById(id);

        if (!news) {
            return res.status(404).json({
                success: false,
                error: 'Wiadomość nie znaleziona'
            });
        }

        res.json({
            success: true,
            data: news
        });
    })
);

/**
 * POST /api/admin/news
 * Tworzy nową wiadomość
 */
router.post('/news',
    authenticateAdmin,
    [
        body('title').trim().notEmpty().withMessage('Tytuł jest wymagany'),
        body('content').trim().notEmpty().withMessage('Treść jest wymagana'),
        body('type').optional().isIn(['news', 'update', 'event', 'maintenance', 'announcement'])
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Błąd walidacji',
                details: errors.array()
            });
        }

        const { title, content, summary, type, imageUrl, isPinned, tags } = req.body;

        const news = News.create({
            title,
            content,
            summary,
            type: type || 'news',
            imageUrl,
            isPinned: isPinned || false,
            tags: tags || [],
            createdBy: req.admin.id
        });

        ActivityLog.logAdminAction('news_create', {
            newsId: news.id,
            title
        }, getClientIp(req));

        res.status(201).json({
            success: true,
            message: 'Wiadomość została utworzona',
            data: news
        });
    })
);

/**
 * PUT /api/admin/news/:id
 * Aktualizuje wiadomość
 */
router.put('/news/:id',
    authenticateAdmin,
    [
        param('id').isInt().withMessage('ID musi być liczbą')
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Błąd walidacji',
                details: errors.array()
            });
        }

        const id = parseInt(req.params.id);
        const existing = News.getById(id);

        if (!existing) {
            return res.status(404).json({
                success: false,
                error: 'Wiadomość nie znaleziona'
            });
        }

        const { title, content, summary, type, imageUrl, isPinned, tags } = req.body;
        const updated = News.update(id, { title, content, summary, type, imageUrl, isPinned, tags });

        ActivityLog.logAdminAction('news_update', {
            newsId: id
        }, getClientIp(req));

        res.json({
            success: true,
            message: 'Wiadomość została zaktualizowana',
            data: updated
        });
    })
);

/**
 * POST /api/admin/news/:id/publish
 * Publikuje wiadomość
 */
router.post('/news/:id/publish',
    authenticateAdmin,
    [
        param('id').isInt().withMessage('ID musi być liczbą')
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Błąd walidacji',
                details: errors.array()
            });
        }

        const id = parseInt(req.params.id);
        const news = News.publish(id);

        if (!news) {
            return res.status(404).json({
                success: false,
                error: 'Wiadomość nie znaleziona'
            });
        }

        ActivityLog.logAdminAction('news_publish', {
            newsId: id,
            title: news.title
        }, getClientIp(req));

        res.json({
            success: true,
            message: 'Wiadomość została opublikowana',
            data: news
        });
    })
);

/**
 * POST /api/admin/news/:id/unpublish
 * Wycofuje publikację
 */
router.post('/news/:id/unpublish',
    authenticateAdmin,
    [
        param('id').isInt().withMessage('ID musi być liczbą')
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Błąd walidacji',
                details: errors.array()
            });
        }

        const id = parseInt(req.params.id);
        const news = News.unpublish(id);

        if (!news) {
            return res.status(404).json({
                success: false,
                error: 'Wiadomość nie znaleziona'
            });
        }

        ActivityLog.logAdminAction('news_unpublish', {
            newsId: id
        }, getClientIp(req));

        res.json({
            success: true,
            message: 'Publikacja została wycofana',
            data: news
        });
    })
);

/**
 * POST /api/admin/news/:id/pin
 * Przypina/odpina wiadomość
 */
router.post('/news/:id/pin',
    authenticateAdmin,
    [
        param('id').isInt().withMessage('ID musi być liczbą')
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Błąd walidacji',
                details: errors.array()
            });
        }

        const id = parseInt(req.params.id);
        const news = News.togglePin(id);

        if (!news) {
            return res.status(404).json({
                success: false,
                error: 'Wiadomość nie znaleziona'
            });
        }

        res.json({
            success: true,
            message: news.is_pinned ? 'Wiadomość przypięta' : 'Wiadomość odpięta',
            data: news
        });
    })
);

/**
 * DELETE /api/admin/news/:id
 * Usuwa wiadomość
 */
router.delete('/news/:id',
    authenticateAdmin,
    [
        param('id').isInt().withMessage('ID musi być liczbą')
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Błąd walidacji',
                details: errors.array()
            });
        }

        const id = parseInt(req.params.id);
        const deleted = News.delete(id);

        if (!deleted) {
            return res.status(404).json({
                success: false,
                error: 'Wiadomość nie znaleziona'
            });
        }

        ActivityLog.logAdminAction('news_delete', {
            newsId: id,
            title: deleted.title
        }, getClientIp(req));

        res.json({
            success: true,
            message: 'Wiadomość została usunięta'
        });
    })
);

// ============================================
// ZARZĄDZANIE SERWERAMI
// ============================================

/**
 * GET /api/admin/servers
 * Pobiera listę wszystkich serwerów
 */
router.get('/servers', asyncHandler(async (req, res) => {
    const servers = Server.getAll();
    res.json({ success: true, data: servers });
}));

/**
 * POST /api/admin/servers
 * Dodaje nowy serwer
 */
router.post('/servers',
    [
        body('name').trim().notEmpty().withMessage('Nazwa serwera jest wymagana'),
        body('ip').trim().notEmpty().withMessage('Adres IP jest wymagany'),
        body('port').optional().isInt({ min: 1, max: 65535 }),
        body('description').optional().isString(),
        body('is_default').optional().isBoolean()
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Błąd walidacji',
                details: errors.array()
            });
        }

        const server = Server.create(req.body);

        ActivityLog.logAdminAction('server_create', {
            serverId: server.id,
            name: server.name,
            ip: server.ip
        }, getClientIp(req));

        res.json({
            success: true,
            message: 'Serwer został dodany',
            data: server
        });
    })
);

/**
 * PUT /api/admin/servers/:id
 * Aktualizuje serwer
 */
router.put('/servers/:id',
    [
        param('id').isInt(),
        body('name').optional().trim().notEmpty(),
        body('ip').optional().trim().notEmpty(),
        body('port').optional().isInt({ min: 1, max: 65535 }),
        body('description').optional().isString(),
        body('is_default').optional().isBoolean(),
        body('is_enabled').optional().isBoolean()
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Błąd walidacji',
                details: errors.array()
            });
        }

        const id = parseInt(req.params.id);
        const existing = Server.getById(id);
        if (!existing) {
            return res.status(404).json({
                success: false,
                error: 'Serwer nie znaleziony'
            });
        }

        const server = Server.update(id, req.body);

        ActivityLog.logAdminAction('server_update', {
            serverId: id,
            name: server.name
        }, getClientIp(req));

        res.json({
            success: true,
            message: 'Serwer został zaktualizowany',
            data: server
        });
    })
);

/**
 * DELETE /api/admin/servers/:id
 * Usuwa serwer
 */
router.delete('/servers/:id',
    [param('id').isInt()],
    asyncHandler(async (req, res) => {
        const id = parseInt(req.params.id);
        const deleted = Server.delete(id);

        if (!deleted) {
            return res.status(404).json({
                success: false,
                error: 'Serwer nie znaleziony'
            });
        }

        ActivityLog.logAdminAction('server_delete', {
            serverId: id,
            name: deleted.name
        }, getClientIp(req));

        res.json({
            success: true,
            message: 'Serwer został usunięty'
        });
    })
);

/**
 * POST /api/admin/servers/:id/toggle
 * Włącza/wyłącza serwer
 */
router.post('/servers/:id/toggle',
    [param('id').isInt()],
    asyncHandler(async (req, res) => {
        const id = parseInt(req.params.id);
        const server = Server.toggle(id);

        if (!server) {
            return res.status(404).json({
                success: false,
                error: 'Serwer nie znaleziony'
            });
        }

        ActivityLog.logAdminAction('server_toggle', {
            serverId: id,
            name: server.name,
            enabled: !!server.is_enabled
        }, getClientIp(req));

        res.json({
            success: true,
            message: server.is_enabled ? 'Serwer włączony' : 'Serwer wyłączony',
            data: server
        });
    })
);

/**
 * POST /api/admin/servers/reorder
 * Zmienia kolejność serwerów
 */
router.post('/servers/reorder',
    [body('ids').isArray()],
    asyncHandler(async (req, res) => {
        const { ids } = req.body;
        Server.reorder(ids);

        ActivityLog.logAdminAction('server_reorder', { ids }, getClientIp(req));

        res.json({
            success: true,
            message: 'Kolejność serwerów zaktualizowana'
        });
    })
);

export default router;
