// 作用: 渠道数据加载、筛选、编辑保存、WhatsApp 绑定 hook
// 菜单路径: 客户中心 -> 渠道配置
// 作者：吴川

import { Form, message } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  api,
  completeWhatsAppEmbeddedSignup,
  getWebChannelLinkInfo,
  getWebhookChannelLinkInfo,
  getWhatsAppEmbeddedSignupSetup
} from "../../../api";
import type { ChannelConfig, WebChannelLinkInfo, WebhookChannelLinkInfo, WhatsAppEmbeddedSignupSetup } from "../../../types";
import type { ChannelFormValues } from "../types";
import { loadFacebookSdk, runWhatsAppEmbeddedSignup } from "../whatsapp-signup";

export function useChannelsData() {
  const [channels, setChannels] = useState<ChannelConfig[]>([]);
  const [error, setError] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [editing, setEditing] = useState<ChannelConfig | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [binding, setBinding] = useState(false);
  const [selectedWebInfo, setSelectedWebInfo] = useState<WebChannelLinkInfo | null>(null);
  const [selectedWebhookInfo, setSelectedWebhookInfo] = useState<WebhookChannelLinkInfo | null>(null);
  const [whatsAppSetup, setWhatsAppSetup] = useState<WhatsAppEmbeddedSignupSetup | null>(null);
  const [form] = Form.useForm<ChannelFormValues>();

  const load = useCallback(async () => {
    try {
      setError("");
      const rows = await api<ChannelConfig[]>("/api/admin/channel-configs");
      setChannels(rows);
      setSelectedId((prev) => (prev && rows.some((r) => r.config_id === prev) ? prev : (rows[0]?.config_id ?? null)));
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    return channels.filter((item) => {
      const hitType = typeFilter === "all" || item.channel_type === typeFilter;
      const hitStatus = statusFilter === "all" || (statusFilter === "active" ? item.is_active : !item.is_active);
      return hitType && hitStatus;
    });
  }, [channels, typeFilter, statusFilter]);

  const typeOptions = useMemo(() => {
    const set = new Set(channels.map((c) => c.channel_type));
    return [{ value: "all", label: "全部渠道" }, ...Array.from(set).map((v) => ({ value: v, label: v }))];
  }, [channels]);

  const selectedChannel = useMemo(
    () => filtered.find((item) => item.config_id === selectedId) ?? filtered[0] ?? null,
    [filtered, selectedId]
  );

  useEffect(() => {
    if (selectedChannel?.channel_type !== "web") {
      setSelectedWebInfo(null);
    } else {
      void (async () => {
        try {
          const info = await getWebChannelLinkInfo();
          setSelectedWebInfo(info);
        } catch {
          setSelectedWebInfo(null);
        }
      })();
    }

    if (selectedChannel?.channel_type !== "whatsapp") {
      setWhatsAppSetup(null);
    } else {
      void (async () => {
        try {
          const info = await getWhatsAppEmbeddedSignupSetup();
          setWhatsAppSetup(info);
        } catch {
          setWhatsAppSetup(null);
        }
      })();
    }

    if (selectedChannel?.channel_type !== "webhook") {
      setSelectedWebhookInfo(null);
      return;
    }

    void (async () => {
      try {
        const info = await getWebhookChannelLinkInfo(selectedChannel.config_id);
        setSelectedWebhookInfo(info);
      } catch {
        setSelectedWebhookInfo(null);
      }
    })();
  }, [selectedChannel?.channel_type, selectedChannel?.config_id]);

  const openEdit = (row: ChannelConfig) => {
    if (row.channel_type === "whatsapp") {
      return;
    }
    setEditing(row);
    form.setFieldsValue({
      channel_id: row.channel_id,
      is_active: row.is_active,
      widget_name: row.widget_name ?? "",
      public_channel_key: row.public_channel_key ?? "",
      allowed_origins: (row.allowed_origins ?? []).join(", "),
      outbound_webhook_url: row.outbound_webhook_url ?? "",
      webhook_secret: row.webhook_secret ?? ""
    });
  };

  const onSave = async () => {
    if (!editing) return;
    setSaving(true);
    setError("");
    try {
      const values = await form.validateFields();
      const payload: Record<string, unknown> = {
        channelId: values.channel_id.trim(),
        isActive: values.is_active
      };
      if (editing.channel_type === "web") {
        payload.widgetName = values.widget_name?.trim() ?? "";
        payload.publicChannelKey = values.public_channel_key?.trim() ?? "";
        payload.allowedOrigins = String(values.allowed_origins ?? "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
      }
      if (editing.channel_type === "whatsapp") {
        payload.channelId = values.channel_id.trim();
      }
      if (editing.channel_type === "webhook") {
        payload.verifyToken = values.verify_token?.trim() ?? "";
        payload.outboundWebhookUrl = values.outbound_webhook_url?.trim() ?? "";
        payload.webhookSecret = values.webhook_secret?.trim() ?? "";
      }

      await api(`/api/admin/channel-configs/${editing.config_id}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
      message.success("渠道配置已更新");
      setEditing(null);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const onBindWhatsApp = async (row: ChannelConfig) => {
    if (!whatsAppSetup?.enabled || !whatsAppSetup.appId || !whatsAppSetup.configId) {
      message.error("平台尚未配置 Meta Embedded Signup");
      return;
    }

    setBinding(true);
    setError("");
    try {
      await loadFacebookSdk(whatsAppSetup.appId);
      const result = await runWhatsAppEmbeddedSignup(whatsAppSetup.configId);
      await completeWhatsAppEmbeddedSignup(row.config_id, result);
      message.success("WhatsApp 号码已绑定");
      await load();
      const nextSetup = await getWhatsAppEmbeddedSignupSetup();
      setWhatsAppSetup(nextSetup);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBinding(false);
    }
  };

  return {
    channels, filtered, typeOptions, selectedChannel,
    error, saving, binding, form, editing,
    typeFilter, setTypeFilter, statusFilter, setStatusFilter,
    selectedId, setSelectedId, selectedWebInfo, selectedWebhookInfo, whatsAppSetup,
    load, openEdit, setEditing, onSave, onBindWhatsApp
  };
}
