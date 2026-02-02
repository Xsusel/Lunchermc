/**
 * Trasy zarządzania systemem
 * Aktualizacje, status systemu, backup
 */
import { Router } from 'express';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { authenticateAdmin, adminLimiter } from '../middleware/index.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ActivityLog } from '../models/index.js';
import { getClientIp } from '../utils/helpers.js';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// Wszystkie trasy wymagają autoryzacji admina
router.use(adminLimiter);
router.use(authenticateAdmin);

// Ścieżka do głównego katalogu projektu
const PROJECT_ROOT = process.env.PROJECT_ROOT || '/opt/xsuslauncher';

// Przechowywanie statusu aktualnej aktualizacji
let updateStatus = {
    inProgress: false,
    step: '',
    logs: [],
    error: null,
    startedAt: null,
    completedAt: null
};

/**
 * GET /api/admin/system/status
 * Pobiera status systemu
 */
router.get('/status', asyncHandler(async (req, res) => {
    let gitInfo = { branch: 'unknown', commit: 'unknown', remote: 'unknown' };
    let diskUsage = { total: 0, used: 0, free: 0 };
    let systemInfo = { uptime: 0, nodeVersion: process.version };

    try {
        // Pobierz info o git
        const { stdout: branch } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: PROJECT_ROOT }).catch(() => ({ stdout: 'unknown' }));
        const { stdout: commit } = await execAsync('git rev-parse --short HEAD', { cwd: PROJECT_ROOT }).catch(() => ({ stdout: 'unknown' }));
        const { stdout: remote } = await execAsync('git remote get-url origin', { cwd: PROJECT_ROOT }).catch(() => ({ stdout: 'unknown' }));

        gitInfo = {
            branch: branch.trim(),
            commit: commit.trim(),
            remote: remote.trim()
        };

        // Sprawdź czy są nowe zmiany
        await execAsync('git fetch origin', { cwd: PROJECT_ROOT }).catch(() => {});
        const { stdout: behindCount } = await execAsync('git rev-list HEAD..origin/HEAD --count 2>/dev/null || echo 0', { cwd: PROJECT_ROOT }).catch(() => ({ stdout: '0' }));
        gitInfo.updatesAvailable = parseInt(behindCount.trim()) > 0;
        gitInfo.behindCommits = parseInt(behindCount.trim()) || 0;

    } catch (error) {
        console.error('Error getting git info:', error);
    }

    try {
        // Pobierz użycie dysku
        const { stdout: df } = await execAsync(`df -B1 ${PROJECT_ROOT} | tail -1`);
        const parts = df.trim().split(/\s+/);
        if (parts.length >= 4) {
            diskUsage = {
                total: parseInt(parts[1]) || 0,
                used: parseInt(parts[2]) || 0,
                free: parseInt(parts[3]) || 0
            };
        }
    } catch (error) {
        console.error('Error getting disk usage:', error);
    }

    systemInfo.uptime = process.uptime();

    res.json({
        success: true,
        data: {
            git: gitInfo,
            disk: diskUsage,
            system: systemInfo,
            updateStatus: {
                inProgress: updateStatus.inProgress,
                step: updateStatus.step,
                error: updateStatus.error,
                startedAt: updateStatus.startedAt,
                completedAt: updateStatus.completedAt
            }
        }
    });
}));

/**
 * GET /api/admin/system/update-logs
 * Pobiera logi ostatniej aktualizacji
 */
router.get('/update-logs', asyncHandler(async (req, res) => {
    res.json({
        success: true,
        data: {
            logs: updateStatus.logs,
            inProgress: updateStatus.inProgress,
            step: updateStatus.step,
            error: updateStatus.error
        }
    });
}));

/**
 * POST /api/admin/system/check-updates
 * Sprawdza dostępne aktualizacje z GitHub
 */
