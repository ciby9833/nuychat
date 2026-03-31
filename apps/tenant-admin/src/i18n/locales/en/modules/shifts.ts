export default {
  shiftsModule: {
    tab: {
      refresh: "Refresh",
      schedule: "Schedule Board",
      definitions: "Shift Definitions",
      presence: "Live Presence"
    },
    schedule: {
      agent: "Agent",
      selectedCount: "{{count}} selected",
      week: "Week",
      month: "Month",
      previousWeek: "Previous Week",
      previousMonth: "Previous Month",
      nextWeek: "Next Week",
      nextMonth: "Next Month",
      thisWeek: "This Week",
      thisMonth: "This Month",
      copyToNextWeek: "Copy to Next Week",
      copyToNextMonth: "Copy to Next Month",
      copyConfirmTitleWeek: "Copy to Next Week",
      copyConfirmTitleMonth: "Copy to Next Month",
      copyConfirmDescriptionWeek: "Copy all current schedules to next week. Existing schedules will be overwritten.",
      copyConfirmDescriptionMonth: "Copy all current schedules to next month. Existing schedules will be overwritten.",
      copyConfirmOk: "Copy",
      copySourceEmpty: "No schedules available to copy",
      copySuccessWeek: "Copied {{count}} schedules to next week",
      copySuccessMonth: "Copied {{count}} schedules to next month",
      unset: "Unset",
      searchPlaceholder: "Search agent name / email",
      departmentPlaceholder: "All departments",
      teamPlaceholder: "All teams",
      summary: "Showing {{visible}} / {{total}} agents",
      bulkApply: "Bulk Schedule ({{count}})",
      clearSelection: "Clear Selection",
      selectAllCurrent: "Select All Current ({{count}})",
      noAgents: "No matching agents"
    },
    definitions: {
      title: "Shift Templates",
      count: "{{count}} templates",
      create: "New Shift",
      empty: "No shifts yet. Click \"New Shift\" to start.",
      name: "Shift Name",
      workingHours: "Working Hours",
      timezone: "Timezone",
      status: "Status",
      actions: "Actions",
      enabled: "Enabled",
      disabled: "Disabled",
      edit: "Edit",
      disable: "Disable",
      alreadyDisabled: "Disabled",
      disableTitle: "Disable Shift",
      disableDescription: "Once disabled, it can no longer be selected. Historical schedules remain unchanged.",
      disableOk: "Disable",
      modalEditTitle: "Edit Shift",
      modalCreateTitle: "New Shift",
      save: "Save",
      createOk: "Create",
      code: "Shift Code",
      codeRequired: "Please enter the code",
      codePattern: "Lowercase letters, numbers, hyphens, and underscores only",
      codeExtra: "Examples: morning, afternoon, night",
      nameRequired: "Please enter the name",
      namePlaceholder: "Morning Shift",
      startTime: "Start Time",
      endTime: "End Time",
      timezoneLabel: "Timezone"
    },
    presence: {
      totalAgents: "Total Agents",
      empty: "No agent presence data",
      agent: "Agent",
      status: "Status",
      activeConversations: "Active Conversations",
      lastHeartbeat: "Last Heartbeat",
      actions: "Actions",
      justNow: "Just now",
      minutesAgo: "{{count}} min ago",
      hoursAgo: "{{count}} hr ago",
      endBreak: "End Break",
      startBreak: "Start Break"
    },
    shiftCell: {
      title: "Set Schedule",
      selectTemplate: "Select shift template",
      save: "Save",
      saved: "Schedule saved",
      defaultScheduled: "Scheduled"
    },
    bulkModal: {
      title: "Bulk Schedule",
      apply: "Apply in Bulk",
      selectedAgents: "Selected agents:",
      none: "(none)",
      applyDates: "Apply to dates:",
      selectAll: "Select all",
      workdaysOnly: "Workdays only",
      clear: "Clear",
      selectedDays: "{{selected}} / {{total}} days selected",
      shiftType: "Shift type:",
      shiftTemplateOptional: "Shift template (optional):",
      selectTemplate: "Select shift template",
      selectOneDate: "Select at least one date",
      saved: "Saved {{count}} schedules in bulk"
    },
    breakModal: {
      title: "Start Break - {{name}}",
      confirm: "Confirm",
      breakType: "Break type:",
      note: "Note (optional):",
      notePlaceholder: "Example: urgent personal matter...",
      started: "{{name}} is now on break"
    },
    helper: {
      weekdayShort: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      weekdayFullShort: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      statusLabels: {
        online: "Online",
        busy: "Busy",
        away: "Away",
        offline: "Offline"
      },
      shiftStatusOptions: {
        scheduled: "Scheduled",
        off: "Off",
        leave: "Leave"
      },
      breakTypeOptions: {
        break: "Short Break",
        lunch: "Lunch Break",
        training: "Training"
      },
      shiftStatusTags: {
        scheduled: "Scheduled",
        off: "Off",
        leave: "Leave"
      }
    },
    messages: {
      shiftUpdated: "Shift updated",
      shiftCreated: "Shift created",
      shiftDisabled: "Shift disabled",
      endBreakSuccess: "Break ended",
      loadFailed: "Failed to load shift data"
    }
  }
};
