/**
 * 菜单路径与名称: 平台配置 -> AI 能力 -> 新建/编辑能力
 * 文件职责: 提供 AI 能力的新建与编辑抽屉，按 Skill Package 结构分步维护 Metadata / SKILL.md / FORMS.md / REFERENCE.md / scripts。
 * 主要交互文件:
 * - ../pages/CapabilityRegistryPage.tsx: 控制弹窗打开、关闭与提交。
 * - ../components/editor/*: 承载每一步的表单区块。
 * - ../types.ts: 提供详情与提交类型。
 */
import { Button, Drawer, Form, Space, Steps, message } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { CapabilityFormsMarkdownSection } from "../components/editor/CapabilityFormsMarkdownSection";
import { CapabilityMetadataSection } from "../components/editor/CapabilityMetadataSection";
import { CapabilityReferenceMarkdownSection } from "../components/editor/CapabilityReferenceMarkdownSection";
import { CapabilityScriptsSection } from "../components/editor/CapabilityScriptsSection";
import { CapabilitySkillMarkdownSection } from "../components/editor/CapabilitySkillMarkdownSection";
import type { CapabilityRegistryDetail, CapabilityRegistryInput } from "../types";

type Props = {
  open: boolean;
  loading?: boolean;
  mode: "create" | "edit";
  initialValue?: CapabilityRegistryDetail | null;
  onCancel: () => void;
  onSubmit: (input: CapabilityRegistryInput) => Promise<void>;
};

type FormShape = Omit<CapabilityRegistryInput, "scripts"> & {
  scripts?: Array<{
    scriptKey: string;
    name: string;
    fileName?: string | null;
    language?: string | null;
    sourceCode: string;
    requirements?: string[];
    envBindings?: Array<{
      envKey: string;
      envValue: string;
    }>;
    enabled?: boolean;
  }>;
};

/** Fields required per step for validation before advancing */
const STEP_FIELDS: string[][] = [
  ["name", "code"],
  ["skillMarkdown"],
  ["formsMarkdown"],
  ["referenceMarkdown"],
  ["scripts"]
];

function normalizeSubmitInput(values: FormShape): CapabilityRegistryInput {
  return {
    ...values,
    scripts: Array.isArray(values.scripts)
      ? values.scripts.map((script) => ({
          scriptKey: script.scriptKey,
          name: script.name,
          fileName: script.fileName,
          language: script.language,
          sourceCode: script.sourceCode,
          requirements: Array.isArray(script.requirements)
            ? script.requirements.map((entry) => String(entry).trim()).filter(Boolean)
            : [],
          envBindings: Array.isArray(script.envBindings)
            ? script.envBindings
                .filter((entry) => entry && typeof entry.envKey === "string" && entry.envKey.trim())
                .map((entry) => ({
                  envKey: entry.envKey.trim(),
                  envValue: typeof entry.envValue === "string" ? entry.envValue : ""
                }))
            : [],
          enabled: script.enabled !== false
        }))
      : []
  };
}

export function CapabilityEditModal({ open, loading = false, mode, initialValue, onCancel, onSubmit }: Props) {
  const { t } = useTranslation();
  const [form] = Form.useForm<FormShape>();
  const [step, setStep] = useState(0);
  const stepItems = [
    { title: t("aiCapabilities.modal.basicInfo") },
    { title: t("aiCapabilities.modal.skill") },
    { title: t("aiCapabilities.modal.forms") },
    { title: t("aiCapabilities.modal.reference") },
    { title: t("aiCapabilities.modal.scripts") }
  ];

  const goNext = async () => {
    try {
      await form.validateFields(STEP_FIELDS[step]);
      setStep((s) => Math.min(s + 1, stepItems.length - 1));
    } catch {
      // validation errors shown inline
    }
  };

  const goPrev = () => setStep((s) => Math.max(s - 1, 0));

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      await onSubmit(normalizeSubmitInput(values));
    } catch {
      void message.warning(t("aiCapabilities.modal.validationWarning"));
    }
  };

  const isLast = step === stepItems.length - 1;

  return (
    <Drawer
      title={mode === "create" ? t("aiCapabilities.modal.createTitle") : t("aiCapabilities.modal.editTitle")}
      open={open}
      onClose={onCancel}
      destroyOnClose
      width={800}
      afterOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setStep(0);
          return;
        }
        form.setFieldsValue(initialValue
          ? {
              code: initialValue.code,
              name: initialValue.name,
              description: initialValue.description ?? "",
              category: initialValue.category,
              status: initialValue.status,
              skillMarkdown: initialValue.skillMarkdown,
              formsMarkdown: initialValue.formsMarkdown,
              referenceMarkdown: initialValue.referenceMarkdown,
              scripts: initialValue.scripts.map((script) => ({
                scriptKey: script.scriptKey,
                name: script.name,
                fileName: script.fileName,
                language: script.language,
                sourceCode: script.sourceCode,
                requirements: script.requirements,
                envBindings: script.envBindings,
                enabled: script.enabled
              }))
            }
          : {
              code: "",
              name: "",
              description: "",
              category: "general",
              status: "active",
              skillMarkdown: "",
              formsMarkdown: "",
              referenceMarkdown: "",
              scripts: []
            });
      }}
      footer={
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <Button onClick={onCancel}>{t("aiCapabilities.modal.cancel")}</Button>
          <Space>
            {step > 0 ? <Button onClick={goPrev}>{t("aiCapabilities.modal.prev")}</Button> : null}
            {isLast ? (
              <Button type="primary" loading={loading} onClick={() => { void handleSubmit(); }}>
                {mode === "create" ? t("aiCapabilities.modal.createConfirm") : t("aiCapabilities.modal.saveConfirm")}
              </Button>
            ) : (
              <Button type="primary" onClick={() => { void goNext(); }}>{t("aiCapabilities.modal.next")}</Button>
            )}
          </Space>
        </div>
      }
    >
      <Steps current={step} items={stepItems} size="small" style={{ marginBottom: 24 }} onChange={(v) => setStep(v)} />
      <Form form={form} layout="vertical">
        <div style={{ display: step === 0 ? "block" : "none" }}>
          <CapabilityMetadataSection />
        </div>
        <div style={{ display: step === 1 ? "block" : "none" }}>
          <CapabilitySkillMarkdownSection />
        </div>
        <div style={{ display: step === 2 ? "block" : "none" }}>
          <CapabilityFormsMarkdownSection />
        </div>
        <div style={{ display: step === 3 ? "block" : "none" }}>
          <CapabilityReferenceMarkdownSection />
        </div>
        <div style={{ display: step === 4 ? "block" : "none" }}>
          <CapabilityScriptsSection />
        </div>
      </Form>
    </Drawer>
  );
}
