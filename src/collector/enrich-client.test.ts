import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  extractDisplayId,
  enrichWithRetry,
  postEnrich,
} = require('../../scripts/enrich-client.cjs');

describe('enrich-client.cjs', () => {
  it('extracts displayId from invoice', () => {
    expect(extractDisplayId('PEDIDO: #6798\nTotal')).toBe('6798');
    expect(extractDisplayId('sem numero')).toBeNull();
  });

  it('returns service unavailable when no server', async () => {
    const result = await enrichWithRetry('PEDIDO: #6798', 'Test', {
      port: 59999,
      waitMs: 0,
    });
    expect(result.ok).toBe(false);
    expect(result.modified).toBe(false);
  });

  it('postEnrich fails gracefully without server', async () => {
    const result = await postEnrich('test', 'printer', 59998);
    expect(result.ok).toBe(false);
  });
});
