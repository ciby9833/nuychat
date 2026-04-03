export default {
  slaModule: {
    config: {
      title: "默认 SLA 配置",
      description: "租户只维护一套默认时效与异常动作。系统会用这套配置驱动首响、未接手重分配、后续回复重分配与跟进关闭。",
      edit: "编辑",
      editTitle: "编辑默认 SLA",
      save: "保存配置",
      cancel: "取消",
      confirmTitle: "确认保存 SLA 配置",
      confirmDescription: "保存后，新的默认时效会立即用于后续会话与异常重分配。",
      confirmSave: "确认保存",
      confirmCancel: "返回修改",
      firstResponseTargetSec: "首响时限(秒)",
      assignmentAcceptTargetSec: "接手时限(秒)",
      subsequentResponseTargetSec: "后续回复时限(秒)",
      subsequentResponseReassignWhen: "后续回复超时后的改派条件",
      followUpTargetSec: "跟进时限(秒)",
      followUpCloseMode: "关闭方式",
      disabled: "未启用",
      updatedAt: "最近更新：{{value}}"
    },
    closeModes: {
      waitingCustomer: "等待客户",
      semantic: "语义结束"
    },
    reassignModes: {
      ownerUnavailable: "仅负责人不可服务时重分配",
      always: "超时即重分配"
    },
    scenes: {
      firstResponse: "首响监控",
      firstResponseHelp: "客户发出新消息后，如果在时限内还没有得到服务侧首次回复，会被记录为首响超时并进入异常监控。",
      assignmentAccept: "未接手重分配",
      assignmentAcceptHelp: "会话已分配给人工但迟迟没有真正接手时，到点后系统会再次自动分配给其他可接手座席。",
      subsequentResponse: "后续回复重分配",
      subsequentResponseHelp: "服务方已经回复过，但客户再次发言后当前负责人迟迟不继续回复。系统会先记录违规，再按改派条件决定是否重新分配。",
      followUp: "跟进关闭",
      followUpHelp: "服务方已经回复后，如果长时间没有后续动作，系统会按所选关闭方式结束本轮服务。"
    },
    summary: {
      total: "违约总数",
      open: "待处理",
      acknowledged: "已确认",
      average: "平均超时(秒)"
    },
    filter: {
      title: "SLA 违约查询",
      refresh: "刷新",
      statusPlaceholder: "违约状态",
      metricPlaceholder: "指标",
      query: "查询",
      status: {
        open: "待处理",
        acknowledged: "已确认",
        resolved: "已解决"
      },
      metric: {
        firstResponse: "首响超时",
        assignmentAccept: "未接手超时",
        subsequentResponse: "后续回复超时",
        followUp: "跟进超时"
      }
    },
    definitions: {
      title: "SLA 定义",
      create: "新建 SLA 定义",
      name: "定义名称",
      priority: "优先级",
      firstResponseTargetSec: "首响时限(秒)",
      assignmentAcceptTargetSec: "接手时限(秒)",
      followUpTargetSec: "跟进时限(秒)",
      resolutionTargetSec: "解决时限(秒)",
      status: "状态",
      actions: "操作",
      active: "生效中",
      inactive: "已停用",
      disable: "停用",
      enable: "启用",
      edit: "编辑"
    },
    policies: {
      title: "触发策略",
      create: "新建触发策略",
      name: "策略名称",
      priority: "优先级",
      firstResponseActions: "首响违约动作",
      assignmentAcceptActions: "未接手违约动作",
      followUpActions: "跟进违约动作",
      resolutionActions: "解决违约动作",
      status: "状态",
      actions: "操作",
      active: "生效中",
      inactive: "已停用",
      disable: "停用",
      enable: "启用",
      edit: "编辑"
    },
    breaches: {
      title: "SLA 违约列表",
      createdAt: "触发时间",
      metric: "指标",
      agentName: "坐席",
      caseId: "事项ID",
      conversationId: "会话ID",
      targetSec: "目标(秒)",
      actualSec: "实际(秒)",
      breachSec: "超时(秒)",
      severity: "严重度",
      status: "状态",
      actions: "处置",
      acknowledge: "确认",
      resolve: "解决",
      empty: "-",
      severityWarning: "warning",
      severityCritical: "critical",
      statusOpen: "OPEN",
      statusAcknowledged: "ACK",
      statusResolved: "RESOLVED"
    },
    messages: {
      loadFailed: "加载 SLA 数据失败: {{message}}",
      configUpdated: "默认 SLA 配置已更新",
      saveFailed: "保存失败: {{message}}",
      breachStatusFailed: "更新违约状态失败: {{message}}"
    }
  }
};
