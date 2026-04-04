// 当前骨架：
// 外层三栏框架在 WorkspacePageFrame.tsx
// 消息页组装在 MessagesWorkspace.tsx
// 左栏会话列表在 InboxPanel.tsx
// 中栏消息区在 TimelinePanel.tsx
// 右栏上下文区在 RightPanel.tsx
import type { ReactNode } from "react";

type WorkspacePageFrameProps = {
  title?: string;
  description?: string;
  rightWidth: number;
  onStartResize: (e: React.MouseEvent) => void;
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
};

export function WorkspacePageFrame(props: WorkspacePageFrameProps) {
  const { title, description, rightWidth, onStartResize, left, center, right } = props;
  const hasHeader = Boolean(title || description);

  return (
    <section className="flex h-full min-h-0 flex-col bg-[radial-gradient(circle_at_top_left,#fbfdff_0%,#f4f7fb_48%,#eef3f8_100%)]">
      {hasHeader ? (
        <div className="border-b border-slate-200/80 bg-white/80 px-5 py-3 backdrop-blur">
          {title ? <div className="text-sm font-semibold text-slate-900">{title}</div> : null}
          {description ? <div className="mt-1 text-xs text-slate-500">{description}</div> : null}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 p-4">
        <div
          className="grid h-full min-h-0 gap-3"
          style={{ gridTemplateColumns: `var(--inbox-w) minmax(0, 1fr) 8px ${rightWidth}px` }}
        >
          <div className="min-h-0 overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/92 shadow-sm backdrop-blur">
            {left}
          </div>
          <div className="min-h-0 overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/94 shadow-sm backdrop-blur">
            {center}
          </div>
          <div className="resize-handle" onMouseDown={onStartResize} />
          <div className="min-h-0 overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/92 shadow-sm backdrop-blur">
            {right}
          </div>
        </div>
      </div>
    </section>
  );
}
