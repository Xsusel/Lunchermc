# ============================================
# XsusLauncher Admin Panel - Dockerfile
# React + Vite build z Nginx (security-hardened)
# ============================================

# Etap 1: Budowanie aplikacji
FROM node:20-alpine AS builder

WORKDIR /app

# Kopiujemy pliki package z wlascicielem node
COPY --chown=node:node package*.json ./

# Instalujemy zaleznosci (uzywamy npm install dla kompatybilnosci)
RUN npm install

# Kopiujemy kod zrodlowy z wlascicielem node
COPY --chown=node:node . .

# Budujemy aplikacje
RUN npm run build

# Etap 2: Serwowanie przez Nginx
FROM nginx:alpine

# Usuwamy domyslna konfiguracje
RUN rm -rf /usr/share/nginx/html/*

# Kopiujemy zbudowana aplikacje
COPY --from=builder /app/dist /usr/share/nginx/html

# Kopiujemy konfiguracje Nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Eksponujemy port
EXPOSE 80

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget -q --spider http://localhost:80/ || exit 1

# Uruchamiamy Nginx
CMD ["nginx", "-g", "daemon off;"]
