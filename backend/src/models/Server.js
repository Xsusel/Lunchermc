/**
 * Model serwerów Minecraft
 * Obsługuje wiele serwerów do wyboru w launcherze
 * Każdy serwer ma własną konfigurację gry (wersja, loader, mody, pliki)
 */
import db from '../config/database.js';

class Server {
    /**
     * Inicjalizuje tabelę servers (wywoływane przy starcie aplikacji)
     */
    static initTable() {
        db.exec(`
            CREATE TABLE IF NOT EXISTS servers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                ip TEXT NOT NULL,
                port INTEGER DEFAULT 25565,
                is_default INTEGER DEFAULT 0,
                is_enabled INTEGER DEFAULT 1,
                display_order INTEGER DEFAULT 0,
                game_version TEXT DEFAULT '1.20.1',
                loader_type TEXT DEFAULT 'vanilla',
                forge_version TEXT,
                fabric_version TEXT,
                java_args TEXT DEFAULT '-Xmx4G -Xms2G -XX:+UseG1GC',
                maintenance_mode INTEGER DEFAULT 0,
                maintenance_message TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        db.exec(`
            CREATE INDEX IF NOT EXISTS idx_servers_enabled ON servers(is_enabled);
            CREATE INDEX IF NOT EXISTS idx_servers_order ON servers(display_order);
        `);
    }

    /**
     * Migruje dane z game_config do servers (jednorazowo)
     */
    static migrateFromGameConfig() {
        const count = db.prepare('SELECT COUNT(*) as count FROM servers').get();
        if (count.count === 0) {
            // Przenieś obecny serwer z game_config
            const config = db.prepare('SELECT * FROM game_config WHERE id = 1').get();
            if (config && config.server_ip) {
                db.prepare(`
                    INSERT INTO servers (name, ip, port, is_default, is_enabled, display_order,
                        game_version, loader_type, forge_version, fabric_version, java_args)
                    VALUES (?, ?, ?, 1, 1, 0, ?, ?, ?, ?, ?)
                `).run(
                    'Serwer Xsus',
                    config.server_ip,
                    config.server_port || 25565,
                    config.game_version || '1.20.1',
                    config.loader_type || 'vanilla',
                    config.forge_version || null,
                    config.fabric_version || null,
                    config.java_args || '-Xmx4G -Xms2G -XX:+UseG1GC'
                );
            }
        }
    }

    /**
     * Pobiera wszystkie serwery
     */
    static getAll() {
        return db.prepare('SELECT * FROM servers ORDER BY display_order ASC, id ASC').all();
    }

    /**
     * Pobiera włączone serwery (dla launchera)
     */
    static getEnabled() {
        return db.prepare('SELECT * FROM servers WHERE is_enabled = 1 ORDER BY display_order ASC, id ASC').all();
    }

    /**
     * Pobiera serwer po ID
     */
    static getById(id) {
        return db.prepare('SELECT * FROM servers WHERE id = ?').get(id);
    }

    /**
     * Pobiera domyślny serwer
     */
    static getDefault() {
        return db.prepare('SELECT * FROM servers WHERE is_default = 1 AND is_enabled = 1').get()
            || db.prepare('SELECT * FROM servers WHERE is_enabled = 1 ORDER BY display_order ASC LIMIT 1').get();
    }

    /**
     * Tworzy nowy serwer
     */
    static create(data) {
        const {
            name, description, ip, port, is_default,
            game_version, loader_type, forge_version, fabric_version, java_args
        } = data;

        // Jeśli nowy serwer jest domyślny, usuń flagę z innych
        if (is_default) {
            db.prepare('UPDATE servers SET is_default = 0').run();
        }

        const maxOrder = db.prepare('SELECT MAX(display_order) as max_order FROM servers').get();
        const nextOrder = (maxOrder.max_order || 0) + 1;

        const result = db.prepare(`
            INSERT INTO servers (name, description, ip, port, is_default, is_enabled, display_order,
                game_version, loader_type, forge_version, fabric_version, java_args)
            VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
        `).run(
            name,
            description || null,
            ip,
            port || 25565,
            is_default ? 1 : 0,
            nextOrder,
            game_version || '1.20.1',
            loader_type || 'vanilla',
            forge_version || null,
            fabric_version || null,
            java_args || '-Xmx4G -Xms2G -XX:+UseG1GC'
        );

        return this.getById(result.lastInsertRowid);
    }

    /**
     * Aktualizuje serwer
     */
    static update(id, data) {
        const allowedFields = [
            'name', 'description', 'ip', 'port', 'is_default', 'is_enabled', 'display_order',
            'game_version', 'loader_type', 'forge_version', 'fabric_version', 'java_args',
            'maintenance_mode', 'maintenance_message'
        ];
        const updates = [];
        const values = [];

        for (const [key, value] of Object.entries(data)) {
            if (allowedFields.includes(key)) {
                let sanitized = value;
                if (typeof sanitized === 'boolean') sanitized = sanitized ? 1 : 0;
                if (sanitized === undefined) sanitized = null;
                if (key === 'port' && typeof sanitized === 'string') sanitized = parseInt(sanitized, 10) || 25565;
                updates.push(`${key} = ?`);
                values.push(sanitized);
            }
        }

        if (updates.length === 0) return this.getById(id);

        // Jeśli ustawiamy jako domyślny, usuń flagę z innych
        if (data.is_default) {
            db.prepare('UPDATE servers SET is_default = 0').run();
        }

        updates.push('updated_at = CURRENT_TIMESTAMP');
        values.push(id);

        db.prepare(`UPDATE servers SET ${updates.join(', ')} WHERE id = ?`).run(...values);
        return this.getById(id);
    }

    /**
     * Usuwa serwer
     */
    static delete(id) {
        const server = this.getById(id);
        if (!server) return null;

        db.prepare('DELETE FROM servers WHERE id = ?').run(id);

        // Jeśli usunięty był domyślny, ustaw pierwszy jako domyślny
        if (server.is_default) {
            const first = db.prepare('SELECT id FROM servers WHERE is_enabled = 1 ORDER BY display_order ASC LIMIT 1').get();
            if (first) {
                db.prepare('UPDATE servers SET is_default = 1 WHERE id = ?').run(first.id);
            }
        }

        return server;
    }

    /**
     * Przełącza status serwera (włączony/wyłączony)
     */
    static toggle(id) {
        const server = this.getById(id);
        if (!server) return null;

        db.prepare('UPDATE servers SET is_enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(server.is_enabled ? 0 : 1, id);

        return this.getById(id);
    }

    /**
     * Zmienia kolejność serwerów
     */
    static reorder(orderedIds) {
        const stmt = db.prepare('UPDATE servers SET display_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
        const transaction = db.transaction((ids) => {
            ids.forEach((id, index) => {
                stmt.run(index, id);
            });
        });
        transaction(orderedIds);
    }

    // ============================================
    // PER-SERVER MOD MANAGEMENT
    // ============================================

    /**
     * Pobiera mody przypisane do serwera
     * @param {number} serverId
     * @returns {array} Lista modów z informacją o przypisaniu
     */
    static getMods(serverId) {
        return db.prepare(`
            SELECT m.*, sm.is_enabled as server_enabled, sm.created_at as assigned_at
            FROM mods m
            INNER JOIN server_mods sm ON sm.mod_id = m.id
            WHERE sm.server_id = ?
            ORDER BY m.name ASC
        `).all(serverId);
    }

    /**
     * Pobiera mody serwera w formacie dla launchera
     * @param {number} serverId
     * @returns {array} Lista modów z danymi do pobrania
     */
    static getModsForLauncher(serverId) {
        return db.prepare(`
            SELECT m.id, m.name, m.filename, m.url, m.sha256, m.file_size, m.is_required, m.mod_type
            FROM mods m
            INNER JOIN server_mods sm ON sm.mod_id = m.id
            WHERE sm.server_id = ? AND sm.is_enabled = 1 AND m.is_enabled = 1
            ORDER BY m.is_required DESC, m.name ASC
        `).all(serverId).map(mod => ({
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
     * Przypisuje mod do serwera
     * @param {number} serverId
     * @param {number} modId
     */
    static assignMod(serverId, modId) {
        db.prepare(
            'INSERT OR IGNORE INTO server_mods (server_id, mod_id) VALUES (?, ?)'
        ).run(serverId, modId);
    }

    /**
     * Przypisuje wiele modów do serwera
     * @param {number} serverId
     * @param {number[]} modIds
     */
    static assignMods(serverId, modIds) {
        const stmt = db.prepare(
            'INSERT OR IGNORE INTO server_mods (server_id, mod_id) VALUES (?, ?)'
        );
        const transaction = db.transaction((ids) => {
            for (const modId of ids) {
                stmt.run(serverId, modId);
            }
        });
        transaction(modIds);
    }

    /**
     * Usuwa mod z serwera
     * @param {number} serverId
     * @param {number} modId
     */
    static removeMod(serverId, modId) {
        db.prepare(
            'DELETE FROM server_mods WHERE server_id = ? AND mod_id = ?'
        ).run(serverId, modId);
    }

    /**
     * Ustawia mody serwera (zastępuje wszystkie)
     * @param {number} serverId
     * @param {number[]} modIds - lista ID modów
     */
    static setMods(serverId, modIds) {
        const transaction = db.transaction(() => {
            db.prepare('DELETE FROM server_mods WHERE server_id = ?').run(serverId);
            const stmt = db.prepare(
                'INSERT INTO server_mods (server_id, mod_id) VALUES (?, ?)'
            );
            for (const modId of modIds) {
                stmt.run(serverId, modId);
            }
        });
        transaction();
    }

    /**
     * Włącza/wyłącza mod na serwerze
     * @param {number} serverId
     * @param {number} modId
     * @param {boolean} enabled
     */
    static toggleMod(serverId, modId, enabled) {
        db.prepare(
            'UPDATE server_mods SET is_enabled = ? WHERE server_id = ? AND mod_id = ?'
        ).run(enabled ? 1 : 0, serverId, modId);
    }

    // ============================================
    // PER-SERVER FILE MANAGEMENT
    // ============================================

    /**
     * Pobiera pliki (game_files) przypisane do serwera
     * @param {number} serverId
     */
    static getFiles(serverId) {
        return db.prepare(`
            SELECT gf.*, sf.is_enabled as server_enabled
            FROM game_files gf
            INNER JOIN server_files sf ON sf.file_id = gf.id
            WHERE sf.server_id = ?
            ORDER BY gf.file_type ASC, gf.filename ASC
        `).all(serverId);
    }

    /**
     * Pobiera pliki serwera w formacie dla launchera
     * @param {number} serverId
     */
    static getFilesForLauncher(serverId) {
        try {
            return db.prepare(`
                SELECT gfe.file_type, gfe.filename, gfe.relative_path, gfe.url, gfe.sha256, gfe.file_size, gfe.is_required
                FROM game_files_extended gfe
                INNER JOIN server_files sf ON sf.file_id = gfe.id
                WHERE sf.server_id = ? AND sf.is_enabled = 1 AND gfe.is_enabled = 1
            `).all(serverId);
        } catch (e) {
            // game_files_extended might not exist
            return [];
        }
    }

    /**
     * Przypisuje plik do serwera
     */
    static assignFile(serverId, fileId) {
        db.prepare(
            'INSERT OR IGNORE INTO server_files (server_id, file_id) VALUES (?, ?)'
        ).run(serverId, fileId);
    }

    /**
     * Usuwa plik z serwera
     */
    static removeFile(serverId, fileId) {
        db.prepare(
            'DELETE FROM server_files WHERE server_id = ? AND file_id = ?'
        ).run(serverId, fileId);
    }

    /**
     * Ustawia pliki serwera (zastępuje wszystkie)
     */
    static setFiles(serverId, fileIds) {
        const transaction = db.transaction(() => {
            db.prepare('DELETE FROM server_files WHERE server_id = ?').run(serverId);
            const stmt = db.prepare(
                'INSERT INTO server_files (server_id, file_id) VALUES (?, ?)'
            );
            for (const fileId of fileIds) {
                stmt.run(serverId, fileId);
            }
        });
        transaction();
    }

    // ============================================
    // LAUNCHER FORMAT
    // ============================================

    /**
     * Pobiera serwery w formacie dla launchera (camelCase, z konfiguracją gry)
     */
    static getForLauncher() {
        const servers = this.getEnabled();
        return servers.map(s => ({
            id: s.id,
            name: s.name,
            description: s.description,
            ip: s.ip,
            port: s.port,
            isDefault: !!s.is_default,
            gameVersion: s.game_version,
            loaderType: s.loader_type,
            forgeVersion: s.forge_version,
            fabricVersion: s.fabric_version,
            javaArgs: s.java_args,
            maintenanceMode: !!s.maintenance_mode,
            maintenanceMessage: s.maintenance_message
        }));
    }

    /**
     * Pobiera konfigurację gry dla konkretnego serwera (format publiczny)
     * @param {number} serverId
     */
    static getServerConfig(serverId) {
        const server = this.getById(serverId);
        if (!server) return null;

        return {
            gameVersion: server.game_version,
            forgeVersion: server.forge_version,
            fabricVersion: server.fabric_version,
            loaderType: server.loader_type,
            javaArgs: server.java_args,
            serverIp: server.ip,
            serverPort: server.port,
            maintenanceMode: !!server.maintenance_mode,
            maintenanceMessage: server.maintenance_message
        };
    }

    /**
     * Liczba modów per serwer
     */
    static getModCount(serverId) {
        return db.prepare(
            'SELECT COUNT(*) as count FROM server_mods WHERE server_id = ? AND is_enabled = 1'
        ).get(serverId).count;
    }
}

export default Server;
