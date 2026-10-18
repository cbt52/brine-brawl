import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../../client/src/ui/util.ts';

describe('escapeHtml', () => {
  it('neutralises markup from invite links', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('escapes quotes and ampersands', () => {
    expect(escapeHtml(`a&b"c'd`)).toBe('a&amp;b&quot;c&#39;d');
  });

  it('leaves plain room codes untouched', () => {
    expect(escapeHtml('KRAKEN-42')).toBe('KRAKEN-42');
  });
});
