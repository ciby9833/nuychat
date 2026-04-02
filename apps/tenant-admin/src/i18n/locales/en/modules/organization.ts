export default {
  organizationModule: {
    department: {
      listTitle: "Departments",
      create: "New Department",
      edit: "Edit Department",
      delete: "Delete Department",
      deleteConfirmTitle: "Delete department?",
      deleteConfirmDescription: "Department \"{{name}}\" will be deleted. This action cannot be undone.",
      deleteBlockedHint: "This department still has {{count}} teams. Delete or move them first.",
      all: "All Departments",
      teamsCount: "{{count}} teams",
      loading: "Loading...",
      empty: "No departments yet. Create one to get started."
    },
    teams: {
      titleWithDept: "{{name}} Teams",
      titleAll: "All Teams",
      create: "New Team",
      edit: "Edit Team",
      delete: "Delete Team",
      deleteConfirmTitle: "Delete team?",
      deleteConfirmDescription: "Team \"{{name}}\" will be deleted and member assignments will be removed.",
      actions: "Actions",
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
      editTitle: "Edit Department",
      create: "Create",
      save: "Save",
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
      editTitle: "Edit Team",
      create: "Create",
      save: "Save",
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
      memberAdded: "Member added",
      departmentDeleted: "Department deleted",
      teamDeleted: "Team deleted"
    }
  }
};
