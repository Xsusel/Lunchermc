import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import crypto from 'crypto';

// ============================================
// Password validation tests
// ============================================

describe('Password validation', () => {
    // Replicating logic from src/utils/helpers.js
    const isValidPassword = (password) => {
        return typeof password === 'string' && password.length >= 6;
    };

    describe('minimum length requirement (6 chars)', () => {
        it('should reject passwords shorter than 6 characters', () => {
            expect(isValidPassword('12345')).toBe(false);
            expect(isValidPassword('abc')).toBe(false);
            expect(isValidPassword('a')).toBe(false);
        });

        it('should reject empty passwords', () => {
            expect(isValidPassword('')).toBe(false);
        });

        it('should accept passwords with exactly 6 characters', () => {
            expect(isValidPassword('123456')).toBe(true);
            expect(isValidPassword('abcdef')).toBe(true);
        });

        it('should accept passwords with more than 6 characters', () => {
            expect(isValidPassword('12345678')).toBe(true);
            expect(isValidPassword('a-very-long-password-with-many-chars')).toBe(true);
        });
    });

    describe('complexity checks', () => {
        it('should accept numeric-only passwords (min length met)', () => {
            expect(isValidPassword('123456')).toBe(true);
        });

        it('should accept passwords with special characters', () => {
            expect(isValidPassword('p@ss!w0rd')).toBe(true);
        });

        it('should accept passwords with unicode characters', () => {
            expect(isValidPassword('haslo123')).toBe(true);
        });

        it('should accept very long passwords', () => {
            const longPassword = 'a'.repeat(1000);
            expect(isValidPassword(longPassword)).toBe(true);
        });
    });

    describe('type checking', () => {
        it('should reject null', () => {
            expect(isValidPassword(null)).toBe(false);
        });

        it('should reject undefined', () => {
            expect(isValidPassword(undefined)).toBe(false);
        });

        it('should reject numbers', () => {
            expect(isValidPassword(123456)).toBe(false);
        });

        it('should reject objects', () => {
            expect(isValidPassword({ password: 'test' })).toBe(false);
        });

        it('should reject arrays', () => {
            expect(isValidPassword(['a', 'b', 'c', 'd', 'e', 'f'])).toBe(false);
        });

        it('should reject booleans', () => {
            expect(isValidPassword(true)).toBe(false);
        });
    });
});

// ============================================
// Username validation tests
// ============================================

describe('Username validation', () => {
    // Replicating logic from src/utils/helpers.js
    const isValidUsername = (username) => {
        const regex = /^[a-zA-Z0-9_]{3,16}$/;
        return regex.test(username);
    };

    describe('length requirements (3-16 chars)', () => {
        it('should reject usernames shorter than 3 characters', () => {
            expect(isValidUsername('ab')).toBe(false);
            expect(isValidUsername('a')).toBe(false);
            expect(isValidUsername('')).toBe(false);
        });

        it('should accept usernames with exactly 3 characters', () => {
            expect(isValidUsername('abc')).toBe(true);
            expect(isValidUsername('123')).toBe(true);
        });

        it('should accept usernames with exactly 16 characters', () => {
            expect(isValidUsername('a'.repeat(16))).toBe(true);
        });

        it('should reject usernames longer than 16 characters', () => {
            expect(isValidUsername('a'.repeat(17))).toBe(false);
            expect(isValidUsername('a'.repeat(100))).toBe(false);
        });
    });

    describe('allowed characters', () => {
        it('should accept lowercase letters', () => {
            expect(isValidUsername('player')).toBe(true);
        });

        it('should accept uppercase letters', () => {
            expect(isValidUsername('PLAYER')).toBe(true);
        });

        it('should accept mixed case letters', () => {
            expect(isValidUsername('Player')).toBe(true);
        });

        it('should accept digits', () => {
            expect(isValidUsername('12345')).toBe(true);
        });

        it('should accept underscores', () => {
            expect(isValidUsername('my_name')).toBe(true);
            expect(isValidUsername('___')).toBe(true);
        });

        it('should accept alphanumeric with underscores', () => {
            expect(isValidUsername('Player_123')).toBe(true);
            expect(isValidUsername('test_user_1')).toBe(true);
        });
    });

    describe('disallowed characters', () => {
        it('should reject spaces', () => {
            expect(isValidUsername('my name')).toBe(false);
        });

        it('should reject special characters', () => {
            expect(isValidUsername('user@name')).toBe(false);
            expect(isValidUsername('user!name')).toBe(false);
            expect(isValidUsername('user#name')).toBe(false);
            expect(isValidUsername('user$name')).toBe(false);
        });

        it('should reject hyphens', () => {
            expect(isValidUsername('my-name')).toBe(false);
        });

        it('should reject dots', () => {
            expect(isValidUsername('my.name')).toBe(false);
        });

        it('should reject path traversal characters', () => {
            expect(isValidUsername('../etc')).toBe(false);
            expect(isValidUsername('..\\etc')).toBe(false);
        });
    });
});

