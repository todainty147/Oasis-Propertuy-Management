import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { messages } from "../i18n/messages";

const I18nContext = createContext(null);
const STORAGE_KEY = "oasis_lang";
const DEFAULT_LANG = "en";

function normalizeSupportedLang(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  if (messages[normalized]) return normalized;
  const base = normalized.split(/[-_]/)[0];
  return messages[base] ? base : "";
}

function getSystemLang() {
  if (typeof navigator === "undefined") return "";
  const candidates = Array.isArray(navigator.languages) ? navigator.languages : [];
  for (const candidate of [...candidates, navigator.language, navigator.userLanguage]) {
    const supported = normalizeSupportedLang(candidate);
    if (supported) return supported;
  }
  return "";
}

function getInitialLang() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const stored = normalizeSupportedLang(raw);
    if (stored) return stored;
  } catch {
    // ignore localStorage failures
  }
  return getSystemLang() || DEFAULT_LANG;
}

function interpolate(template, vars = {}) {
  return String(template).replace(/\{(\w+)\}/g, (_, key) => {
    const v = vars[key];
    return v == null ? "" : String(v);
  });
}

export function I18nProvider({ children }) {
  const [lang, setLangRaw] = useState(getInitialLang);

  const setLang = useCallback((next) => {
    const safe = normalizeSupportedLang(next) || DEFAULT_LANG;
    setLangRaw(safe);
    try {
      localStorage.setItem(STORAGE_KEY, safe);
    } catch {
      // ignore localStorage failures
    }
  }, []);

  const t = useCallback((key, vars = {}) => {
    const dict = messages[lang] || {};
    const fallback = messages.en || {};
    const template = dict[key] ?? fallback[key] ?? key;
    return interpolate(template, vars);
  }, [lang]);

  const value = useMemo(
    () => ({ lang, setLang, t }),
    [lang, setLang, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}
