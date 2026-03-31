/**
 * 菜单路径与名称: 客户中心 -> Shifts / 排班管理
 * 文件职责: 排班模块主入口，负责串联排班表、班次定义、实时状态三个页签。
 * 主要交互文件:
 * - ./hooks/useShiftsData.ts: 负责班次、排班、在线状态、组织结构数据加载，以及周/月视图切换。
 * - ./components/SchedulePane.tsx: 展示周/月排班表、筛选、批量排班与单元格编辑。
 * - ./components/ShiftDefinitionsPane.tsx: 展示班次模板列表与班次编辑弹窗。
 * - ./components/PresencePane.tsx: 展示坐席实时状态与休息操作。
 * - ./components/ShiftCellPopover.tsx: 处理单个日期单元格的排班设置。
 * - ./modals/BulkScheduleModal.tsx: 处理批量排班。
 * - ./modals/BreakModal.tsx: 处理发起休息。
 * - ./helpers.ts: 提供周/月日期生成、状态色、排班标签等辅助逻辑。
 * - ../../api.ts: 提供排班、班次、在线状态相关接口能力。
 */

import { ClockCircleOutlined, ReloadOutlined, WifiOutlined } from "@ant-design/icons";
import { Badge, Button, Space, Tabs, Tag } from "antd";
import { useTranslation } from "react-i18next";

import { PresencePane } from "./components/PresencePane";
import { SchedulePane } from "./components/SchedulePane";
import { ShiftDefinitionsPane } from "./components/ShiftDefinitionsPane";
import { useShiftsData } from "./hooks/useShiftsData";

export function ShiftsTab() {
  const { t } = useTranslation();
  const data = useShiftsData();

  return (
    <Tabs
      activeKey={data.activeTab}
      onChange={data.setActiveTab}
      tabBarExtraContent={(
        <Button icon={<ReloadOutlined />} size="small" loading={data.loading} onClick={() => { void data.reload(); }}>
          {t("shiftsModule.tab.refresh")}
        </Button>
      )}
      items={[
        {
          key: "schedule",
          label: <Space><span>📅</span>{t("shiftsModule.tab.schedule")}</Space>,
          children: (
            <SchedulePane
              agents={data.agents}
              agentShifts={data.agentShifts}
              schedules={data.schedules}
              departments={data.departments}
              teams={data.teams}
              fromDate={data.fromDate}
              viewMode={data.viewMode}
              loading={data.loading}
              onChangeDate={data.setFromDate}
              onChangeViewMode={data.handleChangeViewMode}
              onReload={data.reload}
            />
          )
        },
        {
          key: "definitions",
          label: (
            <Space>
              <ClockCircleOutlined />
              {t("shiftsModule.tab.definitions")}
              {data.schedules.length > 0 ? <Tag>{data.schedules.length}</Tag> : null}
            </Space>
          ),
          children: <ShiftDefinitionsPane schedules={data.schedules} loading={data.loading} onReload={data.reload} />
        },
        {
          key: "presence",
          label: (
            <Space>
              <WifiOutlined />
              {t("shiftsModule.tab.presence")}
              {(data.presence?.summary.online ?? 0) > 0 ? <Badge count={data.presence?.summary.online} color="#52c41a" /> : null}
            </Space>
          ),
          children: <PresencePane presence={data.presence} loading={data.loading} onReload={data.reload} />
        }
      ]}
    />
  );
}
