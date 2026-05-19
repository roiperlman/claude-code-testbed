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
