// 作用: 坐席与成员管理主入口（Tabs 切换坐席管理 / 成员账号）
// 菜单路径: 系统设置 -> 坐席与成员管理
// 作者：吴川

import { TeamOutlined, UserOutlined } from "@ant-design/icons";
import { Space, Tabs, Tag } from "antd";
import { useState } from "react";

import { AgentsPane } from "./components/AgentsPane";
import { MembersPane } from "./components/MembersPane";
import { useAgentsData } from "./hooks/useAgentsData";
import { EnableAgentModal } from "./modals/EnableAgentModal";
import { NewMemberModal } from "./modals/NewMemberModal";

export function AgentsTab() {
  const data = useAgentsData();
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [showEnableAgentModal, setShowEnableAgentModal] = useState(false);
  const [activeTab, setActiveTab] = useState("agents");

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
                坐席管理
                <Tag style={{ marginLeft: 2 }}>{data.agents.length}</Tag>
              </Space>
            ),
            children: (
              <AgentsPane
                agents={data.agents}
                members={data.members}
                groups={data.groups}
                loading={data.loading}
                onReload={() => { void data.load(); }}
                onEnable={() => setShowEnableAgentModal(true)}
              />
            )
          },
          {
            key: "members",
            label: (
              <Space>
                <TeamOutlined />
                成员账号
                <Tag style={{ marginLeft: 2 }}>{data.members.length}</Tag>
              </Space>
            ),
            children: (
              <MembersPane
                members={data.members}
                loading={data.loading}
                onReload={() => { void data.load(); }}
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
