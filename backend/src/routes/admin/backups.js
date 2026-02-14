/**
 * Trasy zarządzania backupami
 * /backups CRUD, restore, stats
 */
import { Router } from 'express';
import { body, param, validationResult } from 'express-validator';
import { ActivityLog } from '../../models/index.js';
import { authenticateAdmin, requireRole } from '../../middleware/index.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { getClientIp } from '../../utils/helpers.js';
import {
    createBackup, listBackups, restoreBackup, deleteBackup, getBackupStats
} from '../../utils/backup.js';

const router = Router();

// Wszystkie trasy backupów wymagają roli admin
router.use('/backups', requireRole('admin'));
router.use('/backups/*', requireRole('admin'));

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
