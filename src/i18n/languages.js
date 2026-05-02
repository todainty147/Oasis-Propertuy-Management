export const APP_LANGUAGES = [
  { code: "pl", labelKey: "lang.polish", flag: "🇵🇱", shortFlag: "PL" },
  { code: "en", labelKey: "lang.english", flag: "🇬🇧", shortFlag: "GB" },
  { code: "de", labelKey: "lang.german", flag: "🇩🇪", shortFlag: "DE" },
];

export function getLanguageFlag(code, { short = false } = {}) {
  const language = APP_LANGUAGES.find((item) => item.code === code) || APP_LANGUAGES[1];
  return short ? language.shortFlag : language.flag;
}
