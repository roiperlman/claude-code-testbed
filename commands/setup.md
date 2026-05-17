---
description: Probe testbed prerequisites (tmux, claude CLI, ANTHROPIC_API_KEY); print structured JSON status.
---

Run the testbed setup probe and report its findings.

Execute exactly one Bash call:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/probe-setup.mjs"
```

Return the JSON output verbatim to the user. Do not summarize it.

If `tmux.available` is `false`, link to install instructions (`brew install tmux` on macOS, `sudo apt-get install tmux` on Debian/Ubuntu).
If `claude.available` is `false`, link to https://github.com/anthropics/claude-code.
If `anthropicApiKey.set` is `false`, explain it's required for the default `bare: true` mode used by `start`.
