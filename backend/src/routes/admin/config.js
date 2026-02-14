/**
 * Trasy konfiguracji gry
 * /config, /config/maintenance
 */
import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { GameConfig, ActivityLog } from '../../models/index.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { getClientIp } from '../../utils/helpers.js';

const router = Router();

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

export default router;
