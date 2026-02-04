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
    User, Admin, GameConfig, Mod, Broadcast, ActivityLog, LauncherVersion
} from '../models/index.js';
import { authenticateAdmin, generateAdminToken, adminLimiter, authLimiter } from '../middleware/index.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
    calculateSHA256, sanitizeFilename, isAllowedModFile,
    getModsPath, ensureDir, getClientIp, formatFileSize
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
// LOGI AKTYWNOŚCI
// ============================================

/**
 * GET /api/admin/logs
 * Lista logów aktywności
 */
router.get('/logs', asyncHandler(async (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    const action = req.query.action || null;

    const logs = ActivityLog.getAll(limit, offset, action);

    res.json({
        success: true,
        data: logs
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

export default router;
