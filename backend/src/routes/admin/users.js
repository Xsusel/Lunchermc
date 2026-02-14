/**
 * Trasy zarządzania użytkownikami
 * /users, /users/:id, ban, unban, delete
 */
import { Router } from 'express';
import { body } from 'express-validator';
import { User, ActivityLog } from '../../models/index.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { getClientIp } from '../../utils/helpers.js';

const router = Router();

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

export default router;
