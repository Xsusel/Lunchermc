/**
 * Database Migration System
 * Tracks and applies schema migrations in order.
 *
 * Each migration has:
 *   - id:   sequential integer
 *   - name: descriptive slug
 *   - sql:  SQL statements separated by semicolons
 *
 * Usage:
 *   import { runMigrations } from './config/migrations.js';
 *   runMigrations();   // call once at startup
 */
import db from './database.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('Migrations');

// ============================================
// MIGRATION DEFINITIONS
// ============================================

const migrations = [
    // ------------------------------------------------------------------
    // 1. activity_logs extended columns (category, severity, admin_id, etc.)
    // ------------------------------------------------------------------
    {
        id: 1,
        name: 'add_activity_logs_extended_columns',
        sql: `
            ALTER TABLE activity_logs ADD COLUMN category TEXT DEFAULT 'general';
            ALTER TABLE activity_logs ADD COLUMN severity TEXT DEFAULT 'info';
            ALTER TABLE activity_logs ADD COLUMN admin_id INTEGER;
            ALTER TABLE activity_logs ADD COLUMN resource_type TEXT;
            ALTER TABLE activity_logs ADD COLUMN resource_id TEXT;
            ALTER TABLE activity_logs ADD COLUMN old_value TEXT;
            ALTER TABLE activity_logs ADD COLUMN new_value TEXT;
            ALTER TABLE activity_logs ADD COLUMN user_agent TEXT;
            ALTER TABLE activity_logs ADD COLUMN session_id TEXT;
        `,
    },

    // ------------------------------------------------------------------
    // 2. admin 2FA columns (totp_secret, totp_enabled, totp_backup_codes)
    // ------------------------------------------------------------------
    {
        id: 2,
        name: 'add_admin_2fa_columns',
        sql: `
            ALTER TABLE admins ADD COLUMN totp_secret TEXT;
            ALTER TABLE admins ADD COLUMN totp_enabled INTEGER DEFAULT 0;
            ALTER TABLE admins ADD COLUMN totp_backup_codes TEXT;
        `,
    },

    // ------------------------------------------------------------------
    // 3. admin role column
    // ------------------------------------------------------------------
    {
        id: 3,
        name: 'add_admin_role_column',
        sql: `
            ALTER TABLE admins ADD COLUMN role TEXT DEFAULT 'admin';
        `,
    },

    // ------------------------------------------------------------------
    // 4. user security_question columns
    // ------------------------------------------------------------------
    {
        id: 4,
        name: 'add_user_security_question_columns',
        sql: `
            ALTER TABLE users ADD COLUMN security_question TEXT;
            ALTER TABLE users ADD COLUMN security_answer_hash TEXT;
        `,
    },

    // ------------------------------------------------------------------
    // 5. DB indexes for common queries
    // ------------------------------------------------------------------
    {
        id: 5,
        name: 'add_performance_indexes',
        sql: `
            CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
            CREATE INDEX IF NOT EXISTS idx_users_is_banned ON users(is_banned);
            CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
            CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
            CREATE INDEX IF NOT EXISTS idx_mods_is_enabled ON mods(is_enabled);
            CREATE INDEX IF NOT EXISTS idx_mods_filename ON mods(filename);
            CREATE INDEX IF NOT EXISTS idx_broadcasts_is_active ON broadcasts(is_active);
            CREATE INDEX IF NOT EXISTS idx_activity_logs_category ON activity_logs(category);
            CREATE INDEX IF NOT EXISTS idx_activity_logs_severity ON activity_logs(severity);
            CREATE INDEX IF NOT EXISTS idx_activity_logs_resource ON activity_logs(resource_type, resource_id);
            CREATE INDEX IF NOT EXISTS idx_activity_logs_admin ON activity_logs(admin_id);
            CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at);
            CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action);
        `,
    },

    // ------------------------------------------------------------------
    // 6. session extended columns
    // ------------------------------------------------------------------
    {
        id: 6,
        name: 'add_session_extended_columns',
        sql: `
            ALTER TABLE sessions ADD COLUMN ip_address TEXT;
            ALTER TABLE sessions ADD COLUMN user_agent TEXT;
            ALTER TABLE sessions ADD COLUMN device_info TEXT;
            ALTER TABLE sessions ADD COLUMN is_active INTEGER DEFAULT 1;
            ALTER TABLE sessions ADD COLUMN last_activity DATETIME;
            ALTER TABLE sessions ADD COLUMN revoked_at DATETIME;
            ALTER TABLE sessions ADD COLUMN revoked_reason TEXT;
        `,
    },

    // ------------------------------------------------------------------
    // 7. session indexes
    // ------------------------------------------------------------------
    {
        id: 7,
        name: 'add_session_indexes',
        sql: `
            CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id, is_active);
            CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(is_active, expires_at);
            CREATE INDEX IF NOT EXISTS idx_sessions_ip ON sessions(ip_address);
        `,
    },

    // ------------------------------------------------------------------
    // 8. ban_appeals_v2 table (standalone ban appeal system)
    // ------------------------------------------------------------------
    {
        id: 8,
        name: 'create_ban_appeals_v2_table',
        sql: `
            CREATE TABLE IF NOT EXISTS ban_appeals_v2 (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                reason TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                admin_response TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_ban_appeals_v2_user ON ban_appeals_v2(user_id);
            CREATE INDEX IF NOT EXISTS idx_ban_appeals_v2_status ON ban_appeals_v2(status);
        `,
    },

    // ------------------------------------------------------------------
    // 9. user account lockout columns (failed_attempts, locked_until)
    // ------------------------------------------------------------------
    {
        id: 9,
        name: 'add_user_lockout_columns',
        sql: `
            ALTER TABLE users ADD COLUMN failed_attempts INTEGER DEFAULT 0;
            ALTER TABLE users ADD COLUMN locked_until DATETIME;
        `,
    },

    // ------------------------------------------------------------------
    // 10. mods download_count column
    // ------------------------------------------------------------------
    {
        id: 10,
        name: 'add_mods_download_count',
        sql: `
            ALTER TABLE mods ADD COLUMN download_count INTEGER DEFAULT 0;
        `,
    },

    // ------------------------------------------------------------------
    // 11. user email column
    // ------------------------------------------------------------------
    {
        id: 11,
        name: 'add_user_email_column',
        sql: `
            ALTER TABLE users ADD COLUMN email TEXT;
            CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
        `,
    },

    // ------------------------------------------------------------------
    // 12. crash_reports table
    // ------------------------------------------------------------------
    {
        id: 12,
        name: 'create_crash_reports_table',
        sql: `
            CREATE TABLE IF NOT EXISTS crash_reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                error_type TEXT NOT NULL,
                error_message TEXT,
                stack_trace TEXT,
                system_info TEXT,
                launcher_version TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
            );
            CREATE INDEX IF NOT EXISTS idx_crash_reports_user ON crash_reports(user_id);
            CREATE INDEX IF NOT EXISTS idx_crash_reports_created ON crash_reports(created_at);
        `,
    },

    // ------------------------------------------------------------------
    // 13. launcher_versions: sha512, file_size, filename for electron-updater
    // ------------------------------------------------------------------
    {
        id: 13,
        name: 'add_launcher_versions_electron_updater_columns',
        sql: `
            ALTER TABLE launcher_versions ADD COLUMN sha512 TEXT;
            ALTER TABLE launcher_versions ADD COLUMN file_size INTEGER;
            ALTER TABLE launcher_versions ADD COLUMN filename TEXT;
        `,
    },

    // ------------------------------------------------------------------
    // 14. mods CurseForge integration columns
    // ------------------------------------------------------------------
    {
        id: 14,
        name: 'add_mods_curseforge_columns',
        sql: `
            ALTER TABLE mods ADD COLUMN curseforge_id INTEGER;
            ALTER TABLE mods ADD COLUMN curseforge_file_id INTEGER;
            ALTER TABLE mods ADD COLUMN curseforge_url TEXT;
            CREATE INDEX IF NOT EXISTS idx_mods_curseforge ON mods(curseforge_id);
        `,
    },

    // ------------------------------------------------------------------
    // 15. Per-server game config and mod/file assignments
    //     Each server gets its own game version, loader, mods, and files
    // ------------------------------------------------------------------
    {
        id: 15,
        name: 'add_per_server_config_and_assignments',
        sql: `
            ALTER TABLE servers ADD COLUMN game_version TEXT DEFAULT '1.20.1';
            ALTER TABLE servers ADD COLUMN loader_type TEXT DEFAULT 'vanilla';
            ALTER TABLE servers ADD COLUMN forge_version TEXT;
            ALTER TABLE servers ADD COLUMN fabric_version TEXT;
            ALTER TABLE servers ADD COLUMN java_args TEXT DEFAULT '-Xmx4G -Xms2G -XX:+UseG1GC';
            ALTER TABLE servers ADD COLUMN maintenance_mode INTEGER DEFAULT 0;
            ALTER TABLE servers ADD COLUMN maintenance_message TEXT;

            CREATE TABLE IF NOT EXISTS server_mods (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                server_id INTEGER NOT NULL,
                mod_id INTEGER NOT NULL,
                is_enabled INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
                FOREIGN KEY (mod_id) REFERENCES mods(id) ON DELETE CASCADE,
                UNIQUE(server_id, mod_id)
            );
            CREATE INDEX IF NOT EXISTS idx_server_mods_server ON server_mods(server_id);
            CREATE INDEX IF NOT EXISTS idx_server_mods_mod ON server_mods(mod_id);

            CREATE TABLE IF NOT EXISTS server_files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                server_id INTEGER NOT NULL,
                file_id INTEGER NOT NULL,
                is_enabled INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
                FOREIGN KEY (file_id) REFERENCES game_files(id) ON DELETE CASCADE,
                UNIQUE(server_id, file_id)
            );
            CREATE INDEX IF NOT EXISTS idx_server_files_server ON server_files(server_id);
            CREATE INDEX IF NOT EXISTS idx_server_files_file ON server_files(file_id);
        `,
        postRun: () => {
            // Migrate game_config values to existing servers
            try {
                const gameConfig = db.prepare('SELECT * FROM game_config WHERE id = 1').get();
                if (gameConfig) {
                    const servers = db.prepare('SELECT id FROM servers').all();
                    const updateStmt = db.prepare(`
                        UPDATE servers SET
                            game_version = ?,
                            loader_type = ?,
                            forge_version = ?,
                            fabric_version = ?,
                            java_args = ?
                        WHERE id = ?
                    `);
                    for (const server of servers) {
                        updateStmt.run(
                            gameConfig.game_version || '1.20.1',
                            gameConfig.loader_type || 'vanilla',
                            gameConfig.forge_version || null,
                            gameConfig.fabric_version || null,
                            gameConfig.java_args || '-Xmx4G -Xms2G -XX:+UseG1GC',
                            server.id
                        );
                    }
                    log.info('Migrated game_config to servers');
                }
            } catch (e) {
                log.warn('Could not migrate game_config to servers: ' + e.message);
            }

            // Assign all existing mods to all servers
            try {
                const servers = db.prepare('SELECT id FROM servers').all();
                const mods = db.prepare('SELECT id FROM mods').all();
                if (servers.length > 0 && mods.length > 0) {
                    const insertStmt = db.prepare(
                        'INSERT OR IGNORE INTO server_mods (server_id, mod_id) VALUES (?, ?)'
                    );
                    const assignAll = db.transaction(() => {
                        for (const server of servers) {
                            for (const mod of mods) {
                                insertStmt.run(server.id, mod.id);
                            }
                        }
                    });
                    assignAll();
                    log.info(`Assigned ${mods.length} mods to ${servers.length} servers`);
                }
            } catch (e) {
                log.warn('Could not assign mods to servers: ' + e.message);
            }
        },
    },
    // ------------------------------------------------------------------
    // 16. NeoForge support: neoforge_version column on game_config + servers
    // ------------------------------------------------------------------
    {
        id: 16,
        name: 'add_neoforge_version_column',
        sql: `
            ALTER TABLE game_config ADD COLUMN neoforge_version TEXT;
            ALTER TABLE servers ADD COLUMN neoforge_version TEXT;
        `,
    },
];

