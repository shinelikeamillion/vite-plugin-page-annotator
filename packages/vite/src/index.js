// vite-plugin-page-annotator (dev only): tags JSX elements with their source location (data-loc),
// injects the annotator UI, and receives submissions into the shared queue.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { parseAst, version as viteVersion } from 'vite';
import {
  DEFAULT_PROMPTS, addSubmission, deleteItems, historyItems, listAgents, readQueue, resendItems, toPrompt, writeOutbox,
} from './store.js';

const CLIENT_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'client.js');
const BASE = '/__annotator';
// parseAst only understands JSX/TSX from Vite 8 (Oxc); older Vites fall back to CSS selectors
const VITE_MAJOR = Number.parseInt(viteVersion, 10);
const HAS_JSX_PARSER = VITE_MAJOR >= 8;
const SCREENSHOT_LIB = createRequire(import.meta.url).resolve('modern-screenshot/dist/index.js');

function collectInsertions(ast, out) {
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node.type === 'JSXOpeningElement'
      && node.name?.type === 'JSXIdentifier'
      && /^[a-z]/.test(node.name.name)
      && !node.attributes.some((a) => a.type === 'JSXAttribute' && a.name?.name === 'data-loc')) {
      out.push({ at: node.name.end, start: node.start });
    }
    for (const key in node) {
      if (key !== 'type' && key !== 'start' && key !== 'end') walk(node[key]);
    }
  };
  walk(ast);
}

function addSourceLocations(code, file, rel) {
  let ast;
  try {
    ast = parseAst(code, { lang: file.endsWith('.tsx') ? 'tsx' : 'jsx' }, file);
  } catch {
    return null; // let the real transform report syntax errors
  }
  const inserts = [];
  collectInsertions(ast, inserts);
  if (!inserts.length) return null;

  const lineStarts = [0];
  for (let i = 0; i < code.length; i++) if (code.charCodeAt(i) === 10) lineStarts.push(i + 1);
  const lineCol = (offset) => {
    let lo = 0, hi = lineStarts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lineStarts[mid] <= offset) lo = mid; else hi = mid - 1; }
    return `${lo + 1}:${offset - lineStarts[lo] + 1}`;
  };

  inserts.sort((a, b) => b.at - a.at);
  let result = code;
  for (const { at, start } of inserts) {
    result = `${result.slice(0, at)} data-loc="${rel}:${lineCol(start)}"${result.slice(at)}`;
  }
  return result;
}

function readBody(req, limit = 30_000_000) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > limit) { reject(new Error('payload too large')); req.destroy(); }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

/**
 * @param {import('../index').PageAnnotatorOptions} [options]
 * @returns {import('vite').Plugin[]}
 */
