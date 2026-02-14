/**
 * Trasy statystyk graczy (admin)
 * GET /api/admin/stats/players - zagregowane statystyki graczy
 * GET /api/admin/stats/players/:id - statystyki pojedynczego gracza
 * GET /api/admin/stats/overview - ogólne statystyki systemowe
 */
import { Router } from 'express';
import { param, validationResult } from 'express-validator';
import { PlayerStats } from '../../models/index.js';
import { authenticateAdmin } from '../../middleware/index.js';
import { asyncHandler } from '../../middleware/errorHandler.js';

const router = Router();

// ============================================
// ZAGREGOWANE STATYSTYKI GRACZY
// ============================================

/**
 * GET /api/admin/stats/players
 * Zagregowane statystyki graczy (total playtime, most active, etc.)
 */
router.get('/stats/players',
    authenticateAdmin,
    asyncHandler(async (req, res) => {
        const limit = Math.min(parseInt(req.query.limit) || 10, 100);

        const serverStats = PlayerStats.getServerStats();
        const topByPlaytime = PlayerStats.getTopPlayersByPlaytime(limit);
        const recentlyActive = PlayerStats.getRecentlyActivePlayers(limit);
        const newestPlayers = PlayerStats.getNewestPlayers(limit);
        const playtimeDistribution = PlayerStats.getPlaytimeDistribution();

        res.json({
            success: true,
            data: {
                summary: serverStats,
                topByPlaytime,
                recentlyActive,
                newestPlayers,
                playtimeDistribution
            }
        });
    })
);

// ============================================
// STATYSTYKI POJEDYNCZEGO GRACZA
// ============================================

/**
 * GET /api/admin/stats/players/:id
 * Szczegolowe statystyki pojedynczego gracza
 */
router.get('/stats/players/:id',
    authenticateAdmin,
    [
        param('id').isInt().withMessage('ID musi byc liczba calkowita')
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Blad walidacji',
                details: errors.array()
            });
        }

        const player = PlayerStats.getPlayerDetails(parseInt(req.params.id));

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

// ============================================
// STATYSTYKI SYSTEMOWE (OVERVIEW)
// ============================================

/**
 * GET /api/admin/stats/overview
 * Statystyki calego systemu: rejestracje dzienne, aktywni uzytkownicy, etc.
 */
router.get('/stats/overview',
    authenticateAdmin,
    asyncHandler(async (req, res) => {
        const days = Math.min(parseInt(req.query.days) || 30, 365);

        const serverStats = PlayerStats.getServerStats();
        const activitySummary = PlayerStats.getActivitySummary();
        const registrationStats = PlayerStats.getRegistrationStats(days);
        const activityStats = PlayerStats.getActivityStats(days);
        const playtimeDistribution = PlayerStats.getPlaytimeDistribution();

        res.json({
            success: true,
            data: {
                server: serverStats,
                activity: activitySummary,
                registrationsPerDay: registrationStats,
                activityPerDay: activityStats,
                playtimeDistribution
            }
        });
    })
);

export default router;
