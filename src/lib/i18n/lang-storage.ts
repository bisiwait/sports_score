import { LANGS, type Lang } from "@/lib/i18n/dictionary";

const STORAGE_KEY = "sports_score_locale";

function isLang(raw: string | null): raw is Lang {
  return raw !== null && (LANGS as readonly string[]).includes(raw);
}

export function readStoredLang(): Lang {
  if (typeof window === "undefined") return "ja";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isLang(raw) ? raw : "ja";
  } catch {
    return "ja";
  }
}

export function writeStoredLang(lang: Lang): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* ignore */
  }
}
