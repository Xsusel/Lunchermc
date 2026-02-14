#!/bin/sh
set -e

# Napraw uprawnienia zamontowanych wolumenów (mogą należeć do root)
chown -R node:node /app/data /app/uploads 2>/dev/null || true

# Inicjalizuj bazę danych (tworzenie tabel i danych początkowych)
echo "Inicjalizacja bazy danych..."
su-exec node node src/config/initDb.js
echo "Baza danych gotowa."

# Uruchom serwer jako user node
exec su-exec node node src/index.js
