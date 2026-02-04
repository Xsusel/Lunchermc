/**
 * Model logów aktywności - rozszerzony audit log
 * Funkcje:
 * - Szczegółowe śledzenie wszystkich akcji w systemie
 * - Kategorie akcji i poziomy ważności
 * - Śledzenie zasobów (mod, user, config, etc.)
 * - Wartości przed/po dla zmian
 * - User agent i session tracking
 * - Zaawansowane wyszukiwanie i filtrowanie
 */
import db from '../config/database.js';

// Migracja - dodaj nowe kolumny jeśli nie istnieją
try {
    db.exec(`
        ALTER TABLE activity_logs ADD COLUMN category TEXT DEFAULT 'general';
    `);
} catch (e) { /* Kolumna już istnieje */ }

try {
    db.exec(`
        ALTER TABLE activity_logs ADD COLUMN severity TEXT DEFAULT 'info';
    `);
} catch (e) { /* Kolumna już istnieje */ }

try {
    db.exec(`
        ALTER TABLE activity_logs ADD COLUMN admin_id INTEGER;
    `);
} catch (e) { /* Kolumna już istnieje */ }

try {
    db.exec(`
        ALTER TABLE activity_logs ADD COLUMN resource_type TEXT;
    `);
} catch (e) { /* Kolumna już istnieje */ }

try {
    db.exec(`
        ALTER TABLE activity_logs ADD COLUMN resource_id TEXT;
    `);
} catch (e) { /* Kolumna już istnieje */ }

try {
    db.exec(`
        ALTER TABLE activity_logs ADD COLUMN old_value TEXT;
    `);
} catch (e) { /* Kolumna już istnieje */ }

try {
    db.exec(`
        ALTER TABLE activity_logs ADD COLUMN new_value TEXT;
    `);
} catch (e) { /* Kolumna już istnieje */ }

try {
    db.exec(`
        ALTER TABLE activity_logs ADD COLUMN user_agent TEXT;
    `);
} catch (e) { /* Kolumna już istnieje */ }

try {
    db.exec(`
        ALTER TABLE activity_logs ADD COLUMN session_id TEXT;
    `);
} catch (e) { /* Kolumna już istnieje */ }

// Dodaj indeksy dla szybszego wyszukiwania
db.exec(`
    CREATE INDEX IF NOT EXISTS idx_activity_logs_category ON activity_logs(category);
    CREATE INDEX IF NOT EXISTS idx_activity_logs_severity ON activity_logs(severity);
    CREATE INDEX IF NOT EXISTS idx_activity_logs_resource ON activity_logs(resource_type, resource_id);
    CREATE INDEX IF NOT EXISTS idx_activity_logs_admin ON activity_logs(admin_id);
    CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at);
`);

// Kategorie akcji
const ActionCategories = {
    AUTH: 'auth',           // Logowanie, wylogowanie, rejestracja
    USER: 'user',           // Zarządzanie użytkownikami
    MOD: 'mod',             // Zarządzanie modami
    CONFIG: 'config',       // Zmiany konfiguracji
    SYSTEM: 'system',       // Akcje systemowe (backup, maintenance)
    SECURITY: 'security',   // Bany, unbany, podejrzane aktywności
    GAME: 'game',           // Uruchamianie gry
    DOWNLOAD: 'download',   // Pobieranie plików
    ADMIN: 'admin'          // Ogólne akcje admina
};

// Poziomy ważności
const SeverityLevels = {
    DEBUG: 'debug',
    INFO: 'info',
    WARNING: 'warning',
    ERROR: 'error',
    CRITICAL: 'critical'
};

// Typy zasobów
const ResourceTypes = {
    USER: 'user',
    MOD: 'mod',
    CONFIG: 'config',
    BROADCAST: 'broadcast',
    FILE: 'file',
    BACKUP: 'backup',
    MAINTENANCE: 'maintenance',
    LAUNCHER: 'launcher'
};

