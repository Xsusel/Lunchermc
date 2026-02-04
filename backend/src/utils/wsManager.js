/**
 * WebSocket Manager - Rozszerzony system notyfikacji real-time
 * Funkcje:
 * - Zarządzanie klientami z metadanymi
 * - Kanały/pokoje subskrypcji
 * - Heartbeat/keepalive
 * - Różne typy powiadomień
 */
import { WebSocketServer } from 'ws';

class WebSocketManager {
    constructor() {
        this.wss = null;
        this.clients = new Map(); // Map<ws, ClientInfo>
        this.heartbeatInterval = null;
        this.HEARTBEAT_INTERVAL_MS = 30000; // 30 sekund

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
        this.wss = new WebSocketServer({ server, path });

        this.wss.on('connection', (ws, req) => this.handleConnection(ws, req));

        // Uruchom heartbeat
        this.startHeartbeat();

        console.log(`[WebSocket] Manager zainicjalizowany na ścieżce: ${path}`);
    }

    /**
     * Obsługuje nowe połączenie
     */
    handleConnection(ws, req) {
        const clientId = this.generateClientId();
        const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
                         req.socket?.remoteAddress || 'unknown';

        // Zapisz informacje o kliencie
        const clientInfo = {
            id: clientId,
            ip: clientIp,
            connectedAt: new Date(),
            lastPing: new Date(),
            subscriptions: new Set(['broadcast']), // Domyślnie subskrybuje broadcasts
            userId: null,
            username: null,
            isAlive: true
        };

        this.clients.set(ws, clientInfo);

        console.log(`[WebSocket] Nowe połączenie: ${clientId} z ${clientIp} (${this.clients.size} klientów)`);

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
            console.log(`[WebSocket] Rozłączono: ${client?.id || 'unknown'}`);
            this.clients.delete(ws);
        });

        // Obsługa błędów
        ws.on('error', (error) => {
            console.error('[WebSocket] Błąd:', error);
            this.clients.delete(ws);
        });
    }

    /**
     * Obsługuje wiadomości od klienta
     */
    handleMessage(ws, data) {
        try {
            const message = JSON.parse(data.toString());
            const client = this.clients.get(ws);

            if (!client) return;

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
                    // Autoryzacja (opcjonalna - dla identyfikacji użytkownika)
                    if (message.userId && message.username) {
                        client.userId = message.userId;
                        client.username = message.username;
                        this.send(ws, {
                            type: 'authenticated',
                            data: { userId: message.userId, username: message.username }
                        });
                    }
                    break;

                default:
                    console.log(`[WebSocket] Nieznany typ wiadomości: ${message.type}`);
            }
        } catch (error) {
            console.error('[WebSocket] Błąd parsowania wiadomości:', error);
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

        console.log(`[WebSocket] Broadcast "${type}" na kanał "${channel}" - ${sent} klientów`);
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
                    console.log(`[WebSocket] Usuwanie nieaktywnego klienta: ${clientInfo.id}`);
                    ws.terminate();
                    this.clients.delete(ws);
                    return;
                }

                clientInfo.isAlive = false;
                ws.ping();
            });
        }, this.HEARTBEAT_INTERVAL_MS);

        console.log('[WebSocket] Heartbeat uruchomiony');
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
        console.log('[WebSocket] Wszystkie połączenia zamknięte');
    }
}

// Eksportuj singleton
const wsManager = new WebSocketManager();
export default wsManager;
