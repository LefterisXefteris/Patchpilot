import type { SecretStore } from './types.js';

export class EnvSecretStore implements SecretStore {
  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}

  async get(name: string): Promise<string | undefined> {
    return this.env[name];
  }

  async require(name: string): Promise<string> {
    const value = await this.get(name);
    if (!value) {
      throw new Error(`Missing required secret: ${name}`);
    }
    return value;
  }
}
