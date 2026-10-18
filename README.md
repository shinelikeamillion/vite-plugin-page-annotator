# vite-plugin-page-annotator

**English** · [简体中文](README.zh-CN.md) · [Website](https://shinelikeamillion.github.io/vite-plugin-page-annotator/)

Click elements on your Vite dev page, write what should change, and hand the list to Claude Code or Codex in one go. Each annotation carries its source location (`file:line:column`) and an optional element screenshot, and is sent with a ready-made fix prompt.

It only runs under `vite dev`. A `vite build` output contains nothing from it.

![Annotating a button: the popover shows the element's source location and the note](https://shinelikeamillion.github.io/vite-plugin-page-annotator/screenshots/annotate.png)

## Requirements

- Vite 8 or later (JSX/TSX is parsed with Vite's own `parseAst` to add `data-loc`)
- Node 20.19 or later
- Any JSX framework for source locations (React, Preact, Solid…). Other pages still work, with CSS selectors instead of locations.

## Install

```bash
npm i -D github:shinelikeamillion/vite-plugin-page-annotator
```

Add it to `vite.config.ts`, before your framework plugin:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { pageAnnotator } from 'vite-plugin-page-annotator';

export default defineConfig({
  plugins: [pageAnnotator(), react()],
});
```

Add the data folder to `.gitignore`:

```gitignore
.page-annotator/
```

### Options

| Option | Default | What it does |
| --- | --- | --- |
| `lang` | `'en'` | UI and fix-prompt language, `'en'` or `'zh'`. Each person can still switch it in the settings panel. |
| `locator` | `true` | Tag JSX elements with `data-loc`. Set `false` to send CSS selectors only. |

## Tutorial

1. Run `npm run dev` and open the page.
2. Press **⌘⇧2** (Ctrl+Shift+2 on Windows/Linux) to show the toolbar. It stays hidden until you do, and the choice is remembered.
3. **⌘+click** (Ctrl+click) anywhere, or press **Alt+A**, to start annotating. That first click doesn't pick anything.
4. Hover to see the element and its source location, then click it. Write what should change and press **Enter** to save (**Shift+Enter** for a new line). Tick *Attach element screenshot* if a picture helps.
5. Wrong element? Use **↑ / ↓** to move to the parent or child (with **⌥↑ / ⌥↓** once you've typed something).
6. Add as many as you like. Click **N items** on the toolbar to review, edit or delete them.

   ![The drafts list with three annotations, one with a screenshot](https://shinelikeamillion.github.io/vite-plugin-page-annotator/screenshots/drafts.png)

7. Click **Send**. The annotations go to the queue, and the fix prompt (with the JSON) plus the screenshots are copied to the clipboard.
8. Give it to your agent: paste, or let it read the queue over MCP (see below).

| Shortcut | Action |
| --- | --- |
| ⌘⇧2 / Ctrl+Shift+2 | Show / hide the whole tool (remembered) |
| ⌘+click / Ctrl+click, Alt+A | Start annotating |
| Right-click, Esc | Stop annotating |
| ↑ / ↓ (⌥↑ / ⌥↓) | Pick the parent / child element |
| Enter / Shift+Enter | Save / new line |
| Drag ⠿ | Move the toolbar; double-click to reset |
| Right-click ⠿ | Settings: language, fix prompt, screenshot default, history |

### Settings and history

Right-click the ⠿ grip to open the settings panel. The *History* tab lists everything you sent, with its status and screenshot.

| Settings | History |
| --- | --- |
| ![Settings panel: language, fix prompt, screenshot default](https://shinelikeamillion.github.io/vite-plugin-page-annotator/screenshots/settings.png) | ![History tab with open and done annotations](https://shinelikeamillion.github.io/vite-plugin-page-annotator/screenshots/history.png) |

### Custom fix prompt

In the settings panel you can replace the fix prompt. These placeholders are filled in: `{{count}}` number of annotations, `{{ids}}` their ids, `{{page}}` page URL, `{{json}}` the annotations as JSON. If you leave out `{{json}}`, the JSON is added at the end.

## Hand off to your AI agent

Pick any of the three.

### 1. Clipboard

After **Send**, paste into Claude Code, Codex or any chat. In a terminal, ⌘V pastes the text and Ctrl+V the screenshot.

### 2. MCP server

The package ships a dependency-free stdio MCP server, `page-annotator-mcp`, with three tools:

| Tool | What it does |
| --- | --- |
| `get_page_annotations` | Returns the sent annotations (JSON plus screenshots) and marks them *delivered* |
| `mark_annotations_done` | Marks the ids the agent handled as *done* |
| `clear_page_annotations` | Empties the queue (only when you ask) |

Claude Code, in `.mcp.json` at the project root:

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

Codex, in `~/.codex/config.toml`:

```toml
[mcp_servers.page-annotator]
command = "npx"
args = ["page-annotator-mcp", "--root", "/path/to/your/project"]
```

Then tell the agent "handle the page annotations".

The project root is taken from `--root`, then `$PAGE_ANNOTATOR_ROOT`, then the working directory.

### 3. Straight into the Claude Code prompt box

The `page-annotator-inbox` Claude Code plugin watches for sends. Each time you click **Send**, it puts the fix prompt into the prompt box (after any draft you have there) and you press Enter.

```bash
claude plugin install page-annotator-inbox --marketplace shinelikeamillion/vite-plugin-page-annotator
```

Or, inside a Claude Code session: `/plugin install page-annotator-inbox --marketplace shinelikeamillion/vite-plugin-page-annotator`. To try it without installing:

```bash
claude --plugin-dir node_modules/vite-plugin-page-annotator/claude-plugin
```

## Where the data lives

Everything is in `.page-annotator/` at the project root:

- `annotations.json`: the queue. Items go `pending` (sent) → `delivered` (read by the agent) → `done`. The latest 200 done items are kept and shown under *History* in the settings panel.
- `shots/<id>.png`: element screenshots.
- `outbox.json`: the last sent prompt, read by the Claude Code plugin.

Older versions stored this in `node_modules/.page-annotator/`; it is moved over on first run.

## How it works

- `src/index.js`: the Vite plugin. Adds `data-loc` to JSX elements, injects the UI, and serves `/__annotator/*` (submit, history, screenshots).
- `src/client.js`: the in-page UI, inside a Shadow DOM so it never touches your styles.
- `src/store.js`: the queue and prompt builder (also exported as `vite-plugin-page-annotator/store`).
- `src/mcp-server.js`: the MCP server.
- `claude-plugin/`: the Claude Code plugin.

## Development

```bash
npm install
npm run check     # syntax check
npm test          # store tests
npm run test:mod  # Claude Code plugin tests
```

`example/` is a small React landing page wired up with the plugin (`cd example && npm install && npm run dev`). The screenshots above come from it.

## License

[MIT](LICENSE)
