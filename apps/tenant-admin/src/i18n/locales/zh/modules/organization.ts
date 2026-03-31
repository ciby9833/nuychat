export default {
  organizationModule: {
    department: {
      listTitle: "部门列表",
      create: "新建部门",
      all: "全部部门",
      teamsCount: "{{count}} 团队",
      loading: "加载中…",
      empty: "暂无部门，点击新建部门开始"
    },
    teams: {
      titleWithDept: "{{name}} 的团队",
      titleAll: "所有团队",
      create: "新建团队",
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
      create: "创建",
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
      create: "创建",
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
      memberAdded: "成员已加入"
    }
  }
};
