import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const serverPath = resolve(here, '../mcp/testbed-mcp.mjs');

const EXPECTED_TOOLS = ['start', 'send', 'slash', 'wait_idle', 'events', 'pane', 'kill', 'list'];

describe('testbed MCP server', () => {
  /** @type {Client} */
  let client;
  /** @type {StdioClientTransport} */
  let transport;

  beforeAll(async () => {
    transport = new StdioClientTransport({ command: 'node', args: [serverPath] });
    client = new Client({ name: 'test', version: '0.0.0' }, { capabilities: {} });
    await client.connect(transport);
  });

  afterAll(async () => {
    await client?.close();
  });

  it('exposes the expected tools', async () => {
    const result = await client.listTools();
    const names = result.tools.map((t) => t.name).sort();
    expect(names).toEqual([...EXPECTED_TOOLS].sort());
  });

  it('list tool returns an array shape', async () => {
    const result = await client.callTool({ name: 'list', arguments: {} });
    expect(result.isError).not.toBe(true);
    const text = result.content[0]?.text;
    const parsed = JSON.parse(text);
    expect(Array.isArray(parsed)).toBe(true);
  });
});
