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
  const added = (payload.items || [])
    .filter((it) => it && typeof it.note === 'string' && it.note.trim())
    .map(({ screenshot, ...it }) => {
      const id = q.nextId++;
      return { ...it, id, status: 'pending', createdAt, page, screenshot: saveScreenshot(root, id, screenshot) };
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

/** Latest sent prompt, picked up by the Claude Code mod and put in its prompt box. */
export function outboxFile(root) {
  return path.join(dir(root), 'outbox.json');
}

export function writeOutbox(root, items, prompt) {
  const file = outboxFile(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const body = { seq: items[items.length - 1].id, ids: items.map((it) => it.id), prompt, sentAt: new Date().toISOString() };
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(body, null, 2));
  fs.renameSync(`${file}.tmp`, file);
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
