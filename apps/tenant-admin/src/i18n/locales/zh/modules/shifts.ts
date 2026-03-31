export default {
  shiftsModule: {
    tab: {
      refresh: "刷新",
      schedule: "排班表",
      definitions: "班次定义",
      presence: "实时状态"
    },
    schedule: {
      agent: "坐席",
      selectedCount: "已选 {{count}} 人",
      week: "周",
      month: "月",
      previousWeek: "上一周",
      previousMonth: "上月",
      nextWeek: "下一周",
      nextMonth: "下月",
      thisWeek: "本周",
      thisMonth: "本月",
      copyToNextWeek: "复制到下周",
      copyToNextMonth: "复制到下月",
      copyConfirmTitleWeek: "复制到下一周",
      copyConfirmTitleMonth: "复制到下个月",
      copyConfirmDescriptionWeek: "将当前所有排班数据复制到下一周，已有排班将被覆盖。",
      copyConfirmDescriptionMonth: "将当前所有排班数据复制到下个月，已有排班将被覆盖。",
      copyConfirmOk: "确认复制",
      copySourceEmpty: "当前无排班数据可复制",
      copySuccessWeek: "已复制 {{count}} 条排班到下一周",
      copySuccessMonth: "已复制 {{count}} 条排班到下个月",
      unset: "未设置",
      searchPlaceholder: "搜索坐席姓名 / 邮箱",
      departmentPlaceholder: "全部部门",
      teamPlaceholder: "全部团队",
      summary: "显示 {{visible}} / {{total}} 人",
      bulkApply: "批量排班（{{count}}人）",
      clearSelection: "取消选择",
      selectAllCurrent: "全选当前 {{count}} 人",
      noAgents: "暂无匹配坐席"
    },
    definitions: {
      title: "班次模板",
      count: "{{count}} 个",
      create: "新建班次",
      empty: "暂无班次，点击“新建班次”开始",
      name: "班次名称",
      workingHours: "工作时间",
      timezone: "时区",
      status: "状态",
      actions: "操作",
      enabled: "启用",
      disabled: "停用",
      edit: "编辑",
      disable: "停用",
      alreadyDisabled: "已停用",
      disableTitle: "停用班次",
      disableDescription: "停用后不再可选，历史排班不受影响。",
      disableOk: "停用",
      modalEditTitle: "编辑班次",
      modalCreateTitle: "新建班次",
      save: "保存",
      createOk: "创建",
      code: "班次编码",
      codeRequired: "请输入编码",
      codePattern: "小写字母、数字、连字符、下划线",
      codeExtra: "如 morning、afternoon、night",
      nameRequired: "请输入名称",
      namePlaceholder: "早班",
      startTime: "开始时间",
      endTime: "结束时间",
      timezoneLabel: "时区"
    },
    presence: {
      totalAgents: "总坐席",
      empty: "暂无坐席数据",
      agent: "坐席",
      status: "状态",
      activeConversations: "活跃会话",
      lastHeartbeat: "最后心跳",
      actions: "操作",
      justNow: "刚刚",
      minutesAgo: "{{count}}分钟前",
      hoursAgo: "{{count}}小时前",
      endBreak: "结束休息",
      startBreak: "发起休息"
    },
    shiftCell: {
      title: "设置排班",
      selectTemplate: "选择班次模板",
      save: "保存",
      saved: "排班已保存",
      defaultScheduled: "排班"
    },
    bulkModal: {
      title: "批量排班",
      apply: "批量应用",
      selectedAgents: "已选坐席：",
      none: "（无）",
      applyDates: "应用到日期：",
      selectAll: "全选",
      workdaysOnly: "仅工作日",
      clear: "清空",
      selectedDays: "已选 {{selected}} / {{total}} 天",
      shiftType: "排班类型：",
      shiftTemplateOptional: "班次模板（可选）：",
      selectTemplate: "选择班次模板",
      selectOneDate: "请选择至少一个日期",
      saved: "已批量保存 {{count}} 条排班"
    },
    breakModal: {
      title: "发起休息 - {{name}}",
      confirm: "确认",
      breakType: "休息类型：",
      note: "备注（可选）：",
      notePlaceholder: "如：处理紧急事项...",
      started: "{{name}} 已进入休息"
    },
    helper: {
      weekdayShort: ["一", "二", "三", "四", "五", "六", "日"],
      weekdayFullShort: ["周一", "周二", "周三", "周四", "周五", "周六", "周日"],
      statusLabels: {
        online: "在线",
        busy: "忙碌",
        away: "离开",
        offline: "离线"
      },
      shiftStatusOptions: {
        scheduled: "正常排班",
        off: "休息",
        leave: "请假"
      },
      breakTypeOptions: {
        break: "工间休息",
        lunch: "午餐休息",
        training: "培训学习"
      },
      shiftStatusTags: {
        scheduled: "排班",
        off: "休",
        leave: "假"
      }
    },
    messages: {
      shiftUpdated: "班次已更新",
      shiftCreated: "班次已创建",
      shiftDisabled: "班次已停用",
      endBreakSuccess: "已结束休息",
      loadFailed: "加载排班数据失败"
    }
  }
};
