/**
 * Model serwerów Minecraft
 * Obsługuje wiele serwerów do wyboru w launcherze
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
            const config = db.prepare('SELECT server_ip, server_port FROM game_config WHERE id = 1').get();
            if (config && config.server_ip) {
                db.prepare(`
                    INSERT INTO servers (name, ip, port, is_default, is_enabled, display_order)
                    VALUES (?, ?, ?, 1, 1, 0)
                `).run('Serwer Xsus', config.server_ip, config.server_port || 25565);
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
        const { name, description, ip, port, is_default } = data;

        // Jeśli nowy serwer jest domyślny, usuń flagę z innych
        if (is_default) {
            db.prepare('UPDATE servers SET is_default = 0').run();
        }

        const maxOrder = db.prepare('SELECT MAX(display_order) as max_order FROM servers').get();
        const nextOrder = (maxOrder.max_order || 0) + 1;

        const result = db.prepare(`
            INSERT INTO servers (name, description, ip, port, is_default, is_enabled, display_order)
            VALUES (?, ?, ?, ?, ?, 1, ?)
        `).run(name, description || null, ip, port || 25565, is_default ? 1 : 0, nextOrder);

        return this.getById(result.lastInsertRowid);
    }

    /**
     * Aktualizuje serwer
     */
    static update(id, data) {
        const allowedFields = ['name', 'description', 'ip', 'port', 'is_default', 'is_enabled', 'display_order'];
        const updates = [];
        const values = [];

        for (const [key, value] of Object.entries(data)) {
            if (allowedFields.includes(key)) {
                let sanitized = value;
                if (typeof sanitized === 'boolean') sanitized = sanitized ? 1 : 0;
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

    /**
     * Pobiera serwery w formacie dla launchera (camelCase)
     */
    static getForLauncher() {
        const servers = this.getEnabled();
        return servers.map(s => ({
            id: s.id,
            name: s.name,
            description: s.description,
            ip: s.ip,
            port: s.port,
            isDefault: !!s.is_default
        }));
    }
}

export default Server;
