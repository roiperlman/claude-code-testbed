import { events as libEvents, waitIdle as libWaitIdle } from '../index.mjs';
import { withAutoWait, matches, sessionId } from './wait.mjs';
import { findToolCalls, findToolResults, findAssistantTexts, findUserMessages } from './events.mjs';
import { checkTouchedFile } from './files.mjs';

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

/**
 * toHaveToolResult(name, resultMatcher, opts?)
 */
export async function toHaveToolResult(received, name, resultMatcher, opts) {
  const events = await withAutoWait(received, opts, async () => readEvents(received));
  const all = findToolResults(events, name);
  const matching = all.filter((r) => matches(r.content, resultMatcher));
  const pass = matching.length > 0;
  return {
    pass,
    message: () => pass
      ? `expected NOT to have tool result for ${name} matching ${fmt(resultMatcher)}, but found ${matching.length}`
      : `toHaveToolResult: expected ${name} result matching ${fmt(resultMatcher)}, found ${all.length} result(s)\nLast events: ${fmt(lastFew(events))}`,
    actual: matching,
    expected: { name, result: resultMatcher },
  };
}

/**
 * toHaveAssistantText(matcher, opts?)
 */
export async function toHaveAssistantText(received, matcher, opts) {
  const events = await withAutoWait(received, opts, async () => readEvents(received));
  const texts = findAssistantTexts(events);
  const matching = texts.filter((t) => matches(t, matcher));
  const pass = matching.length > 0;
  return {
    pass,
    message: () => pass
      ? `expected NOT to have assistant text matching ${fmt(matcher)}, but found ${matching.length}`
      : `toHaveAssistantText: expected assistant text matching ${fmt(matcher)}, found ${texts.length} text block(s)\nTexts: ${fmt(texts)}`,
    actual: matching,
    expected: matcher,
  };
}

/**
 * toHaveUserMessage(matcher, opts?)
 */
export async function toHaveUserMessage(received, matcher, opts) {
  const events = await withAutoWait(received, opts, async () => readEvents(received));
  const msgs = findUserMessages(events);
  const matching = msgs.filter((m) => matches(m, matcher));
  const pass = matching.length > 0;
  return {
    pass,
    message: () => pass
      ? `expected NOT to have user message matching ${fmt(matcher)}, but found ${matching.length}`
      : `toHaveUserMessage: expected user message matching ${fmt(matcher)}, found ${msgs.length} message(s)\nMessages: ${fmt(msgs)}`,
    actual: matching,
    expected: matcher,
  };
}

/**
 * toHaveTouchedFile(path, { created?, content?, wait?, timeoutMs? })
 */
export async function toHaveTouchedFile(received, path, opts) {
  await withAutoWait(received, opts, async () => {}); // wait only
  const r = await checkTouchedFile(path, opts ?? {});
  return {
    pass: r.pass,
    message: () => r.pass
      ? `expected NOT touched: ${r.reason}`
      : `toHaveTouchedFile: ${r.reason}`,
    actual: r.actual,
    expected: { path, ...opts },
  };
}

/**
 * toHaveReachedIdle({ within?, wait?, timeoutMs? })
 *
 * `within` measures the time spent waiting (default infinite within timeoutMs).
 * Note: `wait: false` is meaningless here because the matcher's entire job
 * is to wait. We treat it as a no-op for consistency.
 */
export async function toHaveReachedIdle(received, opts) {
  const within = opts?.within ?? Infinity;
  const waitFn = (received && received.__waitIdle) ?? libWaitIdle;
  const id = sessionId(received);
  const start = Date.now();
  try {
    await waitFn(id, { timeoutMs: opts?.timeoutMs ?? 60_000 });
  } catch (err) {
    return {
      pass: false,
      message: () => `toHaveReachedIdle: waitIdle threw: ${err.message}`,
      actual: err.message,
      expected: { within },
    };
  }
  const elapsed = Date.now() - start;
  const pass = elapsed <= within;
  return {
    pass,
    message: () => pass
      ? `expected NOT to reach idle within ${within}ms, but did in ${elapsed}ms`
      : `toHaveReachedIdle: expected idle within ${within}ms, took ${elapsed}ms`,
    actual: elapsed,
    expected: within,
  };
}
