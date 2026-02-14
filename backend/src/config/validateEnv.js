/**
 * Walidacja zmiennych srodowiskowych przy starcie aplikacji
 * Auto-generuje JWT_SECRET jeśli brakuje (zapisuje do pliku dla trwałości)
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const optionalVars = [
    { name: 'PORT', type: 'number', default: 3001 },
    { name: 'NODE_ENV', values: ['development', 'production', 'test'], default: 'development' },
    { name: 'JWT_EXPIRES_IN', default: '7d' },
    { name: 'DATABASE_PATH', default: './data/launcher.db' },
    { name: 'ADMIN_USERNAME', default: 'admin' },
    { name: 'ADMIN_PASSWORD', minLength: 6, sensitive: true },
    { name: 'MC_SERVER_IP', default: 'localhost' },
    { name: 'MC_SERVER_PORT', type: 'number', default: 25565 },
    { name: 'MAX_FILE_SIZE_MB', type: 'number', default: 100 },
    { name: 'BACKUP_INTERVAL_HOURS', type: 'number', default: 6 },
    { name: 'MAX_BACKUPS', type: 'number', default: 30 }
];

/**
 * Zapewnia że JWT_SECRET istnieje.
 * Jeśli nie jest ustawiony w env, próbuje odczytać z pliku .jwt_secret w katalogu danych.
 * Jeśli plik nie istnieje, generuje nowy klucz i zapisuje go.
 */
function ensureJwtSecret() {
    if (process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32) {
        return; // Wszystko OK
    }

    // Ścieżka do pliku z kluczem (obok bazy danych - persistentny volume w Docker)
    const dataDir = path.dirname(process.env.DATABASE_PATH || './data/launcher.db');
    const secretPath = path.join(dataDir, '.jwt_secret');

    // Próbuj odczytać istniejący klucz
    try {
        if (fs.existsSync(secretPath)) {
            const savedSecret = fs.readFileSync(secretPath, 'utf-8').trim();
            if (savedSecret.length >= 32) {
                process.env.JWT_SECRET = savedSecret;
                console.log('🔑 JWT_SECRET załadowany z pliku:', secretPath);
                return;
            }
        }
    } catch (e) {
        // Nie udało się odczytać - wygeneruj nowy
    }

    // Generuj nowy klucz
    const newSecret = crypto.randomBytes(64).toString('hex');
    process.env.JWT_SECRET = newSecret;

    // Zapisz do pliku dla trwałości między restartami
    try {
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        fs.writeFileSync(secretPath, newSecret, { mode: 0o600 });
        console.log('🔑 Wygenerowano nowy JWT_SECRET i zapisano do:', secretPath);
    } catch (e) {
        console.warn('⚠️  Nie udało się zapisać JWT_SECRET do pliku:', e.message);
        console.warn('   Klucz zostanie wygenerowany ponownie po restarcie.');
        console.warn('   Ustaw JWT_SECRET w zmiennych środowiskowych dla trwałości.');
    }
}

export function validateEnvironment() {
    const errors = [];
    const warnings = [];

    // Auto-generuj JWT_SECRET jeśli brakuje
    ensureJwtSecret();

    // Check optional vars
    for (const v of optionalVars) {
        const value = process.env[v.name];
        if (!value) {
            if (v.name === 'ADMIN_PASSWORD' && process.env.NODE_ENV === 'production') {
                warnings.push(`${v.name} not set - using default (CHANGE IN PRODUCTION!)`);
            }
            continue;
        }
        if (v.type === 'number' && isNaN(parseInt(value))) {
            errors.push(`${v.name} must be a valid number, got: ${value}`);
        }
        if (v.values && !v.values.includes(value)) {
            errors.push(`${v.name} must be one of: ${v.values.join(', ')}, got: ${value}`);
        }
        if (v.minLength && value.length < v.minLength) {
            warnings.push(`${v.name} should be at least ${v.minLength} characters for security`);
        }
    }

    // Print warnings
    if (warnings.length > 0) {
        console.warn('⚠️  Environment warnings:');
        warnings.forEach(w => console.warn(`   - ${w}`));
    }

    // Print errors but don't crash - allow startup with defaults
    if (errors.length > 0) {
        console.error('⚠️  Environment validation issues:');
        errors.forEach(e => console.error(`   - ${e}`));
    }

    return { errors, warnings };
}
