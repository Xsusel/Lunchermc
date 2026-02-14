import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

// ============================================
// Version comparison tests
// ============================================

describe('LauncherVersion.compareVersions', () => {
    // Replicating the compareVersions logic from src/models/LauncherVersion.js
    // to test without importing the model (which requires database connection)
    const compareVersions = (v1, v2) => {
        const parts1 = v1.split('.').map(Number);
        const parts2 = v2.split('.').map(Number);

        for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
            const num1 = parts1[i] || 0;
            const num2 = parts2[i] || 0;

            if (num1 > num2) return 1;
            if (num1 < num2) return -1;
        }

        return 0;
    };

    it('should return -1 when first version is lower (patch)', () => {
        expect(compareVersions('1.0.0', '1.0.1')).toBe(-1);
    });

    it('should return 1 when first version is higher (minor)', () => {
        expect(compareVersions('1.1.0', '1.0.1')).toBe(1);
    });

    it('should return 1 when first version is higher (major)', () => {
        expect(compareVersions('2.0.0', '1.9.9')).toBe(1);
    });

    it('should return 0 when versions are equal', () => {
        expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    });

    it('should handle versions with different segment counts', () => {
        expect(compareVersions('1.0', '1.0.0')).toBe(0);
        expect(compareVersions('1.0.0', '1.0')).toBe(0);
        expect(compareVersions('1.0', '1.0.1')).toBe(-1);
    });

    it('should handle single-segment versions', () => {
        expect(compareVersions('2', '1')).toBe(1);
        expect(compareVersions('1', '2')).toBe(-1);
        expect(compareVersions('1', '1')).toBe(0);
    });
});

// ============================================
// Helper function tests
// ============================================

