#!/bin/bash
# ============================================
# XsusLauncher - Skrypt instalacyjny
# Instalacja na czystym Debian 11/12
# ============================================

set -e

# Kolory dla output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Funkcje pomocnicze
print_header() {
    echo ""
    echo -e "${BLUE}============================================${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}============================================${NC}"
    echo ""
}

print_success() {
    echo -e "${GREEN}[✓] $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}[!] $1${NC}"
}

print_error() {
    echo -e "${RED}[✗] $1${NC}"
}

print_info() {
    echo -e "${BLUE}[i] $1${NC}"
}

# Sprawdzenie czy skrypt jest uruchomiony jako root
if [ "$EUID" -ne 0 ]; then
    print_error "Uruchom skrypt jako root (sudo ./install.sh)"
    exit 1
fi

# Zmienne konfiguracyjne
INSTALL_DIR="/opt/xsuslauncher"
DOMAIN="mc.xsus.pl"
EMAIL="" # Email dla certbot - uzupełnij poniżej

print_header "XsusLauncher - Instalacja"
echo "Ten skrypt zainstaluje:"
echo "  • Docker i Docker Compose"
echo "  • Nginx jako Reverse Proxy"
echo "  • Certbot dla SSL"
echo "  • XsusLauncher (API + Panel)"
echo ""

# Pytanie o domenę
read -p "Podaj domenę (domyślnie: $DOMAIN): " input_domain
DOMAIN=${input_domain:-$DOMAIN}

# Pytanie o email dla certbot
read -p "Podaj email dla certyfikatu SSL: " EMAIL
if [ -z "$EMAIL" ]; then
    print_error "Email jest wymagany dla certyfikatu SSL"
    exit 1
fi

# Pytanie o hasło admina
read -sp "Podaj hasło dla konta admin: " ADMIN_PASSWORD
echo ""
if [ -z "$ADMIN_PASSWORD" ]; then
    print_error "Hasło admina jest wymagane"
    exit 1
fi

# Pytanie o IP serwera MC
read -p "Podaj IP serwera Minecraft (domyślnie: localhost): " MC_SERVER_IP
MC_SERVER_IP=${MC_SERVER_IP:-localhost}

read -p "Podaj port serwera Minecraft (domyślnie: 25565): " MC_SERVER_PORT
MC_SERVER_PORT=${MC_SERVER_PORT:-25565}

# ============================================
# INSTALACJA PAKIETÓW
# ============================================
print_header "Aktualizacja systemu i instalacja pakietów"

apt-get update
apt-get upgrade -y
apt-get install -y \
    curl \
    wget \
    git \
    nginx \
    certbot \
    python3-certbot-nginx \
    ufw \
    htop \
    nano

print_success "Pakiety zainstalowane"

# ============================================
# INSTALACJA DOCKER
# ============================================
print_header "Instalacja Docker"

if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh

    # Dodaj użytkownika do grupy docker
    usermod -aG docker $SUDO_USER 2>/dev/null || true

    # Włącz Docker przy starcie
    systemctl enable docker
    systemctl start docker

    print_success "Docker zainstalowany"
else
    print_info "Docker już zainstalowany"
fi

# Sprawdź Docker Compose
if ! docker compose version &> /dev/null; then
    print_error "Docker Compose nie jest dostępny"
    exit 1
fi

print_success "Docker Compose dostępny"

# ============================================
# KONFIGURACJA FIREWALL
# ============================================
print_header "Konfiguracja firewall (UFW)"

ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 25565/tcp  # Minecraft
ufw --force enable

print_success "Firewall skonfigurowany"

# ============================================
# TWORZENIE STRUKTURY KATALOGÓW
# ============================================
print_header "Tworzenie struktury katalogów"

mkdir -p $INSTALL_DIR
mkdir -p $INSTALL_DIR/data/db
mkdir -p $INSTALL_DIR/data/uploads/mods
mkdir -p $INSTALL_DIR/data/uploads/configs
mkdir -p $INSTALL_DIR/data/uploads/resourcepacks
mkdir -p $INSTALL_DIR/data/uploads/shaderpacks
mkdir -p $INSTALL_DIR/data/uploads/launcher
mkdir -p $INSTALL_DIR/releases
mkdir -p /var/www/certbot

# Kopiuj pliki projektu
cp -r . $INSTALL_DIR/

print_success "Struktura katalogów utworzona"

# ============================================
# GENEROWANIE KLUCZA JWT
# ============================================
print_header "Generowanie konfiguracji"

JWT_SECRET=$(openssl rand -hex 64)

# Tworzenie pliku .env
cat > $INSTALL_DIR/.env << EOF
# XsusLauncher - Konfiguracja
# Wygenerowano: $(date)

# Serwer
NODE_ENV=production
PORT=3001

# Bezpieczeństwo
JWT_SECRET=$JWT_SECRET
JWT_EXPIRES_IN=7d

