/**
 * Centralna konfiguracja i stale aplikacji
 */

export const APP = {
    NAME: 'Minecraft Launcher API',
    VERSION: '1.1.0',
    DEFAULT_PORT: 3001
};

export const AUTH = {
    BCRYPT_ROUNDS: 12,
    JWT_DEFAULT_EXPIRY: '7d',
    TEMP_TOKEN_EXPIRY: '5m',
    MAX_SESSIONS_PER_USER: 5,
    TOKEN_TYPE: {
        USER: 'user',
        ADMIN: 'admin',
        ADMIN_2FA_PENDING: 'admin_2fa_pending'
    }
};

export const GAME = {
    DEFAULT_VERSION: '1.20.1',
    DEFAULT_JAVA_ARGS: '-Xmx4G -Xms2G -XX:+UseG1GC -Dfile.encoding=UTF-8',
    DEFAULT_SERVER_PORT: 25565,
    LOADER_TYPES: ['vanilla', 'forge', 'fabric'],
    MOD_TYPES: ['mod', 'coremod', 'library', 'config'],
    ALLOWED_MOD_EXTENSIONS: ['.jar', '.zip']
};

export const UPLOAD = {
    MAX_MOD_SIZE_MB: 100,
    MAX_SKIN_SIZE_KB: 64,
    SKIN_DIMENSIONS: { classic: [64, 64], slim: [64, 64], legacy: [64, 32] },
    CAPE_DIMENSIONS: [64, 32],
    ALLOWED_IMAGE_TYPES: ['image/png']
};

export const BACKUP = {
    DEFAULT_INTERVAL_HOURS: 6,
    MAX_BACKUPS: 30,
    RETENTION_DAYS: 90
};

export const CACHE = {
    SERVER_STATUS_TTL: 30000,  // 30 seconds
    CONFIG_TTL: 300000         // 5 minutes
};

export const RATE_LIMITS = {
    API: { windowMs: 15 * 60 * 1000, max: 100 },
    AUTH: { windowMs: 15 * 60 * 1000, max: 10 },
    ADMIN: { windowMs: 15 * 60 * 1000, max: 200 },
    DOWNLOAD: { windowMs: 60 * 1000, max: 30 }
};

export const MAINTENANCE = {
    CHECK_INTERVAL_MS: 60 * 1000,  // 1 minute
    APPROACHING_THRESHOLD_MIN: 5
};

export const NEWS_TYPES = ['news', 'update', 'event', 'maintenance', 'announcement'];
export const BAN_TYPES = ['user', 'ip', 'user_and_ip'];
export const APPEAL_STATUSES = ['pending', 'approved', 'rejected'];
