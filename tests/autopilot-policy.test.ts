import { describe, expect, it } from 'vitest';

import {
  canRunRecoveryHook,
  isActionAllowed,
  isConfidenceAllowed,
  isMutationBlocked,
  isPathProtected,
} from '../src/policy/autopilot-policy.js';
import { validPolicy } from './test-helpers.js';

describe('autopilot policy', () => {
  it('blocks mutation when emergencyStop is enabled', () => {
    const policy = { ...validPolicy, emergencyStop: true };

    expect(isMutationBlocked(policy)).toBe(true);
    expect(isActionAllowed(policy, 'merge_pr')).toBe(false);
  });

  it('blocks actions absent from allowedActions', () => {
    expect(isActionAllowed({ ...validPolicy, allowedActions: ['create_issue'] }, 'rollback')).toBe(false);
  });

  it('enforces confidenceThreshold', () => {
    expect(isConfidenceAllowed(validPolicy, 0.8)).toBe(false);
    expect(isConfidenceAllowed(validPolicy, 0.85)).toBe(true);
  });

  it('detects protectedPaths', () => {
    expect(isPathProtected(validPolicy, '.github/workflows/deploy.yml')).toBe(true);
    expect(isPathProtected(validPolicy, 'prisma/schema.prisma')).toBe(true);
    expect(isPathProtected(validPolicy, 'src/index.ts')).toBe(false);
  });

  it('requires explicit recovery hook permission', () => {
    expect(canRunRecoveryHook({ ...validPolicy, allowRecoveryHook: false })).toBe(false);
    expect(isActionAllowed({ ...validPolicy, allowRecoveryHook: false }, 'run_recovery_hook')).toBe(false);
    expect(isActionAllowed(validPolicy, 'run_recovery_hook')).toBe(true);
  });

  it('keeps dry-run blocking mutation even when action toggles are true', () => {
    expect(isActionAllowed({ ...validPolicy, dryRun: true }, 'rollback')).toBe(false);
  });

  it('treats GitHub issue writes as mutation actions', () => {
    expect(isActionAllowed({ ...validPolicy, dryRun: true }, 'create_issue')).toBe(false);
    expect(isActionAllowed({ ...validPolicy, dryRun: true }, 'update_issue')).toBe(false);
  });

  it('treats agent triggers as mutation actions', () => {
    expect(isActionAllowed({ ...validPolicy, dryRun: true }, 'trigger_agent')).toBe(false);
    expect(isActionAllowed({ ...validPolicy, dryRun: true }, 'trigger_claude')).toBe(false);
  });
});
