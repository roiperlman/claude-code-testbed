import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { cacheDir, stateFilePath } from './paths.mjs';

/**
 * @typedef {object} SessionInfo
 * @property {string} id              Session UUID; also the JSONL filename stem.
 * @property {string} tmuxName        tmux session name (`testbed-<uuid8>`).
 * @property {string} jsonlPath       Absolute path to the JSONL transcript.
 * @property {string} projectDir      cwd that `claude` was launched from.
 * @property {string} pluginDir       Plugin dir passed via `--plugin-dir`.
 * @property {string} model           Model alias passed via `--model`.
 * @property {boolean} bare           Whether `--bare` was passed.
 * @property {string|null} name       Optional human-readable label.
 * @property {string} startedAt       ISO-8601 timestamp.
 */

/**
 * @returns {Promise<SessionInfo[]>}
 */
export async function readRegistry() {
  let raw;
  try {
    raw = await readFile(stateFilePath(), 'utf8');
  } catch (err) {
    if (err && /** @type {NodeJS.ErrnoException} */ (err).code === 'ENOENT') return [];
    throw err;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.sessions)) return [];
    return parsed.sessions;
  } catch {
    // Corrupt file — return empty rather than crash. Caller can re-populate.
    return [];
  }
}

/**
 * @param {SessionInfo[]} sessions
 * @returns {Promise<void>}
 */
export async function writeRegistry(sessions) {
  await mkdir(cacheDir(), { recursive: true });
  const payload = JSON.stringify({ sessions }, null, 2);
  await writeFile(stateFilePath(), payload, 'utf8');
}

/**
 * @param {SessionInfo} session
 * @returns {Promise<void>}
 */
export async function addSession(session) {
  const all = await readRegistry();
  all.push(session);
  await writeRegistry(all);
}

/**
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function removeSession(id) {
  const all = await readRegistry();
  const filtered = all.filter((s) => s.id !== id);
  await writeRegistry(filtered);
}

/**
 * Drop entries whose tmuxName is not reported alive by `isAlive`.
 *
 * @param {(tmuxName: string) => Promise<boolean>} isAlive
 * @returns {Promise<SessionInfo[]>} the surviving sessions
 */
export async function pruneRegistry(isAlive) {
  const all = await readRegistry();
  const alive = [];
  for (const s of all) {
    if (await isAlive(s.tmuxName)) alive.push(s);
  }
  if (alive.length !== all.length) await writeRegistry(alive);
  return alive;
}