describe('Helper functions', () => {
    describe('sanitizeFilename', () => {
        // Replicating logic from src/utils/helpers.js
        const sanitizeFilename = (filename) => {
            return filename
                .replace(/[^a-zA-Z0-9._-]/g, '_')
                .replace(/_{2,}/g, '_')
                .slice(0, 255);
        };

        it('should leave clean filenames unchanged', () => {
            expect(sanitizeFilename('test.jar')).toBe('test.jar');
        });

        it('should replace spaces with underscores', () => {
            expect(sanitizeFilename('my mod v1.2.jar')).toBe('my_mod_v1.2.jar');
        });

        it('should sanitize path traversal attempts', () => {
            const result = sanitizeFilename('../../../etc/passwd');
            // Slashes are removed (the dangerous part of path traversal)
            expect(result).not.toContain('/');
            // The result should not allow navigating outside directory
            expect(result).not.toMatch(/\.\.\//);
        });

        it('should collapse consecutive underscores', () => {
            expect(sanitizeFilename('a   b')).toBe('a_b');
        });

        it('should truncate to 255 characters', () => {
            const longName = 'a'.repeat(300) + '.jar';
            expect(sanitizeFilename(longName).length).toBeLessThanOrEqual(255);
        });

        it('should allow hyphens and dots', () => {
            expect(sanitizeFilename('my-mod.v1.2.jar')).toBe('my-mod.v1.2.jar');
        });
    });

    describe('isValidUsername', () => {
        // Replicating logic from src/utils/helpers.js
        const isValidUsername = (username) => {
            const regex = /^[a-zA-Z0-9_]{3,16}$/;
            return regex.test(username);
        };

        it('should accept valid usernames', () => {
            expect(isValidUsername('Player1')).toBe(true);
            expect(isValidUsername('test_user')).toBe(true);
            expect(isValidUsername('abc')).toBe(true);
        });

        it('should reject usernames that are too short', () => {
            expect(isValidUsername('ab')).toBe(false);
            expect(isValidUsername('')).toBe(false);
        });

        it('should reject usernames that are too long', () => {
            expect(isValidUsername('a'.repeat(17))).toBe(false);
        });

        it('should reject usernames with special characters', () => {
            expect(isValidUsername('user@name')).toBe(false);
            expect(isValidUsername('user name')).toBe(false);
            expect(isValidUsername('user!name')).toBe(false);
        });

        it('should accept exactly 16 character usernames', () => {
            expect(isValidUsername('a'.repeat(16))).toBe(true);
        });
    });

    describe('isValidPassword', () => {
        // Replicating logic from src/utils/helpers.js
        const isValidPassword = (password) => {
            return typeof password === 'string' && password.length >= 6;
        };

        it('should accept passwords with 6 or more characters', () => {
            expect(isValidPassword('123456')).toBe(true);
            expect(isValidPassword('strongpassword')).toBe(true);
        });

        it('should reject passwords shorter than 6 characters', () => {
            expect(isValidPassword('12345')).toBe(false);
            expect(isValidPassword('')).toBe(false);
        });

        it('should reject non-string values', () => {
            expect(isValidPassword(null)).toBe(false);
            expect(isValidPassword(undefined)).toBe(false);
            expect(isValidPassword(123456)).toBe(false);
        });
    });

    describe('isValidMCVersion', () => {
        // Replicating logic from src/utils/helpers.js
        const isValidMCVersion = (version) => {
            const regex = /^\d+\.\d+(\.\d+)?$/;
            return regex.test(version);
        };

        it('should accept valid MC versions', () => {
            expect(isValidMCVersion('1.20.1')).toBe(true);
            expect(isValidMCVersion('1.20')).toBe(true);
            expect(isValidMCVersion('1.7.10')).toBe(true);
        });

        it('should reject invalid MC versions', () => {
            expect(isValidMCVersion('abc')).toBe(false);
            expect(isValidMCVersion('1.20.1.1')).toBe(false);
            expect(isValidMCVersion('')).toBe(false);
            expect(isValidMCVersion('1')).toBe(false);
        });
    });

    describe('formatFileSize', () => {
        // Replicating logic from src/utils/helpers.js
        const formatFileSize = (bytes) => {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        };

        it('should format zero bytes', () => {
            expect(formatFileSize(0)).toBe('0 B');
        });

        it('should format bytes', () => {
            expect(formatFileSize(500)).toBe('500 B');
        });

        it('should format kilobytes', () => {
            expect(formatFileSize(1024)).toBe('1 KB');
            expect(formatFileSize(1536)).toBe('1.5 KB');
        });

        it('should format megabytes', () => {
            expect(formatFileSize(1048576)).toBe('1 MB');
        });

        it('should format gigabytes', () => {
            expect(formatFileSize(1073741824)).toBe('1 GB');
        });
    });

    describe('isAllowedModFile', () => {
        // Replicating logic from src/utils/helpers.js
        const getFileExtension = (filename) => {
            const lastDot = filename.lastIndexOf('.');
            if (lastDot === -1) return '';
            return filename.substring(lastDot).toLowerCase();
        };

        const isAllowedModFile = (filename) => {
            const ext = getFileExtension(filename);
            const allowedExtensions = ['.jar', '.zip'];
            return allowedExtensions.includes(ext);
        };

        it('should allow .jar files', () => {
            expect(isAllowedModFile('mymod.jar')).toBe(true);
        });

        it('should allow .zip files', () => {
            expect(isAllowedModFile('resourcepack.zip')).toBe(true);
        });

        it('should reject .exe files', () => {
            expect(isAllowedModFile('malware.exe')).toBe(false);
        });

        it('should reject files without extension', () => {
            expect(isAllowedModFile('noextension')).toBe(false);
        });

        it('should be case insensitive for extensions', () => {
            expect(isAllowedModFile('mymod.JAR')).toBe(true);
        });
    });
});

// ============================================
// Environment validation tests
// ============================================

describe('Environment validation', () => {
    let originalEnv;

    beforeAll(() => {
        originalEnv = { ...process.env };
    });

    afterAll(() => {
        // Restore original environment
        process.env = originalEnv;
    });

    it('should detect missing JWT_SECRET', async () => {
        const savedJWT = process.env.JWT_SECRET;
        delete process.env.JWT_SECRET;
        process.env.NODE_ENV = 'test';

        const { validateEnvironment } = await import('../src/config/validateEnv.js');
        const result = validateEnvironment();

        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors.some(e => e.includes('JWT_SECRET'))).toBe(true);

        // Restore
        if (savedJWT) {
            process.env.JWT_SECRET = savedJWT;
        } else {
            process.env.JWT_SECRET = 'test-secret-key-that-is-at-least-32-characters-long';
        }
    });

    it('should detect JWT_SECRET that is too short', async () => {
        process.env.JWT_SECRET = 'short';
        process.env.NODE_ENV = 'test';

        const { validateEnvironment } = await import('../src/config/validateEnv.js');
        const result = validateEnvironment();

        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors.some(e => e.includes('JWT_SECRET') && e.includes('32'))).toBe(true);

        // Restore
        process.env.JWT_SECRET = 'test-secret-key-that-is-at-least-32-characters-long';
    });

    it('should pass with valid JWT_SECRET', async () => {
        process.env.JWT_SECRET = 'a-valid-secret-key-that-has-more-than-32-chars-total';
        process.env.NODE_ENV = 'test';

        const { validateEnvironment } = await import('../src/config/validateEnv.js');
        const result = validateEnvironment();

        const jwtErrors = result.errors.filter(e => e.includes('JWT_SECRET'));
        expect(jwtErrors.length).toBe(0);
    });

    it('should detect invalid PORT value', async () => {
        process.env.JWT_SECRET = 'a-valid-secret-key-that-has-more-than-32-chars-total';
        process.env.PORT = 'not-a-number';
        process.env.NODE_ENV = 'test';

        const { validateEnvironment } = await import('../src/config/validateEnv.js');
        const result = validateEnvironment();

        expect(result.errors.some(e => e.includes('PORT'))).toBe(true);

        // Restore
        delete process.env.PORT;
    });

    it('should detect invalid NODE_ENV value', async () => {
        process.env.JWT_SECRET = 'a-valid-secret-key-that-has-more-than-32-chars-total';
        process.env.NODE_ENV = 'invalid_env';

        const { validateEnvironment } = await import('../src/config/validateEnv.js');
        const result = validateEnvironment();

        expect(result.errors.some(e => e.includes('NODE_ENV'))).toBe(true);

        // Restore
        process.env.NODE_ENV = 'test';
    });
});