router.post('/check-updates', asyncHandler(async (req, res) => {
    try {
        // Fetch z remote
        await execAsync('git fetch origin', { cwd: PROJECT_ROOT });

        // Sprawdź ile commitów jesteśmy za
        const { stdout: behindCount } = await execAsync('git rev-list HEAD..origin/HEAD --count 2>/dev/null || echo 0', { cwd: PROJECT_ROOT });
        const behind = parseInt(behindCount.trim()) || 0;

        // Pobierz listę zmian
        let changes = [];
        if (behind > 0) {
            const { stdout: logOutput } = await execAsync(
                'git log HEAD..origin/HEAD --oneline --pretty=format:"%h|%s|%an|%ar"',
                { cwd: PROJECT_ROOT }
            );
            changes = logOutput.trim().split('\n').filter(Boolean).map(line => {
                const [hash, message, author, date] = line.split('|');
                return { hash, message, author, date };
            });
        }

        ActivityLog.logAdminAction('system_check_updates', { behind, changesCount: changes.length }, getClientIp(req));

        res.json({
            success: true,
            data: {
                updatesAvailable: behind > 0,
                behindCommits: behind,
                changes
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Błąd sprawdzania aktualizacji: ' + error.message
        });
    }
}));

/**
 * POST /api/admin/system/update
 * Rozpoczyna proces aktualizacji z GitHub
 */
router.post('/update', asyncHandler(async (req, res) => {
    if (updateStatus.inProgress) {
        return res.status(409).json({
            success: false,
            error: 'Aktualizacja jest już w toku'
        });
    }

    // Resetuj status
    updateStatus = {
        inProgress: true,
        step: 'Inicjalizacja...',
        logs: [],
        error: null,
        startedAt: new Date().toISOString(),
        completedAt: null
    };

    const addLog = (message) => {
        const timestamp = new Date().toISOString();
        updateStatus.logs.push({ timestamp, message });
        console.log(`[UPDATE] ${message}`);
    };

    ActivityLog.logAdminAction('system_update_started', {}, getClientIp(req));

    // Odpowiadamy natychmiast, aktualizacja działa w tle
    res.json({
        success: true,
        message: 'Aktualizacja została rozpoczęta'
    });

    // Wykonujemy aktualizację w tle
    (async () => {
        try {
            // Krok 1: Sprawdź status git
            updateStatus.step = 'Sprawdzanie repozytorium...';
            addLog('Sprawdzanie statusu repozytorium...');

            const { stdout: gitStatus } = await execAsync('git status --porcelain', { cwd: PROJECT_ROOT });
            if (gitStatus.trim()) {
                addLog('Wykryto lokalne zmiany - zapisywanie...');
                await execAsync('git stash', { cwd: PROJECT_ROOT }).catch(() => {});
            }

            // Krok 2: Fetch updates
            updateStatus.step = 'Pobieranie aktualizacji...';
            addLog('Pobieranie zmian z GitHub...');
            await execAsync('git fetch origin', { cwd: PROJECT_ROOT });

            // Krok 3: Pull changes
            updateStatus.step = 'Stosowanie zmian...';
            addLog('Stosowanie zmian...');
            const { stdout: pullResult } = await execAsync('git pull origin HEAD', { cwd: PROJECT_ROOT });
            addLog(pullResult || 'Git pull zakończony');

            // Krok 4: Reinstalacja zależności backendu
            updateStatus.step = 'Aktualizacja zależności backendu...';
            addLog('Instalowanie zależności backendu...');
            await execAsync('npm install --omit=dev', { cwd: path.join(PROJECT_ROOT, 'backend') });
            addLog('Zależności backendu zaktualizowane');

            // Krok 5: Reinstalacja zależności panelu
            updateStatus.step = 'Aktualizacja zależności panelu...';
            addLog('Instalowanie zależności panelu admina...');
            await execAsync('npm install', { cwd: path.join(PROJECT_ROOT, 'admin-panel') });
            addLog('Zależności panelu zaktualizowane');

            // Krok 6: Rebuild panelu
            updateStatus.step = 'Budowanie panelu administracyjnego...';
            addLog('Budowanie panelu admina...');
            await execAsync('npm run build', { cwd: path.join(PROJECT_ROOT, 'admin-panel') });
            addLog('Panel zbudowany pomyślnie');

            // Krok 7: Restart Docker (jeśli używamy)
            updateStatus.step = 'Restartowanie usług...';
            addLog('Sprawdzanie Docker Compose...');

            try {
                const { stdout: dockerCheck } = await execAsync('docker compose ps 2>/dev/null || true', { cwd: PROJECT_ROOT });
                if (dockerCheck.includes('Up') || dockerCheck.includes('running')) {
                    addLog('Restartowanie kontenerów Docker...');
                    await execAsync('docker compose down && docker compose up -d --build', {
                        cwd: PROJECT_ROOT,
                        timeout: 300000 // 5 minut timeout
                    });
                    addLog('Kontenery Docker zrestartowane');
                } else {
                    addLog('Docker Compose nie jest używany lub kontenery nie działają');
                }
            } catch (dockerError) {
                addLog('Pomijam restart Docker: ' + dockerError.message);
            }

            // Sukces!
            updateStatus.step = 'Aktualizacja zakończona!';
            updateStatus.completedAt = new Date().toISOString();
            updateStatus.inProgress = false;
            addLog('Aktualizacja zakończona pomyślnie!');

            ActivityLog.logAdminAction('system_update_completed', { success: true }, null);

        } catch (error) {
            updateStatus.error = error.message;
            updateStatus.step = 'Błąd aktualizacji';
            updateStatus.inProgress = false;
            updateStatus.completedAt = new Date().toISOString();
            addLog(`BŁĄD: ${error.message}`);

            ActivityLog.logAdminAction('system_update_failed', { error: error.message }, null);
        }
    })();
}));

/**
 * POST /api/admin/system/restart
 * Restartuje usługi (Docker lub PM2)
 */
router.post('/restart', asyncHandler(async (req, res) => {
    ActivityLog.logAdminAction('system_restart', {}, getClientIp(req));

    try {
        // Sprawdź czy używamy Docker
        const { stdout: dockerCheck } = await execAsync('docker compose ps 2>/dev/null || true', { cwd: PROJECT_ROOT });

        if (dockerCheck.includes('Up') || dockerCheck.includes('running')) {
            // Restart Docker Compose
            res.json({
                success: true,
                message: 'Restartowanie usług Docker...'
            });

            // Wykonaj restart w tle
            execAsync('docker compose restart', { cwd: PROJECT_ROOT });
        } else {
            // Może używamy PM2?
            try {
                await execAsync('pm2 restart all');
                res.json({
                    success: true,
                    message: 'Usługi PM2 zrestartowane'
                });
            } catch {
                res.json({
                    success: true,
                    message: 'Nie wykryto Docker ani PM2 - restart ręczny może być wymagany'
                });
            }
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Błąd restartowania usług: ' + error.message
        });
    }
}));

