import core from "./core";
import agents from "./modules/agents";
import aiConfig from "./modules/ai-config";
import aiConversations from "./modules/ai-conversations";
import aiSeats from "./modules/ai-seats";
import aiCapabilities from "./modules/ai-capabilities";
import channelsModule from "./modules/channels";
import dispatchAudit from "./modules/dispatch-audit";
import memoryQa from "./modules/memory-qa";
import routing from "./modules/routing";
import analytics from "./modules/analytics";
import cases from "./modules/cases";
import customersModule from "./modules/customers";
import organizationModule from "./modules/organization";
import qaModule from "./modules/qa";
import shiftsModule from "./modules/shifts";
import slaModule from "./modules/sla";
import supervisorModule from "./modules/supervisor";
import tasksModule from "./modules/tasks";
import waMonitorModule from "./modules/wa-monitor";
import waConversationsModule from "./modules/wa-conversations";

export default {
  ...core,
  cases: {
    ...core.cases,
    ...cases.cases
  },
  analytics: {
    ...core.analytics,
    ...analytics.analytics
  },
  routing: {
    ...core.routing,
    ...routing.routing
  },
  dispatchAudit: {
    ...core.dispatchAudit,
    ...dispatchAudit.dispatchAudit
  },
  ...agents,
  ...aiConfig,
  ...aiConversations,
  ...aiSeats,
  ...aiCapabilities,
  ...channelsModule,
  ...memoryQa,
  ...customersModule,
  ...organizationModule,
  ...qaModule,
  ...shiftsModule,
  ...slaModule,
  ...supervisorModule,
  ...tasksModule,
  ...waMonitorModule,
  ...waConversationsModule
};
