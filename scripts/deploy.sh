#!/bin/bash
# ============================================
# XsusLauncher - Skrypt auto-deploy na VPS
# Automatycznie aktualizuje API i Panel Administracyjny
# ============================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_FILE="$PROJECT_DIR/data/deploy.log"

# Kolory
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[DEPLOY]${NC} $1"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE" 2>/dev/null || true
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] WARN: $1" >> "$LOG_FILE" 2>/dev/null || true
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1" >> "$LOG_FILE" 2>/dev/null || true
}

cd "$PROJECT_DIR"

log "Rozpoczynam deployment XsusLauncher..."
log "Katalog projektu: $PROJECT_DIR"

# 1. Pobierz najnowszy kod
log "Pobieranie najnowszych zmian z repozytorium..."
git fetch origin main 2>/dev/null || warn "Nie można pobrać zmian z origin/main"
git pull origin main 2>/dev/null || warn "Nie można wykonać pull"

# 2. Backup bazy danych przed deploymentem
if [ -f "$PROJECT_DIR/data/db/launcher.db" ]; then
    log "Tworzenie backupu bazy danych..."
    BACKUP_DIR="$PROJECT_DIR/data/backups"
    mkdir -p "$BACKUP_DIR"
    cp "$PROJECT_DIR/data/db/launcher.db" "$BACKUP_DIR/launcher_$(date +%Y%m%d_%H%M%S).db"

    # Usuwanie starych backupów (trzymaj 30 ostatnich)
    ls -t "$BACKUP_DIR"/launcher_*.db 2>/dev/null | tail -n +31 | xargs rm -f 2>/dev/null || true
    log "Backup utworzony"
fi

# 3. Przebuduj i uruchom kontenery
log "Budowanie i uruchamianie kontenerów Docker..."
docker compose build --no-cache 2>&1 | tail -5
docker compose up -d 2>&1

# 4. Poczekaj na health check
log "Oczekiwanie na uruchomienie serwisów..."
MAX_WAIT=60
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
    if docker compose ps | grep -q "healthy"; then
        log "API jest zdrowe!"
        break
    fi
    sleep 2
    WAITED=$((WAITED + 2))
done

if [ $WAITED -ge $MAX_WAIT ]; then
    warn "Timeout oczekiwania na health check - sprawdź logi"
fi

# 5. Wyczyść stare obrazy Docker
log "Czyszczenie starych obrazów Docker..."
docker image prune -f 2>/dev/null || true

# 6. Status końcowy
log "Deployment zakończony!"
echo ""
echo "========================================="
echo " Status kontenerów:"
echo "========================================="
docker compose ps
echo ""
echo "========================================="
echo " Health check API:"
echo "========================================="
curl -s http://localhost:3001/api/health 2>/dev/null | head -1 || echo "API nie odpowiada"
echo ""
