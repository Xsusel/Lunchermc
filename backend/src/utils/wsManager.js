/**
 * WebSocket Manager - Rozszerzony system notyfikacji real-time
 * Funkcje:
 * - Zarządzanie klientami z metadanymi
 * - Kanały/pokoje subskrypcji
 * - Heartbeat/keepalive
 * - Różne typy powiadomień
 */
import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import { createLogger } from './logger.js';

const log = createLogger('WebSocket');

class WebSocketManager {
    constructor() {
        this.wss = null;
        this.clients = new Map(); // Map<ws, ClientInfo>
        this.heartbeatInterval = null;
        this.HEARTBEAT_INTERVAL_MS = 30000; // 30 sekund

        // Rate limiting per client
        this.RATE_LIMIT_WINDOW_MS = 10000; // 10 sekund
        this.RATE_LIMIT_MAX_MESSAGES = 30; // max 30 wiadomości na okno
        this.MAX_MESSAGE_SIZE = 4096; // max 4KB per message

        // Typy powiadomień
        this.NotificationTypes = {
            CONNECTED: 'connected',
            PONG: 'pong',
            BROADCAST: 'broadcast',
            MAINTENANCE: 'maintenance',
            SERVER_STATUS: 'server_status',
            PLAYER_COUNT: 'player_count',
            MOD_UPDATE: 'mod_update',
            CONFIG_UPDATE: 'config_update',
            ANNOUNCEMENT: 'announcement',
            ERROR: 'error'
        };
    }

    /**
     * Inicjalizuje WebSocket Server
     */
    init(server, path = '/ws') {
        this.wss = new WebSocketServer({
            server,
            path,
            verifyClient: (info, callback) => {
                // Weryfikacja JWT z query string: ws://host/ws?token=XXX
                try {
                    const url = new URL(info.req.url, 'http://localhost');
                    const token = url.searchParams.get('token');

                    if (token) {
                        const decoded = jwt.verify(token, process.env.JWT_SECRET);
                        // Zapisz decoded w req dla handleConnection
                        info.req.jwtPayload = decoded;
                    }
                    // Pozwalamy też na połączenia bez tokenu (publiczne broadcasts)
                    // ale oznaczamy je jako nieautoryzowane
                    callback(true);
                } catch (err) {
                    log.warn('Odrzucono połączenie WS - nieprawidłowy token', { error: err.message });
                    callback(false, 401, 'Unauthorized');
                }
            }
        });

        this.wss.on('connection', (ws, req) => this.handleConnection(ws, req));

        // Uruchom heartbeat
        this.startHeartbeat();

        log.info('Manager zainicjalizowany', { path });
    }

    /**
     * Obsługuje nowe połączenie
     */
    handleConnection(ws, req) {
        const clientId = this.generateClientId();
        const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
                         req.socket?.remoteAddress || 'unknown';

        // Odczytaj dane JWT z handshake (jeśli podano token)
        const jwtPayload = req.jwtPayload || null;

        // Zapisz informacje o kliencie
        const clientInfo = {
            id: clientId,
            ip: clientIp,
            connectedAt: new Date(),
            lastPing: new Date(),
            subscriptions: new Set(['broadcast']), // Domyślnie subskrybuje broadcasts
            userId: jwtPayload?.id || null,
            username: jwtPayload?.username || null,
            authenticated: !!jwtPayload,
            tokenType: jwtPayload?.type || null,
            isAlive: true,
            // Rate limiting
            messageCount: 0,
            rateLimitWindowStart: Date.now(),
            rateLimitWarnings: 0
        };

        this.clients.set(ws, clientInfo);

        log.info('Nowe połączenie', { clientId, clientIp, totalClients: this.clients.size });

        // Wyślij potwierdzenie
        this.send(ws, {
            type: this.NotificationTypes.CONNECTED,
            data: {
                clientId,
                message: 'Połączono z serwerem',
                subscriptions: Array.from(clientInfo.subscriptions)
            }
        });

        // Obsługa wiadomości
        ws.on('message', (data) => this.handleMessage(ws, data));

        // Obsługa pong (dla heartbeat)
        ws.on('pong', () => {
            const client = this.clients.get(ws);
            if (client) {
                client.isAlive = true;
                client.lastPing = new Date();
            }
        });

        // Obsługa zamknięcia
        ws.on('close', () => {
            const client = this.clients.get(ws);
            log.info('Rozłączono', { clientId: client?.id || 'unknown' });
            this.clients.delete(ws);
        });

        // Obsługa błędów
        ws.on('error', (error) => {
            log.error('Błąd połączenia', error);
            this.clients.delete(ws);
        });
    }

