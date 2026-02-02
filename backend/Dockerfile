# ============================================
# XsusLauncher Backend - Dockerfile
# Node.js API Server
# ============================================

FROM node:20-alpine AS builder

# Instalujemy zaleznosci systemowe dla better-sqlite3
RUN apk add --no-cache python3 make g++ sqlite

# Ustawiamy katalog roboczy
WORKDIR /app

# Kopiujemy pliki package (lepsze cache)
COPY package*.json ./

# Instalujemy zaleznosci
RUN npm install --omit=dev

# ============================================
# PRODUKCYJNY OBRAZ
# ============================================
FROM node:20-alpine

# Instalujemy tylko runtime dependencies
RUN apk add --no-cache sqlite wget

# Ustawiamy zmienne srodowiskowe
ENV NODE_ENV=production
ENV PORT=3001

# Ustawiamy katalog roboczy
WORKDIR /app

# Kopiujemy node_modules z buildera
COPY --from=builder /app/node_modules ./node_modules

# Kopiujemy kod zrodlowy
COPY . .

# Tworzymy katalogi dla danych
RUN mkdir -p /app/data /app/uploads/mods /app/uploads/launcher \
    /app/uploads/configs /app/uploads/resourcepacks /app/uploads/shaderpacks

# Ustawiamy uprawnienia
RUN chown -R node:node /app

# Uzywamy uzytkownika nieprivilejowanego
USER node

# Eksponujemy port
EXPOSE 3001

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget -q --spider http://localhost:3001/api/health || exit 1

# Uruchamiamy serwer
CMD ["node", "src/index.js"]
