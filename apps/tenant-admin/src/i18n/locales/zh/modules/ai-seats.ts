export default {
  aiSeats: {
    title: "AI 座席",
    modelPlatformManaged: "当前模型由平台统一提供：{{model}}",
    modelTenantManaged: "当前模型由公司自行配置：{{model}}",
    stats: {
      licensed: "已授权",
      used: "已启用",
      remaining: "剩余"
    },
    intro: {
      title: "座席说明",
      description: "每个 AI 座席都可以维护不同的角色、人格设定、服务场景、系统提示词和说明。"
    },
    actions: {
      create: "新建 AI 座席",
      backToList: "返回列表",
      save: "保存",
      view: "查看",
      edit: "编辑",
      disable: "停用",
      enable: "启用",
      delete: "删除"
    },
    editor: {
      createTitle: "新建 AI 座席",
      editTitle: "编辑 AI 座席 · {{name}}",
      innerCreateTitle: "新建 AI 座席",
      name: "名称",
      nameRequired: "请输入 AI 座席名称",
      namePlaceholder: "售前 AI / 售后 AI / 夜班 AI",
      role: "角色",
      rolePlaceholder: "售前顾问 / 售后客服 / 投诉专员",
      personality: "人格设定",
      personalityPlaceholder: "例如：耐心、安抚型、专业、直接",
      scenePrompt: "服务场景",
      scenePromptPlaceholder: "例如：退款咨询、物流查询、晚间接待",
      systemPrompt: "系统提示词",
      systemPromptPlaceholder: "该座席专属的系统规则和回复边界",
      description: "说明",
      descriptionPlaceholder: "补充说明这个 AI 座席主要负责什么",
      status: "状态",
      statusRequired: "请选择状态"
    },
    table: {
      title: "AI 座席列表",
      colName: "名称",
      colRole: "角色",
      colPersonality: "人格",
      colDescription: "说明",
      colStatus: "状态",
      colCreatedAt: "创建时间",
      colAction: "操作",
      deleteConfirm: "删除这个 AI 客服实例？"
    },
    status: {
      draft: "草稿",
      active: "启用",
      inactive: "停用"
    },
    common: {
      empty: "-"
    },
    errors: {
      seatLimitExceeded: "AI 座席授权已满，无法启用新的 AI 客服实例。请联系平台管理员扩容。"
    }
  }
};
