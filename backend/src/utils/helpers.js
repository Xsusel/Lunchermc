/**
 * Funkcje pomocnicze
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Oblicza sumę kontrolną SHA256 dla pliku
 * @param {string} filePath - Ścieżka do pliku
 * @returns {Promise<string>} Suma kontrolna w formacie hex
 */
export const calculateSHA256 = (filePath) => {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);

        stream.on('data', (data) => hash.update(data));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', reject);
    });
};

/**
 * Oblicza sumę kontrolną SHA256 dla buffera
 * @param {Buffer} buffer - Dane
 * @returns {string} Suma kontrolna
 */
export const calculateSHA256FromBuffer = (buffer) => {
    return crypto.createHash('sha256').update(buffer).digest('hex');
};

/**
 * Weryfikuje integralność pliku porównując SHA256
 * @param {string} filePath - Ścieżka do pliku
 * @param {string} expectedSha256 - Oczekiwana suma kontrolna
 * @returns {Promise<{valid: boolean, actual: string}>}
 */
export const verifyFileSHA256 = async (filePath, expectedSha256) => {
    try {
        if (!fs.existsSync(filePath)) {
            return { valid: false, actual: null, error: 'file_not_found' };
        }
        const actual = await calculateSHA256(filePath);
        return {
            valid: actual === expectedSha256,
            actual,
            expected: expectedSha256
        };
    } catch (error) {
        return { valid: false, actual: null, error: error.message };
    }
};

/**
 * Generuje losowy token
 * @param {number} length - Długość tokenu w bajtach
 * @returns {string} Token w formacie hex
 */
export const generateToken = (length = 32) => {
    return crypto.randomBytes(length).toString('hex');
};

/**
 * Waliduje nazwę użytkownika
 * Dozwolone: litery, cyfry, podkreślenia, 3-16 znaków
 * @param {string} username - Nazwa użytkownika
 * @returns {boolean} Czy nazwa jest poprawna
 */
export const isValidUsername = (username) => {
    const regex = /^[a-zA-Z0-9_]{3,16}$/;
    return regex.test(username);
};

/**
 * Waliduje hasło
 * Minimum 8 znaków, wymaga: duża litera, mała litera, cyfra
 * @param {string} password - Hasło
 * @returns {{valid: boolean, error?: string}} Wynik walidacji
 */
export const isValidPassword = (password) => {
    if (typeof password !== 'string') return { valid: false, error: 'Hasło jest wymagane' };
    if (password.length < 8) return { valid: false, error: 'Hasło musi mieć minimum 8 znaków' };
    if (!/[A-Z]/.test(password)) return { valid: false, error: 'Hasło musi zawierać dużą literę' };
    if (!/[a-z]/.test(password)) return { valid: false, error: 'Hasło musi zawierać małą literę' };
    if (!/[0-9]/.test(password)) return { valid: false, error: 'Hasło musi zawierać cyfrę' };
    return { valid: true };
};

/**
 * Prosta walidacja hasła (kompatybilność wsteczna)
 * @param {string} password
 * @returns {boolean}
 */
export const isPasswordValid = (password) => {
    return isValidPassword(password).valid;
};

/**
 * Formatuje rozmiar pliku do czytelnej postaci
 * @param {number} bytes - Rozmiar w bajtach
 * @returns {string} Sformatowany rozmiar
 */
export const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Czyści nazwę pliku z niebezpiecznych znaków
 * @param {string} filename - Nazwa pliku
 * @returns {string} Oczyszczona nazwa
 */
export const sanitizeFilename = (filename) => {
    return filename
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .replace(/_{2,}/g, '_')
        .slice(0, 255);
};

/**
 * Pobiera adres IP klienta z nagłówków (obsługa reverse proxy)
 * @param {object} req - Obiekt żądania Express
 * @returns {string} Adres IP
 */
export const getClientIp = (req) => {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
           req.headers['x-real-ip'] ||
           req.connection?.remoteAddress ||
           req.ip ||
           'unknown';
};

/**
 * Tworzy katalog jeśli nie istnieje
 * @param {string} dirPath - Ścieżka do katalogu
 */
export const ensureDir = (dirPath) => {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
};

/**
 * Pobiera rozszerzenie pliku
 * @param {string} filename - Nazwa pliku
 * @returns {string} Rozszerzenie (z kropką)
 */
export const getFileExtension = (filename) => {
    return path.extname(filename).toLowerCase();
};

/**
 * Sprawdza czy plik jest dozwolonym typem moda
 * @param {string} filename - Nazwa pliku
 * @returns {boolean} Czy plik jest dozwolony
 */
export const isAllowedModFile = (filename) => {
    const ext = getFileExtension(filename);
    const allowedExtensions = ['.jar', '.zip'];
    return allowedExtensions.includes(ext);
};

/**
 * Ścieżka do katalogu uploads
 * @returns {string} Ścieżka absolutna
 */
export const getUploadsPath = () => {
    return path.join(__dirname, '../../uploads');
};

/**
 * Ścieżka do katalogu modów (globalny)
 * @returns {string} Ścieżka absolutna
 */
export const getModsPath = () => {
    return path.join(getUploadsPath(), 'mods');
};

/**
 * Ścieżka bazowa do folderów serwera
 * @param {number} serverId - ID serwera
 * @returns {string} Ścieżka absolutna np. /uploads/servers/3
 */
export const getServerPath = (serverId) => {
    return path.join(getUploadsPath(), 'servers', String(serverId));
};

/**
 * Ścieżka do konkretnego podfolderu serwera (mods, config, resourcepacks, etc.)
 * @param {number} serverId - ID serwera
 * @param {string} subdir - Podfolder np. 'mods', 'config', 'resourcepacks'
 * @returns {string} Ścieżka absolutna
 */
export const getServerSubPath = (serverId, subdir) => {
    return path.join(getServerPath(serverId), subdir);
};

/**
 * Standardowe foldery tworzone dla każdego serwera
 */
export const SERVER_FOLDERS = ['mods', 'config', 'resourcepacks', 'shaderpacks', 'scripts', 'kubejs'];

/**
 * Tworzy pełną strukturę folderów dla serwera
 * @param {number} serverId - ID serwera
 */
export const createServerFolders = (serverId) => {
    const basePath = getServerPath(serverId);
    ensureDir(basePath);
    for (const folder of SERVER_FOLDERS) {
        ensureDir(path.join(basePath, folder));
    }
};

/**
 * Opóźnienie wykonania
 * @param {number} ms - Milisekundy
 * @returns {Promise<void>}
 */
export const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Sprawdza czy wersja MC jest poprawna
 * @param {string} version - Wersja (np. "1.20.1")
 * @returns {boolean}
 */
export const isValidMCVersion = (version) => {
    const regex = /^\d+\.\d+(\.\d+)?$/;
    return regex.test(version);
};
