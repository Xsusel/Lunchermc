# Budowanie XsusLauncher

## Wymagania

- Node.js 18 lub nowszy
- npm 9+
- Git

### Dla Windows (.exe)
- Windows 10/11 lub Wine na Linux
- Visual Studio Build Tools (opcjonalnie)

### Dla macOS (.dmg)
- macOS 10.15+
- Xcode Command Line Tools

### Dla Linux (.AppImage, .deb)
- Ubuntu 20.04+ lub podobny

## Instalacja zależności

```bash
cd launcher
npm install
```

## Konfiguracja API

Przed budowaniem edytuj plik `src/renderer/scripts/api.js` i ustaw URL swojego API:

```javascript
const API_URL = 'https://mc.xsus.pl/api';
```

## Budowanie

### Windows (x64)
```bash
npm run build:win
```

Wynik: `dist/XsusLauncher-1.0.0-x64.exe` (instalator NSIS)
        `dist/XsusLauncher-1.0.0-x64-portable.exe` (wersja portable)

### Windows (x86 - 32-bit)
```bash
npm run build:win -- --ia32
```

### Linux
```bash
npm run build:linux
```

Wynik: `dist/XsusLauncher-1.0.0.AppImage`
        `dist/xsuslauncher_1.0.0_amd64.deb`

### macOS
```bash
npm run build:mac
```

Wynik: `dist/XsusLauncher-1.0.0.dmg`

## Development

Uruchomienie w trybie developerskim:

```bash
npm run dev
```

## Ikona aplikacji

Zamień pliki w folderze `assets/`:
- `icon.ico` - Windows (256x256, format ICO)
- `icon.png` - Linux (256x256 lub 512x512, format PNG)
- `icon.icns` - macOS (format ICNS)

### Generowanie ikon

Możesz użyć narzędzia online lub:

```bash
# Instalacja electron-icon-builder
npm install -g electron-icon-builder

# Generowanie z pliku PNG 1024x1024
electron-icon-builder --input=icon-src.png --output=assets/
```

## Podpisywanie kodu (opcjonalne)

### Windows
Wymaga certyfikatu Code Signing. Ustaw w package.json:

```json
{
  "build": {
    "win": {
      "certificateFile": "cert.pfx",
      "certificatePassword": "haslo"
    }
  }
}
```

### macOS
Wymaga Apple Developer Account i certyfikatu.

## Dystrybucja

1. Zbuduj launcher
2. Przetestuj na czystym systemie
3. Prześlij pliki na serwer
4. W panelu admina dodaj nową wersję launchera (URL + SHA256)
5. Launcher automatycznie powiadomi użytkowników o aktualizacji

## Rozwiązywanie problemów

### Błąd: "electron-builder: command not found"
```bash
npm install -g electron-builder
```

### Błąd native modules (better-sqlite3, etc.)
```bash
npm run postinstall
# lub
./node_modules/.bin/electron-rebuild
```

### Windows Defender blokuje .exe
To normalne dla niepodpisanych aplikacji. Użytkownicy muszą kliknąć "Więcej informacji" > "Uruchom mimo to".

Rozwiązanie: Podpisz aplikację certyfikatem Code Signing.
