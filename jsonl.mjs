import { open, stat } from 'node:fs/promises';

/**
 * Parse a buffer of JSONL into events. Returns parsed events and the unfinished
 * tail (no trailing newline). Lines that fail JSON parsing are silently dropped
 * — the caller cannot recover them and the harness should not crash on a
 * single bad line. Bad lines are written to stderr for visibility.
 *
 * @param {string} text
 * @returns {{ events: Record<string, unknown>[], leftover: string }}
 */
export function parseLines(text) {
  const events = [];
  let start = 0;
  let nl = text.indexOf('\n');
  while (nl !== -1) {
    const line = text.slice(start, nl);
    start = nl + 1;
    nl = text.indexOf('\n', start);
    if (line.length === 0) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      process.stderr.write(`testbed/jsonl: dropped malformed line: ${line.slice(0, 80)}…\n`);
    }
  }
  return { events, leftover: text.slice(start) };
}

/**
 * Read events from a JSONL file starting at byte `offset`. Returns parsed
 * events and the new end-of-file offset. Missing file → empty result.
 *
 * @param {string} filepath
 * @param {number} offset
 * @returns {Promise<{events: Record<string, unknown>[], offset: number}>}
 */
export async function readEvents(filepath, offset) {
  let stats;
  try {
    stats = await stat(filepath);
  } catch (err) {
    if (err && /** @type {NodeJS.ErrnoException} */ (err).code === 'ENOENT') {
      return { events: [], offset: 0 };
    }
    throw err;
  }
  if (stats.size <= offset) return { events: [], offset };
  const fh = await open(filepath, 'r');
  try {
    const length = stats.size - offset;
    const buf = Buffer.alloc(length);
    await fh.read(buf, 0, length, offset);
    const text = buf.toString('utf8');
    const { events } = parseLines(text);
    return { events, offset: stats.size };
  } finally {
    await fh.close();
  }
}

/**
 * Tail a JSONL file as an async iterable of events. Yields any events that
 * already exist when iteration starts, then yields events as they are
 * appended. Stops when the abort signal fires.
 *
 * Implementation polls `readEvents` every `pollMs` (default 50ms) rather
 * than using `fs.watch`. macOS coalesces watch events and silently drops
 * appends that arrive after the watcher fires but before the read completes,
 * which made this function miss events under realistic interleaving. Polling
 * is dumb but reliable.
 *
 * @param {string} filepath
 * @param {object} [opts]
 * @param {AbortSignal} [opts.signal]
 * @param {number} [opts.pollMs=50]
 * @returns {AsyncIterable<Record<string, unknown>>}
 */
export async function* tailFile(filepath, opts = {}) {
  const signal = opts.signal;
  const pollMs = opts.pollMs ?? 50;
  let offset = 0;

  while (!signal?.aborted) {
    const { events, offset: newOffset } = await readEvents(filepath, offset);
    if (newOffset > offset) {
      offset = newOffset;
      for (const e of events) yield e;
    }
    if (signal?.aborted) return;
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

/**
 * Resolve when the JSONL file has been idle for `idleMs` after at least one
 * `assistant` event has been observed. Reject with a TimeoutError if
 * `timeoutMs` elapses before the idle condition is met.
 *
 * Heuristic: an `assistant` event must have appeared at some point (proves
 * the model has begun responding), and `idleMs` must have elapsed since the
 * last appended event of any type. The plan originally proposed
 * "lastType in {assistant, last-prompt}" but empirical testing against
 * Claude Code 2.1.121 showed `last-prompt` and `permission-mode` are
 * session-lifecycle markers (written at startup/shutdown), not turn-end
 * markers; the actual end-of-turn for an interactive session is "the model
 * stopped writing" — i.e., a quiet window after one or more assistant events.
 *
 * Implementation polls the JSONL via `readEvents` rather than `fs.watch`
 * because macOS coalesces watch events: a batch of writes can fire one
 * watch event and silently drop the rest, which would make the watcher
 * miss the very events we care about.
 *
 * @param {string} filepath
 * @param {object} [opts]
 * @param {number} [opts.idleMs=2000]
 * @param {number} [opts.timeoutMs=60000]
 * @returns {Promise<void>}
 */
export async function waitIdle(filepath, opts = {}) {
  const idleMs = opts.idleMs ?? 2000;
  const timeoutMs = opts.timeoutMs ?? 60000;
  const deadline = Date.now() + timeoutMs;
  const pollMs = Math.min(50, idleMs);

  let offset = 0;
  let lastEventTs = Date.now();
  /** @type {string | null} */
  let lastType = null;
  let sawAssistant = false;

  while (Date.now() < deadline) {
    const { events: polled, offset: newOffset } = await readEvents(filepath, offset);
    if (newOffset > offset) {
      offset = newOffset;
      for (const event of polled) {
        const t = event.type;
        if (typeof t === 'string') {
          lastType = t;
          if (t === 'assistant') sawAssistant = true;
        }
      }
      lastEventTs = Date.now();
    }

    const sinceLast = Date.now() - lastEventTs;
    if (sawAssistant && sinceLast >= idleMs) return;
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error(`waitIdle: timed out after ${timeoutMs}ms (last event type=${lastType})`);
}
