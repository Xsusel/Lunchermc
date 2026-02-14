/**
 * Model użytkownika (gracza)
 * Obsługuje operacje na tabeli users
 */
import db from '../config/database.js';
import bcrypt from 'bcryptjs';

// NOTE: Column migrations (security_question) have been moved to
// /config/migrations.js (migration 4). They run at startup.

class User {
    /**
     * Tworzy nowego użytkownika
     * @param {string} username - Nazwa użytkownika (nick w grze)
     * @param {string} password - Hasło (będzie zahashowane)
     * @returns {object} Utworzony użytkownik
     */
    static create(username, password) {
        const hashedPassword = bcrypt.hashSync(password, 12);
        const stmt = db.prepare(`
            INSERT INTO users (username, password_hash)
            VALUES (?, ?)
        `);

        const result = stmt.run(username.toLowerCase(), hashedPassword);
        return this.findById(result.lastInsertRowid);
    }

    /**
     * Znajduje użytkownika po ID
     * @param {number} id - ID użytkownika
     * @returns {object|null} Użytkownik lub null
     */
    static findById(id) {
        return db.prepare(`
            SELECT id, username, is_banned, ban_reason, created_at, last_login, total_playtime
            FROM users WHERE id = ?
        `).get(id);
    }

    /**
     * Znajduje użytkownika po nazwie
     * @param {string} username - Nazwa użytkownika
     * @returns {object|null} Użytkownik lub null
     */
    static findByUsername(username) {
        return db.prepare(`
            SELECT * FROM users WHERE username = ?
        `).get(username.toLowerCase());
    }

    /**
     * Weryfikuje hasło użytkownika
     * @param {string} username - Nazwa użytkownika
     * @param {string} password - Hasło do weryfikacji
     * @returns {object|null} Użytkownik jeśli hasło poprawne, null w przeciwnym razie
     */
    static verifyPassword(username, password) {
        const user = this.findByUsername(username);
        if (!user) return null;

        // Sprawdź blokadę konta po zbyt wielu nieudanych próbach
        if (user.locked_until) {
            const lockTime = new Date(user.locked_until);
            if (lockTime > new Date()) {
                return { locked: true, locked_until: user.locked_until };
            }
            // Blokada minęła - resetuj
            db.prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?').run(user.id);
        }

        const isValid = bcrypt.compareSync(password, user.password_hash);
        if (!isValid) {
            const attempts = (user.failed_attempts || 0) + 1;
            const MAX_ATTEMPTS = 5;
            const LOCK_MINUTES = 15;

            if (attempts >= MAX_ATTEMPTS) {
                const lockUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString();
                db.prepare('UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?').run(attempts, lockUntil, user.id);
                return { locked: true, locked_until: lockUntil };
            }
            db.prepare('UPDATE users SET failed_attempts = ? WHERE id = ?').run(attempts, user.id);
            return null;
        }

        // Sukces - resetuj licznik prób
        db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP, failed_attempts = 0, locked_until = NULL WHERE id = ?').run(user.id);

        const { password_hash, ...userWithoutPassword } = user;
        return userWithoutPassword;
    }

    /**
     * Pobiera listę wszystkich użytkowników
     * @param {number} limit - Limit wyników
     * @param {number} offset - Offset dla paginacji
     * @returns {array} Lista użytkowników
     */
    static getAll(limit = 50, offset = 0) {
        // Hard limit zapobiega nadużyciu pamięci
        const safeLimit = Math.min(Math.max(1, parseInt(limit) || 50), 200);
        const safeOffset = Math.max(0, parseInt(offset) || 0);
        return db.prepare(`
            SELECT id, username, is_banned, ban_reason, created_at, last_login, total_playtime
            FROM users
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        `).all(safeLimit, safeOffset);
    }

    /**
     * Pobiera liczbę wszystkich użytkowników
     * @returns {number} Liczba użytkowników
     */
    static count() {
        return db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    }

    /**
     * Banuje użytkownika
     * @param {number} id - ID użytkownika
     * @param {string} reason - Powód bana
     * @returns {boolean} Czy operacja się powiodła
     */
    static ban(id, reason = '') {
        const result = db.prepare(`
            UPDATE users SET is_banned = 1, ban_reason = ? WHERE id = ?
        `).run(reason, id);
        return result.changes > 0;
    }

