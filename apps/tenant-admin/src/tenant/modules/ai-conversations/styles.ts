// 作用: AI 会话监控三栏布局内联样式
// 菜单路径: 客户中心 -> AI 会话监控
// 作者：吴川

export const S = {
  root: {
    display: "flex",
    flexDirection: "column" as const,
    height: "calc(100vh - 104px)",
    margin: -24,
    background: "#fff",
    borderRadius: 10,
    overflow: "hidden"
  },
  filterBar: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 16px",
    borderBottom: "1px solid #f0f0f0",
    flexWrap: "wrap" as const,
    background: "#fafafa"
  },
  filterRight: {
    marginLeft: "auto",
    display: "flex",
    gap: 16,
    alignItems: "center",
    fontSize: 12,
    color: "#8c8c8c"
  },
  body: {
    display: "flex",
    flex: 1,
    minHeight: 0,
    overflow: "hidden"
  },
  // ── Left column ─────────────────────────────────────────────────────────
  leftCol: {
    width: 290,
    minWidth: 250,
    borderRight: "1px solid #f0f0f0",
    display: "flex",
    flexDirection: "column" as const,
    background: "#fafbfc"
  },
  listHeader: {
    padding: "10px 12px",
    borderBottom: "1px solid #f0f0f0",
    fontSize: 13,
    fontWeight: 600,
    color: "#555",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between"
  },
  listScroll: { flex: 1, overflowY: "auto" as const },
  listItem: (selected: boolean) => ({
    display: "flex",
    gap: 10,
    padding: "12px 14px",
    cursor: "pointer",
    background: selected ? "#e6f7ff" : "transparent",
    borderBottom: "1px solid #f5f5f5",
    transition: "background 0.15s"
  }),
  avatar: (risk: string) => ({
    width: 40,
    height: 40,
    borderRadius: "50%",
    background: risk === "high" ? "#fff1f0" : risk === "attention" ? "#fffbe6" : "#e6f7ff",
    color: risk === "high" ? "#cf1322" : risk === "attention" ? "#d48806" : "#1677ff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
    fontSize: 16,
    flexShrink: 0,
    border: risk === "high" ? "2px solid #ff4d4f" : risk === "attention" ? "2px solid #faad14" : "2px solid #91caff"
  }),
  listInfo: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column" as const, gap: 2 },
  listRow: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  listName: {
    fontWeight: 600, fontSize: 13, color: "#1f1f1f",
    overflow: "hidden" as const, textOverflow: "ellipsis" as const,
    whiteSpace: "nowrap" as const, maxWidth: 130
  },
  listTime: { fontSize: 11, color: "#bbb", whiteSpace: "nowrap" as const },
  listPreview: {
    fontSize: 12, color: "#8c8c8c",
    overflow: "hidden" as const, textOverflow: "ellipsis" as const,
    whiteSpace: "nowrap" as const
  },
  // ── Middle column ───────────────────────────────────────────────────────
  midCol: { flex: 1, display: "flex", flexDirection: "column" as const, minWidth: 0 },
  chatHeader: {
    padding: "10px 16px", borderBottom: "1px solid #f0f0f0",
    display: "flex", alignItems: "center", gap: 10, background: "#fff"
  },
  chatHeaderAvatar: {
    width: 36, height: 36, borderRadius: "50%", background: "#e6f7ff",
    color: "#1677ff", display: "flex", alignItems: "center", justifyContent: "center",
    fontWeight: 700, fontSize: 14, flexShrink: 0
  },
  chatScroll: { flex: 1, overflowY: "auto" as const, padding: "16px 20px", background: "#f5f7fa" },
  msgRow: (isOut: boolean) => ({
    display: "flex", flexDirection: "column" as const,
    alignItems: isOut ? ("flex-end" as const) : ("flex-start" as const),
    marginBottom: 12
  }),
  msgAttr: (isAI: boolean) => ({ fontSize: 11, color: isAI ? "#52c41a" : "#1677ff", marginBottom: 2, fontWeight: 500 }),
  msgBubble: (isOut: boolean, senderType: string) => ({
    maxWidth: "70%", padding: "8px 14px",
    borderRadius: isOut ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
    background: senderType === "ai" ? "#f0fdf4" : isOut ? "#1677ff" : "#fff",
    color: senderType === "ai" ? "#1f1f1f" : isOut ? "#fff" : "#1f1f1f",
    fontSize: 13, lineHeight: "1.6",
    boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
    wordBreak: "break-word" as const,
    border: senderType === "ai" ? "1px solid #b7eb8f" : isOut ? "none" : "1px solid #f0f0f0"
  }),
  msgTime: { fontSize: 10, color: "#bbb", marginTop: 3 },
  dateSep: { textAlign: "center" as const, margin: "12px 0", fontSize: 11, color: "#bbb" },
  chatEmpty: {
    display: "flex", flexDirection: "column" as const, alignItems: "center",
    justifyContent: "center", height: "100%", color: "#bbb", fontSize: 14, gap: 8
  },
  // ── Right column ────────────────────────────────────────────────────────
  rightCol: {
    width: 310, minWidth: 280, borderLeft: "1px solid #f0f0f0",
    display: "flex", flexDirection: "column" as const, overflowY: "auto" as const,
    background: "#fafbfc"
  },
  rightSection: { padding: "14px 16px", borderBottom: "1px solid #f0f0f0" },
  rightTitle: { fontSize: 13, fontWeight: 600, color: "#555", marginBottom: 10 },
  infoRow: { display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6, color: "#555" },
  actionBtnGroup: { display: "flex", flexDirection: "column" as const, gap: 8 },
  traceCard: {
    padding: "8px 10px", background: "#fff", border: "1px solid #f0f0f0",
    borderRadius: 8, marginBottom: 8, fontSize: 12
  }
};
