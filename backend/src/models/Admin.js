/**
 * Model administratora
 * Obsługuje operacje na tabeli admins
 */
import db from '../config/database.js';
import bcrypt from 'bcryptjs';

class Admin {
    /**
     * Tworzy nowego administratora
     * @param {string} username - Nazwa użytkownika
     * @param {string} password - Hasło
     * @returns {object} Utworzony administrator
     */
    static create(username, password) {
        const hashedPassword = bcrypt.hashSync(password, 12);
        const stmt = db.prepare(`
            INSERT INTO admins (username, password_hash)
            VALUES (?, ?)
        `);

        const result = stmt.run(username, hashedPassword);
        return this.findById(result.lastInsertRowid);
    }

    /**
     * Znajduje administratora po ID
     * @param {number} id - ID administratora
     * @returns {object|null} Administrator lub null
     */
    static findById(id) {
        return db.prepare(`
            SELECT id, username, created_at, last_login
            FROM admins WHERE id = ?
        `).get(id);
    }

    /**
     * Znajduje administratora po nazwie
     * @param {string} username - Nazwa użytkownika
     * @returns {object|null} Administrator lub null
     */
    static findByUsername(username) {
        return db.prepare(`
            SELECT * FROM admins WHERE username = ?
        `).get(username);
    }

    /**
     * Weryfikuje hasło administratora
     * @param {string} username - Nazwa użytkownika
     * @param {string} password - Hasło do weryfikacji
     * @returns {object|null} Administrator jeśli hasło poprawne
     */
    static verifyPassword(username, password) {
        const admin = this.findByUsername(username);
        if (!admin) return null;

        const isValid = bcrypt.compareSync(password, admin.password_hash);
        if (!isValid) return null;

        // Aktualizujemy ostatnie logowanie
        db.prepare(`
            UPDATE admins SET last_login = CURRENT_TIMESTAMP WHERE id = ?
        `).run(admin.id);

        // Zwracamy admina bez hasła
        const { password_hash, ...adminWithoutPassword } = admin;
        return adminWithoutPassword;
    }

    /**
     * Zmienia hasło administratora
     * @param {number} id - ID administratora
     * @param {string} newPassword - Nowe hasło
     * @returns {boolean} Czy operacja się powiodła
     */
    static changePassword(id, newPassword) {
        const hashedPassword = bcrypt.hashSync(newPassword, 12);
        const result = db.prepare(`
            UPDATE admins SET password_hash = ? WHERE id = ?
        `).run(hashedPassword, id);
        return result.changes > 0;
    }

    /**
     * Pobiera listę wszystkich administratorów
     * @returns {array} Lista administratorów
     */
    static getAll() {
        return db.prepare(`
            SELECT id, username, created_at, last_login
            FROM admins ORDER BY created_at ASC
        `).all();
    }

    /**
     * Usuwa administratora
     * @param {number} id - ID administratora
     * @returns {boolean} Czy operacja się powiodła
     */
    static delete(id) {
        // Nie pozwalamy usunąć ostatniego admina
        const count = db.prepare('SELECT COUNT(*) as count FROM admins').get().count;
        if (count <= 1) {
            throw new Error('Nie można usunąć ostatniego administratora');
        }

        const result = db.prepare('DELETE FROM admins WHERE id = ?').run(id);
        return result.changes > 0;
    }
}

export default Admin;