// ============================================
// MIGRATIONS TABLE SETUP
// ============================================

function initMigrationsTable() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS migrations (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Support legacy table name (_migrations) if it was used before
    try {
        const legacy = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='_migrations'").get();
        if (legacy) {
            // Copy any records from _migrations into migrations
            db.exec(`
                INSERT OR IGNORE INTO migrations (id, name, applied_at)
                SELECT id, name, applied_at FROM _migrations
            `);
        }
    } catch {
        // Ignore if _migrations doesn't exist or has different schema
    }
}

// ============================================
// MIGRATION RUNNER
// ============================================

/**
 * Checks which migrations have been applied and runs any pending ones.
 * Called once at server startup from index.js.
 *
 * @returns {{ applied: number, total: number, pending: number }}
 */
export function runMigrations() {
    initMigrationsTable();

    const applied = new Set(
        db.prepare('SELECT name FROM migrations').all().map(r => r.name)
    );

    const pending = migrations.filter(m => !applied.has(m.name));

    if (pending.length === 0) {
        log.info('All migrations already applied', { total: migrations.length });
        return { applied: 0, total: migrations.length, pending: 0 };
    }

    let appliedCount = 0;

    for (const migration of pending) {
        try {
            log.info('Applying migration', { id: migration.id, name: migration.name });

            // Execute each SQL statement individually
            // (ALTER TABLE cannot run inside a transaction in SQLite)
            const statements = migration.sql
                .split(';')
                .map(s => s.trim())
                .filter(s => s.length > 0);

            for (const statement of statements) {
                try {
                    db.exec(statement);
                } catch (err) {
                    // Ignore "column already exists" or "index already exists" errors
                    // These are expected when migrating from the old inline ALTER TABLE approach
                    if (!err.message.includes('duplicate column') &&
                        !err.message.includes('already exists')) {
                        throw err;
                    }
                }
            }

            // Run post-migration data hooks (if any)
            if (typeof migration.postRun === 'function') {
                try {
                    migration.postRun();
                } catch (postErr) {
                    log.warn('Post-migration hook failed', {
                        id: migration.id,
                        name: migration.name,
                        error: postErr.message
                    });
                }
            }

            // Record migration as applied
            db.prepare('INSERT OR IGNORE INTO migrations (id, name) VALUES (?, ?)').run(
                migration.id,
                migration.name
            );

            appliedCount++;
            log.info('Migration applied successfully', { id: migration.id, name: migration.name });
        } catch (error) {
            log.error('Migration failed', {
                id: migration.id,
                name: migration.name,
                error: error.message,
            });
            // Continue with next migration - don't block startup for non-critical schema changes
        }
    }

    log.info('Migrations complete', {
        applied: appliedCount,
        total: migrations.length,
        pending: pending.length - appliedCount,
    });

    return {
        applied: appliedCount,
        total: migrations.length,
        pending: pending.length - appliedCount,
    };
}

export default { runMigrations };
