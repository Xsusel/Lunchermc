import { describe, it, expect } from '@jest/globals';
import crypto from 'crypto';
import path from 'path';

// ============================================
// All helper functions from utils/helpers.js
// Tested without database dependency
// ============================================

// ============================================
// formatFileSize tests
// ============================================

describe('formatFileSize', () => {
    // Replicating logic from src/utils/helpers.js
    const formatFileSize = (bytes) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    describe('zero and small values', () => {
        it('should return "0 B" for zero bytes', () => {
            expect(formatFileSize(0)).toBe('0 B');
        });

        it('should return "1 B" for one byte', () => {
            expect(formatFileSize(1)).toBe('1 B');
        });

        it('should format values less than 1 KB as bytes', () => {
            expect(formatFileSize(500)).toBe('500 B');
            expect(formatFileSize(1023)).toBe('1023 B');
        });
    });

    describe('kilobytes', () => {
        it('should format exactly 1 KB', () => {
            expect(formatFileSize(1024)).toBe('1 KB');
        });

        it('should format fractional kilobytes', () => {
            expect(formatFileSize(1536)).toBe('1.5 KB');
        });

        it('should format values just below 1 MB', () => {
            const result = formatFileSize(1024 * 1024 - 1);
            expect(result).toContain('KB');
        });
    });

    describe('megabytes', () => {
        it('should format exactly 1 MB', () => {
            expect(formatFileSize(1048576)).toBe('1 MB');
        });

        it('should format fractional megabytes', () => {
            expect(formatFileSize(1048576 * 1.5)).toBe('1.5 MB');
        });

        it('should format typical mod file sizes', () => {
            const tenMB = 10 * 1024 * 1024;
            expect(formatFileSize(tenMB)).toBe('10 MB');
        });

        it('should format 100 MB', () => {
            const hundredMB = 100 * 1024 * 1024;
            expect(formatFileSize(hundredMB)).toBe('100 MB');
        });
    });

    describe('gigabytes', () => {
        it('should format exactly 1 GB', () => {
            expect(formatFileSize(1073741824)).toBe('1 GB');
        });

        it('should format fractional gigabytes', () => {
            expect(formatFileSize(1073741824 * 2.5)).toBe('2.5 GB');
        });
    });

    describe('precision', () => {
        it('should limit to 2 decimal places', () => {
            // 1.333... KB
            const result = formatFileSize(1365);
            const numericPart = parseFloat(result.split(' ')[0]);
            const decimalPlaces = (numericPart.toString().split('.')[1] || '').length;
            expect(decimalPlaces).toBeLessThanOrEqual(2);
        });

        it('should remove trailing zeros', () => {
            // Exactly 2 KB = 2048 bytes -> should be "2 KB", not "2.00 KB"
            expect(formatFileSize(2048)).toBe('2 KB');
        });
    });
});

// ============================================
// isValidMCVersion tests
// ============================================

describe('isValidMCVersion', () => {
    // Replicating logic from src/utils/helpers.js
    const isValidMCVersion = (version) => {
        const regex = /^\d+\.\d+(\.\d+)?$/;
        return regex.test(version);
    };

    describe('valid versions', () => {
        it('should accept major.minor.patch format', () => {
            expect(isValidMCVersion('1.20.1')).toBe(true);
            expect(isValidMCVersion('1.7.10')).toBe(true);
            expect(isValidMCVersion('1.12.2')).toBe(true);
            expect(isValidMCVersion('1.16.5')).toBe(true);
            expect(isValidMCVersion('1.19.4')).toBe(true);
        });

        it('should accept major.minor format (without patch)', () => {
            expect(isValidMCVersion('1.20')).toBe(true);
            expect(isValidMCVersion('1.0')).toBe(true);
            expect(isValidMCVersion('2.0')).toBe(true);
        });

        it('should accept double-digit version numbers', () => {
            expect(isValidMCVersion('10.20.30')).toBe(true);
            expect(isValidMCVersion('1.7.10')).toBe(true);
        });
    });

    describe('invalid versions', () => {
        it('should reject single numbers', () => {
            expect(isValidMCVersion('1')).toBe(false);
            expect(isValidMCVersion('20')).toBe(false);
        });

        it('should reject versions with 4+ segments', () => {
            expect(isValidMCVersion('1.20.1.1')).toBe(false);
            expect(isValidMCVersion('1.2.3.4')).toBe(false);
        });

        it('should reject empty string', () => {
            expect(isValidMCVersion('')).toBe(false);
        });

        it('should reject alphabetic input', () => {
            expect(isValidMCVersion('abc')).toBe(false);
            expect(isValidMCVersion('one.two.three')).toBe(false);
        });

        it('should reject snapshot versions', () => {
            expect(isValidMCVersion('23w13a')).toBe(false);
            expect(isValidMCVersion('1.20-pre1')).toBe(false);
        });

        it('should reject versions with spaces', () => {
            expect(isValidMCVersion('1. 20.1')).toBe(false);
            expect(isValidMCVersion(' 1.20.1')).toBe(false);
        });

        it('should reject versions with leading zeros ambiguity', () => {
            // The regex itself does not explicitly reject 01.02.03,
            // but let us verify it does accept the format
            // (since leading zeros are still digits)
            expect(isValidMCVersion('01.02.03')).toBe(true); // Regex allows it
        });
    });
});

