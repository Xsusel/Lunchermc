#!/usr/bin/env node
/**
 * XsusLauncher - Skrypt automatycznego wydania (release)
 *
 * Automatyzuje cały proces:
 * 1. Bumpuje wersję w package.json (patch/minor/major)
 * 2. Buduje launcher (electron-builder)
 * 3. Oblicza SHA256/SHA512 zbudowanego pliku
 * 4. Uploaduje plik na serwer API
 * 5. Archiwizuje starsze wersje
 *
 * Użycie:
 *   node scripts/release.js                    # patch bump (1.0.0 → 1.0.1)
 *   node scripts/release.js minor              # minor bump (1.0.0 → 1.1.0)
 *   node scripts/release.js major              # major bump (1.0.0 → 2.0.0)
 *   node scripts/release.js --version 2.1.0    # konkretna wersja
 *   node scripts/release.js --no-build         # pomiń build, użyj istniejących plików
 *   node scripts/release.js --required         # oznacz jako wymagana aktualizacja
 *   node scripts/release.js --changelog "opis" # dodaj changelog
 *
 * Zmienne środowiskowe:
 *   LAUNCHER_API_URL    - URL serwera API (domyślnie: https://mc.xsus.pl)
 *   LAUNCHER_ADMIN_TOKEN - Token admina do uploadu
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const https = require('https');
const http = require('http');

// ============================================
// KONFIGURACJA
// ============================================

const ROOT_DIR = path.join(__dirname, '..');
const PKG_PATH = path.join(ROOT_DIR, 'package.json');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const ARCHIVE_DIR = path.join(ROOT_DIR, 'dist', 'archive');

const API_URL = process.env.LAUNCHER_API_URL || 'https://mc.xsus.pl';
const ADMIN_TOKEN = process.env.LAUNCHER_ADMIN_TOKEN || '';

// ============================================
// PARSOWANIE ARGUMENTÓW
// ============================================

const args = process.argv.slice(2);

function getArg(name) {
    const idx = args.indexOf(`--${name}`);
    if (idx !== -1 && args[idx + 1]) return args[idx + 1];
    return null;
}

function hasFlag(name) {
    return args.includes(`--${name}`);
}

const bumpType = args.find(a => ['patch', 'minor', 'major'].includes(a)) || 'patch';
const explicitVersion = getArg('version');
const skipBuild = hasFlag('no-build');
const isRequired = hasFlag('required');
const changelog = getArg('changelog') || '';

// ============================================
// HELPERS
// ============================================

function log(msg) {
    console.log(`\x1b[36m[release]\x1b[0m ${msg}`);
}

function success(msg) {
    console.log(`\x1b[32m[release]\x1b[0m ${msg}`);
}

function error(msg) {
    console.error(`\x1b[31m[release]\x1b[0m ${msg}`);
    process.exit(1);
}

function bumpVersion(current, type) {
    const parts = current.split('.').map(Number);
    switch (type) {
        case 'major': return `${parts[0] + 1}.0.0`;
        case 'minor': return `${parts[0]}.${parts[1] + 1}.0`;
        case 'patch': return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
        default: return current;
    }
}

function calculateHashes(filePath) {
    const buffer = fs.readFileSync(filePath);
    return {
        sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
        sha512: crypto.createHash('sha512').update(buffer).digest('base64'),
        size: buffer.length
    };
}

function findBuiltFiles() {
    if (!fs.existsSync(DIST_DIR)) return [];

    return fs.readdirSync(DIST_DIR)
        .filter(f => {
            const ext = path.extname(f).toLowerCase();
            return ['.exe', '.appimage', '.dmg', '.deb'].includes(ext)
                && !f.includes('blockmap');
        })
        .map(f => ({
            name: f,
            path: path.join(DIST_DIR, f),
            size: fs.statSync(path.join(DIST_DIR, f)).size
        }))
        .sort((a, b) => b.size - a.size); // Największe na górze
}

function archiveOldVersions(currentVersion) {
    if (!fs.existsSync(ARCHIVE_DIR)) {
        fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
    }

    const files = findBuiltFiles();
    for (const file of files) {
        if (!file.name.includes(currentVersion)) {
            const archivePath = path.join(ARCHIVE_DIR, file.name);
            if (!fs.existsSync(archivePath)) {
                log(`Archiwizuję: ${file.name}`);
                fs.copyFileSync(file.path, archivePath);
            }
        }
    }
}

/**
 * Uploaduje plik na serwer API
 */
