# Architektura systemu XsusLauncher

## Przegląd

```
┌─────────────────────────────────────────────────────────────────────┐
│                           INTERNET                                   │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    NGINX (Reverse Proxy + SSL)                       │
│                         mc.xsus.pl:443                               │
├─────────────────────────────────────────────────────────────────────┤
│  /          → Admin Panel (port 5173)                                │
│  /api/*     → Backend API (port 3001)                                │
│  /ws        → WebSocket (port 3001)                                  │
│  /download  → Static files                                           │
└─────────────────────────────────────────────────────────────────────┘
                    │                           │
          ┌────────┴────────┐         ┌────────┴────────┐
          ▼                 ▼         ▼                 ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│   Admin Panel    │  │   Backend API    │  │    Launcher      │
│   (React/Vite)   │  │  (Node/Express)  │  │   (Electron)     │
│                  │  │                  │  │                  │
│  - Dashboard     │  │  - Auth          │  │  - Login UI      │
│  - Mods Manager  │  │  - CRUD Mods     │  │  - Download      │
│  - Users        │  │  - Game Config   │  │  - Launch MC     │
│  - Config       │  │  - WebSocket     │  │  - Settings      │
│  - Broadcasts   │  │  - File Sync     │  │  - Auto-update   │
└──────────────────┘  └────────┬─────────┘  └──────────────────┘
                               │
                               ▼
                    ┌──────────────────┐
                    │     SQLite       │
                    │    Database      │
                    │                  │
                    │  - users         │
                    │  - mods          │
                    │  - config        │
                    │  - broadcasts    │
                    │  - logs          │
                    └──────────────────┘
```

## Komponenty systemu

### 1. Nginx (Reverse Proxy)

**Rola**: Punkt wejścia dla wszystkich żądań HTTP/HTTPS

