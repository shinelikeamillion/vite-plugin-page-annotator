import type { Register } from 'claude-code'

// Written by vite-plugin-page-annotator each time Send is clicked in the page.
// Older versions of the plugin wrote it under node_modules/.
const OUTBOXES = ['.page-annotator/outbox.json', 'node_modules/.page-annotator/outbox.json']
const POLL_MS = 1000
const MAX_UP = 4
// The page lists agents from .page-annotator/agents/*.json and drops ones older than 45s.
// Saying "claude is here" lets the page route to Claude even when Claude Code has not
// loaded the project's MCP server (e.g. .mcp.json not approved yet).
const HEARTBEAT_MS = 15_000

// target: the agent picked in the page toolbar ('claude', 'codex', ...); null/absent = anyone
// sentAt: set on every write, so a resend of old ids (or a reset queue) still counts as new
type Outbox = { seq: number; ids: number[]; prompt: string; target?: string | null; sentAt?: string }

// What makes one send different from the last; older plugin versions wrote no sentAt
const keyOf = (box: Outbox) => box.sentAt ?? `seq:${box.seq}`

const parentOf = (dir: string) => dir.replace(/[\\/][^\\/]*$/, '') || dir

// The project root and the shell's directory, plus a few parents of each: the
// session may have been opened in a subfolder of the app (e.g. a monorepo package).
function projectDirs(root: string, cwd: string) {
  const dirs = new Set<string>()
  for (let d of [root, cwd]) {
    for (let i = 0; i <= MAX_UP && d; i++) {
      dirs.add(d)
      const up = parentOf(d)
      if (up === d) break
      d = up
    }
  }
  return [...dirs]
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // file -> { mtime, key } as last seen; what was there at load is not replayed
    const seen = new Map<string, { mtime: number; key: string }>()
    const look = async (file: string) => {
      const stat = await $.fs.stat(file).catch(() => undefined)
      if (!stat || stat.kind !== 'file') return undefined
      return stat.mtimeMs
    }
    const readBox = async (file: string) => JSON.parse(await $.fs.read(file)) as Outbox

    const dirs = async () => {
      const root = await $.session.root().catch(() => e.cwd)
      const cwd = await $.session.cwd().catch(() => e.cwd)
      return projectDirs(root, cwd)
    }
    const files = async () => (await dirs()).flatMap(d => OUTBOXES.map(f => `${d}/${f}`))

    // one file per session; no pid, so the page ages it out by lastSeen once the session is gone
    const agentFile = `agents/claude-inbox-${Math.random().toString(36).slice(2, 10)}.json`
    let lastActive = await $.clock.now()
    let lastBeat = -Infinity
    const heartbeat = async () => {
      const now = await $.clock.now()
      if (now - lastBeat < HEARTBEAT_MS) return
      lastBeat = now
      const body = JSON.stringify({ agent: 'claude', client: 'claude-code', lastSeen: now, lastActive })
      for (const d of await dirs()) {
        const box = await $.fs.stat(`${d}/.page-annotator`).catch(() => undefined)
        if (box?.kind === 'dir') await $.fs.write(`${d}/.page-annotator/${agentFile}`, body).catch(() => {})
      }
    }

    for (const file of await files()) {
      const mtime = await look(file)
      if (mtime === undefined) continue
      const key = await readBox(file).then(keyOf, () => '')
      seen.set(file, { mtime, key })
    }

    let busy = false
    $.clock.every(POLL_MS, async () => {
      if (busy) return
      busy = true
      try {
        await heartbeat()
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
          const key = keyOf(box)
          seen.set(file, { mtime, key })
          if (!box.prompt || (last && key === last.key)) continue // touched, not a new send
          if (box.target && box.target !== 'claude') continue // sent to another tool (e.g. Codex)

          const draft = await $.prompt.read()
          const filled = await $.prompt.fill(
            draft.text.trim()
              ? { text: `\n\n${box.prompt}`, mode: 'append' }
              : { text: box.prompt, mode: 'replace' },
          )
          if (filled.isFilled) {
            lastActive = await $.clock.now()
            lastBeat = -Infinity // tell the page now, so its "auto" picks Claude next time
          }
          $.ui.toast(
            filled.isFilled
              ? `Added ${box.ids.length} page annotation${box.ids.length === 1 ? '' : 's'} to the prompt, press Enter to send`
              : `Got ${box.ids.length} page annotation${box.ids.length === 1 ? '' : 's'}, but the prompt box is busy; ask Claude to "handle the page annotations"`,
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
