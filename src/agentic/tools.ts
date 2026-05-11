import { sentryIssueMarker } from '../agent/sync.js';
import type { AppConfig } from '../config/schema.js';
import { GitHubIssueSyncClient } from '../providers/github/issues.js';
import type { AgentFixture, JsonObject, JsonValue, ToolDefinition } from './types.js';

export type ToolExecutionContext = {
  fixture: AgentFixture;
  dryRun: boolean;
  config?: AppConfig;
};

export type ToolExecutionResult = {
  ok: boolean;
  output: JsonObject;
  errorCode?: string;
  errorMessage?: string;
};

export type AgentTool = ToolDefinition & {
  execute: (input: JsonObject, context: ToolExecutionContext) => Promise<ToolExecutionResult>;
};

const objectSchema = (properties: Record<string, ToolDefinition['inputSchema']>, required: string[] = []) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});

const stringSchema = (description: string) => ({ type: 'string', description });
const numberSchema = (description: string) => ({ type: 'number', description });
const booleanSchema = (description: string) => ({ type: 'boolean', description });

export function createIncidentTools(): AgentTool[] {
  return [
    {
      name: 'github_list_sentry_incident_issues',
      description: 'List open GitHub issues that may have been created by Sentry GitHub integration.',
      inputSchema: objectSchema({ limit: numberSchema('Maximum number of issues to return.') }),
      outputSchema: objectSchema({ issues: { type: 'array', items: { type: 'object' } } }),
      execute: async (input, context) => ({
        ok: true,
        output: {
          issues: context.fixture.githubIssues.slice(0, Number(input.limit ?? 10)) as JsonValue,
        },
      }),
    },
    {
      name: 'sentry_list_issues',
      description: 'Legacy fallback: list unresolved Sentry issues for the configured production project.',
      inputSchema: objectSchema({ limit: numberSchema('Maximum number of issues to return.') }),
      outputSchema: objectSchema({ issues: { type: 'array', items: { type: 'object' } } }),
      execute: async (input, context) => ({
        ok: true,
        output: {
          issues: context.fixture.sentryIssues.slice(0, Number(input.limit ?? 10)) as JsonValue,
        },
      }),
    },
    {
      name: 'sentry_get_issue_event',
      description: 'Fetch the recommended/latest event for a Sentry issue, including stack and tags.',
      inputSchema: objectSchema({ issueId: stringSchema('Sentry issue id.') }, ['issueId']),
      outputSchema: objectSchema({ event: { type: 'object' }, found: booleanSchema('Whether an event was found.') }),
      execute: async (input, context) => {
        const issueId = String(input.issueId);
        const event = context.fixture.sentryEvents[issueId];
        if (!event) {
          return {
            ok: false,
            output: { found: false, event: null },
            errorCode: 'sentry_event_missing',
            errorMessage: `No recommended event fixture for Sentry issue ${issueId}`,
          };
        }
        return { ok: true, output: { found: true, event } };
      },
    },
    {
      name: 'github_find_or_create_incident_issue',
      description: 'Find or create the GitHub issue that tracks one Sentry incident.',
      inputSchema: objectSchema(
        {
          sentryIssueId: stringSchema('Sentry issue id.'),
          shortId: stringSchema('Sentry short id.'),
          title: stringSchema('GitHub issue title.'),
          body: stringSchema('GitHub issue body.'),
          create: booleanSchema('Whether creation is allowed.'),
        },
        ['sentryIssueId', 'shortId', 'title', 'body', 'create'],
      ),
      outputSchema: objectSchema({
        action: stringSchema('created_issue, updated_issue, found_issue, or would_create_issue.'),
        issueNumber: numberSchema('GitHub issue number.'),
        issueUrl: stringSchema('GitHub issue URL.'),
      }),
      execute: async (input, context) => {
        const marker = sentryIssueMarker(String(input.sentryIssueId));
        const existing = context.fixture.githubIssues.find((issue) => String(issue.body ?? '').includes(marker));
        if (existing) {
          return {
            ok: true,
            output: {
              action: 'found_issue',
              issueNumber: Number(existing.number ?? 1),
              issueUrl: String(existing.htmlUrl ?? existing.html_url ?? ''),
            },
          };
        }

        if (!input.create) {
          return { ok: true, output: { action: 'would_create_issue', issueNumber: 0, issueUrl: '' } };
        }

        const issueNumber = context.fixture.githubIssues.length + 1;
        const issueUrl = `https://github.com/LefterisXefteris/snapsyncai/issues/${issueNumber}`;
        context.fixture.githubIssues.push({
          number: issueNumber,
          title: String(input.title),
          body: String(input.body),
          htmlUrl: issueUrl,
        });

        return {
          ok: true,
          output: {
            action: context.dryRun ? 'would_create_issue' : 'created_issue',
            issueNumber,
            issueUrl,
          },
        };
      },
    },
    {
      name: 'vercel_get_latest_production_deployment',
      description: 'Read the latest production deployment metadata for the target Vercel project.',
      inputSchema: objectSchema({ projectId: stringSchema('Vercel project id or name.') }),
      outputSchema: objectSchema({ deployment: { type: 'object' }, found: booleanSchema('Whether deployment metadata exists.') }),
      execute: async (_input, context) => {
        if (context.fixture.vercelError) {
          return {
            ok: false,
            output: { found: false, deployment: null },
            errorCode: 'vercel_request_failed',
            errorMessage: context.fixture.vercelError,
          };
        }
        return {
          ok: true,
          output: {
            found: Boolean(context.fixture.vercelDeployment),
            deployment: context.fixture.vercelDeployment ?? {},
          },
        };
      },
    },
    {
      name: 'severity_calculator',
      description: 'Calculate incident severity and confidence from event count, user impact, environment, and evidence.',
      inputSchema: objectSchema({
        level: stringSchema('Sentry level.'),
        environment: stringSchema('Issue environment.'),
        eventCount: numberSchema('Event count.'),
        userCount: numberSchema('Affected users.'),
        hasEvent: booleanSchema('Whether detailed event evidence exists.'),
      }),
      outputSchema: objectSchema({
        severity: stringSchema('low, medium, high, or critical.'),
        confidence: numberSchema('0 to 1 confidence.'),
        shouldPatch: booleanSchema('Whether autonomous patching should be attempted.'),
      }),
      execute: async (input) => {
        const eventCount = Number(input.eventCount ?? 0);
        const userCount = Number(input.userCount ?? 0);
        const isProduction = String(input.environment ?? '') === 'production';
        const hasEvent = Boolean(input.hasEvent);
        const score = (isProduction ? 0.35 : 0) + (eventCount >= 5 ? 0.25 : 0.1) + (userCount >= 1 ? 0.2 : 0) + (hasEvent ? 0.2 : 0);
        const confidence = Number(Math.min(score, 0.95).toFixed(2));
        const severity = confidence >= 0.85 ? 'high' : confidence >= 0.6 ? 'medium' : 'low';
        return {
          ok: true,
          output: {
            severity,
            confidence,
            shouldPatch: isProduction && confidence >= 0.75,
          },
        };
      },
    },
    {
      name: 'github_repository_dispatch_claude',
      description: 'Trigger the configured target repository repair workflow with a safe incident payload.',
      inputSchema: objectSchema(
        {
          sentryIssueId: stringSchema('Sentry issue id.'),
          shortId: stringSchema('Sentry short id.'),
          issueNumber: numberSchema('GitHub incident issue number.'),
          issueUrl: stringSchema('GitHub incident issue URL.'),
          title: stringSchema('Incident title.'),
          memoryContext: stringSchema('Compact relevant prior incident memory, advisory only.'),
          suspectFileContext: stringSchema('Ranked suspect files to inspect first, advisory only.'),
        },
        ['sentryIssueId', 'shortId', 'issueNumber', 'issueUrl', 'title'],
      ),
      outputSchema: objectSchema({
        dispatched: booleanSchema('Whether dispatch was sent.'),
        eventType: stringSchema('Repository dispatch event type.'),
        repairProvider: stringSchema('Repair worker provider selected by Back To Service.'),
      }),
      execute: async (input, context) => {
        const repairProvider = context.config?.repair.provider ?? 'claude';
        const eventType = repairProvider === 'codex' ? 'back-to-service.incident.codex' : 'back-to-service.incident';
        if (!context.config || context.dryRun) {
          return {
            ok: true,
            output: {
              dispatched: false,
              eventType,
              repairProvider,
            },
          };
        }

        await new GitHubIssueSyncClient(context.config.github).createRepositoryDispatch(eventType, {
          sentryIssueId: input.sentryIssueId,
          shortId: input.shortId,
          issueNumber: input.issueNumber,
          issueUrl: input.issueUrl,
          title: input.title,
          memoryContext: input.memoryContext,
          suspectFileContext: input.suspectFileContext,
          repairProvider,
        });

        return {
          ok: true,
          output: {
            dispatched: true,
            eventType,
            repairProvider,
          },
        };
      },
    },
    {
      name: 'github_add_agent_status_comment',
      description: 'Add a lightweight Back To Service status comment to an existing GitHub incident issue.',
      inputSchema: objectSchema(
        {
          issueNumber: numberSchema('GitHub incident issue number.'),
          body: stringSchema('Status comment body.'),
        },
        ['issueNumber', 'body'],
      ),
      outputSchema: objectSchema({
        commented: booleanSchema('Whether a comment was written.'),
      }),
      execute: async (input, context) => {
        if (!context.config || context.dryRun) {
          return { ok: true, output: { commented: false } };
        }

        await new GitHubIssueSyncClient(context.config.github).addIssueComment(Number(input.issueNumber), String(input.body));
        return { ok: true, output: { commented: true } };
      },
    },
  ];
}

export function toolSchemas(tools: AgentTool[]): ToolDefinition[] {
  return tools.map(({ name, description, inputSchema, outputSchema }) => ({
    name,
    description,
    inputSchema,
    outputSchema,
  }));
}
