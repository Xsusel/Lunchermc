# CLAUDE.md - Kontekst projektu XsusLauncher

## Opis projektu

XsusLauncher to kompletny system zarządzania niestandardowym launcherem Minecraft (Non-Premium) dla prywatnego serwera. System umożliwia automatyczne pobieranie gry, modów i wszystkich plików konfiguracyjnych jednym kliknięciem.

## Główne założenia

1. **One-click gaming** - Gracz klika "GRAJ" i wszystko pobiera się automatycznie
2. **Non-Premium** - Autoryzacja przez nick + hasło (bez konta Mojang)
3. **Centralne zarządzanie** - Admin ustawia wersję MC, Forge, mody w panelu
4. **Auto-connect** - Po uruchomieniu gry, gracz automatycznie łączy się z serwerem
5. **Synchronizacja FTP** - Możliwość wrzucania modów przez FTP z automatyczną synchronizacją

## Stack technologiczny

### Backend API
- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Baza danych**: SQLite (better-sqlite3)
- **Autoryzacja**: JWT (jsonwebtoken)
- **Hasła**: bcryptjs
- **Walidacja**: express-validator
- **Upload plików**: multer
- **WebSocket**: ws
- **Rate limiting**: express-rate-limit

### Panel Administracyjny
- **Framework**: React 18
- **Bundler**: Vite
- **Styling**: Tailwind CSS
- **State management**: Zustand
- **HTTP client**: Axios
- **Routing**: React Router DOM
- **Ikony**: Lucide React
- **Toasty**: React Hot Toast
- **Daty**: date-fns

### Launcher
- **Framework**: Electron.js
- **Minecraft**: minecraft-launcher-core
- **Storage**: electron-store
- **Build**: electron-builder

### Deployment
- **Konteneryzacja**: Docker + Docker Compose
- **Reverse Proxy**: Nginx
- **SSL**: Certbot (Let's Encrypt)
- **OS**: Debian 11/12

## Struktura projektu

```
/home/user/Lunchermc/
├── backend/                    # API Node.js
│   ├── src/
│   │   ├── config/            # Konfiguracja DB
│   │   ├── middleware/        # Auth, rate limiting, error handling
│   │   ├── models/            # User, Admin, Mod, GameConfig, etc.
│   │   ├── routes/            # Endpointy API
│   │   └── utils/             # Helpery, integracja MC/Forge
│   ├── uploads/               # Pliki (mody, configs, etc.)
│   ├── data/                  # Baza SQLite
│   └── Dockerfile
├── admin-panel/               # React Panel
│   ├── src/
│   │   ├── api/              # Klient API
│   │   ├── components/       # Layout, etc.
│   │   ├── hooks/            # Zustand stores
│   │   └── pages/            # Dashboard, Users, Mods, Config, etc.
│   └── Dockerfile
├── launcher/                  # Electron App
│   ├── src/
│   │   ├── main/             # Main process
│   │   ├── preload/          # Preload script
│   │   └── renderer/         # UI (HTML, CSS, JS)
│   └── assets/               # Ikony
├── nginx/                     # Konfiguracja Nginx
├── docker-compose.yml
├── install.sh                 # Skrypt instalacyjny
└── README.md
```

## Kluczowe endpointy API

### Publiczne (Launcher)
- `GET /api/launcher/config` - Pełna konfiguracja (wersja, mody, broadcasts)
- `GET /api/launcher/manifest` - Manifest plików do synchronizacji
- `POST /api/launcher/verify-files` - Weryfikacja integralności plików
- `GET /api/versions/minecraft` - Lista wersji MC z API Mojang
- `GET /api/versions/forge/:mcVersion` - Wersje Forge

### Autoryzacja
- `POST /api/auth/register` - Rejestracja gracza
- `POST /api/auth/login` - Logowanie gracza
- `POST /api/auth/verify` - Weryfikacja tokenu

### Admin (chronione)
- `GET /api/admin/dashboard` - Statystyki
- `GET/PUT /api/admin/config` - Konfiguracja gry
- `GET/POST/DELETE /api/admin/mods` - Zarządzanie modami
- `POST /api/files/admin/sync` - Synchronizacja z FTP

## Baza danych (SQLite)

### Tabele
- `users` - Gracze (id, username, password_hash, is_banned, etc.)
- `admins` - Administratorzy
- `game_config` - Konfiguracja gry (wersja, loader, serwer IP)
- `mods` - Lista modów
- `game_files_extended` - Pliki (configs, resourcepacks, etc.)
- `broadcasts` - Powiadomienia
- `activity_logs` - Logi aktywności
- `sessions` - Sesje
- `launcher_versions` - Wersje launchera (auto-update)

## Zmienne środowiskowe

```env
NODE_ENV=production
PORT=3001
JWT_SECRET=<64-znakowy-klucz>
JWT_EXPIRES_IN=7d
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<hasło>
MC_SERVER_IP=play.serwer.pl
MC_SERVER_PORT=25565
```

## Komendy developerskie

```bash
# Backend
cd backend && npm run dev

# Panel
cd admin-panel && npm run dev

# Launcher
cd launcher && npm run dev

# Build launchera
cd launcher && npm run build:win
```

## Deployment na VPS

```bash
sudo ./install.sh
# Skrypt interaktywnie konfiguruje:
# - Docker
# - Nginx + SSL
# - Bazę danych
# - Konto admina
```

## Ważne decyzje projektowe

1. **SQLite zamiast PostgreSQL** - Prostota, brak dodatkowych serwisów, wystarczająca wydajność
2. **Electron zamiast Tauri** - Lepsza integracja z minecraft-launcher-core
3. **JWT bez refresh tokenów** - Uproszczenie, token ważny 7 dni
4. **WebSocket dla broadcasts** - Real-time powiadomienia w launcherze
5. **Docker dla API i Panelu** - Łatwy deployment, izolacja
6. **Nginx jako reverse proxy** - SSL termination, load balancing ready

## Znane ograniczenia

1. Brak oficjalnej autoryzacji Mojang (non-premium)
2. Launcher wymaga Java na komputerze gracza
3. Auto-update launchera wymaga hostowania plików .exe
4. minecraft-launcher-core wymaga dopracowania integracji

## Dalszy rozwój (TODO)

- [ ] Pełna integracja minecraft-launcher-core z pobieraniem
- [ ] Instalator Java w launcherze (jeśli brak)
- [ ] Skin system dla non-premium
- [ ] Statystyki online graczy
- [ ] Backup bazy danych
- [ ] Panel moderatora (ograniczone uprawnienia)
