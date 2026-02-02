/**
 * Skrypt inicjalizujący bazę danych
 * Tworzy wszystkie wymagane tabele i dane początkowe
 */
import 'dotenv/config';
import db from './database.js';
import bcrypt from 'bcryptjs';

console.log('🚀 Inicjalizacja bazy danych...');

// ============================================
// TWORZENIE TABEL
// ============================================

// Tabela użytkowników (graczy)
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        is_banned INTEGER DEFAULT 0,
        ban_reason TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME,
        total_playtime INTEGER DEFAULT 0
    )
`);

// Tabela administratorów
db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME
    )
`);

// Tabela sesji (dla tokenów odświeżania)
db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token TEXT UNIQUE NOT NULL,
        user_type TEXT NOT NULL DEFAULT 'user',
        expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
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
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
db.exec(`
    CREATE TABLE IF NOT EXISTS activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        action TEXT NOT NULL,
        details TEXT,
        ip_address TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

// Tabela wersji launchera
db.exec(`
    CREATE TABLE IF NOT EXISTS launcher_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version TEXT UNIQUE NOT NULL,
        download_url TEXT NOT NULL,
        sha256 TEXT NOT NULL,
        changelog TEXT,
        is_required INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

// ============================================
// TWORZENIE INDEKSÓW
// ============================================

db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_mods_enabled ON mods(is_enabled);
    CREATE INDEX IF NOT EXISTS idx_broadcasts_active ON broadcasts(is_active);
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
    console.log('✅ Utworzono domyślną konfigurację gry');
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

    console.log(`✅ Utworzono konto administratora: ${adminUsername}`);
    console.log('⚠️  ZMIEŃ DOMYŚLNE HASŁO ADMINISTRATORA!');
}

console.log('✅ Baza danych została zainicjalizowana pomyślnie!');
console.log(`📁 Lokalizacja: ${process.env.DATABASE_PATH || './data/launcher.db'}`);

process.exit(0);
