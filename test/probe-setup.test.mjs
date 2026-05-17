import { describe, it, expect, vi, beforeEach } from 'vitest';

const execFileMock = vi.fn();

vi.mock('node:child_process', () => ({
  execFile: (
    /** @type {string} */ file,
    /** @type {string[]} */ args,
    /** @type {Function} */ cb,
  ) => execFileMock(file, args, cb),
}));

const probe = await import('../scripts/probe-setup.mjs');

beforeEach(() => {
  execFileMock.mockReset();
  delete process.env.ANTHROPIC_API_KEY;
});

function mockOk(stdout) {
  execFileMock.mockImplementationOnce((_file, _args, cb) => cb(null, stdout, ''));
}

function mockEnoent() {
  execFileMock.mockImplementationOnce((_file, _args, cb) => {
    const err = new Error('not found');
    Object.assign(err, { code: 'ENOENT' });
    cb(err);
  });
}

describe('checkTmux', () => {
  it('returns available + version when tmux -V succeeds', async () => {
    mockOk('tmux 3.4\n');
    const result = await probe.checkTmux();
    expect(result).toEqual({ available: true, version: '3.4' });
  });

  it('returns available:false when tmux is missing (ENOENT)', async () => {
    mockEnoent();
    const result = await probe.checkTmux();
    expect(result).toEqual({ available: false });
  });
});

describe('checkClaude', () => {
  it('returns available + version when claude --version succeeds', async () => {
    mockOk('1.2.3 (Claude Code)\n');
    const result = await probe.checkClaude();
    expect(result).toEqual({ available: true, version: '1.2.3' });
  });

  it('returns available:false when claude is missing (ENOENT)', async () => {
    mockEnoent();
    const result = await probe.checkClaude();
    expect(result).toEqual({ available: false });
  });
});

describe('checkApiKey', () => {
  it('returns set:true when ANTHROPIC_API_KEY is set', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    expect(probe.checkApiKey()).toEqual({ set: true });
  });

  it('returns set:false when ANTHROPIC_API_KEY is empty/unset', () => {
    expect(probe.checkApiKey()).toEqual({ set: false });
  });
});

describe('runProbe', () => {
  it('aggregates checks and reports summary.ok=true when all pass', async () => {
    mockOk('tmux 3.4\n');
    mockOk('1.2.3\n');
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    const result = await probe.runProbe();
    expect(result.tmux.available).toBe(true);
    expect(result.claude.available).toBe(true);
    expect(result.anthropicApiKey.set).toBe(true);
    expect(result.summary).toEqual({ ok: true, missing: [] });
  });

  it('lists missing pieces in summary.missing', async () => {
    mockEnoent(); // tmux missing
    mockOk('1.2.3\n'); // claude ok
    // ANTHROPIC_API_KEY unset
    const result = await probe.runProbe();
    expect(result.summary.ok).toBe(false);
    expect(result.summary.missing).toEqual(['tmux', 'anthropicApiKey']);
  });
});
