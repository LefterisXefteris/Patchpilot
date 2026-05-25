import { execFile } from 'node:child_process';

import { readEnvFile, writeEnvFile, type EnvFileData } from './env-file';
import { redactText } from '../security/redact';

export const secretKeys = new Set([
  'SENTRY_AUTH_TOKEN',
  'SENTRY_WEBHOOK_SECRET',
  'GITHUB_APP_PRIVATE_KEY',
  'GITHUB_WEBHOOK_SECRET',
  'VERCEL_TOKEN',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
]);

export type CommandName =
  | 'validate'
  | 'syncDryRun'
  | 'syncApply'
  | 'agentRun'
  | 'eval'
  | 'claudeWorkflow'
  | 'codexWorkflow'
  | 'redispatchClaude';

export function configPayload(): { values: EnvFileData; secretStatus: Record<string, boolean> } {
  const env = readEnvFile();
  const values: EnvFileData = {};
  const secretStatus: Record<string, boolean> = {};

  for (const [key, value] of Object.entries(env)) {
    if (secretKeys.has(key)) {
      values[key] = '';
      secretStatus[key] = Boolean(value);
      continue;
    }
    values[key] = value;
  }

  for (const key of secretKeys) {
    secretStatus[key] = Boolean(env[key]);
  }

  return { values, secretStatus };
}

export function saveConfig(values: EnvFileData): { values: EnvFileData; secretStatus: Record<string, boolean> } {
  const current = readEnvFile();
  const next = { ...current };

  for (const [key, value] of Object.entries(values)) {
    if (secretKeys.has(key) && value === '') {
      continue;
    }
    next[key] = value;
  }

  writeEnvFile(next);
  return configPayload();
}

export async function runCommand(command: CommandName | undefined): Promise<{
  ok: boolean;
  command: string;
  output: string;
}> {
  const commandMap: Record<CommandName, string[]> = {
    validate: ['run', 'validate:config'],
    syncDryRun: ['run', 'agent:watch', '--', '--limit', '5'],
    syncApply: ['run', 'agent:watch', '--', '--apply', '--limit', '5'],
    agentRun: ['run', 'agent:run'],
    eval: ['run', 'eval'],
    claudeWorkflow: ['run', 'show:claude-workflow'],
    codexWorkflow: ['run', 'show:codex-workflow'],
    redispatchClaude: ['run', 'agent:watch', '--', '--apply', '--limit', '5'],
  };
  const args = command ? commandMap[command] : undefined;
  if (!args) {
    return { ok: false, command: 'unknown', output: 'Unknown command' };
  }

  return new Promise((resolve) => {
    execFile('npm', args, { cwd: process.cwd(), env: { ...process.env, ...readEnvFile() }, timeout: 120_000 }, (error, stdout, stderr) => {
      const output = redactOutput(`${stdout}${stderr}`);
      resolve({
        ok: !error,
        command: `npm ${args.join(' ')}`,
        output,
      });
    });
  });
}

export function redactOutput(output: string): string {
  const env = readEnvFile();
  return redactText(output, [...secretKeys].map((key) => env[key]));
}
