# vite-plugin-page-annotator

**English** · [简体中文](README.zh-CN.md) · [Website & Live Guide](https://shinelikeamillion.github.io/vite-plugin-page-annotator/) · [LLM Setup Guide (`llms.txt`)](https://shinelikeamillion.github.io/vite-plugin-page-annotator/llms.txt)

**Point at your live Vite page. Tell Claude Code or Codex what to fix.**

Stop describing UI bugs with *"the secondary button inside the third card on the pricing row."* With `vite-plugin-page-annotator`, you click any element right in your browser during `vite dev`, write what should change, and hand the batch straight to **Claude Code** or **OpenAI Codex**.

Every annotation automatically captures:
- **Exact JSX source location** (`file:line:column` via Vite's AST parser) or a CSS selector fallback
- **Element text & context** to disambiguate list items rendered from the same line
- **Optional element screenshot** saved locally and delivered alongside your note
- **A ready-to-execute fix prompt** that flows into Claude Code or Codex via **MCP**, **auto-filled terminal prompt**, or **clipboard**

> **Zero production footprint:** Runs exclusively during `vite dev` inside an isolated Shadow DOM. `vite build` outputs zero bytes from this plugin.

![Annotating a button: the popover shows the element's source location and the note](https://shinelikeamillion.github.io/vite-plugin-page-annotator/screenshots/annotate.png)

---

## Quickest Start: Copy & Paste to Your AI Agent

Don't want to touch config files manually? Copy the prompt below and paste it into **Claude Code**, **Codex**, or any coding agent in your project root. Your AI will install and wire up everything automatically:

```text
Please integrate `vite-plugin-page-annotator` into this Vite project so I can annotate UI elements in the browser and send them to you:

1. Install the dev dependency using this project's package manager:
   `npm i -D vite-plugin-page-annotator` (or pnpm/yarn/bun equivalent).
2. In `vite.config.ts` / `vite.config.js`, import `{ pageAnnotator } from 'vite-plugin-page-annotator'` and place `pageAnnotator()` as the FIRST item in the `plugins` array (before `@vitejs/plugin-react` or other framework plugins so JSX source locations are tagged before compilation).
3. Add `.page-annotator/` to `.gitignore` if it isn't already ignored.
4. Set up the MCP server so you can read and resolve my page annotations directly:
   - Create or update `.mcp.json` in the project root to add:
     {
       "mcpServers": {
         "page-annotator": {
           "command": "npx",
           "args": ["page-annotator-mcp"]
         }
       }
     }
   - If I use OpenAI Codex (`~/.codex/config.toml` or `.codex/config.toml`), show me the `[mcp_servers.page-annotator]` snippet with `--root` pointing to this project's absolute path.
5. Verify the config compiles cleanly (`npx vite --version` or build check) and remind me to run the dev server: the annotator toolbar shows up in the browser on first visit (`Cmd+Shift+2` / `Ctrl+Shift+2` hides or shows it).
```

---

## Seamless Connection with Claude Code & Codex

`vite-plugin-page-annotator` is designed specifically for the tight visual feedback loop between your browser preview and terminal coding agents. Pick the hand-off workflow that fits how you work—all three share the same `.page-annotator/` queue:

| Workflow | Best For | How It Works |
| --- | --- | --- |
| **1. Claude Code Inbox Plugin** | Zero-click terminal flow in Claude Code | Clicking **Send** in the browser automatically injects the fix prompt into your active Claude Code input box. Just press `Enter`. |
| **2. MCP Server (`page-annotator-mcp`)** | Native tool-calling in **Claude Code** & **Codex** | Your agent calls `get_page_annotations` to read pending notes + element screenshots, edits the exact `file:line:column`, and calls `mark_annotations_done`. |
| **3. One-Click Clipboard** | Any AI chat, IDE agent, or terminal | Clicking **Send** copies the structured prompt + JSON (`⌘V`) and screenshot (`Ctrl+V` in terminal) directly to your clipboard. |

### Method 1: Auto-Fill Claude Code Prompt Box (`page-annotator-inbox`)

The `page-annotator-inbox` Claude Code plugin watches `.page-annotator/outbox.json`. Every time you click **Send** in the browser, it drops the ready-to-run fix prompt right into your Claude Code prompt box (appending safely after any draft you're typing).

```bash
claude plugin install page-annotator-inbox --marketplace shinelikeamillion/vite-plugin-page-annotator
```

Or inside an active Claude Code session:
```text
/plugin install page-annotator-inbox --marketplace shinelikeamillion/vite-plugin-page-annotator
```

Want to try it for a single session without installing?
```bash
claude --plugin-dir node_modules/vite-plugin-page-annotator/claude-plugin
```

### Method 2: MCP Server for Claude Code & OpenAI Codex

The package ships a zero-dependency stdio MCP server (`page-annotator-mcp`) with built-in agent instructions and three tools:

| MCP Tool | What It Does |
| --- | --- |
| `get_page_annotations` | Reads pending annotations (JSON + base64 element screenshots) and transitions their status from `pending` → `delivered`. |
| `mark_annotations_done` | Marks resolved annotation IDs as `done` so your queue stays clean and history updates in the browser. |
| `clear_page_annotations` | Clears the entire annotation queue (only called when you explicitly ask). |

**For Claude Code** — add `.mcp.json` at your project root:

```json
{
  "mcpServers": {
    "page-annotator": {
      "command": "npx",
      "args": ["page-annotator-mcp"]
    }
  }
}
```

**For OpenAI Codex** — add to `~/.codex/config.toml` (or `.codex/config.toml`):

```toml
[mcp_servers.page-annotator]
command = "npx"
args = ["page-annotator-mcp", "--root", "/absolute/path/to/your/project"]
```

*(Note: `page-annotator-mcp` resolves the project root from `--root`, then `$PAGE_ANNOTATOR_ROOT`, then the current working directory.)*

Once configured, simply tell Claude Code or Codex:
> **"Handle the page annotations"** (or **"按标注改"**)

### Choosing Who Gets the Annotations (Claude Code vs Codex)

Each running `page-annotator-mcp` registers its client in `.page-annotator/agents/` (detected from the MCP `clientInfo`, e.g. `claude-code` → `claude`, `codex-mcp-client` → `codex`; override with `--agent <id>` or `PAGE_ANNOTATOR_AGENT`). Each send goes to the agent used most recently (the newest session, or the last one to call an annotation tool), so the batch follows whichever tool you are working in without picking anything. To always send to one tool, pick it under **Send to** in Settings (right-click `⠿`); the default is **Auto**. Each send is tagged with that target:

- `get_page_annotations` only returns annotations sent to the calling agent, or ones sent with no target (no agent online at the time).
- The `page-annotator-inbox` plugin only fills the Claude Code prompt box for sends targeted at `claude` (or untargeted).

### Method 3: Smart Clipboard

Every time you click **Send** on the in-page toolbar, the formatted fix prompt (including `file:line:column` JSON) and element screenshots are copied to your system clipboard. Paste anywhere—in terminal agents, `⌘V` pastes text and `Ctrl+V` pastes the image.

---

## Manual Installation & Setup

### Requirements

- **Vite 8+** for exact source locations (uses Vite's native `parseAst` to inject `data-loc` on JSX/TSX elements with zero extra parser dependencies). Vite 7 also works, with a startup warning, but annotations fall back to CSS selectors.
- **Node.js 20.19+**
- **Frameworks:** Any JSX/TSX framework (**React, Preact, Solid, Qwik**, etc.) gets exact `file:line:column` source locations. Non-JSX pages (Vue, Svelte, plain HTML) work seamlessly using automatic CSS selectors.

### 1. Install the package

```bash
npm i -D vite-plugin-page-annotator
```

### 2. Add to `vite.config.ts`

Place `pageAnnotator()` **before** your framework plugin so it can tag JSX elements before transformation:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { pageAnnotator } from 'vite-plugin-page-annotator';

export default defineConfig({
  plugins: [
    pageAnnotator({
      lang: 'en', // 'en' | 'zh' (can also be switched anytime in the in-page UI)
      locator: true, // set false to disable JSX data-loc and use CSS selectors only
    }),
    react(),
  ],
});
```

### 3. Ignore the local queue directory

Add `.page-annotator/` to your `.gitignore`:

```gitignore
.page-annotator/
```

### Plugin Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `lang` | `'en' \| 'zh'` | `'en'` | Default language for the in-page toolbar and generated fix prompt. Each developer can also switch it live in the Settings panel. |
| `locator` | `boolean` | `true` | Injects `data-loc="file:line:column"` onto JSX/TSX host elements during `vite dev`. Set to `false` to use CSS selectors only. |

---

## How to Annotate Your Page

1. Start your dev server (`npm run dev`) and open your app in the browser.
2. The floating toolbar appears in the bottom-right corner on your first visit, and the terminal prints a reminder under Vite's URLs. Press **⌘⇧2** (`Ctrl+Shift+2` on Windows/Linux) to hide or show it; the choice is remembered across reloads.
3. **Hold ⌘** (`Ctrl` on Windows/Linux): while it is down, hovering highlights elements with their exact `file:line:column` badge and a **click** picks one. Let go and the page works normally again. To stay in annotation mode without holding the key, click **◎ Annotate** or press **Alt+A**.
4. The note box stays open after you release ⌘, so just type.
5. Type what you want changed and press **Enter** to save (**Shift+Enter** for a newline). Check **Attach element screenshot** if visual context helps.
6. Picked a wrapper or child by mistake? Press **↑ / ↓** to walk up to the parent or down to a child element (use **⌥↑ / ⌥↓** when the text box has content).
7. Queue up as many UI tweaks across your page as you want. Click **N items** on the toolbar to review, edit, or delete drafts before sending.

   ![The drafts list with three annotations, one with a screenshot](https://shinelikeamillion.github.io/vite-plugin-page-annotator/screenshots/drafts.png)

8. Click **Send** or press **⌘+Enter** (`Ctrl+Enter`), also from inside the note box. Your batch is written to `.page-annotator/`, pushed to the Claude Code inbox / MCP queue, and copied to your clipboard.

### Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| **⌘⇧2** / **Ctrl+Shift+2** | Show / hide the annotator toolbar (state persisted in `localStorage`) |
| Hold **⌘** / **Ctrl** | Annotate while held: hover to highlight, click to pick |
| **Alt+A** / **◎ Annotate** | Lock annotation mode on / off |
| **⌘+Enter** / **Ctrl+Enter** | Send all queued annotations (in the note box: save, then send) |
| **Right-click**, **Esc** | Exit annotation mode / close popover |
| **↑ / ↓** (**⌥↑ / ⌥↓** when typing) | Select parent / child DOM element |
| **Enter** / **Shift+Enter** | Save annotation / insert new line |
| **Drag ⠿** | Move toolbar anywhere on screen; double-click `⠿` to reset position |
| **Right-click ⠿** | Open Settings & History panel (language, custom prompt, screenshot default, status log) |

### Settings, Custom Prompts & History

Right-click the `⠿` grip on the toolbar to customize your workflow or inspect past annotations:

| Settings Panel | History & Status Tracking |
| --- | --- |
| ![Settings panel: language, fix prompt, screenshot default](https://shinelikeamillion.github.io/vite-plugin-page-annotator/screenshots/settings.png) | ![History tab with open and done annotations](https://shinelikeamillion.github.io/vite-plugin-page-annotator/screenshots/history.png) |

In the **Settings** tab, you can customize the generated fix prompt template using placeholders:
- `{{count}}` — Total number of annotations in the batch
- `{{ids}}` — Comma-separated annotation IDs (e.g., `1, 2, 3`)
- `{{page}}` — Page URL where annotations were captured
- `{{json}}` — Compact JSON payload of annotations (automatically appended if omitted)

---

## Architecture & Data Storage

All runtime state is stored locally in `.page-annotator/` at your project root (automatically ignored by Vite's file watcher so sending annotations never triggers an unwanted page reload):

- `.page-annotator/annotations.json` — The shared annotation queue. Each item progresses through `pending` (sent from browser) → `delivered` (read by MCP agent) → `done` (marked complete by agent). The most recent 200 completed annotations are retained for the in-page *History* view.
- `.page-annotator/shots/<id>.png` — Cropped element screenshots captured via `modern-screenshot`.
- `.page-annotator/outbox.json` — Latest submission payload (with its `target`) watched by the `page-annotator-inbox` Claude Code plugin.
- `.page-annotator/agents/` — One heartbeat file per running MCP server, listed by `GET /__annotator/agents` for the toolbar picker.

### Source Layout

- [`src/index.js`](src/index.js) — Vite dev plugin (`enforce: 'pre'`). Parses JSX/TSX with Vite's `parseAst` to inject `data-loc`, mounts the client script, and serves `/__annotator/*` endpoints.
- [`src/client.js`](src/client.js) — Self-contained in-page UI rendered inside a closed-style Shadow DOM so your app's CSS is never affected.
- [`src/store.js`](src/store.js) — Atomic queue persistence and prompt builder (also exported via `vite-plugin-page-annotator/store`).
- [`src/mcp-server.js`](src/mcp-server.js) — Dependency-free stdio JSON-RPC MCP server (`page-annotator-mcp`).
- [`claude-plugin/`](claude-plugin/) — Claude Code plugin (`page-annotator-inbox`) for automatic prompt injection.

## Local Development

```bash
npm install
npm run check     # syntax check across all source modules
npm test          # unit tests for queue & store logic
npm run test:mod  # tests for the Claude Code inbox plugin
```

Try the interactive demo project in [`example/`](example/):
```bash
cd example && npm install && npm run dev
```

## License

[MIT](LICENSE)
