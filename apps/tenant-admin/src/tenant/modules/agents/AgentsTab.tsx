// 作用: 坐席与成员管理主入口，统一承载坐席和成员管理。
// 菜单路径: 系统设置 -> 坐席与成员管理
// 交互: 聚合 useAgentsData，成员 WA Seat 仍在此协同维护；WA 账号池迁移到独立监控页。

import { TeamOutlined, UserOutlined } from "@ant-design/icons";
import { Space, Tabs, Tag } from "antd";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import { AgentsPane } from "./components/AgentsPane";
import { MembersPane } from "./components/MembersPane";
import { useAgentsData } from "./hooks/useAgentsData";
import { EnableAgentModal } from "./modals/EnableAgentModal";
import { NewMemberModal } from "./modals/NewMemberModal";

export function AgentsTab() {
  const { t } = useTranslation();
  const data = useAgentsData();
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [showEnableAgentModal, setShowEnableAgentModal] = useState(false);
  const [activeTab, setActiveTab] = useState("agents");
  const handleReload = useCallback(() => {
    void data.load();
  }, [data.load]);

  return (
    <>
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: "agents",
            label: (
              <Space>
                <UserOutlined />
                {t("agents.tab.agents")}
                <Tag style={{ marginLeft: 2 }}>{data.agents.length}</Tag>
              </Space>
            ),
            children: (
              <AgentsPane
                agents={data.agents}
                members={data.members}
                loading={data.loading}
                onReload={handleReload}
                onEnable={() => setShowEnableAgentModal(true)}
              />
            )
          },
          {
            key: "members",
            label: (
              <Space>
                <TeamOutlined />
                {t("agents.tab.members")}
                <Tag style={{ marginLeft: 2 }}>{data.members.length}</Tag>
              </Space>
            ),
            children: (
              <MembersPane
                members={data.members}
                waAvailable={Boolean(data.waRuntime?.available)}
                loading={data.loading}
                onReload={handleReload}
                onCreate={() => setShowMemberModal(true)}
                onEnableAgent={() => setShowEnableAgentModal(true)}
              />
            )
          }
        ]}
      />

      <NewMemberModal
        open={showMemberModal}
        onClose={() => setShowMemberModal(false)}
        onCreated={() => { void data.load(); setActiveTab("members"); }}
      />

      <EnableAgentModal
        open={showEnableAgentModal}
        members={data.members}
        onClose={() => setShowEnableAgentModal(false)}
        onCreated={() => { void data.load(); setActiveTab("agents"); }}
      />
    </>
  );
}
