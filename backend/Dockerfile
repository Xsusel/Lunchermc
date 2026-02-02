# ============================================
# XsusLauncher Backend - Dockerfile
# Node.js API Server
# ============================================

FROM node:20-alpine

# Instalujemy zaleznosci systemowe dla better-sqlite3
RUN apk add --no-cache python3 make g++ sqlite wget

# Ustawiamy zmienne srodowiskowe
ENV NODE_ENV=production
ENV PORT=3001

# Ustawiamy katalog roboczy
WORKDIR /app

# Kopiujemy pliki package
COPY package*.json ./

# Instalujemy zaleznosci
RUN npm install --omit=dev

# Kopiujemy kod zrodlowy
COPY . .

# Tworzymy katalogi dla danych
RUN mkdir -p /app/data /app/uploads/mods /app/uploads/launcher \
    /app/uploads/configs /app/uploads/resourcepacks /app/uploads/shaderpacks

# Eksponujemy port
EXPOSE 3001

# Healthcheck z dluzszym start period
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD wget -q --spider http://localhost:3001/api/health || exit 1

# Uruchamiamy serwer
CMD ["node", "src/index.js"]
