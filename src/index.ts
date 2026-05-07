import { loadConfigFromEnv } from './config/env.js';
import { loadDotenvFile } from './config/dotenv.js';
import { runAgentSync } from './agent/sync.js';
import { runIncidentAgent } from './agentic/loop.js';
import { runEvalHarness, runPromptAblation } from './eval/run-eval.js';
import { redactText } from './security/redact.js';
import { validateIntegrations } from './validation/validate-integrations.js';

export async function main(argv = process.argv.slice(2)): Promise<number> {
  loadDotenvFile();

  if (!['validate-config', 'agent:sync', 'agent:run', 'eval'].includes(argv[0] ?? '')) {
    console.log('Usage: back-to-service <validate-config|agent:sync|agent:run|eval> [--apply] [--limit N] [--db PATH]');
    return 1;
  }

  try {
    if (argv[0] === 'eval') {
      const summary = argv.includes('--ablation')
        ? await runPromptAblation({ dbPath: parseStringArg(argv, '--db'), promptVariant: parseStringArg(argv, '--prompt') })
        : await runEvalHarness({ dbPath: parseStringArg(argv, '--db'), promptVariant: parseStringArg(argv, '--prompt') });
      console.log(JSON.stringify(summary, null, 2));
      return Array.isArray(summary) ? (summary.every((item) => item.ok) ? 0 : 1) : summary.ok ? 0 : 1;
    }

    const shouldLoadConfig = argv[0] !== 'agent:run' || argv.includes('--live');
    const config = shouldLoadConfig ? await loadConfigFromEnv(process.env) : undefined;

    if (argv[0] === 'agent:run') {
      const summary = await runIncidentAgent({
        dbPath: parseStringArg(argv, '--db') ?? '.back-to-service/agent-state.sqlite',
        promptVariant: parseStringArg(argv, '--prompt'),
        dryRun: !argv.includes('--apply'),
        config,
      });
      console.log(JSON.stringify(summary, null, 2));
      return summary.ok ? 0 : 1;
    }

    if (!config) {
      throw new Error('Config failed to load');
    }

    if (argv[0] === 'agent:sync') {
      const summary = await runAgentSync(config, {
        apply: argv.includes('--apply'),
        limit: parseLimit(argv),
        redispatch: argv.includes('--redispatch'),
      });
      console.log(JSON.stringify(summary, null, 2));
      return summary.ok ? 0 : 1;
    }

    const summary = await validateIntegrations(config);
    console.log(JSON.stringify(summary, null, 2));
    return summary.ok ? 0 : 1;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const redacted = redactText(errorMessage, [
      process.env.SENTRY_AUTH_TOKEN,
      process.env.SENTRY_WEBHOOK_SECRET,
      process.env.GITHUB_APP_PRIVATE_KEY,
      process.env.GITHUB_WEBHOOK_SECRET,
      process.env.VERCEL_TOKEN,
    ]);

    console.log(
      JSON.stringify(
        {
          ok: false,
          errorCode: 'config_invalid',
          errorMessage: redacted,
        },
        null,
        2,
      ),
    );
    return 1;
  }
}

function parseLimit(argv: string[]): number {
  const limitIndex = argv.indexOf('--limit');
  if (limitIndex === -1) {
    return 10;
  }

  const parsed = Number(argv[limitIndex + 1]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 10;
}

function parseStringArg(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }

  const value = argv[index + 1];
  return value && !value.startsWith('--') ? value : undefined;
}

const isDirectRun = process.argv[1] === new URL(import.meta.url).pathname;

if (isDirectRun) {
  process.exitCode = await main();
}
