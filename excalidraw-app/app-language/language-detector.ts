import { languages } from "@excalidraw/excalidraw";
import LanguageDetector from "i18next-browser-languagedetector";

export const languageDetector = new LanguageDetector();

languageDetector.init({
  languageUtils: {},
});

export const getPreferredLanguage = () => {
  const browserLang = navigator.language || (navigator as any).userLanguage || "";
  if (browserLang.toLowerCase().startsWith("es")) {
    return languages.find((lang) => lang.code === "es-ES")?.code || "en";
  }
  return "en";
};