    /**
     * Odbanowuje użytkownika
     * @param {number} id - ID użytkownika
     * @returns {boolean} Czy operacja się powiodła
     */
    static unban(id) {
        const result = db.prepare(`
            UPDATE users SET is_banned = 0, ban_reason = NULL WHERE id = ?
        `).run(id);
        return result.changes > 0;
    }

    /**
     * Usuwa użytkownika
     * @param {number} id - ID użytkownika
     * @returns {boolean} Czy operacja się powiodła
     */
    static delete(id) {
        const result = db.prepare('DELETE FROM users WHERE id = ?').run(id);
        return result.changes > 0;
    }

    /**
     * Zmienia hasło użytkownika
     * @param {number} id - ID użytkownika
     * @param {string} newPassword - Nowe hasło
     * @returns {boolean} Czy operacja się powiodła
     */
    static changePassword(id, newPassword) {
        const hashedPassword = bcrypt.hashSync(newPassword, 12);
        const result = db.prepare(`
            UPDATE users SET password_hash = ? WHERE id = ?
        `).run(hashedPassword, id);
        return result.changes > 0;
    }

    /**
     * Aktualizuje czas gry użytkownika
     * @param {number} id - ID użytkownika
     * @param {number} minutes - Minuty do dodania
     */
    static addPlaytime(id, minutes) {
        db.prepare(`
            UPDATE users SET total_playtime = total_playtime + ? WHERE id = ?
        `).run(minutes, id);
    }

    /**
     * Sprawdza czy nazwa użytkownika jest dostępna
     * @param {string} username - Nazwa do sprawdzenia
     * @returns {boolean} Czy nazwa jest dostępna
     */
    static isUsernameAvailable(username) {
        const user = db.prepare('SELECT id FROM users WHERE username = ?').get(username.toLowerCase());
        return !user;
    }

    /**
     * Ustawia pytanie bezpieczeństwa i odpowiedź dla użytkownika
     * @param {number} userId - ID użytkownika
     * @param {string} question - Pytanie bezpieczeństwa
     * @param {string} answer - Odpowiedź (będzie zahashowana)
     * @returns {boolean} Czy operacja się powiodła
     */
    static setSecurityQuestion(userId, question, answer) {
        const answerHash = bcrypt.hashSync(answer.toLowerCase().trim(), 12);
        const result = db.prepare(`
            UPDATE users SET security_question = ?, security_answer_hash = ? WHERE id = ?
        `).run(question, answerHash, userId);
        return result.changes > 0;
    }

    /**
     * Weryfikuje odpowiedź na pytanie bezpieczeństwa
     * @param {string} username - Nazwa użytkownika
     * @param {string} answer - Odpowiedź do weryfikacji
     * @returns {boolean} Czy odpowiedź jest poprawna
     */
    static verifySecurityAnswer(username, answer) {
        const user = db.prepare(`
            SELECT security_answer_hash FROM users WHERE username = ?
        `).get(username.toLowerCase());

        if (!user || !user.security_answer_hash) return false;

        return bcrypt.compareSync(answer.toLowerCase().trim(), user.security_answer_hash);
    }

    /**
     * Resetuje hasło użytkownika (po weryfikacji pytania bezpieczeństwa)
     * @param {string} username - Nazwa użytkownika
     * @param {string} newPassword - Nowe hasło
     * @returns {boolean} Czy operacja się powiodła
     */
    static resetPassword(username, newPassword) {
        const hashedPassword = bcrypt.hashSync(newPassword, 12);
        const result = db.prepare(`
            UPDATE users SET password_hash = ? WHERE username = ?
        `).run(hashedPassword, username.toLowerCase());
        return result.changes > 0;
    }

    /**
     * Pobiera pytanie bezpieczeństwa użytkownika
     * @param {string} username - Nazwa użytkownika
     * @returns {string|null} Pytanie bezpieczeństwa lub null
     */
    static getSecurityQuestion(username) {
        const user = db.prepare(`
            SELECT security_question FROM users WHERE username = ?
        `).get(username.toLowerCase());

        if (!user || !user.security_question) return null;
        return user.security_question;
    }
}

export default User;