function uploadToServer(filePath, version, hashes, changelogText, required) {
    return new Promise((resolve, reject) => {
        if (!ADMIN_TOKEN) {
            reject(new Error(
                'Brak tokenu admina!\n' +
                'Ustaw zmienną: export LAUNCHER_ADMIN_TOKEN="twoj_token"\n' +
                'Token możesz uzyskać logując się do panelu admina.'
            ));
            return;
        }

        const filename = path.basename(filePath);
        const fileData = fs.readFileSync(filePath);

        // Budujemy multipart form data ręcznie
        const boundary = '----FormBoundary' + crypto.randomBytes(16).toString('hex');

        const parts = [];

        // Pole: version
        parts.push(
            `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="version"\r\n\r\n` +
            `${version}\r\n`
        );

        // Pole: changelog
        if (changelogText) {
            parts.push(
                `--${boundary}\r\n` +
                `Content-Disposition: form-data; name="changelog"\r\n\r\n` +
                `${changelogText}\r\n`
            );
        }

        // Pole: is_required
        parts.push(
            `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="is_required"\r\n\r\n` +
            `${required}\r\n`
        );

        // Pole: file
        const fileHeader = Buffer.from(
            `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
            `Content-Type: application/octet-stream\r\n\r\n`
        );
        const fileFooter = Buffer.from(`\r\n--${boundary}--\r\n`);

        const preamble = Buffer.from(parts.join(''));
        const body = Buffer.concat([preamble, fileHeader, fileData, fileFooter]);

        const url = new URL(`${API_URL}/api/admin/launcher-versions/upload`);
        const client = url.protocol === 'https:' ? https : http;

        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': body.length,
                'Authorization': `Bearer ${ADMIN_TOKEN}`
            },
            timeout: 300000 // 5 minut
        };

        log(`Uploaduję na ${url.hostname}${url.pathname} (${(fileData.length / 1024 / 1024).toFixed(1)} MB)...`);

        const req = client.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    if (result.success) {
                        resolve(result);
                    } else {
                        reject(new Error(result.error || 'Upload failed'));
                    }
                } catch (e) {
                    reject(new Error(`Błąd parsowania odpowiedzi: ${data.substring(0, 200)}`));
                }
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Upload timeout (5 min)'));
        });

        req.write(body);
        req.end();
    });
}

// ============================================
// GŁÓWNA LOGIKA
// ============================================

async function main() {
    log('=== XsusLauncher Release Script ===\n');

    // 0. Walidacja tokenu (przed budowaniem żeby nie tracić czasu)
    if (!ADMIN_TOKEN && !hasFlag('no-upload')) {
        log('⚠️  Brak LAUNCHER_ADMIN_TOKEN - upload na serwer będzie pominięty.');
        log('   Ustaw: export LAUNCHER_ADMIN_TOKEN="twoj_token"');
        log('   Lub dodaj --no-upload aby pominąć upload bez ostrzeżenia.\n');
    }

    // 1. Odczytaj aktualną wersję
    const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf-8'));
    const currentVersion = pkg.version;
    const newVersion = explicitVersion || bumpVersion(currentVersion, bumpType);

    log(`Aktualna wersja: ${currentVersion}`);
    log(`Nowa wersja:     ${newVersion} (${explicitVersion ? 'ręczna' : bumpType})`);
    if (changelog) log(`Changelog:       ${changelog}`);
    if (isRequired) log(`Wymagana:        TAK`);
    log('');

    // 2. Zaktualizuj wersję w package.json
    if (newVersion !== currentVersion) {
        pkg.version = newVersion;
        fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n');
        success(`package.json zaktualizowany: ${currentVersion} → ${newVersion}`);
    }

    // 3. Archiwizuj stare buildy
    archiveOldVersions(newVersion);

    // 4. Build
    if (!skipBuild) {
        log('Buduję launcher (electron-builder)...');
        log('To może potrwać kilka minut...\n');

        try {
            const platform = process.platform === 'win32' ? '--win'
                           : process.platform === 'darwin' ? '--mac'
                           : '--linux';

            execSync(`npx electron-builder ${platform}`, {
                cwd: ROOT_DIR,
                stdio: 'inherit'
            });
            success('Build zakończony pomyślnie!\n');
        } catch (e) {
            error('Build nie powiódł się. Sprawdź logi powyżej.');
        }
    } else {
        log('Pomijam build (--no-build)\n');
    }

    // 5. Znajdź zbudowane pliki
    const builtFiles = findBuiltFiles();
    if (builtFiles.length === 0) {
        error('Nie znaleziono zbudowanych plików w dist/');
    }

    log('Znalezione pliki:');
    for (const file of builtFiles) {
        const sizeMB = (file.size / 1024 / 1024).toFixed(1);
        log(`  ${file.name} (${sizeMB} MB)`);
    }
    log('');

    // 6. Oblicz hasze
    const primaryFile = builtFiles[0]; // Największy plik (NSIS installer)
    log(`Obliczam SHA256/SHA512 dla ${primaryFile.name}...`);
    const hashes = calculateHashes(primaryFile.path);
    success(`SHA256: ${hashes.sha256}`);
    success(`SHA512: ${hashes.sha512.substring(0, 32)}...`);
    success(`Rozmiar: ${(hashes.size / 1024 / 1024).toFixed(1)} MB\n`);

    // 7. Upload na serwer
    if (ADMIN_TOKEN) {
        try {
            const result = await uploadToServer(
                primaryFile.path,
                newVersion,
                hashes,
                changelog,
                isRequired
            );
            success(`Upload zakończony pomyślnie!`);
            success(`Wersja ${newVersion} opublikowana na serwerze.`);
            if (result.data) {
                log(`  ID: ${result.data.id}`);
                log(`  URL: ${result.data.download_url}`);
            }
        } catch (e) {
            error(`Upload nie powiódł się: ${e.message}`);
        }
    } else {
        log('Pominam upload (brak LAUNCHER_ADMIN_TOKEN).');
        log('Aby uploadować automatycznie, ustaw zmienną:');
        log('  export LAUNCHER_ADMIN_TOKEN="twoj_token_admina"');
        log('');
        log('Alternatywnie, uploaduj ręcznie przez panel admina:');
        log(`  Plik: ${primaryFile.path}`);
        log(`  Wersja: ${newVersion}`);
        log(`  SHA256: ${hashes.sha256}`);
    }

    log('');
    success('=== Release zakończony! ===');
}

main().catch(e => error(e.message));
