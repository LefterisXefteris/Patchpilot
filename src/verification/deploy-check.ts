import type { AppConfig } from '../config/schema.js';
import type { CheckResult } from './types.js';

export type VercelDeployment = {
  uid: string;
  url?: string;
  state?: string;
  target?: string;
  createdAt?: number;
  readyState?: string;
  inspectorUrl?: string;
};

export type DeployCheckDependencies = {
  listDeployments: (params: {
    token: string;
    teamId?: string;
    projectId: string;
  }) => Promise<{ deployments: VercelDeployment[] }>;
};

export async function checkVercelDeployment(
  config: AppConfig,
  deps?: DeployCheckDependencies,
): Promise<CheckResult> {
  const start = Date.now();
  const projectId = config.target.vercelProjectId ?? config.vercel.projectId;
  const teamId = config.target.vercelTeamId ?? config.vercel.teamId;

  if (!projectId) {
    return {
      name: 'deploy_check',
      status: 'skipped',
      message: 'No Vercel project ID configured for target',
      durationMs: Date.now() - start,
    };
  }

  const fetcher = deps ?? createDefaultDeps();

  try {
    const { deployments } = await fetcher.listDeployments({
      token: config.vercel.token,
      teamId,
      projectId,
    });

    const latest = deployments[0];
    if (!latest) {
      return {
        name: 'deploy_check',
        status: 'fail',
        message: 'No production deployments found for target project',
        details: { projectId },
        durationMs: Date.now() - start,
      };
    }

    const state = (latest.readyState ?? latest.state ?? '').toUpperCase();
    const isReady = state === 'READY';
    const isError = state === 'ERROR' || state === 'CANCELED';

    return {
      name: 'deploy_check',
      status: isReady ? 'pass' : isError ? 'fail' : 'degraded',
      message: isReady
        ? `Latest production deployment ${latest.uid} is READY`
        : `Latest production deployment ${latest.uid} is ${state}`,
      details: {
        deploymentUid: latest.uid,
        state,
        url: latest.url,
        target: latest.target,
        createdAt: latest.createdAt,
        inspectorUrl: latest.inspectorUrl,
      },
      durationMs: Date.now() - start,
    };
  } catch (error) {
    return {
      name: 'deploy_check',
      status: 'fail',
      message: `Vercel deploy check failed: ${error instanceof Error ? error.message : String(error)}`,
      details: { projectId },
      durationMs: Date.now() - start,
    };
  }
}

function createDefaultDeps(): DeployCheckDependencies {
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
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error(`Vercel API ${response.status} ${response.statusText}`);
      }

      return (await response.json()) as { deployments: VercelDeployment[] };
    },
  };
}
