"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { DICTIONARY, type Lang } from "@/lib/i18n/dictionary";
import { readStoredLang, writeStoredLang } from "@/lib/i18n/lang-storage";

type I18nContextValue = {
  /** 現在の UI 言語 */
  lang: Lang;
  /** 即座に状態と localStorage を更新 */
  setLang: (next: Lang) => void;
  /** 辞書参照。未定義キーはキー文字列／日本語へのフォールバック */
  t: (key: string) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("ja");

  useLayoutEffect(() => {
    setLangState(readStoredLang());
  }, []);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    writeStoredLang(next);
  }, []);

  useLayoutEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = lang;
    }
  }, [lang]);

  const t = useCallback(
    (key: string) => {
      const cur = DICTIONARY[lang][key];
      if (cur !== undefined) return cur;
      const fallback = DICTIONARY.ja[key];
      return fallback ?? key;
    },
    [lang]
  );

  const value = useMemo(
    () => ({ lang, setLang, t }),
    [lang, setLang, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return ctx;
}
