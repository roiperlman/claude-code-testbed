import { describe, test, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { parseLines } from '../../src/jsonl.mjs';
import {
  findToolCalls, findToolResults, findAssistantTexts,
  findUserMessages, findErrors,
} from '../../src/matchers/events.mjs';

async function loadFixture(name) {
  const txt = await readFile(`test/fixtures/${name}.jsonl`, 'utf8');
  return parseLines(txt).events;
}

describe('findToolCalls', () => {
  test('finds Edit tool call in edit-success fixture', async () => {
    const events = await loadFixture('edit-success');
    const calls = findToolCalls(events);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ name: 'Edit', id: 'tu_1' });
    expect(calls[0].input.file_path).toBe('/abs/cwd/foo.mjs');
  });

  test('filtered by name', async () => {
    const events = await loadFixture('edit-success');
    expect(findToolCalls(events, 'Edit')).toHaveLength(1);
    expect(findToolCalls(events, 'Read')).toHaveLength(0);
  });
});

describe('findToolResults', () => {
  test('finds tool_result blocks with metadata', async () => {
    const events = await loadFixture('errored');
    const results = findToolResults(events);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ tool_use_id: 'tu_e', is_error: true });
    expect(results[0].content).toMatch(/ENOENT/);
  });

  test('joins ToolUse with matching ToolResult by tool_use_id', async () => {
    const events = await loadFixture('edit-success');
    const results = findToolResults(events, 'Edit');
    expect(results).toHaveLength(1);
    expect(results[0].tool_name).toBe('Edit');
    expect(results[0].is_error).toBe(false);
  });
});

describe('findAssistantTexts', () => {
  test('extracts assistant text blocks', async () => {
    const events = await loadFixture('edit-success');
    const texts = findAssistantTexts(events);
    expect(texts).toEqual(["I'll edit foo.mjs now.", 'Done — header added.']);
  });
});

describe('findUserMessages', () => {
  test('extracts user-typed strings (not tool_result blocks)', async () => {
    const events = await loadFixture('edit-success');
    const msgs = findUserMessages(events);
    expect(msgs).toEqual(['edit foo.mjs to add a header']);
  });

  test('captures slash commands as user messages', async () => {
    const events = await loadFixture('slash-cmd');
    const msgs = findUserMessages(events);
    expect(msgs).toEqual(['/test-cmd arg1']);
  });
});

describe('findErrors', () => {
  test('finds tool_results with is_error:true', async () => {
    const events = await loadFixture('errored');
    const errs = findErrors(events);
    expect(errs).toHaveLength(1);
    expect(errs[0].content).toMatch(/ENOENT/);
  });

  test('returns empty for clean sessions', async () => {
    const events = await loadFixture('edit-success');
    expect(findErrors(events)).toEqual([]);
  });
});
