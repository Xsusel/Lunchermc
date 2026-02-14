/**
 * Główny plik serwera API
 * Minecraft Launcher Backend
 */
import 'dotenv/config';
import { validateEnvironment } from './config/validateEnv.js';
validateEnvironment();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';

import { authRoutes, adminRoutes, launcherRoutes, downloadRoutes, systemRoutes, skinsRoutes } from './routes/index.js';
import versionsRoutes from './routes/versions.js';
import filesRoutes from './routes/files.js';
import { apiLimiter, errorHandler, notFoundHandler } from './middleware/index.js';
import { ensureDir, getUploadsPath, getModsPath } from './utils/helpers.js';
import { startAutoBackup, stopAutoBackup, startLogRetention, stopLogRetention } from './utils/backup.js';
import wsManager from './utils/wsManager.js';
import { ScheduledMaintenance, Server } from './models/index.js';
import { createLogger } from './utils/logger.js';
import { runMigrations } from './config/migrations.js';
import { ensureCriticalSchema } from './config/ensureSchema.js';
import { notifyServerStart } from './utils/discord.js';

const log = createLogger('Server');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Tworzymy aplikację Express
const app = express();
const PORT = process.env.PORT || 3001;

// Tworzymy serwer HTTP
const server = http.createServer(app);

// ============================================
// KONFIGURACJA MIDDLEWARE
// ============================================

// Bezpieczeństwo - nagłówki HTTP
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'blob:'],
            connectSrc: ["'self'", 'ws:', 'wss:'],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            frameSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
        }
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

