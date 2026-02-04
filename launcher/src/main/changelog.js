/**
 * XsusLauncher - Changelog Data
 * Historia zmian w launcherze
 */

const changelog = {
    // Wersja aktualna
    '1.0.0': {
        date: '2024-01-01',
        sections: {
            new: [
                'Pierwsza wersja launchera XsusLauncher',
                'Automatyczne pobieranie Minecraft i Forge',
                'Synchronizacja modów z serwera',
                'Wbudowany system logowania',
                'Auto-connect do serwera po uruchomieniu',
                'Crash reporter - automatyczne raporty błędów',
                'Auto-instalacja Java jeśli brak',
                'Discord Rich Presence - pokazuj status w Discord'
            ],
            improved: [
                'Zoptymalizowane pobieranie plików (5 równolegle)',
                'Wznawianie przerwanych pobrań',
                'Automatyczna konfiguracja RAM',
                'Cache dla szybszego uruchamiania'
            ],
            fixed: []
        }
    },
    // Przyszłe wersje będą dodawane tutaj
    // '1.1.0': {
    //     date: '2024-02-01',
    //     sections: {
    //         new: ['Nowa funkcja'],
    //         improved: ['Ulepszona funkcja'],
    //         fixed: ['Naprawiony błąd']
    //     }
    // }
};

/**
 * Pobiera changelog dla danej wersji
 */
function getChangelog(version) {
    return changelog[version] || null;
}

/**
 * Pobiera najnowszy changelog
 */
function getLatestChangelog() {
    const versions = Object.keys(changelog);
    if (versions.length === 0) return null;

    // Sortuj wersje malejąco (najnowsza pierwsza)
    versions.sort((a, b) => {
        const partsA = a.split('.').map(Number);
        const partsB = b.split('.').map(Number);
        for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
            const numA = partsA[i] || 0;
            const numB = partsB[i] || 0;
            if (numA !== numB) return numB - numA;
        }
        return 0;
    });

    const latestVersion = versions[0];
    return {
        version: latestVersion,
        ...changelog[latestVersion]
    };
}

/**
 * Pobiera wszystkie changelogi
 */
function getAllChangelogs() {
    return changelog;
}

module.exports = {
    getChangelog,
    getLatestChangelog,
    getAllChangelogs
};
