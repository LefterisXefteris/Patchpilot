export const SENSITIVE_KEY_PATTERN = /(token|secret|authorization|password|private[_-]?key)/i;

export function redactText(input: string, secretValues: Array<string | undefined>): string {
  return secretValues.filter((secret): secret is string => Boolean(secret)).reduce((output, secret) => {
    return output.split(secret).join('[REDACTED]');
  }, input);
}

export function redactObject<T>(input: T, secretValues: Array<string | undefined>): T {
  if (typeof input === 'string') {
    return redactText(input, secretValues) as T;
  }

  if (Array.isArray(input)) {
    return input.map((item) => redactObject(item, secretValues)) as T;
  }

  if (input && typeof input === 'object') {
    return Object.fromEntries(
      Object.entries(input).map(([key, value]) => [
        key,
        SENSITIVE_KEY_PATTERN.test(key) ? '[REDACTED]' : redactObject(value, secretValues),
      ]),
    ) as T;
  }

  return input;
}
