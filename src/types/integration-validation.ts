export type ProviderName = 'sentry' | 'github' | 'vercel';

export type IntegrationValidationResult = {
  provider: ProviderName;
  ok: boolean;
  checkedAt: string;
  details: Record<string, string | number | boolean | null>;
  missingScopes?: string[];
  errorCode?: string;
  errorMessage?: string;
};

export type ValidationSummary = {
  ok: boolean;
  results: IntegrationValidationResult[];
};