export function pageAnnotator(options = {}) {
  let root = process.cwd();

  /** @type {import('vite').Plugin} */
  const locator = {
    name: 'page-annotator:locator',
    apply: 'serve',
    enforce: 'pre',
    configResolved(config) {
      root = config.root;
      if (!HAS_JSX_PARSER && options.locator !== false) {
        config.logger.warn(options.lang === 'zh'
          ? `[page-annotator] 当前是 Vite ${viteVersion}，源码定位（文件:行:列）需要 Vite 8 及以上，标注会改用 CSS 选择器。升级到 Vite 8 即可拿到精确位置；不需要的话设 locator: false 关掉这条提示。`
          : `[page-annotator] Vite ${viteVersion} detected. Source locations (file:line:column) need Vite 8+, so annotations fall back to CSS selectors. Upgrade to Vite 8 for exact locations, or set locator: false to silence this warning.`);
      }
    },
    transform(code, id) {
      const file = id.split('?')[0];
      if (!/\.[jt]sx$/.test(file) || file.includes('/node_modules/')) return null;
      if (options.locator === false || !HAS_JSX_PARSER) return null;
      const out = addSourceLocations(code, file, path.relative(root, file));
      return out == null ? null : { code: out, map: null };
    },
  };

  /** @type {import('vite').Plugin} */
  const ui = {
    name: 'page-annotator:ui',
    apply: 'serve',
    config() {
      // the queue/outbox/screenshots folder changes on every send; nothing imports it
      return { server: { watch: { ignored: ['**/.page-annotator/**'] } } };
    },
    transformIndexHtml() {
      return [
        { tag: 'script', children: `window.__PAGE_ANNOTATOR__=${JSON.stringify({ lang: options.lang === 'zh' ? 'zh' : 'en', endpoint: `${BASE}/submit`, screenshotLib: `${BASE}/vendor/modern-screenshot.js`, defaultPrompts: DEFAULT_PROMPTS })}`, injectTo: 'body' },
        { tag: 'script', attrs: { src: `${BASE}/client.js`, defer: true }, injectTo: 'body' },
      ];
    },
    configureServer(server) {
      // printed under Vite's own URLs, since the toolbar is easy to miss once hidden
      const printUrls = server.printUrls.bind(server);
      server.printUrls = () => {
        printUrls();
        const keys = process.platform === 'darwin' ? '⌘⇧2' : 'Ctrl+Shift+2';
        const hold = process.platform === 'darwin' ? '⌘' : 'Ctrl';
        server.config.logger.info(options.lang === 'zh'
          ? `  \x1b[32m➜\x1b[0m  \x1b[1m标注工具\x1b[0m: 在页面里按 ${keys} 显示/隐藏，按住 ${hold} 点元素标注`
          : `  \x1b[32m➜\x1b[0m  \x1b[1mAnnotator\x1b[0m: press ${keys} in the page to show/hide, hold ${hold} and click an element to annotate`);
      };
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith(BASE)) return next();
        const send = (status, type, body) => {
          res.statusCode = status;
          res.setHeader('Content-Type', type);
          res.setHeader('Cache-Control', 'no-store');
          res.end(body);
        };
        try {
          if (req.method === 'GET' && req.url.startsWith(`${BASE}/client.js`)) {
            return send(200, 'text/javascript; charset=utf-8', fs.readFileSync(CLIENT_FILE, 'utf8'));
          }
          if (req.method === 'GET' && req.url === `${BASE}/vendor/modern-screenshot.js`) {
            return send(200, 'text/javascript; charset=utf-8', fs.readFileSync(SCREENSHOT_LIB, 'utf8'));
          }
          if (req.method === 'GET' && req.url === `${BASE}/history`) {
            return send(200, 'application/json', JSON.stringify({ items: historyItems(root) }));
          }
          if (req.method === 'GET' && req.url === `${BASE}/agents`) {
            return send(200, 'application/json', JSON.stringify({ agents: listAgents(root) }));
          }
          const shot = req.method === 'GET' && req.url.match(/^\/__annotator\/shot\/(\d+)$/);
          if (shot) {
            const it = readQueue(root).items.find((x) => x.id === Number(shot[1]));
            if (!it?.screenshot || !fs.existsSync(it.screenshot)) return send(404, 'text/plain', 'no screenshot');
            res.statusCode = 200;
            res.setHeader('Content-Type', it.screenshot.endsWith('.jpg') ? 'image/jpeg' : 'image/png');
            res.setHeader('Cache-Control', 'no-store');
            return res.end(fs.readFileSync(it.screenshot));
          }
          if (req.method === 'POST' && (req.url === `${BASE}/resend` || req.url === `${BASE}/delete`)) {
            const parsed = req.body;
            const payload = parsed && typeof parsed === 'object' ? parsed : JSON.parse(await readBody(req, 1_000_000));
            if (req.url === `${BASE}/delete`) {
              return send(200, 'application/json', JSON.stringify({ ok: true, ids: deleteItems(root, payload.ids) }));
            }
            const items = resendItems(root, payload.ids, payload.target);
            if (!items.length) return send(400, 'application/json', JSON.stringify({ ok: false, error: 'no such annotations' }));
            const prompt = toPrompt(items, { lang: payload.lang, template: payload.promptTemplate });
            writeOutbox(root, items, prompt);
            server.config.logger.info(`[annotator] resent ${items.map((it) => `#${it.id}`).join(' ')}${items[0].target ? ` for ${items[0].target}` : ''}`, { timestamp: true });
            return send(200, 'application/json', JSON.stringify({ ok: true, ids: items.map((it) => it.id), prompt }));
          }
          if (req.method === 'POST' && req.url === `${BASE}/submit`) {
            // an outer Express app may already have parsed the body (express.json())
            const parsed = req.body;
            const payload = parsed && typeof parsed === 'object' ? parsed : JSON.parse(await readBody(req));
            const added = addSubmission(root, payload);
            if (!added.length) return send(400, 'application/json', JSON.stringify({ ok: false, error: 'no valid annotations' }));
            const { lang, promptTemplate } = payload;
            const prompt = toPrompt(added, { lang, template: promptTemplate });
            writeOutbox(root, added, prompt);
            const shots = added.filter((it) => it.screenshot).length;
            const to = added[0].target ? ` for ${added[0].target}` : '';
            server.config.logger.info(`[annotator] received ${added.length} annotation${added.length === 1 ? '' : 's'}${to} (#${added[0].id}–#${added[added.length - 1].id})${shots ? `, ${shots} with screenshots` : ''}`, { timestamp: true });
            return send(200, 'application/json', JSON.stringify({ ok: true, ids: added.map((it) => it.id), prompt }));
          }
          return next();
        } catch (err) {
          return send(500, 'application/json', JSON.stringify({ ok: false, error: err.message }));
        }
      });
    },
  };

  return [locator, ui];
}

export default pageAnnotator;