    /**
     * Sprawdza rate limit per klient
     * @returns {boolean} true jeśli wiadomość jest dozwolona
     */
    checkRateLimit(ws, client, dataSize) {
        // Sprawdź rozmiar wiadomości
        if (dataSize > this.MAX_MESSAGE_SIZE) {
            this.send(ws, {
                type: this.NotificationTypes.ERROR,
                data: { message: 'Wiadomość zbyt duża' }
            });
            return false;
        }

        const now = Date.now();

        // Resetuj okno jeśli minęło
        if (now - client.rateLimitWindowStart > this.RATE_LIMIT_WINDOW_MS) {
            client.messageCount = 0;
            client.rateLimitWindowStart = now;
        }

        client.messageCount++;

        // Sprawdź limit
        if (client.messageCount > this.RATE_LIMIT_MAX_MESSAGES) {
            client.rateLimitWarnings++;

            // Po 3 ostrzeżeniach rozłączamy
            if (client.rateLimitWarnings >= 3) {
                log.warn('Klient rozłączony za rate limit', { clientId: client.id, ip: client.ip });
                ws.close(1008, 'Rate limit exceeded');
                this.clients.delete(ws);
                return false;
            }

            this.send(ws, {
                type: this.NotificationTypes.ERROR,
                data: { message: 'Zbyt wiele wiadomości - zwolnij', warning: client.rateLimitWarnings }
            });
            return false;
        }

        return true;
    }

    /**
     * Obsługuje wiadomości od klienta
     */
    handleMessage(ws, data) {
        try {
            const client = this.clients.get(ws);
            if (!client) return;

            // Rate limiting
            const dataStr = data.toString();
            if (!this.checkRateLimit(ws, client, dataStr.length)) return;

            const message = JSON.parse(dataStr);

            switch (message.type) {
                case 'ping':
                    this.send(ws, {
                        type: this.NotificationTypes.PONG,
                        data: { timestamp: new Date().toISOString() }
                    });
                    break;

                case 'subscribe':
                    // Subskrybuj kanały
                    if (Array.isArray(message.channels)) {
                        message.channels.forEach(ch => client.subscriptions.add(ch));
                        this.send(ws, {
                            type: 'subscribed',
                            data: { channels: message.channels }
                        });
                    }
                    break;

                case 'unsubscribe':
                    // Odsubskrybuj kanały
                    if (Array.isArray(message.channels)) {
                        message.channels.forEach(ch => client.subscriptions.delete(ch));
                        this.send(ws, {
                            type: 'unsubscribed',
                            data: { channels: message.channels }
                        });
                    }
                    break;

                case 'auth':
                    // Autoryzacja przez JWT token (bezpieczna identyfikacja)
                    if (message.token) {
                        try {
                            const decoded = jwt.verify(message.token, process.env.JWT_SECRET);
                            client.userId = decoded.id;
                            client.username = decoded.username;
                            client.authenticated = true;
                            client.tokenType = decoded.type;
                            this.send(ws, {
                                type: 'authenticated',
                                data: { userId: decoded.id, username: decoded.username }
                            });
                        } catch (err) {
                            this.send(ws, {
                                type: this.NotificationTypes.ERROR,
                                data: { message: 'Nieprawidłowy token autoryzacji' }
                            });
                        }
                    }
                    break;

                default:
                    log.debug('Nieznany typ wiadomości', { type: message.type });
            }
        } catch (error) {
            log.error('Błąd parsowania wiadomości', error);
        }
    }

    /**
     * Wysyła wiadomość do konkretnego klienta
     */
    send(ws, message) {
        if (ws.readyState === 1) { // OPEN
            ws.send(JSON.stringify({
                ...message,
                timestamp: new Date().toISOString()
            }));
        }
    }

