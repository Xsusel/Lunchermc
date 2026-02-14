/**
 * Pozostałe trasy admina
 * dashboard, me, 2FA management, launcher-versions, stats,
 * maintenance-schedule, sessions, bans, appeals, rules, news, skins
 */
import { Router } from 'express';
import { body, param, validationResult } from 'express-validator';
import {
    User, Admin, GameConfig, Mod, Broadcast, ActivityLog, LauncherVersion,
    PlayerStats, ScheduledMaintenance, Session, Ban, ServerRules, News, Skin
} from '../../models/index.js';
import BanAppeal from '../../models/BanAppeal.js';
import { authenticateAdmin, requireRole } from '../../middleware/index.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { getClientIp } from '../../utils/helpers.js';
import { notifyBan } from '../../utils/discord.js';

const router = Router();

// Trasy 2FA, launcher-versions, maintenance wymagają roli admin
router.use('/2fa', requireRole('admin'));
router.use('/2fa/*', requireRole('admin'));
router.use('/launcher-versions', requireRole('admin'));
router.use('/launcher-versions/*', requireRole('admin'));
router.use('/maintenance', requireRole('admin'));
router.use('/maintenance/*', requireRole('admin'));

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
            username: req.admin.username,
            role: req.admin.role || 'admin'
        }
    });
}));

// ============================================
// ZARZĄDZANIE ADMINAMI (ROLE)
// ============================================

/**
 * POST /api/admin/admins/:id/role
 * Zmienia rolę administratora (tylko dla adminów)
 */
router.post('/admins/:id/role',
    requireRole('admin'),
    [
        param('id').isInt().withMessage('ID musi być liczbą'),
        body('role').isIn(['admin', 'moderator']).withMessage('Rola musi być "admin" lub "moderator"')
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

        const targetId = parseInt(req.params.id);
        const { role } = req.body;

        // Nie pozwalamy zmienić roli samemu sobie
        if (targetId === req.admin.id) {
            return res.status(400).json({
                success: false,
                error: 'Nie możesz zmienić własnej roli'
            });
        }

        const targetAdmin = Admin.findById(targetId);
        if (!targetAdmin) {
            return res.status(404).json({
                success: false,
                error: 'Administrator nie istnieje'
            });
        }

        Admin.setRole(targetId, role);

        ActivityLog.logAdminAction('admin_role_change', {
            targetAdminId: targetId,
            targetUsername: targetAdmin.username,
            oldRole: targetAdmin.role || 'admin',
            newRole: role
        }, getClientIp(req));

        res.json({
            success: true,
            message: `Rola użytkownika ${targetAdmin.username} została zmieniona na ${role}`,
            data: { id: targetId, role }
        });
    })
);

/**
 * GET /api/admin/admins
 * Lista wszystkich administratorów (tylko dla adminów)
 */
router.get('/admins',
    requireRole('admin'),
    asyncHandler(async (req, res) => {
        const admins = Admin.getAll();

        res.json({
            success: true,
            data: admins
        });
    })
);

// ============================================
// ZARZĄDZANIE 2FA
// ============================================

/**
 * POST /api/admin/2fa/setup
 * Rozpoczyna konfigurację 2FA - generuje sekret i URI
 */
router.post('/2fa/setup', asyncHandler(async (req, res) => {
    const adminId = req.admin.id;

    if (Admin.is2FAEnabled(adminId)) {
        return res.status(400).json({
            success: false,
            error: '2FA jest już włączone. Wyłącz je najpierw, aby skonfigurować ponownie.'
        });
    }

    const { secret, otpauthUri } = Admin.enable2FA(adminId);

    res.json({
        success: true,
        data: {
            secret,
            otpauthUri
        }
    });
}));

/**
 * POST /api/admin/2fa/verify-setup
 * Weryfikuje kod TOTP podczas konfiguracji i włącza 2FA
 */
router.post('/2fa/verify-setup',
    [body('token').trim().notEmpty().withMessage('Kod 2FA jest wymagany')],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Błąd walidacji',
                details: errors.array()
            });
        }

        const adminId = req.admin.id;
        const { token } = req.body;

        // Weryfikujemy kod TOTP
        const isValid = Admin.verify2FA(adminId, token);
        if (!isValid) {
            return res.status(400).json({
                success: false,
                error: 'Nieprawidłowy kod 2FA. Sprawdź czy czas na urządzeniu jest zsynchronizowany.'
            });
        }

        // Włączamy 2FA
        Admin.confirm2FA(adminId);

        // Generujemy kody zapasowe
        const backupCodes = Admin.generateBackupCodes(adminId);

        ActivityLog.logAdminAction('2fa_enabled', { admin: req.admin.username }, getClientIp(req));

        res.json({
            success: true,
            message: '2FA zostało włączone pomyślnie',
            data: {
                backupCodes
            }
        });
    })
);

/**
 * POST /api/admin/2fa/disable
 * Wyłącza 2FA (wymaga aktualnego kodu TOTP)
 */
