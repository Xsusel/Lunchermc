# XsusLauncher

Kompletny system zarządzania niestandardowym launcherem Minecraft (Non-Premium) składający się z:
- **Backend API** - Node.js/Express z bazą SQLite
- **Panel Administracyjny** - React + Tailwind CSS
- **Launcher Klienta** - Electron.js

## Funkcje

### Panel Administracyjny
- Zarządzanie wersjami gry (Vanilla, Forge, Fabric)
- Menadżer modów (upload lub link URL)
- Zarządzanie paczkami (configs, resourcepacks, shaderpacks)
- Podgląd zarejestrowanych użytkowników (ban/unban)
- System powiadomień (broadcast) wyświetlanych w launcherze
- Tryb konserwacji
- Logi aktywności

### Launcher (XsusLauncher)
- Logowanie non-premium (nick + hasło)
- Automatyczne pobieranie gry, modów i wszystkich plików
- Jeden przycisk "GRAJ" - wszystko pobiera się automatycznie
- Ustawienia RAM i Java
- Automatyczne połączenie z serwerem ustawionym w panelu
- Auto-aktualizacje launchera
- Profesjonalny ciemny interfejs

### Backend API
- Autoryzacja JWT
- Integracja z API Mojang (wersje Minecraft)
- Integracja z API Forge i Fabric
- WebSocket dla powiadomień real-time
- Rate limiting
- Obsługa plików (mody, configs, resourcepacks)

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
npm run init-db
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
```

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
│   │   ├── routes/         # Endpointy API
│   │   ├── models/         # Modele bazy danych
│   │   ├── middleware/     # Middleware (auth, rate limit)
│   │   └── utils/          # Funkcje pomocnicze
│   ├── uploads/            # Przesłane pliki
│   └── data/               # Baza danych SQLite
├── admin-panel/            # Panel administracyjny
│   ├── src/
│   │   ├── components/     # Komponenty React
│   │   ├── pages/          # Strony
│   │   └── api/            # Klient API
│   └── public/
├── launcher/               # Aplikacja Electron
│   ├── src/
│   │   ├── main/           # Główny proces
│   │   ├── renderer/       # Interfejs użytkownika
│   │   └── preload/        # Preload script
│   └── assets/             # Ikony, grafiki
├── nginx/                  # Konfiguracja Nginx
├── docker-compose.yml
├── install.sh              # Skrypt instalacyjny
└── README.md
```

## API Endpoints

### Publiczne (Launcher)
- `GET /api/launcher/config` - Konfiguracja gry
- `GET /api/launcher/mods` - Lista modów
- `GET /api/launcher/broadcasts` - Powiadomienia
- `POST /api/launcher/verify-files` - Weryfikacja plików
- `GET /api/versions/minecraft` - Wersje Minecraft
- `GET /api/versions/forge/:mcVersion` - Wersje Forge

### Autoryzacja
- `POST /api/auth/register` - Rejestracja
- `POST /api/auth/login` - Logowanie
- `POST /api/auth/verify` - Weryfikacja tokenu

### Admin (wymaga autoryzacji)
- `GET /api/admin/dashboard` - Statystyki
- `GET/PUT /api/admin/config` - Konfiguracja gry
- `GET/POST/DELETE /api/admin/mods` - Zarządzanie modami
- `GET/POST/DELETE /api/admin/broadcasts` - Powiadomienia
- `GET /api/admin/users` - Lista użytkowników
- `POST /api/admin/users/:id/ban` - Banowanie

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

## Zarządzanie modami

### Przez panel administracyjny
1. Zaloguj się do panelu
2. Przejdź do sekcji "Mody"
3. Kliknij "Prześlij plik" lub "Dodaj przez URL"
4. Mod automatycznie pojawi się w launcherze

### Przez FTP/SFTP
1. Prześlij pliki .jar do `/opt/xsuslauncher/data/uploads/mods/`
2. W panelu kliknij "Synchronizuj" lub wywołaj:
```bash
curl -X POST https://mc.xsus.pl/api/files/admin/sync \
  -H "Authorization: Bearer TOKEN"
```

## Aktualizacja

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

# Ustaw nowe hasło w bazie
# (wymaga edycji w SQLite)
```

## Licencja

MIT

## Autor

Stworzono dla serwera Xsus
