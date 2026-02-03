#!/bin/bash
# ============================================
# XsusLauncher - Quick Start Script
# Uruchamia wszystko jedną komendą
# ============================================

set -e

# Kolory
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  XsusLauncher - Quick Start${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# Sprawdź tryb
MODE="${1:-dev}"

case "$MODE" in
    dev|development)
        echo -e "${YELLOW}Tryb: DEVELOPMENT (lokalnie bez Docker)${NC}"
        echo ""

        # Backend
        echo -e "${BLUE}[1/4] Instalacja zależności backend...${NC}"
        cd "$SCRIPT_DIR/backend"
        npm install --silent

        # Utwórz .env jeśli nie istnieje
        if [ ! -f .env ]; then
            echo -e "${BLUE}[2/4] Tworzenie .env dla backend...${NC}"
            cat > .env << 'EOF'
PORT=3001
NODE_ENV=development
API_URL=http://localhost:3001
ADMIN_URL=http://localhost:5173
JWT_SECRET=$(openssl rand -hex 64)
JWT_EXPIRES_IN=7d
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
DATABASE_PATH=./data/launcher.db
MC_SERVER_IP=localhost
MC_SERVER_PORT=25565
MAX_FILE_SIZE_MB=100
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
EOF
            # Wygeneruj prawdziwy JWT_SECRET
            JWT=$(openssl rand -hex 64)
            sed -i "s/\$(openssl rand -hex 64)/$JWT/" .env
        else
            echo -e "${GREEN}[2/4] .env już istnieje${NC}"
        fi

        # Inicjalizacja bazy danych
        echo -e "${BLUE}[3/4] Inicjalizacja bazy danych...${NC}"
        npm run init-db 2>/dev/null || true

        # Admin panel
        echo -e "${BLUE}[4/4] Instalacja zależności admin-panel...${NC}"
        cd "$SCRIPT_DIR/admin-panel"
        npm install --silent

        # Utwórz .env jeśli nie istnieje
        if [ ! -f .env ]; then
            echo "VITE_API_URL=http://localhost:3001/api" > .env
        fi

        echo ""
        echo -e "${GREEN}============================================${NC}"
        echo -e "${GREEN}  Gotowe! Uruchom w dwóch terminalach:${NC}"
        echo -e "${GREEN}============================================${NC}"
        echo ""
        echo -e "Terminal 1 (Backend):"
        echo -e "  ${YELLOW}cd $SCRIPT_DIR/backend && npm start${NC}"
        echo ""
        echo -e "Terminal 2 (Admin Panel):"
        echo -e "  ${YELLOW}cd $SCRIPT_DIR/admin-panel && npm run dev${NC}"
        echo ""
        echo -e "Lub uruchom wszystko w tle:"
        echo -e "  ${YELLOW}$0 start${NC}"
        echo ""
        echo -e "Login: ${GREEN}admin${NC}"
        echo -e "Hasło: ${GREEN}admin123${NC}"
        echo ""
        ;;

    start)
        echo -e "${YELLOW}Uruchamianie w tle...${NC}"
        echo ""

        # Sprawdź czy już nie działa
        if lsof -i:3001 >/dev/null 2>&1; then
            echo -e "${RED}Port 3001 jest zajęty. Zatrzymaj serwer: $0 stop${NC}"
            exit 1
        fi

        # Uruchom backend
        cd "$SCRIPT_DIR/backend"
        npm install --silent 2>/dev/null

        if [ ! -f .env ]; then
            echo -e "${RED}Brak .env! Uruchom najpierw: $0 dev${NC}"
            exit 1
        fi

        npm run init-db 2>/dev/null || true
        nohup npm start > /tmp/xsuslauncher-backend.log 2>&1 &
        BACKEND_PID=$!
        echo $BACKEND_PID > /tmp/xsuslauncher-backend.pid

        sleep 3

        # Sprawdź czy backend działa
        if ! curl -s http://localhost:3001/api/health >/dev/null; then
            echo -e "${RED}Backend nie uruchomił się poprawnie${NC}"
            cat /tmp/xsuslauncher-backend.log
            exit 1
        fi

        # Uruchom admin-panel
        cd "$SCRIPT_DIR/admin-panel"
        npm install --silent 2>/dev/null

        if [ ! -f .env ]; then
            echo "VITE_API_URL=http://localhost:3001/api" > .env
        fi

        nohup npm run dev > /tmp/xsuslauncher-panel.log 2>&1 &
        PANEL_PID=$!
        echo $PANEL_PID > /tmp/xsuslauncher-panel.pid

        sleep 5

        echo ""
        echo -e "${GREEN}============================================${NC}"
        echo -e "${GREEN}  XsusLauncher uruchomiony!${NC}"
        echo -e "${GREEN}============================================${NC}"
        echo ""
        echo -e "Panel Admin: ${BLUE}http://localhost:5173${NC}"
        echo -e "API:         ${BLUE}http://localhost:3001/api${NC}"
        echo ""
        echo -e "Login: ${GREEN}admin${NC}"
        echo -e "Hasło: ${GREEN}admin123${NC}"
        echo ""
        echo -e "Logi:  tail -f /tmp/xsuslauncher-*.log"
        echo -e "Stop:  ${YELLOW}$0 stop${NC}"
        echo ""
        ;;

    stop)
        echo -e "${YELLOW}Zatrzymywanie...${NC}"

        if [ -f /tmp/xsuslauncher-backend.pid ]; then
            kill $(cat /tmp/xsuslauncher-backend.pid) 2>/dev/null || true
            rm /tmp/xsuslauncher-backend.pid
        fi

        if [ -f /tmp/xsuslauncher-panel.pid ]; then
            kill $(cat /tmp/xsuslauncher-panel.pid) 2>/dev/null || true
            rm /tmp/xsuslauncher-panel.pid
        fi

        # Zabij wszystkie procesy node dla projektu
        pkill -f "node src/index.js" 2>/dev/null || true
        pkill -f "vite" 2>/dev/null || true

        echo -e "${GREEN}Zatrzymano${NC}"
        ;;

    docker|prod|production)
        echo -e "${YELLOW}Tryb: PRODUCTION (Docker)${NC}"
        echo ""

        # Sprawdź Docker
        if ! command -v docker &> /dev/null; then
            echo -e "${RED}Docker nie jest zainstalowany!${NC}"
            echo "Zainstaluj Docker: curl -fsSL https://get.docker.com | sh"
            exit 1
        fi

        if ! docker compose version &> /dev/null; then
            echo -e "${RED}Docker Compose nie jest dostępny!${NC}"
            exit 1
        fi

        # Sprawdź .env
        if [ ! -f "$SCRIPT_DIR/.env" ]; then
            echo -e "${YELLOW}Tworzenie .env...${NC}"
            JWT=$(openssl rand -hex 64)
            cat > "$SCRIPT_DIR/.env" << EOF
