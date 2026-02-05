/**
 * Model regulaminu serwera
 * Zarządza regulaminem i akceptacjami użytkowników
 */
import db from '../config/database.js';

class ServerRules {
    /**
     * Inicjalizacja tabel
     */
    static init() {
        // Główna tabela z regulaminem
        db.exec(`
            CREATE TABLE IF NOT EXISTS server_rules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                version TEXT NOT NULL,
                title TEXT NOT NULL DEFAULT 'Regulamin Serwera',
                content TEXT NOT NULL,
                is_active INTEGER DEFAULT 0,
                requires_acceptance INTEGER DEFAULT 1,
                created_by INTEGER,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                activated_at TEXT,
                FOREIGN KEY (created_by) REFERENCES admins(id)
            )
        `);

        // Tabela akceptacji regulaminu przez użytkowników
        db.exec(`
            CREATE TABLE IF NOT EXISTS rules_acceptances (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                rules_id INTEGER NOT NULL,
                rules_version TEXT NOT NULL,
                accepted_at TEXT DEFAULT CURRENT_TIMESTAMP,
                ip_address TEXT,
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (rules_id) REFERENCES server_rules(id),
                UNIQUE(user_id, rules_id)
            )
        `);

        // Indeksy
        db.exec(`
            CREATE INDEX IF NOT EXISTS idx_server_rules_active ON server_rules(is_active);
            CREATE INDEX IF NOT EXISTS idx_rules_acceptances_user ON rules_acceptances(user_id);
            CREATE INDEX IF NOT EXISTS idx_rules_acceptances_rules ON rules_acceptances(rules_id);
        `);
    }

    /**
     * Tworzy nową wersję regulaminu
     */
    static create(data) {
        const { version, title, content, createdBy, requiresAcceptance = true } = data;

        const stmt = db.prepare(`
            INSERT INTO server_rules (version, title, content, created_by, requires_acceptance)
            VALUES (?, ?, ?, ?, ?)
        `);

        const result = stmt.run(version, title || 'Regulamin Serwera', content, createdBy, requiresAcceptance ? 1 : 0);
        return this.getById(result.lastInsertRowid);
    }

    /**
     * Pobiera regulamin po ID
     */
    static getById(id) {
        const stmt = db.prepare(`
            SELECT sr.*, a.username as created_by_username
            FROM server_rules sr
            LEFT JOIN admins a ON sr.created_by = a.id
            WHERE sr.id = ?
        `);
        return stmt.get(id);
    }

    /**
     * Pobiera aktywny regulamin
     */
    static getActive() {
        const stmt = db.prepare(`
            SELECT sr.*, a.username as created_by_username
            FROM server_rules sr
            LEFT JOIN admins a ON sr.created_by = a.id
            WHERE sr.is_active = 1
            LIMIT 1
        `);
        return stmt.get();
    }

    /**
     * Aktywuje regulamin (dezaktywuje poprzedni)
     */
    static activate(id) {
        // Dezaktywuj wszystkie
        db.prepare(`UPDATE server_rules SET is_active = 0`).run();

        // Aktywuj wybrany
        const stmt = db.prepare(`
            UPDATE server_rules
            SET is_active = 1, activated_at = datetime('now')
            WHERE id = ?
        `);
        stmt.run(id);

        return this.getById(id);
    }

    /**
     * Aktualizuje regulamin
     */
    static update(id, data) {
        const { version, title, content, requiresAcceptance } = data;
        const updates = [];
        const values = [];

        if (version !== undefined) {
            updates.push('version = ?');
            values.push(version);
        }
        if (title !== undefined) {
            updates.push('title = ?');
            values.push(title);
        }
        if (content !== undefined) {
            updates.push('content = ?');
            values.push(content);
        }
        if (requiresAcceptance !== undefined) {
            updates.push('requires_acceptance = ?');
            values.push(requiresAcceptance ? 1 : 0);
        }

        if (updates.length === 0) return this.getById(id);

        values.push(id);
        const stmt = db.prepare(`
            UPDATE server_rules SET ${updates.join(', ')} WHERE id = ?
        `);
        stmt.run(...values);

        return this.getById(id);
    }

    /**
     * Usuwa regulamin
     */
    static delete(id) {
        const rules = this.getById(id);
        if (!rules) return null;

        // Nie można usunąć aktywnego regulaminu
        if (rules.is_active) {
            throw new Error('Nie można usunąć aktywnego regulaminu');
        }

        // Usuń akceptacje
        db.prepare(`DELETE FROM rules_acceptances WHERE rules_id = ?`).run(id);

        // Usuń regulamin
        db.prepare(`DELETE FROM server_rules WHERE id = ?`).run(id);

        return rules;
    }

