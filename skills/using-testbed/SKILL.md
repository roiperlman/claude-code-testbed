---
name: using-testbed
description: Use when debugging a Claude Code plugin you're developing — drives a real Claude Code session via MCP tools (start, slash, wait_idle, events) to verify the host's actual behavior with your plugin. For live exploration of plugin discovery, slash-command routing, tool-call rendering, JSONL transcript shape. NOT for regression tests (those use the JS lib directly inside Vitest).
---

# Using the testbed

The `claude-code-testbed` plugin exposes MCP tools that spin up a real Claude Code session under tmux with a target plugin loaded, then let you observe what the host does with it. Use it for live, exploratory debugging during plugin development.

## When to use

- You changed a plugin file and want to see how Claude Code actually behaves with it
- A plugin behaves unexpectedly and you want to inspect the JSONL transcript the host recorded
- You're verifying a brand-new command, skill, or MCP tool works end-to-end

## When NOT to use

- **Regression tests** — use Vitest importing `claude-code-testbed` from npm directly. The plugin is for interactive debugging, not scripted test runs.
- **Adapter / parser bugs** — unit-test against fixtures. No host needed.
- **Anything resolvable by reading code** — each tool call costs 5–30s and real model tokens.

## Tools

| Tool | Purpose |
|---|---|
| `start` | Spawn a session. Returns `{id, tmuxName, jsonlPath}`. |
| `send` | Send a user message. |
| `slash` | Send a slash command (must start with `/`). |
| `wait_idle` | Block until the host is idle. Always call before `events`. |
| `events` | Read JSONL events as objects. |
| `pane` | Capture tmux scrollback (text). |
| `kill` | End the session. Always do this when done. |
| `list` | List active sessions. |

## Typical debugging flow

```
start({plugin_dir: '/path/to/plugin', name: 'debug-foo'})  → {id, ...}
slash({id, cmd: '/my-plugin:foo'})
wait_idle({id, timeout_ms: 60000})
events({id})                       → inspect tool_use / tool_result / logging entries
kill({id})
```

## Three rules

1. **Always `wait_idle` before `events`.** The JSONL is written asynchronously; reading mid-turn gives a partial transcript.
2. **Always `kill` when done.** Dangling tmux sessions accumulate as `testbed-<8 char id>`. Use `list` to find leftovers.
3. **Use generous `timeout_ms`.** Real model calls take 5–30s; tool-heavy turns take longer. 120000 (2 minutes) is a reasonable default.

## If tools fail

Run `/claude-code-testbed:setup` to probe prerequisites (tmux, `claude` CLI on PATH). The output is structured JSON.