    /**
     * Wysyła broadcast do wszystkich klientów
     */
    broadcast(type, data, channel = 'broadcast') {
        const message = {
            type,
            data,
            channel,
            timestamp: new Date().toISOString()
        };
        const messageStr = JSON.stringify(message);

        let sent = 0;
        this.clients.forEach((clientInfo, ws) => {
            if (ws.readyState === 1 && clientInfo.subscriptions.has(channel)) {
                ws.send(messageStr);
                sent++;
            }
        });

        log.debug('Broadcast wysłany', { type, channel, clientsNotified: sent });
        return sent;
    }

    /**
     * Wysyła powiadomienie o maintenance
     */
    notifyMaintenance(enabled, message = '') {
        return this.broadcast(
            this.NotificationTypes.MAINTENANCE,
            { enabled, message },
            'broadcast'
        );
    }

    /**
     * Wysyła update statusu serwera
     */
    notifyServerStatus(status) {
        return this.broadcast(
            this.NotificationTypes.SERVER_STATUS,
            status,
            'server_status'
        );
    }

    /**
     * Wysyła update liczby graczy
     */
    notifyPlayerCount(online, max) {
        return this.broadcast(
            this.NotificationTypes.PLAYER_COUNT,
            { online, max },
            'player_count'
        );
    }

    /**
     * Wysyła powiadomienie o aktualizacji modów
     */
    notifyModUpdate(action, modInfo) {
        return this.broadcast(
            this.NotificationTypes.MOD_UPDATE,
            { action, mod: modInfo },
            'mods'
        );
    }

    /**
     * Wysyła announcement/broadcast
     */
    sendAnnouncement(title, message, type = 'info') {
        return this.broadcast(
            this.NotificationTypes.ANNOUNCEMENT,
            { title, message, type },
            'broadcast'
        );
    }

    /**
     * Uruchamia heartbeat - sprawdza czy klienci są aktywni
     */
    startHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }

        this.heartbeatInterval = setInterval(() => {
            this.clients.forEach((clientInfo, ws) => {
                if (!clientInfo.isAlive) {
                    log.info('Usuwanie nieaktywnego klienta', { clientId: clientInfo.id });
                    ws.terminate();
                    this.clients.delete(ws);
                    return;
                }

                clientInfo.isAlive = false;
                ws.ping();
            });
        }, this.HEARTBEAT_INTERVAL_MS);

        log.info('Heartbeat uruchomiony');
    }

    /**
     * Zatrzymuje heartbeat
     */
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    /**
     * Pobiera statystyki
     */
    getStats() {
        const channels = {};
        let authenticatedCount = 0;

        this.clients.forEach((clientInfo) => {
            if (clientInfo.userId) authenticatedCount++;

            clientInfo.subscriptions.forEach(ch => {
                channels[ch] = (channels[ch] || 0) + 1;
            });
        });

        return {
            totalClients: this.clients.size,
            authenticatedClients: authenticatedCount,
            channelSubscriptions: channels,
            heartbeatActive: this.heartbeatInterval !== null
        };
    }

    /**
     * Pobiera listę połączonych klientów
     */
    getConnectedClients() {
        const list = [];
        this.clients.forEach((clientInfo) => {
            list.push({
                id: clientInfo.id,
                ip: clientInfo.ip,
                connectedAt: clientInfo.connectedAt,
                lastPing: clientInfo.lastPing,
                userId: clientInfo.userId,
                username: clientInfo.username,
                subscriptions: Array.from(clientInfo.subscriptions)
            });
        });
        return list;
    }

    /**
     * Generuje unikalne ID klienta
     */
    generateClientId() {
        return `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Zamyka wszystkie połączenia
     */
    closeAll() {
        this.stopHeartbeat();
        this.clients.forEach((clientInfo, ws) => {
            ws.close(1000, 'Serwer jest zamykany');
        });
        this.clients.clear();
        log.info('Wszystkie połączenia zamknięte');
    }
}

// Eksportuj singleton
const wsManager = new WebSocketManager();
export default wsManager;
