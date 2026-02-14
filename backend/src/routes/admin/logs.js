/**
 * Trasy logów aktywności
 * /logs z zaawansowanym filtrowaniem, export, stats, security, suspicious
 */
import { Router } from 'express';
import { ActivityLog } from '../../models/index.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { getClientIp } from '../../utils/helpers.js';

const router = Router();

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

export default router;