**Funkcje**:
- Terminacja SSL (certyfikaty Let's Encrypt)
- Routing do odpowiednich serwisów
- Gzip compression
- Rate limiting na poziomie połączeń
- Security headers (HSTS, X-Frame-Options, etc.)
- Logowanie dostępu

**Konfiguracja**: `/nginx/mc.xsus.pl.conf`

### 2. Backend API (Node.js/Express)

**Rola**: Centralne API dla panelu i launchera

**Warstwy**:
```
┌─────────────────────────────────────┐
│           Routes (Endpointy)        │
├─────────────────────────────────────┤
│         Middleware (Auth, etc.)     │
├─────────────────────────────────────┤
│           Models (Logika DB)        │
├─────────────────────────────────────┤
│          SQLite (better-sqlite3)    │
└─────────────────────────────────────┘
```

**Moduły**:
- `routes/auth.js` - Autoryzacja graczy
- `routes/admin.js` - Endpointy panelu admina
- `routes/launcher.js` - Endpointy dla launchera
- `routes/versions.js` - Integracja z API Mojang/Forge
- `routes/files.js` - Zarządzanie plikami
- `middleware/auth.js` - JWT weryfikacja
- `middleware/rateLimiter.js` - Rate limiting
- `models/*` - Modele danych

### 3. Panel Administracyjny (React)

**Rola**: Interfejs webowy dla administratora

**Struktura**:
```
src/
├── api/client.js      # Axios wrapper
├── hooks/useStore.js  # Zustand (state management)
├── components/
│   └── Layout.jsx     # Sidebar + Header
└── pages/
    ├── LoginPage.jsx
    ├── DashboardPage.jsx
    ├── UsersPage.jsx
    ├── ModsPage.jsx
    ├── ConfigPage.jsx
    ├── BroadcastsPage.jsx
    └── LogsPage.jsx
```

**State Management** (Zustand):
- `useAuthStore` - Token, dane admina
- `useUIStore` - Stan UI (sidebar, modals)
- `useDataStore` - Cache danych (users, mods, etc.)

### 4. Launcher (Electron)

**Rola**: Aplikacja desktopowa dla graczy

**Architektura Electron**:
```
┌─────────────────────────────────────┐
│          Main Process               │
│  (Node.js - pełny dostęp do OS)     │
├─────────────────────────────────────┤
│         Preload Script              │
│  (Most bezpieczny między procesami) │
├─────────────────────────────────────┤
│        Renderer Process             │
│  (HTML/CSS/JS - ograniczony dostęp) │
└─────────────────────────────────────┘
```

**Przepływ uruchomienia gry**:
```
1. User klika "GRAJ"
           │
           ▼
2. Pobierz config z API
   GET /api/launcher/config
           │
           ▼
3. Sprawdź pliki lokalne
   POST /api/launcher/verify-files
           │
           ▼
4. Pobierz brakujące pliki
   GET /api/download/mods/{filename}
           │
           ▼
5. Uruchom Minecraft
   minecraft-launcher-core
   --server IP:PORT (auto-connect)
           │
           ▼
6. Log uruchomienia
   POST /api/launcher/game-start
```

## Przepływy danych

### Logowanie gracza

```
Launcher                    API                      Database
   │                         │                          │
   │  POST /auth/login       │                          │
   │  {username, password}   │                          │
   │─────────────────────────>                          │
   │                         │  SELECT * FROM users     │
   │                         │  WHERE username = ?      │
   │                         │─────────────────────────>│
   │                         │                          │
   │                         │  {id, password_hash,...} │
   │                         │<─────────────────────────│
   │                         │                          │
   │                         │  bcrypt.compare()        │
   │                         │  jwt.sign()              │
   │                         │                          │
   │  {token, user}          │                          │
   │<─────────────────────────                          │
```

### Synchronizacja modów

```
Admin Panel                 API                    File System
   │                         │                          │
   │  POST /admin/mods       │                          │
   │  FormData (file)        │                          │
   │─────────────────────────>                          │
   │                         │  multer → save file      │
   │                         │─────────────────────────>│
   │                         │                          │
   │                         │  calculateSHA256()       │
   │                         │                          │
   │                         │  INSERT INTO mods        │
   │                         │  VALUES (...)            │
   │                         │                          │
   │  {success, mod}         │                          │
   │<─────────────────────────                          │
   │                         │                          │
   │                         │  WebSocket broadcast     │
   │                         │  → all launchers         │
```

### Weryfikacja plików (Launcher)

```
Launcher                    API
   │                         │
   │  Skanuj lokalne mody    │
   │  [{filename, sha256}]   │
   │                         │
   │  POST /launcher/verify  │
   │  {files: [...]}         │
   │─────────────────────────>
   │                         │
   │                         │  Porównaj z DB
   │                         │  - toDownload (brakujące/zmienione)
   │                         │  - toDelete (niepotrzebne)
   │                         │  - valid (OK)
   │                         │
   │  {toDownload, toDelete} │
   │<─────────────────────────
   │                         │
   │  Pobierz brakujące      │
   │  Usuń niepotrzebne      │
```

## Schemat bazy danych

```sql
-- Użytkownicy (gracze)
CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    is_banned INTEGER DEFAULT 0,
    ban_reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME,
    total_playtime INTEGER DEFAULT 0
);

-- Administratorzy
CREATE TABLE admins (
    id INTEGER PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME
);

-- Konfiguracja gry (singleton - id=1)
CREATE TABLE game_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    game_version TEXT NOT NULL DEFAULT '1.20.1',
    forge_version TEXT,
    fabric_version TEXT,
    loader_type TEXT DEFAULT 'vanilla',  -- vanilla/forge/fabric
    java_args TEXT DEFAULT '-Xmx4G -Xms2G',
    server_ip TEXT NOT NULL,
    server_port INTEGER DEFAULT 25565,
    maintenance_mode INTEGER DEFAULT 0,
    maintenance_message TEXT,
    updated_at DATETIME
);

-- Mody
CREATE TABLE mods (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    filename TEXT UNIQUE NOT NULL,
    url TEXT,           -- URL zewnętrzny lub /api/download/...
    sha256 TEXT NOT NULL,
    file_size INTEGER DEFAULT 0,
    is_required INTEGER DEFAULT 1,
    is_enabled INTEGER DEFAULT 1,
    mod_type TEXT DEFAULT 'mod',  -- mod/library/coremod
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME
);

-- Pliki rozszerzone (configs, resourcepacks, etc.)
CREATE TABLE game_files_extended (
    id INTEGER PRIMARY KEY,
    file_type TEXT NOT NULL,  -- configs/resourcepacks/shaderpacks/scripts
    name TEXT NOT NULL,
    filename TEXT NOT NULL,
    relative_path TEXT NOT NULL,
    url TEXT,
    sha256 TEXT NOT NULL,
    file_size INTEGER DEFAULT 0,
    is_enabled INTEGER DEFAULT 1,
    is_required INTEGER DEFAULT 1,
    description TEXT,
    created_at DATETIME,
    updated_at DATETIME,
    UNIQUE(file_type, filename)
);

-- Powiadomienia (broadcasts)
CREATE TABLE broadcasts (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'info',  -- info/success/warning/error
    is_active INTEGER DEFAULT 1,
    priority INTEGER DEFAULT 0,
    created_at DATETIME,
    expires_at DATETIME
);

-- Logi aktywności
CREATE TABLE activity_logs (
    id INTEGER PRIMARY KEY,
    user_id INTEGER,
    action TEXT NOT NULL,
    details TEXT,  -- JSON
    ip_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Wersje launchera (auto-update)
CREATE TABLE launcher_versions (
    id INTEGER PRIMARY KEY,
    version TEXT UNIQUE NOT NULL,
    download_url TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    changelog TEXT,
    is_required INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Bezpieczeństwo

### Autoryzacja
- JWT tokeny z 7-dniowym wygaśnięciem
- Hasła hashowane bcrypt (cost factor 12)
- Osobne tokeny dla graczy i adminów

### Rate Limiting
| Endpoint | Limit | Okno |
|----------|-------|------|
| `/api/auth/login` | 10 req | 15 min |
| `/api/auth/register` | 3 req | 1 godz |
| `/api/*` (ogólne) | 100 req | 15 min |
| `/api/download/*` | 50 req | 1 min |
| `/api/admin/*` | 200 req | 15 min |

### Walidacja
- express-validator dla wszystkich inputów
- Sanityzacja nazw plików
- Whitelist rozszerzeń plików

### Headers (Nginx)
```
Strict-Transport-Security: max-age=63072000
X-Frame-Options: SAMEORIGIN
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
```

## Skalowalność

### Obecna architektura (1 serwer)
- Wystarczająca dla ~1000 użytkowników
- SQLite obsługuje ~100 req/s

### Potencjalna rozbudowa
1. **PostgreSQL** zamiast SQLite (multi-connection)
2. **Redis** dla cache i sesji
3. **S3/MinIO** dla plików modów
4. **Load balancer** przed wieloma instancjami API
5. **CDN** dla statycznych plików launchera

## Monitoring

### Logi
- Backend: Morgan (access logs)
- Nginx: `/var/log/nginx/mc.xsus.pl.*.log`
- Docker: `docker compose logs -f`

### Health check
- `GET /api/health` - Status API
- Docker healthcheck dla kontenerów

## Diagram komponentów

```
┌─────────────────────────────────────────────────────────────────┐
│                        VPS (Debian)                             │
│                                                                 │
│  ┌─────────────┐  ┌─────────────────────────────────────────┐  │
│  │   Nginx     │  │           Docker                        │  │
│  │   :80/443   │  │                                         │  │
│  │             │  │  ┌─────────────┐  ┌─────────────────┐   │  │
│  │  ┌───────┐  │  │  │    API      │  │  Admin Panel    │   │  │
│  │  │ SSL   │  │  │  │   :3001     │  │    :5173        │   │  │
│  │  │ Certs │  │  │  │             │  │                 │   │  │
│  │  └───────┘  │  │  │  ┌───────┐  │  │  ┌───────────┐  │   │  │
│  │             │──┼──│  │SQLite │  │  │  │  Nginx    │  │   │  │
│  │  ┌───────┐  │  │  │  │  DB   │  │  │  │  (static) │  │   │  │
│  │  │ Proxy │  │  │  │  └───────┘  │  │  └───────────┘  │   │  │
│  │  │ Pass  │  │  │  └─────────────┘  └─────────────────┘   │  │
│  │  └───────┘  │  │                                         │  │
│  └─────────────┘  └─────────────────────────────────────────┘  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Volumes                               │   │
│  │   ./data/db        → /app/data       (SQLite)           │   │
│  │   ./data/uploads   → /app/uploads    (Mods, configs)    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

            │
            │ HTTPS
            ▼

┌─────────────────────────────────────────────────────────────────┐
│                    Komputer gracza                              │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   XsusLauncher                          │   │
│  │                                                         │   │
│  │   ┌─────────────┐    ┌─────────────┐    ┌───────────┐  │   │
│  │   │ Main        │    │ Renderer    │    │ Minecraft │  │   │
│  │   │ Process     │───▶│ (UI)        │───▶│ Process   │  │   │
│  │   │ (Node.js)   │    │ (Chromium)  │    │ (Java)    │  │   │
│  │   └─────────────┘    └─────────────┘    └───────────┘  │   │
│  │         │                                               │   │
│  │         ▼                                               │   │
│  │   ┌─────────────┐                                       │   │
│  │   │ %APPDATA%   │                                       │   │
│  │   │ /.xsus/     │                                       │   │
│  │   │  ├─ mods/   │                                       │   │
│  │   │  ├─ config/ │                                       │   │
│  │   │  └─ ...     │                                       │   │
│  │   └─────────────┘                                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```
