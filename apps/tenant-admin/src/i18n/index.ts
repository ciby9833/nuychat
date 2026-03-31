import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import zhCN from "antd/locale/zh_CN";
import enUS from "antd/locale/en_US";
import idID from "antd/locale/id_ID";
import type { Locale } from "antd/lib/locale";

import zh from "./locales/zh/index";
import en from "./locales/en/index";
import id from "./locales/id/index";

const LANG_KEY = "nuychat.lang";
export const LANGS = [
  { key: "zh", label: "中文" },
  { key: "en", label: "English" },
  { key: "id", label: "Indonesia" }
] as const;

const SUPPORTED = LANGS.map((item) => item.key);
type Lang = (typeof LANGS)[number]["key"];

function detectLanguage(): Lang {
  const saved = localStorage.getItem(LANG_KEY);
  if (saved && (SUPPORTED as readonly string[]).includes(saved)) return saved as Lang;
  const browser = navigator.language.toLowerCase();
  if (browser.startsWith("zh")) return "zh";
  if (browser.startsWith("en")) return "en";
  if (browser.startsWith("id")) return "id";
  return "en";
}

void i18next.use(initReactI18next).init({
  lng: detectLanguage(),
  fallbackLng: "en",
  resources: {
    zh: { translation: zh },
    en: { translation: en },
    id: { translation: id }
  },
  interpolation: { escapeValue: false }
});

export function changeLanguage(lang: string): void {
  localStorage.setItem(LANG_KEY, lang);
  void i18next.changeLanguage(lang);
}

export function getAntdLocale(): Locale {
  const lang = i18next.language ?? "en";
  if (lang === "en") return enUS;
  if (lang === "id") return idID;
  return zhCN;
}

export default i18next;
