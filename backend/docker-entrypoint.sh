#!/bin/sh
# Napraw uprawnienia zamontowanych wolumenów (mogą należeć do root)
chown -R node:node /app/data /app/uploads 2>/dev/null || true

# Uruchom serwer jako user node
exec su-exec node node src/index.js
