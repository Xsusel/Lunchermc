/**
 * Trasy zarządzania serwerami
 * /servers CRUD, toggle, reorder
 */
import { Router } from 'express';
import { body, param, validationResult } from 'express-validator';
import { Server, ActivityLog } from '../../models/index.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { getClientIp } from '../../utils/helpers.js';

const router = Router();

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
