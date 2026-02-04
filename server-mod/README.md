# XsusMenu - Custom Minecraft Menu Mod

Ten mod modyfikuje główne menu Minecraft, usuwając przyciski Singleplayer i Multiplayer, a w ich miejsce dodając przycisk "Połącz z [nazwa serwera]".

## Funkcje

- Usuwa przyciski: Singleplayer, Multiplayer, Realms
- Dodaje przycisk "Połącz z [nazwa serwera]" który od razu łączy z serwerem
- IP serwera pobierane z pliku konfiguracyjnego `xsus_server.json`

## Jak to działa

1. Launcher zapisuje plik `xsus_server.json` w folderze gry przed uruchomieniem
2. Mod wczytuje ten plik przy starcie
3. W menu głównym wyświetlany jest przycisk z nazwą serwera
4. Kliknięcie przycisku od razu łączy z serwerem

## Format pliku konfiguracyjnego

Plik `xsus_server.json` w folderze gry:

```json
{
  "serverIp": "play.xsus.pl",
  "serverPort": 25565,
  "serverName": "XsusServer"
}
```

## Budowanie

```bash
# Wymagania: Java 17+, Gradle

# Budowanie moda
./gradlew build

# Wynikowy JAR będzie w: build/libs/xsusmenu-1.0.0.jar
```

## Wersje

- Minecraft: 1.20.1
- Forge: 47.2.0+

## Instalacja

1. Zbuduj mod lub pobierz gotowy JAR
2. Umieść `xsusmenu-1.0.0.jar` w folderze `mods/`
3. Mod powinien być automatycznie dystrybuowany przez launcher XsusLauncher