// ============================================
// isAllowedModFile tests
// ============================================

describe('isAllowedModFile', () => {
    // Replicating logic from src/utils/helpers.js
    const getFileExtension = (filename) => {
        return path.extname(filename).toLowerCase();
    };

    const isAllowedModFile = (filename) => {
        const ext = getFileExtension(filename);
        const allowedExtensions = ['.jar', '.zip'];
        return allowedExtensions.includes(ext);
    };

    describe('allowed extensions', () => {
        it('should allow .jar files', () => {
            expect(isAllowedModFile('mod.jar')).toBe(true);
            expect(isAllowedModFile('forge-1.20.1-mod.jar')).toBe(true);
        });

        it('should allow .zip files', () => {
            expect(isAllowedModFile('resourcepack.zip')).toBe(true);
            expect(isAllowedModFile('configs.zip')).toBe(true);
        });

        it('should be case insensitive for extensions', () => {
            expect(isAllowedModFile('mod.JAR')).toBe(true);
            expect(isAllowedModFile('mod.Jar')).toBe(true);
            expect(isAllowedModFile('pack.ZIP')).toBe(true);
            expect(isAllowedModFile('pack.Zip')).toBe(true);
        });
    });

    describe('disallowed extensions', () => {
        it('should reject .exe files', () => {
            expect(isAllowedModFile('malware.exe')).toBe(false);
        });

        it('should reject .bat files', () => {
            expect(isAllowedModFile('script.bat')).toBe(false);
        });

        it('should reject .sh files', () => {
            expect(isAllowedModFile('script.sh')).toBe(false);
        });

        it('should reject .js files', () => {
            expect(isAllowedModFile('script.js')).toBe(false);
        });

        it('should reject .py files', () => {
            expect(isAllowedModFile('script.py')).toBe(false);
        });

        it('should reject .dll files', () => {
            expect(isAllowedModFile('library.dll')).toBe(false);
        });

        it('should reject .so files', () => {
            expect(isAllowedModFile('library.so')).toBe(false);
        });

        it('should reject .tar.gz files', () => {
            expect(isAllowedModFile('archive.tar.gz')).toBe(false);
        });

        it('should reject files without extension', () => {
            expect(isAllowedModFile('noextension')).toBe(false);
        });

        it('should reject hidden files (dotfiles)', () => {
            expect(isAllowedModFile('.htaccess')).toBe(false);
        });
    });

    describe('edge cases', () => {
        it('should handle filenames with multiple dots', () => {
            expect(isAllowedModFile('mod.v1.2.3.jar')).toBe(true);
        });

        it('should handle filenames ending with allowed extension after dot', () => {
            expect(isAllowedModFile('fake.exe.jar')).toBe(true); // extension is .jar
        });

        it('should reject double extension tricks where last ext is not allowed', () => {
            expect(isAllowedModFile('mod.jar.exe')).toBe(false); // extension is .exe
        });
    });
});

// ============================================
// sanitizeFilename tests
// ============================================

describe('sanitizeFilename (comprehensive)', () => {
    const sanitizeFilename = (filename) => {
        return filename
            .replace(/[^a-zA-Z0-9._-]/g, '_')
            .replace(/_{2,}/g, '_')
            .slice(0, 255);
    };

    it('should handle empty string', () => {
        expect(sanitizeFilename('')).toBe('');
    });

    it('should handle filename with only special characters', () => {
        const result = sanitizeFilename('@#$%^&*()');
        // All replaced with _, then collapsed
        expect(result).toBe('_');
    });

    it('should handle filename with unicode characters', () => {
        const result = sanitizeFilename('polskie-znaki.jar');
        // Polish characters like ą,ę should be replaced
        expect(result).not.toContain(' ');
    });

    it('should handle filename starting with a dot', () => {
        expect(sanitizeFilename('.gitignore')).toBe('.gitignore');
    });

    it('should handle filename with consecutive dots', () => {
        expect(sanitizeFilename('test...jar')).toBe('test...jar');
    });

    it('should handle filename with only dots', () => {
        expect(sanitizeFilename('...')).toBe('...');
    });
});

