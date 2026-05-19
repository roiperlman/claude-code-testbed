import { waitIdle as libWaitIdle } from '../index.mjs';

/**
 * Polymorphic value matcher.
 *
 * - string: strict equality
 * - RegExp: .test(value)
 * - function: predicate
 * - plain object: deep partial match (each key in matcher must `matches` the
 *   corresponding key in value; extra keys in value are ignored)
 * - array: positional partial match (matcher.length <= value.length, each
 *   index must `matches`)
 *
 * @param {unknown} value
 * @param {unknown} matcher
 * @returns {boolean}
 */
export function matches(value, matcher) {
  if (matcher === null || matcher === undefined) return value === matcher;
  if (typeof matcher === 'string') return value === matcher;
  if (matcher instanceof RegExp) return typeof value === 'string' && matcher.test(value);
  if (typeof matcher === 'function') return matcher(value) === true;
  if (Array.isArray(matcher)) {
    if (!Array.isArray(value)) return false;
    if (matcher.length > value.length) return false;
    return matcher.every((m, i) => matches(value[i], m));
  }
  if (typeof matcher === 'object') {
    if (value === null || typeof value !== 'object') return false;
    return Object.keys(matcher).every((k) => matches(/** @type {any} */ (value)[k], /** @type {any} */ (matcher)[k]));
  }
  return value === matcher;
}

/**
 * Normalize a session-or-id argument to a plain id string.
 *
 * @param {string | { id: string }} sessionOrId
 * @returns {string}
 */
export function sessionId(sessionOrId) {
  if (typeof sessionOrId === 'string') return sessionOrId;
  if (sessionOrId && typeof sessionOrId === 'object' && typeof sessionOrId.id === 'string') {
    return sessionOrId.id;
  }
  throw new Error('matchers: expected a session object with .id or a session id string');
}

/**
 * Wrap a matcher check so it (by default) waits for the session to become
 * idle before reading events / pane / disk. Pass `{ wait: false }` to skip.
 *
 * The third arg is the check function. The fourth arg is injectable
 * (defaults to the real waitIdle) so tests can substitute a fake.
 *
 * @template T
 * @param {string | { id: string }} sessionOrId
 * @param {{ wait?: boolean, timeoutMs?: number } | undefined} opts
 * @param {(id: string) => Promise<T>} check
 * @param {(id: string, o: { timeoutMs: number }) => Promise<void>} [waitFn]
 * @returns {Promise<T>}
 */
export async function withAutoWait(sessionOrId, opts, check, waitFn = libWaitIdle) {
  const id = sessionId(sessionOrId);
  if (opts?.wait !== false) {
    await waitFn(id, { timeoutMs: opts?.timeoutMs ?? 60_000 });
  }
  return check(id);
}
