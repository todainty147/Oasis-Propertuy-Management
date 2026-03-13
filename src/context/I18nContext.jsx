import { createContext, useContext, useMemo, useState } from "react";
import { messages } from "../i18n/messages";

const I18nContext = createContext(null);
const STORAGE_KEY = "oasis_lang";
const DEFAULT_LANG = "pl";

function getInitialLang() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && messages[raw]) return raw;
  } catch {
    // ignore localStorage failures
  }
  return DEFAULT_LANG;
}

function interpolate(template, vars = {}) {
  return String(template).replace(/\{(\w+)\}/g, (_, key) => {
    const v = vars[key];
    return v == null ? "" : String(v);
  });
}

export function I18nProvider({ children }) {
  const [lang, setLangRaw] = useState(getInitialLang);

  const setLang = (next) => {
    const safe = messages[next] ? next : DEFAULT_LANG;
    setLangRaw(safe);
    try {
      localStorage.setItem(STORAGE_KEY, safe);
    } catch {
      // ignore localStorage failures
    }
  };

  const t = (key, vars = {}) => {
    const dict = messages[lang] || {};
    const fallback = messages.en || {};
    const template = dict[key] ?? fallback[key] ?? key;
    return interpolate(template, vars);
  };

  const value = useMemo(
    () => ({ lang, setLang, t }),
    [lang]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}

