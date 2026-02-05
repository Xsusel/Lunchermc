/**
 * Model statystyk graczy
 * Agregacja i analiza danych o graczach
 */
import db from '../config/database.js';

class PlayerStats {
    /**
     * Pobiera ogólne statystyki serwera
     */
    static getServerStats() {
        const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
        const bannedUsers = db.prepare('SELECT COUNT(*) as count FROM users WHERE is_banned = 1').get().count;
        const activeUsers = db.prepare(`
            SELECT COUNT(*) as count FROM users
            WHERE last_login > datetime('now', '-7 days')
        `).get().count;
        const newUsersToday = db.prepare(`
            SELECT COUNT(*) as count FROM users
            WHERE date(created_at) = date('now')
        `).get().count;
        const newUsersThisWeek = db.prepare(`
            SELECT COUNT(*) as count FROM users
            WHERE created_at > datetime('now', '-7 days')
        `).get().count;
        const newUsersThisMonth = db.prepare(`
            SELECT COUNT(*) as count FROM users
            WHERE created_at > datetime('now', '-30 days')
        `).get().count;

        // Łączny czas gry wszystkich graczy (w minutach)
        const totalPlaytime = db.prepare('SELECT COALESCE(SUM(total_playtime), 0) as total FROM users').get().total;

        // Średni czas gry na gracza
        const avgPlaytime = totalUsers > 0 ? Math.round(totalPlaytime / totalUsers) : 0;

        return {
            totalUsers,
            bannedUsers,
            activeUsers,
            newUsersToday,
            newUsersThisWeek,
            newUsersThisMonth,
            totalPlaytimeMinutes: totalPlaytime,
            totalPlaytimeHours: Math.round(totalPlaytime / 60),
            averagePlaytimeMinutes: avgPlaytime,
            averagePlaytimeHours: Math.round(avgPlaytime / 60)
        };
    }

    /**
     * Pobiera top graczy według czasu gry
     */
    static getTopPlayersByPlaytime(limit = 10) {
        return db.prepare(`
            SELECT
                id,
                username,
                total_playtime,
                last_login,
                created_at
            FROM users
            WHERE is_banned = 0
            ORDER BY total_playtime DESC
            LIMIT ?
        `).all(limit);
    }

    /**
     * Pobiera najnowszych graczy
     */
    static getNewestPlayers(limit = 10) {
        return db.prepare(`
            SELECT
                id,
                username,
                total_playtime,
                last_login,
                created_at
            FROM users
            ORDER BY created_at DESC
            LIMIT ?
        `).all(limit);
    }

    /**
     * Pobiera ostatnio aktywnych graczy
     */
    static getRecentlyActivePlayers(limit = 10) {
        return db.prepare(`
            SELECT
                id,
                username,
                total_playtime,
                last_login,
                created_at
            FROM users
            WHERE last_login IS NOT NULL AND is_banned = 0
            ORDER BY last_login DESC
            LIMIT ?
        `).all(limit);
    }

    /**
     * Pobiera statystyki rejestracji w czasie
     */
    static getRegistrationStats(days = 30) {
        return db.prepare(`
            SELECT
                date(created_at) as date,
                COUNT(*) as count
            FROM users
            WHERE created_at > datetime('now', '-' || ? || ' days')
            GROUP BY date(created_at)
            ORDER BY date ASC
        `).all(days);
    }

    /**
     * Pobiera statystyki aktywności (logowania) w czasie
     */
    static getActivityStats(days = 30) {
        return db.prepare(`
            SELECT
                date(last_login) as date,
                COUNT(*) as count
            FROM users
            WHERE last_login > datetime('now', '-' || ? || ' days')
            GROUP BY date(last_login)
            ORDER BY date ASC
        `).all(days);
    }

    /**
     * Pobiera rozkład czasu gry
     */
    static getPlaytimeDistribution() {
        const ranges = [
            { label: '0-1h', min: 0, max: 60 },
            { label: '1-5h', min: 60, max: 300 },
            { label: '5-10h', min: 300, max: 600 },
            { label: '10-25h', min: 600, max: 1500 },
            { label: '25-50h', min: 1500, max: 3000 },
            { label: '50-100h', min: 3000, max: 6000 },
            { label: '100h+', min: 6000, max: 999999 }
        ];

        const distribution = ranges.map(range => {
            const count = db.prepare(`
                SELECT COUNT(*) as count FROM users
                WHERE total_playtime >= ? AND total_playtime < ?
            `).get(range.min, range.max).count;

            return {
                label: range.label,
                count
            };
        });

        return distribution;
    }

    /**
     * Pobiera szczegółowe statystyki gracza
     */
    static getPlayerDetails(userId) {
        const user = db.prepare(`
            SELECT
                id,
                username,
                is_banned,
                ban_reason,
                created_at,
                last_login,
                total_playtime
            FROM users
            WHERE id = ?
        `).get(userId);

        if (!user) return null;

        // Oblicz pozycję w rankingu
        const rank = db.prepare(`
            SELECT COUNT(*) + 1 as rank
            FROM users
            WHERE total_playtime > (SELECT total_playtime FROM users WHERE id = ?)
        `).get(userId).rank;

        // Oblicz dni od rejestracji
        const daysSinceRegistration = db.prepare(`
            SELECT julianday('now') - julianday(created_at) as days
            FROM users WHERE id = ?
        `).get(userId).days;

        // Ostatnia aktywność
        const lastActivity = db.prepare(`
            SELECT
                action,
                created_at
            FROM activity_logs
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT 1
        `).get(userId);

        // Liczba logowań
        const loginCount = db.prepare(`
            SELECT COUNT(*) as count
            FROM activity_logs
            WHERE user_id = ? AND action = 'login'
        `).get(userId).count;

        return {
            ...user,
            rank,
            daysSinceRegistration: Math.floor(daysSinceRegistration),
            loginCount,
            lastActivity,
            playtimeFormatted: formatPlaytime(user.total_playtime)
        };
    }

    /**
     * Wyszukuje graczy
     */
    static searchPlayers(query, limit = 20) {
        return db.prepare(`
            SELECT
                id,
                username,
                is_banned,
                total_playtime,
                last_login,
                created_at
            FROM users
            WHERE username LIKE ?
            ORDER BY total_playtime DESC
            LIMIT ?
        `).all(`%${query}%`, limit);
    }

    /**
     * Pobiera dzienną/tygodniową/miesięczną aktywność
     */
    static getActivitySummary() {
        const today = db.prepare(`
            SELECT COUNT(DISTINCT user_id) as count
            FROM activity_logs
            WHERE date(created_at) = date('now')
        `).get().count;

        const thisWeek = db.prepare(`
            SELECT COUNT(DISTINCT user_id) as count
            FROM activity_logs
            WHERE created_at > datetime('now', '-7 days')
        `).get().count;

        const thisMonth = db.prepare(`
            SELECT COUNT(DISTINCT user_id) as count
            FROM activity_logs
            WHERE created_at > datetime('now', '-30 days')
        `).get().count;

        return {
            today,
            thisWeek,
            thisMonth
        };
    }
}

/**
 * Formatuje czas gry do czytelnej postaci
 */
function formatPlaytime(minutes) {
    if (minutes < 60) {
        return `${minutes} min`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours < 24) {
        return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
    }
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return `${days}d ${remainingHours}h`;
}

export default PlayerStats;
