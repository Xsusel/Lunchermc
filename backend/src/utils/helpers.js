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
 * Minimum 6 znaków
 * @param {string} password - Hasło
 * @returns {boolean} Czy hasło jest poprawne
 */
export const isValidPassword = (password) => {
    return typeof password === 'string' && password.length >= 6;
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
 * Ścieżka do katalogu modów
 * @returns {string} Ścieżka absolutna
 */
export const getModsPath = () => {
    return path.join(getUploadsPath(), 'mods');
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
