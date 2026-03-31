import i18next from "i18next";

export const QUICK_PHRASES = [
  "您好，我先帮您核对订单状态，请稍等。",
  "收到，我马上为您跟进并在 2 分钟内回复。",
  "抱歉让您久等了，我现在优先处理这个问题。"
];

export const AVAILABLE_SKILLS = [
  { code: "lookup_order", title: "查订单", desc: "查询订单状态、商品与金额信息" },
  { code: "track_shipment", title: "查物流", desc: "按运单号查询运输节点" },
  { code: "search_knowledge_base", title: "知识库检索", desc: "检索政策、退款、物流FAQ" },
  { code: "get_customer_info", title: "客户画像", desc: "读取客户标签、等级和历史会话" }
];

export type ChannelCapability = {
  supportsReply: boolean;
  supportsReaction: boolean;
  supportsSticker: boolean;
  supportsAttachments: boolean;
  accepts: string;
  maxAttachmentsPerSend: number;
  reactionOptions: string[];
};

const DEFAULT_CAPABILITY: ChannelCapability = {
  supportsReply: true,
  supportsReaction: true,
  supportsSticker: false,
  supportsAttachments: true,
  accepts: "image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.ppt,.pptx,.zip,.rar,.7z",
  maxAttachmentsPerSend: 10,
  reactionOptions: ["👍", "❤️", "😂", "😮", "😢", "🙏"]
};

const CHANNEL_CAPABILITIES: Record<string, ChannelCapability> = {
  whatsapp: {
    supportsReply: true,
    supportsReaction: true,
    supportsSticker: true,
    supportsAttachments: true,
    accepts: "image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.ppt,.pptx,.zip,.rar,.7z,.webp",
    maxAttachmentsPerSend: 10,
    reactionOptions: ["👍", "❤️", "😂", "😮", "😢", "🙏"]
  },
  web: DEFAULT_CAPABILITY,
  webhook: DEFAULT_CAPABILITY
};

export function getChannelCapability(channelType: string | null | undefined): ChannelCapability {
  if (!channelType) return DEFAULT_CAPABILITY;
  return CHANNEL_CAPABILITIES[channelType] ?? DEFAULT_CAPABILITY;
}

export type UploadValidationRule = {
  maxSizeBytes: number;
  mimePrefixes: string[];
  extensions?: string[];
};

const MB = 1024 * 1024;

export const WHATSAPP_UPLOAD_RULES = {
  sticker: { maxSizeBytes: 500 * 1024, mimePrefixes: ["image/webp"], extensions: [".webp"] },
  image: { maxSizeBytes: 5 * MB, mimePrefixes: ["image/"] },
  video: { maxSizeBytes: 16 * MB, mimePrefixes: ["video/"] },
  audio: { maxSizeBytes: 16 * MB, mimePrefixes: ["audio/"] },
  document: {
    maxSizeBytes: 100 * MB,
    mimePrefixes: [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument",
      "application/vnd.ms-excel",
      "application/vnd.ms-powerpoint",
      "text/csv",
      "text/plain",
      "application/zip",
      "application/x-rar-compressed",
      "application/x-7z-compressed"
    ],
    extensions: [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".csv", ".txt", ".zip", ".rar", ".7z"]
  }
} satisfies Record<string, UploadValidationRule>;

export function validateUploadForChannel(
  channelType: string | null | undefined,
  file: File,
  mode: "attachment" | "sticker" = "attachment"
): string | null {
  if (channelType !== "whatsapp") return null;
  const lowerName = file.name.toLowerCase();
  const rule: UploadValidationRule = mode === "sticker"
    ? WHATSAPP_UPLOAD_RULES.sticker
    : file.type.startsWith("image/")
      ? WHATSAPP_UPLOAD_RULES.image
      : file.type.startsWith("video/")
        ? WHATSAPP_UPLOAD_RULES.video
        : file.type.startsWith("audio/")
          ? WHATSAPP_UPLOAD_RULES.audio
          : WHATSAPP_UPLOAD_RULES.document;

  const prefixAllowed = rule.mimePrefixes.some((prefix) => file.type.startsWith(prefix));
  const extAllowed = !rule.extensions || rule.extensions.some((ext) => lowerName.endsWith(ext));
  if (!prefixAllowed && !extAllowed) {
    return mode === "sticker"
      ? i18next.t("validation.stickerOnlyWebp")
      : i18next.t("validation.unsupportedType");
  }
  if (file.size > rule.maxSizeBytes) {
    const size = Math.round(rule.maxSizeBytes / 1024 / 1024 * 10) / 10;
    return i18next.t("validation.fileTooLarge", { size });
  }
  return null;
}
