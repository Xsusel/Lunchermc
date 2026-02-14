/**
 * Model administratora
 * Obsługuje operacje na tabeli admins
 */
import db from '../config/database.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

// Migracja - dodaj kolumny 2FA jeśli nie istnieją
try {
    db.exec(`ALTER TABLE admins ADD COLUMN totp_secret TEXT;`);
} catch (e) { /* Kolumna już istnieje */ }

try {
    db.exec(`ALTER TABLE admins ADD COLUMN totp_enabled INTEGER DEFAULT 0;`);
} catch (e) { /* Kolumna już istnieje */ }

try {
    db.exec(`ALTER TABLE admins ADD COLUMN totp_backup_codes TEXT;`);
} catch (e) { /* Kolumna już istnieje */ }

// ============================================
// TOTP (RFC 6238) - Pure JavaScript Implementation
// ============================================

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Koduje bufor do base32
 * @param {Buffer} buffer - Dane do zakodowania
 * @returns {string} Zakodowany string base32
 */
function base32Encode(buffer) {
    let result = '';
    let bits = 0;
    let value = 0;

    for (let i = 0; i < buffer.length; i++) {
        value = (value << 8) | buffer[i];
        bits += 8;

        while (bits >= 5) {
            bits -= 5;
            result += BASE32_ALPHABET[(value >>> bits) & 0x1f];
        }
    }

    if (bits > 0) {
        result += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
    }

    return result;
}

/**
 * Dekoduje string base32 do bufora
 * @param {string} str - String base32
 * @returns {Buffer} Zdekodowane dane
 */
function base32Decode(str) {
    str = str.replace(/=+$/, '').toUpperCase();
    const bytes = [];
    let bits = 0;
    let value = 0;

    for (let i = 0; i < str.length; i++) {
        const idx = BASE32_ALPHABET.indexOf(str[i]);
        if (idx === -1) continue;

        value = (value << 5) | idx;
        bits += 5;

        if (bits >= 8) {
            bits -= 8;
            bytes.push((value >>> bits) & 0xff);
        }
    }

    return Buffer.from(bytes);
}

/**
 * Generuje kod TOTP na podstawie sekretu i czasu
 * @param {string} secret - Sekret base32
 * @param {number} timeStep - Krok czasowy (domyślnie bieżący)
 * @returns {string} 6-cyfrowy kod TOTP
 */
function generateTOTP(secret, timeStep = null) {
    const time = timeStep !== null ? timeStep : Math.floor(Date.now() / 1000 / 30);
    const timeBuffer = Buffer.alloc(8);

    // Zapisz czas jako 64-bit big-endian (przez hex, bo JS ma 32-bitowe operacje bitowe)
    const timeHex = time.toString(16).padStart(16, '0');
    for (let i = 0; i < 8; i++) {
        timeBuffer[i] = parseInt(timeHex.substr(i * 2, 2), 16);
    }

    const key = base32Decode(secret);
    const hmac = crypto.createHmac('sha1', key).update(timeBuffer).digest();

    // Dynamic truncation (RFC 4226)
    const offset = hmac[hmac.length - 1] & 0x0f;
    const code = (
        ((hmac[offset] & 0x7f) << 24) |
        ((hmac[offset + 1] & 0xff) << 16) |
        ((hmac[offset + 2] & 0xff) << 8) |
        (hmac[offset + 3] & 0xff)
    ) % 1000000;

    return code.toString().padStart(6, '0');
}

/**
 * Weryfikuje kod TOTP z oknem tolerancji
 * @param {string} secret - Sekret base32
 * @param {string} token - Kod do weryfikacji
 * @param {number} window - Okno tolerancji (domyślnie 1 = +/- 30 sekund)
 * @returns {boolean} Czy kod jest poprawny
 */
function verifyTOTP(secret, token, window = 1) {
    const currentTime = Math.floor(Date.now() / 1000 / 30);

    for (let i = -window; i <= window; i++) {
        const expected = generateTOTP(secret, currentTime + i);
        if (expected === token) {
            return true;
        }
    }

    return false;
}

