// 作用: AI 配置数据加载与 CRUD 操作 hook
// 菜单路径: 客户中心 -> AI 配置管理
// 作者：吴川

import type { FormInstance } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  createTenantAIConfig,
  deleteTenantAIConfig,
  listTenantAIConfigs,
  patchTenantAIConfig,
  setDefaultTenantAIConfig
} from "../../../api";
import type { AIConfigProfile } from "../../../types";
import { requiresAIProviderApiKeyOnCreate } from "../../../../../../../packages/shared-types/src/ai-model-config";
import type { AIConfigFormValues } from "../types";
import { normalizeProvider } from "../types";

export function useAIConfigData(form: FormInstance<AIConfigFormValues>) {
  const [rows, setRows] = useState<AIConfigProfile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const selected = useMemo(() => rows.find((item) => item.config_id === selectedId) ?? null, [rows, selectedId]);

  const load = useCallback(async () => {
    try {
      setError("");
      const data = await listTenantAIConfigs();
      const list = data.configs ?? [];
      setRows(list);
      const nextSelected = selectedId && list.some((item) => item.config_id === selectedId)
        ? selectedId
        : (list.find((item) => item.is_default)?.config_id ?? list[0]?.config_id ?? null);
      setSelectedId(nextSelected);

      const target = list.find((item) => item.config_id === nextSelected);
      if (target) {
        form.setFieldsValue({
          name: target.name,
          provider: normalizeProvider(target.provider),
          model_name: target.model_name,
          base_url: target.base_url ?? null,
          temperature: target.temperature,
          max_tokens: target.max_tokens,
          system_prompt_override: target.system_prompt_override,
          is_active: target.is_active
        });
      } else {
        form.resetFields();
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }, [form, selectedId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setError("");
    setSaved(false);
    setBusy(true);
    try {
      const values = await form.validateFields();
      const providerChanged = selectedId ? values.provider !== selected?.provider : false;
      if (!selectedId && requiresAIProviderApiKeyOnCreate(values.provider) && !apiKey.trim()) {
        throw new Error("该模型厂商在新增时必须填写 API Key");
      }
      if (selectedId && requiresAIProviderApiKeyOnCreate(values.provider) && (providerChanged || !selected?.has_api_key) && !apiKey.trim()) {
        throw new Error(providerChanged ? "切换到该模型厂商时必须填写新的 API Key" : "该模型厂商必须填写 API Key");
      }
      if (selectedId) {
        await patchTenantAIConfig(selectedId, {
          name: values.name,
          provider: values.provider,
          modelName: values.model_name,
          baseUrl: values.base_url?.trim() ? values.base_url.trim() : null,
          temperature: values.temperature,
          maxTokens: values.max_tokens,
          systemPromptOverride: values.system_prompt_override || null,
          isActive: values.is_active,
          encryptedApiKey: apiKey.trim() ? apiKey.trim() : undefined
        });
      } else {
        const created = await createTenantAIConfig({
          name: values.name,
          provider: values.provider,
          modelName: values.model_name,
          baseUrl: values.base_url?.trim() ? values.base_url.trim() : null,
          temperature: values.temperature,
          maxTokens: values.max_tokens,
          systemPromptOverride: values.system_prompt_override || null,
          isActive: values.is_active,
          encryptedApiKey: apiKey || undefined
        });
        setSelectedId(created.config_id);
      }
      setApiKey("");
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      await load();
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const onSetDefault = async (configId: string) => {
    setBusy(true);
    setError("");
    try {
      await setDefaultTenantAIConfig(configId);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (configId: string) => {
    setBusy(true);
    setError("");
    try {
      await deleteTenantAIConfig(configId);
      if (selectedId === configId) setSelectedId(null);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return {
    rows, selected, selectedId, setSelectedId,
    apiKey, setApiKey,
    saved, error, busy,
    load, save, onSetDefault, onDelete
  };
}
