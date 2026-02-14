/**
 * Model skinów graczy (non-premium)
 * Obsługuje upload, przechowywanie i pobieranie skinów oraz peleryn
 */
import db from '../config/database.js';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class Skin {
    /**
     * Inicjalizuje tabelę skinów w bazie danych
     */
    static init() {
        db.exec(`
            CREATE TABLE IF NOT EXISTS skins (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER UNIQUE NOT NULL,
                filename TEXT NOT NULL,
                sha256 TEXT NOT NULL,
                skin_type TEXT DEFAULT 'classic',
                cape_filename TEXT,
                cape_sha256 TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_skins_user ON skins(user_id)`);
    }

    /**
     * Pobiera skin po ID użytkownika
     * @param {number} userId - ID użytkownika
     * @returns {object|null} Dane skina lub null
     */
    static getByUserId(userId) {
        return db.prepare(`
            SELECT s.*, u.username
            FROM skins s
            JOIN users u ON u.id = s.user_id
            WHERE s.user_id = ?
        `).get(userId);
    }

    /**
     * Pobiera skin po nazwie użytkownika
     * @param {string} username - Nazwa użytkownika
     * @returns {object|null} Dane skina lub null
     */
    static getByUsername(username) {
        return db.prepare(`
            SELECT s.*, u.username
            FROM skins s
            JOIN users u ON u.id = s.user_id
            WHERE u.username = ?
        `).get(username.toLowerCase());
    }

    /**
     * Uploaduje lub aktualizuje skin gracza
     * @param {number} userId - ID użytkownika
     * @param {string} filename - Nazwa pliku skina
     * @param {string} sha256 - Suma kontrolna SHA256
     * @param {string} skinType - Typ skina ('classic' lub 'slim')
     * @returns {object} Utworzony/zaktualizowany rekord skina
     */
    static upload(userId, filename, sha256, skinType = 'classic') {
        const existing = this.getByUserId(userId);

        if (existing) {
            // Usuwamy stary plik skina
            const oldPath = path.join(this.getSkinsPath(), existing.filename);
            if (fs.existsSync(oldPath)) {
                fs.unlinkSync(oldPath);
            }

            db.prepare(`
                UPDATE skins
                SET filename = ?, sha256 = ?, skin_type = ?, updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ?
            `).run(filename, sha256, skinType, userId);
        } else {
            db.prepare(`
                INSERT INTO skins (user_id, filename, sha256, skin_type)
                VALUES (?, ?, ?, ?)
            `).run(userId, filename, sha256, skinType);
        }

        return this.getByUserId(userId);
    }

    /**
     * Uploaduje lub aktualizuje pelerynę gracza
     * @param {number} userId - ID użytkownika
     * @param {string} capeFilename - Nazwa pliku peleryny
     * @param {string} capeSha256 - Suma kontrolna SHA256
     * @returns {object} Zaktualizowany rekord skina
     */
    static uploadCape(userId, capeFilename, capeSha256) {
        const existing = this.getByUserId(userId);

        if (!existing) {
            // Gracz musi mieć skin aby miec peleryne - tworzymy wpis z domyslnym skinem
            db.prepare(`
                INSERT INTO skins (user_id, filename, sha256, skin_type, cape_filename, cape_sha256)
                VALUES (?, 'default_steve.png', '', 'classic', ?, ?)
            `).run(userId, capeFilename, capeSha256);
        } else {
            // Usuwamy stary plik peleryny
            if (existing.cape_filename) {
                const oldCapePath = path.join(this.getCapesPath(), existing.cape_filename);
                if (fs.existsSync(oldCapePath)) {
                    fs.unlinkSync(oldCapePath);
                }
            }

            db.prepare(`
                UPDATE skins
                SET cape_filename = ?, cape_sha256 = ?, updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ?
            `).run(capeFilename, capeSha256, userId);
        }

        return this.getByUserId(userId);
    }

    /**
     * Usuwa skin gracza (przywraca domyslny)
     * @param {number} userId - ID użytkownika
     * @returns {boolean} Czy usunięto
     */
    static delete(userId) {
        const existing = this.getByUserId(userId);
        if (!existing) return false;

        // Usuwamy plik skina
        const skinPath = path.join(this.getSkinsPath(), existing.filename);
        if (fs.existsSync(skinPath)) {
            fs.unlinkSync(skinPath);
        }

        // Usuwamy plik peleryny jesli istnieje
        if (existing.cape_filename) {
            const capePath = path.join(this.getCapesPath(), existing.cape_filename);
            if (fs.existsSync(capePath)) {
                fs.unlinkSync(capePath);
            }
        }

        db.prepare('DELETE FROM skins WHERE user_id = ?').run(userId);
        return true;
    }

    /**
     * Usuwa peleryne gracza
     * @param {number} userId - ID użytkownika
     * @returns {boolean} Czy usunięto
     */
    static deleteCape(userId) {
        const existing = this.getByUserId(userId);
        if (!existing || !existing.cape_filename) return false;

        // Usuwamy plik peleryny
        const capePath = path.join(this.getCapesPath(), existing.cape_filename);
        if (fs.existsSync(capePath)) {
            fs.unlinkSync(capePath);
        }

        db.prepare(`
            UPDATE skins
            SET cape_filename = NULL, cape_sha256 = NULL, updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ?
        `).run(userId);

        return true;
    }

    /**
     * Zwraca informacje o domyslnym skinie (Steve/Alex)
     * @returns {object} Domyslne dane skina
     */
    static getDefault() {
        return {
            filename: null,
            skin_type: 'classic',
            is_default: true,
            cape_filename: null
        };
    }

    /**
     * Pobiera listę wszystkich skinów (dla admina)
     * @param {number} limit - Limit wynikow
     * @param {number} offset - Offset
     * @returns {object} Lista skinów z paginacją
     */
    static getAll(limit = 50, offset = 0) {
        const skins = db.prepare(`
            SELECT s.*, u.username
            FROM skins s
            JOIN users u ON u.id = s.user_id
            ORDER BY s.updated_at DESC
            LIMIT ? OFFSET ?
        `).all(limit, offset);

        const total = this.count();

        return {
            skins,
            total,
            page: Math.floor(offset / limit) + 1,
            pages: Math.ceil(total / limit)
        };
    }

    /**
     * Zlicza wszystkie skiny
     * @returns {number} Liczba skinów
     */
    static count() {
        return db.prepare('SELECT COUNT(*) as count FROM skins').get().count;
    }

    /**
     * Scieżka do katalogu skinow
     * @returns {string} Scieżka absolutna
     */
    static getSkinsPath() {
        return path.join(__dirname, '../../uploads/skins');
    }

    /**
     * Scieżka do katalogu peleryn
     * @returns {string} Scieżka absolutna
     */
    static getCapesPath() {
        return path.join(__dirname, '../../uploads/capes');
    }
}

Skin.init();
export default Skin;
