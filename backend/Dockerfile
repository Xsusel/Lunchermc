# ============================================
# XsusLauncher Backend - Dockerfile
# Node.js API Server
# ============================================

FROM node:20-alpine

# Instalujemy zależności systemowe dla better-sqlite3
RUN apk add --no-cache python3 make g++ sqlite

# Ustawiamy katalog roboczy
WORKDIR /app

# Kopiujemy pliki package
COPY package*.json ./

# Instalujemy zależności
RUN npm ci --only=production

# Kopiujemy kod źródłowy
COPY . .

# Tworzymy katalogi dla danych
RUN mkdir -p /app/data /app/uploads/mods /app/uploads/launcher \
    /app/uploads/configs /app/uploads/resourcepacks /app/uploads/shaderpacks

# Inicjalizujemy bazę danych
RUN npm run init-db || true

# Eksponujemy port
EXPOSE 3001

# Uruchamiamy serwer
CMD ["node", "src/index.js"]
