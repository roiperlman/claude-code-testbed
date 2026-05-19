import { events as libEvents } from '../index.mjs';
import { withAutoWait, matches, sessionId } from './wait.mjs';
import { findToolCalls } from './events.mjs';

/**
 * Hook for tests: if the session-like input has `__events`, use those
 * verbatim instead of calling the live events() API. Production callers
 * never set this field.
 */
async function readEvents(sessionOrId) {
  if (sessionOrId && typeof sessionOrId === 'object' && Array.isArray(sessionOrId.__events)) {
    return sessionOrId.__events;
  }
  return libEvents(sessionId(sessionOrId));
}

function fmt(value) {
  try { return JSON.stringify(value); } catch { return String(value); }
}

function lastFew(events) {
  return events.slice(-5);
}

/**
 * toHaveCalledTool(name, inputMatcher?, { times?, wait?, timeoutMs? })
 *
 * @param {unknown} received   session or id
 * @param {string} name
 * @param {unknown} [inputMatcher]
 * @param {{ times?: number, wait?: boolean, timeoutMs?: number }} [opts]
 */
export async function toHaveCalledTool(received, name, inputMatcher, opts) {
  const events = await withAutoWait(received, opts, async () => readEvents(received));
  const all = findToolCalls(events, name);
  const matching = inputMatcher === undefined
    ? all
    : all.filter((c) => matches({ name: c.name, input: c.input }, inputMatcher));

  let pass;
  let detail;
  if (opts?.times !== undefined) {
    pass = matching.length === opts.times;
    detail = `expected ${opts.times} call(s) to ${name}, found ${matching.length}`;
  } else {
    pass = matching.length > 0;
    detail = pass
      ? `found ${matching.length} call(s) to ${name}`
      : `expected at least one call to ${name}${inputMatcher !== undefined ? ` matching ${fmt(inputMatcher)}` : ''}, found ${all.length} call(s) to ${name}`;
  }

  return {
    pass,
    message: () => pass
      ? `expected NOT to have called tool ${name}, but did (${matching.length} match)`
      : `toHaveCalledTool: ${detail}\nLast events: ${fmt(lastFew(events))}`,
    actual: matching,
    expected: { name, input: inputMatcher, times: opts?.times },
  };
}
