/**
 * Model zarządzania sesjami
 * Funkcje:
 * - Tracking aktywnych sesji użytkowników
 * - Informacje o urządzeniu i lokalizacji
 * - Revokacja sesji
 * - Automatyczne czyszczenie wygasłych
 */
import db from '../config/database.js';
import crypto from 'crypto';

// NOTE: Column migrations and index creation have been moved to
// /config/migrations.js (migrations 6 and 7). They run at startup.

class Session {
    /**
     * Generuje bezpieczny token sesji
     */
    static generateToken() {
        return crypto.randomBytes(48).toString('hex');
    }

    /**
     * Parsuje User-Agent na informacje o urządzeniu
     */
    static parseUserAgent(userAgent) {
        if (!userAgent) return { browser: 'unknown', os: 'unknown', device: 'unknown' };

        const info = {
            browser: 'unknown',
            os: 'unknown',
            device: 'desktop'
        };

        // Detekcja przeglądarki
        if (userAgent.includes('Firefox')) info.browser = 'Firefox';
        else if (userAgent.includes('Chrome')) info.browser = 'Chrome';
        else if (userAgent.includes('Safari')) info.browser = 'Safari';
        else if (userAgent.includes('Edge')) info.browser = 'Edge';
        else if (userAgent.includes('Electron')) info.browser = 'Launcher';

        // Detekcja systemu operacyjnego
        if (userAgent.includes('Windows')) info.os = 'Windows';
        else if (userAgent.includes('Mac')) info.os = 'macOS';
        else if (userAgent.includes('Linux')) info.os = 'Linux';
        else if (userAgent.includes('Android')) info.os = 'Android';
        else if (userAgent.includes('iOS')) info.os = 'iOS';

        // Detekcja urządzenia
        if (userAgent.includes('Mobile') || userAgent.includes('Android')) {
            info.device = 'mobile';
        } else if (userAgent.includes('Tablet') || userAgent.includes('iPad')) {
            info.device = 'tablet';
        }

        return info;
    }

    /**
     * Tworzy nową sesję
     */
    static create(data) {
        const {
            userId,
            userType = 'user',
            expiresIn = 7 * 24 * 60 * 60 * 1000, // 7 dni
            ipAddress = null,
            userAgent = null
        } = data;

        const token = this.generateToken();
        const expiresAt = new Date(Date.now() + expiresIn).toISOString();
        const deviceInfo = this.parseUserAgent(userAgent);

        const stmt = db.prepare(`
            INSERT INTO sessions (
                user_id, token, user_type, expires_at,
                ip_address, user_agent, device_info, is_active, last_activity
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))
        `);

        const result = stmt.run(
            userId,
            token,
            userType,
            expiresAt,
            ipAddress,
            userAgent,
            JSON.stringify(deviceInfo)
        );

        return {
            id: result.lastInsertRowid,
            token,
            expiresAt
        };
    }

    /**
     * Znajduje sesję po tokenie
     */
    static findByToken(token) {
        const session = db.prepare(`
            SELECT s.*, u.username
            FROM sessions s
            LEFT JOIN users u ON s.user_id = u.id AND s.user_type = 'user'
            WHERE s.token = ?
        `).get(token);

        if (session && session.device_info) {
            try {
                session.device_info = JSON.parse(session.device_info);
            } catch (e) {}
        }

        return session;
    }

    /**
     * Znajduje sesję po ID
     */
    static findById(id) {
        const session = db.prepare(`
            SELECT s.*, u.username
            FROM sessions s
            LEFT JOIN users u ON s.user_id = u.id AND s.user_type = 'user'
            WHERE s.id = ?
        `).get(id);

        if (session && session.device_info) {
            try {
                session.device_info = JSON.parse(session.device_info);
            } catch (e) {}
        }

        return session;
    }

