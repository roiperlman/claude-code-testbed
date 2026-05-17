import { randomUUID } from 'node:crypto';
import * as tmux from './tmux.mjs';
import * as jsonl from './jsonl.mjs';
import * as registry from './registry.mjs';
import { jsonlPath } from './paths.mjs';

const KEYSTROKE_DELAY_MS = Number(process.env.TESTBED_KEYSTROKE_DELAY_MS ?? 500);

/**
 * @typedef {import('./registry.mjs').SessionInfo} SessionInfo
 */

/** @param {string} id */
function tmuxNameFromId(id) {
  return `testbed-${id.slice(0, 8)}`;
}

/**
 * Start a fresh Claude Code session under tmux.
 *
 * @param {object} [opts]
 * @param {string} [opts.projectDir]   default: process.cwd()
 * @param {string} [opts.pluginDir]    default: projectDir
 * @param {string} [opts.model]        default: "haiku"
 * @param {boolean} [opts.bare]        default: true
 * @param {string} [opts.name]         optional human label
 * @returns {Promise<{id: string, tmuxName: string, jsonlPath: string}>}
 */
export async function start(opts = {}) {
  const projectDir = opts.projectDir ?? process.cwd();
  const pluginDir = opts.pluginDir ?? projectDir;
  const model = opts.model ?? 'haiku';
  const bare = opts.bare ?? true;
  const name = opts.name ?? null;

  const id = randomUUID();
  const tmuxName = tmuxNameFromId(id);
  const transcriptPath = jsonlPath(projectDir, id);

  const args = [
    '--session-id',
    id,
    '--plugin-dir',
    pluginDir,
    '--model',
    model,
    '--allow-dangerously-skip-permissions',
  ];
  if (bare) args.unshift('--bare');

  // tmux command must `cd` into projectDir before launching claude so that
  // the JSONL file lands at jsonlPath(projectDir, id). We achieve this with
  // a shell wrapper.
  const wrapped = `cd ${shellQuote(projectDir)} && exec claude ${args.map(shellQuote).join(' ')}`;
  await tmux.newSession(tmuxName, 'sh', ['-c', wrapped]);

  // Wait for the input prompt to be ready before returning.
  try {
    await tmux.waitForPrompt(tmuxName, { timeoutMs: 15000 });
  } catch (err) {
    await tmux.killSession(tmuxName);
    throw err;
  }

  /** @type {SessionInfo} */
  const info = {
    id,
    tmuxName,
    jsonlPath: transcriptPath,
    projectDir,
    pluginDir,
    model,
    bare,
    name,
    startedAt: new Date().toISOString(),
  };
  await registry.addSession(info);
  return { id, tmuxName, jsonlPath: transcriptPath };
}

/** @param {string} s */
function shellQuote(s) {
  if (/^[A-Za-z0-9_\-./=:]+$/.test(s)) return s;
  return `'${s.replaceAll("'", `'\\''`)}'`;
}

/**
 * Kill the named session. Idempotent.
 *
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function kill(id) {
  const all = await registry.readRegistry();
  const found = all.find((s) => s.id === id);
  if (!found) return;
  await tmux.killSession(found.tmuxName);
  await registry.removeSession(id);
}

/**
 * List currently-alive sessions. Cross-references the registry against
 * `tmux has-session` and prunes dead entries.
 *
 * @returns {Promise<SessionInfo[]>}
 */
export async function list() {
  return registry.pruneRegistry((tmuxName) => tmux.hasSession(tmuxName));
}

/** @param {string} id */
async function lookupTmuxName(id) {
  const all = await registry.readRegistry();
  const found = all.find((s) => s.id === id);
  if (!found) throw new Error(`testbed: no session with id ${id}`);
  return found.tmuxName;
}

/**
 * Send a user message. Sends the literal text, sleeps 500ms (workaround for
 * Ink TUI race), then sends Enter.
 *
 * @param {string} id
 * @param {string} text
 * @returns {Promise<void>}
 */
export async function send(id, text) {
  const tmuxName = await lookupTmuxName(id);
  await tmux.sendLiteral(tmuxName, text);
  await new Promise((r) => setTimeout(r, KEYSTROKE_DELAY_MS));
  await tmux.sendKey(tmuxName, 'Enter');
}

/**
 * Send a slash command. Identical mechanism to send(); separate verb for
 * caller intent.
 *
 * @param {string} id
 * @param {string} cmd  must start with `/`
 * @returns {Promise<void>}
 */
export async function slash(id, cmd) {
  if (!cmd.startsWith('/')) throw new Error(`testbed.slash: cmd must start with "/" (got: ${cmd})`);
  await send(id, cmd);
}

/** @param {string} id */
async function lookupSession(id) {
  const all = await registry.readRegistry();
  const found = all.find((s) => s.id === id);
  if (!found) throw new Error(`testbed: no session with id ${id}`);
  return found;
}

/**
 * @param {string} id
 * @param {object} [opts]
 * @param {number} [opts.since=0]   byte offset
 * @returns {Promise<Record<string, unknown>[]>}
 */
export async function events(id, opts = {}) {
  const session = await lookupSession(id);
  const since = opts.since ?? 0;
  const { events: parsed } = await jsonl.readEvents(session.jsonlPath, since);
  return parsed;
}

/**
 * @param {string} id
 * @param {object} [opts]
 * @param {number} [opts.lines=100]
 * @returns {Promise<string>}
 */
export async function pane(id, opts = {}) {
  const tmuxName = await lookupTmuxName(id);
  const lines = opts.lines ?? 100;
  return tmux.capturePane(tmuxName, lines);
}

/**
 * Block until the session is idle (last event is a turn-completion type
 * AND no new events have arrived for `idleMs`).
 *
 * @param {string} id
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs=60000]
 * @param {number} [opts.idleMs=2000]
 * @returns {Promise<void>}
 */
export async function waitIdle(id, opts = {}) {
  const session = await lookupSession(id);
  await jsonl.waitIdle(session.jsonlPath, opts);
}

/**
 * @param {string} id
 * @param {object} [opts]
 * @param {AbortSignal} [opts.signal]
 * @returns {AsyncIterable<Record<string, unknown>>}
 */
export async function* tail(id, opts = {}) {
  const session = await lookupSession(id);
  yield* jsonl.tailFile(session.jsonlPath, { signal: opts.signal });
}
