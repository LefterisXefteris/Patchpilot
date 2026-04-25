import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';

import type { AppConfig } from '../../config/schema.js';
import { redactText } from '../../security/redact.js';
import type { IntegrationValidationResult } from '../../types/integration-validation.js';

export const REQUIRED_GITHUB_REPOSITORY_PERMISSIONS = {
  metadata: true,
} as const;

type RepositoryMetadata = {
  id: number;
  full_name: string;
  private: boolean;
  permissions?: Record<string, boolean>;
};

export type GitHubValidationDependencies = {
  createInstallationToken: () => Promise<string>;
  getRepository: (token: string, owner: string, repo: string) => Promise<RepositoryMetadata>;
};

export class GitHubClient {
  constructor(
    private readonly config: AppConfig['github'],
    private readonly deps?: GitHubValidationDependencies,
  ) {}

  async validateAccess(): Promise<IntegrationValidationResult> {
    const checkedAt = new Date().toISOString();

    try {
      const deps = this.deps ?? this.createDefaultDependencies();
      const token = await deps.createInstallationToken();
      const repository = await deps.getRepository(token, this.config.owner, this.config.repo);
      const missingScopes = this.missingPermissions(repository.permissions);

      if (missingScopes.length > 0) {
        return {
          provider: 'github',
          ok: false,
          checkedAt,
          details: this.details(repository),
          missingScopes,
          errorCode: 'github_missing_permissions',
          errorMessage: `Missing required GitHub repository permissions: ${missingScopes.join(', ')}`,
        };
      }

      return {
        provider: 'github',
        ok: true,
        checkedAt,
        details: this.details(repository),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        provider: 'github',
        ok: false,
        checkedAt,
        details: {
          owner: this.config.owner,
          repo: this.config.repo,
        },
        errorCode: 'github_request_failed',
        errorMessage: redactText(errorMessage, [
          this.config.privateKey,
          this.config.webhookSecret,
        ]),
      };
    }
  }

  private createDefaultDependencies(): GitHubValidationDependencies {
    return {
      createInstallationToken: async () => {
        const auth = createAppAuth({
          appId: this.config.appId,
          privateKey: this.config.privateKey.replace(/\\n/g, '\n'),
          installationId: Number(this.config.installationId),
        });
        const installationAuthentication = await auth({ type: 'installation' });
        return installationAuthentication.token;
      },
      getRepository: async (token, owner, repo) => {
        const octokit = new Octokit({ auth: token });
        const response = await octokit.repos.get({ owner, repo });
        return {
          id: response.data.id,
          full_name: response.data.full_name,
          private: response.data.private,
          permissions: response.data.permissions,
        };
      },
    };
  }

  private missingPermissions(permissions: Record<string, boolean> | undefined): string[] {
    if (!permissions) {
      return [];
    }

    return Object.entries(REQUIRED_GITHUB_REPOSITORY_PERMISSIONS)
      .filter(([permission, required]) => required && permissions[permission] !== true)
      .map(([permission]) => permission);
  }

  private details(repository: RepositoryMetadata): Record<string, string | number | boolean | null> {
    return {
      owner: this.config.owner,
      repo: this.config.repo,
      fullName: repository.full_name,
      repositoryId: repository.id,
      private: repository.private,
      metadataPermission: repository.permissions?.metadata ?? null,
    };
  }
}
