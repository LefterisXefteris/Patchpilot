import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';

import type { AppConfig } from '../../config/schema.js';

export type GitHubIssueSummary = {
  number: number;
  title: string;
  body?: string | null;
  htmlUrl?: string;
  labels?: string[];
  state?: string;
};

export type CreateGitHubIssueInput = {
  title: string;
  body: string;
};

export const BACK_TO_SERVICE_MARKER_PREFIX = '<!-- back-to-service:sentry-issue-id:';

export type GitHubIssueDependencies = {
  createInstallationToken: () => Promise<string>;
  listOpenIssues: (token: string, owner: string, repo: string) => Promise<GitHubIssueSummary[]>;
  createIssue: (token: string, owner: string, repo: string, input: CreateGitHubIssueInput) => Promise<GitHubIssueSummary>;
  createIssueComment: (token: string, owner: string, repo: string, issueNumber: number, body: string) => Promise<void>;
  addLabels?: (token: string, owner: string, repo: string, issueNumber: number, labels: string[]) => Promise<void>;
  closeIssue?: (token: string, owner: string, repo: string, issueNumber: number) => Promise<void>;
  createRepositoryDispatch?: (
    token: string,
    owner: string,
    repo: string,
    eventType: string,
    clientPayload: Record<string, unknown>,
  ) => Promise<void>;
};

export class GitHubIssueSyncClient {
  constructor(
    private readonly config: AppConfig['github'],
    private readonly deps?: GitHubIssueDependencies,
  ) {}

  async findIssueByMarker(marker: string): Promise<GitHubIssueSummary | undefined> {
    const deps = this.deps ?? this.createDefaultDependencies();
    const token = await deps.createInstallationToken();
    const target = this.targetRepository();
    const issues = await deps.listOpenIssues(token, target.owner, target.repo);
    return issues.find((issue) => issue.body?.includes(marker));
  }

  async createIssue(input: CreateGitHubIssueInput): Promise<GitHubIssueSummary> {
    const deps = this.deps ?? this.createDefaultDependencies();
    const token = await deps.createInstallationToken();
    const target = this.targetRepository();
    return deps.createIssue(token, target.owner, target.repo, input);
  }

  async addIssueComment(issueNumber: number, body: string): Promise<void> {
    const deps = this.deps ?? this.createDefaultDependencies();
    const token = await deps.createInstallationToken();
    const target = this.targetRepository();
    await deps.createIssueComment(token, target.owner, target.repo, issueNumber, body);
  }

  async listIncidentIssues(limit = 25): Promise<GitHubIssueSummary[]> {
    const issues = await this.listOpenIssues();
    return issues
      .filter((issue) => issue.body?.includes(BACK_TO_SERVICE_MARKER_PREFIX))
      .slice(0, limit);
  }

  async listOpenIssues(): Promise<GitHubIssueSummary[]> {
    const deps = this.deps ?? this.createDefaultDependencies();
    const token = await deps.createInstallationToken();
    const target = this.targetRepository();
    return deps.listOpenIssues(token, target.owner, target.repo);
  }

  async addIssueLabels(issueNumber: number, labels: string[]): Promise<void> {
    const deps = this.deps ?? this.createDefaultDependencies();
    if (!deps.addLabels) {
      throw new Error('GitHub addLabels dependency is not configured');
    }
    const token = await deps.createInstallationToken();
    const target = this.targetRepository();
    await deps.addLabels(token, target.owner, target.repo, issueNumber, labels);
  }

  async closeIssue(issueNumber: number): Promise<void> {
    const deps = this.deps ?? this.createDefaultDependencies();
    if (!deps.closeIssue) {
      throw new Error('GitHub closeIssue dependency is not configured');
    }
    const token = await deps.createInstallationToken();
    const target = this.targetRepository();
    await deps.closeIssue(token, target.owner, target.repo, issueNumber);
  }

  async createRepositoryDispatch(eventType: string, clientPayload: Record<string, unknown>): Promise<void> {
    const deps = this.deps ?? this.createDefaultDependencies();
    if (!deps.createRepositoryDispatch) {
      throw new Error('GitHub repository dispatch dependency is not configured');
    }
    const token = await deps.createInstallationToken();
    const target = this.targetRepository();
    await deps.createRepositoryDispatch(token, target.owner, target.repo, eventType, clientPayload);
  }

  targetRepository(): { owner: string; repo: string; installationId: string } {
    return {
      owner: this.config.targetOwner ?? this.config.owner,
      repo: this.config.targetRepo ?? this.config.repo,
      installationId: this.config.targetInstallationId ?? this.config.installationId,
    };
  }

  private createDefaultDependencies(): GitHubIssueDependencies {
    return {
      createInstallationToken: async () => {
        const target = this.targetRepository();
        const auth = createAppAuth({
          appId: this.config.appId,
          privateKey: this.config.privateKey.replace(/\\n/g, '\n'),
          installationId: Number(target.installationId),
        });
        const installationAuthentication = await auth({ type: 'installation' });
        return installationAuthentication.token;
      },
      listOpenIssues: async (token, owner, repo) => {
        const octokit = new Octokit({ auth: token });
        const response = await octokit.issues.listForRepo({ owner, repo, state: 'open', per_page: 100 });
        return response.data
          .filter((issue) => !('pull_request' in issue))
          .map((issue) => ({
            number: issue.number,
            title: issue.title,
            body: issue.body,
            htmlUrl: issue.html_url,
            labels: (issue.labels ?? [])
              .map((label) => (typeof label === 'string' ? label : label.name ?? ''))
              .filter(Boolean),
            state: issue.state,
          }));
      },
      createIssue: async (token, owner, repo, input) => {
        const octokit = new Octokit({ auth: token });
        const response = await octokit.issues.create({
          owner,
          repo,
          title: input.title,
          body: input.body,
        });
        return {
          number: response.data.number,
          title: response.data.title,
          body: response.data.body,
          htmlUrl: response.data.html_url,
        };
      },
      createIssueComment: async (token, owner, repo, issueNumber, body) => {
        const octokit = new Octokit({ auth: token });
        await octokit.issues.createComment({ owner, repo, issue_number: issueNumber, body });
      },
      addLabels: async (token, owner, repo, issueNumber, labels) => {
        const octokit = new Octokit({ auth: token });
        await octokit.issues.addLabels({ owner, repo, issue_number: issueNumber, labels });
      },
      closeIssue: async (token, owner, repo, issueNumber) => {
        const octokit = new Octokit({ auth: token });
        await octokit.issues.update({ owner, repo, issue_number: issueNumber, state: 'closed' });
      },
      createRepositoryDispatch: async (token, owner, repo, eventType, clientPayload) => {
        const octokit = new Octokit({ auth: token });
        await octokit.repos.createDispatchEvent({
          owner,
          repo,
          event_type: eventType,
          client_payload: clientPayload,
        });
      },
    };
  }
}
