import { describe, expect, it, vi } from 'vitest';

import { main } from '../src/index.js';

describe('main', () => {
  it('prints usage and exits 1 without a command', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const code = await main([]);

    expect(code).toBe(1);
    expect(log).toHaveBeenCalledWith('Usage: patchpilot <validate-config|agent:sync|agent:performance|agent:watch|agent:run|agent:recover|eval> [--apply] [--limit N] [--db PATH]');
    log.mockRestore();
  });
});
