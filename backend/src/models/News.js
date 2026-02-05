/**
 * Model wiadomości/newsów
 * Zarządza ogłoszeniami i aktualnościami serwera
 */
import db from '../config/database.js';

class News {
    // Typy wiadomości
    static Types = {
        NEWS: 'news',           // Zwykła wiadomość
        UPDATE: 'update',       // Aktualizacja serwera/modów
        EVENT: 'event',         // Wydarzenie na serwerze
        MAINTENANCE: 'maintenance', // Przerwa techniczna
        ANNOUNCEMENT: 'announcement' // Ważne ogłoszenie
    };

    /**
     * Inicjalizacja tabeli
     */
    static init() {
        db.exec(`
            CREATE TABLE IF NOT EXISTS news (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                summary TEXT,
                type TEXT DEFAULT 'news',
                image_url TEXT,
                is_published INTEGER DEFAULT 0,
                is_pinned INTEGER DEFAULT 0,
                created_by INTEGER,
                published_at TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                views_count INTEGER DEFAULT 0,
                FOREIGN KEY (created_by) REFERENCES admins(id)
            )
        `);

        // Tabela tagów
        db.exec(`
            CREATE TABLE IF NOT EXISTS news_tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                news_id INTEGER NOT NULL,
                tag TEXT NOT NULL,
                FOREIGN KEY (news_id) REFERENCES news(id) ON DELETE CASCADE,
                UNIQUE(news_id, tag)
            )
        `);

        // Indeksy
        db.exec(`
            CREATE INDEX IF NOT EXISTS idx_news_published ON news(is_published, published_at);
            CREATE INDEX IF NOT EXISTS idx_news_type ON news(type);
            CREATE INDEX IF NOT EXISTS idx_news_pinned ON news(is_pinned);
            CREATE INDEX IF NOT EXISTS idx_news_tags_tag ON news_tags(tag);
        `);
    }

