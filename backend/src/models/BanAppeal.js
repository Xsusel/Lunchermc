/**
 * Model apeli od banow
 * Tabela: ban_appeals_v2 (id, user_id, reason, status, admin_response, created_at, updated_at)
 * Metody: create, getAll, getByUserId, updateStatus
 */
import db from '../config/database.js';

// Statusy apeli
const AppealStatus = {
    PENDING: 'pending',
    APPROVED: 'approved',
    REJECTED: 'rejected'
};

class BanAppeal {
    static AppealStatus = AppealStatus;

    /**
     * Tworzy nowy apel
     * @param {object} data - Dane apelu
     * @param {number} data.userId - ID uzytkownika skladajacego apel
     * @param {string} data.reason - Powod apelu / uzasadnienie
     * @returns {object} Utworzony apel
     */
    static create({ userId, reason }) {
        // Sprawdz czy uzytkownik jest rzeczywiscie zbanowany
        const user = db.prepare('SELECT id, is_banned, username FROM users WHERE id = ?').get(userId);
        if (!user) {
            throw new Error('Uzytkownik nie istnieje');
        }
        if (!user.is_banned) {
            throw new Error('Uzytkownik nie jest zbanowany');
        }

        // Sprawdz czy nie ma juz oczekujacego apelu
        const existingAppeal = db.prepare(`
            SELECT id FROM ban_appeals_v2
            WHERE user_id = ? AND status = 'pending'
        `).get(userId);

        if (existingAppeal) {
            throw new Error('Istnieje juz oczekujacy apel. Poczekaj na rozpatrzenie.');
        }

        const stmt = db.prepare(`
            INSERT INTO ban_appeals_v2 (user_id, reason, status, created_at, updated_at)
            VALUES (?, ?, 'pending', datetime('now'), datetime('now'))
        `);

        const result = stmt.run(userId, reason);
        return this.findById(result.lastInsertRowid);
    }

    /**
     * Znajduje apel po ID
     * @param {number} id - ID apelu
     * @returns {object|null} Apel lub null
     */
    static findById(id) {
        return db.prepare(`
            SELECT ba.*, u.username
            FROM ban_appeals_v2 ba
            LEFT JOIN users u ON ba.user_id = u.id
            WHERE ba.id = ?
        `).get(id);
    }

    /**
     * Pobiera wszystkie apele z opcjonalnym filtrowaniem
     * @param {object} options - Opcje filtrowania
     * @returns {object} { appeals, total }
     */
    static getAll(options = {}) {
        const {
            limit = 50,
            offset = 0,
            status = null
        } = options;

        let whereClause = '';
        const params = [];

        if (status) {
            whereClause = 'WHERE ba.status = ?';
            params.push(status);
        }

        const { total } = db.prepare(`
            SELECT COUNT(*) as total FROM ban_appeals_v2 ba ${whereClause}
        `).get(...params);

        params.push(limit, offset);
        const appeals = db.prepare(`
            SELECT ba.*, u.username, u.is_banned, u.ban_reason
            FROM ban_appeals_v2 ba
            LEFT JOIN users u ON ba.user_id = u.id
            ${whereClause}
            ORDER BY
                CASE ba.status WHEN 'pending' THEN 0 ELSE 1 END,
                ba.created_at DESC
            LIMIT ? OFFSET ?
        `).all(...params);

        return { appeals, total };
    }

    /**
     * Pobiera apele danego uzytkownika
     * @param {number} userId - ID uzytkownika
     * @returns {array} Lista apeli
     */
    static getByUserId(userId) {
        return db.prepare(`
            SELECT ba.*, u.username
            FROM ban_appeals_v2 ba
            LEFT JOIN users u ON ba.user_id = u.id
            WHERE ba.user_id = ?
            ORDER BY ba.created_at DESC
        `).all(userId);
    }

    /**
     * Aktualizuje status apelu (approved/rejected)
     * @param {number} id - ID apelu
     * @param {string} status - Nowy status (approved/rejected)
     * @param {string} adminResponse - Odpowiedz administratora
     * @returns {object|null} Zaktualizowany apel lub null
     */
    static updateStatus(id, status, adminResponse = '') {
        if (!Object.values(AppealStatus).includes(status)) {
            throw new Error('Nieprawidlowy status apelu');
        }
        if (status === AppealStatus.PENDING) {
            throw new Error('Nie mozna ustawic statusu na pending');
        }

        const appeal = this.findById(id);
        if (!appeal) {
            throw new Error('Apel nie istnieje');
        }

        if (appeal.status !== AppealStatus.PENDING) {
            throw new Error('Apel zostal juz rozpatrzony');
        }

        db.prepare(`
            UPDATE ban_appeals_v2
            SET status = ?, admin_response = ?, updated_at = datetime('now')
            WHERE id = ?
        `).run(status, adminResponse, id);

        // Jesli zaakceptowano - odbanuj uzytkownika
        if (status === AppealStatus.APPROVED && appeal.user_id) {
            db.prepare(`
                UPDATE users SET is_banned = 0, ban_reason = NULL WHERE id = ?
            `).run(appeal.user_id);

            // Dezaktywuj aktywne bany uzytkownika w tabeli bans (jesli istnieje)
            try {
                db.prepare(`
                    UPDATE bans
                    SET is_active = 0, unbanned_at = datetime('now'), unban_reason = ?
                    WHERE user_id = ? AND is_active = 1
                `).run('Apel zaakceptowany: ' + adminResponse, appeal.user_id);
            } catch {
                // Ignoruj jesli tabela bans nie istnieje lub inny blad
            }
        }

        return this.findById(id);
    }
}

export default BanAppeal;
