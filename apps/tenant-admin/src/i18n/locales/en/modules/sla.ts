export default {
  slaModule: {
    config: {
      title: "Default SLA Configuration",
      description: "Maintain one tenant-wide SLA baseline. The platform uses it for first response, assignment reassign, follow-up closure, and resolution timeout handling.",
      edit: "Edit",
      editTitle: "Edit Default SLA",
      save: "Save Configuration",
      cancel: "Cancel",
      confirmTitle: "Confirm SLA Update",
      confirmDescription: "After saving, the new default timings will apply to subsequent conversations and exception re-dispatch.",
      confirmSave: "Save",
      confirmCancel: "Back",
      firstResponseTargetSec: "First Response Target (sec)",
      assignmentAcceptTargetSec: "Assignment Accept Target (sec)",
      subsequentResponseTargetSec: "Subsequent Response Target (sec)",
      subsequentResponseReassignWhen: "Reassign When Subsequent Response Times Out",
      followUpTargetSec: "Follow-up Target (sec)",
      followUpCloseMode: "Close Mode",
      disabled: "Disabled",
      updatedAt: "Last updated: {{value}}"
    },
    closeModes: {
      waitingCustomer: "Waiting Customer",
      semantic: "Semantic End"
    },
    reassignModes: {
      ownerUnavailable: "Reassign only if owner is unavailable",
      always: "Always reassign when overdue"
    },
    scenes: {
      firstResponse: "First Response Monitoring",
      firstResponseHelp: "When a customer sends a new message and no service-side reply arrives within the target, the conversation is recorded as a first-response breach and enters exception monitoring.",
      assignmentAccept: "Unaccepted Assignment Re-dispatch",
      assignmentAcceptHelp: "When a conversation is assigned to a human agent but remains unclaimed, the platform will automatically redistribute it after the timeout.",
      subsequentResponse: "Subsequent Response Re-dispatch",
      subsequentResponseHelp: "After the service side has replied once, if the customer replies again and the current owner does not continue the conversation in time, the platform records a breach and can reassign based on the selected rule.",
      followUp: "Follow-up Closure",
      followUpHelp: "After the service side has already replied, the platform can close the current service cycle if no follow-up happens for too long."
    },
    summary: {
      total: "Total Breaches",
      open: "Open",
      acknowledged: "Acknowledged",
      average: "Avg Breach (sec)"
    },
    filter: {
      title: "SLA Breach Search",
      refresh: "Refresh",
      statusPlaceholder: "Breach status",
      metricPlaceholder: "Metric",
      query: "Search",
      status: {
        open: "Open",
        acknowledged: "Acknowledged",
        resolved: "Resolved"
      },
      metric: {
        firstResponse: "First response timeout",
        assignmentAccept: "Assignment accept timeout",
        subsequentResponse: "Subsequent response timeout",
        followUp: "Follow-up timeout",
        resolution: "Resolution timeout"
      }
    },
    definitions: {
      title: "SLA Definitions",
      create: "New SLA Definition",
      name: "Definition Name",
      priority: "Priority",
      firstResponseTargetSec: "First Response Target (sec)",
      assignmentAcceptTargetSec: "Assignment Accept Target (sec)",
      followUpTargetSec: "Follow-up Target (sec)",
      resolutionTargetSec: "Resolution Target (sec)",
      status: "Status",
      actions: "Actions",
      active: "Active",
      inactive: "Disabled",
      disable: "Disable",
      enable: "Enable",
      edit: "Edit"
    },
    policies: {
      title: "Trigger Policies",
      create: "New Trigger Policy",
      name: "Policy Name",
      priority: "Priority",
      firstResponseActions: "First Response Actions",
      assignmentAcceptActions: "Assignment Accept Actions",
      followUpActions: "Follow-up Actions",
      resolutionActions: "Resolution Actions",
      status: "Status",
      actions: "Actions",
      active: "Active",
      inactive: "Disabled",
      disable: "Disable",
      enable: "Enable",
      edit: "Edit"
    },
    breaches: {
      title: "SLA Breaches",
      createdAt: "Triggered At",
      metric: "Metric",
      agentName: "Agent",
      caseId: "Case ID",
      conversationId: "Conversation ID",
      targetSec: "Target (sec)",
      actualSec: "Actual (sec)",
      breachSec: "Breach (sec)",
      severity: "Severity",
      status: "Status",
      actions: "Actions",
      acknowledge: "Acknowledge",
      resolve: "Resolve",
      empty: "-",
      severityWarning: "warning",
      severityCritical: "critical",
      statusOpen: "OPEN",
      statusAcknowledged: "ACK",
      statusResolved: "RESOLVED"
    },
    messages: {
      loadFailed: "Failed to load SLA data: {{message}}",
      configUpdated: "Default SLA configuration updated",
      saveFailed: "Save failed: {{message}}",
      breachStatusFailed: "Failed to update breach status: {{message}}"
    }
  }
};
