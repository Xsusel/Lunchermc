import { describe, it, expect } from '@jest/globals';
import crypto from 'crypto';

// ============================================
// Filename sanitization tests
// ============================================

describe('Filename sanitization', () => {
    // Replicating logic from src/utils/helpers.js
    const sanitizeFilename = (filename) => {
        return filename
            .replace(/[^a-zA-Z0-9._-]/g, '_')
            .replace(/_{2,}/g, '_')
            .slice(0, 255);
    };

    describe('basic sanitization', () => {
        it('should leave clean filenames unchanged', () => {
            expect(sanitizeFilename('test.jar')).toBe('test.jar');
            expect(sanitizeFilename('my-mod.jar')).toBe('my-mod.jar');
            expect(sanitizeFilename('mod_v1.2.jar')).toBe('mod_v1.2.jar');
        });

        it('should replace spaces with underscores', () => {
            expect(sanitizeFilename('my mod.jar')).toBe('my_mod.jar');
            expect(sanitizeFilename('my mod v2.jar')).toBe('my_mod_v2.jar');
        });

        it('should replace special characters with underscores', () => {
            expect(sanitizeFilename('mod@v1!.jar')).toBe('mod_v1_.jar');
            expect(sanitizeFilename('mod#$%.jar')).toBe('mod_.jar');
        });

        it('should collapse consecutive underscores', () => {
            expect(sanitizeFilename('a   b.jar')).toBe('a_b.jar');
            expect(sanitizeFilename('a!!!b.jar')).toBe('a_b.jar');
        });

        it('should preserve allowed characters: letters, digits, dots, hyphens, underscores', () => {
            expect(sanitizeFilename('My-Mod_v1.2.3.jar')).toBe('My-Mod_v1.2.3.jar');
        });
    });

    describe('length truncation', () => {
        it('should truncate filenames exceeding 255 characters', () => {
            const longName = 'a'.repeat(300) + '.jar';
            const result = sanitizeFilename(longName);
            expect(result.length).toBeLessThanOrEqual(255);
        });

        it('should not truncate filenames at exactly 255 characters', () => {
            const exactName = 'a'.repeat(251) + '.jar';
            expect(sanitizeFilename(exactName).length).toBe(255);
        });

        it('should not modify short filenames', () => {
            expect(sanitizeFilename('short.jar')).toBe('short.jar');
        });
    });

    describe('dangerous input handling', () => {
        it('should sanitize null bytes', () => {
            const result = sanitizeFilename('test\x00.jar');
            expect(result).not.toContain('\x00');
        });

        it('should sanitize parentheses and brackets', () => {
            const result = sanitizeFilename('mod(1)[2]{3}.jar');
            expect(result).not.toContain('(');
            expect(result).not.toContain(')');
            expect(result).not.toContain('[');
            expect(result).not.toContain(']');
        });

        it('should sanitize semicolons and pipes', () => {
            const result = sanitizeFilename('mod;rm -rf |.jar');
            expect(result).not.toContain(';');
            expect(result).not.toContain('|');
        });

        it('should sanitize backticks', () => {
            const result = sanitizeFilename('mod`whoami`.jar');
            expect(result).not.toContain('`');
        });
    });
});

// ============================================
// Path traversal prevention tests
// ============================================

