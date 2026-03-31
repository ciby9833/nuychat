/**
 * 作用：提供场景模型独立维护卡片，只维护 AI 座席、人工辅助、工具默认三个模型场景。
 * 页面/菜单：租户管理端「AI 配置 > 场景模型」。
 */
import { EditOutlined, UndoOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Descriptions, Form, Select, Space, Typography } from "antd";
import { useTranslation } from "react-i18next";

import { useSceneModelData } from "../../hooks/runtime-policy/useSceneModelData";
import type { AIRuntimePolicy } from "../../../../types";

type SceneModelFormValues = {
  model_scene_config: AIRuntimePolicy["model_scene_config"];
};

export function AISceneModelCard() {
  const { t } = useTranslation();
  const data = useSceneModelData();
  const [form] = Form.useForm<SceneModelFormValues>();
  const options = data.modelConfigs
    .filter((item) => item.is_active)
    .map((item) => ({
      value: item.config_id,
      label: `${item.name} · ${item.provider} / ${item.model_name}`
    }));

  const resolveConfigLabel = (configId: string | null | undefined) => {
    if (!configId) return t("aiConfig.sceneModel.defaultConfig");
    const match = data.modelConfigs.find((item) => item.config_id === configId);
    return match ? `${match.name} · ${match.provider} / ${match.model_name}` : configId;
  };

  return (
    <Card
      title={t("aiConfig.sceneModel.title")}
      extra={
        data.editing ? (
          <Space>
            <Button icon={<UndoOutlined />} onClick={() => data.cancelEdit(form)}>{t("aiConfig.sceneModel.cancel")}</Button>
            <Button type="primary" loading={data.busy} onClick={() => data.save(form)}>{t("aiConfig.sceneModel.save")}</Button>
          </Space>
        ) : (
          <Button icon={<EditOutlined />} onClick={() => data.enterEdit(form)}>{t("aiConfig.sceneModel.edit")}</Button>
        )
      }
    >
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <Typography.Text type="secondary">
          {t("aiConfig.sceneModel.description")}
        </Typography.Text>
        {data.error ? <Alert type="error" showIcon message={data.error} /> : null}
        {data.saved ? <Alert type="success" showIcon message={t("aiConfig.sceneModel.saved")} /> : null}

        {!data.editing ? (
          <Descriptions size="small" bordered column={1}>
            <Descriptions.Item label={t("aiConfig.sceneModel.aiSeat")}>
              {resolveConfigLabel(data.policy?.model_scene_config.aiSeatConfigId)}
            </Descriptions.Item>
            <Descriptions.Item label={t("aiConfig.sceneModel.agentAssist")}>
              {resolveConfigLabel(data.policy?.model_scene_config.agentAssistConfigId)}
            </Descriptions.Item>
            <Descriptions.Item label={t("aiConfig.sceneModel.toolDefault")}>
              {resolveConfigLabel(data.policy?.model_scene_config.toolDefaultConfigId)}
            </Descriptions.Item>
          </Descriptions>
        ) : (
          <Form form={form} layout="vertical">
            <Form.Item label={t("aiConfig.sceneModel.aiSeat")} name={["model_scene_config", "aiSeatConfigId"]}>
              <Select allowClear options={options} placeholder={t("aiConfig.sceneModel.aiSeatPlaceholder")} />
            </Form.Item>
            <Form.Item label={t("aiConfig.sceneModel.agentAssist")} name={["model_scene_config", "agentAssistConfigId"]}>
              <Select allowClear options={options} placeholder={t("aiConfig.sceneModel.agentAssistPlaceholder")} />
            </Form.Item>
            <Form.Item label={t("aiConfig.sceneModel.toolDefault")} name={["model_scene_config", "toolDefaultConfigId"]}>
              <Select allowClear options={options} placeholder={t("aiConfig.sceneModel.toolDefaultPlaceholder")} />
            </Form.Item>
          </Form>
        )}
      </Space>
    </Card>
  );
}
