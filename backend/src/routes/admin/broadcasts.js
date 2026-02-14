/**
 * Trasy zarządzania powiadomieniami (broadcast)
 * /broadcasts CRUD + toggle
 */
import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { Broadcast, ActivityLog } from '../../models/index.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { getClientIp } from '../../utils/helpers.js';

const router = Router();

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

export default router;
