import type { Register } from 'claude-code'

// Written by vite-plugin-page-annotator each time the page's 发送 is clicked.
// Older versions of the plugin wrote it under node_modules/.
const OUTBOXES = ['.page-annotator/outbox.json', 'node_modules/.page-annotator/outbox.json']
const POLL_MS = 1000
const MAX_UP = 4

type Outbox = { seq: number; ids: number[]; prompt: string }

const parentOf = (dir: string) => dir.replace(/[\\/][^\\/]*$/, '') || dir

// The project root and the shell's directory, plus a few parents of each: the
// session may have been opened in a subfolder of the app (e.g. a monorepo package).
async function candidates(root: string, cwd: string) {
  const dirs = new Set<string>()
  for (let d of [root, cwd]) {
    for (let i = 0; i <= MAX_UP && d; i++) {
      dirs.add(d)
      const up = parentOf(d)
      if (up === d) break
      d = up
    }
  }
  return [...dirs].flatMap(d => OUTBOXES.map(f => `${d}/${f}`))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // file -> { mtime, seq } as last seen; what was there at load is not replayed
    const seen = new Map<string, { mtime: number; seq: number }>()
    const look = async (file: string) => {
      const stat = await $.fs.stat(file).catch(() => undefined)
      if (!stat || stat.kind !== 'file') return undefined
      return stat.mtimeMs
    }
    const readBox = async (file: string) => JSON.parse(await $.fs.read(file)) as Outbox

    const files = async () => {
      const root = await $.session.root().catch(() => e.cwd)
      const cwd = await $.session.cwd().catch(() => e.cwd)
      return candidates(root, cwd)
    }

    for (const file of await files()) {
      const mtime = await look(file)
      if (mtime === undefined) continue
      const seq = await readBox(file).then(b => b.seq, () => 0)
      seen.set(file, { mtime, seq })
    }

    let busy = false
    $.clock.every(POLL_MS, async () => {
      if (busy) return
      busy = true
      try {
        for (const file of await files()) {
          const mtime = await look(file)
          if (mtime === undefined) continue
          const last = seen.get(file)
          if (last && last.mtime === mtime) continue
          let box: Outbox
          try {
            box = await readBox(file)
          } catch {
            continue // mid-write: try again next tick
          }
          seen.set(file, { mtime, seq: Math.max(box.seq, last?.seq ?? 0) })
          if (!box.prompt || (last && box.seq <= last.seq)) continue

          const draft = await $.prompt.read()
          const filled = await $.prompt.fill(
            draft.text.trim()
              ? { text: `\n\n${box.prompt}`, mode: 'append' }
              : { text: box.prompt, mode: 'replace' },
          )
          $.ui.toast(
            filled.isFilled
              ? `已插入 ${box.ids.length} 条页面标注，回车发送`
              : `收到 ${box.ids.length} 条页面标注，但输入框暂时不可用；可以说"处理页面标注"`,
          )
        }
      } catch {
        // try again next tick
      } finally {
        busy = false
      }
    })

    return next(e)
  })
}
