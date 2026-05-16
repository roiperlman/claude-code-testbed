#!/usr/bin/env node
import * as lib from './lib.mjs';

const HELP = `Usage: testbed <command> [options]

Commands:
  start [--project DIR] [--plugin-dir DIR] [--model M] [--no-bare] [--name N]
                                  Spawn a fresh Claude Code session
  send <id> "<text>"              Send a user message
  slash <id> "<cmd>"              Send a slash command
  wait-idle <id> [--timeout MS] [--idle MS]
                                  Block until the session is idle
  events <id> [--since OFFSET] [--format json|pretty]
                                  Print JSONL events
  pane <id> [--lines N]           Print tmux pane scrollback
  tail <id> [--format json|pretty]
                                  Stream events as they arrive (Ctrl-C to stop)
  kill <id>                       Kill the session
  list                            List active sessions
  help                            Show this help`;

/**
 * Minimal argv parser. Returns { positional: string[], flags: Record<string, string|boolean> }.
 *
 * @param {string[]} argv
 */
function parseArgs(argv) {
  const positional = [];
  /** @type {Record<string, string|boolean>} */
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i++;
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

async function cmdHelp() {
  process.stdout.write(`${HELP}\n`);
}

async function cmdList() {
  const sessions = await lib.list();
  if (sessions.length === 0) {
    process.stdout.write('(no active sessions)\n');
    return;
  }
  for (const s of sessions) {
    const label = s.name ? ` (${s.name})` : '';
    process.stdout.write(
      `${s.id}  ${s.tmuxName}  ${s.model}${label}\n  project: ${s.projectDir}\n  jsonl:   ${s.jsonlPath}\n  started: ${s.startedAt}\n\n`,
    );
  }
}

/**
 * @param {string[]} rest
 */
async function cmdStart(rest) {
  const { flags } = parseArgs(rest);
  const result = await lib.start({
    projectDir: typeof flags.project === 'string' ? flags.project : undefined,
    pluginDir: typeof flags['plugin-dir'] === 'string' ? flags['plugin-dir'] : undefined,
    model: typeof flags.model === 'string' ? flags.model : undefined,
    bare: !flags['no-bare'],
    name: typeof flags.name === 'string' ? flags.name : undefined,
  });
  process.stdout.write(`${result.id}\n`);
  process.stderr.write(`tmux: ${result.tmuxName}\njsonl: ${result.jsonlPath}\n`);
}

/**
 * @param {string[]} positional
 */
function requireId(positional) {
  if (positional.length === 0) throw new Error('missing <id> argument');
  return positional[0];
}

/**
 * @param {string[]} rest
 */
async function cmdSend(rest) {
  const { positional } = parseArgs(rest);
  const id = requireId(positional);
  const text = positional.slice(1).join(' ');
  if (!text) throw new Error('missing <text> argument');
  await lib.send(id, text);
}

/**
 * @param {string[]} rest
 */
async function cmdSlash(rest) {
  const { positional } = parseArgs(rest);
  const id = requireId(positional);
  const cmd = positional.slice(1).join(' ');
  if (!cmd) throw new Error('missing <cmd> argument');
  await lib.slash(id, cmd);
}

/**
 * @param {string[]} rest
 */
async function cmdWaitIdle(rest) {
  const { positional, flags } = parseArgs(rest);
  const id = requireId(positional);
  await lib.waitIdle(id, {
    timeoutMs: typeof flags.timeout === 'string' ? Number(flags.timeout) : undefined,
    idleMs: typeof flags.idle === 'string' ? Number(flags.idle) : undefined,
  });
}

/**
 * @param {Record<string, unknown>} e
 * @param {string} format
 */
function formatEvent(e, format) {
  if (format === 'pretty') {
    const type = e.type ?? '?';
    const role = /** @type {Record<string, unknown>|undefined} */ (e.message)?.role ?? '';
    const oneline = JSON.stringify(e).slice(0, 160);
    return `${type}\t${role}\t${oneline}\n`;
  }
  return `${JSON.stringify(e)}\n`;
}

/**
 * @param {string[]} rest
 */
async function cmdEvents(rest) {
  const { positional, flags } = parseArgs(rest);
  const id = requireId(positional);
  const since = typeof flags.since === 'string' ? Number(flags.since) : 0;
  const format = flags.format === 'pretty' ? 'pretty' : 'json';
  const events = await lib.events(id, { since });
  for (const e of events) process.stdout.write(formatEvent(e, format));
}

/**
 * @param {string[]} rest
 */
async function cmdPane(rest) {
  const { positional, flags } = parseArgs(rest);
  const id = requireId(positional);
  const lines = typeof flags.lines === 'string' ? Number(flags.lines) : 100;
  const out = await lib.pane(id, { lines });
  process.stdout.write(out);
}

/**
 * @param {string[]} rest
 */
async function cmdTail(rest) {
  const { positional, flags } = parseArgs(rest);
  const id = requireId(positional);
  const format = flags.format === 'pretty' ? 'pretty' : 'json';
  const ac = new AbortController();
  process.on('SIGINT', () => ac.abort());
  for await (const e of lib.tail(id, { signal: ac.signal })) {
    process.stdout.write(formatEvent(e, format));
  }
}

/**
 * @param {string[]} rest
 */
async function cmdKill(rest) {
  const { positional } = parseArgs(rest);
  const id = requireId(positional);
  await lib.kill(id);
}

const COMMANDS = {
  help: cmdHelp,
  list: cmdList,
  start: cmdStart,
  send: cmdSend,
  slash: cmdSlash,
  'wait-idle': cmdWaitIdle,
  events: cmdEvents,
  pane: cmdPane,
  tail: cmdTail,
  kill: cmdKill,
};

async function main() {
  const [, , cmd, ...rest] = process.argv;
  if (!cmd || cmd === '-h' || cmd === '--help') {
    await cmdHelp();
    return;
  }
  const handler = /** @type {Record<string, ((rest: string[]) => Promise<void>) | undefined>} */ (COMMANDS)[cmd];
  if (!handler) {
    process.stderr.write(`testbed: unknown command "${cmd}"\n\n${HELP}\n`);
    process.exit(2);
  }
  try {
    await handler(rest);
  } catch (err) {
    process.stderr.write(`testbed ${cmd}: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}

main();
