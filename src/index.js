// vite-plugin-page-annotator (dev only): tags JSX elements with their source location (data-loc),
// injects the annotator UI, and receives submissions into the shared queue.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { parseAst } from 'vite';
import { DEFAULT_PROMPTS, addSubmission, readQueue, toPrompt, writeOutbox } from './store.js';

const CLIENT_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'client.js');
const BASE = '/__annotator';
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
    configResolved(config) { root = config.root; },
    transform(code, id) {
      const file = id.split('?')[0];
      if (!/\.[jt]sx$/.test(file) || file.includes('/node_modules/')) return null;
      if (options.locator === false) return null;
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
            const items = readQueue(root).items.slice(-300).reverse().map((it) => ({
              id: it.id, status: it.status, note: it.note, loc: it.loc, selector: it.selector, page: it.page, createdAt: it.createdAt,
              hasShot: typeof it.screenshot === 'string' && fs.existsSync(it.screenshot),
            }));
            return send(200, 'application/json', JSON.stringify({ items }));
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
            server.config.logger.info(`[annotator] received ${added.length} annotation${added.length === 1 ? '' : 's'} (#${added[0].id}–#${added[added.length - 1].id})${shots ? `, ${shots} with screenshots` : ''}`, { timestamp: true });
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
