/**
 * Model zaplanowanego maintenance
 * Obsługuje planowanie i automatyczne włączanie maintenance
 */
import db from '../config/database.js';
import GameConfig from './GameConfig.js';

// Upewnij się że tabela istnieje
db.exec(`
    CREATE TABLE IF NOT EXISTS scheduled_maintenance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        message TEXT,
        start_time DATETIME NOT NULL,
        end_time DATETIME NOT NULL,
        is_active INTEGER DEFAULT 1,
        auto_enable INTEGER DEFAULT 1,
        notify_before_minutes INTEGER DEFAULT 30,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_by TEXT
    )
`);

// Dodaj indeks
db.exec(`
    CREATE INDEX IF NOT EXISTS idx_scheduled_maintenance_times
    ON scheduled_maintenance(start_time, end_time, is_active)
`);

class ScheduledMaintenance {
    /**
     * Tworzy nowe zaplanowane maintenance
     */
    static create(data) {
        const {
            title,
            message = '',
            startTime,
            endTime,
            autoEnable = true,
            notifyBeforeMinutes = 30,
            createdBy = null
        } = data;

        const stmt = db.prepare(`
            INSERT INTO scheduled_maintenance
            (title, message, start_time, end_time, auto_enable, notify_before_minutes, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        const result = stmt.run(
            title,
            message,
            startTime,
            endTime,
            autoEnable ? 1 : 0,
            notifyBeforeMinutes,
            createdBy
        );

        return this.findById(result.lastInsertRowid);
    }

    /**
     * Znajduje maintenance po ID
     */
    static findById(id) {
        return db.prepare(`
            SELECT * FROM scheduled_maintenance WHERE id = ?
        `).get(id);
    }

    /**
     * Pobiera wszystkie zaplanowane maintenance (aktywne)
     */
    static getAll(includeInactive = false) {
        const query = includeInactive
            ? 'SELECT * FROM scheduled_maintenance ORDER BY start_time ASC'
            : 'SELECT * FROM scheduled_maintenance WHERE is_active = 1 ORDER BY start_time ASC';
        return db.prepare(query).all();
    }

    /**
     * Pobiera nadchodzące maintenance (w ciągu podanej liczby dni)
     */
    static getUpcoming(days = 7) {
        return db.prepare(`
            SELECT * FROM scheduled_maintenance
            WHERE is_active = 1
            AND start_time > datetime('now')
            AND start_time < datetime('now', '+' || ? || ' days')
            ORDER BY start_time ASC
        `).all(days);
    }

    /**
     * Pobiera aktualnie trwające maintenance
     */
    static getCurrentMaintenance() {
        return db.prepare(`
            SELECT * FROM scheduled_maintenance
            WHERE is_active = 1
            AND start_time <= datetime('now')
            AND end_time >= datetime('now')
            ORDER BY start_time ASC
            LIMIT 1
        `).get();
    }

    /**
     * Sprawdza czy nadchodzi maintenance (w ciągu podanych minut)
     */
    static getApproachingMaintenance(withinMinutes = 30) {
        return db.prepare(`
            SELECT * FROM scheduled_maintenance
            WHERE is_active = 1
            AND start_time > datetime('now')
            AND start_time <= datetime('now', '+' || ? || ' minutes')
            ORDER BY start_time ASC
        `).all(withinMinutes);
    }

    /**
     * Aktualizuje maintenance
     */
    static update(id, data) {
        const allowedFields = [
            'title', 'message', 'start_time', 'end_time',
            'is_active', 'auto_enable', 'notify_before_minutes'
        ];

        const updates = [];
        const values = [];

        for (const [key, value] of Object.entries(data)) {
            const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase(); // camelCase to snake_case
            if (allowedFields.includes(dbKey)) {
                updates.push(`${dbKey} = ?`);
                values.push(typeof value === 'boolean' ? (value ? 1 : 0) : value);
            }
        }

        if (updates.length === 0) return this.findById(id);

        values.push(id);
        db.prepare(`
            UPDATE scheduled_maintenance
            SET ${updates.join(', ')}
            WHERE id = ?
        `).run(...values);

        return this.findById(id);
    }

    /**
     * Usuwa maintenance
     */
    static delete(id) {
        const result = db.prepare('DELETE FROM scheduled_maintenance WHERE id = ?').run(id);
        return result.changes > 0;
    }

    /**
     * Dezaktywuje maintenance (soft delete)
     */
    static deactivate(id) {
        db.prepare('UPDATE scheduled_maintenance SET is_active = 0 WHERE id = ?').run(id);
        return this.findById(id);
    }

    /**
     * Sprawdza i automatycznie włącza/wyłącza maintenance
     * Wywoływana przez scheduler
     */
    static checkAndApplyMaintenance() {
        const currentMaintenance = this.getCurrentMaintenance();
        const config = GameConfig.get();

        if (currentMaintenance && currentMaintenance.auto_enable) {
            // Powinno być włączone
            if (!config.maintenance_mode) {
                GameConfig.setMaintenanceMode(true, currentMaintenance.message || currentMaintenance.title);
                console.log(`[Maintenance] Automatycznie włączono: ${currentMaintenance.title}`);
                return { action: 'enabled', maintenance: currentMaintenance };
            }
        } else {
            // Sprawdź czy maintenance właśnie się skończyło
            const recentlyEnded = db.prepare(`
                SELECT * FROM scheduled_maintenance
                WHERE is_active = 1
                AND auto_enable = 1
                AND end_time > datetime('now', '-5 minutes')
                AND end_time <= datetime('now')
                ORDER BY end_time DESC
                LIMIT 1
            `).get();

            if (recentlyEnded && config.maintenance_mode) {
                GameConfig.setMaintenanceMode(false, null);
                console.log(`[Maintenance] Automatycznie wyłączono: ${recentlyEnded.title}`);
                return { action: 'disabled', maintenance: recentlyEnded };
            }
        }

        return { action: 'none' };
    }

    /**
     * Pobiera maintenance wymagające powiadomienia
     * (które zaczynają się w ciągu notify_before_minutes i jeszcze nie powiadomiono)
     */
    static getMaintenanceNeedingNotification() {
        return db.prepare(`
            SELECT * FROM scheduled_maintenance
            WHERE is_active = 1
            AND start_time > datetime('now')
            AND start_time <= datetime('now', '+' || notify_before_minutes || ' minutes')
            ORDER BY start_time ASC
        `).all();
    }

    /**
     * Pobiera następne maintenance (do wyświetlenia użytkownikom)
     */
    static getNextMaintenance() {
        return db.prepare(`
            SELECT * FROM scheduled_maintenance
            WHERE is_active = 1
            AND start_time > datetime('now')
            ORDER BY start_time ASC
            LIMIT 1
        `).get();
    }

    /**
     * Pobiera historię maintenance (przeszłe)
     */
    static getHistory(limit = 10) {
        return db.prepare(`
            SELECT * FROM scheduled_maintenance
            WHERE end_time < datetime('now')
            ORDER BY end_time DESC
            LIMIT ?
        `).all(limit);
    }
}

export default ScheduledMaintenance;
