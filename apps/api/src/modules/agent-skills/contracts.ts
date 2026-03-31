export type TenantSkillDefinition = {
  capabilityId: string;
  tenantId: string;
  slug: string;
  name: string;
  description: string | null;
  status: string;
  triggerHints: Record<string, unknown>;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  policyConfig: Record<string, unknown>;
  executionStrategy: Record<string, unknown>;
  skillMarkdown: string | null;
  formsMarkdown: string | null;
  referenceMarkdown: string | null;
  scripts: Array<{
    scriptKey: string;
    name: string;
    fileName: string;
    language: string;
    sourceCode: string;
    requirements: string[];
    envRefs: string[];
    envBindings: Array<{
      envKey: string;
      envValue: string;
    }>;
    enabled: boolean;
  }>;
};

export type SkillPlanningInput = {
  tenantId: string;
  channelType: string;
  actorRole: "ai" | "agent" | "workflow";
  moduleId?: string | null;
  ownerMode?: string | null;
};

export type CapabilitySuggestion = {
  skillSlug: string;
  reason: string;
  confidence: number;
};

export type CapabilitySuggestionResult = {
  candidates: CapabilitySuggestion[];
  requiresClarification: boolean;
  clarificationQuestion: string | null;
};
