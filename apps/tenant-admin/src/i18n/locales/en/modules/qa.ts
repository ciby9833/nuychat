export default {
  qaModule: {
    filter: {
      title: "QA Management",
      refresh: "Refresh",
      rules: "Dimension Settings",
      create: "New QA Review",
      agentPlaceholder: "Filter by agent",
      tagPlaceholder: "Filter by tag (for example: service attitude)",
      minScorePlaceholder: "Minimum score",
      query: "Search"
    },
    stats: {
      total: "Total Reviews",
      average: "Average Score on Page",
      rules: "QA Dimensions"
    },
    table: {
      title: "QA Review List",
      reviewTime: "Review Time",
      caseId: "Case ID",
      conversationId: "Conversation ID",
      agent: "Agent",
      reviewer: "Reviewer",
      score: "Score",
      tags: "Tags",
      status: "Status",
      actions: "Actions",
      publish: "Publish",
      revertDraft: "Revert to Draft",
      emptyTag: "-"
    },
    status: {
      draft: "DRAFT",
      published: "PUBLISHED"
    },
    rulesModal: {
      title: "QA Dimension Settings",
      code: "Code",
      name: "Name",
      weight: "Weight",
      enabled: "Enabled",
      active: "Enabled",
      inactive: "Disabled"
    },
    createModal: {
      title: "New QA Review",
      conversation: "Conversation",
      conversationRequired: "Please select a conversation",
      unknownCustomer: "Unknown customer",
      caseLabel: "Case {{id}}",
      conversationLabel: "Conversation {{id}}",
      reviewedSuffix: "(Reviewed)",
      score: "Total Score (0-100)",
      tags: "Tags (comma separated)",
      tagsPlaceholder: "Service attitude, resolution ability, improper AI usage",
      note: "Comments",
      status: "Status",
      publish: "Publish",
      draft: "Draft"
    },
    messages: {
      loadFailed: "Failed to load QA data: {{message}}",
      reviewSaved: "QA review saved",
      saveFailed: "Save failed: {{message}}",
      rulesUpdated: "QA dimensions updated",
      updateFailed: "Update failed: {{message}}",
      statusUpdateFailed: "Failed to update status: {{message}}"
    }
  }
};
