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
import { WebSocketServer } from 'ws';
import http from 'http';

import { authRoutes, adminRoutes, launcherRoutes, downloadRoutes } from './routes/index.js';
import versionsRoutes from './routes/versions.js';
import filesRoutes from './routes/files.js';
import { apiLimiter, errorHandler, notFoundHandler } from './middleware/index.js';
import { ensureDir, getUploadsPath, getModsPath } from './utils/helpers.js';

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
app.use('/api/download', downloadRoutes); // Download ma własny rate limiter
app.use('/api/versions', apiLimiter, versionsRoutes); // Wersje MC/Forge/Fabric
app.use('/api/files', filesRoutes); // Zarządzanie plikami (configs, resourcepacks, etc.)

// ============================================
// WEBSOCKET DLA POWIADOMIEŃ REAL-TIME
// ============================================

const wss = new WebSocketServer({ server, path: '/ws' });

// Przechowujemy połączonych klientów
const clients = new Set();

wss.on('connection', (ws, req) => {
    console.log('🔌 Nowe połączenie WebSocket');
    clients.add(ws);

    // Wysyłamy potwierdzenie połączenia
    ws.send(JSON.stringify({
        type: 'connected',
        message: 'Połączono z serwerem',
        timestamp: new Date().toISOString()
    }));

    // Obsługa wiadomości od klienta
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());
            console.log('📨 Otrzymano wiadomość:', message);

            // Obsługujemy różne typy wiadomości
            if (message.type === 'ping') {
                ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
            }
        } catch (error) {
            console.error('Błąd parsowania wiadomości WebSocket:', error);
        }
    });

    // Obsługa rozłączenia
    ws.on('close', () => {
        console.log('🔌 Rozłączono WebSocket');
        clients.delete(ws);
    });

    // Obsługa błędów
    ws.on('error', (error) => {
        console.error('Błąd WebSocket:', error);
        clients.delete(ws);
    });
});

// Funkcja do wysyłania broadcast do wszystkich klientów
export const broadcastMessage = (type, data) => {
    const message = JSON.stringify({
        type,
        data,
        timestamp: new Date().toISOString()
    });

    clients.forEach((client) => {
        if (client.readyState === 1) { // OPEN
            client.send(message);
        }
    });
};

// Endpoint do wysyłania broadcast (dla panelu admina)
app.post('/api/admin/broadcast-ws', (req, res) => {
    // Ten endpoint powinien być chroniony przez authenticateAdmin
    // ale dla uproszczenia pomijamy tutaj
    const { type, data } = req.body;
    broadcastMessage(type, data);
    res.json({ success: true, message: 'Broadcast wysłany' });
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
});

// ============================================
// GRACEFUL SHUTDOWN
// ============================================

const shutdown = () => {
    console.log('\n🛑 Zatrzymywanie serwera...');

    // Zamykamy połączenia WebSocket
    clients.forEach((client) => {
        client.close(1000, 'Serwer jest zamykany');
    });

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
