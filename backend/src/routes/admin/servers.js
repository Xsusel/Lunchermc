/**
 * Trasy zarządzania serwerami
 * /servers CRUD, toggle, reorder, mods assignment, game config, clear files
 */
import { Router } from 'express';
import { body, param, validationResult } from 'express-validator';
import { Server, Mod, ActivityLog } from '../../models/index.js';
import { requireRole } from '../../middleware/index.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { getClientIp } from '../../utils/helpers.js';

const router = Router();

// Wszystkie trasy serwerów wymagają roli admin
router.use('/servers', requireRole('admin'));
router.use('/servers/*', requireRole('admin'));

/**
 * GET /api/admin/servers
 * Pobiera listę wszystkich serwerów (z liczbą modów)
 */
router.get('/servers', asyncHandler(async (req, res) => {
    const servers = Server.getAll();

    // Dodaj liczbę modów do każdego serwera
    const serversWithModCount = servers.map(server => ({
        ...server,
        mod_count: Server.getModCount(server.id)
    }));

    res.json({ success: true, data: serversWithModCount });
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
        body('is_default').optional().isBoolean(),
        body('game_version').optional().isString(),
        body('loader_type').optional().isIn(['vanilla', 'forge', 'fabric']),
        body('forge_version').optional().isString(),
        body('fabric_version').optional().isString(),
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
 * Aktualizuje serwer (dane + konfiguracja gry)
 */
router.put('/servers/:id',
    [
        param('id').isInt(),
        body('name').optional().trim().notEmpty(),
        body('ip').optional().trim().notEmpty(),
        body('port').optional().isInt({ min: 1, max: 65535 }),
        body('description').optional().isString(),
        body('is_default').optional().isBoolean(),
        body('is_enabled').optional().isBoolean(),
        body('game_version').optional().isString(),
        body('loader_type').optional().isIn(['vanilla', 'forge', 'fabric']),
        body('forge_version').optional().isString(),
        body('fabric_version').optional().isString(),
        body('java_args').optional().isString(),
        body('maintenance_mode').optional().isBoolean(),
        body('maintenance_message').optional().isString()
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

// ============================================
// PER-SERVER MOD MANAGEMENT
// ============================================

/**
 * GET /api/admin/servers/:id/mods
 * Pobiera mody przypisane do serwera
 */
router.get('/servers/:id/mods',
    [param('id').isInt()],
    asyncHandler(async (req, res) => {
        const id = parseInt(req.params.id);
        const server = Server.getById(id);

        if (!server) {
            return res.status(404).json({
                success: false,
                error: 'Serwer nie znaleziony'
            });
        }

        const assignedMods = Server.getMods(id);
        const allMods = Mod.getAll();

        // Dodaj informację czy mod jest przypisany do tego serwera
        const assignedIds = new Set(assignedMods.map(m => m.id));
        const modsWithAssignment = allMods.map(mod => ({
            ...mod,
            assigned: assignedIds.has(mod.id),
            server_enabled: assignedMods.find(m => m.id === mod.id)?.server_enabled ?? 1
        }));

        res.json({
            success: true,
            data: {
                server,
                mods: modsWithAssignment
            }
        });
    })
);

/**
 * PUT /api/admin/servers/:id/mods
 * Ustawia mody serwera (zastępuje listę)
 */
router.put('/servers/:id/mods',
    [
        param('id').isInt(),
        body('modIds').isArray()
    ],
    asyncHandler(async (req, res) => {
        const id = parseInt(req.params.id);
        const server = Server.getById(id);

        if (!server) {
            return res.status(404).json({
                success: false,
                error: 'Serwer nie znaleziony'
            });
        }

        const { modIds } = req.body;
        Server.setMods(id, modIds);

        ActivityLog.logAdminAction('server_mods_set', {
            serverId: id,
            serverName: server.name,
            modCount: modIds.length
        }, getClientIp(req));

        res.json({
            success: true,
            message: `Przypisano ${modIds.length} modów do serwera ${server.name}`,
            data: { modCount: modIds.length }
        });
    })
);

/**
 * POST /api/admin/servers/:id/mods/:modId
 * Przypisuje mod do serwera
 */
router.post('/servers/:id/mods/:modId',
    [param('id').isInt(), param('modId').isInt()],
    asyncHandler(async (req, res) => {
        const serverId = parseInt(req.params.id);
        const modId = parseInt(req.params.modId);

        const server = Server.getById(serverId);
        if (!server) {
            return res.status(404).json({ success: false, error: 'Serwer nie znaleziony' });
        }

        const mod = Mod.findById(modId);
        if (!mod) {
            return res.status(404).json({ success: false, error: 'Mod nie znaleziony' });
        }

        Server.assignMod(serverId, modId);

        ActivityLog.logAdminAction('server_mod_assign', {
            serverId, serverName: server.name,
            modId, modName: mod.name
        }, getClientIp(req));

        res.json({
            success: true,
            message: `Mod "${mod.name}" przypisany do "${server.name}"`
        });
    })
);

/**
 * DELETE /api/admin/servers/:id/mods/:modId
 * Usuwa mod z serwera
 */
router.delete('/servers/:id/mods/:modId',
    [param('id').isInt(), param('modId').isInt()],
    asyncHandler(async (req, res) => {
        const serverId = parseInt(req.params.id);
        const modId = parseInt(req.params.modId);

        const server = Server.getById(serverId);
        if (!server) {
            return res.status(404).json({ success: false, error: 'Serwer nie znaleziony' });
        }

        Server.removeMod(serverId, modId);

        ActivityLog.logAdminAction('server_mod_remove', {
            serverId, serverName: server.name, modId
        }, getClientIp(req));

        res.json({
            success: true,
            message: 'Mod usunięty z serwera'
        });
    })
);

/**
 * POST /api/admin/servers/:id/mods/:modId/toggle
 * Włącza/wyłącza mod na serwerze
 */
router.post('/servers/:id/mods/:modId/toggle',
    [param('id').isInt(), param('modId').isInt()],
    asyncHandler(async (req, res) => {
        const serverId = parseInt(req.params.id);
        const modId = parseInt(req.params.modId);

        const server = Server.getById(serverId);
        if (!server) {
            return res.status(404).json({ success: false, error: 'Serwer nie znaleziony' });
        }

        // Sprawdź obecny stan
        const mods = Server.getMods(serverId);
        const currentMod = mods.find(m => m.id === modId);
        if (!currentMod) {
            return res.status(404).json({ success: false, error: 'Mod nie jest przypisany do tego serwera' });
        }

        const newState = !currentMod.server_enabled;
        Server.toggleMod(serverId, modId, newState);

        res.json({
            success: true,
            message: newState ? 'Mod włączony na serwerze' : 'Mod wyłączony na serwerze',
            data: { enabled: newState }
        });
    })
);

/**
 * POST /api/admin/servers/:id/clear-mods
 * Usuwa wszystkie mody z serwera (czyści przypisania, nie pliki)
 */
router.post('/servers/:id/clear-mods',
    [param('id').isInt()],
    asyncHandler(async (req, res) => {
        const id = parseInt(req.params.id);
        const server = Server.getById(id);

        if (!server) {
            return res.status(404).json({ success: false, error: 'Serwer nie znaleziony' });
        }

        Server.setMods(id, []);

        ActivityLog.logAdminAction('server_mods_clear', {
            serverId: id,
            serverName: server.name
        }, getClientIp(req));

        res.json({
            success: true,
            message: `Usunięto wszystkie mody z serwera "${server.name}"`
        });
    })
);

/**
 * POST /api/admin/servers/:id/clear-files
 * Usuwa wszystkie pliki z serwera (czyści przypisania, nie fizyczne pliki)
 */
router.post('/servers/:id/clear-files',
    [param('id').isInt()],
    asyncHandler(async (req, res) => {
        const id = parseInt(req.params.id);
        const server = Server.getById(id);

        if (!server) {
            return res.status(404).json({ success: false, error: 'Serwer nie znaleziony' });
        }

        Server.setFiles(id, []);
        Server.setMods(id, []);

        ActivityLog.logAdminAction('server_files_clear', {
            serverId: id,
            serverName: server.name
        }, getClientIp(req));

        res.json({
            success: true,
            message: `Wyczyszczono wszystkie pliki i mody z serwera "${server.name}"`
        });
    })
);

export default router;
