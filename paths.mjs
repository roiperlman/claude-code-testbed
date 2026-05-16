import os from 'node:os';
import path from 'node:path';

/**
 * Encode an absolute project directory the way Claude Code encodes it for
 * `~/.claude/projects/`: every `/` becomes `-`. Empirically verified against
 * Claude Code 2.1.121 on macOS.
 *
 * @param {string} absoluteDir
 * @returns {string}
 */
export function encodeProjectDir(absoluteDir) {
  return absoluteDir.replaceAll('/', '-');
}

/**
 * Full path to the JSONL transcript for a session running in `absoluteDir`
 * with id `sessionId`.
 *
 * @param {string} absoluteDir
 * @param {string} sessionId
 * @returns {string}
 */
export function jsonlPath(absoluteDir, sessionId) {
  return path.join(os.homedir(), '.claude', 'projects', encodeProjectDir(absoluteDir), `${sessionId}.jsonl`);
}

/**
 * Cache directory for testbed state. Honors `XDG_CACHE_HOME` per XDG basedir
 * spec; falls back to `~/.cache`.
 *
 * @returns {string}
 */
export function cacheDir() {
  const base = process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), '.cache');
  return path.join(base, 'cursed-testbed');
}

/**
 * Absolute path to the testbed registry file.
 *
 * @returns {string}
 */
export function stateFilePath() {
  return path.join(cacheDir(), 'state.json');
}
