/**
 * Skrypt inicjalizujący bazę danych
 * Tworzy wszystkie wymagane tabele i dane początkowe
 *
 * Schemat zawiera WSZYSTKIE kolumny (w tym te z migracji),
 * dzięki czemu świeża baza jest od razu kompletna.
 * CREATE TABLE IF NOT EXISTS nie nadpisze istniejących tabel.
 */
import 'dotenv/config';
import db from './database.js';
import bcrypt from 'bcryptjs';

console.log('Inicjalizacja bazy danych...');

// ============================================
// TWORZENIE TABEL (pełny schemat)
// ============================================

// Tabela użytkowników (graczy)
// Zawiera kolumny z migracji: 4 (security_question), 9 (lockout), 11 (email)
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        is_banned INTEGER DEFAULT 0,
        ban_reason TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME,
        total_playtime INTEGER DEFAULT 0,
        security_question TEXT,
        security_answer_hash TEXT,
        failed_attempts INTEGER DEFAULT 0,
        locked_until DATETIME,
        email TEXT
    )
`);

// Tabela administratorów
// Zawiera kolumny z migracji: 2 (2FA), 3 (role)
db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME,
        totp_secret TEXT,
        totp_enabled INTEGER DEFAULT 0,
        totp_backup_codes TEXT,
        role TEXT DEFAULT 'admin'
    )
`);

// Tabela sesji (dla tokenów odświeżania)
// Zawiera kolumny z migracji: 6 (extended session info)
db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token TEXT UNIQUE NOT NULL,
        user_type TEXT NOT NULL DEFAULT 'user',
        expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        ip_address TEXT,
        user_agent TEXT,
        device_info TEXT,
        is_active INTEGER DEFAULT 1,
        last_activity DATETIME,
        revoked_at DATETIME,
        revoked_reason TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
`);

// Konfiguracja gry
db.exec(`
    CREATE TABLE IF NOT EXISTS game_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        game_version TEXT NOT NULL DEFAULT '1.20.1',
        forge_version TEXT,
        fabric_version TEXT,
        loader_type TEXT DEFAULT 'vanilla',
        java_args TEXT DEFAULT '-Xmx4G -Xms2G -XX:+UseG1GC',
        server_ip TEXT NOT NULL DEFAULT 'localhost',
        server_port INTEGER DEFAULT 25565,
        maintenance_mode INTEGER DEFAULT 0,
        maintenance_message TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

// Tabela modów
// Zawiera kolumny z migracji: 10 (download_count), 14 (curseforge)
db.exec(`
    CREATE TABLE IF NOT EXISTS mods (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        filename TEXT UNIQUE NOT NULL,
        url TEXT,
        sha256 TEXT NOT NULL,
        file_size INTEGER DEFAULT 0,
        is_required INTEGER DEFAULT 1,
        is_enabled INTEGER DEFAULT 1,
        mod_type TEXT DEFAULT 'mod',
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        download_count INTEGER DEFAULT 0,
        curseforge_id INTEGER,
        curseforge_file_id INTEGER,
        curseforge_url TEXT
    )
`);

// Tabela plików gry (biblioteki, assety)
db.exec(`
    CREATE TABLE IF NOT EXISTS game_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        url TEXT NOT NULL,
        sha256 TEXT NOT NULL,
        file_size INTEGER DEFAULT 0,
        file_type TEXT NOT NULL,
        game_version TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(relative_path, game_version)
    )
`);

// Tabela powiadomień (broadcast)
db.exec(`
    CREATE TABLE IF NOT EXISTS broadcasts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        type TEXT DEFAULT 'info',
        is_active INTEGER DEFAULT 1,
        priority INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME
    )
`);

// Tabela logów aktywności
// Zawiera kolumny z migracji: 1 (extended columns)
db.exec(`
    CREATE TABLE IF NOT EXISTS activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        action TEXT NOT NULL,
        details TEXT,
        ip_address TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        category TEXT DEFAULT 'general',
        severity TEXT DEFAULT 'info',
        admin_id INTEGER,
        resource_type TEXT,
        resource_id TEXT,
        old_value TEXT,
        new_value TEXT,
        user_agent TEXT,
        session_id TEXT
    )
`);