    /**
     * Tworzy nową wiadomość
     */
    static create(data) {
        const {
            title,
            content,
            summary,
            type = 'news',
            imageUrl,
            isPinned = false,
            createdBy,
            tags = []
        } = data;

        const stmt = db.prepare(`
            INSERT INTO news (title, content, summary, type, image_url, is_pinned, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        const result = stmt.run(
            title,
            content,
            summary || content.substring(0, 200) + (content.length > 200 ? '...' : ''),
            type,
            imageUrl,
            isPinned ? 1 : 0,
            createdBy
        );

        const newsId = result.lastInsertRowid;

        // Dodaj tagi
        if (tags.length > 0) {
            const tagStmt = db.prepare(`
                INSERT OR IGNORE INTO news_tags (news_id, tag) VALUES (?, ?)
            `);
            for (const tag of tags) {
                tagStmt.run(newsId, tag.toLowerCase().trim());
            }
        }

        return this.getById(newsId);
    }

    /**
     * Pobiera wiadomość po ID
     */
    static getById(id) {
        const news = db.prepare(`
            SELECT n.*, a.username as author_name
            FROM news n
            LEFT JOIN admins a ON n.created_by = a.id
            WHERE n.id = ?
        `).get(id);

        if (news) {
            news.tags = this.getTags(id);
        }

        return news;
    }

    /**
     * Pobiera tagi dla wiadomości
     */
    static getTags(newsId) {
        return db.prepare(`
            SELECT tag FROM news_tags WHERE news_id = ?
        `).all(newsId).map(t => t.tag);
    }

    /**
     * Publikuje wiadomość
     */
    static publish(id) {
        const stmt = db.prepare(`
            UPDATE news
            SET is_published = 1, published_at = datetime('now'), updated_at = datetime('now')
            WHERE id = ?
        `);
        stmt.run(id);
        return this.getById(id);
    }

    /**
     * Cofnij publikację
     */
    static unpublish(id) {
        const stmt = db.prepare(`
            UPDATE news
            SET is_published = 0, updated_at = datetime('now')
            WHERE id = ?
        `);
        stmt.run(id);
        return this.getById(id);
    }

    /**
     * Przypina/odpina wiadomość
     */
    static togglePin(id) {
        const news = this.getById(id);
        if (!news) return null;

        const newPinned = !news.is_pinned;
        db.prepare(`
            UPDATE news SET is_pinned = ?, updated_at = datetime('now') WHERE id = ?
        `).run(newPinned ? 1 : 0, id);

        return this.getById(id);
    }

    /**
     * Aktualizuje wiadomość
     */
    static update(id, data) {
        const { title, content, summary, type, imageUrl, isPinned, tags } = data;
        const updates = [];
        const values = [];

        if (title !== undefined) {
            updates.push('title = ?');
            values.push(title);
        }
        if (content !== undefined) {
            updates.push('content = ?');
            values.push(content);
        }
        if (summary !== undefined) {
            updates.push('summary = ?');
            values.push(summary);
        }
        if (type !== undefined) {
            updates.push('type = ?');
            values.push(type);
        }
        if (imageUrl !== undefined) {
            updates.push('image_url = ?');
            values.push(imageUrl);
        }
        if (isPinned !== undefined) {
            updates.push('is_pinned = ?');
            values.push(isPinned ? 1 : 0);
        }

        updates.push('updated_at = datetime(\'now\')');

        if (updates.length > 1) {
            values.push(id);
            const stmt = db.prepare(`
                UPDATE news SET ${updates.join(', ')} WHERE id = ?
            `);
            stmt.run(...values);
        }

        // Aktualizuj tagi jeśli podane
        if (tags !== undefined) {
            db.prepare(`DELETE FROM news_tags WHERE news_id = ?`).run(id);

            if (tags.length > 0) {
                const tagStmt = db.prepare(`
                    INSERT OR IGNORE INTO news_tags (news_id, tag) VALUES (?, ?)
                `);
                for (const tag of tags) {
                    tagStmt.run(id, tag.toLowerCase().trim());
                }
            }
        }

        return this.getById(id);
    }

    /**
     * Usuwa wiadomość
     */
    static delete(id) {
        const news = this.getById(id);
        if (!news) return null;

        db.prepare(`DELETE FROM news_tags WHERE news_id = ?`).run(id);
        db.prepare(`DELETE FROM news WHERE id = ?`).run(id);

        return news;
    }

    /**
     * Zwiększa licznik wyświetleń
     */
    static incrementViews(id) {
        db.prepare(`
            UPDATE news SET views_count = views_count + 1 WHERE id = ?
        `).run(id);
    }

    /**
     * Pobiera opublikowane wiadomości (dla launchera)
     */
    static getPublished(options = {}) {
        const { limit = 10, offset = 0, type = null, tag = null } = options;

        let query = `
            SELECT n.id, n.title, n.summary, n.type, n.image_url, n.is_pinned,
                   n.published_at, n.views_count, a.username as author_name
            FROM news n
            LEFT JOIN admins a ON n.created_by = a.id
            WHERE n.is_published = 1
        `;
        const params = [];

        if (type) {
            query += ` AND n.type = ?`;
            params.push(type);
        }

        if (tag) {
            query += ` AND n.id IN (SELECT news_id FROM news_tags WHERE tag = ?)`;
            params.push(tag.toLowerCase());
        }

        // Najpierw przypięte, potem po dacie
        query += ` ORDER BY n.is_pinned DESC, n.published_at DESC LIMIT ? OFFSET ?`;
        params.push(limit, offset);

        const news = db.prepare(query).all(...params);

        // Dodaj tagi do każdej wiadomości
        for (const item of news) {
            item.tags = this.getTags(item.id);
        }

        return news;
    }

    /**
     * Pobiera wszystkie wiadomości (dla admina)
     */
    static getAll(options = {}) {
        const { limit = 50, offset = 0, type = null, publishedOnly = false } = options;

        let query = `
            SELECT n.*, a.username as author_name
            FROM news n
            LEFT JOIN admins a ON n.created_by = a.id
            WHERE 1=1
        `;
        const params = [];

        if (publishedOnly) {
            query += ` AND n.is_published = 1`;
        }

        if (type) {
            query += ` AND n.type = ?`;
            params.push(type);
        }

        query += ` ORDER BY n.created_at DESC LIMIT ? OFFSET ?`;
        params.push(limit, offset);

        const news = db.prepare(query).all(...params);

        // Dodaj tagi
        for (const item of news) {
            item.tags = this.getTags(item.id);
        }

        // Pobierz total
        let countQuery = `SELECT COUNT(*) as count FROM news WHERE 1=1`;
        if (publishedOnly) countQuery += ` AND is_published = 1`;
        if (type) countQuery += ` AND type = '${type}'`;
        const total = db.prepare(countQuery).get().count;

        return {
            news,
            total,
            page: Math.floor(offset / limit) + 1,
            pages: Math.ceil(total / limit)
        };
    }

    /**
     * Wyszukuje wiadomości
     */
    static search(query, options = {}) {
        const { limit = 20, publishedOnly = true } = options;

        let sql = `
            SELECT n.id, n.title, n.summary, n.type, n.is_pinned, n.published_at
            FROM news n
            WHERE (n.title LIKE ? OR n.content LIKE ?)
        `;
        const params = [`%${query}%`, `%${query}%`];

        if (publishedOnly) {
            sql += ` AND n.is_published = 1`;
        }

        sql += ` ORDER BY n.published_at DESC LIMIT ?`;
        params.push(limit);

        return db.prepare(sql).all(...params);
    }

    /**
     * Pobiera statystyki
     */
    static getStats() {
        const stats = db.prepare(`
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN is_published = 1 THEN 1 ELSE 0 END) as published,
                SUM(CASE WHEN is_published = 0 THEN 1 ELSE 0 END) as drafts,
                SUM(CASE WHEN is_pinned = 1 THEN 1 ELSE 0 END) as pinned,
                SUM(views_count) as total_views
            FROM news
        `).get();

        const byType = db.prepare(`
            SELECT type, COUNT(*) as count
            FROM news
            WHERE is_published = 1
            GROUP BY type
        `).all();

        const recent = db.prepare(`
            SELECT id, title, type, published_at, views_count
            FROM news
            WHERE is_published = 1
            ORDER BY published_at DESC
            LIMIT 5
        `).all();

        const popularTags = db.prepare(`
            SELECT tag, COUNT(*) as count
            FROM news_tags nt
            JOIN news n ON nt.news_id = n.id
            WHERE n.is_published = 1
            GROUP BY tag
            ORDER BY count DESC
            LIMIT 10
        `).all();

        return {
            ...stats,
            byType,
            recent,
            popularTags
        };
    }

    /**
     * Pobiera dostępne typy
     */
    static getTypes() {
        return News.Types;
    }

    /**
     * Pobiera wszystkie tagi
     */
    static getAllTags() {
        return db.prepare(`
            SELECT tag, COUNT(*) as count
            FROM news_tags nt
            JOIN news n ON nt.news_id = n.id
            WHERE n.is_published = 1
            GROUP BY tag
            ORDER BY count DESC
        `).all();
    }
}

// Inicjalizacja przy imporcie
News.init();

export default News;