# Admin
ADMIN_USERNAME=admin
ADMIN_PASSWORD=$ADMIN_PASSWORD

# Serwer Minecraft
MC_SERVER_IP=$MC_SERVER_IP
MC_SERVER_PORT=$MC_SERVER_PORT

# Limity
MAX_FILE_SIZE_MB=100
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
EOF

chmod 600 $INSTALL_DIR/.env

print_success "Plik .env utworzony"

# ============================================
# KONFIGURACJA NGINX
# ============================================
print_header "Konfiguracja Nginx"

# Usuń domyślną konfigurację
rm -f /etc/nginx/sites-enabled/default

# Tymczasowa konfiguracja dla certbot (bez SSL)
cat > /etc/nginx/sites-available/$DOMAIN << EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 200 'XsusLauncher - Instalacja w toku...';
        add_header Content-Type text/plain;
    }
}
EOF

ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/

nginx -t
systemctl reload nginx

print_success "Nginx skonfigurowany (tymczasowo)"

# ============================================
# CERTYFIKAT SSL
# ============================================
print_header "Generowanie certyfikatu SSL"

certbot certonly --webroot \
    -w /var/www/certbot \
    -d $DOMAIN \
    --email $EMAIL \
    --agree-tos \
    --non-interactive

print_success "Certyfikat SSL wygenerowany"

# Pełna konfiguracja Nginx z SSL
cat > /etc/nginx/sites-available/$DOMAIN << EOF
# Przekierowanie HTTP -> HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

# Główny serwer HTTPS
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name $DOMAIN;

    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    ssl_trusted_certificate /etc/letsencrypt/live/$DOMAIN/chain.pem;

    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_session_tickets off;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    add_header Strict-Transport-Security "max-age=63072000" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;

    client_max_body_size 100M;

    access_log /var/log/nginx/$DOMAIN.access.log;
    error_log /var/log/nginx/$DOMAIN.error.log;

    # Panel administracyjny
    location / {
        proxy_pass http://127.0.0.1:5173;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # API
    location /api {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300s;
    }

    # WebSocket
    location /ws {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_read_timeout 86400;
    }

    # Pliki launchera do pobrania
    location /download/launcher {
        alias $INSTALL_DIR/releases;
        autoindex off;
    }
}
EOF

nginx -t
systemctl reload nginx

print_success "Nginx z SSL skonfigurowany"

# ============================================
# URUCHOMIENIE DOCKER COMPOSE
# ============================================
print_header "Uruchamianie XsusLauncher"

cd $INSTALL_DIR
docker compose up -d --build

# Czekamy na uruchomienie
sleep 10

# Sprawdzamy status
if docker compose ps | grep -q "Up"; then
    print_success "Kontenery uruchomione"
else
    print_error "Problem z uruchomieniem kontenerów"
    docker compose logs
    exit 1
fi

# ============================================
# KONFIGURACJA AUTO-RENEWAL SSL
# ============================================
print_header "Konfiguracja automatycznego odnawiania SSL"

(crontab -l 2>/dev/null || true; echo "0 12 * * * /usr/bin/certbot renew --quiet && systemctl reload nginx") | crontab -

print_success "Auto-renewal SSL skonfigurowany"

# ============================================
# PODSUMOWANIE
# ============================================
print_header "Instalacja zakończona!"

echo ""
echo -e "${GREEN}XsusLauncher został zainstalowany pomyślnie!${NC}"
echo ""
echo "============================================"
echo "DANE DOSTĘPOWE:"
echo "============================================"
echo ""
echo -e "Panel administracyjny: ${BLUE}https://$DOMAIN${NC}"
echo -e "API:                   ${BLUE}https://$DOMAIN/api${NC}"
echo ""
echo -e "Login:    ${YELLOW}admin${NC}"
echo -e "Hasło:    ${YELLOW}[podane podczas instalacji]${NC}"
echo ""
echo "============================================"
echo "WAŻNE LOKALIZACJE:"
echo "============================================"
echo ""
echo "Katalog instalacji:    $INSTALL_DIR"
echo "Baza danych:          $INSTALL_DIR/data/db/"
echo "Pliki (mody, itp.):   $INSTALL_DIR/data/uploads/"
echo "Pliki launchera:      $INSTALL_DIR/releases/"
echo "Konfiguracja:         $INSTALL_DIR/.env"
echo ""
echo "============================================"
echo "PRZYDATNE KOMENDY:"
echo "============================================"
echo ""
echo "Restart usług:        cd $INSTALL_DIR && docker compose restart"
echo "Logi API:             cd $INSTALL_DIR && docker compose logs -f api"
echo "Logi Panelu:          cd $INSTALL_DIR && docker compose logs -f admin-panel"
echo "Status:               cd $INSTALL_DIR && docker compose ps"
echo ""
echo "============================================"
echo ""
print_success "Gotowe! Otwórz https://$DOMAIN w przeglądarce."
echo ""