router.post('/2fa/disable',
    [body('token').trim().notEmpty().withMessage('Kod 2FA jest wymagany')],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Błąd walidacji',
                details: errors.array()
            });
        }

        const adminId = req.admin.id;
        const { token } = req.body;

        if (!Admin.is2FAEnabled(adminId)) {
            return res.status(400).json({
                success: false,
                error: '2FA nie jest włączone'
            });
        }

        // Weryfikujemy kod TOTP
        const isValid = Admin.verify2FA(adminId, token);
        if (!isValid) {
            return res.status(400).json({
                success: false,
                error: 'Nieprawidłowy kod 2FA'
            });
        }

        Admin.disable2FA(adminId);

        ActivityLog.logAdminAction('2fa_disabled', { admin: req.admin.username }, getClientIp(req));

        res.json({
            success: true,
            message: '2FA zostało wyłączone'
        });
    })
);

/**
 * POST /api/admin/2fa/backup-codes
 * Generuje nowe kody zapasowe
 */
router.post('/2fa/backup-codes', asyncHandler(async (req, res) => {
    const adminId = req.admin.id;

    if (!Admin.is2FAEnabled(adminId)) {
        return res.status(400).json({
            success: false,
            error: '2FA nie jest włączone'
        });
    }

    const backupCodes = Admin.generateBackupCodes(adminId);

    ActivityLog.logAdminAction('2fa_backup_codes_regenerated', { admin: req.admin.username }, getClientIp(req));

    res.json({
        success: true,
        data: {
            backupCodes
        }
    });
}));

/**
 * GET /api/admin/2fa/status
 * Sprawdza status 2FA dla aktualnego admina
 */
router.get('/2fa/status', asyncHandler(async (req, res) => {
    const adminId = req.admin.id;
    const enabled = Admin.is2FAEnabled(adminId);

    res.json({
        success: true,
        data: {
            enabled
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

        // Powiadomienie Discord (async, nie blokuje odpowiedzi)
        const bannedUser = User.findById(userId);
        if (bannedUser) {
            notifyBan(bannedUser.username, reason).catch(() => {});
        }

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
// ZARZĄDZANIE SKINAMI (ADMIN)
// ============================================

/**
 * GET /api/admin/skins
 * Lista wszystkich niestandardowych skinów
 */
router.get('/skins',
    authenticateAdmin,
    asyncHandler(async (req, res) => {
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;

        const result = Skin.getAll(limit, offset);

        res.json({
            success: true,
            data: result.skins,
            pagination: {
                total: result.total,
                page: result.page,
                pages: result.pages,
                limit
            }
        });
    })
);

/**
 * DELETE /api/admin/skins/:userId
 * Usuwa skin użytkownika (admin)
 */
router.delete('/skins/:userId',
    authenticateAdmin,
    [
        param('userId').isInt().withMessage('userId musi być liczbą całkowitą')
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

        const user = User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'Użytkownik nie istnieje'
            });
        }

        const deleted = Skin.delete(userId);

        if (!deleted) {
            return res.status(404).json({
                success: false,
                error: 'Użytkownik nie ma ustawionego skina'
            });
        }

        ActivityLog.logAdminAction('skin_delete', {
            userId,
            username: user.username
        }, getClientIp(req));

        res.json({
            success: true,
            message: `Skin użytkownika ${user.username} został usunięty`
        });
    })
);

// ============================================
// APELE OD BANOW (BanAppeal model - v2)
// ============================================

/**
 * GET /api/admin/appeals
 * Lista wszystkich apeli
 */
router.get('/appeals',
    authenticateAdmin,
    asyncHandler(async (req, res) => {
        const options = {
            limit: parseInt(req.query.limit) || 50,
            offset: parseInt(req.query.offset) || 0,
            status: req.query.status || null
        };

        const result = BanAppeal.getAll(options);

        res.json({
            success: true,
            data: result.appeals,
            total: result.total
        });
    })
);

/**
 * PUT /api/admin/appeals/:id
 * Aktualizuje status apelu (approved/rejected)
 */
router.put('/appeals/:id',
    authenticateAdmin,
    [
        param('id').isInt().withMessage('ID musi być liczbą'),
        body('status').isIn(['approved', 'rejected']).withMessage('Status musi być approved lub rejected'),
        body('admin_response').optional().trim()
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
        const { status, admin_response } = req.body;

        try {
            const appeal = BanAppeal.updateStatus(id, status, admin_response || '');

            ActivityLog.logAdminAction('ban_appeal_review', {
                appealId: id,
                status,
                userId: appeal.user_id,
                username: appeal.username,
                adminResponse: admin_response
            }, getClientIp(req));

            res.json({
                success: true,
                message: status === 'approved'
                    ? 'Apel zaakceptowany, użytkownik został odbanowany'
                    : 'Apel odrzucony',
                data: appeal
            });
        } catch (error) {
            return res.status(400).json({
                success: false,
                error: error.message
            });
        }
    })
);

export default router;
