// Shared annotation queue: written by the Vite middleware, read by the MCP server.
// Lives in <root>/.page-annotator/ (gitignored) so a reinstall of node_modules keeps the history.
import fs from 'node:fs';
import path from 'node:path';

const migrated = new Set();
const dir = (root) => {
  const now = path.join(root, '.page-annotator');
  if (!migrated.has(root)) {
    migrated.add(root);
    // earlier versions kept everything under node_modules/
    const old = path.join(root, 'node_modules', '.page-annotator');
    if (!fs.existsSync(now) && fs.existsSync(old)) {
      try {
        fs.renameSync(old, now);
        const file = path.join(now, 'annotations.json');
        if (fs.existsSync(file)) fs.writeFileSync(file, fs.readFileSync(file, 'utf8').split(JSON.stringify(old).slice(1, -1)).join(JSON.stringify(now).slice(1, -1)));
      } catch { /* keep going with a fresh folder */ }
    }
  }
  return now;
};

export function queueFile(root) {
  return path.join(dir(root), 'annotations.json');
}

export function readQueue(root) {
  try {
    const q = JSON.parse(fs.readFileSync(queueFile(root), 'utf8'));
    if (Array.isArray(q.items)) return { nextId: q.nextId || 1, items: q.items };
  } catch {
    // missing or corrupt file: start fresh
  }
  return { nextId: 1, items: [] };
}

export function writeQueue(root, q) {
  const file = queueFile(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(q, null, 2));
  fs.renameSync(tmp, file);
}

function saveScreenshot(root, id, dataUrl) {
  const m = /^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(String(dataUrl || ''));
  if (!m) return undefined;
  const file = path.join(dir(root), 'shots', `${id}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(m[2], 'base64'));
  return file;
}

function removeScreenshot(item) {
  if (item.screenshot) fs.rmSync(item.screenshot, { force: true });
}

/** Append one submission from the page; returns the stored items. */
export function addSubmission(root, payload) {
  const q = readQueue(root);
  const page = {
    url: String(payload.url || ''),
    title: String(payload.title || ''),
    viewport: payload.viewport || null,
  };
  const createdAt = new Date().toISOString();
  const target = validAgent(payload.target);
  const added = (payload.items || [])
    .filter((it) => it && typeof it.note === 'string' && it.note.trim())
    .map(({ screenshot, ...it }) => {
      const id = q.nextId++;
      const item = { ...it, id, status: 'pending', createdAt, page, screenshot: saveScreenshot(root, id, screenshot) };
      if (target) item.target = target;
      else delete item.target;
      return item;
    });
  q.items.push(...added);
  // keep the queue small: drop finished items beyond the most recent 200
  const done = q.items.filter((it) => it.status === 'done');
  if (done.length > 200) {
    const drop = new Set(done.slice(0, done.length - 200).map((it) => it.id));
    q.items.filter((it) => drop.has(it.id)).forEach(removeScreenshot);
    q.items = q.items.filter((it) => !drop.has(it.id));
  }
  writeQueue(root, q);
  return added;
}

/** Latest sent prompt, picked up by the Claude Code inbox plugin (only when target is empty or 'claude'). */
export function outboxFile(root) {
  return path.join(dir(root), 'outbox.json');
}

export function writeOutbox(root, items, prompt, target = items[0]?.target) {
  const file = outboxFile(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const body = { seq: items[items.length - 1].id, ids: items.map((it) => it.id), target: validAgent(target) || null, prompt, sentAt: new Date().toISOString() };
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(body, null, 2));
  fs.renameSync(`${file}.tmp`, file);
}

// ---------- agents: which MCP clients (Claude Code, Codex, ...) are online for this project ----------
// Each MCP server process keeps <root>/.page-annotator/agents/<agent>-<pid>.json fresh while it runs.
const AGENT_RE = /^[a-z0-9_-]{1,32}$/;
const AGENT_STALE_MS = 45_000;
const agentsDir = (root) => path.join(dir(root), 'agents');
const validAgent = (name) => (typeof name === 'string' && AGENT_RE.test(name) ? name : undefined);

/** MCP clientInfo.name -> short agent id: 'claude-code' -> 'claude', 'codex-mcp-client' -> 'codex'. */
export function agentId(clientName) {
  const s = String(clientName || '').toLowerCase();
  if (s.includes('claude')) return 'claude';
  if (s.includes('codex')) return 'codex';
  if (s.includes('cursor')) return 'cursor';
  return s.replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'agent';
}

/** True when an annotation is meant for this agent (no target = anyone). */
export const isForAgent = (item, agent) => !item.target || item.target === agent;

export function registerAgent(root, { agent, pid = process.pid, client, lastActive }) {
  const file = path.join(agentsDir(root), `${agent}-${pid}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const body = { agent, pid, client: client || agent, lastSeen: Date.now(), lastActive: lastActive || Date.now() };
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(body));
  fs.renameSync(`${file}.tmp`, file);
  return file;
}

