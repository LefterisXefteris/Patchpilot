import { describe, expect, it } from 'vitest';

import { redactObject, redactText } from '../src/security/redact.js';

describe('redaction', () => {
  it('redacts configured secret values from text', () => {
    expect(redactText('Authorization Bearer abc123', ['abc123'])).toBe('Authorization Bearer [REDACTED]');
  });

  it('redacts sensitive object keys recursively', () => {
    const redacted = redactObject(
      {
        authorization: 'Bearer abc123',
        nested: {
          private_key: 'key',
          safe: 'visible',
        },
      },
      [],
    );

    expect(redacted.authorization).toBe('[REDACTED]');
    expect(redacted.nested.private_key).toBe('[REDACTED]');
    expect(redacted.nested.safe).toBe('visible');
  });
});
