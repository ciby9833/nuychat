export default {
  slaModule: {
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
        followUp: "跟进超时",
        resolution: "解决超时"
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
      definitionName: "SLA 定义",
      triggerPolicyName: "动作策略",
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
    definitionModal: {
      editTitle: "编辑 SLA 定义",
      createTitle: "新建 SLA 定义",
      name: "定义名称",
      nameRequired: "请输入定义名称",
      priority: "优先级",
      firstResponseTargetSec: "首响时限(秒)",
      assignmentAcceptTargetSec: "接手时限(秒)",
      assignmentAcceptExtra: "已分配但尚未真正接手的最长允许时长。",
      assignmentAcceptPlaceholder: "留空表示不监控未接手",
      followUpTargetSec: "跟进时限(秒)",
      followUpExtra: "已处理过后，进入等待客户/等待关闭阶段的最长允许时长。",
      followUpPlaceholder: "留空表示不监控跟进超时",
      resolutionTargetSec: "解决时限(秒)"
    },
    triggerModal: {
      editTitle: "编辑触发策略",
      createTitle: "新建触发策略",
      name: "策略名称",
      nameRequired: "请输入策略名称",
      priority: "优先级",
      firstResponseActions: "首响违约动作",
      assignmentAcceptActions: "未接手违约动作",
      followUpActions: "跟进违约动作",
      resolutionActions: "解决违约动作"
    },
    helper: {
      actionOptions: {
        alert: "提醒",
        escalate: "升级",
        reassign: "重新分配",
        closeCase: "关闭事项"
      },
      closeModes: {
        waitingCustomer: "等待客户",
        semantic: "语义结束"
      },
      addAction: "添加动作",
      delete: "删除",
      emptyActions: "-",
      closeCaseWithMode: "关闭({{mode}})"
    },
    messages: {
      loadFailed: "加载 SLA 数据失败: {{message}}",
      definitionUpdated: "SLA 定义更新成功",
      definitionCreated: "SLA 定义创建成功",
      triggerUpdated: "触发策略更新成功",
      triggerCreated: "触发策略创建成功",
      saveFailed: "保存失败: {{message}}",
      updateFailed: "更新失败: {{message}}",
      breachStatusFailed: "更新违约状态失败: {{message}}"
    }
  }
};
