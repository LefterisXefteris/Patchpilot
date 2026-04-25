import { loadConfigFromEnv } from './config/env.js';
import { redactText } from './security/redact.js';
import { validateIntegrations } from './validation/validate-integrations.js';

export async function main(argv = process.argv.slice(2)): Promise<number> {
  if (argv[0] !== 'validate-config') {
    console.log('Usage: back-to-service validate-config');
    return 1;
  }

  try {
    const config = await loadConfigFromEnv(process.env);
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

const isDirectRun = process.argv[1] === new URL(import.meta.url).pathname;

if (isDirectRun) {
  process.exitCode = await main();
}