// Tabela wersji launchera
db.exec(`
    CREATE TABLE IF NOT EXISTS launcher_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version TEXT UNIQUE NOT NULL,
        download_url TEXT NOT NULL,
        sha256 TEXT NOT NULL,
        sha512 TEXT,
        file_size INTEGER DEFAULT 0,
        filename TEXT,
        changelog TEXT,
        is_required INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

// Tabela serwerów (wiele serwerów do wyboru w launcherze)
// Zawiera kolumny z migracji: 15 (per-server game config)
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

// Tabela przypisań modów do serwerów (migracja 15)
db.exec(`
    CREATE TABLE IF NOT EXISTS server_mods (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id INTEGER NOT NULL,
        mod_id INTEGER NOT NULL,
        is_enabled INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
        FOREIGN KEY (mod_id) REFERENCES mods(id) ON DELETE CASCADE,
        UNIQUE(server_id, mod_id)
    )
`);

// Tabela przypisań plików do serwerów (migracja 15)
db.exec(`
    CREATE TABLE IF NOT EXISTS server_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id INTEGER NOT NULL,
        file_id INTEGER NOT NULL,
        is_enabled INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
        FOREIGN KEY (file_id) REFERENCES game_files(id) ON DELETE CASCADE,
        UNIQUE(server_id, file_id)
    )
`);

// Tabela z migracji 8: ban_appeals_v2
db.exec(`
    CREATE TABLE IF NOT EXISTS ban_appeals_v2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        reason TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        admin_response TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
`);

// Tabela z migracji 12: crash_reports
db.exec(`
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
    )
`);

// ============================================
// TWORZENIE INDEKSÓW
// ============================================

db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_users_is_banned ON users(is_banned);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(is_active, expires_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_ip ON sessions(ip_address);
    CREATE INDEX IF NOT EXISTS idx_mods_enabled ON mods(is_enabled);
    CREATE INDEX IF NOT EXISTS idx_mods_filename ON mods(filename);
    CREATE INDEX IF NOT EXISTS idx_mods_curseforge ON mods(curseforge_id);
    CREATE INDEX IF NOT EXISTS idx_broadcasts_active ON broadcasts(is_active);
    CREATE INDEX IF NOT EXISTS idx_activity_logs_category ON activity_logs(category);
    CREATE INDEX IF NOT EXISTS idx_activity_logs_severity ON activity_logs(severity);
    CREATE INDEX IF NOT EXISTS idx_activity_logs_resource ON activity_logs(resource_type, resource_id);
    CREATE INDEX IF NOT EXISTS idx_activity_logs_admin ON activity_logs(admin_id);
    CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action);
    CREATE INDEX IF NOT EXISTS idx_servers_enabled ON servers(is_enabled);
    CREATE INDEX IF NOT EXISTS idx_servers_order ON servers(display_order);
    CREATE INDEX IF NOT EXISTS idx_ban_appeals_v2_user ON ban_appeals_v2(user_id);
    CREATE INDEX IF NOT EXISTS idx_ban_appeals_v2_status ON ban_appeals_v2(status);
    CREATE INDEX IF NOT EXISTS idx_crash_reports_user ON crash_reports(user_id);
    CREATE INDEX IF NOT EXISTS idx_crash_reports_created ON crash_reports(created_at);
    CREATE INDEX IF NOT EXISTS idx_server_mods_server ON server_mods(server_id);
    CREATE INDEX IF NOT EXISTS idx_server_mods_mod ON server_mods(mod_id);
    CREATE INDEX IF NOT EXISTS idx_server_files_server ON server_files(server_id);
    CREATE INDEX IF NOT EXISTS idx_server_files_file ON server_files(file_id);
`);

// ============================================
// DANE POCZĄTKOWE
// ============================================