// CORS - pozwalamy na żądania z panelu i launchera
const corsOrigins = [process.env.ADMIN_URL, process.env.API_URL].filter(Boolean);
app.use(cors({
    origin: process.env.NODE_ENV === 'production' && corsOrigins.length > 0
        ? corsOrigins
        : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Kompresja odpowiedzi (gzip/brotli)
app.use(compression({
    threshold: 1024, // Kompresuj odpowiedzi > 1KB
    filter: (req, res) => {
        if (req.headers['x-no-compression']) return false;
        return compression.filter(req, res);
    }
}));

// Parsowanie JSON i form data
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logowanie żądań (tylko w trybie dev)
if (process.env.NODE_ENV !== 'production') {
    app.use(morgan('dev'));
} else {
    app.use(morgan('combined'));
}

// Trust proxy (dla Nginx)
app.set('trust proxy', 1);

// ============================================
// INICJALIZACJA KATALOGÓW
// ============================================

ensureDir(getUploadsPath());
ensureDir(getModsPath());
ensureDir(path.join(getUploadsPath(), 'launcher'));
ensureDir(path.join(getUploadsPath(), 'datapacks'));
ensureDir(path.join(getUploadsPath(), 'defaultconfigs'));
ensureDir(path.join(getUploadsPath(), 'resourcepacks'));
ensureDir(path.join(getUploadsPath(), 'shaderpacks'));
ensureDir(path.join(getUploadsPath(), 'configs'));
ensureDir(path.join(getUploadsPath(), 'skins'));
ensureDir(path.join(getUploadsPath(), 'capes'));
ensureDir(path.join(__dirname, '../data'));

// Upewnij się że krytyczne kolumny istnieją (safety net dla istniejących baz)
ensureCriticalSchema();

// Uruchom migracje bazy danych
runMigrations();

// Inicjalizacja tabeli serwerów (auto-tworzenie + migracja)
Server.initTable();
Server.migrateFromGameConfig();

// ============================================
// TRASY API
// ============================================

// Główna trasa - info o API
app.get('/api', (req, res) => {
    res.json({
        success: true,
        message: 'Minecraft Launcher API',
        version: '1.1.0',
        endpoints: {
            auth: '/api/auth',
            launcher: '/api/launcher',
            admin: '/api/admin',
            download: '/api/download',
            skins: '/api/skins',
            docs: '/api/docs'
        }
    });
});

// ============================================
// DOKUMENTACJA API (OpenAPI-style)
// ============================================
app.get('/api/docs', (req, res) => {
    res.json({
        openapi: '3.0.3',
        info: {
            title: 'XsusLauncher API',
            version: '1.1.0',
            description: 'API dla niestandardowego launchera Minecraft (Non-Premium)'
        },
        paths: {
            '/api/auth/register': {
                post: { summary: 'Rejestracja gracza', tags: ['Auth'],
                    requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { username: { type: 'string', minLength: 3, maxLength: 16 }, password: { type: 'string', minLength: 8 }, captcha_id: { type: 'string' }, captcha_answer: { type: 'string' } }, required: ['username', 'password'] } } } } }
            },
            '/api/auth/login': {
                post: { summary: 'Logowanie gracza', tags: ['Auth'],
                    requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { username: { type: 'string' }, password: { type: 'string' } }, required: ['username', 'password'] } } } } }
            },
            '/api/auth/verify': {
                post: { summary: 'Weryfikacja tokenu', tags: ['Auth'], security: [{ bearerAuth: [] }] }
            },
            '/api/auth/me': {
                get: { summary: 'Dane zalogowanego użytkownika', tags: ['Auth'], security: [{ bearerAuth: [] }] }
            },
            '/api/auth/change-password': {
                post: { summary: 'Zmiana hasła', tags: ['Auth'], security: [{ bearerAuth: [] }] }
            },
            '/api/auth/forgot-password': {
                post: { summary: 'Pobierz pytanie bezpieczeństwa', tags: ['Auth'] }
            },
            '/api/auth/reset-password': {
                post: { summary: 'Reset hasła (pytanie bezpieczeństwa)', tags: ['Auth'] }
            },
            '/api/auth/captcha': {
                get: { summary: 'Pobierz wyzwanie CAPTCHA', tags: ['Auth'] }
            },
            '/api/auth/appeal': {
                post: { summary: 'Złóż apelację od bana', tags: ['Auth'] }
            },
            '/api/launcher/config': {
                get: { summary: 'Konfiguracja gry (wersja, mody, broadcasts)', tags: ['Launcher'] }
            },
            '/api/launcher/manifest': {
                get: { summary: 'Manifest plików do synchronizacji', tags: ['Launcher'] }
            },
            '/api/launcher/verify-files': {
                post: { summary: 'Weryfikacja integralności plików', tags: ['Launcher'] }
            },
            '/api/launcher/news': {
                get: { summary: 'Lista newsów', tags: ['Launcher'] }
            },
            '/api/download/mods/:filename': {
                get: { summary: 'Pobierz plik moda', tags: ['Download'] }
            },
            '/api/download/launcher/:filename': {
                get: { summary: 'Pobierz plik launchera (auto-update)', tags: ['Download'] }
            },
            '/api/download/skins/:filename': {
                get: { summary: 'Pobierz skin gracza', tags: ['Download'] }
            },
            '/api/skins/upload': {
                post: { summary: 'Upload skina', tags: ['Skins'], security: [{ bearerAuth: [] }] }
            },
            '/api/admin/login': {
                post: { summary: 'Logowanie admina', tags: ['Admin'] }
            },
            '/api/admin/dashboard': {
                get: { summary: 'Statystyki dashboard', tags: ['Admin'], security: [{ bearerAuth: [] }] }
            },
            '/api/admin/users': {
                get: { summary: 'Lista graczy', tags: ['Admin'], security: [{ bearerAuth: [] }] }
            },
            '/api/admin/config': {
                get: { summary: 'Konfiguracja gry', tags: ['Admin'], security: [{ bearerAuth: [] }] },
                put: { summary: 'Aktualizuj konfigurację', tags: ['Admin'], security: [{ bearerAuth: [] }] }
            },
            '/api/admin/mods': {
                get: { summary: 'Lista modów', tags: ['Admin'], security: [{ bearerAuth: [] }] },
                post: { summary: 'Dodaj moda', tags: ['Admin'], security: [{ bearerAuth: [] }] }
            },
            '/api/admin/backups': {
                get: { summary: 'Lista backupów', tags: ['Admin'], security: [{ bearerAuth: [] }] },
                post: { summary: 'Utwórz backup', tags: ['Admin'], security: [{ bearerAuth: [] }] }
            },
            '/api/admin/appeals': {
                get: { summary: 'Lista apelacji od banów', tags: ['Admin'], security: [{ bearerAuth: [] }] }
            },
            '/api/admin/stats/overview': {
                get: { summary: 'Statystyki systemowe', tags: ['Admin'], security: [{ bearerAuth: [] }] }
            },
            '/api/versions/minecraft': {
                get: { summary: 'Lista wersji Minecraft', tags: ['Versions'] }
            },
            '/api/versions/forge/:mcVersion': {
                get: { summary: 'Wersje Forge dla MC', tags: ['Versions'] }
            },
            '/api/health': {
                get: { summary: 'Health check', tags: ['System'] }
            },
            '/api/health/detailed': {
                get: { summary: 'Rozszerzony health check', tags: ['System'] }
            }
        },
        components: {
            securitySchemes: {
                bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
            }
        }
    });
});

