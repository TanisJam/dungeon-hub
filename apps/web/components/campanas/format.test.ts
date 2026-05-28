import { describe, it, expect } from 'vitest';
import { formatSessionsCount, formatNextSession } from './format';

describe('formatSessionsCount (WCL-SESSIONS-PLURAL-03)', () => {
  it('returns null for 0 sessions (pill hidden)', () => {
    expect(formatSessionsCount(0)).toBeNull();
  });

  it('returns "1 sesión" singular for 1 session (one-shot, memory #1031)', () => {
    expect(formatSessionsCount(1)).toBe('1 sesión');
  });

  it('returns "N sesiones" plural for N > 1', () => {
    expect(formatSessionsCount(7)).toBe('7 sesiones');
  });
});

describe('formatNextSession (WCL-NEXT-SESSION-COND-04)', () => {
  it('returns null when nextSession is null (pill hidden)', () => {
    expect(formatNextSession(null)).toBeNull();
  });

  it('returns a "Próx. …" string for an ISO date', () => {
    const result = formatNextSession('2026-06-01T21:30:00Z');
    expect(result).toMatch(/^Próx\. /);
  });
});