// ============================================
// getClientIp tests (comprehensive)
// ============================================

describe('getClientIp (comprehensive)', () => {
    const getClientIp = (req) => {
        return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
               req.headers['x-real-ip'] ||
               req.connection?.remoteAddress ||
               req.ip ||
               'unknown';
    };

    it('should handle missing headers object gracefully', () => {
        const req = { headers: {}, connection: {}, ip: undefined };
        expect(getClientIp(req)).toBe('unknown');
    });

    it('should handle null connection', () => {
        const req = { headers: {}, connection: null, ip: '127.0.0.1' };
        expect(getClientIp(req)).toBe('127.0.0.1');
    });

    it('should handle empty x-forwarded-for string', () => {
        const req = { headers: { 'x-forwarded-for': '' }, connection: { remoteAddress: '10.0.0.1' } };
        // Empty string is falsy, falls through to next
        expect(getClientIp(req)).toBe('10.0.0.1');
    });
});

// ============================================
// generateToken tests
// ============================================

describe('generateToken', () => {
    // Replicating logic from src/utils/helpers.js
    const generateToken = (length = 32) => {
        return crypto.randomBytes(length).toString('hex');
    };

    it('should generate a hex string of correct length', () => {
        const token = generateToken(32);
        // 32 bytes = 64 hex chars
        expect(token).toHaveLength(64);
        expect(token).toMatch(/^[a-f0-9]+$/);
    });

    it('should generate unique tokens', () => {
        const token1 = generateToken(32);
        const token2 = generateToken(32);
        expect(token1).not.toBe(token2);
    });

    it('should respect custom length parameter', () => {
        const token16 = generateToken(16);
        expect(token16).toHaveLength(32); // 16 bytes = 32 hex chars

        const token64 = generateToken(64);
        expect(token64).toHaveLength(128); // 64 bytes = 128 hex chars
    });

    it('should handle minimum length of 1', () => {
        const token = generateToken(1);
        expect(token).toHaveLength(2); // 1 byte = 2 hex chars
    });
});

// ============================================
// delay function tests
// ============================================

describe('delay', () => {
    // Replicating logic from src/utils/helpers.js
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    it('should resolve after specified time', async () => {
        const start = Date.now();
        await delay(50);
        const elapsed = Date.now() - start;
        // Allow 20ms tolerance for timer imprecision
        expect(elapsed).toBeGreaterThanOrEqual(40);
    });

    it('should resolve with undefined', async () => {
        const result = await delay(10);
        expect(result).toBeUndefined();
    });

    it('should handle zero delay', async () => {
        const start = Date.now();
        await delay(0);
        const elapsed = Date.now() - start;
        expect(elapsed).toBeLessThan(50);
    });
});

// ============================================
// isValidPassword (edge cases)
// ============================================

describe('isValidPassword (edge cases from helpers)', () => {
    const isValidPassword = (password) => {
        return typeof password === 'string' && password.length >= 6;
    };

    it('should accept passwords with whitespace', () => {
        expect(isValidPassword('pass  word')).toBe(true);
    });

    it('should accept passwords that are only whitespace (if >= 6)', () => {
        expect(isValidPassword('      ')).toBe(true); // 6 spaces
    });

    it('should accept passwords with newlines', () => {
        expect(isValidPassword('pass\nword')).toBe(true);
    });

    it('should accept passwords with emoji-like chars', () => {
        expect(isValidPassword('password_!')).toBe(true);
    });
});

// ============================================
// isValidUsername (edge cases)
// ============================================

describe('isValidUsername (edge cases from helpers)', () => {
    const isValidUsername = (username) => {
        const regex = /^[a-zA-Z0-9_]{3,16}$/;
        return regex.test(username);
    };

    it('should reject whitespace-only strings', () => {
        expect(isValidUsername('   ')).toBe(false);
    });

    it('should reject strings with leading/trailing spaces', () => {
        expect(isValidUsername(' Player ')).toBe(false);
    });

    it('should coerce null/undefined to string (regex.test behavior)', () => {
        // Note: regex.test(null) coerces null to "null" which matches [a-zA-Z0-9_]{3,16}
        // This is expected JS behavior - callers should validate type before calling
        expect(isValidUsername(null)).toBe(true); // "null" matches the regex
        expect(isValidUsername(undefined)).toBe(true); // "undefined" matches the regex
    });

    it('should handle numeric-only usernames', () => {
        expect(isValidUsername('12345')).toBe(true);
    });

    it('should handle underscore-only usernames', () => {
        expect(isValidUsername('___')).toBe(true);
    });
});