class Admin {
    /**
     * Tworzy nowego administratora
     * @param {string} username - Nazwa użytkownika
     * @param {string} password - Hasło
     * @returns {object} Utworzony administrator
     */
    static create(username, password) {
        const hashedPassword = bcrypt.hashSync(password, 12);
        const stmt = db.prepare(`
            INSERT INTO admins (username, password_hash)
            VALUES (?, ?)
        `);

        const result = stmt.run(username, hashedPassword);
        return this.findById(result.lastInsertRowid);
    }

    /**
     * Znajduje administratora po ID
     * @param {number} id - ID administratora
     * @returns {object|null} Administrator lub null
     */
    static findById(id) {
        return db.prepare(`
            SELECT id, username, created_at, last_login
            FROM admins WHERE id = ?
        `).get(id);
    }

    /**
     * Znajduje administratora po nazwie
     * @param {string} username - Nazwa użytkownika
     * @returns {object|null} Administrator lub null
     */
    static findByUsername(username) {
        return db.prepare(`
            SELECT * FROM admins WHERE username = ?
        `).get(username);
    }

    /**
     * Weryfikuje hasło administratora
     * @param {string} username - Nazwa użytkownika
     * @param {string} password - Hasło do weryfikacji
     * @returns {object|null} Administrator jeśli hasło poprawne
     */
    static verifyPassword(username, password) {
        const admin = this.findByUsername(username);
        if (!admin) return null;

        const isValid = bcrypt.compareSync(password, admin.password_hash);
        if (!isValid) return null;

        // Aktualizujemy ostatnie logowanie
        db.prepare(`
            UPDATE admins SET last_login = CURRENT_TIMESTAMP WHERE id = ?
        `).run(admin.id);

        // Zwracamy admina bez hasła
        const { password_hash, ...adminWithoutPassword } = admin;
        return adminWithoutPassword;
    }

    /**
     * Zmienia hasło administratora
     * @param {number} id - ID administratora
     * @param {string} newPassword - Nowe hasło
     * @returns {boolean} Czy operacja się powiodła
     */
    static changePassword(id, newPassword) {
        const hashedPassword = bcrypt.hashSync(newPassword, 12);
        const result = db.prepare(`
            UPDATE admins SET password_hash = ? WHERE id = ?
        `).run(hashedPassword, id);
        return result.changes > 0;
    }

    /**
     * Pobiera listę wszystkich administratorów
     * @returns {array} Lista administratorów
     */
    static getAll() {
        return db.prepare(`
            SELECT id, username, created_at, last_login
            FROM admins ORDER BY created_at ASC
        `).all();
    }

    /**
     * Usuwa administratora
     * @param {number} id - ID administratora
     * @returns {boolean} Czy operacja się powiodła
     */
    static delete(id) {
        // Nie pozwalamy usunąć ostatniego admina
        const count = db.prepare('SELECT COUNT(*) as count FROM admins').get().count;
        if (count <= 1) {
            throw new Error('Nie można usunąć ostatniego administratora');
        }

        const result = db.prepare('DELETE FROM admins WHERE id = ?').run(id);
        return result.changes > 0;
    }

    // ============================================
    // METODY 2FA (TOTP)
    // ============================================

    /**
     * Rozpoczyna konfigurację 2FA - generuje sekret TOTP
     * @param {number} id - ID administratora
     * @returns {object} Sekret i URI do QR kodu
     */
    static enable2FA(id) {
        const admin = db.prepare('SELECT id, username FROM admins WHERE id = ?').get(id);
        if (!admin) throw new Error('Administrator nie istnieje');

        // Generujemy 20 bajtów losowego sekretu (160 bitów, standard dla TOTP)
        const secretBuffer = crypto.randomBytes(20);
        const secret = base32Encode(secretBuffer);

        // Zapisujemy sekret (jeszcze nie włączamy 2FA - czekamy na weryfikację)
        db.prepare(`
            UPDATE admins SET totp_secret = ? WHERE id = ?
        `).run(secret, id);

        const issuer = 'XsusLauncher';
        const username = admin.username;
        const otpauthUri = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(username)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

        return {
            secret,
            otpauthUri
        };
    }

