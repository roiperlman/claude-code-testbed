import { describe, test, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { parseLines } from '../../src/jsonl.mjs';
import '../../src/matchers.mjs';

async function fixture(name) {
  return parseLines(await readFile(`test/fixtures/${name}.jsonl`, 'utf8')).events;
}

// Build a fake "session-like" object whose `events()` is served from a
// fixture. We achieve this by stubbing the lib's events() call via the
// `wait: false` opt-out (no auto-wait) and a custom events provider
// injected via the matcher's `__events` opt.

describe('toHaveCalledTool', () => {
  test('passes when tool was called with matching input', async () => {
    const events = await fixture('edit-success');
    await expect({ id: 'fake', __events: events }).toHaveCalledTool('Edit', { input: { file_path: /foo\.mjs/ } }, { wait: false });
  });

  test('fails when tool name does not appear', async () => {
    const events = await fixture('edit-success');
    await expect(
      expect({ id: 'fake', __events: events }).toHaveCalledTool('Bash', undefined, { wait: false })
    ).rejects.toThrow(/toHaveCalledTool/);
  });

  test('input matcher must match', async () => {
    const events = await fixture('edit-success');
    await expect(
      expect({ id: 'fake', __events: events }).toHaveCalledTool('Edit', { input: { file_path: /bar\.mjs/ } }, { wait: false })
    ).rejects.toThrow(/toHaveCalledTool/);
  });

  test('{ times } exact count', async () => {
    const events = await fixture('edit-success');
    await expect({ id: 'fake', __events: events }).toHaveCalledTool('Edit', undefined, { times: 1, wait: false });
    await expect(
      expect({ id: 'fake', __events: events }).toHaveCalledTool('Edit', undefined, { times: 2, wait: false })
    ).rejects.toThrow(/toHaveCalledTool/);
  });

  test('.not works', async () => {
    const events = await fixture('edit-success');
    await expect({ id: 'fake', __events: events }).not.toHaveCalledTool('Bash', undefined, { wait: false });
  });
});

describe('toHaveToolResult', () => {
  test('matches a successful result content', async () => {
    const events = await fixture('edit-success');
    await expect({ id: 'fake', __events: events }).toHaveToolResult('Edit', /edited successfully/i, { wait: false });
  });

  test('fails when no result matches', async () => {
    const events = await fixture('edit-success');
    await expect(
      expect({ id: 'fake', __events: events }).toHaveToolResult('Edit', /failed/, { wait: false })
    ).rejects.toThrow(/toHaveToolResult/);
  });

  test('matches errored result', async () => {
    const events = await fixture('errored');
    await expect({ id: 'fake', __events: events }).toHaveToolResult('Read', /ENOENT/, { wait: false });
  });
});

describe('toHaveAssistantText', () => {
  test('matches string substring via regex', async () => {
    const events = await fixture('edit-success');
    await expect({ id: 'fake', __events: events }).toHaveAssistantText(/header added/i, { wait: false });
  });

  test('matches any of multiple texts', async () => {
    const events = await fixture('edit-success');
    await expect({ id: 'fake', __events: events }).toHaveAssistantText(/edit foo/i, { wait: false });
  });

  test('fails when no assistant text matches', async () => {
    const events = await fixture('edit-success');
    await expect(
      expect({ id: 'fake', __events: events }).toHaveAssistantText(/never said this/, { wait: false })
    ).rejects.toThrow(/toHaveAssistantText/);
  });
});

describe('toHaveUserMessage', () => {
  test('matches a typed user message', async () => {
    const events = await fixture('edit-success');
    await expect({ id: 'fake', __events: events }).toHaveUserMessage(/edit foo\.mjs/, { wait: false });
  });

  test('captures slash command as user message', async () => {
    const events = await fixture('slash-cmd');
    await expect({ id: 'fake', __events: events }).toHaveUserMessage(/^\/test-cmd/, { wait: false });
  });

  test('fails when no user message matches', async () => {
    const events = await fixture('edit-success');
    await expect(
      expect({ id: 'fake', __events: events }).toHaveUserMessage('not in transcript', { wait: false })
    ).rejects.toThrow(/toHaveUserMessage/);
  });
});
