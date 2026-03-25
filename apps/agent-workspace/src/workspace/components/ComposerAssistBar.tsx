type ComposerAssistBarProps = {
  detailOpen: boolean;
  aiSuggestions: string[];
  isAssignedToMe: boolean;
  reply: string;
  onReplyChange: (value: string) => void;
};

const QUICK_TOOLS = [
  { label: "摘要", title: "总结客户诉求", prompt: "请先总结客户诉求，再给出下一步建议。" },
  { label: "润色", title: "润色当前草稿", prompt: "请将上文转换为更礼貌、简短的客服回复。" },
  { label: "翻译", title: "翻译为客户语言", prompt: "请翻译为客户语言并保留业务术语。" }
] as const;

function appendPrompt(reply: string, prompt: string) {
  return `${reply.trim() ? `${reply}\n` : ""}${prompt}`;
}

export function ComposerAssistBar(props: ComposerAssistBarProps) {
  const {
    detailOpen,
    aiSuggestions,
    isAssignedToMe,
    reply,
    onReplyChange
  } = props;

  return (
    <div className="copilot-bar">
      <div className="copilot-bar-header">
        <span className="copilot-icon">✦</span>
        <span className="copilot-bar-title">Copilot</span>
        {detailOpen && aiSuggestions.length === 0 && (
          <span className="copilot-thinking">
            <span /><span /><span />
          </span>
        )}
        <div className="copilot-quick-tools">
          {QUICK_TOOLS.map((tool) => (
            <button
              key={tool.label}
              type="button"
              className="tool-btn"
              title={tool.title}
              onClick={() => onReplyChange(appendPrompt(reply, tool.prompt))}
            >
              {tool.label}
            </button>
          ))}
        </div>
      </div>

      {aiSuggestions.length > 0 && (
        <div className="copilot-suggestions">
          {aiSuggestions.slice(0, 3).map((suggestion, index) => (
            <button
              key={suggestion}
              type="button"
              className="suggestion-card"
              style={{ animationDelay: `${index * 80}ms` }}
              onClick={() => onReplyChange(suggestion)}
              disabled={!isAssignedToMe}
              title={suggestion}
            >
              <span className="suggestion-text">{suggestion}</span>
              <span className="suggestion-use">↩</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
