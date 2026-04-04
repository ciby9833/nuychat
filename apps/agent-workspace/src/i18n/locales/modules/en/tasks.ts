export default {
  tasksWorkspace: {
    pageTitle: "Task Workspace",
    listTitle: "My Tasks",
    listSubtitle: "Browse tasks by status and open details to handle them.",
    loading: "Loading tasks...",
    empty: "No pending tasks right now",
    status: {
      open: "Open",
      in_progress: "In Progress",
      done: "Done",
      cancelled: "Cancelled"
    },
    priority: {
      urgent: "Urgent",
      high: "High",
      normal: "Normal",
      low: "Low"
    },
    replyStatus: {
      pending: "Customer reply pending",
      sent: "Customer replied",
      waived: "Reply waived"
    },
    filters: {
      recent3Days: "Last 3 days",
      recent7Days: "Last 7 days",
      recent30Days: "Last 30 days",
      allTime: "All time",
      taskPlaceholder: "Search tasks",
      customerPlaceholder: "Search customers"
    },
    detail: {
      empty: "Select a task on the left to view details and actions",
      unknownCustomer: "Unknown customer",
      previewConversation: "Preview Conversation",
      assignee: "Owner {{name}}",
      dueAt: "Due {{time}}",
      taskDescription: "Task Description",
      sourceMessage: "Source Message",
      actions: "Actions",
      start: "Start",
      resetToOpen: "Move Back To Open",
      done: "Complete",
      doneWithReply: "Reply & Complete",
      confirmAction: "Confirm",
      confirmStart: "Confirm moving this task to in progress",
      confirmReset: "Confirm moving this task back to open",
      confirmDoneOnly: "Confirm completing this task directly",
      confirmDoneWithReply: "Confirm completing this task with the current reply settings",
      sendResultToCustomer: "Send the result to the customer after completion",
      customerReplyPlaceholder: "Enter the result message for the customer",
      cancel: "Cancel",
      confirmDone: "Confirm Completion",
      collaboration: "Handling History",
      collaborationEmpty: "No handling records yet",
      addRecord: "Add Handling Record",
      addRecordPlaceholder: "Describe the progress, collaboration note, or result",
      addRecordAction: "Save Record",
      loading: "Loading task details..."
    },
    preview: {
      titleFallback: "Conversation Preview",
      loading: "Loading conversation preview...",
      empty: "No conversation content available",
      currentOwner: "Current {{name}}",
      unknownSender: "unknown",
      openAttachment: "Open",
      attachmentFallback: "Attachment"
    }
  }
};