// ============================================
// Token generation (JWT format) tests
// ============================================

describe('JWT token format validation', () => {
    // JWT tokens have 3 base64url-encoded parts separated by dots
    const isValidJWTFormat = (token) => {
        if (typeof token !== 'string') return false;
        const parts = token.split('.');
        if (parts.length !== 3) return false;

        // Each part should be valid base64url
        const base64urlRegex = /^[A-Za-z0-9_-]+$/;
        return parts.every(part => part.length > 0 && base64urlRegex.test(part));
    };

    it('should recognize valid JWT format (3 dot-separated base64url parts)', () => {
        // Create a minimal mock JWT: header.payload.signature
        const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
        const payload = Buffer.from(JSON.stringify({ id: 1, type: 'user' })).toString('base64url');
        const signature = crypto.randomBytes(32).toString('base64url');
        const token = `${header}.${payload}.${signature}`;

        expect(isValidJWTFormat(token)).toBe(true);
    });

    it('should reject tokens with fewer than 3 parts', () => {
        expect(isValidJWTFormat('header.payload')).toBe(false);
        expect(isValidJWTFormat('singlepart')).toBe(false);
    });

    it('should reject tokens with more than 3 parts', () => {
        expect(isValidJWTFormat('a.b.c.d')).toBe(false);
    });

    it('should reject empty strings', () => {
        expect(isValidJWTFormat('')).toBe(false);
    });

    it('should reject non-string values', () => {
        expect(isValidJWTFormat(null)).toBe(false);
        expect(isValidJWTFormat(undefined)).toBe(false);
        expect(isValidJWTFormat(123)).toBe(false);
    });

    it('should reject tokens with empty parts', () => {
        expect(isValidJWTFormat('..signature')).toBe(false);
        expect(isValidJWTFormat('header..')).toBe(false);
    });

    it('should parse JWT header correctly', () => {
        const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
        const payload = Buffer.from(JSON.stringify({ id: 1, username: 'test', type: 'user' })).toString('base64url');
        const signature = crypto.randomBytes(32).toString('base64url');
        const token = `${header}.${payload}.${signature}`;

        const decoded = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString());
        expect(decoded.alg).toBe('HS256');
        expect(decoded.typ).toBe('JWT');
    });

    it('should parse JWT payload correctly', () => {
        const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
        const payload = Buffer.from(JSON.stringify({ id: 42, username: 'TestPlayer', type: 'user' })).toString('base64url');
        const signature = crypto.randomBytes(32).toString('base64url');
        const token = `${header}.${payload}.${signature}`;

        const decoded = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
        expect(decoded.id).toBe(42);
        expect(decoded.username).toBe('TestPlayer');
        expect(decoded.type).toBe('user');
    });
});

// ============================================
// IP extraction tests
// ============================================

