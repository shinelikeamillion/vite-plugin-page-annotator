import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { addSubmission, listAgents, readQueue } from '../src/store.js';

const SERVER = new URL('../src/mcp-server.js', import.meta.url).pathname;

function start(root, clientName) {
  const child = spawn(process.execPath, [SERVER, '--root', root], { stdio: ['pipe', 'pipe', 'ignore'] });
  const waiting = new Map();
  readline.createInterface({ input: child.stdout }).on('line', (line) => {
    const msg = JSON.parse(line);
    waiting.get(msg.id)?.(msg);
  });
  let n = 0;
  const call = (method, params) => new Promise((resolve) => {
    const id = ++n;
    waiting.set(id, resolve);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
  const tool = async (name, args = {}) => JSON.parse((await call('tools/call', { name, arguments: args })).result.content[0].text);
  const ready = call('initialize', { protocolVersion: '2025-06-18', clientInfo: { name: clientName } });
  const stop = () => new Promise((resolve) => { child.on('exit', resolve); child.stdin.end(); });
  return { ready, tool, stop };
}

test('each MCP client registers itself and only reads annotations sent to it', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'page-annotator-mcp-'));
  addSubmission(root, { target: 'codex', items: [{ note: 'for codex' }] });
  addSubmission(root, { target: 'claude', items: [{ note: 'for claude' }] });
  addSubmission(root, { items: [{ note: 'for anyone' }] });

  const claude = start(root, 'claude-code');
  const codex = start(root, 'codex-mcp-client');
  await Promise.all([claude.ready, codex.ready]);
  assert.deepEqual(listAgents(root).map((a) => a.agent).sort(), ['claude', 'codex']);

  const c = await claude.tool('get_page_annotations', { include_screenshots: false });
  assert.deepEqual(c.annotations.map((a) => a.note), ['for claude', 'for anyone']);
  const x = await codex.tool('get_page_annotations', { include_screenshots: false });
  assert.deepEqual(x.annotations.map((a) => a.note), ['for codex']);

  const done = await claude.tool('mark_annotations_done');
  assert.deepEqual(done.marked, [2, 3]);
  assert.equal(readQueue(root).items.find((it) => it.id === 1).status, 'delivered');

  await Promise.all([claude.stop(), codex.stop()]);
  assert.deepEqual(listAgents(root), []);
});
