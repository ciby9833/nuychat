export default {
  routing: {
    table: {
      module: "Module",
      operatingMode: "Operating Mode",
      status: "Status",
      skillGroup: "Skill Group",
      moduleName: "Module",
      priority: "Priority",
      rule: "Rule",
      conditions: "Matched Conditions",
      target: "Target",
      skillAndStrategy: "Skill Group / Strategy"
    },
    form: {
      editRule: "Edit Routing Rule",
      createRule: "New Routing Rule",
      editModule: "Edit Module",
      createModule: "New Module",
      editSkillGroup: "Edit Skill Group",
      createSkillGroup: "New Skill Group",
      create: "Create",
      ruleNamePlaceholder: "WhatsApp VIP after-sales",
      ruleName: "Rule Name",
      ruleNameRequired: "Please enter the rule name",
      priorityRequired: "Please enter the priority",
      enabled: "Enabled",
      matchConditions: "Matched Conditions",
      channel: "Channel",
      anyChannel: "Any channel",
      channelInstance: "Number / Channel Instance",
      anyChannelInstance: "Any number / instance",
      language: "Language",
      anyLanguage: "Any language",
      customerTier: "Customer Tier",
      anyTier: "Any tier",
      routingAction: "Routing Action",
      executionMode: "Execution Mode",
      executionHint: "Execution mode decides whether the rule prefers AI, humans, or only one handling path.",
      humanTarget: "Human Target",
      targetDepartment: "Target Department",
      anyDepartment: "Any department",
      targetTeam: "Target Team",
      anyTeamInDepartment: "Any team in department",
      targetSkillGroup: "Target Skill Group",
      targetSkillGroupRequired: "Please select a skill group",
      assignmentStrategy: "Assignment Strategy",
      aiAgent: "AI Agent",
      autoSelectAi: "Leave empty to auto-select by AI strategy",
      aiAssignmentStrategy: "AI Assignment Strategy",
      capacityAndOverrides: "Capacity & Overrides",
      humanToAiThreshold: "Human to AI Threshold (%)",
      noOverflow: "No overflow",
      aiToHumanThreshold: "AI to Human Threshold (%)",
      aiSoftConcurrencyLimit: "AI Soft Concurrency Limit",
      loadEstimate: "Load estimate",
      hybridStrategy: "Hybrid Strategy",
      customerRequestsHuman: "Customer Requests Human",
      aiUnhandled: "AI Unhandled",
      humanKeywords: "Human keywords (one per line)",
      humanKeywordsPlaceholder: "human\ntransfer to human\nsupport",
      fallbackTarget: "Fallback Target",
      fallbackDepartment: "Fallback Department",
      fallbackReuseHumanTarget: "Reuse human target",
      fallbackTeam: "Fallback Team",
      fallbackSkillGroup: "Fallback Skill Group",
      fallbackStrategy: "Fallback Strategy",
      aiHint: "Fixed AI agent takes priority; when empty, the system selects from enabled AI agents by AI strategy.",
      moduleCode: "Module Code",
      moduleCodeRequired: "Please enter the module code",
      moduleName: "Module Name",
      moduleNameRequired: "Please enter the module name",
      description: "Description",
      skillGroupModule: "Module",
      skillGroupModuleRequired: "Please select a module",
      skillGroupCode: "Skill Group Code",
      skillGroupCodeRequired: "Please enter the skill group code",
      skillGroupName: "Skill Group Name",
      skillGroupNameRequired: "Please enter the skill group name"
    },
    confirm: {
      deleteRuleTitle: "Delete this rule?",
      deleteRuleDescription: "The routing rule will stop taking effect immediately after deletion.",
      deleteModuleTitle: "Delete this module?",
      deleteModuleDescription: "Clear all skill groups under this module before deleting it.",
      deleteSkillGroupTitle: "Delete this skill group?",
      deleteSkillGroupDescription: "If this skill group is still referenced by agents or routing rules, deletion will fail."
    },
    state: {
      active: "Enabled",
      inactive: "Disabled",
      createModuleFirst: "Create a module before maintaining skill groups."
    },
    summary: {
      priority: "Priority {{count}}",
      auto: "Auto",
      any: "Any",
      anyDepartment: "Any department",
      autoTeam: "Auto team selection",
      reuseHumanTarget: "Reuse human target"
    },
    messages: {
      ruleUpdated: "Routing rule updated",
      ruleCreated: "Routing rule created",
      ruleDeleted: "Routing rule deleted",
      ruleMissing: "The current rule no longer exists or no longer belongs here. The list has been refreshed. Please reselect and try again.",
      moduleUpdated: "Module updated",
      moduleCreated: "Module created",
      moduleDeleted: "Module deleted",
      skillGroupUpdated: "Skill group updated",
      skillGroupCreated: "Skill group created",
      skillGroupDeleted: "Skill group deleted"
    },
    options: {
      strategy: {
        least_busy: "Least busy",
        balanced_new_case: "Balanced new cases",
        round_robin: "Round robin",
        sticky: "Sticky assignment"
      },
      language: {
        zh: "Chinese",
        en: "English",
        id: "Bahasa Indonesia"
      },
      moduleMode: {
        ai_first: "AI first",
        human_first: "Human first",
        ai_autonomous: "AI autonomous",
        workflow_first: "Workflow first"
      },
      executionMode: {
        ai_first: "AI first",
        human_first: "Human first",
        ai_only: "AI only",
        human_only: "Human only",
        hybrid: "Hybrid"
      },
      hybridStrategy: {
        load_balanced: "Load balanced",
        prefer_human: "Prefer human",
        prefer_ai: "Prefer AI"
      },
      override: {
        force_human: "Force human",
        allow_policy: "Follow policy"
      },
      aiUnhandled: {
        force_human: "Force human",
        queue_human: "Queue for human",
        allow_policy: "Follow policy"
      }
    }
  }
};
