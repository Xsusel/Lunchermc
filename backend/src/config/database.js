/**
 * Konfiguracja połączenia z bazą danych SQLite
 * Używamy better-sqlite3 dla lepszej wydajności
 */
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ścieżka do bazy danych
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../../data/launcher.db');

// Upewniamy się, że katalog istnieje
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

// Tworzymy połączenie z bazą danych
const db = new Database(dbPath, {
    verbose: process.env.NODE_ENV === 'development' ? console.log : null
});

// Włączamy obsługę kluczy obcych
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export default db;
