import en from "@/locales/en.json";
import es from "@/locales/es.json";
import ja from "@/locales/ja.json";
import ru from "@/locales/ru.json";
import th from "@/locales/th.json";

export const LANGS = ["ja", "en", "es", "ru", "th"] as const;
export type Lang = (typeof LANGS)[number];

/** JSON のキーをそのまま t('settings.title') 形式で参照する */
export const DICTIONARY: Record<Lang, Record<string, string>> = {
  ja: ja as Record<string, string>,
  en: en as Record<string, string>,
  es: es as Record<string, string>,
  ru: ru as Record<string, string>,
  th: th as Record<string, string>,
};
