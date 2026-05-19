import { describe, test, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { parseLines } from '../../src/jsonl.mjs';
import { normalizeTranscript } from '../../src/matchers/snapshot.mjs';

async function loadFixture(name) {
  const txt = await readFile(`test/fixtures/${name}.jsonl`, 'utf8');
  return parseLines(txt).events;
}

describe('normalizeTranscript', () => {
  test('strips timestamps, ids, session_id recursively', async () => {
    const events = await loadFixture('edit-success');
    const out = normalizeTranscript(events);
    for (const e of out) {
      expect(e.timestamp).toBeUndefined();
      expect(e.id).toBeUndefined();
      expect(e.session_id).toBeUndefined();
      expect(e.parent_id).toBeUndefined();
    }
  });

  test('strips usage / token-count fields', async () => {
    const events = await loadFixture('edit-success');
    const out = normalizeTranscript(events);
    for (const e of out) {
      expect(e.usage).toBeUndefined();
      expect(e.input_tokens).toBeUndefined();
      expect(e.output_tokens).toBeUndefined();
    }
  });

  test('replaces assistant text with placeholder', async () => {
    const events = await loadFixture('edit-success');
    const out = normalizeTranscript(events);
    const texts = [];
    for (const e of out) {
      if (e.type !== 'assistant') continue;
      for (const b of e.message?.content ?? []) {
        if (b.type === 'text') texts.push(b.text);
      }
    }
    expect(texts.every((t) => t === '<text>')).toBe(true);
    expect(texts.length).toBeGreaterThan(0);
  });

  test('preserves tool_use input verbatim (except path relativization)', async () => {
    const events = await loadFixture('edit-success');
    const out = normalizeTranscript(events);
    const call = out.flatMap((e) => e.message?.content ?? []).find((b) => b?.type === 'tool_use');
    expect(call.name).toBe('Edit');
    expect(call.input.old_string).toBe('hello');
    expect(call.input.new_string).toBe('// header\nhello');
  });

  test('relativizes absolute paths under cwd', () => {
    const cwd = process.cwd();
    const events = [
      { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: `${cwd}/foo.mjs` } }] } },
    ];
    const out = normalizeTranscript(events);
    expect(out[0].message.content[0].input.file_path).toBe('foo.mjs');
  });

  test('{ normalize: false } via direct fn is not the responsibility here', () => {
    // The matcher decides whether to call normalize; this fn always normalizes.
    // Caller passes raw events bypass it.
    expect(typeof normalizeTranscript).toBe('function');
  });

  test('custom normalizer fn overrides default', async () => {
    const events = await loadFixture('edit-success');
    const out = normalizeTranscript(events, (es) => es.map(() => ({ stripped: true })));
    expect(out).toEqual(events.map(() => ({ stripped: true })));
  });
});