export function unregisterAgent(root, agent, pid = process.pid) {
  fs.rmSync(path.join(agentsDir(root), `${agent}-${pid}.json`), { force: true });
}

const pidAlive = (pid) => {
  try { process.kill(pid, 0); return true; } catch (err) { return err.code === 'EPERM'; }
};

/** Online agents, one entry per agent id, most recently used first. Stale entries are removed. */
export function listAgents(root, now = Date.now()) {
  let names = [];
  try { names = fs.readdirSync(agentsDir(root)).filter((f) => f.endsWith('.json')); } catch { return []; }
  const best = new Map();
  for (const name of names) {
    const file = path.join(agentsDir(root), name);
    let a;
    try { a = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { continue; }
    if (!validAgent(a.agent) || now - a.lastSeen > AGENT_STALE_MS || !pidAlive(a.pid)) {
      fs.rmSync(file, { force: true });
      continue;
    }
    const prev = best.get(a.agent);
    if (!prev || a.lastActive > prev.lastActive) best.set(a.agent, a);
  }
  return [...best.values()]
    .sort((x, y) => y.lastActive - x.lastActive)
    .map(({ agent, client, lastActive }) => ({ agent, client, lastActive }));
}

export function clearQueue(root) {
  const q = readQueue(root);
  q.items.forEach(removeScreenshot);
  writeQueue(root, { nextId: q.nextId, items: [] });
  return q.items.length;
}

/** Compact JSON handed to agents: loc is enough to find the code, the rest only disambiguates. */
function compact(it) {
  const out = { id: it.id, note: it.note };
  if (it.loc) out.loc = it.loc;
  else if (it.selector) out.selector = it.selector;
  if (it.text) out.text = it.text.length > 40 ? `${it.text.slice(0, 40)}…` : it.text;
  if (it.screenshot) out.screenshot = it.screenshot;
  return out;
}

export function toJson(items) {
  const pages = new Map();
  for (const it of items) {
    const url = it.page?.url ?? '';
    if (!pages.has(url)) pages.set(url, []);
    pages.get(url).push(compact(it));
  }
  if (pages.size === 1) {
    const [[page, annotations]] = pages;
    return { page, annotations };
  }
  return { pages: [...pages].map(([page, annotations]) => ({ page, annotations })) };
}

/** Default fix prompts; {{count}} {{ids}} {{page}} {{json}} are filled in. */
export const DEFAULT_PROMPTS = {
  en: [
    'Please make the code changes for the {{count}} page annotations below. Each one is an element I picked in the page preview plus what I want changed:',
    '- `loc` is where the element is in the source (file:line:column); open that spot and edit it',
    '- `text` is the text on the element; use it to tell which one is meant when one line of code renders several elements',
    '- `screenshot` (when present) is a picture of the element at the time; look at it before editing',
    '',
    '{{json}}',
    '',
    'When done, summarize each change by #id and call mark_annotations_done (ids: [{{ids}}]).',
  ].join('\n'),
  zh: [
    '请按下面 {{count}} 条页面标注修改代码。每条是我在预览页面上点选的元素和修改需求：',
    '- `loc` 是元素在源码里的位置（文件:行:列），直接打开这个位置修改',
    '- `text` 是元素上的文字，同一行代码渲染出多个元素时，用它确认是哪一个',
    '- `screenshot`（如果有）是该元素当时的截图文件，先打开看一下再改',
    '',
    '{{json}}',
    '',
    '改完后按 #id 逐条简要说明改了什么，并调用 mark_annotations_done（ids: [{{ids}}]）。',
  ].join('\n'),
};

/** Ready-to-paste instruction for an agent, with the annotations as JSON. */
export function toPrompt(items, { lang = 'en', template } = {}) {
  const tpl = (typeof template === 'string' && template.trim()) || DEFAULT_PROMPTS[lang] || DEFAULT_PROMPTS.en;
  const json = '```json\n' + JSON.stringify(toJson(items), null, 2) + '\n```';
  const vars = {
    count: String(items.length),
    ids: items.map((it) => it.id).join(', '),
    page: items[0]?.page?.url ?? '',
    json,
  };
  const out = tpl.replace(/\{\{\s*(count|ids|page|json)\s*\}\}/g, (_, k) => vars[k]);
  // a custom prompt that forgot the annotations still gets them
  return /\{\{\s*json\s*\}\}/.test(tpl) ? out : `${out}\n\n${json}`;
}
