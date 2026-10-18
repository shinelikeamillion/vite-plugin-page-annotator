import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { addSubmission, readQueue, clearQueue, toPrompt, toJson, writeOutbox, outboxFile } from '../src/store.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'page-annotator-'));
const PNG = 'data:image/png;base64,iVBORw0KGgo=';

test('addSubmission stores valid items with ids, page and screenshots', () => {
  const root = tmp();
  const added = addSubmission(root, {
    url: 'http://localhost:5173/',
    items: [
      { note: 'make it red', loc: 'src/App.tsx:10:5', screenshot: PNG },
      { note: '   ' },
      { note: 'bigger', selector: 'main > h1' },
    ],
  });
  assert.deepEqual(added.map((it) => it.id), [1, 2]);
  assert.equal(added[0].status, 'pending');
  assert.equal(added[0].page.url, 'http://localhost:5173/');
  assert.ok(fs.existsSync(added[0].screenshot));
  assert.equal(added[1].screenshot, undefined);
  assert.equal(readQueue(root).nextId, 3);
  assert.equal(clearQueue(root), 2);
  assert.ok(!fs.existsSync(added[0].screenshot));
});

test('toJson keeps loc over selector and trims long text', () => {
  const out = toJson([
    { id: 1, note: 'a', loc: 'a.tsx:1:1', selector: 'div', text: 'x'.repeat(50), page: { url: '/p' } },
    { id: 2, note: 'b', selector: 'span', page: { url: '/p' } },
  ]);
  assert.equal(out.page, '/p');
  assert.deepEqual(out.annotations[0], { id: 1, note: 'a', loc: 'a.tsx:1:1', text: `${'x'.repeat(40)}…` });
  assert.deepEqual(out.annotations[1], { id: 2, note: 'b', selector: 'span' });
});

test('toPrompt is English by default, fills placeholders and appends missing json', () => {
  const items = [{ id: 7, note: 'n', loc: 'a.tsx:1:1', page: { url: '/x' } }];
  const en = toPrompt(items);
  assert.match(en, /^Please make the code changes for the 1 page annotations/);
  assert.match(en, /ids: \[7\]/);
  assert.match(toPrompt(items, { lang: 'zh' }), /^请按下面 1 条/);
  const custom = toPrompt(items, { template: 'Fix {{ids}} on {{page}}' });
  assert.match(custom, /^Fix 7 on \/x\n\n```json/);
});

test('writeOutbox records the last id as seq', () => {
  const root = tmp();
  writeOutbox(root, [{ id: 3 }, { id: 4 }], 'hello');
  const box = JSON.parse(fs.readFileSync(outboxFile(root), 'utf8'));
  assert.equal(box.seq, 4);
  assert.deepEqual(box.ids, [3, 4]);
  assert.equal(box.prompt, 'hello');
});
