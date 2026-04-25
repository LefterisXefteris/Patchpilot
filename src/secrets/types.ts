export interface SecretStore {
  get(name: string): Promise<string | undefined>;
  require(name: string): Promise<string>;
}