    /**
     * Waliduje sesję (sprawdza czy aktywna i nie wygasła)
     */
    static validate(token) {
        const session = db.prepare(`
            SELECT s.*, u.username, u.is_banned as user_banned
            FROM sessions s
            LEFT JOIN users u ON s.user_id = u.id AND s.user_type = 'user'
            WHERE s.token = ?
            AND s.is_active = 1
            AND s.expires_at > datetime('now')
        `).get(token);

        if (!session) return null;

        // Sprawdź czy użytkownik nie jest zbanowany
        if (session.user_banned) return null;

        // Aktualizuj last_activity
        this.updateActivity(session.id);

        if (session.device_info) {
            try {
                session.device_info = JSON.parse(session.device_info);
            } catch (e) {}
        }

        return session;
    }

    /**
     * Aktualizuje ostatnią aktywność sesji
     */
    static updateActivity(sessionId) {
        db.prepare(`
            UPDATE sessions SET last_activity = datetime('now')
            WHERE id = ?
        `).run(sessionId);
    }

    /**
     * Pobiera wszystkie aktywne sesje użytkownika
     */
    static getByUser(userId, userType = 'user') {
        const sessions = db.prepare(`
            SELECT id, token, user_type, expires_at, created_at,
                   ip_address, user_agent, device_info, last_activity
            FROM sessions
            WHERE user_id = ?
            AND user_type = ?
            AND is_active = 1
            AND expires_at > datetime('now')
            ORDER BY last_activity DESC
        `).all(userId, userType);

        return sessions.map(s => {
            if (s.device_info) {
                try {
                    s.device_info = JSON.parse(s.device_info);
                } catch (e) {}
            }
            // Maskuj token dla bezpieczeństwa
            s.tokenPreview = s.token.substring(0, 8) + '...';
            delete s.token;
            return s;
        });
    }

    /**
     * Pobiera wszystkie sesje (dla admina)
     */
    static getAll(options = {}) {
        const {
            limit = 100,
            offset = 0,
            userId = null,
            userType = null,
            activeOnly = true,
            ipAddress = null
        } = options;

        let whereClauses = [];
        const params = [];

        if (userId) {
            whereClauses.push('s.user_id = ?');
            params.push(userId);
        }
        if (userType) {
            whereClauses.push('s.user_type = ?');
            params.push(userType);
        }
        if (activeOnly) {
            whereClauses.push("s.is_active = 1 AND s.expires_at > datetime('now')");
        }
        if (ipAddress) {
            whereClauses.push('s.ip_address = ?');
            params.push(ipAddress);
        }

        const whereClause = whereClauses.length > 0
            ? 'WHERE ' + whereClauses.join(' AND ')
            : '';

        // Count
        const { total } = db.prepare(`
            SELECT COUNT(*) as total FROM sessions s ${whereClause}
        `).get(...params);

        // Fetch
        params.push(limit, offset);
        const sessions = db.prepare(`
            SELECT s.id, s.user_id, s.user_type, s.expires_at, s.created_at,
                   s.ip_address, s.device_info, s.is_active, s.last_activity,
                   s.revoked_at, s.revoked_reason,
                   u.username
            FROM sessions s
            LEFT JOIN users u ON s.user_id = u.id AND s.user_type = 'user'
            ${whereClause}
            ORDER BY s.last_activity DESC NULLS LAST, s.created_at DESC
            LIMIT ? OFFSET ?
        `).all(...params);

        return {
            sessions: sessions.map(s => {
                if (s.device_info) {
                    try {
                        s.device_info = JSON.parse(s.device_info);
                    } catch (e) {}
                }
                return s;
            }),
            total,
            page: Math.floor(offset / limit) + 1,
            pages: Math.ceil(total / limit)
        };
    }

    /**
     * Revokuje sesję (wylogowuje)
     */
    static revoke(sessionId, reason = null) {
        const result = db.prepare(`
            UPDATE sessions
            SET is_active = 0, revoked_at = datetime('now'), revoked_reason = ?
            WHERE id = ?
        `).run(reason, sessionId);

        return result.changes > 0;
    }

    /**
     * Revokuje sesję po tokenie
     */
    static revokeByToken(token, reason = null) {
        const result = db.prepare(`
            UPDATE sessions
            SET is_active = 0, revoked_at = datetime('now'), revoked_reason = ?
            WHERE token = ?
        `).run(reason, token);

        return result.changes > 0;
    }

