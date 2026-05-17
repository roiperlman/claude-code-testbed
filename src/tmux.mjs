import { execFile } from 'node:child_process';

/**
 * Promisified execFile. Tests mock `node:child_process` so this resolves
 * synchronously in unit tests.
 *
 * @param {string} file
 * @param {string[]} args
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
function run(file, args) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { encoding: 'utf8' }, (err, stdout, stderr) => {
      if (err) reject(Object.assign(err, { stdout, stderr }));
      else resolve({ stdout, stderr });
    });
  });
}

/**
 * Create a detached tmux session named `name` running `cmd` with `args`.
 *
 * @param {string} name
 * @param {string} cmd
 * @param {string[]} args
 * @returns {Promise<void>}
 */
export async function newSession(name, cmd, args) {
  await run('tmux', ['new-session', '-d', '-s', name, '-x', '200', '-y', '50', '--', cmd, ...args]);
}

/**
 * @param {string} name
 * @returns {Promise<boolean>}
 */
export async function hasSession(name) {
  try {
    await run('tmux', ['has-session', '-t', name]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Kill `name`. Idempotent: returns successfully even if the session is gone.
 *
 * @param {string} name
 * @returns {Promise<void>}
 */
export async function killSession(name) {
  try {
    await run('tmux', ['kill-session', '-t', name]);
  } catch {
    // Already dead — fine.
  }
}

/**
 * Send `text` literally to the named session. Special characters are not
 * interpreted as key names.
 *
 * @param {string} name
 * @param {string} text
 * @returns {Promise<void>}
 */
export async function sendLiteral(name, text) {
  await run('tmux', ['send-keys', '-t', name, '-l', '--', text]);
}

/**
 * Send a single named key (e.g. 'Enter', 'C-c'). No `-l` flag so the name is
 * interpreted by tmux.
 *
 * @param {string} name
 * @param {string} key
 * @returns {Promise<void>}
 */
export async function sendKey(name, key) {
  await run('tmux', ['send-keys', '-t', name, '--', key]);
}

/**
 * Capture the last `lines` lines of the session's active pane.
 *
 * @param {string} name
 * @param {number} lines
 * @returns {Promise<string>}
 */
export async function capturePane(name, lines) {
  const { stdout } = await run('tmux', ['capture-pane', '-t', name, '-p', '-S', `-${lines}`]);
  return stdout;
}

/**
 * Poll the pane until Claude Code's input prompt indicator (`❯`) appears.
 * Used by `lib.start` to know when it's safe to send the first message.
 *
 * @param {string} name
 * @param {object} [opts]
 * @param {number} [opts.intervalMs=200]
 * @param {number} [opts.timeoutMs=15000]
 * @returns {Promise<void>}
 */
export async function waitForPrompt(name, opts = {}) {
  const intervalMs = opts.intervalMs ?? 200;
  const timeoutMs = opts.timeoutMs ?? 15000;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const pane = await capturePane(name, 50);
    if (pane.includes('❯')) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`waitForPrompt: timed out waiting for "❯" in tmux session ${name}`);
}