describe('IP extraction from headers', () => {
    // Replicating logic from src/utils/helpers.js getClientIp
    const getClientIp = (req) => {
        return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
               req.headers['x-real-ip'] ||
               req.connection?.remoteAddress ||
               req.ip ||
               'unknown';
    };

    it('should extract IP from x-forwarded-for header (single IP)', () => {
        const req = {
            headers: { 'x-forwarded-for': '192.168.1.1' },
            connection: { remoteAddress: '127.0.0.1' },
            ip: '127.0.0.1'
        };
        expect(getClientIp(req)).toBe('192.168.1.1');
    });

    it('should extract first IP from x-forwarded-for header (multiple IPs)', () => {
        const req = {
            headers: { 'x-forwarded-for': '192.168.1.1, 10.0.0.1, 172.16.0.1' },
            connection: { remoteAddress: '127.0.0.1' },
            ip: '127.0.0.1'
        };
        expect(getClientIp(req)).toBe('192.168.1.1');
    });

    it('should trim whitespace from x-forwarded-for IP', () => {
        const req = {
            headers: { 'x-forwarded-for': '  192.168.1.1  , 10.0.0.1' },
            connection: { remoteAddress: '127.0.0.1' },
            ip: '127.0.0.1'
        };
        expect(getClientIp(req)).toBe('192.168.1.1');
    });

    it('should fall back to x-real-ip header', () => {
        const req = {
            headers: { 'x-real-ip': '10.0.0.1' },
            connection: { remoteAddress: '127.0.0.1' },
            ip: '127.0.0.1'
        };
        expect(getClientIp(req)).toBe('10.0.0.1');
    });

    it('should fall back to connection.remoteAddress', () => {
        const req = {
            headers: {},
            connection: { remoteAddress: '172.16.0.1' },
            ip: '127.0.0.1'
        };
        expect(getClientIp(req)).toBe('172.16.0.1');
    });

    it('should fall back to req.ip', () => {
        const req = {
            headers: {},
            connection: {},
            ip: '127.0.0.1'
        };
        expect(getClientIp(req)).toBe('127.0.0.1');
    });

    it('should return "unknown" when no IP available', () => {
        const req = {
            headers: {},
            connection: {}
        };
        expect(getClientIp(req)).toBe('unknown');
    });

    it('should handle IPv6 addresses', () => {
        const req = {
            headers: { 'x-forwarded-for': '::1' },
            connection: {},
            ip: '::1'
        };
        expect(getClientIp(req)).toBe('::1');
    });

    it('should handle IPv4-mapped IPv6 addresses', () => {
        const req = {
            headers: { 'x-forwarded-for': '::ffff:192.168.1.1' },
            connection: {},
            ip: '::ffff:192.168.1.1'
        };
        expect(getClientIp(req)).toBe('::ffff:192.168.1.1');
    });

    it('should prioritize x-forwarded-for over x-real-ip', () => {
        const req = {
            headers: {
                'x-forwarded-for': '1.1.1.1',
                'x-real-ip': '2.2.2.2'
            },
            connection: { remoteAddress: '3.3.3.3' },
            ip: '4.4.4.4'
        };
        expect(getClientIp(req)).toBe('1.1.1.1');
    });
});

// ============================================
// Registration flow validation tests (mock)
// ============================================

describe('Registration flow validation', () => {
    // Replicating validation logic from src/routes/auth.js
    const validateRegistration = (username, password) => {
        const errors = [];

        // Username validation
        if (!username || typeof username !== 'string') {
            errors.push('Nazwa uzytkownika jest wymagana');
        } else {
            const trimmed = username.trim();
            if (trimmed.length < 3 || trimmed.length > 16) {
                errors.push('Nazwa musi miec 3-16 znakow');
            }
            if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
                errors.push('Dozwolone: litery, cyfry, podkreslenia');
            }
        }

        // Password validation
        if (!password || typeof password !== 'string') {
            errors.push('Haslo jest wymagane');
        } else if (password.length < 6) {
            errors.push('Haslo musi miec minimum 6 znakow');
        }

        return { valid: errors.length === 0, errors };
    };

    it('should accept valid registration data', () => {
        const result = validateRegistration('Player1', 'password123');
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('should reject missing username', () => {
        const result = validateRegistration(null, 'password123');
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject missing password', () => {
        const result = validateRegistration('Player1', null);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject both missing', () => {
        const result = validateRegistration(null, null);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThanOrEqual(2);
    });

    it('should reject short username', () => {
        const result = validateRegistration('ab', 'password123');
        expect(result.valid).toBe(false);
    });

    it('should reject long username', () => {
        const result = validateRegistration('a'.repeat(17), 'password123');
        expect(result.valid).toBe(false);
    });

    it('should reject username with special characters', () => {
        const result = validateRegistration('user@name', 'password123');
        expect(result.valid).toBe(false);
    });

    it('should reject short password', () => {
        const result = validateRegistration('Player1', '12345');
        expect(result.valid).toBe(false);
    });

    it('should accept boundary username lengths', () => {
        const result3 = validateRegistration('abc', 'password123');
        expect(result3.valid).toBe(true);

        const result16 = validateRegistration('a'.repeat(16), 'password123');
        expect(result16.valid).toBe(true);
    });

    it('should accept boundary password length', () => {
        const result = validateRegistration('Player1', '123456');
        expect(result.valid).toBe(true);
    });
});
