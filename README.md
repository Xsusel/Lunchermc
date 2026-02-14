# XsusLauncher

Kompletny system zarządzania niestandardowym launcherem Minecraft (Non-Premium) składający się z:
- **Backend API** - Node.js/Express z bazą SQLite
- **Panel Administracyjny** - React + Tailwind CSS
- **Launcher Klienta** - Electron.js

## Funkcje

### Panel Administracyjny
- Zarządzanie wersjami gry (Vanilla, Forge, Fabric)
- Menadżer modów (upload, URL lub import z CurseForge)
- Integracja z CurseForge (wyszukiwanie i import modów/modpacków)
- Zarządzanie paczkami (configs, resourcepacks, shaderpacks)
- Zarządzanie wieloma serwerami (kolejność, statusy, auto-connect)
- Podgląd zarejestrowanych użytkowników (ban/unban, akcje zbiorcze)
- System regulaminu z wersjonowaniem i wymuszaniem akceptacji
- System aktualności/newsów z publikacją i przypinaniem
- System powiadomień (broadcast) wyświetlanych w launcherze
- System skinów i peleryn dla graczy
- Zarządzanie wersjami launchera z auto-aktualizacją
- System apelacji od banów
- Role: admin, moderator (ograniczone uprawnienia)
- Uwierzytelnianie dwuskładnikowe (2FA/TOTP) dla adminów
- Tryb konserwacji
- Logi aktywności z kategoriami i severity
- Backup i przywracanie bazy danych
- Statystyki graczy i systemu
- Integracja z Discord (webhook powiadomienia)

### Launcher (XsusLauncher)
- Logowanie non-premium (nick + hasło)
- Automatyczne pobieranie gry, modów i wszystkich plików
- Jeden przycisk "GRAJ" - wszystko pobiera się automatycznie
- Seamless auto-aktualizacje (electron-updater, bez reinstalacji)
- Ustawienia RAM i Java
- Automatyczne połączenie z serwerem ustawionym w panelu
- Tryb offline (granie bez połączenia z API)
- Wznawianie pobrań po przerwaniu
- Raportowanie crashów do panelu
- Profesjonalny ciemny interfejs

### Backend API
- Autoryzacja JWT z bindowaniem sesji do IP
- Account lockout po nieudanych próbach logowania
- Integracja z API Mojang (wersje Minecraft)
- Integracja z API Forge i Fabric
- Integracja z CurseForge API (mody i modpacki)
- WebSocket dla powiadomień real-time (z JWT auth)
- Rate limiting na wszystkich endpointach
- Automatyczne migracje bazy danych
- Structured logging z retencją logów
- Sanityzacja inputów (XSS, injection protection)
- System backupów z harmonogramem

### Bezpieczeństwo
- 2FA (TOTP) z kodami zapasowymi dla adminów
- Blokada konta po wielokrotnych nieudanych logowaniach
- Sesje bindowane do adresu IP
- Sanityzacja wszystkich inputów użytkownika
- Rate limiting na wszystkich endpointach
- Bezpieczne nagłówki HTTP (CORS, CSP, HSTS)
- SHA256/SHA512 weryfikacja integralności plików

## Szybka instalacja (Debian VPS)

```bash
# Sklonuj repozytorium
git clone <repo-url> /opt/xsuslauncher
cd /opt/xsuslauncher

# Uruchom instalator
chmod +x install.sh
sudo ./install.sh
```

