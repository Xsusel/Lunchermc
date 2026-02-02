# ============================================
# XsusLauncher Admin Panel - Dockerfile
# React + Vite build z Nginx
# ============================================

# Etap 1: Budowanie aplikacji
FROM node:20-alpine AS builder

WORKDIR /app

# Kopiujemy pliki package
COPY package*.json ./

# Instalujemy zależności (używamy npm install dla kompatybilności)
RUN npm install

# Kopiujemy kod źródłowy
COPY . .

# Budujemy aplikację
RUN npm run build

# Etap 2: Serwowanie przez Nginx
FROM nginx:alpine

# Usuwamy domyślną konfigurację
RUN rm -rf /usr/share/nginx/html/*

# Kopiujemy zbudowaną aplikację
COPY --from=builder /app/dist /usr/share/nginx/html

# Kopiujemy konfigurację Nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Eksponujemy port
EXPOSE 80

# Uruchamiamy Nginx
CMD ["nginx", "-g", "daemon off;"]
