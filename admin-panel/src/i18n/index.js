import { create } from 'zustand';
import pl from './pl.js';
import en from './en.js';

const translations = { pl, en };
const STORAGE_KEY = 'admin-panel-language';

const getInitialLanguage = () => {
    try {
        return localStorage.getItem(STORAGE_KEY) || 'pl';
    } catch {
        return 'pl';
    }
};

export const useI18n = create((set, get) => ({
    language: getInitialLanguage(),
    translations: translations[getInitialLanguage()] || pl,

    setLanguage: (lang) => {
        localStorage.setItem(STORAGE_KEY, lang);
        set({ language: lang, translations: translations[lang] || pl });
    },

    t: (key) => {
        const { translations: trans } = get();
        const keys = key.split('.');
        let result = trans;
        for (const k of keys) {
            result = result?.[k];
        }
        return result || key;
    },

    availableLanguages: [
        { code: 'pl', name: 'Polski', flag: '🇵🇱' },
        { code: 'en', name: 'English', flag: '🇬🇧' }
    ]
}));
