export default {
  organizationModule: {
    department: {
      listTitle: "Departments",
      create: "New Department",
      all: "All Departments",
      teamsCount: "{{count}} teams",
      loading: "Loading...",
      empty: "No departments yet. Create one to get started."
    },
    teams: {
      titleWithDept: "{{name}} Teams",
      titleAll: "All Teams",
      create: "New Team",
      emptyWithDept: "No teams in this department yet. Create one.",
      empty: "No teams yet",
      team: "Team",
      supervisor: "Supervisor",
      members: "Members",
      noSupervisor: "—",
      noMembers: "No members yet",
      addMember: "+ Add member",
      removeMember: "Remove {{name}}"
    },
    deptModal: {
      title: "New Department",
      create: "Create",
      code: "Department Code",
      codeRequired: "Please enter the department code",
      codeExtra: "Lowercase letters and hyphens, for example: after-sales",
      name: "Department Name",
      nameRequired: "Please enter the department name",
      parent: "Parent Department (Optional)",
      parentPlaceholder: "Top-level department"
    },
    teamModal: {
      title: "New Team",
      create: "Create",
      department: "Department",
      departmentRequired: "Please select a department",
      code: "Team Code",
      codeRequired: "Please enter the team code",
      codeExtra: "For example: after-sales-a",
      name: "Team Name",
      nameRequired: "Please enter the team name",
      supervisor: "Supervisor Agent (Optional)",
      supervisorPlaceholder: "No supervisor"
    },
    messages: {
      memberRemoved: "Member removed",
      memberAdded: "Member added"
    }
  }
};
