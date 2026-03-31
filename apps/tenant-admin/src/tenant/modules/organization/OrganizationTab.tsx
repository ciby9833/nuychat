/**
 * 菜单路径与名称: 客户中心 -> Organization / 组织架构
 * 文件职责: 组织模块主入口，负责串联部门面板、团队面板，以及新建部门/团队弹窗。
 * 主要交互文件:
 * - ./hooks/useOrganizationData.ts: 负责部门、团队、坐席数据加载，部门筛选，以及团队成员增删动作。
 * - ./components/DepartmentPanel.tsx: 展示左侧部门列表与选择态。
 * - ./components/TeamsPanel.tsx: 展示右侧团队列表、成员列表与成员增删入口。
 * - ./modals/NewDepartmentModal.tsx: 承载新建部门表单。
 * - ./modals/NewTeamModal.tsx: 承载新建团队表单。
 * - ./types.ts: 统一导出 organization 模块使用的类型与表单类型。
 * - ../../api.ts: 提供部门、团队、坐席、成员管理相关接口能力。
 */

import { Col, Row } from "antd";

import { DepartmentPanel } from "./components/DepartmentPanel";
import { TeamsPanel } from "./components/TeamsPanel";
import { useOrganizationData } from "./hooks/useOrganizationData";
import { NewDepartmentModal } from "./modals/NewDepartmentModal";
import { NewTeamModal } from "./modals/NewTeamModal";

export function OrganizationTab() {
  const data = useOrganizationData();

  return (
    <>
      <Row gutter={16} style={{ height: "100%" }}>
        <Col xs={24} md={8} lg={7}>
          <DepartmentPanel
            loading={data.loading}
            departments={data.departments}
            teams={data.teams}
            selectedDeptId={data.selectedDeptId}
            onSelect={data.setSelectedDeptId}
            onOpenCreate={() => data.setShowDeptModal(true)}
          />
        </Col>

        <Col xs={24} md={16} lg={17}>
          <TeamsPanel
            loading={data.loading}
            visibleTeams={data.visibleTeams}
            selectedDeptId={data.selectedDeptId}
            selectedDept={data.selectedDept}
            agents={data.agents}
            onOpenCreate={() => data.setShowTeamModal(true)}
            onAddMember={(teamId, agentId) => { void data.handleAddMember(teamId, agentId); }}
            onRemoveMember={(teamId, agentId) => { void data.handleRemoveMember(teamId, agentId); }}
          />
        </Col>
      </Row>

      <NewDepartmentModal
        open={data.showDeptModal}
        departments={data.departments}
        onClose={() => data.setShowDeptModal(false)}
        onCreated={() => { void data.reload(); }}
      />

      <NewTeamModal
        open={data.showTeamModal}
        departments={data.departments}
        agents={data.agents}
        defaultDepartmentId={data.selectedDeptId}
        onClose={() => data.setShowTeamModal(false)}
        onCreated={() => { void data.reload(); }}
      />
    </>
  );
}
