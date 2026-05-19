import { describe, test, expect, vi } from 'vitest';
import { sessionId, withAutoWait } from '../../src/matchers/wait.mjs';

describe('sessionId', () => {
  test('accepts a bare id string', () => {
    expect(sessionId('abc')).toBe('abc');
  });

  test('accepts a session object with .id', () => {
    expect(sessionId({ id: 'xyz', tmuxName: 't', jsonlPath: '/p' })).toBe('xyz');
  });

  test('throws on invalid input', () => {
    expect(() => sessionId(null)).toThrow(/session/i);
    expect(() => sessionId({})).toThrow(/session/i);
    expect(() => sessionId(42)).toThrow(/session/i);
  });
});

describe('withAutoWait', () => {
  test('calls waitIdle before check by default', async () => {
    const calls = [];
    const fakeWaitIdle = vi.fn(async () => calls.push('wait'));
    const check = vi.fn(async () => { calls.push('check'); return 'ok'; });
    const result = await withAutoWait('id1', {}, check, fakeWaitIdle);
    expect(result).toBe('ok');
    expect(calls).toEqual(['wait', 'check']);
    expect(fakeWaitIdle).toHaveBeenCalledWith('id1', { timeoutMs: 60_000 });
  });

  test('{ wait: false } skips waitIdle', async () => {
    const fakeWaitIdle = vi.fn();
    const check = vi.fn(async () => 'ok');
    await withAutoWait('id1', { wait: false }, check, fakeWaitIdle);
    expect(fakeWaitIdle).not.toHaveBeenCalled();
  });

  test('{ timeoutMs } overrides default', async () => {
    const fakeWaitIdle = vi.fn();
    await withAutoWait('id1', { timeoutMs: 5000 }, async () => 'ok', fakeWaitIdle);
    expect(fakeWaitIdle).toHaveBeenCalledWith('id1', { timeoutMs: 5000 });
  });

  test('accepts a session object', async () => {
    const fakeWaitIdle = vi.fn();
    await withAutoWait({ id: 'sess-2' }, {}, async () => 'ok', fakeWaitIdle);
    expect(fakeWaitIdle).toHaveBeenCalledWith('sess-2', { timeoutMs: 60_000 });
  });

  test('bubbles waitIdle errors', async () => {
    const fakeWaitIdle = vi.fn(async () => { throw new Error('timed out'); });
    await expect(withAutoWait('id1', {}, async () => 'ok', fakeWaitIdle))
      .rejects.toThrow('timed out');
  });
});
