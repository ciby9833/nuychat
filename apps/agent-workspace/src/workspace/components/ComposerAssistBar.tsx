import { useTranslation } from "react-i18next";

type ComposerAssistBarProps = {
  detailOpen: boolean;
  aiSuggestions: string[];
  isAssignedToMe: boolean;
  reply: string;
  onReplyChange: (value: string) => void;
};

// AI prompts are intentionally kept in Chinese — they are instructions sent to the AI model,
// not user-facing UI text, and the model is configured to process Chinese instructions.
const QUICK_TOOLS = [
  { key: "summary", prompt: "请先总结客户诉求，再给出下一步建议。" },
  { key: "polish",  prompt: "请将上文转换为更礼貌、简短的客服回复。" },
  { key: "translate", prompt: "请翻译为客户语言并保留业务术语。" }
] as const;

function appendPrompt(reply: string, prompt: string) {
  return `${reply.trim() ? `${reply}\n` : ""}${prompt}`;
}

export function ComposerAssistBar(props: ComposerAssistBarProps) {
  const { detailOpen, aiSuggestions, isAssignedToMe, reply, onReplyChange } = props;
  const { t } = useTranslation();

  return (
    <div className="bg-gradient-to-r from-slate-50 to-blue-50/30 border-b border-slate-100">
      {/* Header row */}
      <div className="flex items-center gap-2 px-3 py-1.5">
        <span className="text-blue-500 text-[13px] leading-none">✦</span>
        <span className="text-xs font-semibold text-slate-600">Copilot</span>
        {detailOpen && aiSuggestions.length === 0 && (
          <span className="copilot-thinking">
            <span /><span /><span />
          </span>
        )}
        <div className="flex items-center gap-1 ml-auto">
          {QUICK_TOOLS.map((tool) => (
            <button
              key={tool.key}
              type="button"
              title={t(`composer.tools.${tool.key}Title`)}
              onClick={() => onReplyChange(appendPrompt(reply, tool.prompt))}
              className="h-6 px-2 rounded text-[11px] font-medium text-slate-500 hover:text-slate-800 hover:bg-white hover:shadow-sm transition-all"
            >
              {t(`composer.tools.${tool.key}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Suggestions — vertical stacked cards */}
      {aiSuggestions.length > 0 && (
        <div className="flex flex-col gap-1.5 px-3 pb-2.5">
          {aiSuggestions.slice(0, 3).map((suggestion, index) => (
            <button
              key={suggestion}
              type="button"
              disabled={!isAssignedToMe}
              onClick={() => onReplyChange(suggestion)}
              style={{ animationDelay: `${index * 80}ms` }}
              className="group flex items-start gap-2 w-full text-left rounded-lg bg-white border border-blue-100 hover:border-blue-300 hover:bg-blue-50/40 px-3 py-2 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed [animation:slide-in-up_0.2s_ease_both]"
              title={suggestion}
            >
              <span className="shrink-0 mt-0.5 text-[10px] font-bold text-blue-400 group-hover:text-blue-500">#{index + 1}</span>
              <span className="flex-1 text-xs text-slate-700 leading-relaxed line-clamp-2">{suggestion}</span>
              <span className="shrink-0 text-xs text-blue-300 group-hover:text-blue-500 transition-colors">↩</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