class ActivityLog {
    // Eksportuj stałe
    static Categories = ActionCategories;
    static Severity = SeverityLevels;
    static ResourceTypes = ResourceTypes;
    /**
     * Dodaje nowy wpis do logów (rozszerzony)
     * @param {object} data - Dane logu
     * @returns {object} Utworzony wpis
     */
    static create(data) {
        const stmt = db.prepare(`
            INSERT INTO activity_logs (
                user_id, action, details, ip_address,
                category, severity, admin_id, resource_type,
                resource_id, old_value, new_value, user_agent, session_id
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const result = stmt.run(
            data.user_id || null,
            data.action,
            data.details ? JSON.stringify(data.details) : null,
            data.ip_address || null,
            data.category || 'general',
            data.severity || 'info',
            data.admin_id || null,
            data.resource_type || null,
            data.resource_id || null,
            data.old_value ? JSON.stringify(data.old_value) : null,
            data.new_value ? JSON.stringify(data.new_value) : null,
            data.user_agent || null,
            data.session_id || null
        );

        return this.findById(result.lastInsertRowid);
    }

    /**
     * Tworzy rozszerzony log z pełnymi informacjami
     */
    static log(options) {
        const {
            action,
            category = 'general',
            severity = 'info',
            userId = null,
            adminId = null,
            resourceType = null,
            resourceId = null,
            details = null,
            oldValue = null,
            newValue = null,
            ipAddress = null,
            userAgent = null,
            sessionId = null
        } = options;

        return this.create({
            action,
            category,
            severity,
            user_id: userId,
            admin_id: adminId,
            resource_type: resourceType,
            resource_id: resourceId,
            details,
            old_value: oldValue,
            new_value: newValue,
            ip_address: ipAddress,
            user_agent: userAgent,
            session_id: sessionId
        });
    }

    /**
     * Parsuje wszystkie pola JSON w logu
     */
    static parseLogJson(log) {
        if (!log) return null;

        const jsonFields = ['details', 'old_value', 'new_value'];
        for (const field of jsonFields) {
            if (log[field]) {
                try {
                    log[field] = JSON.parse(log[field]);
                } catch (e) {
                    // Pozostawiamy jako string jeśli nie jest JSON-em
                }
            }
        }
        return log;
    }

    /**
     * Znajduje wpis po ID
     * @param {number} id - ID wpisu
     * @returns {object|null} Wpis lub null
     */
    static findById(id) {
        const log = db.prepare('SELECT * FROM activity_logs WHERE id = ?').get(id);
        return this.parseLogJson(log);
    }

    /**
     * Pobiera logi z zaawansowanym filtrowaniem
     * @param {object} options - Opcje filtrowania
     * @returns {object} { logs, total, page, pages }
     */
    static getAll(options = {}) {
        const {
            limit = 100,
            offset = 0,
            action = null,
            category = null,
            severity = null,
            userId = null,
            adminId = null,
            resourceType = null,
            resourceId = null,
            ipAddress = null,
            startDate = null,
            endDate = null,
            search = null
        } = options;

        let whereClauses = [];
        const params = [];

        if (action) {
            whereClauses.push('al.action = ?');
            params.push(action);
        }
        if (category) {
            whereClauses.push('al.category = ?');
            params.push(category);
        }
        if (severity) {
            whereClauses.push('al.severity = ?');
            params.push(severity);
        }
        if (userId) {
            whereClauses.push('al.user_id = ?');
            params.push(userId);
        }
        if (adminId) {
            whereClauses.push('al.admin_id = ?');
            params.push(adminId);
        }
        if (resourceType) {
            whereClauses.push('al.resource_type = ?');
            params.push(resourceType);
        }
        if (resourceId) {
            whereClauses.push('al.resource_id = ?');
            params.push(resourceId);
        }
        if (ipAddress) {
            whereClauses.push('al.ip_address = ?');
            params.push(ipAddress);
        }
        if (startDate) {
            whereClauses.push('al.created_at >= ?');
            params.push(startDate);
        }
        if (endDate) {
            whereClauses.push('al.created_at <= ?');
            params.push(endDate);
        }
        if (search) {
            whereClauses.push('(al.action LIKE ? OR al.details LIKE ? OR u.username LIKE ?)');
            const searchPattern = `%${search}%`;
            params.push(searchPattern, searchPattern, searchPattern);
        }

        const whereClause = whereClauses.length > 0
            ? 'WHERE ' + whereClauses.join(' AND ')
            : '';

        // Count total
        const countSql = `
            SELECT COUNT(*) as total
            FROM activity_logs al
            LEFT JOIN users u ON al.user_id = u.id
            ${whereClause}
        `;
        const { total } = db.prepare(countSql).get(...params);

        // Fetch logs
        const sql = `
            SELECT al.*, u.username,
                   a.username as admin_username
            FROM activity_logs al
            LEFT JOIN users u ON al.user_id = u.id
            LEFT JOIN admins a ON al.admin_id = a.id
            ${whereClause}
            ORDER BY al.created_at DESC
            LIMIT ? OFFSET ?
        `;
        params.push(limit, offset);

        const logs = db.prepare(sql).all(...params).map(log => this.parseLogJson(log));

        return {
            logs,
            total,
            page: Math.floor(offset / limit) + 1,
            pages: Math.ceil(total / limit),
            limit
        };
    }

    /**
     * Prosta wersja getAll (kompatybilność wsteczna)
     */
    static getAllSimple(limit = 100, offset = 0, action = null) {
        const result = this.getAll({ limit, offset, action });
        return result.logs;
    }

    /**
     * Pobiera logi użytkownika
     * @param {number} userId - ID użytkownika
     * @param {number} limit - Limit wyników
     * @returns {array} Lista logów
     */
    static getByUser(userId, limit = 50) {
        return db.prepare(`
            SELECT * FROM activity_logs
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT ?
        `).all(userId, limit).map(log => this.parseLogJson(log));
    }

    /**
     * Pobiera logi admina
     * @param {number} adminId - ID admina
     * @param {number} limit - Limit wyników
     * @returns {array} Lista logów
     */
    static getByAdmin(adminId, limit = 50) {
        return db.prepare(`
            SELECT * FROM activity_logs
            WHERE admin_id = ?
            ORDER BY created_at DESC
            LIMIT ?
        `).all(adminId, limit).map(log => this.parseLogJson(log));
    }

    /**
     * Pobiera logi dla konkretnego zasobu
     */
    static getByResource(resourceType, resourceId, limit = 50) {
        return db.prepare(`
            SELECT al.*, u.username, a.username as admin_username
            FROM activity_logs al
            LEFT JOIN users u ON al.user_id = u.id
            LEFT JOIN admins a ON al.admin_id = a.id
            WHERE al.resource_type = ? AND al.resource_id = ?
            ORDER BY al.created_at DESC
            LIMIT ?
        `).all(resourceType, resourceId, limit).map(log => this.parseLogJson(log));
    }

    /**
     * Pobiera logi według kategorii
     */
    static getByCategory(category, limit = 100, offset = 0) {
        return db.prepare(`
            SELECT al.*, u.username, a.username as admin_username
            FROM activity_logs al
            LEFT JOIN users u ON al.user_id = u.id
            LEFT JOIN admins a ON al.admin_id = a.id
            WHERE al.category = ?
            ORDER BY al.created_at DESC
            LIMIT ? OFFSET ?
        `).all(category, limit, offset).map(log => this.parseLogJson(log));
    }

    /**
     * Pobiera logi według severity (warning, error, critical)
     */
    static getBySeverity(severity, limit = 100) {
        return db.prepare(`
            SELECT al.*, u.username, a.username as admin_username
            FROM activity_logs al
            LEFT JOIN users u ON al.user_id = u.id
            LEFT JOIN admins a ON al.admin_id = a.id
            WHERE al.severity = ?
            ORDER BY al.created_at DESC
            LIMIT ?
        `).all(severity, limit).map(log => this.parseLogJson(log));
    }

    /**
     * Pobiera logi security (warning+ severity)
     */
    static getSecurityLogs(limit = 100) {
        return db.prepare(`
            SELECT al.*, u.username, a.username as admin_username
            FROM activity_logs al
            LEFT JOIN users u ON al.user_id = u.id
            LEFT JOIN admins a ON al.admin_id = a.id
            WHERE al.category = 'security' OR al.severity IN ('warning', 'error', 'critical')
            ORDER BY al.created_at DESC
            LIMIT ?
        `).all(limit).map(log => this.parseLogJson(log));
    }

    /**
     * Pobiera ostatnie logowania z podejrzanych IP (wiele nieudanych prób)
     */
    static getSuspiciousLogins(threshold = 5, hoursBack = 24) {
        return db.prepare(`
            SELECT ip_address, COUNT(*) as attempts,
                   MIN(created_at) as first_attempt,
                   MAX(created_at) as last_attempt
            FROM activity_logs
            WHERE action IN ('login_failed', 'auth_failed')
            AND created_at > datetime('now', '-' || ? || ' hours')
            GROUP BY ip_address
            HAVING COUNT(*) >= ?
            ORDER BY attempts DESC
        `).all(hoursBack, threshold);
    }

    /**
     * Usuwa stare logi (starsze niż podana liczba dni)
     * @param {number} days - Liczba dni
     * @returns {number} Liczba usuniętych wpisów
     */
    static deleteOlderThan(days = 30) {
        const result = db.prepare(`
            DELETE FROM activity_logs
            WHERE created_at < datetime('now', '-' || ? || ' days')
        `).run(days);
        return result.changes;
    }

    /**
     * Pobiera statystyki aktywności z ostatnich dni
     * @param {number} days - Liczba dni
     * @returns {array} Statystyki dzienne
     */
    static getStats(days = 7) {
        return db.prepare(`
            SELECT
                date(created_at) as date,
                action,
                COUNT(*) as count
            FROM activity_logs
            WHERE created_at >= datetime('now', '-' || ? || ' days')
            GROUP BY date(created_at), action
            ORDER BY date DESC
        `).all(days);
    }

    /**
     * Pobiera rozszerzone statystyki
     */
    static getExtendedStats(days = 7) {
        const byCategory = db.prepare(`
            SELECT category, COUNT(*) as count
            FROM activity_logs
            WHERE created_at >= datetime('now', '-' || ? || ' days')
            GROUP BY category
            ORDER BY count DESC
        `).all(days);

        const bySeverity = db.prepare(`
            SELECT severity, COUNT(*) as count
            FROM activity_logs
            WHERE created_at >= datetime('now', '-' || ? || ' days')
            GROUP BY severity
            ORDER BY count DESC
        `).all(days);

        const topActions = db.prepare(`
            SELECT action, COUNT(*) as count
            FROM activity_logs
            WHERE created_at >= datetime('now', '-' || ? || ' days')
            GROUP BY action
            ORDER BY count DESC
            LIMIT 20
        `).all(days);

        const topIPs = db.prepare(`
            SELECT ip_address, COUNT(*) as count
            FROM activity_logs
            WHERE created_at >= datetime('now', '-' || ? || ' days')
            AND ip_address IS NOT NULL
            GROUP BY ip_address
            ORDER BY count DESC
            LIMIT 10
        `).all(days);

        const hourlyActivity = db.prepare(`
            SELECT strftime('%H', created_at) as hour, COUNT(*) as count
            FROM activity_logs
            WHERE created_at >= datetime('now', '-' || ? || ' days')
            GROUP BY hour
            ORDER BY hour
        `).all(days);

        const dailyTotals = db.prepare(`
            SELECT date(created_at) as date, COUNT(*) as total
            FROM activity_logs
            WHERE created_at >= datetime('now', '-' || ? || ' days')
            GROUP BY date
            ORDER BY date DESC
        `).all(days);

        return {
            byCategory,
            bySeverity,
            topActions,
            topIPs,
            hourlyActivity,
            dailyTotals,
            totalLogs: dailyTotals.reduce((sum, d) => sum + d.total, 0)
        };
    }

    // ============================================
    // METODY LOGOWANIA (ROZSZERZONE)
    // ============================================

    /**
     * Loguje logowanie użytkownika
     */
    static logLogin(userId, ip, userAgent = null, sessionId = null) {
        return this.log({
            action: 'login',
            category: ActionCategories.AUTH,
            severity: SeverityLevels.INFO,
            userId,
            ipAddress: ip,
            userAgent,
            sessionId,
            details: { type: 'user_login' }
        });
    }

    /**
     * Loguje nieudane logowanie
     */
    static logLoginFailed(username, ip, userAgent = null, reason = 'invalid_credentials') {
        return this.log({
            action: 'login_failed',
            category: ActionCategories.SECURITY,
            severity: SeverityLevels.WARNING,
            ipAddress: ip,
            userAgent,
            details: { username, reason }
        });
    }

    /**
     * Loguje wylogowanie użytkownika
     */
    static logLogout(userId, ip, sessionId = null) {
        return this.log({
            action: 'logout',
            category: ActionCategories.AUTH,
            severity: SeverityLevels.INFO,
            userId,
            ipAddress: ip,
            sessionId
        });
    }

    /**
     * Loguje uruchomienie gry
     */
    static logGameStart(userId, gameVersion, ip, userAgent = null) {
        return this.log({
            action: 'game_start',
            category: ActionCategories.GAME,
            severity: SeverityLevels.INFO,
            userId,
            ipAddress: ip,
            userAgent,
            details: { game_version: gameVersion }
        });
    }

    /**
     * Loguje zamknięcie gry
     */
    static logGameEnd(userId, gameVersion, playTime, ip) {
        return this.log({
            action: 'game_end',
            category: ActionCategories.GAME,
            severity: SeverityLevels.INFO,
            userId,
            ipAddress: ip,
            details: { game_version: gameVersion, play_time_seconds: playTime }
        });
    }

    /**
     * Loguje rejestrację użytkownika
     */
    static logRegistration(userId, ip, userAgent = null) {
        return this.log({
            action: 'registration',
            category: ActionCategories.AUTH,
            severity: SeverityLevels.INFO,
            userId,
            ipAddress: ip,
            userAgent,
            resourceType: ResourceTypes.USER,
            resourceId: String(userId),
            details: { type: 'new_user' }
        });
    }

    /**
     * Loguje akcję administratora
     */
    static logAdminAction(action, details, ip, adminId = null, options = {}) {
        const {
            resourceType = null,
            resourceId = null,
            oldValue = null,
            newValue = null,
            severity = SeverityLevels.INFO
        } = options;

        return this.log({
            action: `admin_${action}`,
            category: ActionCategories.ADMIN,
            severity,
            adminId,
            ipAddress: ip,
            resourceType,
            resourceId,
            oldValue,
            newValue,
            details
        });
    }

    /**
     * Loguje zmianę moda
     */
    static logModChange(action, modId, modName, adminId, ip, oldValue = null, newValue = null) {
        return this.log({
            action: `mod_${action}`,
            category: ActionCategories.MOD,
            severity: SeverityLevels.INFO,
            adminId,
            ipAddress: ip,
            resourceType: ResourceTypes.MOD,
            resourceId: String(modId),
            oldValue,
            newValue,
            details: { mod_name: modName }
        });
    }

    /**
     * Loguje zmianę konfiguracji
     */
    static logConfigChange(configKey, oldValue, newValue, adminId, ip) {
        return this.log({
            action: 'config_update',
            category: ActionCategories.CONFIG,
            severity: SeverityLevels.INFO,
            adminId,
            ipAddress: ip,
            resourceType: ResourceTypes.CONFIG,
            resourceId: configKey,
            oldValue,
            newValue,
            details: { config_key: configKey }
        });
    }

    /**
     * Loguje ban użytkownika
     */
    static logBan(userId, username, adminId, ip, reason = null) {
        return this.log({
            action: 'user_ban',
            category: ActionCategories.SECURITY,
            severity: SeverityLevels.WARNING,
            userId,
            adminId,
            ipAddress: ip,
            resourceType: ResourceTypes.USER,
            resourceId: String(userId),
            details: { username, reason }
        });
    }

    /**
     * Loguje unban użytkownika
     */
    static logUnban(userId, username, adminId, ip) {
        return this.log({
            action: 'user_unban',
            category: ActionCategories.SECURITY,
            severity: SeverityLevels.INFO,
            userId,
            adminId,
            ipAddress: ip,
            resourceType: ResourceTypes.USER,
            resourceId: String(userId),
            details: { username }
        });
    }

    /**
     * Loguje utworzenie backupu
     */
    static logBackupCreate(backupFilename, adminId, ip, size = null) {
        return this.log({
            action: 'backup_create',
            category: ActionCategories.SYSTEM,
            severity: SeverityLevels.INFO,
            adminId,
            ipAddress: ip,
            resourceType: ResourceTypes.BACKUP,
            resourceId: backupFilename,
            details: { filename: backupFilename, size }
        });
    }

    /**
     * Loguje przywrócenie z backupu
     */
    static logBackupRestore(backupFilename, adminId, ip) {
        return this.log({
            action: 'backup_restore',
            category: ActionCategories.SYSTEM,
            severity: SeverityLevels.WARNING,
            adminId,
            ipAddress: ip,
            resourceType: ResourceTypes.BACKUP,
            resourceId: backupFilename,
            details: { filename: backupFilename }
        });
    }

    /**
     * Loguje zmianę maintenance mode
     */
    static logMaintenanceChange(enabled, message, adminId, ip) {
        return this.log({
            action: enabled ? 'maintenance_enable' : 'maintenance_disable',
            category: ActionCategories.SYSTEM,
            severity: enabled ? SeverityLevels.WARNING : SeverityLevels.INFO,
            adminId,
            ipAddress: ip,
            resourceType: ResourceTypes.MAINTENANCE,
            details: { enabled, message }
        });
    }

    /**
     * Loguje pobieranie pliku
     */
    static logDownload(userId, filename, fileType, ip, userAgent = null) {
        return this.log({
            action: 'file_download',
            category: ActionCategories.DOWNLOAD,
            severity: SeverityLevels.DEBUG,
            userId,
            ipAddress: ip,
            userAgent,
            resourceType: ResourceTypes.FILE,
            resourceId: filename,
            details: { filename, file_type: fileType }
        });
    }

    /**
     * Loguje zdarzenie security
     */
    static logSecurityEvent(event, ip, details = {}, severity = SeverityLevels.WARNING) {
        return this.log({
            action: `security_${event}`,
            category: ActionCategories.SECURITY,
            severity,
            ipAddress: ip,
            details
        });
    }

    // ============================================
    // EKSPORT
    // ============================================

    /**
     * Eksportuje logi do formatu CSV
     */
    static exportToCsv(options = {}) {
        const result = this.getAll({ ...options, limit: 10000 });
        const logs = result.logs;

        const headers = [
            'id', 'created_at', 'action', 'category', 'severity',
            'user_id', 'username', 'admin_id', 'admin_username',
            'ip_address', 'resource_type', 'resource_id', 'details'
        ];

        let csv = headers.join(',') + '\n';

        for (const log of logs) {
            const row = [
                log.id,
                log.created_at,
                log.action,
                log.category || '',
                log.severity || '',
                log.user_id || '',
                log.username || '',
                log.admin_id || '',
                log.admin_username || '',
                log.ip_address || '',
                log.resource_type || '',
                log.resource_id || '',
                log.details ? JSON.stringify(log.details).replace(/"/g, '""') : ''
            ].map(v => `"${v}"`).join(',');
            csv += row + '\n';
        }

        return csv;
    }

    /**
     * Pobiera podsumowanie dla okresu
     */
    static getSummary(startDate, endDate) {
        const totalLogs = db.prepare(`
            SELECT COUNT(*) as count FROM activity_logs
            WHERE created_at BETWEEN ? AND ?
        `).get(startDate, endDate).count;

        const uniqueUsers = db.prepare(`
            SELECT COUNT(DISTINCT user_id) as count FROM activity_logs
            WHERE created_at BETWEEN ? AND ? AND user_id IS NOT NULL
        `).get(startDate, endDate).count;

        const uniqueIPs = db.prepare(`
            SELECT COUNT(DISTINCT ip_address) as count FROM activity_logs
            WHERE created_at BETWEEN ? AND ? AND ip_address IS NOT NULL
        `).get(startDate, endDate).count;

        const securityEvents = db.prepare(`
            SELECT COUNT(*) as count FROM activity_logs
            WHERE created_at BETWEEN ? AND ?
            AND (category = 'security' OR severity IN ('warning', 'error', 'critical'))
        `).get(startDate, endDate).count;

        return {
            period: { start: startDate, end: endDate },
            totalLogs,
            uniqueUsers,
            uniqueIPs,
            securityEvents
        };
    }
}

export default ActivityLog;