// Sprawdzamy czy istnieje konfiguracja gry
const configExists = db.prepare('SELECT COUNT(*) as count FROM game_config').get();
if (configExists.count === 0) {
    db.prepare(`
        INSERT INTO game_config (id, game_version, server_ip, server_port, java_args)
        VALUES (1, '1.20.1', ?, ?, '-Xmx4G -Xms2G -XX:+UseG1GC -Dfile.encoding=UTF-8')
    `).run(
        process.env.MC_SERVER_IP || 'localhost',
        process.env.MC_SERVER_PORT || 25565
    );
    console.log('Utworzono domyslna konfiguracje gry');
}

// Sprawdzamy czy istnieje konto admina
const adminExists = db.prepare('SELECT COUNT(*) as count FROM admins').get();
if (adminExists.count === 0) {
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const hashedPassword = bcrypt.hashSync(adminPassword, 12);

    db.prepare(`
        INSERT INTO admins (username, password_hash)
        VALUES (?, ?)
    `).run(adminUsername, hashedPassword);

    console.log(`Utworzono konto administratora: ${adminUsername}`);
}

// Migracja: przenieś serwer z game_config do tabeli servers
const serversExist = db.prepare('SELECT COUNT(*) as count FROM servers').get();
if (serversExist.count === 0) {
    const gameConfig = db.prepare('SELECT server_ip, server_port FROM game_config WHERE id = 1').get();
    if (gameConfig && gameConfig.server_ip) {
        db.prepare(`
            INSERT INTO servers (name, ip, port, is_default, is_enabled, display_order)
            VALUES (?, ?, ?, 1, 1, 0)
        `).run('Serwer Xsus', gameConfig.server_ip, gameConfig.server_port || 25565);
        console.log('Zmigrowano serwer z game_config do tabeli servers');
    }
}

// ============================================
// MIGRACJA DANYCH: per-server config i przypisanie modów
// ============================================

// Kopiuj game_config do serwerów, które jeszcze nie mają game_version ustawionej
try {
    const serversToMigrate = db.prepare(
        "SELECT id FROM servers WHERE game_version = '1.20.1' AND loader_type = 'vanilla'"
    ).all();
    const gameConfig = db.prepare('SELECT * FROM game_config WHERE id = 1').get();

    if (gameConfig && serversToMigrate.length > 0) {
        const updateStmt = db.prepare(`
            UPDATE servers SET
                game_version = ?,
                loader_type = ?,
                forge_version = ?,
                fabric_version = ?,
                java_args = ?
            WHERE id = ? AND game_version = '1.20.1' AND loader_type = 'vanilla'
        `);
        for (const server of serversToMigrate) {
            updateStmt.run(
                gameConfig.game_version || '1.20.1',
                gameConfig.loader_type || 'vanilla',
                gameConfig.forge_version || null,
                gameConfig.fabric_version || null,
                gameConfig.java_args || '-Xmx4G -Xms2G -XX:+UseG1GC',
                server.id
            );
        }
        console.log('Zmigrowano konfigurację gry do serwerów');
    }
} catch (e) {
    // Ignore - columns may not exist yet
}

// Przypisz istniejące mody do wszystkich serwerów (jeśli server_mods jest puste)
try {
    const serverModsCount = db.prepare('SELECT COUNT(*) as count FROM server_mods').get();
    if (serverModsCount.count === 0) {
        const allServers = db.prepare('SELECT id FROM servers').all();
        const allMods = db.prepare('SELECT id FROM mods').all();
        if (allServers.length > 0 && allMods.length > 0) {
            const insertStmt = db.prepare(
                'INSERT OR IGNORE INTO server_mods (server_id, mod_id) VALUES (?, ?)'
            );
            const assignAll = db.transaction(() => {
                for (const server of allServers) {
                    for (const mod of allMods) {
                        insertStmt.run(server.id, mod.id);
                    }
                }
            });
            assignAll();
            console.log(`Przypisano ${allMods.length} modów do ${allServers.length} serwerów`);
        }
    }
} catch (e) {
    // Ignore
}