    /**
     * Weryfikuje kod TOTP i włącza 2FA jeśli poprawny
     * @param {number} id - ID administratora
     * @param {string} token - 6-cyfrowy kod TOTP
     * @returns {boolean} Czy weryfikacja się powiodła
     */
    static verify2FA(id, token) {
        const admin = db.prepare('SELECT totp_secret, totp_enabled FROM admins WHERE id = ?').get(id);
        if (!admin || !admin.totp_secret) {
            return false;
        }

        return verifyTOTP(admin.totp_secret, token);
    }

    /**
     * Wyłącza 2FA dla administratora
     * @param {number} id - ID administratora
     * @returns {boolean} Czy operacja się powiodła
     */
    static disable2FA(id) {
        const result = db.prepare(`
            UPDATE admins SET totp_secret = NULL, totp_enabled = 0, totp_backup_codes = NULL WHERE id = ?
        `).run(id);
        return result.changes > 0;
    }

    /**
     * Generuje 8 kodów zapasowych
     * @param {number} id - ID administratora
     * @returns {string[]} Lista kodów zapasowych
     */
    static generateBackupCodes(id) {
        const codes = [];
        for (let i = 0; i < 8; i++) {
            // Format: XXXX-XXXX (8 znaków alfanumerycznych)
            const code = crypto.randomBytes(4).toString('hex').toUpperCase();
            codes.push(code.substring(0, 4) + '-' + code.substring(4, 8));
        }

        // Hashujemy kody przed zapisem
        const hashedCodes = codes.map(code => ({
            hash: crypto.createHash('sha256').update(code).digest('hex'),
            used: false
        }));

        db.prepare(`
            UPDATE admins SET totp_backup_codes = ? WHERE id = ?
        `).run(JSON.stringify(hashedCodes), id);

        return codes;
    }

    /**
     * Weryfikuje i zużywa kod zapasowy
     * @param {number} id - ID administratora
     * @param {string} code - Kod zapasowy
     * @returns {boolean} Czy kod jest poprawny
     */
    static verifyBackupCode(id, code) {
        const admin = db.prepare('SELECT totp_backup_codes FROM admins WHERE id = ?').get(id);
        if (!admin || !admin.totp_backup_codes) return false;

        let codes;
        try {
            codes = JSON.parse(admin.totp_backup_codes);
        } catch {
            return false;
        }

        const codeHash = crypto.createHash('sha256').update(code.toUpperCase().trim()).digest('hex');

        const codeIndex = codes.findIndex(c => c.hash === codeHash && !c.used);
        if (codeIndex === -1) return false;

        // Oznaczamy kod jako użyty
        codes[codeIndex].used = true;
        db.prepare(`
            UPDATE admins SET totp_backup_codes = ? WHERE id = ?
        `).run(JSON.stringify(codes), id);

        return true;
    }

    /**
     * Sprawdza czy 2FA jest włączone
     * @param {number} id - ID administratora
     * @returns {boolean} Czy 2FA jest aktywne
     */
    static is2FAEnabled(id) {
        const admin = db.prepare('SELECT totp_enabled FROM admins WHERE id = ?').get(id);
        return admin ? !!admin.totp_enabled : false;
    }

    /**
     * Potwierdza włączenie 2FA (po weryfikacji kodu)
     * @param {number} id - ID administratora
     * @returns {boolean} Czy operacja się powiodła
     */
    static confirm2FA(id) {
        const result = db.prepare(`
            UPDATE admins SET totp_enabled = 1 WHERE id = ?
        `).run(id);
        return result.changes > 0;
    }
}

export default Admin;
