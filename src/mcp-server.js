#!/usr/bin/env node
// MCP server (stdio, newline-delimited JSON-RPC) exposing page annotations
// submitted from the browser. Works with Claude Code and Codex.
//
//   npx page-annotator-mcp [--root <project dir>]
//
// The project root defaults to $PAGE_ANNOTATOR_ROOT, then the working directory.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { clearQueue, queueFile, readQueue, toJson, writeQueue } from './store.js';

const argRoot = process.argv.indexOf('--root');
const ROOT = path.resolve(
  argRoot > -1 ? process.argv[argRoot + 1] : process.env.PAGE_ANNOTATOR_ROOT || process.cwd(),
);

const INSTRUCTIONS = `The user picks elements in the browser preview of their app and writes what should change ("page annotations").
When the user mentions page annotations, annotations, or asks to apply / handle them (e.g. "按标注改", "处理页面标注"), call get_page_annotations.
It returns JSON. Each annotation has a note (the request) and loc (source location, file:line:column): open the code at loc. text is the element's text, to tell apart elements rendered by the same line; screenshot is the path of an element screenshot.
When done, call mark_annotations_done with the ids you handled.`;

const TOOLS = [
  {
    name: 'get_page_annotations',
    description:
      'Read the change requests the user submitted from the browser preview (picked element + what to change). Returns JSON and marks those items as delivered. Each has id, note (the request) and loc (source location, file:line:column), and may have text (the element text); selector is given when there is no loc. Items with a screenshot (file path) also come back as image content blocks.',
    inputSchema: {
      type: 'object',
      properties: {
        include_delivered: { type: 'boolean', description: 'Also return items that were read before but not marked done yet. Default false.' },
        include_screenshots: { type: 'boolean', description: 'Include element screenshots (image content blocks) where the user attached one. Default true.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'mark_annotations_done',
    description: 'Mark handled page annotations as done. Without ids, every delivered item is marked done.',
    inputSchema: {
      type: 'object',
      properties: {
        ids: { type: 'array', items: { type: 'integer' }, description: 'Ids of the annotations to mark done (12 for #12).' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'clear_page_annotations',
    description: 'Clear the whole annotation queue, open items included. Only when the user explicitly asks.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
];

const json = (value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }];

function imageBlock(file) {
  try {
    const ext = path.extname(file).slice(1);
    return { type: 'image', data: fs.readFileSync(file).toString('base64'), mimeType: `image/${ext === 'jpg' ? 'jpeg' : ext}` };
  } catch {
    return null; // screenshot file gone: the JSON still carries its path
  }
}

function callTool(name, args = {}) {
  const q = readQueue(ROOT);
  if (name === 'get_page_annotations') {
    const want = args.include_delivered ? ['pending', 'delivered'] : ['pending'];
    const items = q.items.filter((it) => want.includes(it.status));
    if (!items.length) {
      const delivered = q.items.filter((it) => it.status === 'delivered').length;
      return json({ total: 0, ids: [], pages: [], delivered_not_done: delivered, queue_file: queueFile(ROOT) });
    }
    for (const it of items) it.status = 'delivered';
    writeQueue(ROOT, q);
    const content = json({ ...toJson(items), next_step: 'When done, call mark_annotations_done with the ids you handled' });
    if (args.include_screenshots !== false) {
      for (const it of items) {
        const img = it.screenshot && imageBlock(it.screenshot);
        if (img) content.push({ type: 'text', text: `screenshot of #${it.id}` }, img);
      }
    }
    return content;
  }
  if (name === 'mark_annotations_done') {
    const ids = Array.isArray(args.ids) ? new Set(args.ids.map(Number)) : null;
    const marked = [];
    for (const it of q.items) {
      if (it.status === 'done') continue;
      if (ids ? ids.has(it.id) : it.status === 'delivered') { it.status = 'done'; marked.push(it.id); }
    }
    writeQueue(ROOT, q);
    return json({ marked, pending: q.items.filter((it) => it.status === 'pending').length });
  }
  if (name === 'clear_page_annotations') {
    return json({ cleared: clearQueue(ROOT) });
  }
  throw Object.assign(new Error(`Unknown tool: ${name}`), { code: -32602 });
}

const send = (msg) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...msg })}\n`);

function handle(msg) {
  const { id, method, params } = msg;
  if (id === undefined) return; // notification (e.g. notifications/initialized)
  try {
    switch (method) {
      case 'initialize':
        return send({
          id,
          result: {
            protocolVersion: params?.protocolVersion || '2025-06-18',
            capabilities: { tools: {} },
            serverInfo: { name: 'page-annotator', version: '0.1.0' },
            instructions: INSTRUCTIONS,
          },
        });
      case 'ping':
        return send({ id, result: {} });
      case 'tools/list':
        return send({ id, result: { tools: TOOLS } });
      case 'tools/call': {
        return send({ id, result: { content: callTool(params?.name, params?.arguments) } });
      }
      default:
        return send({ id, error: { code: -32601, message: `Method not found: ${method}` } });
    }
  } catch (err) {
    if (method === 'tools/call' && err.code !== -32602) {
      return send({ id, result: { isError: true, content: [{ type: 'text', text: String(err.message || err) }] } });
    }
    return send({ id, error: { code: err.code || -32603, message: String(err.message || err) } });
  }
}

readline.createInterface({ input: process.stdin }).on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return send({ id: null, error: { code: -32700, message: 'Parse error' } }); }
  if (Array.isArray(msg)) msg.forEach(handle); else handle(msg);
});
process.stderr.write(`[page-annotator] MCP server ready, root: ${ROOT}\n`);
