# claude-code-testbed

[![CI](https://github.com/roiperlman/claude-code-testbed/actions/workflows/ci.yml/badge.svg)](https://github.com/roiperlman/claude-code-testbed/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/claude-code-testbed)](https://www.npmjs.com/package/claude-code-testbed)
[![npm downloads](https://img.shields.io/npm/dm/claude-code-testbed)](https://www.npmjs.com/package/claude-code-testbed)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node ≥20](https://img.shields.io/node/v/claude-code-testbed)](https://nodejs.org)

When you build a Claude Code plugin, the agent writing your code *is* Claude Code. `claude-code-testbed` closes that loop: it lets Claude Code spin up a fresh, fully authenticated Claude Code session, drive it with messages and slash commands, and read back the complete JSONL transcript — so the agent can test its own plugin end-to-end, with no human in the loop.

Write a plugin, run the testbed, assert on the transcript, iterate — all in the same session, without ever asking a human to open a terminal and check the output.

Under the hood it manages tmux sessions and the Claude Code JSONL transcript format, and exposes a small JS API for driving sessions from Vitest (or any test runner).

## Prerequisites

- **Node ≥ 20**
- **tmux** — `brew install tmux` (macOS) or `sudo apt-get install tmux` (Debian/Ubuntu)
- **[Claude Code CLI](https://github.com/anthropics/claude-code)**, installed and authenticated — `claude` must be on your `PATH` and already logged in

That's it. **No API key required.** Spawned sessions reuse whatever login your `claude` CLI already has — your Pro/Max subscription or an API key, whichever you normally use. See [Authentication](#authentication) for details.

## Install

```bash
npm install -D claude-code-testbed
```

## Install as a Claude Code plugin

For live, in-conversation debugging of a plugin you're developing — instead of (or alongside) the npm library in tests:

```
/plugin marketplace add roiperlman/claude-code-testbed
/plugin install claude-code-testbed@claude-code-testbed
```

Restart Claude Code, then run `/claude-code-testbed:setup` to verify prerequisites. The plugin registers an MCP server with eight tools (`start`, `send`, `slash`, `wait_idle`, `events`, `pane`, `kill`, `list`) for driving live testbed sessions from inside Claude Code, and bundles a `using-testbed` skill that teaches the agent when to reach for them. The MCP server itself is fetched from npm via `npx` on first use — no manual `npm install` in the plugin directory is required.

## Quick start

```js
import { start, send, kill } from 'claude-code-testbed';
import { expect, test, afterEach } from 'vitest';

let session;
afterEach(() => session && kill(session.id));

test('agent edits foo.mjs', async () => {
  session = await start();
  await send(session.id, 'edit foo.mjs to add a header comment');

  await expect(session).toHaveCalledTool('Edit', { input: { file_path: /foo\.mjs/ } });
  await expect(session).toHaveTouchedFile('foo.mjs', { content: /header/ });
  await expect(session).toHaveReachedIdle({ within: 30_000 });
});
```

## Authentication

A testbed session is a real `claude` process. By default it inherits your normal Claude Code login — the same OAuth/subscription credentials (or API key) the `claude` CLI uses interactively. If you can run `claude` in a terminal, the testbed works. No extra configuration.

The one exception is `bare: true` (see [`start()`](#startopts--id-tmuxname-jsonlpath)), which runs `claude --bare`: a minimal mode that skips hooks, plugin sync, and keychain reads, and accepts **only** `ANTHROPIC_API_KEY`. Use it for hermetic, CI-style runs where you want to pin auth to an explicit key — otherwise leave it off.

## API

```js
import { start, send, slash, waitIdle, events, pane, tail, kill, list } from 'claude-code-testbed';
```

### `start(opts?)` → `{ id, tmuxName, jsonlPath }`

Spawn a fresh Claude Code session under tmux and wait for the input prompt.

| Option | Default | Description |
|--------|---------|-------------|
| `projectDir` | `process.cwd()` | Directory Claude Code opens |
| `pluginDir` | `projectDir` | Directory containing `.claude-plugin/` |
| `model` | `"haiku"` | Host model (haiku is cheapest, fastest) |
| `bare` | `false` | `false` inherits your Claude Code login; `true` runs `claude --bare` (API-key-only auth) |
| `name` | `null` | Human label shown in `list()` and `tmux ls` |

### `send(id, text)` → `Promise<void>`

Send a user message and press Enter.

### `slash(id, cmd)` → `Promise<void>`

Send a slash command (must start with `/`).

### `waitIdle(id, opts?)` → `Promise<void>`

Block until the session is idle — last event is a turn-completion type and no new events have arrived for `idleMs`.

| Option | Default | Description |
|--------|---------|-------------|
| `timeoutMs` | `60000` | Hard timeout (throws on expiry) |
| `idleMs` | `2000` | Quiet period before declaring idle |

### `events(id, opts?)` → `Promise<object[]>`

Return all JSONL events recorded so far. Pass `{ since: byteOffset }` to read only new events since a previous call.

### `pane(id, opts?)` → `Promise<string>`

Capture the tmux pane scrollback. `{ lines: N }` (default 100).

### `tail(id, opts?)` → `AsyncIterable<object>`

Stream events as they arrive. Pass `{ signal: AbortSignal }` to stop.

### `kill(id)` → `Promise<void>`

Kill the tmux session and remove it from the registry. Idempotent.

### `list()` → `Promise<SessionInfo[]>`

List sessions from the registry, pruning any whose tmux session no longer exists.

## Assertions

> Available since `claude-code-testbed@0.3.0`.

A slim set of 10 Vitest custom matchers for asserting on a recorded session. Register them once in your Vitest config:

```js
// vitest.config.mjs
export default {
  test: {
    setupFiles: ['claude-code-testbed/matchers'],
  },
};
```

Then in any test:

```js
import { start, send, kill } from 'claude-code-testbed';
import { expect, test, afterEach } from 'vitest';

let session;
afterEach(() => session && kill(session.id));

test('agent edits foo.mjs', async () => {
  session = await start();
  await send(session.id, 'edit foo.mjs to add a header');

  await expect(session).toHaveCalledTool('Edit', { input: { file_path: /foo\.mjs/ } });
  await expect(session).toHaveTouchedFile('foo.mjs', { content: /header/ });
  await expect(session).toHaveReachedIdle({ within: 30_000 });
});
```

All matchers auto-wait for the session to reach idle before reading; pass `{ wait: false }` to opt out. All support `.not`.

| Matcher | Purpose |
|---------|---------|
| `toHaveCalledTool(name, inputMatcher?, { times?, wait?, timeoutMs? })` | Tool was invoked (optionally N times, with matching input) |
| `toHaveToolResult(name, resultMatcher, opts?)` | Tool returned matching content |
| `toHaveAssistantText(matcher, opts?)` | Agent text matches |
| `toHaveUserMessage(matcher, opts?)` | User input (or slash command) matches |
| `toHaveTouchedFile(path, { created?, content?, ... })` | Disk file matches (reads disk, not events) |
| `toHaveReachedIdle({ within?, ... })` | Session became idle (optionally within N ms) |
| `toHaveErrored(matcher?, opts?)` | Any error event present |
| `toHavePaneText(matcher, { lines?, ... })` | Tmux pane scrollback matches |
| `toHaveEvent(predicate, opts?)` | Escape hatch — any JSONL event matches |
| `toMatchTranscriptSnapshot({ normalize? })` | Semantic snapshot (timestamps/ids/text stripped) |

Matchers accept either the `{ id, ... }` object from `start()` or a bare `id` string. Input matchers accept a string (strict equality), `RegExp` (test), object (deep partial), or function `(value) => boolean`.

## CLI

```bash
# Start a session
npx claude-code-testbed start --project /path/to/project --model haiku

# Send a message
npx claude-code-testbed send <id> "hello"

# Send a slash command
npx claude-code-testbed slash <id> "/help"

# Wait until idle
npx claude-code-testbed wait-idle <id> --timeout 120000

# Read events
npx claude-code-testbed events <id> --format pretty

# Stream events (Ctrl-C to stop)
npx claude-code-testbed tail <id>

# Print tmux pane
npx claude-code-testbed pane <id> --lines 200

# Kill a session
npx claude-code-testbed kill <id>

# List active sessions
npx claude-code-testbed list
```

Pass `--bare` to `start` for API-key-only auth (see [Authentication](#authentication)).

## Usage in tests

```js
import { start, slash, waitIdle, events, kill } from 'claude-code-testbed';
import { afterEach, it, expect } from 'vitest';

let session;

afterEach(async () => {
  if (session) await kill(session.id);
});

it('my plugin responds to /my-command', async () => {
  session = await start({
    pluginDir: new URL('..', import.meta.url).pathname,
    model: 'haiku',
    name: 'my-plugin-e2e',
  });

  await slash(session.id, '/my-command');
  await waitIdle(session.id, { timeoutMs: 120_000, idleMs: 3000 });

  const evs = await events(session.id);
  const toolResult = evs.find((e) => e.type === 'tool_result');
  expect(toolResult?.is_error).not.toBe(true);
});
```

Two rules that save you grief:

- **Always `waitIdle` before reading events** — the JSONL is written asynchronously, so reading mid-turn gives a partial transcript.
- **Always `kill` in `afterEach`** — dangling sessions pile up in `tmux ls` as `testbed-<id>`.

## When to use vs. unit tests

Use the testbed when the question is "what does the *host* (Claude Code) do with this?" — plugin discovery, slash-command routing, tool-call rendering, JSONL transcript shape, MCP notification rendering. The testbed is the only programmable way to answer those questions.

Don't use it when the question is "what does my adapter / parser / server logic do on a given input?" — those have cheaper answers (pure unit tests, direct MCP client calls). Each testbed scenario costs a real model call and 5–60s; reach for it only after the cheaper layers pass.

Gate testbed tests behind an environment variable so they don't run in CI by default:

```js
it.skipIf(!process.env.TESTBED_E2E)('e2e: plugin responds correctly', async () => {
  // ...
});
```

## Canonical consumer

[cursed](https://github.com/roiperlman/cursed) — the Claude Code plugin this was extracted from — uses `claude-code-testbed` for its integration test suite. See `test/integration/` there for worked examples.

## License

MIT