    /**
     * Revokuje wszystkie sesje użytkownika (logout everywhere)
     */
    static revokeAllByUser(userId, userType = 'user', reason = 'logout_all') {
        const result = db.prepare(`
            UPDATE sessions
            SET is_active = 0, revoked_at = datetime('now'), revoked_reason = ?
            WHERE user_id = ? AND user_type = ? AND is_active = 1
        `).run(reason, userId, userType);

        return result.changes;
    }

    /**
     * Revokuje wszystkie sesje z danego IP
     */
    static revokeByIP(ipAddress, reason = 'ip_ban') {
        const result = db.prepare(`
            UPDATE sessions
            SET is_active = 0, revoked_at = datetime('now'), revoked_reason = ?
            WHERE ip_address = ? AND is_active = 1
        `).run(reason, ipAddress);

        return result.changes;
    }

    /**
     * Usuwa wygasłe sesje
     */
    static cleanupExpired() {
        const result = db.prepare(`
            DELETE FROM sessions
            WHERE expires_at < datetime('now', '-7 days')
            OR (is_active = 0 AND revoked_at < datetime('now', '-7 days'))
        `).run();

        return result.changes;
    }

    /**
     * Pobiera statystyki sesji
     */
    static getStats() {
        const activeSessions = db.prepare(`
            SELECT COUNT(*) as count FROM sessions
            WHERE is_active = 1 AND expires_at > datetime('now')
        `).get().count;

        const totalSessions = db.prepare(`
            SELECT COUNT(*) as count FROM sessions
        `).get().count;

        const uniqueUsers = db.prepare(`
            SELECT COUNT(DISTINCT user_id) as count FROM sessions
            WHERE is_active = 1 AND expires_at > datetime('now')
        `).get().count;

        const uniqueIPs = db.prepare(`
            SELECT COUNT(DISTINCT ip_address) as count FROM sessions
            WHERE is_active = 1 AND expires_at > datetime('now')
            AND ip_address IS NOT NULL
        `).get().count;

        const byDevice = db.prepare(`
            SELECT
                json_extract(device_info, '$.device') as device,
                COUNT(*) as count
            FROM sessions
            WHERE is_active = 1 AND expires_at > datetime('now')
            AND device_info IS NOT NULL
            GROUP BY device
        `).all();

        const byOS = db.prepare(`
            SELECT
                json_extract(device_info, '$.os') as os,
                COUNT(*) as count
            FROM sessions
            WHERE is_active = 1 AND expires_at > datetime('now')
            AND device_info IS NOT NULL
            GROUP BY os
        `).all();

        const recentActivity = db.prepare(`
            SELECT COUNT(*) as count FROM sessions
            WHERE is_active = 1
            AND last_activity > datetime('now', '-1 hour')
        `).get().count;

        return {
            activeSessions,
            totalSessions,
            uniqueUsers,
            uniqueIPs,
            recentlyActive: recentActivity,
            byDevice,
            byOS
        };
    }

    /**
     * Sprawdza czy użytkownik ma zbyt wiele sesji
     */
    static checkSessionLimit(userId, userType = 'user', maxSessions = 5) {
        const count = db.prepare(`
            SELECT COUNT(*) as count FROM sessions
            WHERE user_id = ? AND user_type = ? AND is_active = 1
            AND expires_at > datetime('now')
        `).get(userId, userType).count;

        return count >= maxSessions;
    }

    /**
     * Usuwa najstarszą sesję użytkownika jeśli przekroczono limit
     */
    static enforceSessionLimit(userId, userType = 'user', maxSessions = 5) {
        const sessions = db.prepare(`
            SELECT id FROM sessions
            WHERE user_id = ? AND user_type = ? AND is_active = 1
            AND expires_at > datetime('now')
            ORDER BY last_activity ASC NULLS FIRST, created_at ASC
        `).all(userId, userType);

        if (sessions.length >= maxSessions) {
            // Usuń najstarsze sesje, zostaw tylko maxSessions - 1
            const toRemove = sessions.slice(0, sessions.length - maxSessions + 1);
            for (const session of toRemove) {
                this.revoke(session.id, 'session_limit_exceeded');
            }
            return toRemove.length;
        }
        return 0;
    }
}

export default Session;
