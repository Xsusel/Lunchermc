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

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

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
});

// ============================================
// GRACEFUL SHUTDOWN
// ============================================

const shutdown = () => {
    console.log('\n🛑 Zatrzymywanie serwera...');

    // Zatrzymaj automatyczne backupy
    stopAutoBackup();

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
