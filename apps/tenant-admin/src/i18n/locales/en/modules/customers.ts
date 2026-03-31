export default {
  customersModule: {
    filter: {
      title: "Customer Search",
      refresh: "Refresh",
      createSegment: "New Segment",
      searchPlaceholder: "Search customer name / customer reference",
      tagPlaceholder: "Filter by tag",
      segmentPlaceholder: "Filter by segment",
      query: "Search"
    },
    table: {
      title: "Customer List",
      customer: "Customer",
      channel: "Channel",
      tier: "Tier",
      conversations: "Conversations",
      cases: "Cases",
      openCases: "Open Cases",
      tasks: "Tasks",
      lastContact: "Last Contact",
      lastCase: "Latest Case",
      caseWithId: "Case {{id}}",
      tags: "Tags",
      actions: "Actions",
      manageTags: "Manage Tags"
    },
    segments: {
      title: "Segment Rules",
      name: "Name",
      code: "Code",
      rule: "Rule",
      status: "Status",
      actions: "Actions",
      active: "ACTIVE",
      inactive: "DISABLED",
      run: "Run Segment",
      disable: "Disable",
      enable: "Enable"
    },
    tags: {
      title: "Tag Library",
      disable: "Disable",
      enable: "Enable",
      codeRequired: "Code is required",
      nameRequired: "Name is required",
      namePlaceholder: "Tag name",
      descriptionPlaceholder: "Description",
      add: "Add Tag"
    },
    segmentModal: {
      title: "New Customer Segment",
      code: "Code",
      name: "Name",
      namePlaceholder: "VIP Customers",
      description: "Description",
      tagsAny: "Match any tag (code, comma separated)",
      minConversationCount: "Minimum conversations",
      minTaskCount: "Minimum tasks",
      minCaseCount: "Minimum cases",
      minOpenCaseCount: "Minimum open cases",
      daysSinceLastConversationGte: "Days since last contact >=",
      daysSinceLastCaseActivityGte: "Days since last case activity >="
    },
    tagsModal: {
      title: "Customer Tags · {{name}}"
    },
    messages: {
      loadTagDataFailed: "Failed to load customer tag data: {{message}}",
      loadCustomersFailed: "Failed to load customers: {{message}}",
      tagsUpdated: "Customer tags updated",
      saveFailed: "Save failed: {{message}}",
      tagCreated: "Tag created",
      segmentCreated: "Segment created",
      matchedCustomers: "Matched {{count}} customers"
    }
  }
};
