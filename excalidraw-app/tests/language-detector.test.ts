import { getPreferredLanguage } from "../app-language/language-detector";

describe("language detector", () => {
  const originalLanguage = navigator.language;
  const originalLanguages = navigator.languages;

  const setNavigatorLanguages = (
    language: string,
    languages: readonly string[],
  ) => {
    Object.defineProperty(window.navigator, "language", {
      configurable: true,
      value: language,
    });
    Object.defineProperty(window.navigator, "languages", {
      configurable: true,
      value: languages,
    });
  };

  beforeEach(() => {
    window.localStorage.removeItem("i18nextLng");
  });

  afterEach(() => {
    window.localStorage.removeItem("i18nextLng");
    setNavigatorLanguages(originalLanguage, originalLanguages);
  });

  it("maps a regional Spanish browser locale to the supported Spanish locale", () => {
    setNavigatorLanguages("es-MX", ["es-MX", "en-US"]);

    expect(getPreferredLanguage()).toBe("es-ES");
  });

  it("uses the cached language only as a fallback after browser detection", () => {
    window.localStorage.setItem("i18nextLng", "de-DE");
    setNavigatorLanguages("xx-YY", ["xx-YY"]);

    expect(getPreferredLanguage()).toBe("de-DE");
  });

  it("falls back to English when the browser language is unsupported", () => {
    setNavigatorLanguages("xx-YY", ["xx-YY"]);

    expect(getPreferredLanguage()).toBe("en");
  });
});
