export default {
  qaModule: {
    common: {
      empty: "No QA data",
      emptyQueue: "No cases in this queue",
      unknownCustomer: "Unknown customer",
      unrecognized: "Unrecognized",
      emptyMessage: "(empty message)",
      yes: "Yes",
      no: "No"
    },
    toolbar: {
      title: "QA Risk Routing",
      guideline: "QA Guideline",
      refresh: "Refresh",
      search: "Search",
      searchPlaceholder: "Search by case title, customer, or case ID",
      agentPlaceholder: "Filter by agents"
    },
    tabs: {
      risk: "Risk Queue",
      sample: "Sample Queue",
      autoPass: "Auto Pass",
      reviewed: "Reviewed",
      diff: "AI Diff"
    },
    dashboard: {
      todayQaCount: "Today's QA Cases",
      autoPassRate: "Auto-pass Rate",
      riskCaseCount: "Risk Cases",
      sampleCaseCount: "Sample Cases",
      averageScore: "Average Score",
      aiVsHumanDiff: "AI vs Human Gap",
      agentAverages: "Average Score by Agent",
      agent: "Agent",
      score: "Score",
      helper: "The page is result-first so tenants can understand service quality without opening every case."
    },
    card: {
      owner: "Owner Agent",
      aiScore: "AI Score",
      confidence: "Confidence",
      humanScore: "Human Score",
      scoreDiff: "Score Diff"
    },
    detail: {
      title: "QA Detail",
      customer: "Customer",
      owner: "Owner Agent",
      status: "Status",
      conversation: "Conversation",
      messagesTitle: "Message Stream (Current Case Only)",
      aiEvidence: "AI Evidence",
      timelineTitle: "Segment Timeline",
      messageCount: "Messages",
      reviewTitle: "AI Review and Human Action",
      currentQueue: "Current Queue",
      enterReasons: "Entered By",
      aiScore: "AI Score",
      aiVerdict: "AI Verdict",
      aiConfidence: "AI Confidence",
      riskLevel: "Risk Level",
      humanVerdict: "Human Verdict",
      notReviewed: "Not reviewed",
      reviewAction: "Review Action",
      totalScore: "Total Score",
      verdict: "Verdict",
      tags: "Tags",
      tagsPlaceholder: "Comma separated tags",
      summary: "Review Summary"
    },
    guideline: {
      title: "QA Guideline",
      description: "Tenants maintain the Markdown guideline directly. AI reads the guideline together with case and segment context to score automatically.",
      helper: "Use a stable structure such as Resolution, Courtesy, Accuracy, Compliance, and Timeliness to reduce LLM drift.",
      name: "Guideline Name",
      nameRequired: "Please enter a guideline name",
      content: "Markdown Content",
      contentRequired: "Please enter guideline content",
      insertTemplate: "Insert Recommended Template",
      defaultName: "Default QA Guideline"
    },
    actions: {
      viewDetail: "View Detail",
      confirm: "Confirm",
      modify: "Modify",
      reject: "Reject",
      submitReview: "Submit Review"
    },
    messages: {
      reviewSaved: "QA review saved",
      guidelineSaved: "QA guideline updated"
    }
  }
};
