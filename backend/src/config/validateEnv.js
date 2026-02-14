/**
 * Walidacja zmiennych srodowiskowych przy starcie aplikacji
 */

const requiredVars = [
    { name: 'JWT_SECRET', minLength: 32, description: 'Secret key for JWT tokens' }
];

const optionalVars = [
    { name: 'PORT', type: 'number', default: 3001 },
    { name: 'NODE_ENV', values: ['development', 'production', 'test'], default: 'development' },
    { name: 'JWT_EXPIRES_IN', default: '7d' },
    { name: 'DATABASE_PATH', default: './data/launcher.db' },
    { name: 'ADMIN_USERNAME', default: 'admin' },
    { name: 'ADMIN_PASSWORD', minLength: 6, sensitive: true },
    { name: 'MC_SERVER_IP', default: 'localhost' },
    { name: 'MC_SERVER_PORT', type: 'number', default: 25565 },
    { name: 'MAX_FILE_SIZE_MB', type: 'number', default: 100 },
    { name: 'BACKUP_INTERVAL_HOURS', type: 'number', default: 6 },
    { name: 'MAX_BACKUPS', type: 'number', default: 30 }
];

export function validateEnvironment() {
    const errors = [];
    const warnings = [];

    // Check required vars
    for (const v of requiredVars) {
        const value = process.env[v.name];
        if (!value) {
            errors.push(`Missing required environment variable: ${v.name} - ${v.description}`);
            continue;
        }
        if (v.minLength && value.length < v.minLength) {
            errors.push(`${v.name} must be at least ${v.minLength} characters long`);
        }
    }

    // Check optional vars
    for (const v of optionalVars) {
        const value = process.env[v.name];
        if (!value) {
            if (v.name === 'ADMIN_PASSWORD' && process.env.NODE_ENV === 'production') {
                warnings.push(`${v.name} not set - using default (CHANGE IN PRODUCTION!)`);
            }
            continue;
        }
        if (v.type === 'number' && isNaN(parseInt(value))) {
            errors.push(`${v.name} must be a valid number, got: ${value}`);
        }
        if (v.values && !v.values.includes(value)) {
            errors.push(`${v.name} must be one of: ${v.values.join(', ')}, got: ${value}`);
        }
        if (v.minLength && value.length < v.minLength) {
            warnings.push(`${v.name} should be at least ${v.minLength} characters for security`);
        }
    }

    // Print warnings
    if (warnings.length > 0) {
        console.warn('⚠️  Environment warnings:');
        warnings.forEach(w => console.warn(`   - ${w}`));
    }

    // Fail on errors
    if (errors.length > 0) {
        console.error('❌ Environment validation failed:');
        errors.forEach(e => console.error(`   - ${e}`));
        if (process.env.NODE_ENV === 'production') {
            process.exit(1);
        } else {
            console.warn('⚠️  Continuing in development mode despite errors...');
        }
    }

    return { errors, warnings };
}
