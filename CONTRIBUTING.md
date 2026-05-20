# Contributing to claude-code-testbed

Thanks for your interest in contributing. This guide covers everything you need to get started.

## Prerequisites

- Node ≥ 20
- [tmux](https://github.com/tmux/tmux) (`brew install tmux` / `sudo apt-get install tmux`)
- [Claude Code CLI](https://github.com/anthropics/claude-code) (`claude` on PATH)
- `ANTHROPIC_API_KEY` in your environment (required for running the test suite)

## Local setup

```bash
git clone https://github.com/roiperlman/claude-code-testbed.git
cd claude-code-testbed
npm install
```

## Running tests

Tests spawn real Claude Code sessions under tmux and require a valid API key and the `claude` CLI on PATH.

```bash
npm test
```

If `claude` isn't on PATH or `ANTHROPIC_API_KEY` isn't set, tests will fail immediately with a clear message.

## Making changes

1. Fork the repo and create a branch from `main`:
   ```bash
   git checkout -b fix/your-topic
   ```
2. Make your changes. Keep commits focused — one logical change per commit.
3. Run `npm test` and confirm tests pass before pushing.
4. Open a pull request against `main`. Fill in the PR description with what changed and why.

## What makes a good PR

- **Bug fixes**: include a test that would have caught the bug.
- **New features**: discuss in an issue first if the scope is non-trivial.
- **Docs/typos**: no issue needed, go ahead.

## Reporting bugs

Open an issue and include:
- Node version (`node --version`)
- tmux version (`tmux -V`)
- Claude Code version (`claude --version`)
- The minimal code that reproduces the problem
- What you expected vs. what happened

## Questions

Open a GitHub Discussion or an issue tagged `question`.
