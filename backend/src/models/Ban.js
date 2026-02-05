/**
 * Rozszerzony system banów
 * Funkcje:
 * - Bany użytkowników (permanentne i tymczasowe)
 * - Bany IP
 * - Historia banów
 * - Apele
 */
import db from '../config/database.js';

// Twórz tabele jeśli nie istnieją
db.exec(`
    CREATE TABLE IF NOT EXISTS bans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        ip_address TEXT,
        ban_type TEXT NOT NULL DEFAULT 'user',
        reason TEXT,
        notes TEXT,
        expires_at DATETIME,
        is_permanent INTEGER DEFAULT 1,
        is_active INTEGER DEFAULT 1,
        banned_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        unbanned_at DATETIME,
        unbanned_by INTEGER,
        unban_reason TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    )
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS ban_appeals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ban_id INTEGER NOT NULL,
        user_id INTEGER,
        appeal_text TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        reviewed_by INTEGER,
        reviewed_at DATETIME,
        review_notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (ban_id) REFERENCES bans(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    )
`);

// Indeksy
db.exec(`
    CREATE INDEX IF NOT EXISTS idx_bans_user ON bans(user_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_bans_ip ON bans(ip_address, is_active);
    CREATE INDEX IF NOT EXISTS idx_bans_expires ON bans(expires_at, is_active);
    CREATE INDEX IF NOT EXISTS idx_ban_appeals_status ON ban_appeals(status, ban_id);
`);

// Typy banów
const BanTypes = {
    USER: 'user',
    IP: 'ip',
    USER_AND_IP: 'user_and_ip'
};

// Statusy apeli
const AppealStatus = {
    PENDING: 'pending',
    APPROVED: 'approved',
    REJECTED: 'rejected'
};

class Ban {
    static BanTypes = BanTypes;
    static AppealStatus = AppealStatus;

    // ============================================
    // ZARZĄDZANIE BANAMI
    // ============================================

