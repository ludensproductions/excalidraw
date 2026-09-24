import { defaultLang, languages } from "@excalidraw/excalidraw";
import LanguageDetector from "i18next-browser-languagedetector";
const LANGUAGE_CACHE_KEY = "i18nextLng";
const supportedLanguageCodes = languages.map((lang) => lang.code);
export const languageDetector = new LanguageDetector();
languageDetector.init({
  languageUtils: {},
});
const getStoredLanguage = (): string | null => {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage.getItem(LANGUAGE_CACHE_KEY);
  } catch {
    return null;
  }
};
const findSupportedLanguage = (candidate: string | null | undefined) => {
  if (!candidate) {
    return null;
  }
  const normalized = candidate.trim().replace(/_/g, "-").toLowerCase();
  if (!normalized) {
    return null;
  }
  const exactMatch = supportedLanguageCodes.find(
    (code) => code.toLowerCase() === normalized,
  );
  if (exactMatch) {
    return exactMatch;
  }
  const baseCode = normalized.split("-")[0];
  if (!baseCode) {
    return null;
  }
  return (
    supportedLanguageCodes.find((code) => code.toLowerCase() === baseCode) ||
    supportedLanguageCodes.find((code) =>
      code.toLowerCase().startsWith(`${baseCode}-`),
    ) ||
    null
  );
};
export const getPreferredLanguage = () => {
  const navigatorLanguages =
    typeof navigator === "undefined"
      ? []
      : [
          ...(navigator.languages || []),
          navigator.language,
          (navigator as any).userLanguage,
        ];
  const candidates = [...navigatorLanguages, getStoredLanguage()];
  for (const candidate of candidates) {
    const supported = findSupportedLanguage(candidate);
    if (supported) {
      return supported;
    }
  }
  return defaultLang.code;
};
