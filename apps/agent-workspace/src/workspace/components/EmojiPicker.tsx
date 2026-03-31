import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

// ── Emoji data ───────────────────────────────────────────────────────────────

const RECENT_KEY = "nuychat:emoji_recent";
const MAX_RECENT = 24;

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveRecent(emoji: string): string[] {
  const prev = loadRecent().filter((e) => e !== emoji);
  const next = [emoji, ...prev].slice(0, MAX_RECENT);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* noop */ }
  return next;
}

type Category = { id: string; label: string; icon: string; emojis: string[] };

const CATEGORY_DATA: Omit<Category, "label">[] = [
  {
    id: "smileys", icon: "😀", emojis: [
      "😀","😃","😄","😁","😆","😅","🤣","😂","🙂","🙃","😉","😊","😇","🥰","😍",
      "🤩","😘","😗","😚","😙","🥲","😋","😛","😜","🤪","😝","🤑","🤗","🤭","🤫",
      "🤔","🤐","🤨","😐","😑","😶","😏","😒","🙄","😬","🤥","😔","😪","🤤","😴",
      "😷","🤒","🤕","🤢","🤮","🤧","🥵","🥶","🥴","😵","🤯","🤠","🥳","🥸","😎",
      "🤓","🧐","😕","😟","🙁","☹️","😮","😯","😲","😳","🥺","😦","😧","😨","😰",
      "😥","😢","😭","😱","😖","😣","😞","😓","😩","😫","🥱","😤","😡","😠","🤬",
      "😈","👿","💀","☠️","💩","🤡","👹","👺","👻","👽","👾","🤖",
    ],
  },
  {
    id: "hands", icon: "👋", emojis: [
      "👋","🤚","🖐","✋","🖖","🤙","💪","🦾","✌️","🤞","🤟","🤘","👌","🤌","🤏",
      "👈","👉","👆","🖕","👇","☝️","👍","👎","✊","👊","🤛","🤜","👏","🙌","👐",
      "🤲","🤝","🙏","✍️","💅","🤳","🧖","💆","💇","🚶","🏃","💃","🕺","🧑‍🤝‍🧑",
      "👫","👬","👭","❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎",
    ],
  },
  {
    id: "animals", icon: "🐾", emojis: [
      "🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐸","🐵",
      "🙈","🙉","🙊","🐔","🐧","🐦","🦆","🦅","🦉","🦇","🐺","🐗","🐴","🦄","🐝",
      "🐛","🦋","🐌","🐞","🐜","🦗","🐢","🐍","🦎","🐙","🦑","🦐","🦞","🦀","🐡",
      "🐠","🐟","🐬","🐳","🐋","🦈","🐊","🐅","🐆","🦓","🦍","🐘","🦛","🦏","🐪",
      "🦒","🦘","🐃","🐄","🐎","🐖","🐏","🐑","🐕","🐩","🐈","🐓","🦃","🦚","🦜",
      "🦢","🦩","🕊","🐇","🦝","🦨","🦡","🦦","🦥","🐁","🐀","🐿","🦔",
      "🌵","🎄","🌲","🌳","🌴","🌱","🌿","☘️","🍀","🍃","🍂","🍁","🍄","🌾","💐",
      "🌷","🌺","🌸","🌼","🌻","🌞","🌝","🌛","🌜","🌟","⭐","💫","✨","🌈","🌊",
    ],
  },
  {
    id: "food", icon: "🍕", emojis: [
      "🍏","🍎","🍐","🍊","🍋","🍌","🍉","🍇","🍓","🫐","🍑","🥭","🍍","🥥","🥝",
      "🍅","🍆","🥑","🥦","🥬","🥒","🌽","🌶","🧄","🧅","🥔","🥐","🍞","🥖","🥨",
      "🧀","🥚","🍳","🥞","🧇","🥓","🍔","🍟","🌭","🍕","🌮","🌯","🥙","🧆","🍱",
      "🍘","🍙","🍚","🍛","🍜","🍝","🍣","🍤","🥟","🦪","🍦","🍧","🍨","🥧","🧁",
      "🎂","🍰","🍮","🍭","🍬","🍫","🍿","🍩","🍪","🌰","🥜","🍯","☕","🍵","🧋",
      "🍺","🍻","🥂","🍷","🥃","🍸","🍹","🧃","🥤","🍾","🫖","🥛","🍼",
    ],
  },
  {
    id: "activities", icon: "⚽", emojis: [
      "⚽","🏀","🏈","⚾","🥎","🎾","🏐","🏉","🎱","🏓","🏸","🏒","🥊","🥋","⛳",
      "🎣","🤿","🎿","⛷","🏂","🏋","🤼","🤸","⛹","🤺","🤾","🏌","🧘","🏄","🏊",
      "🚣","🧗","🚵","🚴","🏆","🥇","🥈","🥉","🏅","🎖","🎪","🎭","🎨","🎬","🎤",
      "🎧","🎼","🎹","🥁","🎷","🎺","🎸","🎻","🎲","🎯","🎳","🎮","🎰","🧩",
      "🎠","🎡","🎢","🎉","🎊","🎈","🎀","🎁","🎗","🎟","🎫","🏵",
    ],
  },
  {
    id: "travel", icon: "✈️", emojis: [
      "🚗","🚕","🚙","🚌","🚎","🏎","🚓","🚑","🚒","🚐","🛻","🚚","🚛","🚜","🏍",
      "🛵","🚲","🛴","🛹","✈️","🛩","🚁","🚀","🛸","⛵","🚤","🛥","🛳","🚢","⚓",
      "🗺","🏔","⛰","🌋","🏕","🏖","🏜","🏝","🏞","🏟","🏛","🏗","🏠","🏡","🏢",
      "🏣","🏤","🏥","🏦","🏨","🏩","🏪","🏫","🏬","🏭","🏯","🏰","💒","🗼","🗽",
      "⛪","🕌","⛩","🕋","⛲","🌁","🌃","🏙","🌄","🌅","🌆","🌇","🌉","🌌","🎑",
      "🌠","🎆","🎇","🗿","☀️","🌤","⛅","🌦","🌧","🌩","❄️","⛄","⚡","💥","🔥",
    ],
  },
  {
    id: "objects", icon: "💡", emojis: [
      "📱","💻","⌨️","🖥","🖱","💾","💿","📷","📸","📹","🎥","📞","☎️","📺","📻",
      "🧭","⏰","⌛","⏳","📡","🔋","🔌","💡","🔦","🕯","🔮","💊","💉","🩺","🔭",
      "🔬","🕶","💰","💳","💎","🎁","🎀","✉️","📧","📝","📌","📍","📎","✂️","🔒",
      "🔓","🔑","🗝","🔨","⚒","🛠","🔧","🔩","⚙️","🧸","🎭","🖼","🎨","🧵","🧶",
      "👒","🎩","🧢","👑","💍","💄","👓","🕶","👔","👗","👘","🥻","👙","👜","👝",
      "🎒","🧳","👞","👟","🥾","👠","👡","🩰","👢","🌂","☂️",
    ],
  },
  {
    id: "symbols", icon: "💯", emojis: [
      "❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣️","💕","💞","💓","💗",
      "💖","💘","💝","💟","♥️","💯","✅","❌","⭕","🆗","🆙","🆒","🆕","🆓","🆘",
      "❗","❕","❓","❔","⚠️","🚫","🔞","🔇","🔊","📢","📣","🔔","🔕","💤","💬",
      "💭","🗯","♻️","🔄","⬆️","⬇️","⬅️","➡️","↩️","↪️","▶️","⏸","⏹","⏺","⏭",
      "⏮","⏩","⏪","🔀","🔁","🔂","➕","➖","➗","✖️","💲","™️","©️","®️","🔱",
      "⚜️","🔰","🎵","🎶","🎼","🎤","📯","🥁","🪘","✨","⚡","💥","🔥","💧","💦",
    ],
  },
];

