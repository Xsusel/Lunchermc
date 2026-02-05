/**
 * Główny plik serwera API
 * Minecraft Launcher Backend
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';

import { authRoutes, adminRoutes, launcherRoutes, downloadRoutes, systemRoutes } from './routes/index.js';
import versionsRoutes from './routes/versions.js';
import filesRoutes from './routes/files.js';
import { apiLimiter, errorHandler, notFoundHandler } from './middleware/index.js';
import { ensureDir, getUploadsPath, getModsPath } from './utils/helpers.js';
import { startAutoBackup, stopAutoBackup } from './utils/backup.js';
import wsManager from './utils/wsManager.js';
import { ScheduledMaintenance } from './models/index.js';

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
    contentSecurityPolicy: false // Wyłączamy dla panelu admina
}));

// CORS - pozwalamy na żądania z panelu i launchera
app.use(cors({
    origin: process.env.NODE_ENV === 'production'
        ? [process.env.ADMIN_URL, process.env.API_URL].filter(Boolean)
        : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
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
ensureDir(path.join(__dirname, '../data'));

// ============================================
// TRASY API
// ============================================

// Główna trasa - info o API
app.get('/api', (req, res) => {
    res.json({
        success: true,
        message: 'Minecraft Launcher API',
        version: '1.0.0',
        endpoints: {
            auth: '/api/auth',
            launcher: '/api/launcher',
            admin: '/api/admin',
            download: '/api/download'
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

    // Uruchom scheduler dla scheduled maintenance
    startMaintenanceScheduler();
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
            console.error('[MaintenanceScheduler] Błąd:', error);
        }
    }, 60 * 1000); // Co minutę

    console.log('[MaintenanceScheduler] Scheduler uruchomiony');
}

/**
 * Zatrzymuje scheduler maintenance
 */
function stopMaintenanceScheduler() {
    if (maintenanceSchedulerInterval) {
        clearInterval(maintenanceSchedulerInterval);
        maintenanceSchedulerInterval = null;
        console.log('[MaintenanceScheduler] Scheduler zatrzymany');
    }
}

// ============================================
// GRACEFUL SHUTDOWN
// ============================================

const shutdown = () => {
    console.log('\n🛑 Zatrzymywanie serwera...');

    // Zatrzymaj automatyczne backupy
    stopAutoBackup();

    // Zatrzymaj scheduler maintenance
    stopMaintenanceScheduler();

    // Zamykamy połączenia WebSocket
    wsManager.closeAll();

    server.close(() => {
        console.log('✅ Serwer został zatrzymany');
        process.exit(0);
    });

    // Timeout na wymuszone zamknięcie
    setTimeout(() => {
        console.error('⚠️ Wymuszanie zamknięcia...');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export default app;