// ============================================
// Constants validation tests
// ============================================

describe('Constants', () => {
    it('should have correct loader types', async () => {
        const { GAME } = await import('../src/config/constants.js');
        expect(GAME.LOADER_TYPES).toContain('vanilla');
        expect(GAME.LOADER_TYPES).toContain('forge');
        expect(GAME.LOADER_TYPES).toContain('fabric');
    });

    it('should have correct allowed mod extensions', async () => {
        const { GAME } = await import('../src/config/constants.js');
        expect(GAME.ALLOWED_MOD_EXTENSIONS).toContain('.jar');
        expect(GAME.ALLOWED_MOD_EXTENSIONS).toContain('.zip');
    });

    it('should have valid default port', async () => {
        const { APP } = await import('../src/config/constants.js');
        expect(APP.DEFAULT_PORT).toBe(3001);
    });

    it('should have valid rate limit configs', async () => {
        const { RATE_LIMITS } = await import('../src/config/constants.js');
        expect(RATE_LIMITS.API.windowMs).toBeGreaterThan(0);
        expect(RATE_LIMITS.API.max).toBeGreaterThan(0);
        expect(RATE_LIMITS.AUTH.max).toBeGreaterThan(0);
        expect(RATE_LIMITS.ADMIN.max).toBeGreaterThan(0);
        expect(RATE_LIMITS.DOWNLOAD.max).toBeGreaterThan(0);
    });

    it('should have valid backup config', async () => {
        const { BACKUP } = await import('../src/config/constants.js');
        expect(BACKUP.DEFAULT_INTERVAL_HOURS).toBeGreaterThan(0);
        expect(BACKUP.MAX_BACKUPS).toBeGreaterThan(0);
        expect(BACKUP.RETENTION_DAYS).toBeGreaterThan(0);
    });

    it('should have valid auth config', async () => {
        const { AUTH } = await import('../src/config/constants.js');
        expect(AUTH.BCRYPT_ROUNDS).toBeGreaterThanOrEqual(10);
        expect(AUTH.MAX_SESSIONS_PER_USER).toBeGreaterThan(0);
        expect(AUTH.TOKEN_TYPE.USER).toBe('user');
        expect(AUTH.TOKEN_TYPE.ADMIN).toBe('admin');
    });

    it('should define valid news types', async () => {
        const { NEWS_TYPES } = await import('../src/config/constants.js');
        expect(NEWS_TYPES).toContain('news');
        expect(NEWS_TYPES).toContain('update');
        expect(NEWS_TYPES).toContain('maintenance');
    });

    it('should define valid ban types', async () => {
        const { BAN_TYPES } = await import('../src/config/constants.js');
        expect(BAN_TYPES).toContain('user');
        expect(BAN_TYPES).toContain('ip');
        expect(BAN_TYPES).toContain('user_and_ip');
    });
});
