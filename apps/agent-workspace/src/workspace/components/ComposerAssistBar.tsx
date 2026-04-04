// Copilot 消息快捷操作模块
type ComposerAssistBarProps = {
  detailOpen: boolean;
  aiSuggestions: string[];
  isAssignedToMe: boolean;
  onReplyChange: (value: string) => void;
};

export function ComposerAssistBar(props: ComposerAssistBarProps) {
  const { detailOpen, aiSuggestions, isAssignedToMe, onReplyChange } = props;

  return (
    <div className="border-b border-slate-100/80 bg-slate-50/70">
      <div className="flex items-center gap-2 px-4 py-2">
        <span className="text-blue-500 text-[13px] leading-none">✦</span>
        <span className="text-xs font-semibold text-slate-600">Copilot</span>
        {detailOpen && aiSuggestions.length === 0 && (
          <span className="copilot-thinking">
            <span /><span /><span />
          </span>
        )}
      </div>

      {aiSuggestions.length > 0 && (
        <div className="flex flex-col gap-1.5 px-4 pb-3">
          {aiSuggestions.slice(0, 3).map((suggestion, index) => (
            <button
              key={suggestion}
              type="button"
              disabled={!isAssignedToMe}
              onClick={() => onReplyChange(suggestion)}
              style={{ animationDelay: `${index * 80}ms` }}
              className="group flex w-full items-start gap-2 rounded-2xl border border-slate-200/80 bg-white/90 px-3 py-2 text-left transition-colors hover:border-blue-200 hover:bg-blue-50/30 disabled:cursor-not-allowed disabled:opacity-50 [animation:slide-in-up_0.2s_ease_both]"
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
