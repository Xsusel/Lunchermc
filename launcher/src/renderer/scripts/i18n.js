const translations = {
    pl: {
        play: 'GRAJ',
        settings: 'Ustawienia',
        login: 'Zaloguj się',
        register: 'Zarejestruj się',
        logout: 'Wyloguj',
        username: 'Nazwa użytkownika',
        password: 'Hasło',
        confirmPassword: 'Potwierdź hasło',
        rememberMe: 'Zapamiętaj mnie',
        serverList: 'Wybierz serwer',
        online: 'Online',
        offline: 'Offline',
        players: 'Graczy',
        defaultServer: 'Domyślny',
        news: 'Aktualności',
        broadcasts: 'Powiadomienia',
        ram: 'Pamięć RAM',
        minRam: 'Minimalna RAM',
        maxRam: 'Maksymalna RAM',
        java: 'Java',
        javaPath: 'Ścieżka Java',
        javaArgs: 'Argumenty JVM',
        autoInstallJava: 'Auto-instalacja Java',
        resolution: 'Rozdzielczość',
        width: 'Szerokość',
        height: 'Wysokość',
        fullscreen: 'Pełny ekran',
        autoClose: 'Zamknij launcher po uruchomieniu gry',
        autoUpdate: 'Automatyczne aktualizacje',
        gameFolder: 'Folder gry',
        theme: 'Motyw',
        save: 'Zapisz',
        reset: 'Resetuj',
        cancel: 'Anuluj',
        close: 'Zamknij',
        update: 'Aktualizacja',
        updateAvailable: 'Dostępna aktualizacja',
        downloadUpdate: 'Pobierz aktualizację',
        installUpdate: 'Zainstaluj aktualizację',
        updateLater: 'Później',
        downloading: 'Pobieranie...',
        installing: 'Instalowanie...',
        changelog: 'Lista zmian',
        version: 'Wersja',
        rules: 'Regulamin serwera',
        acceptRules: 'Akceptuję regulamin',
        preparing: 'Przygotowywanie...',
        downloadingFiles: 'Pobieranie plików...',
        launchingGame: 'Uruchamianie gry...',
        maintenance: 'Przerwa techniczna',
        connectionError: 'Błąd połączenia',
        loginRequired: 'Wymagane logowanie',
        banned: 'Konto zbanowane',
        registrationSuccess: 'Rejestracja zakończona pomyślnie',
        passwordMismatch: 'Hasła nie są zgodne',
        fieldRequired: 'To pole jest wymagane',
        javaNotFound: 'Nie znaleziono Java',
        javaInstalling: 'Instalowanie Java...',
        javaInstalled: 'Java zainstalowana pomyślnie',
        selectFolder: 'Wybierz folder',
        openFolder: 'Otwórz folder'
    },
    en: {
        play: 'PLAY',
        settings: 'Settings',
        login: 'Login',
        register: 'Register',
        logout: 'Logout',
        username: 'Username',
        password: 'Password',
        confirmPassword: 'Confirm Password',
        rememberMe: 'Remember me',
        serverList: 'Select server',
        online: 'Online',
        offline: 'Offline',
        players: 'Players',
        defaultServer: 'Default',
        news: 'News',
        broadcasts: 'Broadcasts',
        ram: 'RAM Memory',
        minRam: 'Minimum RAM',
        maxRam: 'Maximum RAM',
        java: 'Java',
        javaPath: 'Java Path',
        javaArgs: 'JVM Arguments',
        autoInstallJava: 'Auto-install Java',
        resolution: 'Resolution',
        width: 'Width',
        height: 'Height',
        fullscreen: 'Fullscreen',
        autoClose: 'Close launcher after game starts',
        autoUpdate: 'Automatic updates',
        gameFolder: 'Game folder',
        theme: 'Theme',
        save: 'Save',
        reset: 'Reset',
        cancel: 'Cancel',
        close: 'Close',
        update: 'Update',
        updateAvailable: 'Update Available',
        downloadUpdate: 'Download Update',
        installUpdate: 'Install Update',
        updateLater: 'Later',
        downloading: 'Downloading...',
        installing: 'Installing...',
        changelog: 'Changelog',
        version: 'Version',
        rules: 'Server Rules',
        acceptRules: 'I accept the rules',
        preparing: 'Preparing...',
        downloadingFiles: 'Downloading files...',
        launchingGame: 'Launching game...',
        maintenance: 'Maintenance',
        connectionError: 'Connection error',
        loginRequired: 'Login required',
        banned: 'Account banned',
        registrationSuccess: 'Registration successful',
        passwordMismatch: 'Passwords do not match',
        fieldRequired: 'This field is required',
        javaNotFound: 'Java not found',
        javaInstalling: 'Installing Java...',
        javaInstalled: 'Java installed successfully',
        selectFolder: 'Select folder',
        openFolder: 'Open folder'
    }
};

class I18n {
    constructor() {
        this.language = 'pl';
        this.listeners = [];
    }

    init(language) {
        this.language = language || 'pl';
    }

    setLanguage(lang) {
        if (translations[lang]) {
            this.language = lang;
            this.listeners.forEach(fn => fn(lang));
        }
    }

    getLanguage() {
        return this.language;
    }

    t(key) {
        return translations[this.language]?.[key] || translations.pl?.[key] || key;
    }

    getAvailableLanguages() {
        return [
            { code: 'pl', name: 'Polski' },
            { code: 'en', name: 'English' }
        ];
    }

    onChange(fn) {
        this.listeners.push(fn);
        return () => {
            this.listeners = this.listeners.filter(l => l !== fn);
        };
    }
}

const i18n = new I18n();
export default i18n;
