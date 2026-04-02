export default {
  organizationModule: {
    department: {
      listTitle: "部门列表",
      create: "新建部门",
      edit: "编辑部门",
      delete: "删除部门",
      deleteConfirmTitle: "删除部门？",
      deleteConfirmDescription: "部门“{{name}}”将被删除，此操作不可恢复。",
      deleteBlockedHint: "该部门下还有 {{count}} 个团队，请先删除或迁移团队。",
      all: "全部部门",
      teamsCount: "{{count}} 团队",
      loading: "加载中…",
      empty: "暂无部门，点击新建部门开始"
    },
    teams: {
      titleWithDept: "{{name}} 的团队",
      titleAll: "所有团队",
      create: "新建团队",
      edit: "编辑团队",
      delete: "删除团队",
      deleteConfirmTitle: "删除团队？",
      deleteConfirmDescription: "团队“{{name}}”将被删除，成员关联也会一并移除。",
      actions: "操作",
      emptyWithDept: "该部门暂无团队，点击新建团队",
      empty: "暂无团队",
      team: "团队",
      supervisor: "主管",
      members: "成员",
      noSupervisor: "—",
      noMembers: "暂无成员",
      addMember: "＋ 添加成员",
      removeMember: "移除 {{name}}"
    },
    deptModal: {
      title: "新建部门",
      editTitle: "编辑部门",
      create: "创建",
      save: "保存",
      code: "部门编码",
      codeRequired: "请输入部门编码",
      codeExtra: "小写字母 + 连字符，如 after-sales",
      name: "部门名称",
      nameRequired: "请输入部门名称",
      parent: "父部门（可选）",
      parentPlaceholder: "顶级部门"
    },
    teamModal: {
      title: "新建团队",
      editTitle: "编辑团队",
      create: "创建",
      save: "保存",
      department: "所属部门",
      departmentRequired: "请选择部门",
      code: "团队编码",
      codeRequired: "请输入团队编码",
      codeExtra: "如 after-sales-a",
      name: "团队名称",
      nameRequired: "请输入团队名称",
      supervisor: "主管坐席（可选）",
      supervisorPlaceholder: "无主管"
    },
    messages: {
      memberRemoved: "成员已移除",
      memberAdded: "成员已加入",
      departmentDeleted: "部门已删除",
      teamDeleted: "团队已删除"
    }
  }
};