/**
 * POST /api/admin/system/backup
 * Tworzy backup bazy danych i konfiguracji
 */
router.post('/backup', asyncHandler(async (req, res) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(PROJECT_ROOT, 'backups');
    const backupName = `backup-${timestamp}`;
    const backupPath = path.join(backupDir, backupName);

    try {
        // Utwórz katalog backup
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }
        fs.mkdirSync(backupPath);

        // Kopiuj bazę danych
        const dbPath = path.join(PROJECT_ROOT, 'data', 'db');
        if (fs.existsSync(dbPath)) {
            await execAsync(`cp -r "${dbPath}" "${backupPath}/db"`);
        }

        // Kopiuj .env
        const envPath = path.join(PROJECT_ROOT, '.env');
        if (fs.existsSync(envPath)) {
            await execAsync(`cp "${envPath}" "${backupPath}/.env"`);
        }

        // Kompresuj
        await execAsync(`tar -czf "${backupPath}.tar.gz" -C "${backupDir}" "${backupName}"`);

        // Usuń folder tymczasowy
        await execAsync(`rm -rf "${backupPath}"`);

        ActivityLog.logAdminAction('system_backup', { backupName }, getClientIp(req));

        res.json({
            success: true,
            message: 'Backup został utworzony',
            data: {
                filename: `${backupName}.tar.gz`,
                path: `${backupPath}.tar.gz`
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Błąd tworzenia backupu: ' + error.message
        });
    }
}));

/**
 * GET /api/admin/system/backups
 * Lista wszystkich backupów
 */
router.get('/backups', asyncHandler(async (req, res) => {
    const backupDir = path.join(PROJECT_ROOT, 'backups');

    try {
        if (!fs.existsSync(backupDir)) {
            return res.json({
                success: true,
                data: []
            });
        }

        const files = fs.readdirSync(backupDir)
            .filter(f => f.endsWith('.tar.gz'))
            .map(f => {
                const stats = fs.statSync(path.join(backupDir, f));
                return {
                    filename: f,
                    size: stats.size,
                    created: stats.mtime
                };
            })
            .sort((a, b) => new Date(b.created) - new Date(a.created));

        res.json({
            success: true,
            data: files
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Błąd odczytu backupów: ' + error.message
        });
    }
}));

export default router;
