// packages/next/src/server.js
// Provides Next.js App Router (route.ts) and Pages Router api handlers for page-annotator.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import {
  DEFAULT_PROMPTS, addSubmission, deleteItems, historyItems, listAgents, readQueue, resendItems, toPrompt, writeOutbox,
} from './store.js';

const CLIENT_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'client.js');
const SCREENSHOT_LIB = createRequire(import.meta.url).resolve('modern-screenshot/dist/index.js');

/** History actions from the page: re-queue sent items for an agent, or delete them. */
function historyAction(root, subPath, payload, lang) {
  if (subPath === 'delete') return { status: 200, body: { ok: true, ids: deleteItems(root, payload.ids) } };
  const items = resendItems(root, payload.ids, payload.target);
  if (!items.length) return { status: 400, body: { ok: false, error: 'no such annotations' } };
  const prompt = toPrompt(items, { lang: payload.lang || lang, template: payload.promptTemplate });
  writeOutbox(root, items, prompt);
  return { status: 200, body: { ok: true, ids: items.map((it) => it.id), prompt } };
}

/**
 * Creates Next.js App Router handler (for `app/api/page-annotator/[...path]/route.ts`)
 * @param {object} [options]
 * @param {string} [options.lang='en']
 * @param {string} [options.basePath='/api/page-annotator']
 */
export function createAnnotatorHandler(options = {}) {
  const root = process.cwd();
  const lang = options.lang === 'zh' ? 'zh' : 'en';
  const basePath = options.basePath || '/api/page-annotator';

  async function handleGet(req, { params }) {
    const rawPath = await Promise.resolve(params?.path);
    const subPath = Array.isArray(rawPath) ? rawPath.join('/') : String(rawPath || '');

    if (subPath === 'client.js') {
      const code = fs.readFileSync(CLIENT_FILE, 'utf8');
      return new Response(code, {
        headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }

    if (subPath === 'vendor/modern-screenshot.js') {
      const code = fs.readFileSync(SCREENSHOT_LIB, 'utf8');
      return new Response(code, {
        headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }

    if (subPath === 'history') {
      return new Response(JSON.stringify({ items: historyItems(root) }), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }

    if (subPath === 'agents') {
      return new Response(JSON.stringify({ agents: listAgents(root) }), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }

    const shotMatch = subPath.match(/^shot\/(\d+)$/);
    if (shotMatch) {
      const it = readQueue(root).items.find((x) => x.id === Number(shotMatch[1]));
      if (!it?.screenshot || !fs.existsSync(it.screenshot)) {
        return new Response('no screenshot', { status: 404, headers: { 'Content-Type': 'text/plain' } });
      }
      const data = fs.readFileSync(it.screenshot);
      return new Response(data, {
        headers: {
          'Content-Type': it.screenshot.endsWith('.jpg') ? 'image/jpeg' : 'image/png',
          'Cache-Control': 'no-store',
        },
      });
    }

    return new Response('Not found', { status: 404 });
  }

  async function handlePost(req, { params }) {
    const rawPath = await Promise.resolve(params?.path);
    const subPath = Array.isArray(rawPath) ? rawPath.join('/') : String(rawPath || '');

    if (subPath === 'resend' || subPath === 'delete') {
      try {
        const { status, body } = historyAction(root, subPath, await req.json(), lang);
        return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
      } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }
    }

    if (subPath === 'submit') {
      try {
        const payload = await req.json();
        const added = addSubmission(root, payload);
        if (!added.length) {
          return new Response(JSON.stringify({ ok: false, error: 'no valid annotations' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        const promptLang = payload.lang || lang;
        const prompt = toPrompt(added, { lang: promptLang, template: payload.promptTemplate });
        writeOutbox(root, added, prompt);
        return new Response(JSON.stringify({ ok: true, ids: added.map((it) => it.id), prompt }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        });
      } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response('Not found', { status: 404 });
  }

  return {
    GET: handleGet,
    POST: handlePost,
  };
}

/**
 * Creates Next.js Pages Router API handler (for `pages/api/page-annotator/[...path].ts`)
 */
export function createPagesApiHandler(options = {}) {
  const root = process.cwd();
  const lang = options.lang === 'zh' ? 'zh' : 'en';

  return async function handler(req, res) {
    const pathParam = req.query.path;
    const subPath = Array.isArray(pathParam) ? pathParam.join('/') : String(pathParam || '');

    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'GET') {
      if (subPath === 'client.js') {
        res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
        return res.status(200).send(fs.readFileSync(CLIENT_FILE, 'utf8'));
      }
      if (subPath === 'vendor/modern-screenshot.js') {
        res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
        return res.status(200).send(fs.readFileSync(SCREENSHOT_LIB, 'utf8'));
      }
      if (subPath === 'history') {
        return res.status(200).json({ items: historyItems(root) });
      }
      if (subPath === 'agents') {
        return res.status(200).json({ agents: listAgents(root) });
      }
      const shotMatch = subPath.match(/^shot\/(\d+)$/);
      if (shotMatch) {
        const it = readQueue(root).items.find((x) => x.id === Number(shotMatch[1]));
        if (!it?.screenshot || !fs.existsSync(it.screenshot)) {
          return res.status(404).send('no screenshot');
        }
        res.setHeader('Content-Type', it.screenshot.endsWith('.jpg') ? 'image/jpeg' : 'image/png');
        return res.status(200).send(fs.readFileSync(it.screenshot));
      }
      return res.status(404).send('Not found');
    }

    if (req.method === 'POST' && (subPath === 'resend' || subPath === 'delete')) {
      try {
        const payload = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body);
        const { status, body } = historyAction(root, subPath, payload, lang);
        return res.status(status).json(body);
      } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
      }
    }

    if (req.method === 'POST' && subPath === 'submit') {
      try {
        const payload = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body);
        const added = addSubmission(root, payload);
        if (!added.length) return res.status(400).json({ ok: false, error: 'no valid annotations' });
        const promptLang = payload.lang || lang;
        const prompt = toPrompt(added, { lang: promptLang, template: payload.promptTemplate });
        writeOutbox(root, added, prompt);
        return res.status(200).json({ ok: true, ids: added.map((it) => it.id), prompt });
      } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
      }
    }

    return res.status(404).send('Not found');
  };
}
