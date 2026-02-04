/**
 * Utility do automatycznych backupów bazy danych SQLite
 * Funkcje:
 * - Automatyczne backupy (cron-style)
 * - Manualne backupy
 * - Przywracanie z backupu
 * - Rotacja (usuwanie starych backupów)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Konfiguracja
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '../../data/backups');
const MAX_BACKUPS = parseInt(process.env.MAX_BACKUPS) || 30; // Maksymalna liczba backupów
const BACKUP_INTERVAL_MS = parseInt(process.env.BACKUP_INTERVAL_HOURS) * 60 * 60 * 1000 || 6 * 60 * 60 * 1000; // Co 6 godzin

// Upewnij się, że folder backupów istnieje
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

/**
 * Generuje nazwę pliku backupu z timestamp
 */
function generateBackupFilename(prefix = 'backup') {
    const now = new Date();
    const timestamp = now.toISOString()
        .replace(/[:.]/g, '-')
        .replace('T', '_')
        .split('.')[0];
    return `${prefix}_${timestamp}.db`;
}

/**
 * Tworzy backup bazy danych
 */
export async function createBackup(options = {}) {
    const { type = 'scheduled', description = '' } = options;

    try {
        const filename = generateBackupFilename(type);
        const backupPath = path.join(BACKUP_DIR, filename);

        // Użyj wbudowanej funkcji backup SQLite (bardzo szybka, bezpieczna dla WAL)
        db.backup(backupPath);

        // Zapisz metadane backupu
        const metadata = {
            filename,
            type,
            description,
            createdAt: new Date().toISOString(),
            size: fs.statSync(backupPath).size
        };

        const metadataPath = path.join(BACKUP_DIR, `${filename}.meta.json`);
        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

        console.log(`[Backup] Utworzono backup: ${filename} (${formatSize(metadata.size)})`);

        // Rotacja starych backupów
        await rotateBackups();

        return {
            success: true,
            filename,
            path: backupPath,
            size: metadata.size,
            createdAt: metadata.createdAt
        };
    } catch (error) {
        console.error('[Backup] Błąd tworzenia backupu:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Lista dostępnych backupów
 */
export function listBackups() {
    try {
        const files = fs.readdirSync(BACKUP_DIR);
        const backups = [];

        for (const file of files) {
            if (file.endsWith('.db')) {
                const metadataPath = path.join(BACKUP_DIR, `${file}.meta.json`);
                const filePath = path.join(BACKUP_DIR, file);
                const stats = fs.statSync(filePath);

                let metadata = {
                    filename: file,
                    type: 'unknown',
                    description: '',
                    createdAt: stats.mtime.toISOString(),
                    size: stats.size
                };

                // Spróbuj wczytać metadane
                if (fs.existsSync(metadataPath)) {
                    try {
                        const meta = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
                        metadata = { ...metadata, ...meta };
                    } catch (e) {
                        // Ignoruj błędy parsowania
                    }
                }

                backups.push(metadata);
            }
        }

        // Sortuj od najnowszego
        backups.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        return backups;
    } catch (error) {
        console.error('[Backup] Błąd listowania backupów:', error);
        return [];
    }
}

/**
 * Przywraca bazę danych z backupu
 * UWAGA: Wymaga restartu serwera po przywróceniu!
 */
export async function restoreBackup(filename) {
    try {
        const backupPath = path.join(BACKUP_DIR, filename);

        if (!fs.existsSync(backupPath)) {
            return {
                success: false,
                error: 'Backup nie istnieje'
            };
        }

        // Pobierz ścieżkę głównej bazy
        const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../../data/launcher.db');

        // Utwórz backup aktualnej bazy przed przywróceniem
        const preRestoreBackup = await createBackup({
            type: 'pre-restore',
            description: `Backup przed przywróceniem: ${filename}`
        });

        if (!preRestoreBackup.success) {
            return {
                success: false,
                error: 'Nie udało się utworzyć backupu przed przywróceniem'
            };
        }

        // Zamknij połączenie z bazą
        db.close();

        // Skopiuj backup do głównej lokalizacji
        fs.copyFileSync(backupPath, dbPath);

        console.log(`[Backup] Przywrócono z: ${filename}`);

        return {
            success: true,
            message: 'Baza danych przywrócona. Wymagany restart serwera.',
            preRestoreBackup: preRestoreBackup.filename
        };
    } catch (error) {
        console.error('[Backup] Błąd przywracania:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Usuwa backup
 */
export function deleteBackup(filename) {
    try {
        const backupPath = path.join(BACKUP_DIR, filename);
        const metadataPath = path.join(BACKUP_DIR, `${filename}.meta.json`);

        if (!fs.existsSync(backupPath)) {
            return { success: false, error: 'Backup nie istnieje' };
        }

        fs.unlinkSync(backupPath);

        if (fs.existsSync(metadataPath)) {
            fs.unlinkSync(metadataPath);
        }

        console.log(`[Backup] Usunięto: ${filename}`);
        return { success: true };
    } catch (error) {
        console.error('[Backup] Błąd usuwania:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Rotacja - usuwa stare backupy ponad limit
 */
async function rotateBackups() {
    try {
        const backups = listBackups();

        // Zachowaj tylko scheduled backupy przy rotacji
        const scheduledBackups = backups.filter(b => b.type === 'scheduled');

        if (scheduledBackups.length > MAX_BACKUPS) {
            const toDelete = scheduledBackups.slice(MAX_BACKUPS);

            for (const backup of toDelete) {
                deleteBackup(backup.filename);
                console.log(`[Backup] Rotacja - usunięto: ${backup.filename}`);
            }
        }
    } catch (error) {
        console.error('[Backup] Błąd rotacji:', error);
    }
}

/**
 * Formatuje rozmiar pliku
 */
function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Pobiera statystyki backupów
 */
export function getBackupStats() {
    const backups = listBackups();
    const totalSize = backups.reduce((sum, b) => sum + b.size, 0);

    return {
        count: backups.length,
        totalSize,
        totalSizeFormatted: formatSize(totalSize),
        oldestBackup: backups.length > 0 ? backups[backups.length - 1] : null,
        newestBackup: backups.length > 0 ? backups[0] : null,
        backupDir: BACKUP_DIR,
        maxBackups: MAX_BACKUPS,
        intervalHours: BACKUP_INTERVAL_MS / (60 * 60 * 1000)
    };
}

// ============================================
// AUTOMATYCZNE BACKUPY (SCHEDULER)
// ============================================

let backupInterval = null;

/**
 * Uruchamia automatyczne backupy
 */
export function startAutoBackup() {
    if (backupInterval) {
        console.log('[Backup] Auto-backup już działa');
        return;
    }

    // Pierwszy backup po 1 minucie od startu (pozwól serwerowi się uruchomić)
    setTimeout(async () => {
        console.log('[Backup] Wykonuję pierwszy backup po starcie...');
        await createBackup({ type: 'scheduled', description: 'Backup przy starcie serwera' });
    }, 60 * 1000);

    // Następne backupy co BACKUP_INTERVAL_MS
    backupInterval = setInterval(async () => {
        console.log('[Backup] Wykonuję zaplanowany backup...');
        await createBackup({ type: 'scheduled', description: 'Automatyczny backup' });
    }, BACKUP_INTERVAL_MS);

    console.log(`[Backup] Auto-backup uruchomiony (co ${BACKUP_INTERVAL_MS / (60 * 60 * 1000)} godzin)`);
}

/**
 * Zatrzymuje automatyczne backupy
 */
export function stopAutoBackup() {
    if (backupInterval) {
        clearInterval(backupInterval);
        backupInterval = null;
        console.log('[Backup] Auto-backup zatrzymany');
    }
}

export default {
    createBackup,
    listBackups,
    restoreBackup,
    deleteBackup,
    getBackupStats,
    startAutoBackup,
    stopAutoBackup
};
