import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFile, mkdtemp, writeFile, appendFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseLines, readEvents, tailFile, waitIdle } from '../jsonl.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(here, 'fixtures');

/** @param {string} name */
async function fx(name) {
  return readFile(resolve(fixturesDir, name), 'utf8');
}

describe('parseLines', () => {
  it('parses every complete line of a real JSONL', async () => {
    const text = await fx('simple-text.jsonl');
    const { events, leftover } = parseLines(text);
    expect(events.length).toBeGreaterThan(0);
    expect(leftover).toBe('');
    for (const e of events) expect(typeof e).toBe('object');
  });

  it('returns the unfinished tail as leftover', () => {
    const text = '{"a":1}\n{"b":2}\n{"c":';
    const { events, leftover } = parseLines(text);
    expect(events).toEqual([{ a: 1 }, { b: 2 }]);
    expect(leftover).toBe('{"c":');
  });

  it('skips lines that fail to parse but keeps going', () => {
    const text = '{"a":1}\nNOT JSON\n{"b":2}\n';
    const { events, leftover } = parseLines(text);
    expect(events).toEqual([{ a: 1 }, { b: 2 }]);
    expect(leftover).toBe('');
  });

  it('handles the partial-line fixture without throwing', async () => {
    const text = await fx('partial-line.jsonl');
    const { events, leftover } = parseLines(text);
    expect(events.length).toBeGreaterThan(0);
    expect(leftover).not.toBe('');
  });
});

describe('readEvents', () => {
  /** @type {string} */
  let dir;
  /** @type {string} */
  let file;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'testbed-jsonl-'));
    file = path.join(dir, 'session.jsonl');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('returns [] and offset 0 when the file does not exist', async () => {
    const { events, offset } = await readEvents(file, 0);
    expect(events).toEqual([]);
    expect(offset).toBe(0);
  });

  it('reads from offset 0 and returns the new end-of-file offset', async () => {
    const a = '{"a":1}\n';
    await writeFile(file, a, 'utf8');
    const { events, offset } = await readEvents(file, 0);
    expect(events).toEqual([{ a: 1 }]);
    expect(offset).toBe(Buffer.byteLength(a, 'utf8'));
  });

  it('reads only new bytes when given a non-zero offset', async () => {
    const a = '{"a":1}\n';
    const b = '{"b":2}\n';
    await writeFile(file, a, 'utf8');
    await appendFile(file, b, 'utf8');
    const startOffset = Buffer.byteLength(a, 'utf8');
    const { events, offset } = await readEvents(file, startOffset);
    expect(events).toEqual([{ b: 2 }]);
    expect(offset).toBe(startOffset + Buffer.byteLength(b, 'utf8'));
  });
});

describe('tailFile', () => {
  /** @type {string} */
  let dir;
  /** @type {string} */
  let file;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'testbed-tail-'));
    file = path.join(dir, 'session.jsonl');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('yields events appended after the iterator started', async () => {
    await writeFile(file, '{"a":1}\n', 'utf8');
    const ac = new AbortController();
    /** @type {Record<string, unknown>[]} */
    const got = [];
    const consume = (async () => {
      for await (const e of tailFile(file, { signal: ac.signal })) {
        got.push(e);
        if (got.length === 3) ac.abort();
      }
    })();
    // Give the watcher a moment to attach before appending.
    await new Promise((r) => setTimeout(r, 100));
    await appendFile(file, '{"b":2}\n', 'utf8');
    await appendFile(file, '{"c":3}\n', 'utf8');
    await consume;
    expect(got).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }]);
  });

  it('waits for the file to appear if it does not exist yet', async () => {
    const ac = new AbortController();
    /** @type {Record<string, unknown>[]} */
    const got = [];
    const consume = (async () => {
      for await (const e of tailFile(file, { signal: ac.signal })) {
        got.push(e);
        if (got.length === 1) ac.abort();
      }
    })();
    await new Promise((r) => setTimeout(r, 100));
    await writeFile(file, '{"first":true}\n', 'utf8');
    await consume;
    expect(got).toEqual([{ first: true }]);
  });
});

describe('waitIdle', () => {
  /** @type {string} */
  let dir;
  /** @type {string} */
  let file;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'testbed-idle-'));
    file = path.join(dir, 'session.jsonl');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('resolves when the last event is `assistant` and idle window passes', async () => {
    await writeFile(file, '{"type":"user"}\n{"type":"assistant"}\n', 'utf8');
    await waitIdle(file, { idleMs: 100, timeoutMs: 5000 });
  });

  it('does not resolve while events are still arriving', async () => {
    await writeFile(file, '{"type":"user"}\n', 'utf8');
    let resolved = false;
    const p = waitIdle(file, { idleMs: 200, timeoutMs: 5000 }).then(() => {
      resolved = true;
    });
    // Append a non-terminal event after 50ms — should NOT cause idle.
    setTimeout(() => appendFile(file, '{"type":"system"}\n', 'utf8'), 50);
    // After 250ms, an assistant event lands.
    setTimeout(() => appendFile(file, '{"type":"assistant"}\n', 'utf8'), 250);
    await p;
    expect(resolved).toBe(true);
  });

  it('rejects with TimeoutError when idle never reached', async () => {
    await writeFile(file, '{"type":"user"}\n', 'utf8');
    await expect(waitIdle(file, { idleMs: 100, timeoutMs: 200 })).rejects.toThrow(/timed out/i);
  });

  it('waits for the file to appear when it does not exist yet', async () => {
    setTimeout(() => writeFile(file, '{"type":"user"}\n{"type":"assistant"}\n', 'utf8'), 50);
    await waitIdle(file, { idleMs: 100, timeoutMs: 5000 });
  });
});
