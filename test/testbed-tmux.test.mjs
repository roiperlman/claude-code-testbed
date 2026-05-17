import { describe, it, expect, vi, beforeEach } from 'vitest';

const execFileMock = vi.fn();

vi.mock('node:child_process', () => ({
  execFile: (
    /** @type {string} */ file,
    /** @type {string[]} */ args,
    /** @type {object} */ opts,
    /** @type {Function} */ cb,
  ) => execFileMock(file, args, opts, cb),
}));

const tmux = await import('../src/tmux.mjs');

beforeEach(() => {
  execFileMock.mockReset();
});

function mockOk(stdout = '', stderr = '') {
  execFileMock.mockImplementationOnce((_file, _args, _opts, cb) => {
    cb(null, stdout, stderr);
  });
}

/**
 * @param {string | number} code
 * @param {string} [stderr]
 */
function mockFail(code, stderr = '') {
  execFileMock.mockImplementationOnce((_file, _args, _opts, cb) => {
    const err = /** @type {Error & {code?: string | number, stderr?: string}} */ (new Error('tmux failed'));
    err.code = code;
    err.stderr = stderr;
    cb(err, '', stderr);
  });
}

describe('tmux.newSession', () => {
  it('runs `tmux new-session -d -s <name> -x 200 -y 50 -- <cmd> <args...>`', async () => {
    mockOk();
    await tmux.newSession('testbed-abcd1234', 'claude', ['--session-id', 'x', '--model', 'haiku']);
    const [file, args] = execFileMock.mock.calls[0];
    expect(file).toBe('tmux');
    expect(args).toEqual([
      'new-session',
      '-d',
      '-s',
      'testbed-abcd1234',
      '-x',
      '200',
      '-y',
      '50',
      '--',
      'claude',
      '--session-id',
      'x',
      '--model',
      'haiku',
    ]);
  });
});

describe('tmux.hasSession', () => {
  it('returns true when tmux exits 0', async () => {
    mockOk();
    expect(await tmux.hasSession('testbed-abcd1234')).toBe(true);
    expect(execFileMock.mock.calls[0][1]).toEqual(['has-session', '-t', 'testbed-abcd1234']);
  });

  it('returns false when tmux exits non-zero', async () => {
    mockFail(1);
    expect(await tmux.hasSession('testbed-missing')).toBe(false);
  });
});

describe('tmux.killSession', () => {
  it('runs `tmux kill-session -t <name>`', async () => {
    mockOk();
    await tmux.killSession('testbed-abcd1234');
    expect(execFileMock.mock.calls[0][1]).toEqual(['kill-session', '-t', 'testbed-abcd1234']);
  });

  it('does not throw when the session is already gone', async () => {
    mockFail(1, "can't find session");
    await expect(tmux.killSession('testbed-missing')).resolves.toBeUndefined();
  });
});

describe('tmux.sendLiteral', () => {
  it('uses send-keys -l so special chars are not interpreted as keys', async () => {
    mockOk();
    await tmux.sendLiteral('testbed-abcd1234', '/finalize $now');
    expect(execFileMock.mock.calls[0][1]).toEqual([
      'send-keys',
      '-t',
      'testbed-abcd1234',
      '-l',
      '--',
      '/finalize $now',
    ]);
  });
});

describe('tmux.sendKey', () => {
  it('runs send-keys without -l so the key name is interpreted', async () => {
    mockOk();
    await tmux.sendKey('testbed-abcd1234', 'Enter');
    expect(execFileMock.mock.calls[0][1]).toEqual(['send-keys', '-t', 'testbed-abcd1234', '--', 'Enter']);
  });
});

describe('tmux.capturePane', () => {
  it('captures the last N lines of the pane', async () => {
    mockOk('line1\nline2\nline3\n');
    const out = await tmux.capturePane('testbed-abcd1234', 100);
    expect(execFileMock.mock.calls[0][1]).toEqual(['capture-pane', '-t', 'testbed-abcd1234', '-p', '-S', '-100']);
    expect(out).toBe('line1\nline2\nline3\n');
  });
});

describe('tmux.waitForPrompt', () => {
  it('resolves when the prompt indicator appears in the pane', async () => {
    // First poll: no prompt yet.
    mockOk('starting up...\n');
    // Second poll: prompt visible.
    mockOk('Claude Code v2.1.121\n❯ \n');
    await tmux.waitForPrompt('testbed-abcd1234', { intervalMs: 1, timeoutMs: 1000 });
    expect(execFileMock).toHaveBeenCalledTimes(2);
  });

  it('rejects with TimeoutError when the prompt never appears', async () => {
    // Always returns no prompt.
    for (let i = 0; i < 20; i++) mockOk('still starting...\n');
    await expect(tmux.waitForPrompt('testbed-abcd1234', { intervalMs: 1, timeoutMs: 5 })).rejects.toThrow(/timed out/i);
  });
});
