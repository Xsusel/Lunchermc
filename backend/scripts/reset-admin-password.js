#!/usr/bin/env node
/**
 * Skrypt do resetu hasła administratora
 * Użycie: node scripts/reset-admin-password.js <nowe_haslo>
 * Lub bez argumentu - wygeneruje losowe hasło
 */
import 'dotenv/config';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ścieżka do bazy danych
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../data/launcher.db');

// Połączenie z bazą
const db = new Database(dbPath);

// Pobierz argument hasła lub wygeneruj losowe
let newPassword = process.argv[2];
if (!newPassword) {
    newPassword = randomBytes(12).toString('base64').replace(/[+/=]/g, '').substring(0, 16);
    console.log('Wygenerowano losowe hasło.');
}

// Hashuj hasło
const hashedPassword = bcrypt.hashSync(newPassword, 12);

// Znajdź admina
const admin = db.prepare('SELECT id, username FROM admins LIMIT 1').get();

if (!admin) {
    console.error('Nie znaleziono konta administratora w bazie danych!');
    console.log('Uruchom: npm run init-db aby utworzyć konto admina.');
    process.exit(1);
}

// Zaktualizuj hasło
const result = db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(hashedPassword, admin.id);

if (result.changes > 0) {
    console.log('');
    console.log('='.repeat(50));
    console.log('HASŁO ADMINISTRATORA ZOSTAŁO ZRESETOWANE');
    console.log('='.repeat(50));
    console.log(`Login:    ${admin.username}`);
    console.log(`Hasło:    ${newPassword}`);
    console.log('='.repeat(50));
    console.log('');
    console.log('WAŻNE: Zapisz te dane w bezpiecznym miejscu!');
    console.log('Zmień hasło po pierwszym logowaniu.');
} else {
    console.error('Nie udało się zaktualizować hasła.');
    process.exit(1);
}

db.close();
