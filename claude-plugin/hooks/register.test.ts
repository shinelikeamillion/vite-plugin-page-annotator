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
  on('fs.stat', ($, e) => (e.path === '/proj/.page-annotator/outbox.json' ? { value: { kind: 'file', size: outbox.text.length, mtimeMs: outbox.mtimeMs, isLink: false } } : (() => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }) })()) as never)
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

  outbox = { mtimeMs: 2, text: JSON.stringify({ seq: 6, ids: [5, 6], prompt: 'fix #5 #6' }) }
  await clock.advance(1000)
  expect(fills).toEqual([{ text: 'fix #5 #6', mode: 'replace' }])

  draft = 'my words'
  outbox = { mtimeMs: 3, text: JSON.stringify({ seq: 7, ids: [7], prompt: 'fix #7' }) }
  await clock.advance(1000)
  expect(fills[1]).toEqual({ text: '\n\nfix #7', mode: 'append' })
  expect(toasts.length).toBe(2)
})