    /**
     * Pobiera wszystkie wersje regulaminu
     */
    static getAll() {
        const stmt = db.prepare(`
            SELECT sr.*, a.username as created_by_username,
                   (SELECT COUNT(*) FROM rules_acceptances WHERE rules_id = sr.id) as acceptance_count
            FROM server_rules sr
            LEFT JOIN admins a ON sr.created_by = a.id
            ORDER BY sr.created_at DESC
        `);
        return stmt.all();
    }

    /**
     * Rejestruje akceptację regulaminu przez użytkownika
     */
    static acceptByUser(userId, rulesId, ipAddress = null) {
        const rules = this.getById(rulesId);
        if (!rules) {
            throw new Error('Regulamin nie istnieje');
        }

        const stmt = db.prepare(`
            INSERT OR REPLACE INTO rules_acceptances (user_id, rules_id, rules_version, accepted_at, ip_address)
            VALUES (?, ?, ?, datetime('now'), ?)
        `);

        stmt.run(userId, rulesId, rules.version, ipAddress);

        return {
            userId,
            rulesId,
            rulesVersion: rules.version,
            acceptedAt: new Date().toISOString()
        };
    }

    /**
     * Sprawdza czy użytkownik zaakceptował aktywny regulamin
     */
    static hasUserAccepted(userId) {
        const activeRules = this.getActive();
        if (!activeRules) {
            return { accepted: true, rules: null }; // Brak regulaminu = nie wymaga akceptacji
        }

        if (!activeRules.requires_acceptance) {
            return { accepted: true, rules: activeRules }; // Regulamin nie wymaga akceptacji
        }

        const stmt = db.prepare(`
            SELECT * FROM rules_acceptances
            WHERE user_id = ? AND rules_id = ?
        `);
        const acceptance = stmt.get(userId, activeRules.id);

        return {
            accepted: !!acceptance,
            rules: activeRules,
            acceptance: acceptance || null
        };
    }

    /**
     * Pobiera akceptacje dla danego regulaminu
     */
    static getAcceptances(rulesId, options = {}) {
        const { limit = 100, offset = 0 } = options;

        const stmt = db.prepare(`
            SELECT ra.*, u.username
            FROM rules_acceptances ra
            JOIN users u ON ra.user_id = u.id
            WHERE ra.rules_id = ?
            ORDER BY ra.accepted_at DESC
            LIMIT ? OFFSET ?
        `);

        return stmt.all(rulesId, limit, offset);
    }

    /**
     * Pobiera statystyki akceptacji
     */
    static getAcceptanceStats(rulesId = null) {
        // Jeśli nie podano ID, użyj aktywnego regulaminu
        if (!rulesId) {
            const active = this.getActive();
            if (!active) return null;
            rulesId = active.id;
        }

        const rules = this.getById(rulesId);
        if (!rules) return null;

        // Liczba akceptacji
        const acceptanceCount = db.prepare(`
            SELECT COUNT(*) as count FROM rules_acceptances WHERE rules_id = ?
        `).get(rulesId).count;

        // Liczba wszystkich użytkowników
        const totalUsers = db.prepare(`
            SELECT COUNT(*) as count FROM users WHERE is_banned = 0
        `).get().count;

        // Użytkownicy którzy nie zaakceptowali
        const pendingUsers = db.prepare(`
            SELECT u.id, u.username, u.created_at
            FROM users u
            WHERE u.is_banned = 0
            AND u.id NOT IN (SELECT user_id FROM rules_acceptances WHERE rules_id = ?)
            ORDER BY u.created_at DESC
            LIMIT 50
        `).all(rulesId);

        // Ostatnie akceptacje
        const recentAcceptances = db.prepare(`
            SELECT ra.*, u.username
            FROM rules_acceptances ra
            JOIN users u ON ra.user_id = u.id
            WHERE ra.rules_id = ?
            ORDER BY ra.accepted_at DESC
            LIMIT 10
        `).all(rulesId);

        return {
            rulesId,
            rulesVersion: rules.version,
            totalUsers,
            acceptedCount: acceptanceCount,
            pendingCount: totalUsers - acceptanceCount,
            acceptanceRate: totalUsers > 0 ? Math.round((acceptanceCount / totalUsers) * 100) : 0,
            pendingUsers,
            recentAcceptances
        };
    }

    /**
     * Resetuje akceptacje (np. przy zmianie regulaminu)
     */
    static resetAcceptances(rulesId) {
        const stmt = db.prepare(`DELETE FROM rules_acceptances WHERE rules_id = ?`);
        const result = stmt.run(rulesId);
        return { deleted: result.changes };
    }

    /**
     * Pobiera historię akceptacji użytkownika
     */
    static getUserAcceptanceHistory(userId) {
        const stmt = db.prepare(`
            SELECT ra.*, sr.title, sr.version as rules_version_full
            FROM rules_acceptances ra
            JOIN server_rules sr ON ra.rules_id = sr.id
            WHERE ra.user_id = ?
            ORDER BY ra.accepted_at DESC
        `);
        return stmt.all(userId);
    }
}

// Inicjalizacja przy imporcie
ServerRules.init();

export default ServerRules;
