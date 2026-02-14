# ============================================
# XsusLauncher Backend - Dockerfile
# Node.js API Server
# ============================================

FROM node:20-alpine

# Instalujemy zaleznosci systemowe dla better-sqlite3
RUN apk add --no-cache python3 make g++ sqlite wget su-exec

# Ustawiamy zmienne srodowiskowe
ENV NODE_ENV=production
ENV PORT=3001

# Ustawiamy katalog roboczy
WORKDIR /app

# Kopiujemy pliki package z wlascicielem node
COPY --chown=node:node package*.json ./

# Instalujemy zaleznosci
RUN npm install --omit=dev

# Kopiujemy kod zrodlowy z wlascicielem node
COPY --chown=node:node . .

# Tworzymy katalogi dla danych i ustawiamy uprawnienia
RUN mkdir -p /app/data /app/uploads/mods /app/uploads/launcher \
    /app/uploads/configs /app/uploads/resourcepacks /app/uploads/shaderpacks \
    && chown -R node:node /app/data /app/uploads

# Entrypoint naprawia uprawnienia wolumenów i startuje jako node
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Eksponujemy port
EXPOSE 3001

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD wget -q --spider http://localhost:3001/api/health || exit 1

# Start przez entrypoint (root → chown → su-exec node)
ENTRYPOINT ["docker-entrypoint.sh"]