// ============================================
// MIGRACJA KOLUMN DLA ISTNIEJĄCYCH BAZ
// Dodaje brakujące kolumny do tabel, które istniały
// przed aktualizacją schematu.
// ============================================

function addColumnIfMissing(table, column, definition) {
    try {
        const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
        if (!cols.includes(column)) {
            db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
            console.log(`Migracja: dodano ${column} do ${table}`);
        }
    } catch (e) {
        // Ignoruj błędy - kolumna może już istnieć
    }
}

// admins - 2FA i role
addColumnIfMissing('admins', 'totp_secret', 'TEXT');
addColumnIfMissing('admins', 'totp_enabled', 'INTEGER DEFAULT 0');
addColumnIfMissing('admins', 'totp_backup_codes', 'TEXT');
addColumnIfMissing('admins', 'role', "TEXT DEFAULT 'admin'");

// users - security, lockout, email
addColumnIfMissing('users', 'security_question', 'TEXT');
addColumnIfMissing('users', 'security_answer_hash', 'TEXT');
addColumnIfMissing('users', 'failed_attempts', 'INTEGER DEFAULT 0');
addColumnIfMissing('users', 'locked_until', 'DATETIME');
addColumnIfMissing('users', 'email', 'TEXT');

// sessions - extended info
addColumnIfMissing('sessions', 'ip_address', 'TEXT');
addColumnIfMissing('sessions', 'user_agent', 'TEXT');
addColumnIfMissing('sessions', 'device_info', 'TEXT');
addColumnIfMissing('sessions', 'is_active', 'INTEGER DEFAULT 1');
addColumnIfMissing('sessions', 'last_activity', 'DATETIME');
addColumnIfMissing('sessions', 'revoked_at', 'DATETIME');
addColumnIfMissing('sessions', 'revoked_reason', 'TEXT');

// activity_logs - extended columns
addColumnIfMissing('activity_logs', 'category', "TEXT DEFAULT 'general'");
addColumnIfMissing('activity_logs', 'severity', "TEXT DEFAULT 'info'");
addColumnIfMissing('activity_logs', 'admin_id', 'INTEGER');
addColumnIfMissing('activity_logs', 'resource_type', 'TEXT');
addColumnIfMissing('activity_logs', 'resource_id', 'TEXT');
addColumnIfMissing('activity_logs', 'old_value', 'TEXT');
addColumnIfMissing('activity_logs', 'new_value', 'TEXT');
addColumnIfMissing('activity_logs', 'user_agent', 'TEXT');
addColumnIfMissing('activity_logs', 'session_id', 'TEXT');

// mods - download_count i curseforge
addColumnIfMissing('mods', 'download_count', 'INTEGER DEFAULT 0');
addColumnIfMissing('mods', 'curseforge_id', 'INTEGER');
addColumnIfMissing('mods', 'curseforge_file_id', 'INTEGER');
addColumnIfMissing('mods', 'curseforge_url', 'TEXT');

// launcher_versions - electron-updater columns
addColumnIfMissing('launcher_versions', 'sha512', 'TEXT');
addColumnIfMissing('launcher_versions', 'file_size', 'INTEGER DEFAULT 0');
addColumnIfMissing('launcher_versions', 'filename', 'TEXT');

// servers - per-server game config (migracja 15)
addColumnIfMissing('servers', 'game_version', "TEXT DEFAULT '1.20.1'");
addColumnIfMissing('servers', 'loader_type', "TEXT DEFAULT 'vanilla'");
addColumnIfMissing('servers', 'forge_version', 'TEXT');
addColumnIfMissing('servers', 'fabric_version', 'TEXT');
addColumnIfMissing('servers', 'java_args', "TEXT DEFAULT '-Xmx4G -Xms2G -XX:+UseG1GC'");
addColumnIfMissing('servers', 'maintenance_mode', 'INTEGER DEFAULT 0');
addColumnIfMissing('servers', 'maintenance_message', 'TEXT');

console.log('Baza danych zainicjalizowana pomyslnie');
console.log(`Lokalizacja: ${process.env.DATABASE_PATH || './data/launcher.db'}`);

process.exit(0);
