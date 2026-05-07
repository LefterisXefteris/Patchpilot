export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type JsonSchema = {
  type: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  enum?: string[];
  additionalProperties?: boolean;
};

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
};

export type ToolCallPlan = {
  toolName: string;
  input: JsonObject;
};

export type AgentDecisionAction = 'ignore' | 'create_issue' | 'update_issue' | 'trigger_claude' | 'needs_human';

export type AgentDecision = {
  action: AgentDecisionAction;
  confidence: number;
  reason: string;
  issueNumber?: number;
  issueUrl?: string;
  sentryIssueId?: string;
  triggeredClaude?: boolean;
};

export type IncidentRunInput = {
  incidentId?: string;
  fixture?: AgentFixture;
  promptVariant?: string;
};

export type AgentFixture = {
  name: string;
  sentryIssues: JsonObject[];
  sentryEvents: Record<string, JsonObject | null>;
  githubIssues: JsonObject[];
  vercelDeployment?: JsonObject | null;
  vercelError?: string;
};

export type AgentRunSummary = {
  ok: boolean;
  runId: string;
  incidentId: string;
  decision: AgentDecision;
  selectedTools: string[];
  metrics: AgentMetrics;
  errors: string[];
};

export type AgentMetrics = {
  startedAt: string;
  completedAt: string;
  latencyMs: number;
  llmCalls: number;
  toolCalls: number;
  estimatedPromptTokens: number;
  estimatedCompletionTokens: number;
  estimatedCostUsd: number;
};

export type EvalScenario = {
  id: string;
  description: string;
  fixture: AgentFixture;
  expectedAction: AgentDecisionAction;
  expectedTools?: string[];
  mustRedact?: string[];
};

export type EvalScenarioResult = {
  id: string;
  passed: boolean;
  selectedTools: string[];
  finalDecision: AgentDecisionAction;
  latencyMs: number;
  estimatedCostUsd: number;
  failureReason?: string;
};

