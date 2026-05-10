import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readEnvFile, writeEnvFile, type EnvFileData } from './env-file.js';
import { redactText } from '../security/redact.js';

const HOST = '127.0.0.1';
const PORT = Number(process.env.BTS_UI_PORT ?? 4317);
const root = fileURLToPath(new URL('../../', import.meta.url));
const publicDir = join(root, 'src/ui/public');
const secretKeys = new Set([
  'SENTRY_AUTH_TOKEN',
  'SENTRY_WEBHOOK_SECRET',
  'GITHUB_APP_PRIVATE_KEY',
  'GITHUB_WEBHOOK_SECRET',
  'VERCEL_TOKEN',
  'ANTHROPIC_API_KEY',
]);

type CommandName = 'validate' | 'syncDryRun' | 'syncApply' | 'agentRun' | 'eval' | 'claudeWorkflow' | 'redispatchClaude';

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://${HOST}:${PORT}`);

    if (request.method === 'GET' && url.pathname === '/') {
      return sendFile(response, join(publicDir, 'index.html'));
    }

    if (request.method === 'GET' && url.pathname.startsWith('/assets/')) {
      return sendFile(response, join(publicDir, url.pathname.replace('/assets/', '')));
    }

    if (request.method === 'GET' && url.pathname === '/api/config') {
      return sendJson(response, configPayload());
    }

    if (request.method === 'POST' && url.pathname === '/api/config') {
      const body = (await readJson(request)) as { values?: EnvFileData };
      const current = readEnvFile();
      const next = { ...current };

      for (const [key, value] of Object.entries(body.values ?? {})) {
        if (secretKeys.has(key) && value === '') {
          continue;
        }
        next[key] = value;
      }

      writeEnvFile(next);
      return sendJson(response, { ok: true, config: configPayload() });
    }

    if (request.method === 'POST' && url.pathname === '/api/run') {
      const body = (await readJson(request)) as { command?: CommandName };
      return sendJson(response, await runCommand(body.command));
    }

    return sendJson(response, { ok: false, error: 'Not found' }, 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return sendJson(response, { ok: false, error: redactOutput(message) }, 500);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Back To Service setup UI: http://${HOST}:${PORT}`);
});

function configPayload(): { values: EnvFileData; secretStatus: Record<string, boolean> } {
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

async function runCommand(command: CommandName | undefined): Promise<{ ok: boolean; command: string; output: string }> {
  const commandMap: Record<CommandName, string[]> = {
    validate: ['run', 'validate:config'],
    syncDryRun: ['run', 'agent:watch', '--', '--limit', '5'],
    syncApply: ['run', 'agent:watch', '--', '--apply', '--limit', '5'],
    agentRun: ['run', 'agent:run'],
    eval: ['run', 'eval'],
    claudeWorkflow: ['run', 'show:claude-workflow'],
    redispatchClaude: ['run', 'agent:watch', '--', '--apply', '--limit', '5'],
  };
  const args = command ? commandMap[command] : undefined;
  if (!args) {
    return { ok: false, command: 'unknown', output: 'Unknown command' };
  }

  return new Promise((resolve) => {
    execFile('npm', args, { cwd: root, env: { ...process.env, ...readEnvFile() }, timeout: 120_000 }, (error, stdout, stderr) => {
      const output = redactOutput(`${stdout}${stderr}`);
      resolve({
        ok: !error,
        command: `npm ${args.join(' ')}`,
        output,
      });
    });
  });
}

function redactOutput(output: string): string {
  const env = readEnvFile();
  return redactText(output, [...secretKeys].map((key) => env[key]));
}

function readJson(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = '';
    request.on('data', (chunk: Buffer) => {
      data += chunk.toString('utf8');
    });
    request.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

function sendFile(response: ServerResponse, path: string): void {
  const type = extname(path) === '.css' ? 'text/css' : extname(path) === '.js' ? 'text/javascript' : 'text/html';
  response.writeHead(200, { 'content-type': `${type}; charset=utf-8` });
  response.end(readFileSync(path));
}

function sendJson(response: ServerResponse, payload: unknown, status = 200): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload, null, 2));
}
