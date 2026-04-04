/**
 * 菜单路径与名称: 座席工作台 / 会话详情 / 技能辅助卡片
 * 文件职责: 展示自动或手动触发的技能辅助结果，并支持复制结果、插入回复、查看物流时间线。
 * 主要交互文件:
 * - ./MessageComposer.tsx: 在输入框上方展示技能辅助卡片，并把结果插入回复框。
 * - ./TimelinePanel.tsx: 在手动技能执行弹窗内复用此卡片展示结果。
 * - ../hooks/useWorkspaceDashboard.ts: 负责加载技能辅助数据并传入标题、状态、结果。
 * - ../types.ts: 提供 ComposerSkillAssist 类型。
 */

import i18next from "i18next";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { ComposerSkillAssist } from "../types";

type SkillAssistCardProps = {
  assist: ComposerSkillAssist;
  disabled?: boolean;
  onInsert: (value: string) => void;
};

export function SkillAssistCard(props: SkillAssistCardProps) {
  const { assist, disabled, onInsert } = props;
  const { t } = useTranslation();
  const model = useMemo(() => buildSkillAssistDisplayModel(assist), [assist]);
  const defaultCollapsed = shouldStartCollapsed(assist, model);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  useEffect(() => {
    setCollapsed(defaultCollapsed);
  }, [assist.sourceMessageId, assist.skillName, assist.status, defaultCollapsed]);

  if (!shouldRenderSkillAssist(model, assist)) {
    return null;
  }

  const copyText = buildSkillAssistCopyText(assist, model);

  const handleCopy = async () => {
    if (!copyText) return;
    await navigator.clipboard.writeText(copyText).catch(() => null);
  };

  return (
    <div className="mx-4 mt-3 mr-auto max-w-[calc(100%-32px)] rounded-[22px] border border-emerald-100/70 bg-emerald-50/55 px-3.5 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-emerald-700">{assist.title}</div>
          <div className="mt-1 text-[11px] text-slate-500 line-clamp-2">
            {t("skillAssist.sourceMessage")} {assist.sourceMessagePreview}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            className="h-7 rounded-full border border-emerald-200/80 bg-white/90 px-2.5 text-xs text-slate-600 hover:bg-emerald-50"
          >
            {collapsed ? t("skillAssist.expand") : t("skillAssist.collapse")}
          </button>
          <button
            type="button"
            onClick={() => { void handleCopy(); }}
            disabled={!copyText}
            className="h-7 rounded-full border border-emerald-200/80 bg-white/90 px-2.5 text-xs text-slate-600 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("skillAssist.copy")}
          </button>
          <button
            type="button"
            onClick={() => onInsert(copyText)}
            disabled={!copyText || disabled}
            className="h-7 rounded-full bg-emerald-600 px-2.5 text-xs text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("skillAssist.insertReply")}
          </button>
        </div>
      </div>

      {collapsed && assist.status === "ready" ? (
        <div className="mt-2">
          <div className="rounded-2xl border border-emerald-100/70 bg-white/88 px-3 py-2.5">
            {renderCollapsedPreview(model)}
          </div>
        </div>
      ) : null}

      {collapsed ? null : (
        <>
          {assist.status === "loading" ? (
            <div className="mt-2 text-xs text-emerald-700">{t("skillAssist.loading")}</div>
          ) : null}

          {assist.status === "error" ? (
            <div className="mt-2 text-xs text-red-600">
              {t("skillAssist.error", { error: assist.error ?? "unknown_error" })}
            </div>
          ) : null}

          {assist.status === "ready" ? (
            <div className="mt-2 grid gap-1.5">
              {model.primary ? (
                <div className="rounded-2xl border border-emerald-100/70 bg-white/90 px-3 py-2.5">
                  <div className="text-xs text-slate-700 whitespace-pre-wrap break-words">{model.primary}</div>
                </div>
              ) : null}

              {model.timeline.length > 0 ? (
                <div className="overflow-hidden rounded-2xl border border-emerald-100/70">
                  <div className="bg-emerald-50/75 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                    {t("skillAssist.timelineTitle")}
                  </div>
                  <div className="divide-y divide-emerald-50/80">
                    {model.timeline.map((event, index) => (
                      <div key={index} className="flex gap-3 bg-white/85 px-3 py-2.5">
                        <div className="flex flex-col items-center pt-0.5 shrink-0">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          {index < model.timeline.length - 1 ? (
                            <div className="w-px flex-1 bg-emerald-100 mt-1" />
                          ) : null}
                        </div>
                        <div className="min-w-0 flex-1 pb-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {event.status ? (
                              <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5">
                                {event.status}
                              </span>
                            ) : null}
                            {event.time ? (
                              <span className="text-[10px] text-slate-400">{event.time}</span>
                            ) : null}
                            {event.location ? (
                              <span className="text-[10px] text-slate-500">📍 {event.location}</span>
                            ) : null}
                          </div>
                          {event.description ? (
                            <div className="mt-1 text-xs text-slate-600 break-words">{event.description}</div>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {model.fields.map((field) => (
                <div key={field.label} className="rounded-2xl border border-emerald-100/70 bg-white/85 px-3 py-2.5">
                  <div className="text-[10px] uppercase tracking-wide text-emerald-700/80">{field.label}</div>
                  <div className="mt-1 text-xs text-slate-700 whitespace-pre-wrap break-words">{field.value}</div>
                </div>
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

type TimelineEvent = {
  time?: string;
  status?: string;
  description?: string;
  location?: string;
};

type DisplayModel = {
  primary: string;
  meta: Array<{ label: string; value: string }>;
  fields: Array<{ label: string; value: string }>;
  timeline: TimelineEvent[];
};

function shouldStartCollapsed(assist: ComposerSkillAssist, model: DisplayModel) {
  if (assist.status !== "ready") return false;
  if (model.timeline.length > 0) return true;
  if (model.fields.length > 1) return true;
  if ((model.primary ?? "").length > 140) return true;
  return false;
}

function renderCollapsedPreview(model: DisplayModel) {
  if (model.primary) {
    return (
      <div className="text-xs leading-6 text-slate-700 whitespace-pre-wrap break-words line-clamp-3">
        {model.primary}
      </div>
    );
  }

  const firstEvent = model.timeline[0];
  if (firstEvent) {
    return (
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {firstEvent.status ? (
            <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
              {firstEvent.status}
            </span>
          ) : null}
          {firstEvent.time ? (
            <span className="text-[10px] text-slate-400">{firstEvent.time}</span>
          ) : null}
          {firstEvent.location ? (
            <span className="text-[10px] text-slate-500">📍 {firstEvent.location}</span>
          ) : null}
        </div>
        {firstEvent.description ? (
          <div className="mt-1 line-clamp-2 text-xs leading-6 text-slate-600 break-words">
            {firstEvent.description}
          </div>
        ) : null}
      </div>
    );
  }

  const firstField = model.fields[0];
  if (firstField) {
    return (
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-emerald-700/80">{firstField.label}</div>
        <div className="mt-1 line-clamp-2 text-xs leading-6 text-slate-700 whitespace-pre-wrap break-words">
          {firstField.value}
        </div>
      </div>
    );
  }

  return null;
}

const SUPPRESSED_RESULT_KEYS = new Set([
  "status", "customerReply", "message", "missingInputs",
  "scriptKey", "scriptName", "runtime", "stderr", "_async",
  "code", "msg", "data", "rawResponseCode", "raw_response_code",
  "provider",
  "billCodes", "bill_codes", "trackingNumber", "tracking_number",
  "waybillNumber", "waybill_number", "orderId", "order_id", "query",
  "latestStatus", "latest_status",
  "latestTime", "latest_time",
  "latestLocation", "latest_location",
  "totalEvents", "total_events",
  "events", "eventList", "event_list",
  "timeline"
]);

function shouldRenderSkillAssist(model: DisplayModel, assist: ComposerSkillAssist) {
  if (assist.status === "loading" || assist.status === "error") return true;
  return Boolean(model.primary || model.fields.length > 0 || model.timeline.length > 0);
}

function buildSkillAssistDisplayModel(assist: ComposerSkillAssist): DisplayModel {
  const result = assist.result ?? {};

  if (assist.status !== "ready") {
    return { primary: "", meta: [], fields: [], timeline: [] };
  }

  const status = typeof result.status === "string" ? result.status : "";
  const customerReply = typeof result.customerReply === "string" ? result.customerReply.trim() : "";
  const message = typeof result.message === "string" ? result.message.trim() : "";
  const missingInputs = Array.isArray(result.missingInputs)
    ? result.missingInputs.map((item) => humanizeResultKey(String(item)))
    : [];

  const timeline: TimelineEvent[] = Array.isArray(result.timeline)
    ? (result.timeline as unknown[])
        .filter((event): event is Record<string, unknown> =>
          Boolean(event && typeof event === "object" && !Array.isArray(event))
        )
        .map((event) => ({
          time: typeof event.time === "string" && event.time ? event.time : undefined,
          status: typeof event.status === "string" && event.status ? event.status : undefined,
          description: typeof event.description === "string" && event.description ? event.description : undefined,
          location: typeof event.location === "string" && event.location ? event.location : undefined
        }))
        .filter((event) => event.status || event.description)
    : [];

  const primary = customerReply || message || (status === "need_input" ? i18next.t("skillAssist.needInput") : "");
  const fields: Array<{ label: string; value: string }> = [];

  if (status && status !== "ok") {
    fields.push({ label: i18next.t("skillAssist.status"), value: humanizeResultKey(status) });
  }
  if (missingInputs.length > 0) {
    fields.push({ label: i18next.t("skillAssist.missingFields"), value: missingInputs.join(", ") });
  }

  if (!primary && timeline.length === 0) {
    const response = result.response && typeof result.response === "object" && !Array.isArray(result.response)
      ? result.response as Record<string, unknown>
      : null;
    const data = result.data && typeof result.data === "object" && !Array.isArray(result.data)
      ? result.data as Record<string, unknown>
      : null;
    const businessSource = response ?? data;

    const businessEntries = businessSource
      ? Object.entries(businessSource)
          .filter(([key, value]) => value !== null && value !== undefined && value !== "" && !SUPPRESSED_RESULT_KEYS.has(key))
          .slice(0, 8)
          .map(([key, value]) => ({ label: humanizeResultKey(key), value: formatSkillResultValue(value) }))
      : Object.entries(result)
          .filter(([key, value]) => value !== null && value !== undefined && value !== "" && !SUPPRESSED_RESULT_KEYS.has(key))
          .slice(0, 8)
          .map(([key, value]) => ({ label: humanizeResultKey(key), value: formatSkillResultValue(value) }));

    fields.push(...businessEntries);
  }

  return { primary, meta: [], fields, timeline };
}

function buildSkillAssistCopyText(assist: ComposerSkillAssist, model: DisplayModel) {
  if (assist.status !== "ready") return "";
  const timelineText = model.timeline
    .map((event) =>
      [event.time, event.status, event.description, event.location ? `📍 ${event.location}` : ""]
        .filter(Boolean)
        .join(" · ")
    )
    .join("\n");

  return [
    assist.title,
    model.primary,
    timelineText,
    ...model.fields.map((item) => `${item.label}: ${item.value}`)
  ].filter(Boolean).join("\n").trim();
}

function humanizeResultKey(key: string) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
}

function formatSkillResultValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (item && typeof item === "object") {
          return Object.entries(item as Record<string, unknown>)
            .map(([nestedKey, nestedValue]) => `${humanizeResultKey(nestedKey)}: ${String(nestedValue ?? "")}`)
            .join(" | ");
        }
        return String(item);
      })
      .join("\n");
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([nestedKey, nestedValue]) => `${humanizeResultKey(nestedKey)}: ${String(nestedValue ?? "")}`)
      .join("\n");
  }
  return String(value);
}
