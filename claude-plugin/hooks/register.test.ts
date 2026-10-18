import { expect, mock, test } from 'claude-code/testing'

test('fills the prompt box when the page sends annotations', async ($, on) => {
  const clock = mock.clock(on)
  let outbox: { mtimeMs: number; text: string } = { mtimeMs: 1, text: JSON.stringify({ seq: 4, ids: [4], prompt: 'old' }) }
  const fills: { text: string; mode?: string }[] = []
  const toasts: string[] = []
  let draft = ''

  on('session.start', ($, e) => ({ cwd: e.cwd }) as never)
  on('session.root', () => ({ value: '/proj/tools/sub' }) as never)
  on('session.cwd', () => ({ value: '/proj/tools/sub' }) as never)
  on('fs.stat', ($, e) => {
    if (e.path === '/proj/.page-annotator/outbox.json') return { value: { kind: 'file', size: outbox.text.length, mtimeMs: outbox.mtimeMs, isLink: false } } as never
    if (e.path === '/proj/.page-annotator') return { value: { kind: 'dir', size: 0, mtimeMs: 0, isLink: false } } as never
    throw Object.assign(new Error('missing'), { code: 'ENOENT' })
  })
  const writes: { path: string; text: string }[] = []
  on('fs.write', ($, e) => {
    writes.push({ path: e.path, text: e.text })
    return { value: undefined } as never
  })
  on('fs.read', () => ({ value: outbox.text }) as never)
  on('prompt.read', () => ({ value: { text: draft, cursor: draft.length } }) as never)
  on('prompt.fill', ($, e) => {
    fills.push({ text: e.text, mode: e.mode })
    return { isFilled: true } as never
  })
  on('ui.toast', ($, e) => {
    toasts.push(JSON.stringify(e))
    return { value: undefined } as never
  })

  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  await clock.advance(1500)
  expect(fills).toEqual([]) // what was there before the session is not replayed
  // says Claude is online, in the folder that has .page-annotator only
  expect(writes.length).toBe(1)
  expect(writes[0].path).toMatch(/^\/proj\/\.page-annotator\/agents\/claude-inbox-\w+\.json$/)
  expect(JSON.parse(writes[0].text).agent).toBe('claude')

  outbox = { mtimeMs: 2, text: JSON.stringify({ seq: 6, ids: [5, 6], prompt: 'fix #5 #6' }) }
  await clock.advance(1000)
  expect(fills).toEqual([{ text: 'fix #5 #6', mode: 'replace' }])
  await clock.advance(1000)
  expect(writes.length).toBe(2) // a fill counts as activity and is reported at once

  draft = 'my words'
  outbox = { mtimeMs: 3, text: JSON.stringify({ seq: 7, ids: [7], prompt: 'fix #7' }) }
  await clock.advance(1000)
  expect(fills[1]).toEqual({ text: '\n\nfix #7', mode: 'append' })

  // sent to Codex from the toolbar: not ours
  outbox = { mtimeMs: 4, text: JSON.stringify({ seq: 8, ids: [8], target: 'codex', prompt: 'fix #8' }) }
  await clock.advance(1000)
  expect(fills.length).toBe(2)

  outbox = { mtimeMs: 5, text: JSON.stringify({ seq: 9, ids: [9], target: 'claude', prompt: 'fix #9' }) }
  await clock.advance(1000)
  expect(fills[2]).toEqual({ text: '\n\nfix #9', mode: 'append' })
  expect(toasts.length).toBe(3)

  // touched without a new send: not replayed
  outbox = { mtimeMs: 6, text: JSON.stringify({ seq: 9, ids: [9], target: 'claude', prompt: 'fix #9' }) }
  await clock.advance(1000)
  expect(fills.length).toBe(3)

  // history "send again" of old ids: new sentAt, lower seq
  outbox = { mtimeMs: 7, text: JSON.stringify({ seq: 5, ids: [5], prompt: 'fix #5', sentAt: '2026-10-19T10:00:00.000Z' }) }
  await clock.advance(1000)
  expect(fills[3]).toEqual({ text: '\n\nfix #5', mode: 'append' })

  // the queue was cleared and ids start over
  outbox = { mtimeMs: 8, text: JSON.stringify({ seq: 1, ids: [1], prompt: 'fix #1', sentAt: '2026-10-19T10:01:00.000Z' }) }
  await clock.advance(1000)
  expect(fills[4]).toEqual({ text: '\n\nfix #1', mode: 'append' })
})
