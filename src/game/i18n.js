// i18n: German-first localization. German is the game's default language;
// English is the secondary catalog.
//
// Mechanism: translation keys ARE the canonical English source strings, so
// the EN catalog is implicit (a missing English entry renders the key itself)
// and German is a purely additive catalog (i18n-de.js). `t(text, params)`
// resolves the current language, substitutes `{param}` placeholders, and
// falls back key → English when a German entry is missing — so the game stays
// playable while translation is in progress.
//
// Proper nouns are deliberately NOT translated: station names (Helix, Rook,
// Vesper, Azure), ship models (Wayfarer, Talon …), person names and
// callsigns, zone names (Shardbelt, Mourning Line) and company names
// (Kestrel Freight …) stay English. Descriptive names (factions, guilds,
// commodity and equipment names) DO translate.
//
// The chosen language persists to localStorage ('voidrunner-lang') so it
// works even before a save exists, and mirrors into save.settings.language
// once a career is running. Language changes always reload the page — the HUD
// and title shell are built once, so a reload guarantees every surface
// renders in the same language.
import { DE_CATALOG } from './i18n-de.js';

export const SUPPORTED_LANGUAGES = ['de', 'en'];
export const DEFAULT_LANGUAGE = 'de';
const STORAGE_KEY = 'voidrunner-lang';

let currentLanguage = DEFAULT_LANGUAGE;

// Resolve the persisted choice at module scope so every module-scope t()
// call (comms pools, option lists, dialog lines) resolves in the boot
// language. Guarded for headless probe scripts that import these modules
// outside a browser.
const readStoredLanguage = () => {
    try {
        if (typeof localStorage === 'undefined')
            return undefined;
        const stored = localStorage.getItem(STORAGE_KEY);
        return SUPPORTED_LANGUAGES.includes(stored) ? stored : undefined;
    }
    catch {
        return undefined;
    }
};
currentLanguage = readStoredLanguage() ?? DEFAULT_LANGUAGE;
if (typeof document !== 'undefined')
    document.documentElement.lang = currentLanguage;

export const getLanguage = () => currentLanguage;

export const setLanguage = (language) => {
    const next = SUPPORTED_LANGUAGES.includes(language) ? language : DEFAULT_LANGUAGE;
    currentLanguage = next;
    try {
        if (typeof localStorage !== 'undefined')
            localStorage.setItem(STORAGE_KEY, next);
        if (typeof document !== 'undefined')
            document.documentElement.lang = next;
    }
    catch {
        // Storage may be unavailable (private mode, headless probes).
    }
    return next;
};

export const translate = (text, params) => {
    let out = text;
    if (currentLanguage === 'de' && typeof text === 'string') {
        const translation = DE_CATALOG[text];
        if (translation !== undefined && translation !== null)
            out = translation;
    }
    if (params && typeof out === 'string') {
        for (const key of Object.keys(params))
            out = out.split(`{${key}}`).join(String(params[key]));
    }
    return out;
};
export const t = translate;
