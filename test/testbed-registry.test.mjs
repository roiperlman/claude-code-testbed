import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readRegistry, addSession, removeSession, pruneRegistry } from '../src/registry.mjs';

/** @type {string} */
let tmpDir;
/** @type {string | undefined} */
let savedXdg;

beforeEach(async () => {
  savedXdg = process.env.XDG_CACHE_HOME;
  tmpDir = await mkdtemp(path.join(tmpdir(), 'testbed-registry-'));
  process.env.XDG_CACHE_HOME = tmpDir;
});

afterEach(async () => {
  if (savedXdg === undefined) delete process.env.XDG_CACHE_HOME;
  else process.env.XDG_CACHE_HOME = savedXdg;
  await rm(tmpDir, { recursive: true, force: true });
});

const sessionA = {
  id: 'aaaaaaaa-1111-2222-3333-444444444444',
  tmuxName: 'testbed-aaaaaaaa',
  jsonlPath: '/dev/null/a.jsonl',
  projectDir: '/tmp/a',
  pluginDir: '/tmp/a',
  model: 'haiku',
  bare: true,
  name: null,
  startedAt: '2026-04-28T00:00:00.000Z',
};

const sessionB = {
  ...sessionA,
  id: 'bbbbbbbb-1111-2222-3333-444444444444',
  tmuxName: 'testbed-bbbbbbbb',
  jsonlPath: '/dev/null/b.jsonl',
  startedAt: '2026-04-28T00:01:00.000Z',
};

describe('registry', () => {
  it('readRegistry returns [] when state.json is missing', async () => {
    expect(await readRegistry()).toEqual([]);
  });

  it('addSession persists and is readable', async () => {
    await addSession(sessionA);
    const all = await readRegistry();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(sessionA.id);
  });

  it('addSession appends without dropping existing entries', async () => {
    await addSession(sessionA);
    await addSession(sessionB);
    const all = await readRegistry();
    expect(all.map((s) => s.id).sort()).toEqual([sessionA.id, sessionB.id].sort());
  });

  it('removeSession drops by id', async () => {
    await addSession(sessionA);
    await addSession(sessionB);
    await removeSession(sessionA.id);
    const all = await readRegistry();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(sessionB.id);
  });

  it('pruneRegistry drops entries whose tmuxName is not reported alive', async () => {
    await addSession(sessionA);
    await addSession(sessionB);
    const isAlive = async (/** @type {string} */ name) => name === sessionB.tmuxName;
    const remaining = await pruneRegistry(isAlive);
    expect(remaining.map((s) => s.id)).toEqual([sessionB.id]);
    // And the file is updated:
    const all = await readRegistry();
    expect(all.map((s) => s.id)).toEqual([sessionB.id]);
  });

  it('readRegistry recovers from corrupt JSON by returning []', async () => {
    const filepath = path.join(tmpDir, 'cursed-testbed', 'state.json');
    await mkdir(path.dirname(filepath), { recursive: true });
    await writeFile(filepath, 'not-json{{{', 'utf8');
    expect(await readRegistry()).toEqual([]);
  });
});
