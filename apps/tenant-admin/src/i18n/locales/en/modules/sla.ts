export default {
  slaModule: {
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
      definitionName: "SLA Definition",
      triggerPolicyName: "Trigger Policy",
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
    definitionModal: {
      editTitle: "Edit SLA Definition",
      createTitle: "New SLA Definition",
      name: "Definition Name",
      nameRequired: "Please enter the definition name",
      priority: "Priority",
      firstResponseTargetSec: "First Response Target (sec)",
      assignmentAcceptTargetSec: "Assignment Accept Target (sec)",
      assignmentAcceptExtra: "Maximum allowed time for assigned but not yet accepted cases.",
      assignmentAcceptPlaceholder: "Leave blank to skip assignment timeout monitoring",
      followUpTargetSec: "Follow-up Target (sec)",
      followUpExtra: "Maximum allowed time after handling when waiting for customer or waiting to close.",
      followUpPlaceholder: "Leave blank to skip follow-up timeout monitoring",
      resolutionTargetSec: "Resolution Target (sec)"
    },
    triggerModal: {
      editTitle: "Edit Trigger Policy",
      createTitle: "New Trigger Policy",
      name: "Policy Name",
      nameRequired: "Please enter the policy name",
      priority: "Priority",
      firstResponseActions: "First Response Breach Actions",
      assignmentAcceptActions: "Assignment Accept Breach Actions",
      followUpActions: "Follow-up Breach Actions",
      resolutionActions: "Resolution Breach Actions"
    },
    helper: {
      actionOptions: {
        alert: "Alert",
        escalate: "Escalate",
        reassign: "Reassign",
        closeCase: "Close Case"
      },
      closeModes: {
        waitingCustomer: "Waiting Customer",
        semantic: "Semantic End"
      },
      addAction: "Add Action",
      delete: "Delete",
      emptyActions: "-",
      closeCaseWithMode: "Close ({{mode}})"
    },
    messages: {
      loadFailed: "Failed to load SLA data: {{message}}",
      definitionUpdated: "SLA definition updated",
      definitionCreated: "SLA definition created",
      triggerUpdated: "Trigger policy updated",
      triggerCreated: "Trigger policy created",
      saveFailed: "Save failed: {{message}}",
      updateFailed: "Update failed: {{message}}",
      breachStatusFailed: "Failed to update breach status: {{message}}"
    }
  }
};
