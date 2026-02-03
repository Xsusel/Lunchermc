/**
 * Model konfiguracji gry
 * Obsługuje ustawienia wersji, serwera i parametrów JVM
 */
import db from '../config/database.js';

class GameConfig {
    /**
     * Pobiera aktualną konfigurację gry
     * @returns {object} Konfiguracja gry
     */
    static get() {
        let config = db.prepare('SELECT * FROM game_config WHERE id = 1').get();

        // Jeśli nie ma konfiguracji, tworzymy domyślną
        if (!config) {
            db.prepare(`
                INSERT INTO game_config (id, game_version, server_ip, server_port, java_args)
                VALUES (1, '1.20.1', 'localhost', 25565, '-Xmx4G -Xms2G -XX:+UseG1GC')
            `).run();
            config = db.prepare('SELECT * FROM game_config WHERE id = 1').get();
        }

        return config;
    }

    /**
     * Aktualizuje konfigurację gry
     * @param {object} data - Dane do aktualizacji
     * @returns {object} Zaktualizowana konfiguracja
     */
    static update(data) {
        const allowedFields = [
            'game_version',
            'forge_version',
            'fabric_version',
            'loader_type',
            'java_args',
            'server_ip',
            'server_port',
            'maintenance_mode',
            'maintenance_message'
        ];

        // Filtrujemy tylko dozwolone pola
        const updates = [];
        const values = [];

        for (const [key, value] of Object.entries(data)) {
            if (allowedFields.includes(key)) {
                // Sanityzacja wartości - SQLite akceptuje tylko: number, string, bigint, buffer, null
                let sanitizedValue = value;

                // Konwertuj undefined na null
                if (sanitizedValue === undefined) {
                    sanitizedValue = null;
                }
                // Konwertuj obiekty na null (nie powinny być wysyłane)
                else if (typeof sanitizedValue === 'object' && sanitizedValue !== null && !Buffer.isBuffer(sanitizedValue)) {
                    sanitizedValue = null;
                }
                // Konwertuj boolean na number dla SQLite
                else if (typeof sanitizedValue === 'boolean') {
                    sanitizedValue = sanitizedValue ? 1 : 0;
                }
                // Upewnij się że server_port jest liczbą
                else if (key === 'server_port' && typeof sanitizedValue === 'string') {
                    sanitizedValue = parseInt(sanitizedValue, 10) || 25565;
                }

                updates.push(`${key} = ?`);
                values.push(sanitizedValue);
            }
        }

        if (updates.length === 0) {
            return this.get();
        }

        // Dodajemy aktualizację timestampa
        updates.push('updated_at = CURRENT_TIMESTAMP');

        const sql = `UPDATE game_config SET ${updates.join(', ')} WHERE id = 1`;
        db.prepare(sql).run(...values);

        return this.get();
    }

    /**
     * Pobiera konfigurację dla launchera (publiczne dane)
     * @returns {object} Konfiguracja dla launchera
     */
    static getPublicConfig() {
        const config = this.get();
        return {
            gameVersion: config.game_version,
            forgeVersion: config.forge_version,
            fabricVersion: config.fabric_version,
            loaderType: config.loader_type,
            javaArgs: config.java_args,
            serverIp: config.server_ip,
            serverPort: config.server_port,
            maintenanceMode: !!config.maintenance_mode,
            maintenanceMessage: config.maintenance_message,
            updatedAt: config.updated_at
        };
    }

    /**
     * Włącza/wyłącza tryb konserwacji
     * @param {boolean} enabled - Czy włączyć tryb konserwacji
     * @param {string} message - Wiadomość dla użytkowników
     */
    static setMaintenanceMode(enabled, message = null) {
        db.prepare(`
            UPDATE game_config
            SET maintenance_mode = ?, maintenance_message = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = 1
        `).run(enabled ? 1 : 0, message);
    }

    /**
     * Zmienia wersję gry
     * @param {string} version - Nowa wersja gry (np. "1.20.1")
     * @param {string} loaderType - Typ loadera (vanilla, forge, fabric)
     * @param {string} loaderVersion - Wersja loadera (opcjonalnie)
     */
    static setGameVersion(version, loaderType = 'vanilla', loaderVersion = null) {
        const updateData = {
            game_version: version,
            loader_type: loaderType
        };

        if (loaderType === 'forge') {
            updateData.forge_version = loaderVersion;
            updateData.fabric_version = null;
        } else if (loaderType === 'fabric') {
            updateData.fabric_version = loaderVersion;
            updateData.forge_version = null;
        } else {
            updateData.forge_version = null;
            updateData.fabric_version = null;
        }

        return this.update(updateData);
    }
}

export default GameConfig;
