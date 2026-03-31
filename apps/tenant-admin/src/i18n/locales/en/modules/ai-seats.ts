export default {
  aiSeats: {
    title: "AI Seats",
    modelPlatformManaged: "Current model is provided centrally by the platform: {{model}}",
    modelTenantManaged: "Current model is configured by the company: {{model}}",
    stats: {
      licensed: "Licensed",
      used: "Enabled",
      remaining: "Remaining"
    },
    intro: {
      title: "Seat Overview",
      description: "Each AI seat can maintain its own role, personality, service scenario, system prompt, and description."
    },
    actions: {
      create: "Create AI Seat",
      backToList: "Back to List",
      save: "Save",
      view: "View",
      edit: "Edit",
      disable: "Disable",
      enable: "Enable",
      delete: "Delete"
    },
    editor: {
      createTitle: "Create AI Seat",
      editTitle: "Edit AI Seat - {{name}}",
      innerCreateTitle: "Create AI Seat",
      name: "Name",
      nameRequired: "Please enter an AI seat name",
      namePlaceholder: "Pre-sales AI / After-sales AI / Night Shift AI",
      role: "Role",
      rolePlaceholder: "Pre-sales consultant / After-sales support / Complaint specialist",
      personality: "Personality",
      personalityPlaceholder: "For example: patient, reassuring, professional, direct",
      scenePrompt: "Service Scenario",
      scenePromptPlaceholder: "For example: refund support, logistics inquiry, evening reception",
      systemPrompt: "System Prompt",
      systemPromptPlaceholder: "Seat-specific rules and response boundaries",
      description: "Description",
      descriptionPlaceholder: "Add notes about what this AI seat mainly handles",
      status: "Status",
      statusRequired: "Please select a status"
    },
    table: {
      title: "AI Seat List",
      colName: "Name",
      colRole: "Role",
      colPersonality: "Personality",
      colDescription: "Description",
      colStatus: "Status",
      colCreatedAt: "Created At",
      colAction: "Actions",
      deleteConfirm: "Delete this AI customer service instance?"
    },
    status: {
      draft: "Draft",
      active: "Active",
      inactive: "Inactive"
    },
    common: {
      empty: "-"
    },
    errors: {
      seatLimitExceeded: "AI seat quota has been reached. Unable to enable a new AI customer service instance. Contact the platform administrator for expansion."
    }
  }
};
