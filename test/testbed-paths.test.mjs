import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { encodeProjectDir, jsonlPath, cacheDir, stateFilePath } from '../src/paths.mjs';

describe('encodeProjectDir', () => {
  it('replaces every / with -', () => {
    expect(encodeProjectDir('/Users/x/foo')).toBe('-Users-x-foo');
  });

  it('preserves a trailing slash as a trailing dash', () => {
    expect(encodeProjectDir('/Users/x/foo/')).toBe('-Users-x-foo-');
  });

  it('replaces dots with dashes', () => {
    // Claude Code 2.1.150 encodes `.` to `-` in addition to `/`. Verified
    // empirically against ~/.claude/projects/ on macOS.
    expect(encodeProjectDir('/a/b.c/d-e')).toBe('-a-b-c-d-e');
  });

  it('encodes /. segments as -- (dot-prefixed hidden dirs)', () => {
    // Regression: a project dir like `/home/user/.local/tmp` lands at
    // `-home-user--local-tmp` in ~/.claude/projects, NOT `-home-user-.local-tmp`.
    // Without this, lib.tail polls the wrong JSONL path and hangs forever.
    expect(encodeProjectDir('/home/user/.local/tmp')).toBe('-home-user--local-tmp');
    expect(encodeProjectDir('/repo/.git/worktrees/x')).toBe('-repo--git-worktrees-x');
  });

  it('preserves existing hyphens, digits, and case', () => {
    expect(encodeProjectDir('/srv/my-project-name')).toBe('-srv-my-project-name');
    expect(encodeProjectDir('/private/tmp/job-AbC123XyZ')).toBe('-private-tmp-job-AbC123XyZ');
  });
});

describe('jsonlPath', () => {
  it('composes home + .claude/projects + encoded + uuid.jsonl', () => {
    const p = jsonlPath('/Users/x/foo', 'abc-123');
    expect(p).toBe(path.join(os.homedir(), '.claude', 'projects', '-Users-x-foo', 'abc-123.jsonl'));
  });
});

describe('cacheDir / stateFilePath', () => {
  /** @type {string | undefined} */
  let savedXdg;

  beforeEach(() => {
    savedXdg = process.env.XDG_CACHE_HOME;
  });

  afterEach(() => {
    if (savedXdg === undefined) delete process.env.XDG_CACHE_HOME;
    else process.env.XDG_CACHE_HOME = savedXdg;
  });

  it('cacheDir honors XDG_CACHE_HOME when set', () => {
    process.env.XDG_CACHE_HOME = '/tmp/xdg-cache';
    expect(cacheDir()).toBe('/tmp/xdg-cache/cursed-testbed');
  });

  it('cacheDir defaults to ~/.cache/cursed-testbed when XDG unset', () => {
    delete process.env.XDG_CACHE_HOME;
    expect(cacheDir()).toBe(path.join(os.homedir(), '.cache', 'cursed-testbed'));
  });

  it('stateFilePath is cacheDir + /state.json', () => {
    delete process.env.XDG_CACHE_HOME;
    expect(stateFilePath()).toBe(path.join(os.homedir(), '.cache', 'cursed-testbed', 'state.json'));
  });
});
