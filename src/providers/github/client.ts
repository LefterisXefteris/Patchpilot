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
    const target = this.targetRepository();

    if (!target.explicit) {
      return {
        provider: 'github',
        ok: false,
        checkedAt,
        details: {
          owner: this.config.owner,
          repo: this.config.repo,
          targetOwner: null,
          targetRepo: null,
        },
        missingScopes: ['target_repository'],
        errorCode: 'github_target_repository_missing',
        errorMessage: 'GITHUB_TARGET_OWNER and GITHUB_TARGET_REPO must point at the broken service repository.',
      };
    }

    try {
      const deps = this.deps ?? this.createDefaultDependencies();
      const token = await deps.createInstallationToken();
      const repository = await deps.getRepository(token, target.owner, target.repo);
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
          owner: target.owner,
          repo: target.repo,
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
        const target = this.targetRepository();
        const auth = createAppAuth({
          appId: this.config.appId,
          privateKey: this.config.privateKey.replace(/\\n/g, '\n'),
          installationId: Number(target.installationId),
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
      .filter(([permission, required]) => required && permissions[permission] === false)
      .map(([permission]) => permission);
  }

  private targetRepository(): { owner: string; repo: string; installationId: string; explicit: boolean } {
    return {
      owner: this.config.targetOwner ?? this.config.owner,
      repo: this.config.targetRepo ?? this.config.repo,
      installationId: this.config.targetInstallationId ?? this.config.installationId,
      explicit: Boolean(this.config.targetOwner && this.config.targetRepo),
    };
  }

  private details(repository: RepositoryMetadata): Record<string, string | number | boolean | null> {
    const target = this.targetRepository();

    return {
      owner: target.owner,
      repo: target.repo,
      agentOwner: this.config.owner,
      agentRepo: this.config.repo,
      fullName: repository.full_name,
      repositoryId: repository.id,
      private: repository.private,
      metadataPermission: repository.permissions?.metadata ?? null,
    };
  }
}