// Health check - prosty
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Health check - rozszerzony (dla monitoringu)
app.get('/api/health/detailed', async (req, res) => {
    const os = await import('os');
    const fs = await import('fs');

    // Informacje o pamięci
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    // Informacje o procesie
    const processMemory = process.memoryUsage();

    // Sprawdź status bazy danych
    let dbStatus = 'unknown';
    try {
        const db = (await import('./config/database.js')).default;
        db.prepare('SELECT 1').get();
        dbStatus = 'connected';
    } catch (error) {
        dbStatus = 'error: ' + error.message;
    }

    // Sprawdź dysk (folder uploads)
    let diskStatus = { available: 0, total: 0 };
    try {
        const uploadsPath = getUploadsPath();
        const stats = fs.statSync(uploadsPath);
        // Na Linuxie możemy użyć statfs, ale tu uproszczenie
        diskStatus = { path: uploadsPath, writable: true };
    } catch (error) {
        diskStatus = { error: error.message };
    }

    // WebSocket status
    const wsStats = wsManager.getStats();

    res.json({
        success: true,
        status: dbStatus === 'connected' ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        uptime: {
            seconds: Math.floor(process.uptime()),
            formatted: formatUptime(process.uptime())
        },
        system: {
            platform: os.platform(),
            arch: os.arch(),
            nodeVersion: process.version,
            cpuCount: os.cpus().length,
            loadAverage: os.loadavg()
        },
        memory: {
            system: {
                total: formatBytes(totalMem),
                free: formatBytes(freeMem),
                used: formatBytes(usedMem),
                usagePercent: Math.round((usedMem / totalMem) * 100)
            },
            process: {
                heapUsed: formatBytes(processMemory.heapUsed),
                heapTotal: formatBytes(processMemory.heapTotal),
                rss: formatBytes(processMemory.rss),
                external: formatBytes(processMemory.external)
            }
        },
        database: {
            status: dbStatus
        },
        websocket: wsStats,
        disk: diskStatus,
        env: process.env.NODE_ENV || 'development'
    });
});

// Helper funkcje
function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    parts.push(`${secs}s`);

    return parts.join(' ');
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Trasy z rate limitingiem
app.use('/api/auth', apiLimiter, authRoutes);
app.use('/api/launcher', apiLimiter, launcherRoutes);
app.use('/api/admin', adminRoutes); // Admin ma własny rate limiter
app.use('/api/admin/system', systemRoutes); // Zarządzanie systemem
app.use('/api/download', downloadRoutes); // Download ma własny rate limiter
app.use('/api/versions', apiLimiter, versionsRoutes); // Wersje MC/Forge/Fabric
app.use('/api/files', filesRoutes); // Zarządzanie plikami (configs, resourcepacks, etc.)
app.use('/api/skins', apiLimiter, skinsRoutes); // System skinów graczy (non-premium)

// ============================================
// WEBSOCKET DLA POWIADOMIEŃ REAL-TIME
// ============================================

// Inicjalizuj WebSocket Manager
wsManager.init(server, '/ws');

// Funkcja do wysyłania broadcast (eksportowana dla kompatybilności)
export const broadcastMessage = (type, data) => {
    return wsManager.broadcast(type, data);
};

// Endpoint do wysyłania broadcast (dla panelu admina)
app.post('/api/admin/broadcast-ws', (req, res) => {
    const { type, data, channel } = req.body;
    const sent = wsManager.broadcast(type, data, channel || 'broadcast');
    res.json({ success: true, message: 'Broadcast wysłany', clientsNotified: sent });
});

// Endpoint - statystyki WebSocket
app.get('/api/admin/ws/stats', (req, res) => {
    res.json({
        success: true,
        data: wsManager.getStats()
    });
});

// Endpoint - połączeni klienci
app.get('/api/admin/ws/clients', (req, res) => {
    res.json({
        success: true,
        data: wsManager.getConnectedClients()
    });
});

// Endpoint - wysłanie announcement
app.post('/api/admin/ws/announcement', (req, res) => {
    const { title, message, type } = req.body;
    if (!title || !message) {
        return res.status(400).json({ success: false, error: 'Wymagane: title, message' });
    }
    const sent = wsManager.sendAnnouncement(title, message, type || 'info');
    res.json({ success: true, message: 'Announcement wysłany', clientsNotified: sent });
});

// Endpoint - powiadomienie o maintenance
app.post('/api/admin/ws/maintenance', (req, res) => {
    const { enabled, message } = req.body;
    const sent = wsManager.notifyMaintenance(!!enabled, message || '');
    res.json({ success: true, message: 'Powiadomienie maintenance wysłane', clientsNotified: sent });
});

