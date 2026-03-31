export default {
  login: {
    brand: "NuyChat Admin",
    title: "Tenant Admin Login",
    subtitle: "Sign in with a tenant admin account",
    emailLabel: "Email",
    emailPlaceholder: "Enter your email",
    passwordLabel: "Password",
    passwordPlaceholder: "Enter your password",
    submit: "Sign In"
  },
  nav: {
    brand: "Admin Console",
    subbrand: "NuyChat",
    logout: "Sign Out",
    groups: {
      core: "Core",
      ops: "Operations",
      sys: "Platform"
    }
  },
  lang: {
    switchLabel: "Language",
    zh: "中文",
    en: "English",
    id: "Indonesia"
  },
  tabs: {
    overview: "Overview",
    cases: "Cases",
    "human-conversations": "Conversations",
    tasks: "Tasks",
    organization: "Organization",
    permissions: "Permissions",
    shifts: "Shifts",
    agents: "Agents",
    "ai-seats": "AI Seats",
    "ai-conversations": "AI Chats",
    "memory-qa": "Memory QA",
    "dispatch-audit": "Dispatch",
    ai: "AI Config",
    capabilities: "Capabilities",
    kb: "Knowledge Base",
    routing: "Routing",
    channels: "Channels",
    analytics: "Analytics",
    sla: "SLA",
    qa: "QA",
    csat: "CSAT",
    supervisor: "Supervisor",
    customers: "Customers"
  },
  common: {
    refresh: "Refresh",
    closeCurrent: "Close Current",
    closeAll: "Close All",
    save: "Save",
    cancel: "Cancel",
    edit: "Edit",
    delete: "Delete",
    create: "Create",
    add: "Add",
    enable: "Enable",
    disable: "Disable",
    search: "Search",
    confirm: "Confirm Delete",
    status: "Status",
    action: "Action",
    noData: "No data",
    active: "Active",
    inactive: "Inactive",
    remove: "Remove",
    on: "On",
    off: "Off",
    total: "Total"
  },
  overview: {
    totalConversations: "Total Conversations",
    kbEntries: "KB Entries",
    agentCount: "Agents",
    statusDistribution: "Conversation Status"
  },
  cases: {
    loadError: "Failed to load cases",
    searchPlaceholder: "Search case ID / title / customer / conversation ID",
    statusPlaceholder: "Case status",
    query: "Search",
    cardTitle: "Cases",
    col: {
      case: "Case",
      customer: "Customer",
      channel: "Channel",
      owner: "Owner",
      status: "Status",
      summary: "Summary",
      lastActivity: "Last Activity"
    },
    ownerFinal: "Final",
    ownerCurrent: "Current"
  },
  analytics: {
    title: "Daily Analytics",
    stats: {
      totalEvents: "Total Events",
      casesTouched: "Cases Touched",
      convsStarted: "Convs Started",
      msgsReceived: "Msgs Received",
      msgsSent: "Msgs Sent",
      skillsExecuted: "Skills Run",
      convsResolved: "Convs Resolved"
    },
    eventDetail: "Event Breakdown — {{date}}",
    noEvents: "No event data for this day",
    col: {
      eventType: "Event Type",
      rawType: "Raw Type",
      count: "Count"
    },
    events: {
      conversation_started: "Conv Started",
      message_received: "Msg Received",
      message_sent: "Msg Sent",
      skill_executed: "Skill Run",
      conversation_resolved: "Conv Resolved"
    }
  },
  kb: {
    queryModule: "Search",
    listModule: "Articles",
    searchPlaceholder: "Search articles",
    allCategories: "All Categories",
    addArticle: "Add Article",
    editArticle: "Edit Article",
    tagsSeparated: "Tags (comma-separated)",
    items: "items",
    col: {
      category: "Category",
      title: "Title",
      content: "Content",
      hits: "Hits",
      status: "Status"
    }
  },
  agents: {},
  routing: {
    rulesTab: "Rules",
    modulesTab: "Modules",
    skillGroupsTab: "Skill Groups",
    rulesCount: "{{count}} rules",
    enabledCount: "{{count}} active",
    modulesCount: "{{count}} modules",
    skillGroupsCount: "{{count}} groups",
    addRule: "Add Rule",
    addModule: "Add Module",
    addSkillGroup: "Add Skill Group",
    hint: "Rules match conditions then route conversations to departments/teams/skill groups"
  },
  dispatchAudit: {
    hint: "Shows why each case was routed to AI or humans, and why ownership changed afterwards.",
    common: {
      none: "None",
      yes: "Yes",
      no: "No"
    },
    stats: {
      total: "{{count}} execution records",
      plans: "{{count}} routing plans",
      aiRuntime: "{{count}} AI runtime records",
      manual: "{{count}} manual changes"
    },
    filters: {
      caseId: "Filter by case ID",
      conversationId: "Filter by conversation ID",
      triggerType: "Trigger type"
    },
    columns: {
      time: "Time",
      case: "Case",
      trigger: "Trigger",
      decisionType: "Decision Type",
      rule: "Rule",
      reason: "Reason",
      summary: "Summary"
    },
    detail: {
      title: "Dispatch Execution Details",
      case: "Case",
      conversation: "Conversation",
      trigger: "Trigger",
      decisionType: "Decision Type",
      rule: "Rule",
      conditions: "Matched Conditions",
      inputSnapshot: "Input Snapshot",
      decisionSummary: "Decision Summary",
      decisionReason: "Decision Reason",
      candidates: "Candidates",
      transitions: "Ownership Transitions"
    },
    candidateColumns: {
      type: "Type",
      candidate: "Candidate",
      stage: "Stage",
      result: "Result",
      reason: "Reason",
      details: "Details"
    },
    candidateResult: {
      accepted: "Selected",
      rejected: "Rejected"
    },
    transitionColumns: {
      time: "Time",
      type: "Type",
      from: "From",
      to: "To",
      reason: "Reason"
    },
    case: {
      short: "Case {{id}}",
      full: "Case {{id}}",
      unlinked: "No linked case"
    },
    summary: {
      assignedAgent: "Human {{id}}",
      assignedAi: "AI {{id}}",
      noDirectOwner: "No direct owner"
    },
    ops: {
      title: "Dispatch Suggestions",
      empty: "No obvious suggestions in the selected time range.",
      aiAgents: "By AI agent",
      teams: "By team",
      customerSegments: "By tier / channel"
    },
    candidateDetails: {
      score: "Score: {{score}}",
      todayNewCaseCount: "New cases today: {{count}}",
      activeAssignments: "Active assignments: {{count}}",
      reservedAssignments: "Reserved assignments: {{count}}",
      balancedFormula: "balanced_new_case = 4 * new cases today + 2 * active assignments + 1 * reserved assignments"
    },
    patterns: {
      modeReason: "{{mode}} / {{reason}}",
      ownerWithId: "{{ownerType}} / {{ownerId}}"
    },
    actions: {
      view: "View",
      assign_ai_owner: "Assign to AI",
      assign_specific_owner: "Assign to human",
      enqueue_for_human: "Queue for human",
      preserve_existing_owner: "Keep current owner"
    },
    modes: {
      ai_first: "AI first",
      human_first: "Human first",
      ai_only: "AI only",
      human_only: "Human only",
      hybrid: "Hybrid"
    },
    selectionModes: {
      rule: "Rule matched",
      fallback: "Fallback",
      none: "Not used"
    },
    strategies: {
      least_busy: "Least busy",
      sticky: "Sticky",
      balanced_new_case: "Balanced new case",
      load_balanced: "Load balanced",
      prefer_human: "Prefer human",
      prefer_ai: "Prefer AI"
    },
    triggerTypes: {
      inbound_message: "Inbound message",
      ai_routing: "AI routing",
      ai_routing_execution: "AI runtime routing",
      agent_assign: "Human takeover",
      agent_handoff: "Agent handoff to queue",
      agent_transfer: "Agent transfer",
      supervisor_transfer: "Supervisor transfer",
      conversation_resolve: "Conversation resolved",
      ai_handoff: "AI to human handoff"
    },
    decisionTypes: {
      routing_plan: "Routing plan",
      ai_runtime: "AI runtime",
      manual_transition: "Manual change"
    },
    candidateTypes: {
      agent: "Human agent",
      team: "Team",
      department: "Department",
      ai_agent: "AI agent"
    },
    candidateStages: {
      configured_target: "Configured target check",
      conversation_sticky: "Conversation sticky",
      strategy_selection: "Strategy selection",
      team_scope: "Team scoping",
      eligible: "Eligibility check"
    },
    transitionTypes: {
      ai_takeover: "AI takeover",
      ai_unavailable_to_system: "AI unavailable, fallback to system queue",
      human_takeover: "Human takeover",
      supervisor_transfer: "Supervisor transfer"
    },
    ownerTypes: {
      system: "System",
      human: "Human",
      agent: "Human agent",
      ai: "AI"
    },
    conversationStatuses: {
      open: "Open",
      queued: "Queued",
      bot_active: "AI active",
      human_active: "Human active",
      waiting_customer: "Waiting for customer",
      waiting_internal: "Waiting internally",
      resolved: "Resolved"
    },
    queueStatuses: {
      assigned: "Assigned",
      pending: "Pending",
      resolved: "Resolved without queue",
      failed: "Failed"
    },
    reasons: {
      conversation_sticky: "Reused the AI already responsible for this conversation",
      conversation_sticky_other: "This conversation is sticky to another AI",
      strategy_least_busy: "Selected by the least-busy strategy",
      strategy_sticky: "Selected by the sticky strategy",
      configured_ai_agent_selected: "Selected the configured AI",
      configured_ai_agent_unavailable: "The configured AI is unavailable",
      not_configured_target: "Not the configured AI target",
      not_selected_by_strategy: "Not selected by the current strategy",
      policy_selected_human: "Policy decided to prefer humans",
      reserved_human_fallback: "Fell back to humans when AI was not suitable",
      preserve_existing_human_owner: "Kept the current human owner",
      agent_handoff_human_fallback: "Agent handoff fell back to humans",
      ai_handoff_human_dispatch: "AI requested a human handoff",
      ai_handoff_human_dispatch_fallback_any_group: "No one available in the target group, fell back to another human group",
      ai_handoff_forced_human: "This flow forces a human handoff",
      fallback_human_target: "Fell back to the default human target",
      no_active_ai_agent: "No AI is currently available",
      "no-eligible-agent": "No eligible human agent is currently available",
      "no-skill-group": "No skill group is configured",
      accepted_reserved_assignment: "Kept the reserved human assignment",
      excluded_for_reroute: "Excluded from this reroute",
      team_not_selected: "The candidate's team was not selected",
      team_has_no_eligible_agent: "This team has no eligible agents",
      agent_on_break: "The agent is on break",
      agent_not_scheduled: "The agent is not scheduled",
      outside_shift_window: "Outside the agent's shift window",
      agent_concurrency_disabled: "Concurrency is disabled for this agent",
      agent_concurrency_full: "The agent is at max concurrency",
      "ai-replied": "AI replied and took ownership",
      "conversation-resolved": "Conversation resolved",
      "supervisor-transfer": "Transferred by supervisor",
      sla_assignment_accept_timeout: "Assignment acceptance timed out"
    },
    fields: {
      planId: "Plan ID",
      currentHandlerId: "Current owner ID",
      currentHandlerType: "Current owner type",
      conversationStatus: "Conversation status",
      preserveHumanOwner: "Keep existing human owner",
      channelType: "Channel type",
      operatingMode: "Operating mode",
      issueSummary: "Issue summary",
      aiAgentId: "AI ID",
      aiAgentName: "AI name",
      selectionMode: "Selection mode",
      mode: "Mode",
      action: "Action",
      selectedOwnerType: "Selected owner",
      moduleId: "Module ID",
      skillGroupId: "Skill group ID",
      departmentId: "Department ID",
      teamId: "Team ID",
      assignedAgentId: "Human agent ID",
      strategy: "Strategy",
      status: "Queue status",
      activeConversationCount: "Active conversations",
      lastAssignedAt: "Last assigned at",
      teamName: "Team name",
      departmentName: "Department name",
      totalAgents: "Total agents",
      eligibleAgents: "Eligible agents",
      rejectBreakdown: "Reject breakdown",
      activeAssignments: "Active assignments",
      reservedAssignments: "Reserved assignments",
      todayNewCaseCount: "New cases today",
      maxConcurrency: "Max concurrency"
    }
  }
};
