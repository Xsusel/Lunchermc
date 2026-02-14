/**
 * Model moda
 * Obsługuje operacje na tabeli mods
 */
import db from '../config/database.js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

class Mod {
    /**
     * Tworzy nowy wpis moda
     * @param {object} modData - Dane moda
     * @returns {object} Utworzony mod
     */
    static create(modData) {
        const stmt = db.prepare(`
            INSERT INTO mods (name, filename, url, sha256, file_size, is_required, is_enabled, mod_type, description, curseforge_id, curseforge_file_id, curseforge_url)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const result = stmt.run(
            modData.name,
            modData.filename,
            modData.url || null,
            modData.sha256,
            modData.file_size || 0,
            modData.is_required !== false ? 1 : 0,
            modData.is_enabled !== false ? 1 : 0,
            modData.mod_type || 'mod',
            modData.description || null,
            modData.curseforge_id || null,
            modData.curseforge_file_id || null,
            modData.curseforge_url || null
        );

        return this.findById(result.lastInsertRowid);
    }

    /**
     * Znajduje mod po ID
     * @param {number} id - ID moda
     * @returns {object|null} Mod lub null
     */
    static findById(id) {
        return db.prepare('SELECT * FROM mods WHERE id = ?').get(id);
    }

    /**
     * Znajduje mod po nazwie pliku
     * @param {string} filename - Nazwa pliku
     * @returns {object|null} Mod lub null
     */
    static findByFilename(filename) {
        return db.prepare('SELECT * FROM mods WHERE filename = ?').get(filename);
    }

    /**
     * Pobiera wszystkie mody
     * @param {boolean} onlyEnabled - Czy pobierać tylko włączone mody
     * @returns {array} Lista modów
     */
    static getAll(onlyEnabled = false) {
        if (onlyEnabled) {
            return db.prepare(`
                SELECT * FROM mods WHERE is_enabled = 1 ORDER BY name ASC
            `).all();
        }
        return db.prepare('SELECT * FROM mods ORDER BY name ASC').all();
    }

    /**
     * Pobiera mody dla launchera (tylko niezbędne dane)
     * @returns {array} Lista modów z danymi potrzebnymi do pobrania
     */
    static getForLauncher() {
        return db.prepare(`
            SELECT id, name, filename, url, sha256, file_size, is_required, mod_type
            FROM mods
            WHERE is_enabled = 1
            ORDER BY is_required DESC, name ASC
        `).all().map(mod => ({
            id: mod.id,
            name: mod.name,
            filename: mod.filename,
            url: mod.url,
            sha256: mod.sha256,
            fileSize: mod.file_size,
            required: !!mod.is_required,
            type: mod.mod_type
        }));
    }

    /**
     * Aktualizuje mod
     * @param {number} id - ID moda
     * @param {object} data - Dane do aktualizacji
     * @returns {object|null} Zaktualizowany mod
     */
    static update(id, data) {
        const allowedFields = [
            'name', 'filename', 'url', 'sha256', 'file_size',
            'is_required', 'is_enabled', 'mod_type', 'description',
            'curseforge_id', 'curseforge_file_id', 'curseforge_url'
        ];

        const updates = [];
        const values = [];

        for (const [key, value] of Object.entries(data)) {
            if (allowedFields.includes(key)) {
                updates.push(`${key} = ?`);
                // Konwertujemy boolean na int dla SQLite
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

        updates.push('updated_at = CURRENT_TIMESTAMP');
        values.push(id);

        const sql = `UPDATE mods SET ${updates.join(', ')} WHERE id = ?`;
        db.prepare(sql).run(...values);

        return this.findById(id);
    }

    /**
     * Włącza/wyłącza mod
     * @param {number} id - ID moda
     * @param {boolean} enabled - Czy włączyć
     * @returns {boolean} Czy operacja się powiodła
     */
    static setEnabled(id, enabled) {
        const result = db.prepare(`
            UPDATE mods SET is_enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).run(enabled ? 1 : 0, id);
        return result.changes > 0;
    }

    /**
     * Usuwa mod
     * @param {number} id - ID moda
     * @returns {boolean} Czy operacja się powiodła
     */
    static delete(id) {
        const result = db.prepare('DELETE FROM mods WHERE id = ?').run(id);
        return result.changes > 0;
    }

    /**
     * Oblicza sumę kontrolną SHA256 pliku
     * @param {string} filePath - Ścieżka do pliku
     * @returns {Promise<string>} Suma kontrolna
     */
    static async calculateSHA256(filePath) {
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash('sha256');
            const stream = fs.createReadStream(filePath);

            stream.on('data', data => hash.update(data));
            stream.on('end', () => resolve(hash.digest('hex')));
            stream.on('error', reject);
        });
    }

    /**
     * Pobiera statystyki modów
     * @returns {object} Statystyki
     */
    static getStats() {
        const total = db.prepare('SELECT COUNT(*) as count FROM mods').get().count;
        const enabled = db.prepare('SELECT COUNT(*) as count FROM mods WHERE is_enabled = 1').get().count;
        const required = db.prepare('SELECT COUNT(*) as count FROM mods WHERE is_required = 1').get().count;
        const totalSize = db.prepare('SELECT SUM(file_size) as size FROM mods WHERE is_enabled = 1').get().size || 0;

        return { total, enabled, required, totalSize };
    }

    /**
     * Pobiera liczbę modów
     * @returns {number} Liczba modów
     */
    static count() {
        return db.prepare('SELECT COUNT(*) as count FROM mods').get().count;
    }
}

export default Mod;
