/**
 * Utility do pingowania serwera Minecraft
 * Pobiera status serwera, liczbę graczy online, itp.
 */
import net from 'net';

/**
 * Pinguje serwer Minecraft i zwraca jego status
 * @param {string} host - Adres IP lub domena serwera
 * @param {number} port - Port serwera (domyślnie 25565)
 * @param {number} timeout - Timeout w ms (domyślnie 5000)
 * @returns {Promise<Object>} - Status serwera
 */
export async function pingMinecraftServer(host, port = 25565, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        const socket = new net.Socket();

        socket.setTimeout(timeout);

        const cleanup = () => {
            socket.destroy();
        };

        socket.on('timeout', () => {
            cleanup();
            resolve({
                online: false,
                error: 'Connection timeout',
                latency: null
            });
        });

        socket.on('error', (err) => {
            cleanup();
            resolve({
                online: false,
                error: err.message,
                latency: null
            });
        });

        socket.connect(port, host, () => {
            const latency = Date.now() - startTime;

            // Wysylamy pakiet handshake + status request (MC protocol)
            const handshakePacket = createHandshakePacket(host, port);
            const statusRequestPacket = Buffer.from([0x01, 0x00]); // Packet length + packet ID

            socket.write(handshakePacket);
            socket.write(statusRequestPacket);
        });

        let responseBuffer = Buffer.alloc(0);

        socket.on('data', (data) => {
            responseBuffer = Buffer.concat([responseBuffer, data]);

            try {
                const result = parseStatusResponse(responseBuffer);
                if (result) {
                    const latency = Date.now() - startTime;
                    cleanup();
                    resolve({
                        online: true,
                        latency,
                        ...result
                    });
                }
            } catch (err) {
                // Kontynuuj zbieranie danych
            }
        });

        socket.on('close', () => {
            if (responseBuffer.length === 0) {
                resolve({
                    online: false,
                    error: 'Connection closed',
                    latency: null
                });
            }
        });
    });
}

/**
 * Tworzy pakiet handshake dla protokolu MC
 */
function createHandshakePacket(host, port) {
    // Protocol version (VarInt) - uzywamy -1 dla status
    const protocolVersion = writeVarInt(-1);

    // Server address (String)
    const hostBuffer = Buffer.from(host, 'utf8');
    const hostLength = writeVarInt(hostBuffer.length);

    // Server port (Unsigned Short)
    const portBuffer = Buffer.alloc(2);
    portBuffer.writeUInt16BE(port);

    // Next state (VarInt) - 1 = status
    const nextState = writeVarInt(1);

    // Packet ID (VarInt) - 0x00 = handshake
    const packetId = writeVarInt(0);

    // Laczymy wszystko
    const packetData = Buffer.concat([
        packetId,
        protocolVersion,
        hostLength,
        hostBuffer,
        portBuffer,
        nextState
    ]);

    // Packet length
    const packetLength = writeVarInt(packetData.length);

    return Buffer.concat([packetLength, packetData]);
}

/**
 * Parsuje odpowiedz status od serwera
 */
function parseStatusResponse(buffer) {
    try {
        let offset = 0;

        // Packet length (VarInt)
        const { value: packetLength, size: lengthSize } = readVarInt(buffer, offset);
        offset += lengthSize;

        if (buffer.length < offset + packetLength) {
            return null; // Niepelne dane
        }

        // Packet ID (VarInt)
        const { value: packetId, size: idSize } = readVarInt(buffer, offset);
        offset += idSize;

        if (packetId !== 0) {
            return null;
        }

        // JSON string length (VarInt)
        const { value: jsonLength, size: jsonLengthSize } = readVarInt(buffer, offset);
        offset += jsonLengthSize;

        // JSON data
        const jsonData = buffer.slice(offset, offset + jsonLength).toString('utf8');
        const status = JSON.parse(jsonData);

        return {
            version: status.version?.name || 'Unknown',
            protocol: status.version?.protocol || 0,
            players: {
                online: status.players?.online || 0,
                max: status.players?.max || 0,
                sample: status.players?.sample || []
            },
            description: parseDescription(status.description),
            favicon: status.favicon || null
        };
    } catch (err) {
        return null;
    }
}

/**
 * Parsuje opis serwera (moze byc string lub obiekt)
 */
function parseDescription(desc) {
    if (!desc) return '';
    if (typeof desc === 'string') return desc;
    if (desc.text) return desc.text;
    if (desc.extra) {
        return desc.extra.map(e => e.text || '').join('');
    }
    return JSON.stringify(desc);
}

/**
 * Zapisuje VarInt do bufora
 */
function writeVarInt(value) {
    const bytes = [];
    do {
        let temp = value & 0x7F;
        value >>>= 7;
        if (value !== 0) {
            temp |= 0x80;
        }
        bytes.push(temp);
    } while (value !== 0);
    return Buffer.from(bytes);
}

/**
 * Czyta VarInt z bufora
 */
function readVarInt(buffer, offset = 0) {
    let value = 0;
    let size = 0;
    let byte;

    do {
        if (offset + size >= buffer.length) {
            throw new Error('VarInt too big');
        }
        byte = buffer[offset + size];
        value |= (byte & 0x7F) << (7 * size);
        size++;
        if (size > 5) {
            throw new Error('VarInt too big');
        }
    } while ((byte & 0x80) !== 0);

    return { value, size };
}

/**
 * Prosty ping TCP - tylko sprawdza czy serwer odpowiada
 */
export async function simplePing(host, port = 25565, timeout = 3000) {
    return new Promise((resolve) => {
        const startTime = Date.now();
        const socket = new net.Socket();

        socket.setTimeout(timeout);

        socket.on('timeout', () => {
            socket.destroy();
            resolve({ online: false, latency: null });
        });

        socket.on('error', () => {
            socket.destroy();
            resolve({ online: false, latency: null });
        });

        socket.connect(port, host, () => {
            const latency = Date.now() - startTime;
            socket.destroy();
            resolve({ online: true, latency });
        });
    });
}

export default { pingMinecraftServer, simplePing };
