export function statusLabel(v: string): string {
  return {
    open: "进行中",
    queued: "排队中",
    bot_active: "AI处理中",
    human_active: "人工处理中",
    resolved: "已解决"
  }[v] ?? v;
}

export function sentimentLabel(v: string): string {
  return {
    positive: "积极",
    neutral: "中性",
    negative: "负面",
    angry: "愤怒"
  }[v] ?? v;
}

export function intentLabel(v: string): string {
  return {
    order_inquiry: "订单查询",
    delivery_inquiry: "物流查询",
    refund_request: "退款",
    cancellation: "取消",
    complaint: "投诉",
    payment_inquiry: "付款",
    general_inquiry: "咨询"
  }[v] ?? v;
}

export function shortTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}

/** Returns a Chinese date group label: 今天 / 昨天 / 周X / M月D日 / YYYY年M月D日 */
export function dateGroupLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86_400_000);
  const itemDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (itemDay.getTime() === today.getTime()) return "今天";
  if (itemDay.getTime() === yesterday.getTime()) return "昨天";

  const diffDays = Math.floor((today.getTime() - itemDay.getTime()) / 86_400_000);
  if (diffDays < 7) {
    return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][d.getDay()];
  }
  if (d.getFullYear() === now.getFullYear()) {
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  }
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

/** Short timestamp for inbox list items (HH:mm today / 昨天 / 周X / M/D) */
export function listTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86_400_000);
  const itemDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (itemDay.getTime() === today.getTime()) {
    return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  if (itemDay.getTime() === yesterday.getTime()) return "昨天";
  const diffDays = Math.floor((today.getTime() - itemDay.getTime()) / 86_400_000);
  if (diffDays < 7) {
    return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][d.getDay()];
  }
  if (d.getFullYear() === now.getFullYear()) {
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }
  return `${String(d.getFullYear()).slice(2)}/${d.getMonth() + 1}/${d.getDate()}`;
}

/** HH:mm bubble timestamp (shown below message bubbles) */
export function bubbleTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
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
