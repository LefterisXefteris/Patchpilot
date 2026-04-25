import { AppConfigSchema, type AppConfig, type RecoveryAction } from '../config/schema.js';

export type AutopilotPolicy = AppConfig['autopilot'];

const mutationActions = new Set<RecoveryAction>([
  'create_branch',
  'apply_patch',
  'open_pr',
  'merge_pr',
  'redeploy',
  'rollback',
  'run_recovery_hook',
]);

export function isMutationAction(action: RecoveryAction): boolean {
  return mutationActions.has(action);
}

export function isMutationBlocked(policy: AutopilotPolicy): boolean {
  return policy.emergencyStop || policy.dryRun || !policy.enabled;
}

export function canMerge(policy: AutopilotPolicy): boolean {
  return policy.allowMerge && !isMutationBlocked(policy);
}

export function canDeploy(policy: AutopilotPolicy): boolean {
  return policy.allowDeploy && !isMutationBlocked(policy);
}

export function canRollback(policy: AutopilotPolicy): boolean {
  return policy.allowRollback && !isMutationBlocked(policy);
}

export function canRunRecoveryHook(policy: AutopilotPolicy): boolean {
  return policy.allowRecoveryHook && !isMutationBlocked(policy);
}

export function isActionAllowed(policy: AutopilotPolicy, action: RecoveryAction): boolean {
  if (!policy.allowedActions.includes(action)) {
    return false;
  }

  if (isMutationAction(action) && isMutationBlocked(policy)) {
    return false;
  }

  if (action === 'merge_pr') {
    return canMerge(policy);
  }

  if (action === 'redeploy') {
    return canDeploy(policy);
  }

  if (action === 'rollback') {
    return canRollback(policy);
  }

  if (action === 'run_recovery_hook') {
    return canRunRecoveryHook(policy);
  }

  return true;
}

export function isConfidenceAllowed(policy: AutopilotPolicy, confidence: number): boolean {
  return confidence >= policy.confidenceThreshold;
}

export function isPathProtected(policy: AutopilotPolicy, filePath: string): boolean {
  return policy.protectedPaths.some((pattern) => {
    if (pattern.endsWith('/**')) {
      return filePath.startsWith(pattern.slice(0, -3));
    }

    return filePath === pattern;
  });
}

export function validatePolicy(policy: AutopilotPolicy): AutopilotPolicy {
  return AppConfigSchema.shape.autopilot.parse(policy);
}