// ── Component ────────────────────────────────────────────────────────────────

type EmojiPickerProps = {
  onSelect: (emoji: string) => void;
  onClose: () => void;
};

export function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const { t } = useTranslation();
  const [activeCategory, setActiveCategory] = useState("smileys");
  const [search, setSearch] = useState("");
  const [recent, setRecent] = useState<string[]>(() => loadRecent());
  const pickerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const CATEGORIES: Category[] = CATEGORY_DATA.map((c) => ({
    ...c,
    label: t(`emoji.categories.${c.id}`),
  }));

  // Focus search on open
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Click-outside closes picker
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);

  const handleSelect = (emoji: string) => {
    const nextRecent = saveRecent(emoji);
    setRecent(nextRecent);
    onSelect(emoji);
  };

  // Shown emojis: search mode OR recent + category
  const shownCategory = activeCategory === "recent"
    ? { id: "recent", label: t("emoji.recentUsed"), icon: "🕐", emojis: recent }
    : CATEGORIES.find((c) => c.id === activeCategory) ?? CATEGORIES[0];

  const displayEmojis = search.trim()
    ? CATEGORIES.flatMap((c) => c.emojis)
    : shownCategory.emojis;

  // Combine categories list: prepend recent if any
  const visibleCategories: Category[] = [
    ...(recent.length > 0
      ? [{ id: "recent", label: t("emoji.recent"), icon: "🕐", emojis: recent }]
      : []),
    ...CATEGORIES,
  ];

  return (
    <div className="emoji-picker" ref={pickerRef}>
      {/* Search */}
      <div className="ep-search-wrap">
        <svg className="ep-search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          ref={searchRef}
          className="ep-search"
          placeholder={t("emoji.search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button type="button" className="ep-search-clear" onClick={() => setSearch("")}>✕</button>
        )}
      </div>

      {/* Category tabs */}
      {!search && (
        <div className="ep-tabs">
          {visibleCategories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className={`ep-tab${activeCategory === cat.id ? " active" : ""}`}
              title={cat.label}
              onClick={() => setActiveCategory(cat.id)}
            >
              {cat.icon}
            </button>
          ))}
        </div>
      )}

      {/* Category label */}
      <div className="ep-category-label">
        {search ? t("emoji.searchResults") : (visibleCategories.find((c) => c.id === activeCategory)?.label ?? "")}
      </div>

      {/* Emoji grid */}
      <div className="ep-grid">
        {displayEmojis.length === 0 ? (
          <div className="ep-empty">{t("emoji.empty")}</div>
        ) : (
          displayEmojis.map((emoji, i) => (
            <button
              key={`${emoji}-${i}`}
              type="button"
              className="ep-emoji-btn"
              onClick={() => handleSelect(emoji)}
              title={emoji}
            >
              {emoji}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
