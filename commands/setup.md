---
description: Probe testbed prerequisites (tmux, claude CLI); print structured JSON status.
---

Run the testbed setup probe and report its findings.

Execute exactly one Bash call:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/probe-setup.mjs"
```

Return the JSON output verbatim to the user. Do not summarize it.

If `tmux.available` is `false`, link to install instructions (`brew install tmux` on macOS, `sudo apt-get install tmux` on Debian/Ubuntu).
If `claude.available` is `false`, link to https://github.com/anthropics/claude-code.
`anthropicApiKey.set` is informational only — it is not required. The default `bare: false` mode inherits the host's existing Claude Code login. It is needed only if you explicitly pass `bare: true`.
