import { stat, readFile } from 'node:fs/promises';
import { matches } from './wait.mjs';

/**
 * Returns { pass, reason, actual } where:
 * - reason: human-readable summary of why pass is what it is
 * - actual: the file content if it was read, else undefined
 *
 * Single 100ms retry on missing file when `created !== false` to cover
 * the rare race where the agent's write hasn't fsync'd yet.
 *
 * @param {string} path
 * @param {{ created?: boolean, content?: unknown }} opts
 * @returns {Promise<{ pass: boolean, reason: string, actual?: string }>}
 */
export async function checkTouchedFile(path, opts) {
  const wantCreated = opts.created !== false; // default: must exist

  let exists = await fileExists(path);
  if (!exists && wantCreated) {
    await new Promise((r) => setTimeout(r, 100));
    exists = await fileExists(path);
  }

  if (!wantCreated) {
    return exists
      ? { pass: false, reason: `expected ${path} not to exist, but it does` }
      : { pass: true, reason: `${path} does not exist (as expected)` };
  }

  if (!exists) {
    return { pass: false, reason: `expected ${path} to exist, but it does not exist` };
  }

  if (opts.content === undefined) {
    return { pass: true, reason: `${path} exists` };
  }

  const actual = await readFile(path, 'utf8');
  if (matches(actual, opts.content)) {
    return { pass: true, reason: `${path} exists and content matches`, actual };
  }
  return { pass: false, reason: `${path} exists but content does not match`, actual };
}

async function fileExists(path) {
  try { await stat(path); return true; } catch { return false; }
}
