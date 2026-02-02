# TODO & Progress - XsusLauncher

## Status projektu: MVP COMPLETE

Data rozpoczęcia: 2026-02-02
Ostatnia aktualizacja: 2026-02-02

---

## Faza 1: Projektowanie i struktura [DONE]

- [x] Zaprojektowanie struktury katalogów
- [x] Zdefiniowanie schematu bazy danych
- [x] Wybór technologii (Node.js, React, Electron)
- [x] Określenie architektury systemu

---

## Faza 2: Backend API [DONE]

### Konfiguracja
- [x] package.json z zależnościami
- [x] Struktura katalogów (routes, models, middleware, utils)
- [x] Konfiguracja bazy SQLite (better-sqlite3)
- [x] Skrypt inicjalizacji bazy danych
- [x] Zmienne środowiskowe (.env)

### Modele
- [x] User (gracze non-premium)
- [x] Admin (administratorzy)
- [x] GameConfig (konfiguracja gry)
- [x] Mod (zarządzanie modami)
- [x] Broadcast (powiadomienia)
- [x] ActivityLog (logi aktywności)
- [x] LauncherVersion (auto-update)

### Middleware
- [x] Autoryzacja JWT (authenticateUser, authenticateAdmin)
- [x] Rate limiting (apiLimiter, authLimiter, downloadLimiter)
- [x] Error handler (globalny)
- [x] Async wrapper

### Endpointy
- [x] Auth routes (register, login, verify, change-password)
- [x] Admin routes (dashboard, users, mods, config, broadcasts, logs)
- [x] Launcher routes (config, mods, broadcasts, manifest, verify-files)
- [x] Download routes (mods, launcher)
- [x] Versions routes (minecraft, forge, fabric)
- [x] Files routes (configs, resourcepacks, sync)

### Integracje
- [x] API Mojang (wersje Minecraft)
- [x] API Forge (wersje Forge)
- [x] API Fabric (wersje Fabric)
- [x] WebSocket dla real-time broadcasts

---

## Faza 3: Panel Administracyjny [DONE]

### Konfiguracja
- [x] Vite + React setup
- [x] Tailwind CSS
- [x] React Router DOM
- [x] Zustand (state management)
- [x] Axios (HTTP client)

### Komponenty
- [x] Layout (Sidebar + Header)
- [x] Titlebar controls

### Strony
- [x] LoginPage (logowanie admina)
- [x] DashboardPage (statystyki, szybkie akcje)
- [x] UsersPage (lista graczy, ban/unban)
- [x] ModsPage (upload, URL, toggle, delete)
- [x] ConfigPage (wersja gry, serwer, Java args, maintenance)
- [x] BroadcastsPage (powiadomienia)
- [x] LogsPage (logi aktywności)

### Funkcje
- [x] Autoryzacja JWT
- [x] Toast notifications
- [x] Dark mode UI
- [x] Responsywność

---

## Faza 4: Launcher (XsusLauncher) [DONE]

### Konfiguracja
- [x] Electron setup
- [x] electron-builder config
- [x] Preload script (contextBridge)

### UI
- [x] Custom titlebar (frameless window)
- [x] Sidebar navigation
- [x] Home page (server info, play button, broadcasts)
- [x] Settings page (RAM, Java, resolution)
- [x] Login modal
- [x] Register modal
- [x] Progress bar
- [x] Toast notifications
- [x] Dark theme

### Funkcje
- [x] Logowanie non-premium
- [x] Zapamiętaj sesję
- [x] Pobieranie konfiguracji z API
- [x] Wyświetlanie broadcasts
- [x] Ustawienia RAM (slider)
- [x] Wybór ścieżki Java
- [x] Wybór folderu gry
- [x] Rozdzielczość okna gry

### Do dopracowania
- [ ] Pełna integracja minecraft-launcher-core
- [ ] Rzeczywiste pobieranie plików z progress
- [ ] Weryfikacja SHA256 plików
- [ ] Auto-update launchera
- [ ] Obsługa błędów pobierania

---

## Faza 5: Deployment [DONE]

### Docker
- [x] Dockerfile dla API
- [x] Dockerfile dla Admin Panel
- [x] docker-compose.yml
- [x] Volumes dla danych

### Nginx
- [x] Konfiguracja reverse proxy
- [x] SSL termination
- [x] WebSocket proxy
- [x] Security headers
- [x] Gzip compression

### Skrypty
- [x] install.sh (interaktywna instalacja)
- [x] Konfiguracja Certbot
- [x] Konfiguracja UFW (firewall)
- [x] Auto-renewal certyfikatów

---

## Faza 6: Dokumentacja [DONE]

- [x] README.md (główna dokumentacja)
- [x] CLAUDE.md (kontekst dla AI)
- [x] docs/architecture.md (architektura)
- [x] docs/todo.md (postępy)
- [x] launcher/BUILD.md (budowanie .exe)
- [x] .env.example (szablon konfiguracji)
- [x] .gitignore

---

## Backlog (przyszłe funkcje)

### Wysoki priorytet
- [ ] Pełna integracja minecraft-launcher-core z pobieraniem
- [ ] Automatyczny instalator Java (jeśli brak)
- [ ] Podpisywanie kodu launchera (certyfikat)
- [ ] Panel: edycja argumentów Java per-mod

### Średni priorytet
- [ ] System skinów dla non-premium
- [ ] Panel: podgląd online graczy
- [ ] Panel: statystyki (wykresy)
- [ ] Launcher: historia uruchomień
- [ ] Multi-language support

### Niski priorytet
- [ ] Panel moderatora (ograniczone uprawnienia)
- [ ] Backup bazy danych (scheduled)
- [ ] API: webhook notifications
- [ ] Launcher: integracja Discord RPC
- [ ] Launcher: screenshot gallery

---

## Znane błędy / Issues

| ID | Opis | Status | Priorytet |
|----|------|--------|-----------|
| #1 | minecraft-launcher-core wymaga dopracowania | Open | High |
| #2 | Brak obsługi dużych plików (>100MB) | Open | Medium |
| #3 | Launcher nie obsługuje proxy | Open | Low |

---

## Changelog

### v1.0.0 (2026-02-02) - Initial Release
- Kompletny Backend API
- Panel Administracyjny
- Launcher (podstawowa wersja)
- Docker deployment
- Dokumentacja

---

## Notatki techniczne

### Wydajność SQLite
- Włączony WAL mode (Write-Ahead Logging)
- Indeksy na: username, token, filename
- Dla >10k użytkowników rozważyć PostgreSQL

### Bezpieczeństwo
- JWT secret minimum 64 znaki
- bcrypt cost factor: 12
- Rate limit dla auth: 10 req/15min
- Wszystkie hasła w .env (nie w kodzie!)

### Maintenance
- Logi rotować co tydzień
- activity_logs czyścić po 30 dniach
- Backup DB przed aktualizacją

---

## Kontakt / Support

- Repozytorium: [URL]
- Issues: [URL]/issues
- Dokumentacja: docs/