Skrypt automatycznie zainstaluje:
- Docker i Docker Compose
- Nginx jako Reverse Proxy
- Certbot (SSL Let's Encrypt)
- Skonfiguruje firewall

## Instalacja ręczna

### Wymagania
- Node.js 18+
- Docker i Docker Compose
- Nginx
- Certbot

### Backend

```bash
cd backend
cp .env.example .env
# Edytuj .env i ustaw wartości

npm install
npm start
```

### Panel Administracyjny

```bash
cd admin-panel
npm install
npm run build

# Lub dla developmentu
npm run dev
```

### Launcher

```bash
cd launcher
npm install

# Development
npm run dev

# Build dla Windows
npm run build:win

# Build dla Linux
npm run build:linux
```

## Konfiguracja

### Zmienne środowiskowe (.env)

```env
# Serwer
NODE_ENV=production
PORT=3001

# Bezpieczeństwo
JWT_SECRET=twoj-tajny-klucz-min-64-znaki
JWT_EXPIRES_IN=7d

# Admin
ADMIN_USERNAME=admin
ADMIN_PASSWORD=silne-haslo

# Serwer Minecraft
MC_SERVER_IP=play.twojserwer.pl
MC_SERVER_PORT=25565

# Integracje (opcjonalne)
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
CURSEFORGE_API_KEY=twoj-klucz-curseforge-api

# Backup
BACKUP_DIR=/app/data/backups
```

### Uzyskanie klucza CurseForge API

1. Wejdź na https://console.curseforge.com/
2. Zarejestruj się / zaloguj
3. Utwórz nowy projekt API
4. Skopiuj wygenerowany klucz API
5. Wstaw go do zmiennej `CURSEFORGE_API_KEY` w `.env`

### Nginx z SSL

Konfiguracja znajduje się w `nginx/mc.xsus.pl.conf`.

Wygeneruj certyfikat:
```bash
certbot certonly --webroot -w /var/www/certbot -d mc.xsus.pl
```

## Struktura projektu

```
xsuslauncher/
├── backend/                 # API serwera
│   ├── src/
│   │   ├── config/         # Konfiguracja DB, migracje
│   │   ├── routes/         # Endpointy API
│   │   │   ├── admin/      # Moduły admin (users, mods, config, curseforge, ...)
│   │   │   ├── auth.js     # Autoryzacja graczy
│   │   │   ├── launcher.js # Endpointy launchera
│   │   │   └── ...
│   │   ├── models/         # Modele bazy danych
│   │   ├── middleware/     # Middleware (auth, rate limit, error handler)
│   │   └── utils/          # Helpery, logger, CurseForge client, wsManager
│   ├── uploads/            # Przesłane pliki (mody, skiny, launcher)
│   └── data/               # Baza danych SQLite + backupy
├── admin-panel/            # Panel administracyjny (React)
│   ├── src/
│   │   ├── components/     # Komponenty (Layout, ErrorBoundary)
│   │   ├── pages/          # Strony (Dashboard, Users, Mods, CurseForge, ...)
│   │   ├── hooks/          # Zustand stores
│   │   └── api/            # Klient API
│   └── public/
├── launcher/               # Aplikacja Electron
│   ├── src/
│   │   ├── main/           # Główny proces (index.js)
│   │   ├── renderer/       # Interfejs użytkownika
│   │   └── preload/        # Preload script (IPC bridge)
│   ├── scripts/            # Skrypty automatyzacji (release.js)
│   └── assets/             # Ikony, grafiki
├── nginx/                  # Konfiguracja Nginx
├── docker-compose.yml
├── install.sh              # Skrypt instalacyjny
├── CLAUDE.md               # Kontekst projektu
└── README.md
```

## Zarządzanie modami

### Przez panel administracyjny
1. Zaloguj się do panelu
2. Przejdź do sekcji "Mody"
3. Kliknij "Prześlij plik" lub "Dodaj przez URL"
4. Mod automatycznie pojawi się w launcherze

### Import z CurseForge
1. Przejdź do sekcji "CurseForge" w panelu
2. Wyszukaj mod lub modpack po nazwie
3. Opcjonalnie ustaw filtry: wersja MC, mod loader (Forge/Fabric)
4. Kliknij "Importuj" przy wybranym modzie
5. Wybierz wersję pliku i potwierdź import
6. Mod zostanie pobrany, zapisany i dodany do bazy automatycznie

#### Import modpacka z CurseForge
1. Przejdź do zakładki "Modpacki" w sekcji CurseForge
2. Wyszukaj modpack
3. Kliknij "Importuj Modpack"
4. Wybierz wersję modpacka
5. System pobierze wszystkie mody z modpacka automatycznie
6. Postęp importu wyświetla się w modalu

### Przez FTP/SFTP
1. Prześlij pliki .jar do `/opt/xsuslauncher/data/uploads/mods/`
2. W panelu kliknij "Synchronizuj" lub wywołaj:
```bash
curl -X POST https://mc.xsus.pl/api/files/admin/sync \
  -H "Authorization: Bearer TOKEN"
```

## System aktualizacji launchera

### Wydawanie nowej wersji (automatycznie)

Skrypt `npm run release` automatyzuje cały proces:

```bash
cd launcher

# Patch update (1.0.0 -> 1.0.1)
npm run release

# Minor update (1.0.0 -> 1.1.0)
npm run release:minor

# Major update (1.0.0 -> 2.0.0)
npm run release:major

# Bez budowania (jeśli .exe jest już gotowy)
npm run release:nobuild

# Z changelogiem i flagą wymaganej aktualizacji
LAUNCHER_API_URL=https://mc.xsus.pl/api \
LAUNCHER_ADMIN_TOKEN=twoj-token \
npm run release -- --changelog "Opis zmian" --required
```

Skrypt automatycznie:
1. Podbija wersję w `package.json`
2. Buduje launcher z `electron-builder`
3. Oblicza sumy kontrolne (SHA256, SHA512)
4. Archiwizuje stare wersje
5. Uploaduje nową wersję na serwer
6. Powiadamia wszystkich graczy przez WebSocket

### Wydawanie wersji ręcznie (przez panel)
1. Przejdź do sekcji "Wersje Launchera" w panelu
2. Kliknij "Dodaj wersję"
3. Prześlij plik .exe / podaj URL
4. Wypełnij changelog i ustaw opcje
5. Wersja zostanie automatycznie serwowana do launchera

### Jak działa auto-aktualizacja u graczy
1. Launcher sprawdza aktualizacje przy starcie
2. Jeśli dostępna nowa wersja - pobiera się w tle (electron-updater)
3. Gracz widzi przycisk "Zainstaluj i zrestartuj"
4. Klik - launcher automatycznie się aktualizuje i restartuje
5. Nie wymaga ponownej instalacji ani pobierania instalatora

### Zmienne środowiskowe dla release.js
```env
LAUNCHER_API_URL=https://mc.xsus.pl/api    # URL API backendu
LAUNCHER_ADMIN_TOKEN=...                      # Token admina (Bearer)
```

## System regulaminu

1. W panelu przejdź do sekcji "Regulamin"
2. Stwórz nowy regulamin (tytuł + treść Markdown)
3. Aktywuj regulamin - gracze zobaczą go przy następnym logowaniu
4. Śledzenie akceptacji - widzisz kto i kiedy zaakceptował
5. Nowa wersja regulaminu wymusi ponowną akceptację

## Integracja z Discord

Ustaw `DISCORD_WEBHOOK_URL` w `.env` aby otrzymywać powiadomienia na Discordzie o:
- Nowych rejestracjach graczy
- Banach i odbanowaniach
- Zmianach konfiguracji serwera
- Aktualizacjach launchera
- Apelacjach od banów

## System skinów

Gracze mogą ustawiać swoje skiny i peleryny:
- Upload skina przez launcher (PNG, max 64x64)
- Upload peleryny
- Admin może przeglądać i usuwać skiny w panelu ("Skiny")
- Serwer serwuje skiny dla klientów MC

## Uwierzytelnianie dwuskładnikowe (2FA)

1. Zaloguj się do panelu jako admin
2. Przejdź do ustawień konta
3. Kliknij "Włącz 2FA"
4. Zeskanuj kod QR w aplikacji (Google Authenticator, Authy, itp.)
5. Wpisz kod weryfikacyjny
6. Zapisz kody zapasowe w bezpiecznym miejscu

## Backup i przywracanie

### Tworzenie backupu
- Panel: Sekcja "System" > "Utwórz backup"
- API: `POST /api/admin/system/backup`

### Przywracanie backupu
- Panel: Sekcja "System" > Lista backupów > "Przywróć"
- API: `POST /api/admin/system/restore/:filename`

### Pobieranie backupu
- Panel: Sekcja "System" > Lista backupów > "Pobierz"

## API Endpoints

### Publiczne (Launcher)
- `GET /api/launcher/config` - Konfiguracja gry
- `GET /api/launcher/manifest` - Manifest plików do synchronizacji
- `POST /api/launcher/verify-files` - Weryfikacja integralności plików
- `GET /api/launcher/server-status` - Status serwera MC
- `GET /api/launcher/releases/latest.yml` - Info o najnowszej wersji (electron-updater)
- `GET /api/launcher/releases/:filename` - Pobieranie pliku launchera
- `GET /api/versions/minecraft` - Wersje Minecraft
- `GET /api/versions/forge/:mcVersion` - Wersje Forge

### Autoryzacja
- `POST /api/auth/register` - Rejestracja
- `POST /api/auth/login` - Logowanie
- `POST /api/auth/verify` - Weryfikacja tokenu
- `POST /api/auth/reset-password` - Reset hasła (pytanie bezpieczeństwa)

### Skiny
- `GET /api/skins/:username` - Skin gracza
- `POST /api/skins/upload` - Upload skina
- `POST /api/skins/upload-cape` - Upload peleryny

### Admin (wymaga autoryzacji)
- `GET /api/admin/dashboard` - Statystyki
- `GET/PUT /api/admin/config` - Konfiguracja gry
- `GET/POST/DELETE /api/admin/mods` - Zarządzanie modami
- `GET/POST/DELETE /api/admin/broadcasts` - Powiadomienia
- `GET /api/admin/users` - Lista użytkowników
- `POST /api/admin/users/:id/ban` - Banowanie
- `POST /api/admin/users/:id/unban` - Odbanowanie
- `GET/POST/DELETE /api/admin/servers` - Zarządzanie serwerami
- `GET/POST/DELETE /api/admin/rules` - Regulamin
- `GET/POST/DELETE /api/admin/news` - Aktualności
- `GET/DELETE /api/admin/skins` - Zarządzanie skinami
- `GET/POST/DELETE /api/admin/launcher-versions` - Wersje launchera
- `POST /api/admin/launcher-versions/upload` - Upload pliku launchera
- `GET /api/admin/logs` - Logi aktywności
- `POST /api/admin/2fa/setup` - Konfiguracja 2FA
- `POST /api/admin/2fa/verify-setup` - Weryfikacja 2FA
- `POST /api/admin/system/backup` - Backup bazy
- `POST /api/admin/system/restore/:filename` - Przywracanie backupu

### Admin - CurseForge
- `GET /api/admin/curseforge/search` - Wyszukiwanie modów
- `GET /api/admin/curseforge/modpacks` - Wyszukiwanie modpacków
- `GET /api/admin/curseforge/mod/:modId` - Szczegóły moda
- `GET /api/admin/curseforge/mod/:modId/files` - Pliki moda
- `GET /api/admin/curseforge/categories` - Kategorie modów
- `GET /api/admin/curseforge/versions` - Wersje MC z CurseForge
- `POST /api/admin/curseforge/import-mod` - Import moda
- `POST /api/admin/curseforge/import-modpack` - Import modpacka

## Budowanie launchera (.exe)

```bash
cd launcher
npm install

# Windows x64
npm run build:win

# Plik .exe będzie w launcher/dist/
```

### Wymagania do budowania na Windows
- Node.js 18+
- npm lub yarn
- Windows SDK (dla Windows)

### Budowanie na Linux dla Windows
```bash
# Zainstaluj Wine
sudo apt install wine

# Build
npm run build:win
```

## Docker

### Uruchamianie

```bash
# Utwórz plik .env z konfiguracją
cp .env.example .env

# Uruchom kontenery
docker compose up -d --build
```

### Zmienne w docker-compose

Wszystkie zmienne środowiskowe przekazywane są z pliku `.env`:
- `JWT_SECRET` - Klucz JWT (wymagany)
- `ADMIN_PASSWORD` - Hasło admina (wymagane)
- `MC_SERVER_IP` - IP serwera MC
- `MC_SERVER_PORT` - Port serwera MC
- `DISCORD_WEBHOOK_URL` - Webhook Discord (opcjonalny)
- `CURSEFORGE_API_KEY` - Klucz API CurseForge (opcjonalny)

## Aktualizacja systemu

```bash
cd /opt/xsuslauncher
git pull

# Rebuild kontenerów
docker compose down
docker compose up -d --build
```

## Rozwiązywanie problemów

### Logi
```bash
# API
docker compose logs -f api

# Panel
docker compose logs -f admin-panel

# Nginx
tail -f /var/log/nginx/mc.xsus.pl.error.log
```

### Restart usług
```bash
docker compose restart
systemctl restart nginx
```

### Reset hasła admina
```bash
# Wejdź do kontenera
docker compose exec api sh

# Uruchom node i zresetuj hasło
node -e "
const bcrypt = require('bcryptjs');
const db = require('better-sqlite3')('/app/data/launcher.db');
const hash = bcrypt.hashSync('nowehaslo', 12);
db.prepare('UPDATE admins SET password_hash = ? WHERE username = ?').run(hash, 'admin');
console.log('Haslo zmienione');
"
```

### CurseForge nie działa
- Sprawdź czy `CURSEFORGE_API_KEY` jest ustawiony w `.env`
- Sprawdź logi API: `docker compose logs -f api | grep -i curseforge`
- Upewnij się, że klucz API jest aktywny w konsoli CurseForge

### Launcher nie aktualizuje się
- Sprawdź czy wersja jest uploadowana w panelu ("Wersje Launchera")
- Sprawdź endpoint: `curl https://mc.xsus.pl/api/launcher/releases/latest.yml`
- Upewnij się, że SHA512 jest poprawnie obliczone (wymagane przez electron-updater)

## Licencja

MIT

## Autor

Stworzono dla serwera Xsus