NODE_ENV=production
PORT=3001
JWT_SECRET=$JWT
JWT_EXPIRES_IN=7d
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
MC_SERVER_IP=mc.xsus.pl
MC_SERVER_PORT=25565
MAX_FILE_SIZE_MB=100
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
EOF
        fi

        # Utwórz katalogi
        mkdir -p "$SCRIPT_DIR/data/db"
        mkdir -p "$SCRIPT_DIR/data/uploads"

        echo -e "${BLUE}Budowanie i uruchamianie kontenerów...${NC}"
        docker compose up -d --build

        echo ""
        echo -e "${GREEN}============================================${NC}"
        echo -e "${GREEN}  XsusLauncher uruchomiony (Docker)!${NC}"
        echo -e "${GREEN}============================================${NC}"
        echo ""
        echo -e "Panel Admin: ${BLUE}http://localhost:5173${NC}"
        echo -e "API:         ${BLUE}http://localhost:3001/api${NC}"
        echo ""
        echo -e "Login: ${GREEN}admin${NC}"
        echo -e "Hasło: ${GREEN}admin123${NC}"
        echo ""
        echo -e "Status:  docker compose ps"
        echo -e "Logi:    docker compose logs -f"
        echo -e "Stop:    docker compose down"
        echo ""
        ;;

    logs)
        echo -e "${BLUE}Logi:${NC}"
        if [ -f /tmp/xsuslauncher-backend.log ]; then
            tail -f /tmp/xsuslauncher-backend.log /tmp/xsuslauncher-panel.log
        else
            docker compose logs -f
        fi
        ;;

    status)
        echo -e "${BLUE}Status:${NC}"
        echo ""

        if curl -s http://localhost:3001/api/health >/dev/null 2>&1; then
            echo -e "Backend:     ${GREEN}DZIAŁA${NC} (http://localhost:3001)"
        else
            echo -e "Backend:     ${RED}NIE DZIAŁA${NC}"
        fi

        if curl -s http://localhost:5173 >/dev/null 2>&1; then
            echo -e "Admin Panel: ${GREEN}DZIAŁA${NC} (http://localhost:5173)"
        else
            echo -e "Admin Panel: ${RED}NIE DZIAŁA${NC}"
        fi
        echo ""
        ;;

    *)
        echo "Użycie: $0 {dev|start|stop|docker|logs|status}"
        echo ""
        echo "Komendy:"
        echo "  dev     - Przygotuj środowisko deweloperskie"
        echo "  start   - Uruchom wszystko w tle"
        echo "  stop    - Zatrzymaj wszystko"
        echo "  docker  - Uruchom przez Docker (produkcja)"
        echo "  logs    - Pokaż logi"
        echo "  status  - Sprawdź status"
        echo ""
        exit 1
        ;;
esac
