/**
 * Model wersji launchera
 * Obsługuje auto-aktualizacje launchera
 */
import db from '../config/database.js';

class LauncherVersion {
    /**
     * Tworzy nowy wpis wersji launchera
     * @param {object} data - Dane wersji
     * @returns {object} Utworzona wersja
     */
    static create(data) {
        const stmt = db.prepare(`
            INSERT INTO launcher_versions (version, download_url, sha256, sha512, file_size, filename, changelog, is_required)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const result = stmt.run(
            data.version,
            data.download_url,
            data.sha256,
            data.sha512 || null,
            data.file_size || null,
            data.filename || null,
            data.changelog || null,
            data.is_required ? 1 : 0
        );

        return this.findById(result.lastInsertRowid);
    }

    /**
     * Znajduje wersję po ID
     * @param {number} id - ID wersji
     * @returns {object|null} Wersja lub null
     */
    static findById(id) {
        return db.prepare('SELECT * FROM launcher_versions WHERE id = ?').get(id);
    }

    /**
     * Znajduje wersję po numerze wersji
     * @param {string} version - Numer wersji
     * @returns {object|null} Wersja lub null
     */
    static findByVersion(version) {
        return db.prepare('SELECT * FROM launcher_versions WHERE version = ?').get(version);
    }

    /**
     * Pobiera najnowszą wersję launchera
     * @returns {object|null} Najnowsza wersja
     */
    static getLatest() {
        return db.prepare(`
            SELECT * FROM launcher_versions
            ORDER BY created_at DESC
            LIMIT 1
        `).get();
    }

    /**
     * Pobiera informacje o aktualizacji dla launchera
     * @param {string} currentVersion - Aktualna wersja klienta
     * @returns {object} Informacje o aktualizacji
     */
    static checkForUpdate(currentVersion) {
        const latest = this.getLatest();

        if (!latest) {
            return {
                updateAvailable: false,
                currentVersion,
                latestVersion: currentVersion
            };
        }

        // Porównujemy wersje (zakładamy format semver: x.y.z)
        const isNewer = this.compareVersions(latest.version, currentVersion) > 0;

        return {
            updateAvailable: isNewer,
            currentVersion,
            latestVersion: latest.version,
            downloadUrl: isNewer ? latest.download_url : null,
            sha256: isNewer ? latest.sha256 : null,
            changelog: isNewer ? latest.changelog : null,
            isRequired: isNewer ? !!latest.is_required : false
        };
    }

    /**
     * Porównuje dwie wersje semver
     * @param {string} v1 - Pierwsza wersja
     * @param {string} v2 - Druga wersja
     * @returns {number} 1 jeśli v1 > v2, -1 jeśli v1 < v2, 0 jeśli równe
     */
    static compareVersions(v1, v2) {
        const parts1 = v1.split('.').map(Number);
        const parts2 = v2.split('.').map(Number);

        for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
            const num1 = parts1[i] || 0;
            const num2 = parts2[i] || 0;

            if (num1 > num2) return 1;
            if (num1 < num2) return -1;
        }

        return 0;
    }

    /**
     * Pobiera wszystkie wersje
     * @returns {array} Lista wersji
     */
    static getAll() {
        return db.prepare(`
            SELECT * FROM launcher_versions
            ORDER BY created_at DESC
        `).all();
    }

    /**
     * Aktualizuje wersję
     * @param {number} id - ID wersji
     * @param {object} data - Dane do aktualizacji
     * @returns {object|null} Zaktualizowana wersja
     */
    static update(id, data) {
        const allowedFields = ['download_url', 'sha256', 'sha512', 'file_size', 'filename', 'changelog', 'is_required'];
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
        const sql = `UPDATE launcher_versions SET ${updates.join(', ')} WHERE id = ?`;
        db.prepare(sql).run(...values);

        return this.findById(id);
    }

    /**
     * Usuwa wersję
     * @param {number} id - ID wersji
     * @returns {boolean} Czy operacja się powiodła
     */
    static delete(id) {
        const result = db.prepare('DELETE FROM launcher_versions WHERE id = ?').run(id);
        return result.changes > 0;
    }
}

export default LauncherVersion;
