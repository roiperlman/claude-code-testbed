#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export async function checkTmux() {
  try {
    const out = await exec('tmux', ['-V']);
    const stdout = typeof out === 'string' ? out : out.stdout;
    const m = stdout.match(/tmux\s+([\d.]+)/);
    return { available: true, version: m ? m[1] : null };
  } catch (err) {
    if (err.code === 'ENOENT') return { available: false };
    throw err;
  }
}

export async function checkClaude() {
  try {
    const out = await exec('claude', ['--version']);
    const stdout = typeof out === 'string' ? out : out.stdout;
    const m = stdout.match(/([\d.]+)/);
    return { available: true, version: m ? m[1] : null };
  } catch (err) {
    if (err.code === 'ENOENT') return { available: false };
    throw err;
  }
}

export function checkApiKey() {
  return { set: Boolean(process.env.ANTHROPIC_API_KEY) };
}

export async function runProbe() {
  const tmux = await checkTmux();
  const claude = await checkClaude();
  const anthropicApiKey = checkApiKey();
  const missing = [];
  if (!tmux.available) missing.push('tmux');
  if (!claude.available) missing.push('claude');
  // ANTHROPIC_API_KEY is reported for visibility but not required: the default
  // bare:false mode inherits the host's existing Claude Code login.
  return {
    tmux,
    claude,
    anthropicApiKey,
    summary: { ok: missing.length === 0, missing },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runProbe();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
