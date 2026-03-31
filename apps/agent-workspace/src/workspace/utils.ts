import i18next from "i18next";
import { getLocale } from "../i18n";

export function statusLabel(v: string): string {
  return i18next.t(`utils.convStatus.${v}`, { defaultValue: v });
}

export function sentimentLabel(v: string): string {
  return i18next.t(`utils.sentiment.${v}`, { defaultValue: v });
}

export function intentLabel(v: string): string {
  return i18next.t(`utils.intent.${v}`, { defaultValue: v });
}

export function shortTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString(getLocale());
}

/** Returns a locale-aware date group label: Today / Yesterday / weekday / M/D / Y/M/D */
export function dateGroupLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86_400_000);
  const itemDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (itemDay.getTime() === today.getTime()) return i18next.t("utils.today");
  if (itemDay.getTime() === yesterday.getTime()) return i18next.t("utils.yesterday");

  const locale = getLocale();
  const diffDays = Math.floor((today.getTime() - itemDay.getTime()) / 86_400_000);
  if (diffDays < 7) {
    return new Intl.DateTimeFormat(locale, { weekday: "short" }).format(d);
  }
  if (d.getFullYear() === now.getFullYear()) {
    return new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric" }).format(d);
  }
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "numeric", day: "numeric" }).format(d);
}

/** Short timestamp for inbox list items */
export function listTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86_400_000);
  const itemDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const locale = getLocale();

  if (itemDay.getTime() === today.getTime()) {
    return d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  if (itemDay.getTime() === yesterday.getTime()) return i18next.t("utils.yesterday");
  const diffDays = Math.floor((today.getTime() - itemDay.getTime()) / 86_400_000);
  if (diffDays < 7) {
    return new Intl.DateTimeFormat(locale, { weekday: "short" }).format(d);
  }
  if (d.getFullYear() === now.getFullYear()) {
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }
  return `${String(d.getFullYear()).slice(2)}/${d.getMonth() + 1}/${d.getDate()}`;
}

/** HH:mm bubble timestamp */
export function bubbleTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(getLocale(), { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** Full date + time for message attribution: YYYY/MM/DD HH:mm:ss */
export function fullTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Returns date separator label when messages cross a date boundary, null otherwise */
export function messageDateSeparator(
  prev: { created_at: string } | null,
  curr: { created_at: string }
): string | null {
  const currLabel = dateGroupLabel(curr.created_at);
  if (!prev) return currLabel;
  const prevLabel = dateGroupLabel(prev.created_at);
  return prevLabel !== currLabel ? currLabel : null;
}

export function mockSla(iso: string): string {
  const start = new Date(iso).getTime();
  if (Number.isNaN(start)) return "--:--";
  const seconds = Math.max(0, Math.floor((start + 15 * 60 * 1000 - Date.now()) / 1000));
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}
