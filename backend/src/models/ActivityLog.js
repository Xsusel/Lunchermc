/**
 * Model logów aktywności
 * Obsługuje rejestrowanie zdarzeń w systemie
 */
import db from '../config/database.js';

class ActivityLog {
    /**
     * Dodaje nowy wpis do logów
     * @param {object} data - Dane logu
     * @returns {object} Utworzony wpis
     */
    static create(data) {
        const stmt = db.prepare(`
            INSERT INTO activity_logs (user_id, action, details, ip_address)
            VALUES (?, ?, ?, ?)
        `);

        const result = stmt.run(
            data.user_id || null,
            data.action,
            data.details ? JSON.stringify(data.details) : null,
            data.ip_address || null
        );

        return this.findById(result.lastInsertRowid);
    }

    /**
     * Znajduje wpis po ID
     * @param {number} id - ID wpisu
     * @returns {object|null} Wpis lub null
     */
    static findById(id) {
        const log = db.prepare('SELECT * FROM activity_logs WHERE id = ?').get(id);
        if (log && log.details) {
            try {
                log.details = JSON.parse(log.details);
            } catch (e) {
                // Pozostawiamy jako string jeśli nie jest JSON-em
            }
        }
        return log;
    }

    /**
     * Pobiera logi z paginacją
     * @param {number} limit - Limit wyników
     * @param {number} offset - Offset
     * @param {string} action - Filtr po akcji (opcjonalnie)
     * @returns {array} Lista logów
     */
    static getAll(limit = 100, offset = 0, action = null) {
        let sql = `
            SELECT al.*, u.username
            FROM activity_logs al
            LEFT JOIN users u ON al.user_id = u.id
        `;
        const params = [];

        if (action) {
            sql += ' WHERE al.action = ?';
            params.push(action);
        }

        sql += ' ORDER BY al.created_at DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        return db.prepare(sql).all(...params).map(log => {
            if (log.details) {
                try {
                    log.details = JSON.parse(log.details);
                } catch (e) {
                    // Pozostawiamy jako string
                }
            }
            return log;
        });
    }

    /**
     * Pobiera logi użytkownika
     * @param {number} userId - ID użytkownika
     * @param {number} limit - Limit wyników
     * @returns {array} Lista logów
     */
    static getByUser(userId, limit = 50) {
        return db.prepare(`
            SELECT * FROM activity_logs
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT ?
        `).all(userId, limit).map(log => {
            if (log.details) {
                try {
                    log.details = JSON.parse(log.details);
                } catch (e) {
                    // Pozostawiamy jako string
                }
            }
            return log;
        });
    }

    /**
     * Usuwa stare logi (starsze niż podana liczba dni)
     * @param {number} days - Liczba dni
     * @returns {number} Liczba usuniętych wpisów
     */
    static deleteOlderThan(days = 30) {
        const result = db.prepare(`
            DELETE FROM activity_logs
            WHERE created_at < datetime('now', '-' || ? || ' days')
        `).run(days);
        return result.changes;
    }

    /**
     * Pobiera statystyki aktywności z ostatnich dni
     * @param {number} days - Liczba dni
     * @returns {array} Statystyki dzienne
     */
    static getStats(days = 7) {
        return db.prepare(`
            SELECT
                date(created_at) as date,
                action,
                COUNT(*) as count
            FROM activity_logs
            WHERE created_at >= datetime('now', '-' || ? || ' days')
            GROUP BY date(created_at), action
            ORDER BY date DESC
        `).all(days);
    }

    /**
     * Loguje logowanie użytkownika
     * @param {number} userId - ID użytkownika
     * @param {string} ip - Adres IP
     */
    static logLogin(userId, ip) {
        return this.create({
            user_id: userId,
            action: 'login',
            details: { type: 'user_login' },
            ip_address: ip
        });
    }

    /**
     * Loguje uruchomienie gry
     * @param {number} userId - ID użytkownika
     * @param {string} gameVersion - Wersja gry
     * @param {string} ip - Adres IP
     */
    static logGameStart(userId, gameVersion, ip) {
        return this.create({
            user_id: userId,
            action: 'game_start',
            details: { game_version: gameVersion },
            ip_address: ip
        });
    }

    /**
     * Loguje rejestrację użytkownika
     * @param {number} userId - ID użytkownika
     * @param {string} ip - Adres IP
     */
    static logRegistration(userId, ip) {
        return this.create({
            user_id: userId,
            action: 'registration',
            details: { type: 'new_user' },
            ip_address: ip
        });
    }

    /**
     * Loguje akcję administratora
     * @param {string} action - Nazwa akcji
     * @param {object} details - Szczegóły
     * @param {string} ip - Adres IP
     */
    static logAdminAction(action, details, ip) {
        return this.create({
            user_id: null,
            action: `admin_${action}`,
            details,
            ip_address: ip
        });
    }
}

export default ActivityLog;
