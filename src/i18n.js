import de from "./locales/de.js";
import en from "./locales/en.js";

// Adding a language: drop a file next to de.js with the same keys and list it
// here. The key-parity test in test/i18n.test.mjs picks it up automatically.
export const LOCALES = { de, en };
export const LANGUAGES = Object.keys(LOCALES);

// The language used when nothing says which one to use - Home Assistant
// without language information, or a locale file that lacks a key.
export const DEFAULT_LANGUAGE = "de";

// The language used when Home Assistant asks for one the card does not have.
export const FALLBACK_LANGUAGE = "en";

/**
 * Language code ("de", "en-GB" → "en") from a BCP 47 tag, or null when the
 * tag is empty or not a string.
 */
export function languageFromTag(tag) {
  if (typeof tag !== "string") return null;
  const code = tag.trim().split(/[-_]/)[0].toLowerCase();
  return code || null;
}

/**
 * The language Home Assistant is set to. Newer frontends carry it in
 * hass.locale.language, older ones in hass.language.
 */
export function languageFromHass(hass) {
  return languageFromTag(hass?.locale?.language) ?? languageFromTag(hass?.language);
}

/**
 * Picks the card's language: the config option wins, then Home Assistant's
 * setting. Without any language information the card stays German; a language
 * it has no translation for becomes English.
 */
export function resolveLanguage(configLanguage, hass) {
  if (configLanguage && LOCALES[configLanguage]) return configLanguage;
  const requested = languageFromHass(hass);
  if (requested === null) return DEFAULT_LANGUAGE;
  return LOCALES[requested] ? requested : FALLBACK_LANGUAGE;
}

/**
 * Looks a key up in the given language, falling back to German and finally to
 * the key itself, and fills in {placeholders} from params.
 */
export function translate(language, key, params = {}) {
  const table = LOCALES[language] || LOCALES[DEFAULT_LANGUAGE];
  const template = table[key] ?? LOCALES[DEFAULT_LANGUAGE][key] ?? key;
  return String(template).replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  );
}

/** The BCP 47 locale tag belonging to a language, for Intl and friends. */
export function localeOf(language) {
  return translate(language, "locale");
}
