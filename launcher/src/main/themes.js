/**
 * Moduł zarządzania motywami
 * Definiuje dostępne motywy i zarządza ich przełączaniem
 */

// Dostępne motywy
const themes = {
    // Domyślny ciemny motyw z zielonymi akcentami
    dark: {
        id: 'dark',
        name: 'Ciemny (Domyślny)',
        description: 'Klasyczny ciemny motyw z zielonymi akcentami',
        colors: {
            'bg-primary': '#0a0a0a',
            'bg-secondary': '#141414',
            'bg-tertiary': '#1e1e1e',
            'bg-card': '#1a1a1a',
            'accent': '#00cc66',
            'accent-hover': '#00e673',
            'accent-dark': '#009944',
            'accent-glow': 'rgba(0, 204, 102, 0.3)',
            'text-primary': '#ffffff',
            'text-secondary': '#b0b0b0',
            'text-muted': '#666666',
            'success': '#00cc66',
            'warning': '#ffaa00',
            'error': '#ff4444',
            'info': '#3399ff',
            'border': '#2a2a2a',
            'border-light': '#3a3a3a'
        }
    },

    // Ciemny niebieski
    darkBlue: {
        id: 'darkBlue',
        name: 'Ciemny Niebieski',
        description: 'Ciemny motyw z niebieskimi akcentami',
        colors: {
            'bg-primary': '#0a0a12',
            'bg-secondary': '#12121a',
            'bg-tertiary': '#1a1a24',
            'bg-card': '#16161e',
            'accent': '#3b82f6',
            'accent-hover': '#60a5fa',
            'accent-dark': '#2563eb',
            'accent-glow': 'rgba(59, 130, 246, 0.3)',
            'text-primary': '#ffffff',
            'text-secondary': '#a0aec0',
            'text-muted': '#64748b',
            'success': '#22c55e',
            'warning': '#f59e0b',
            'error': '#ef4444',
            'info': '#3b82f6',
            'border': '#1e293b',
            'border-light': '#334155'
        }
    },

    // Ciemny fioletowy
    darkPurple: {
        id: 'darkPurple',
        name: 'Ciemny Fioletowy',
        description: 'Ciemny motyw z fioletowymi akcentami',
        colors: {
            'bg-primary': '#0d0a14',
            'bg-secondary': '#150f1e',
            'bg-tertiary': '#1d1528',
            'bg-card': '#181222',
            'accent': '#a855f7',
            'accent-hover': '#c084fc',
            'accent-dark': '#9333ea',
            'accent-glow': 'rgba(168, 85, 247, 0.3)',
            'text-primary': '#ffffff',
            'text-secondary': '#c4b5fd',
            'text-muted': '#7c6a9a',
            'success': '#22c55e',
            'warning': '#f59e0b',
            'error': '#ef4444',
            'info': '#a855f7',
            'border': '#2e1f47',
            'border-light': '#402e5f'
        }
    },

    // Ciemny czerwony
    darkRed: {
        id: 'darkRed',
        name: 'Ciemny Czerwony',
        description: 'Ciemny motyw z czerwonymi akcentami',
        colors: {
            'bg-primary': '#0a0808',
            'bg-secondary': '#141010',
            'bg-tertiary': '#1e1616',
            'bg-card': '#1a1212',
            'accent': '#ef4444',
            'accent-hover': '#f87171',
            'accent-dark': '#dc2626',
            'accent-glow': 'rgba(239, 68, 68, 0.3)',
            'text-primary': '#ffffff',
            'text-secondary': '#fca5a5',
            'text-muted': '#7f6666',
            'success': '#22c55e',
            'warning': '#f59e0b',
            'error': '#ef4444',
            'info': '#3b82f6',
            'border': '#3a2020',
            'border-light': '#4a3030'
        }
    },

    // Midnight (bardzo ciemny)
    midnight: {
        id: 'midnight',
        name: 'Midnight',
        description: 'Bardzo ciemny motyw dla nocnych sesji',
        colors: {
            'bg-primary': '#000000',
            'bg-secondary': '#0a0a0a',
            'bg-tertiary': '#111111',
            'bg-card': '#0d0d0d',
            'accent': '#10b981',
            'accent-hover': '#34d399',
            'accent-dark': '#059669',
            'accent-glow': 'rgba(16, 185, 129, 0.25)',
            'text-primary': '#e5e5e5',
            'text-secondary': '#999999',
            'text-muted': '#555555',
            'success': '#10b981',
            'warning': '#f59e0b',
            'error': '#ef4444',
            'info': '#06b6d4',
            'border': '#1a1a1a',
            'border-light': '#262626'
        }
    },

    // Cyberpunk
    cyberpunk: {
        id: 'cyberpunk',
        name: 'Cyberpunk',
        description: 'Neonowy motyw w stylu cyberpunk',
        colors: {
            'bg-primary': '#0d0015',
            'bg-secondary': '#150020',
            'bg-tertiary': '#1f002e',
            'bg-card': '#1a0028',
            'accent': '#ff00ff',
            'accent-hover': '#ff66ff',
            'accent-dark': '#cc00cc',
            'accent-glow': 'rgba(255, 0, 255, 0.4)',
            'text-primary': '#ffffff',
            'text-secondary': '#ff99ff',
            'text-muted': '#996699',
            'success': '#00ff88',
            'warning': '#ffff00',
            'error': '#ff0044',
            'info': '#00ccff',
            'border': '#330044',
            'border-light': '#440066'
        }
    },

    // Ocean
    ocean: {
        id: 'ocean',
        name: 'Ocean',
        description: 'Spokojny motyw morski',
        colors: {
            'bg-primary': '#0a1520',
            'bg-secondary': '#0f1e2e',
            'bg-tertiary': '#15293d',
            'bg-card': '#122436',
            'accent': '#06b6d4',
            'accent-hover': '#22d3ee',
            'accent-dark': '#0891b2',
            'accent-glow': 'rgba(6, 182, 212, 0.3)',
            'text-primary': '#f0f9ff',
            'text-secondary': '#7dd3fc',
            'text-muted': '#4a7a8c',
            'success': '#22c55e',
            'warning': '#fbbf24',
            'error': '#f87171',
            'info': '#06b6d4',
            'border': '#1e3a5f',
            'border-light': '#2d4a6f'
        }
    },

    // Light (jasny)
    light: {
        id: 'light',
        name: 'Jasny',
        description: 'Jasny motyw dla tych, którzy preferują światło',
        colors: {
            'bg-primary': '#f5f5f5',
            'bg-secondary': '#e5e5e5',
            'bg-tertiary': '#d4d4d4',
            'bg-card': '#ffffff',
            'accent': '#059669',
            'accent-hover': '#10b981',
            'accent-dark': '#047857',
            'accent-glow': 'rgba(5, 150, 105, 0.2)',
            'text-primary': '#171717',
            'text-secondary': '#525252',
            'text-muted': '#a3a3a3',
            'success': '#22c55e',
            'warning': '#f59e0b',
            'error': '#ef4444',
            'info': '#3b82f6',
            'border': '#d4d4d4',
            'border-light': '#e5e5e5'
        }
    }
};

/**
 * Pobiera listę wszystkich dostępnych motywów
 */
function getAvailableThemes() {
    return Object.values(themes).map(theme => ({
        id: theme.id,
        name: theme.name,
        description: theme.description
    }));
}

/**
 * Pobiera motyw po ID
 */
function getTheme(themeId) {
    return themes[themeId] || themes.dark;
}

/**
 * Generuje CSS string z kolorami motywu
 */
function getThemeCSS(themeId) {
    const theme = getTheme(themeId);
    let css = ':root {\n';

    for (const [key, value] of Object.entries(theme.colors)) {
        css += `    --${key}: ${value};\n`;
    }

    css += '}';
    return css;
}

/**
 * Generuje obiekt z CSS variables do wstrzyknięcia
 */
function getThemeVariables(themeId) {
    const theme = getTheme(themeId);
    const variables = {};

    for (const [key, value] of Object.entries(theme.colors)) {
        variables[`--${key}`] = value;
    }

    return variables;
}

module.exports = {
    themes,
    getAvailableThemes,
    getTheme,
    getThemeCSS,
    getThemeVariables
};
