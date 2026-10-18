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

const INSTRUCTIONS = `用户会在浏览器预览页面里点选元素并写下修改需求（"页面标注"）。
当用户提到页面标注、标注、"按标注改"、"处理标注"时，调用 get_page_annotations 读取。
返回 JSON。每条标注带有 note（需求）和 loc（源码位置 文件:行:列），按 loc 定位代码；text 是元素文字，用于区分循环渲染的同一行；screenshot 是元素截图的文件路径。
改完后调用 mark_annotations_done 传入已处理的 id。`;

const TOOLS = [
  {
    name: 'get_page_annotations',
    description:
      '读取用户在浏览器预览页面上提交的修改标注（点选的元素 + 修改需求）。返回 JSON 并把这些条目标记为已读取。每条包含 id、note（需求）、loc（源码位置 文件:行:列），可能有 text（元素文字）；没有 loc 时给 selector。有 screenshot（截图文件路径）的条目，截图也会作为图片内容块一起返回。',
    inputSchema: {
      type: 'object',
      properties: {
        include_delivered: { type: 'boolean', description: '同时返回之前已读取但尚未标记完成的条目。默认 false。' },
        include_screenshots: { type: 'boolean', description: '附带用户勾选截图的元素截图（图片内容块）。默认 true。' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'mark_annotations_done',
    description: '把已经处理完的页面标注标记为完成。不传 ids 时，把所有已读取的条目都标记为完成。',
    inputSchema: {
      type: 'object',
      properties: {
        ids: { type: 'array', items: { type: 'integer' }, description: '要标记完成的标注 id（形如 #12 中的 12）。' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'clear_page_annotations',
    description: '清空页面标注队列（包括未处理的）。只在用户明确要求时使用。',
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
    const content = json({ ...toJson(items), next_step: '处理完成后调用 mark_annotations_done，传入已处理的 ids' });
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