describe('Path traversal prevention', () => {
    const sanitizeFilename = (filename) => {
        return filename
            .replace(/[^a-zA-Z0-9._-]/g, '_')
            .replace(/_{2,}/g, '_')
            .slice(0, 255);
    };

    it('should remove forward slashes from path traversal attempts', () => {
        const result = sanitizeFilename('../../../etc/passwd');
        expect(result).not.toContain('/');
    });

    it('should remove backslashes from Windows path traversal', () => {
        const result = sanitizeFilename('..\\..\\..\\windows\\system32\\config');
        expect(result).not.toContain('\\');
    });

    it('should neutralize dot-dot sequences', () => {
        const result = sanitizeFilename('../../secret.txt');
        // After sanitization, slashes become underscores, dots remain
        // The result should NOT be usable as a path traversal
        expect(result).not.toMatch(/\.\.\//);
        expect(result).not.toMatch(/\.\.\\/);
    });

    it('should handle encoded path traversal attempts', () => {
        // URL-encoded ../ is %2e%2e%2f
        const result = sanitizeFilename('%2e%2e%2f%2e%2e%2fetc%2fpasswd');
        // The % characters get replaced with _
        expect(result).not.toContain('%');
    });

    it('should handle double-encoded path traversal', () => {
        const result = sanitizeFilename('%252e%252e%252f');
        expect(result).not.toContain('%');
    });

    it('should prevent absolute path injection on Linux', () => {
        const result = sanitizeFilename('/etc/passwd');
        expect(result).not.toContain('/');
    });

    it('should prevent absolute path injection on Windows', () => {
        const result = sanitizeFilename('C:\\Windows\\system32');
        expect(result).not.toContain('\\');
        expect(result).not.toContain(':');
    });

    it('should handle null bytes in path traversal', () => {
        const result = sanitizeFilename('test.jar\x00.exe');
        expect(result).not.toContain('\x00');
    });

    it('should handle mixed traversal techniques', () => {
        const result = sanitizeFilename('....//....//etc/passwd');
        expect(result).not.toContain('/');
    });
});

// ============================================
// SHA256 calculation tests
// ============================================

describe('SHA256 calculation', () => {
    // Replicating logic from src/utils/helpers.js calculateSHA256FromBuffer
    const calculateSHA256FromBuffer = (buffer) => {
        return crypto.createHash('sha256').update(buffer).digest('hex');
    };

    it('should calculate correct SHA256 for known input', () => {
        // SHA256 of empty string
        const emptyHash = calculateSHA256FromBuffer(Buffer.from(''));
        expect(emptyHash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });

    it('should calculate correct SHA256 for "hello"', () => {
        const hash = calculateSHA256FromBuffer(Buffer.from('hello'));
        expect(hash).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
    });

    it('should return a 64-character hex string', () => {
        const hash = calculateSHA256FromBuffer(Buffer.from('test data'));
        expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce different hashes for different inputs', () => {
        const hash1 = calculateSHA256FromBuffer(Buffer.from('input1'));
        const hash2 = calculateSHA256FromBuffer(Buffer.from('input2'));
        expect(hash1).not.toBe(hash2);
    });

    it('should produce identical hashes for identical inputs', () => {
        const hash1 = calculateSHA256FromBuffer(Buffer.from('same content'));
        const hash2 = calculateSHA256FromBuffer(Buffer.from('same content'));
        expect(hash1).toBe(hash2);
    });

    it('should handle binary data', () => {
        const binaryData = Buffer.from([0x00, 0xFF, 0x42, 0x89, 0xAB]);
        const hash = calculateSHA256FromBuffer(binaryData);
        expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should handle large buffers', () => {
        const largeBuffer = Buffer.alloc(1024 * 1024, 'x'); // 1MB of 'x'
        const hash = calculateSHA256FromBuffer(largeBuffer);
        expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
});

// ============================================
// Rate limiter configuration values tests
// ============================================

describe('Rate limiter configuration values', () => {
    it('should have API rate limit with positive windowMs', async () => {
        const { RATE_LIMITS } = await import('../src/config/constants.js');
        expect(RATE_LIMITS.API.windowMs).toBeGreaterThan(0);
        expect(typeof RATE_LIMITS.API.windowMs).toBe('number');
    });

    it('should have API rate limit with positive max', async () => {
        const { RATE_LIMITS } = await import('../src/config/constants.js');
        expect(RATE_LIMITS.API.max).toBeGreaterThan(0);
        expect(typeof RATE_LIMITS.API.max).toBe('number');
    });

    it('should have AUTH rate limit more restrictive than API', async () => {
        const { RATE_LIMITS } = await import('../src/config/constants.js');
        expect(RATE_LIMITS.AUTH.max).toBeLessThanOrEqual(RATE_LIMITS.API.max);
    });

    it('should have ADMIN rate limit allowing more requests than API', async () => {
        const { RATE_LIMITS } = await import('../src/config/constants.js');
        expect(RATE_LIMITS.ADMIN.max).toBeGreaterThanOrEqual(RATE_LIMITS.API.max);
    });

    it('should have DOWNLOAD rate limit with shorter window', async () => {
        const { RATE_LIMITS } = await import('../src/config/constants.js');
        expect(RATE_LIMITS.DOWNLOAD.windowMs).toBeLessThanOrEqual(RATE_LIMITS.API.windowMs);
    });

    it('should have rate limit windows in milliseconds (not seconds)', async () => {
        const { RATE_LIMITS } = await import('../src/config/constants.js');
        // Windows should be at least 1 second (1000ms)
        expect(RATE_LIMITS.API.windowMs).toBeGreaterThanOrEqual(1000);
        expect(RATE_LIMITS.AUTH.windowMs).toBeGreaterThanOrEqual(1000);
        expect(RATE_LIMITS.ADMIN.windowMs).toBeGreaterThanOrEqual(1000);
        expect(RATE_LIMITS.DOWNLOAD.windowMs).toBeGreaterThanOrEqual(1000);
    });

    it('should define all required rate limit categories', async () => {
        const { RATE_LIMITS } = await import('../src/config/constants.js');
        expect(RATE_LIMITS).toHaveProperty('API');
        expect(RATE_LIMITS).toHaveProperty('AUTH');
        expect(RATE_LIMITS).toHaveProperty('ADMIN');
        expect(RATE_LIMITS).toHaveProperty('DOWNLOAD');
    });

    it('should have reasonable AUTH rate limit values (max <= 20)', async () => {
        const { RATE_LIMITS } = await import('../src/config/constants.js');
        // Auth should be restrictive - not more than 20 attempts per window
        expect(RATE_LIMITS.AUTH.max).toBeLessThanOrEqual(20);
        expect(RATE_LIMITS.AUTH.max).toBeGreaterThan(0);
    });
});
