/**
 * Safety net: ensures critical database columns exist.
 * Called at server startup BEFORE migrations, to handle cases where
 * the database was created by an older initDb.js without all columns.
 *
 * Uses PRAGMA table_info to check and ALTER TABLE to add missing columns.
 * Safe to call multiple times (idempotent).
 */
import db from './database.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('Schema');

function addColumnIfMissing(table, column, definition) {
    try {
        const tableExists = db.prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
        ).get(table);
        if (!tableExists) return;

        const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
        if (!cols.includes(column)) {
            db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
            log.info(`Added missing column ${table}.${column}`);
        }
    } catch (e) {
        // Column may already exist or table not ready - safe to ignore
    }
}

/**
 * Ensures all columns required by models exist in the database.
 * This covers cases where initDb.js created tables without migration columns.
 */
export function ensureCriticalSchema() {
    // admins.role - required by Admin.findById() and authenticateAdmin middleware
    addColumnIfMissing('admins', 'role', "TEXT DEFAULT 'admin'");
    addColumnIfMissing('admins', 'totp_secret', 'TEXT');
    addColumnIfMissing('admins', 'totp_enabled', 'INTEGER DEFAULT 0');
    addColumnIfMissing('admins', 'totp_backup_codes', 'TEXT');

    // activity_logs extended columns - required by ActivityLog.getAll()
    addColumnIfMissing('activity_logs', 'category', "TEXT DEFAULT 'general'");
    addColumnIfMissing('activity_logs', 'severity', "TEXT DEFAULT 'info'");
    addColumnIfMissing('activity_logs', 'admin_id', 'INTEGER');
    addColumnIfMissing('activity_logs', 'resource_type', 'TEXT');
    addColumnIfMissing('activity_logs', 'resource_id', 'TEXT');
    addColumnIfMissing('activity_logs', 'old_value', 'TEXT');
    addColumnIfMissing('activity_logs', 'new_value', 'TEXT');
    addColumnIfMissing('activity_logs', 'user_agent', 'TEXT');
    addColumnIfMissing('activity_logs', 'session_id', 'TEXT');

    // users extended columns
    addColumnIfMissing('users', 'security_question', 'TEXT');
    addColumnIfMissing('users', 'security_answer_hash', 'TEXT');
    addColumnIfMissing('users', 'failed_attempts', 'INTEGER DEFAULT 0');
    addColumnIfMissing('users', 'locked_until', 'DATETIME');
    addColumnIfMissing('users', 'email', 'TEXT');

    // sessions extended columns
    addColumnIfMissing('sessions', 'ip_address', 'TEXT');
    addColumnIfMissing('sessions', 'user_agent', 'TEXT');
    addColumnIfMissing('sessions', 'device_info', 'TEXT');
    addColumnIfMissing('sessions', 'is_active', 'INTEGER DEFAULT 1');
    addColumnIfMissing('sessions', 'last_activity', 'DATETIME');
    addColumnIfMissing('sessions', 'revoked_at', 'DATETIME');
    addColumnIfMissing('sessions', 'revoked_reason', 'TEXT');

    // mods extended columns
    addColumnIfMissing('mods', 'download_count', 'INTEGER DEFAULT 0');
    addColumnIfMissing('mods', 'curseforge_id', 'INTEGER');
    addColumnIfMissing('mods', 'curseforge_file_id', 'INTEGER');
    addColumnIfMissing('mods', 'curseforge_url', 'TEXT');

    // launcher_versions extended columns
    addColumnIfMissing('launcher_versions', 'sha512', 'TEXT');
    addColumnIfMissing('launcher_versions', 'file_size', 'INTEGER DEFAULT 0');
    addColumnIfMissing('launcher_versions', 'filename', 'TEXT');
}
