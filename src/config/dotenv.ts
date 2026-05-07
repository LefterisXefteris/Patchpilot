import { config as loadDotenv } from 'dotenv';

export function loadDotenvFile(path = process.env.BTS_ENV_FILE ?? '.env'): void {
  loadDotenv({ path, override: false, quiet: true });
}
