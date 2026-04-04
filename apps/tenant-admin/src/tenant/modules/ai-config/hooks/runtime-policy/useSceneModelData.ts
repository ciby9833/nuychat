/**
 * 作用：负责 AI 场景模型的读取、编辑态切换和保存。
 * 页面/菜单：租户管理端「AI 配置 > 场景模型」。
 */
import { useCallback, useEffect, useState } from "react";
import { Modal } from "antd";
import type { FormInstance } from "antd";
import i18next from "i18next";

import { getTenantAIRuntimePolicy, listTenantAIConfigs, patchTenantAIRuntimePolicy } from "../../../../api";
import type { AIConfigProfile, AIRuntimePolicy } from "../../../../types";

type SceneModelFormValues = {
  model_scene_config: AIRuntimePolicy["model_scene_config"];
};

export function useSceneModelData() {
  const [policy, setPolicy] = useState<AIRuntimePolicy | null>(null);
  const [modelConfigs, setModelConfigs] = useState<AIConfigProfile[]>([]);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError("");
      const [next, configList] = await Promise.all([
        getTenantAIRuntimePolicy(),
        listTenantAIConfigs()
      ]);
      setPolicy(next);
      setModelConfigs(configList.configs ?? []);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const enterEdit = (form: FormInstance<SceneModelFormValues>) => {
    form.setFieldsValue({
      model_scene_config: policy?.model_scene_config ?? {
        aiSeatConfigId: null,
        agentAssistConfigId: null,
        toolDefaultConfigId: null,
        qaReviewConfigId: null
      }
    });
    setEditing(true);
    setSaved(false);
  };

  const cancelEdit = (form: FormInstance<SceneModelFormValues>) => {
    form.setFieldsValue({
      model_scene_config: policy?.model_scene_config ?? {
        aiSeatConfigId: null,
        agentAssistConfigId: null,
        toolDefaultConfigId: null,
        qaReviewConfigId: null
      }
    });
    setEditing(false);
    setError("");
  };

  const confirmSave = async (form: FormInstance<SceneModelFormValues>) => {
    try {
      setBusy(true);
      setError("");
      setSaved(false);
      const values = await form.validateFields();
      const next = await patchTenantAIRuntimePolicy({
        modelSceneConfig: values.model_scene_config
      });
      setPolicy(next);
      form.setFieldsValue({ model_scene_config: next.model_scene_config });
      setSaved(true);
      setEditing(false);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const save = (form: FormInstance<SceneModelFormValues>) => {
    Modal.confirm({
      title: i18next.t("aiConfig.sceneModel.confirmTitle"),
      content: i18next.t("aiConfig.sceneModel.confirmContent"),
      okText: i18next.t("aiConfig.sceneModel.confirmOk"),
      cancelText: i18next.t("aiConfig.sceneModel.cancel"),
      onOk: () => confirmSave(form)
    });
  };

  return {
    policy,
    modelConfigs,
    busy,
    saved,
    error,
    editing,
    load,
    enterEdit,
    cancelEdit,
    save
  };
}
