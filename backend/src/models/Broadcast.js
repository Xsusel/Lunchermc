/**
 * Model powiadomień (broadcast)
 * Obsługuje komunikaty wyświetlane w launcherze
 */
import db from '../config/database.js';

class Broadcast {
    /**
     * Tworzy nowe powiadomienie
     * @param {object} data - Dane powiadomienia
     * @returns {object} Utworzone powiadomienie
     */
    static create(data) {
        const stmt = db.prepare(`
            INSERT INTO broadcasts (title, message, type, is_active, priority, expires_at)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        const result = stmt.run(
            data.title,
            data.message,
            data.type || 'info',
            data.is_active !== false ? 1 : 0,
            data.priority || 0,
            data.expires_at || null
        );

        return this.findById(result.lastInsertRowid);
    }

    /**
     * Znajduje powiadomienie po ID
     * @param {number} id - ID powiadomienia
     * @returns {object|null} Powiadomienie lub null
     */
    static findById(id) {
        return db.prepare('SELECT * FROM broadcasts WHERE id = ?').get(id);
    }

    /**
     * Pobiera wszystkie powiadomienia
     * @returns {array} Lista powiadomień
     */
    static getAll() {
        return db.prepare(`
            SELECT * FROM broadcasts ORDER BY priority DESC, created_at DESC
        `).all();
    }

    /**
     * Pobiera aktywne powiadomienia (dla launchera)
     * @returns {array} Lista aktywnych powiadomień
     */
    static getActive() {
        return db.prepare(`
            SELECT id, title, message, type, priority, created_at
            FROM broadcasts
            WHERE is_active = 1
            AND (expires_at IS NULL OR expires_at > datetime('now'))
            ORDER BY priority DESC, created_at DESC
        `).all().map(broadcast => ({
            id: broadcast.id,
            title: broadcast.title,
            message: broadcast.message,
            type: broadcast.type,
            priority: broadcast.priority,
            createdAt: broadcast.created_at
        }));
    }

    /**
     * Aktualizuje powiadomienie
     * @param {number} id - ID powiadomienia
     * @param {object} data - Dane do aktualizacji
     * @returns {object|null} Zaktualizowane powiadomienie
     */
    static update(id, data) {
        const allowedFields = ['title', 'message', 'type', 'is_active', 'priority', 'expires_at'];
        const updates = [];
        const values = [];

        for (const [key, value] of Object.entries(data)) {
            if (allowedFields.includes(key)) {
                updates.push(`${key} = ?`);
                if (typeof value === 'boolean') {
                    values.push(value ? 1 : 0);
                } else {
                    values.push(value);
                }
            }
        }

        if (updates.length === 0) {
            return this.findById(id);
        }

        values.push(id);
        const sql = `UPDATE broadcasts SET ${updates.join(', ')} WHERE id = ?`;
        db.prepare(sql).run(...values);

        return this.findById(id);
    }

    /**
     * Włącza/wyłącza powiadomienie
     * @param {number} id - ID powiadomienia
     * @param {boolean} active - Czy aktywne
     * @returns {boolean} Czy operacja się powiodła
     */
    static setActive(id, active) {
        const result = db.prepare(`
            UPDATE broadcasts SET is_active = ? WHERE id = ?
        `).run(active ? 1 : 0, id);
        return result.changes > 0;
    }

    /**
     * Usuwa powiadomienie
     * @param {number} id - ID powiadomienia
     * @returns {boolean} Czy operacja się powiodła
     */
    static delete(id) {
        const result = db.prepare('DELETE FROM broadcasts WHERE id = ?').run(id);
        return result.changes > 0;
    }

    /**
     * Usuwa wygasłe powiadomienia
     * @returns {number} Liczba usuniętych powiadomień
     */
    static deleteExpired() {
        const result = db.prepare(`
            DELETE FROM broadcasts
            WHERE expires_at IS NOT NULL AND expires_at < datetime('now')
        `).run();
        return result.changes;
    }

    /**
     * Dezaktywuje wszystkie powiadomienia
     * @returns {number} Liczba zmienionych powiadomień
     */
    static deactivateAll() {
        const result = db.prepare('UPDATE broadcasts SET is_active = 0').run();
        return result.changes;
    }
}

export default Broadcast;
