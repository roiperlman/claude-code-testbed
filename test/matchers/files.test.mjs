import { describe, test, expect } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkTouchedFile } from '../../src/matchers/files.mjs';

async function withTmpDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'matchers-files-'));
  try { return await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}

describe('checkTouchedFile', () => {
  test('exists by default', async () => {
    await withTmpDir(async (dir) => {
      const p = join(dir, 'a.txt');
      await writeFile(p, 'hello');
      const r = await checkTouchedFile(p, {});
      expect(r.pass).toBe(true);
    });
  });

  test('missing file fails by default', async () => {
    await withTmpDir(async (dir) => {
      const r = await checkTouchedFile(join(dir, 'missing.txt'), {});
      expect(r.pass).toBe(false);
      expect(r.reason).toMatch(/not exist/i);
    });
  });

  test('{ created: true } requires existence', async () => {
    await withTmpDir(async (dir) => {
      const r = await checkTouchedFile(join(dir, 'no.txt'), { created: true });
      expect(r.pass).toBe(false);
    });
  });

  test('{ created: false } requires non-existence', async () => {
    await withTmpDir(async (dir) => {
      const p = join(dir, 'gone.txt');
      const r1 = await checkTouchedFile(p, { created: false });
      expect(r1.pass).toBe(true);
      await writeFile(p, 'oops');
      const r2 = await checkTouchedFile(p, { created: false });
      expect(r2.pass).toBe(false);
    });
  });

  test('content matcher: string', async () => {
    await withTmpDir(async (dir) => {
      const p = join(dir, 'c.txt');
      await writeFile(p, 'exact');
      expect((await checkTouchedFile(p, { content: 'exact' })).pass).toBe(true);
      expect((await checkTouchedFile(p, { content: 'other' })).pass).toBe(false);
    });
  });

  test('content matcher: regex', async () => {
    await withTmpDir(async (dir) => {
      const p = join(dir, 'c.txt');
      await writeFile(p, 'hello world');
      expect((await checkTouchedFile(p, { content: /world/ })).pass).toBe(true);
      expect((await checkTouchedFile(p, { content: /xyz/ })).pass).toBe(false);
    });
  });

  test('content matcher: function', async () => {
    await withTmpDir(async (dir) => {
      const p = join(dir, 'c.txt');
      await writeFile(p, 'abc');
      expect((await checkTouchedFile(p, { content: (s) => s.length === 3 })).pass).toBe(true);
    });
  });
});
