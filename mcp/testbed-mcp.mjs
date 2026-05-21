#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import * as lib from '../src/index.mjs';

const TOOLS = [
  {
    name: 'start',
    description: 'Spawn a fresh Claude Code session under tmux and wait for the input prompt. Returns {id, tmuxName, jsonlPath}.',
    inputSchema: {
      type: 'object',
      properties: {
        project_dir: { type: 'string', description: 'Directory Claude Code opens. Defaults to cwd.' },
        plugin_dir: { type: 'string', description: 'Directory containing .claude-plugin/. Defaults to project_dir.' },
        model: { type: 'string', description: 'Host model. Default "haiku".' },
        bare: { type: 'boolean', description: 'true forces ANTHROPIC_API_KEY-only auth (claude --bare); false (default) inherits your existing Claude Code login.' },
        name: { type: 'string', description: 'Human label for the session.' },
      },
    },
  },
  {
    name: 'send',
    description: 'Send a user message to a session and press Enter.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, text: { type: 'string' } },
      required: ['id', 'text'],
    },
  },
  {
    name: 'slash',
    description: 'Send a slash command (must start with "/").',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, cmd: { type: 'string' } },
      required: ['id', 'cmd'],
    },
  },
  {
    name: 'wait_idle',
    description: 'Block until the session is idle. Always call this before reading events.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        timeout_ms: { type: 'number', description: 'Default 60000.' },
        idle_ms: { type: 'number', description: 'Default 2000.' },
      },
      required: ['id'],
    },
  },
  {
    name: 'events',
    description: 'Read JSONL events recorded so far. Returns an array of event objects.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        since: { type: 'number', description: 'Byte offset to start from. Default 0.' },
      },
      required: ['id'],
    },
  },
  {
    name: 'pane',
    description: 'Capture tmux pane scrollback. Returns the text.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        lines: { type: 'number', description: 'Default 100.' },
      },
      required: ['id'],
    },
  },
  {
    name: 'kill',
    description: 'Kill the named session. Idempotent.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
  },
  {
    name: 'list',
    description: 'List active sessions. Returns an array.',
    inputSchema: { type: 'object', properties: {} },
  },
];

const server = new Server(
  { name: 'claude-code-testbed', version: '0.4.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name;
  const args = req.params.arguments ?? {};
  let result;
  switch (name) {
    case 'start':
      result = await lib.start({
        projectDir: args.project_dir,
        pluginDir: args.plugin_dir,
        model: args.model,
        bare: args.bare,
        name: args.name,
      });
      break;
    case 'send':
      await lib.send(args.id, args.text);
      result = { ok: true };
      break;
    case 'slash':
      await lib.slash(args.id, args.cmd);
      result = { ok: true };
      break;
    case 'wait_idle':
      await lib.waitIdle(args.id, { timeoutMs: args.timeout_ms, idleMs: args.idle_ms });
      result = { ok: true };
      break;
    case 'events':
      result = await lib.events(args.id, { since: args.since });
      break;
    case 'pane':
      result = await lib.pane(args.id, { lines: args.lines });
      break;
    case 'kill':
      await lib.kill(args.id);
      result = { ok: true };
      break;
    case 'list':
      result = await lib.list();
      break;
    default:
      throw new Error(`unknown tool: ${name}`);
  }
  return { content: [{ type: 'text', text: JSON.stringify(result) }] };
});

await server.connect(new StdioServerTransport());
