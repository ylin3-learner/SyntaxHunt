#!/usr/bin/env node
// Driving Adapter 1: Zero-dependency MCP Server (JSON-RPC 2.0 over stdio)
import readline from 'node:readline';
import { describeCapabilities, executeCapability } from '#core/application/harness-facade.mjs';

const rl = readline.createInterface({ input: process.stdin, terminal: false });

function sendResponse(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}

function sendError(id, code, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n');
}

rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch (_) {
    return;
  }

  const { id, method, params } = msg;
  if (id === undefined) return; // Ignore notifications

  try {
    if (method === 'initialize') {
      return sendResponse(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'agent-harness-kit', version: '3.0.0' },
      });
    }

    if (method === 'tools/list') {
      const { tools } = describeCapabilities();
      return sendResponse(id, { tools });
    }

    if (method === 'tools/call') {
      const toolName = params?.name;
      const args = params?.arguments || {};
      const data = executeCapability(toolName, args, process.cwd());
      return sendResponse(id, {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
        isError: data.ok === false,
      });
    }

    return sendError(id, -32601, `Method not found: ${method}`);
  } catch (err) {
    return sendError(id, -32000, err.message);
  }
});