// ============================================
// OBSŁUGA BŁĘDÓW
// ============================================

// 404 dla nieznalezionych tras
app.use(notFoundHandler);

// Globalny handler błędów
app.use(errorHandler);

// ============================================
// URUCHOMIENIE SERWERA
// ============================================

server.listen(PORT, () => {
    console.log('');
    console.log('🎮 ═══════════════════════════════════════════════════════');
    console.log('   MINECRAFT LAUNCHER API SERVER');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`📡 Serwer uruchomiony na porcie: ${PORT}`);
    console.log(`🌍 URL: http://localhost:${PORT}`);
    console.log(`📁 Tryb: ${process.env.NODE_ENV || 'development'}`);
    console.log('');
    console.log('🔗 Dostępne endpointy:');
    console.log(`   • API Info:    http://localhost:${PORT}/api`);
    console.log(`   • Health:      http://localhost:${PORT}/api/health`);
    console.log(`   • Auth:        http://localhost:${PORT}/api/auth`);
    console.log(`   • Launcher:    http://localhost:${PORT}/api/launcher`);
    console.log(`   • Admin:       http://localhost:${PORT}/api/admin`);
    console.log(`   • Download:    http://localhost:${PORT}/api/download`);
    console.log(`   • WebSocket:   ws://localhost:${PORT}/ws`);
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');

    // Uruchom automatyczne backupy bazy danych
    startAutoBackup();

    // Uruchom retencję logów i sesji
    startLogRetention();

    // Uruchom scheduler dla scheduled maintenance
    startMaintenanceScheduler();

    // Powiadomienie Discord o starcie serwera (async, nie blokuje)
    notifyServerStart().catch(() => {});
});

// ============================================
// SCHEDULER DLA SCHEDULED MAINTENANCE
// ============================================

let maintenanceSchedulerInterval = null;

/**
 * Uruchamia scheduler sprawdzający zaplanowane maintenance
 */
function startMaintenanceScheduler() {
    if (maintenanceSchedulerInterval) {
        return;
    }

    // Sprawdzaj co minutę
    maintenanceSchedulerInterval = setInterval(() => {
        try {
            const result = ScheduledMaintenance.checkAndApplyMaintenance();

            if (result.action === 'enabled') {
                // Powiadom klientów WebSocket o włączeniu maintenance
                wsManager.notifyMaintenance(true, result.maintenance.message || result.maintenance.title);
            } else if (result.action === 'disabled') {
                // Powiadom klientów WebSocket o wyłączeniu maintenance
                wsManager.notifyMaintenance(false, '');
            }

            // Sprawdź nadchodzące maintenance i wyślij powiadomienia
            const approaching = ScheduledMaintenance.getApproachingMaintenance(5); // w ciągu 5 minut
            for (const maint of approaching) {
                const startTime = new Date(maint.start_time);
                const now = new Date();
                const minutesLeft = Math.ceil((startTime - now) / (1000 * 60));

                if (minutesLeft > 0 && minutesLeft <= 5) {
                    wsManager.sendAnnouncement(
                        '⚠️ Przerwa techniczna',
                        `Za ${minutesLeft} minut${minutesLeft === 1 ? 'ę' : minutesLeft < 5 ? 'y' : ''} rozpocznie się przerwa techniczna: ${maint.title}`,
                        'warning'
                    );
                }
            }
        } catch (error) {
            log.error('MaintenanceScheduler: Błąd', error);
        }
    }, 60 * 1000); // Co minutę

    log.info('MaintenanceScheduler: Scheduler uruchomiony');
}

/**
 * Zatrzymuje scheduler maintenance
 */
function stopMaintenanceScheduler() {
    if (maintenanceSchedulerInterval) {
        clearInterval(maintenanceSchedulerInterval);
        maintenanceSchedulerInterval = null;
        log.info('MaintenanceScheduler: Scheduler zatrzymany');
    }
}

// ============================================
// GRACEFUL SHUTDOWN
// ============================================

const shutdown = () => {
    log.info('Zatrzymywanie serwera...');

    // Zatrzymaj automatyczne backupy
    stopAutoBackup();

    // Zatrzymaj retencję logów
    stopLogRetention();

    // Zatrzymaj scheduler maintenance
    stopMaintenanceScheduler();

    // Zamykamy połączenia WebSocket
    wsManager.closeAll();

    server.close(() => {
        log.info('Serwer został zatrzymany');
        process.exit(0);
    });

    // Timeout na wymuszone zamknięcie
    setTimeout(() => {
        log.error('Wymuszanie zamknięcia...');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export default app;
