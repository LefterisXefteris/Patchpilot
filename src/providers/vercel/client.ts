import type { AppConfig } from '../../config/schema.js';
import { redactText } from '../../security/redact.js';
import type { IntegrationValidationResult } from '../../types/integration-validation.js';

type VercelDeployment = {
  uid: string;
  url?: string;
  state?: string;
  target?: string;
  createdAt?: number;
};

export type VercelValidationDependencies = {
  listDeployments: (params: {
    token: string;
    teamId?: string;
    projectId: string;
  }) => Promise<{ deployments: VercelDeployment[] }>;
};

export class VercelClient {
  constructor(
    private readonly config: AppConfig['vercel'],
    private readonly deps?: VercelValidationDependencies,
  ) {}

  async validateAccess(): Promise<IntegrationValidationResult> {
    const checkedAt = new Date().toISOString();

    try {
      const deps = this.deps ?? this.createDefaultDependencies();
      const response = await deps.listDeployments({
        token: this.config.token,
        teamId: this.config.teamId,
        projectId: this.config.projectId,
      });
      const latest = response.deployments[0];

      return {
        provider: 'vercel',
        ok: true,
        checkedAt,
        details: {
          projectId: this.config.projectId,
          teamId: this.config.teamId ?? null,
          teamSlug: this.config.teamSlug ?? null,
          teamSlugUsedForApi: false,
          deploymentVisible: Boolean(latest),
          latestDeploymentState: latest?.state ?? null,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        provider: 'vercel',
        ok: false,
        checkedAt,
        details: {
          projectId: this.config.projectId,
          teamId: this.config.teamId ?? null,
          teamSlug: this.config.teamSlug ?? null,
          teamSlugUsedForApi: false,
          deploymentVisible: false,
        },
        errorCode: 'vercel_request_failed',
        errorMessage: redactText(errorMessage, [this.config.token]),
      };
    }
  }

  private createDefaultDependencies(): VercelValidationDependencies {
    return {
      listDeployments: async ({ token, teamId, projectId }) => {
        const url = new URL('https://api.vercel.com/v6/deployments');
        url.searchParams.set('projectId', projectId);
        url.searchParams.set('target', 'production');
        url.searchParams.set('limit', '1');
        if (teamId) {
          url.searchParams.set('teamId', teamId);
        }

        const response = await fetch(url, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error(`Vercel deployments request failed: ${response.status} ${response.statusText}`);
        }

        return (await response.json()) as { deployments: VercelDeployment[] };
      },
    };
  }
}
