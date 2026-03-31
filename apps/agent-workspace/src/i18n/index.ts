import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import zh from "./locales/zh";
import en from "./locales/en";
import id from "./locales/id";

const LANG_KEY = "nuychat.lang";
export const LANGS = [
  { code: "zh", label: "中文" },
  { code: "en", label: "English" },
  { code: "id", label: "Indonesia" }
] as const;

const SUPPORTED = LANGS.map((item) => item.code);

function detectLanguage(): string {
  const saved = localStorage.getItem(LANG_KEY);
  if (saved && (SUPPORTED as readonly string[]).includes(saved)) return saved;
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

export function getLocale(): string {
  const lang = i18next.language ?? "en";
  if (lang === "en") return "en-US";
  if (lang === "id") return "id-ID";
  return "zh-CN";
}

export default i18next;