    /**
     * Tworzy nowy ban
     */
    static create(data) {
        const {
            userId = null,
            ipAddress = null,
            banType = BanTypes.USER,
            reason = '',
            notes = '',
            expiresAt = null,
            isPermanent = true,
            bannedBy = null
        } = data;

        // Walidacja - musi być user lub IP
        if (!userId && !ipAddress) {
            throw new Error('Wymagane jest userId lub ipAddress');
        }

        const stmt = db.prepare(`
            INSERT INTO bans (
                user_id, ip_address, ban_type, reason, notes,
                expires_at, is_permanent, banned_by
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const result = stmt.run(
            userId,
            ipAddress,
            banType,
            reason,
            notes,
            expiresAt,
            isPermanent ? 1 : 0,
            bannedBy
        );

        // Jeśli banujemy usera, zaktualizuj też tabelę users
        if (userId && (banType === BanTypes.USER || banType === BanTypes.USER_AND_IP)) {
            db.prepare(`
                UPDATE users SET is_banned = 1, ban_reason = ? WHERE id = ?
            `).run(reason, userId);
        }

        return this.findById(result.lastInsertRowid);
    }

    /**
     * Banuje użytkownika (helper)
     */
    static banUser(userId, reason, options = {}) {
        const {
            notes = '',
            expiresAt = null,
            isPermanent = true,
            bannedBy = null,
            alsobanIP = false,
            ipAddress = null
        } = options;

        return this.create({
            userId,
            ipAddress: alsobanIP ? ipAddress : null,
            banType: alsobanIP ? BanTypes.USER_AND_IP : BanTypes.USER,
            reason,
            notes,
            expiresAt,
            isPermanent,
            bannedBy
        });
    }

    /**
     * Banuje IP (helper)
     */
    static banIP(ipAddress, reason, options = {}) {
        const {
            notes = '',
            expiresAt = null,
            isPermanent = true,
            bannedBy = null
        } = options;

        return this.create({
            ipAddress,
            banType: BanTypes.IP,
            reason,
            notes,
            expiresAt,
            isPermanent,
            bannedBy
        });
    }

    /**
     * Tymczasowy ban (helper)
     */
    static temporaryBan(userId, reason, durationMinutes, options = {}) {
        const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();
        return this.banUser(userId, reason, {
            ...options,
            expiresAt,
            isPermanent: false
        });
    }

    /**
     * Znajduje ban po ID
     */
    static findById(id) {
        return db.prepare(`
            SELECT b.*, u.username as banned_username, a.username as banned_by_username
            FROM bans b
            LEFT JOIN users u ON b.user_id = u.id
            LEFT JOIN admins a ON b.banned_by = a.id
            WHERE b.id = ?
        `).get(id);
    }

    /**
     * Pobiera wszystkie aktywne bany
     */
    static getAll(options = {}) {
        const {
            limit = 100,
            offset = 0,
            activeOnly = true,
            banType = null,
            userId = null,
            ipAddress = null
        } = options;

        let whereClauses = [];
        const params = [];

        if (activeOnly) {
            whereClauses.push('b.is_active = 1');
        }
        if (banType) {
            whereClauses.push('b.ban_type = ?');
            params.push(banType);
        }
        if (userId) {
            whereClauses.push('b.user_id = ?');
            params.push(userId);
        }
        if (ipAddress) {
            whereClauses.push('b.ip_address = ?');
            params.push(ipAddress);
        }

        const whereClause = whereClauses.length > 0
            ? 'WHERE ' + whereClauses.join(' AND ')
            : '';

        // Count
        const { total } = db.prepare(`
            SELECT COUNT(*) as total FROM bans b ${whereClause}
        `).get(...params);

        // Fetch
        params.push(limit, offset);
        const bans = db.prepare(`
            SELECT b.*, u.username as banned_username, a.username as banned_by_username
            FROM bans b
            LEFT JOIN users u ON b.user_id = u.id
            LEFT JOIN admins a ON b.banned_by = a.id
            ${whereClause}
            ORDER BY b.created_at DESC
            LIMIT ? OFFSET ?
        `).all(...params);

        return { bans, total };
    }

    /**
     * Sprawdza czy użytkownik jest zbanowany
     */
    static isUserBanned(userId) {
        // Sprawdź aktywne bany (włącznie z tymczasowymi)
        const ban = db.prepare(`
            SELECT * FROM bans
            WHERE user_id = ?
            AND is_active = 1
            AND (is_permanent = 1 OR expires_at > datetime('now'))
            ORDER BY created_at DESC
            LIMIT 1
        `).get(userId);

        return ban || null;
    }

    /**
     * Sprawdza czy IP jest zbanowane
     */
    static isIPBanned(ipAddress) {
        const ban = db.prepare(`
            SELECT * FROM bans
            WHERE ip_address = ?
            AND is_active = 1
            AND (is_permanent = 1 OR expires_at > datetime('now'))
            ORDER BY created_at DESC
            LIMIT 1
        `).get(ipAddress);

        return ban || null;
    }

    /**
     * Sprawdza czy użytkownik lub jego IP jest zbanowane
     */
    static checkBan(userId, ipAddress = null) {
        const userBan = this.isUserBanned(userId);
        if (userBan) return { banned: true, ban: userBan, type: 'user' };

        if (ipAddress) {
            const ipBan = this.isIPBanned(ipAddress);
            if (ipBan) return { banned: true, ban: ipBan, type: 'ip' };
        }

        return { banned: false };
    }

    /**
     * Unbanuje (dezaktywuje ban)
     */
    static unban(banId, unbannedBy = null, reason = '') {
        const ban = this.findById(banId);
        if (!ban) return false;

        db.prepare(`
            UPDATE bans
            SET is_active = 0, unbanned_at = datetime('now'),
                unbanned_by = ?, unban_reason = ?
            WHERE id = ?
        `).run(unbannedBy, reason, banId);

        // Jeśli to był ban usera, zaktualizuj tabelę users
        if (ban.user_id && (ban.ban_type === BanTypes.USER || ban.ban_type === BanTypes.USER_AND_IP)) {
            // Sprawdź czy nie ma innych aktywnych banów
            const otherBan = this.isUserBanned(ban.user_id);
            if (!otherBan) {
                db.prepare(`
                    UPDATE users SET is_banned = 0, ban_reason = NULL WHERE id = ?
                `).run(ban.user_id);
            }
        }

        return true;
    }

    /**
     * Unbanuje użytkownika (wszystkie aktywne bany)
     */
    static unbanUser(userId, unbannedBy = null, reason = '') {
        const result = db.prepare(`
            UPDATE bans
            SET is_active = 0, unbanned_at = datetime('now'),
                unbanned_by = ?, unban_reason = ?
            WHERE user_id = ? AND is_active = 1
        `).run(unbannedBy, reason, userId);

        // Zaktualizuj tabelę users
        db.prepare(`
            UPDATE users SET is_banned = 0, ban_reason = NULL WHERE id = ?
        `).run(userId);

        return result.changes;
    }

    /**
     * Unbanuje IP (wszystkie aktywne bany)
     */
    static unbanIP(ipAddress, unbannedBy = null, reason = '') {
        const result = db.prepare(`
            UPDATE bans
            SET is_active = 0, unbanned_at = datetime('now'),
                unbanned_by = ?, unban_reason = ?
            WHERE ip_address = ? AND is_active = 1
        `).run(unbannedBy, reason, ipAddress);

        return result.changes;
    }

    /**
     * Pobiera historię banów użytkownika
     */
    static getUserBanHistory(userId) {
        return db.prepare(`
            SELECT b.*, a.username as banned_by_username, ua.username as unbanned_by_username
            FROM bans b
            LEFT JOIN admins a ON b.banned_by = a.id
            LEFT JOIN admins ua ON b.unbanned_by = ua.id
            WHERE b.user_id = ?
            ORDER BY b.created_at DESC
        `).all(userId);
    }

    /**
     * Pobiera historię banów dla IP
     */
    static getIPBanHistory(ipAddress) {
        return db.prepare(`
            SELECT b.*, u.username as banned_username, a.username as banned_by_username
            FROM bans b
            LEFT JOIN users u ON b.user_id = u.id
            LEFT JOIN admins a ON b.banned_by = a.id
            WHERE b.ip_address = ?
            ORDER BY b.created_at DESC
        `).all(ipAddress);
    }

    /**
     * Automatycznie dezaktywuje wygasłe bany
     */
    static cleanupExpired() {
        // Znajdź wygasłe bany
        const expiredBans = db.prepare(`
            SELECT id, user_id FROM bans
            WHERE is_active = 1
            AND is_permanent = 0
            AND expires_at <= datetime('now')
        `).all();

        // Dezaktywuj
        const result = db.prepare(`
            UPDATE bans
            SET is_active = 0, unbanned_at = datetime('now'), unban_reason = 'expired'
            WHERE is_active = 1 AND is_permanent = 0 AND expires_at <= datetime('now')
        `).run();

        // Zaktualizuj tabelę users dla każdego usera
        for (const ban of expiredBans) {
            if (ban.user_id) {
                const otherBan = this.isUserBanned(ban.user_id);
                if (!otherBan) {
                    db.prepare(`
                        UPDATE users SET is_banned = 0, ban_reason = NULL WHERE id = ?
                    `).run(ban.user_id);
                }
            }
        }

        return result.changes;
    }

    /**
     * Pobiera statystyki banów
     */
    static getStats() {
        const activeBans = db.prepare(`
            SELECT COUNT(*) as count FROM bans WHERE is_active = 1
        `).get().count;

        const totalBans = db.prepare(`
            SELECT COUNT(*) as count FROM bans
        `).get().count;

        const byType = db.prepare(`
            SELECT ban_type, COUNT(*) as count FROM bans WHERE is_active = 1 GROUP BY ban_type
        `).all();

        const recentBans = db.prepare(`
            SELECT COUNT(*) as count FROM bans
            WHERE created_at > datetime('now', '-7 days')
        `).get().count;

        const permanentBans = db.prepare(`
            SELECT COUNT(*) as count FROM bans WHERE is_active = 1 AND is_permanent = 1
        `).get().count;

        const temporaryBans = db.prepare(`
            SELECT COUNT(*) as count FROM bans WHERE is_active = 1 AND is_permanent = 0
        `).get().count;

        return {
            activeBans,
            totalBans,
            byType,
            recentBans,
            permanentBans,
            temporaryBans
        };
    }

    // ============================================
    // APELE
    // ============================================

    /**
     * Tworzy apel
     */
    static createAppeal(banId, userId, appealText) {
        // Sprawdź czy ban istnieje
        const ban = this.findById(banId);
        if (!ban) {
            throw new Error('Ban nie istnieje');
        }

        // Sprawdź czy nie ma już pending apelu
        const existingAppeal = db.prepare(`
            SELECT id FROM ban_appeals
            WHERE ban_id = ? AND status = 'pending'
        `).get(banId);

        if (existingAppeal) {
            throw new Error('Istnieje już oczekujący apel dla tego bana');
        }

        const result = db.prepare(`
            INSERT INTO ban_appeals (ban_id, user_id, appeal_text)
            VALUES (?, ?, ?)
        `).run(banId, userId, appealText);

        return this.findAppealById(result.lastInsertRowid);
    }

    /**
     * Znajduje apel po ID
     */
    static findAppealById(id) {
        return db.prepare(`
            SELECT a.*, b.reason as ban_reason, u.username as appellant_username,
                   r.username as reviewer_username
            FROM ban_appeals a
            LEFT JOIN bans b ON a.ban_id = b.id
            LEFT JOIN users u ON a.user_id = u.id
            LEFT JOIN admins r ON a.reviewed_by = r.id
            WHERE a.id = ?
        `).get(id);
    }

    /**
     * Pobiera wszystkie apele
     */
    static getAppeals(options = {}) {
        const {
            limit = 50,
            offset = 0,
            status = null
        } = options;

        let whereClause = '';
        const params = [];

        if (status) {
            whereClause = 'WHERE a.status = ?';
            params.push(status);
        }

        const { total } = db.prepare(`
            SELECT COUNT(*) as total FROM ban_appeals a ${whereClause}
        `).get(...params);

        params.push(limit, offset);
        const appeals = db.prepare(`
            SELECT a.*, b.reason as ban_reason, b.user_id as banned_user_id,
                   u.username as appellant_username, r.username as reviewer_username,
                   bu.username as banned_username
            FROM ban_appeals a
            LEFT JOIN bans b ON a.ban_id = b.id
            LEFT JOIN users u ON a.user_id = u.id
            LEFT JOIN users bu ON b.user_id = bu.id
            LEFT JOIN admins r ON a.reviewed_by = r.id
            ${whereClause}
            ORDER BY a.created_at DESC
            LIMIT ? OFFSET ?
        `).all(...params);

        return { appeals, total };
    }

    /**
     * Rozpatruje apel
     */
    static reviewAppeal(appealId, reviewedBy, status, notes = '') {
        if (!Object.values(AppealStatus).includes(status)) {
            throw new Error('Nieprawidłowy status apelu');
        }

        const appeal = this.findAppealById(appealId);
        if (!appeal) {
            throw new Error('Apel nie istnieje');
        }

        db.prepare(`
            UPDATE ban_appeals
            SET status = ?, reviewed_by = ?, reviewed_at = datetime('now'),
                review_notes = ?
            WHERE id = ?
        `).run(status, reviewedBy, notes, appealId);

        // Jeśli zaakceptowano, unbanuj
        if (status === AppealStatus.APPROVED) {
            this.unban(appeal.ban_id, reviewedBy, 'Apel zaakceptowany: ' + notes);
        }

        return this.findAppealById(appealId);
    }
}

export default Ban;
