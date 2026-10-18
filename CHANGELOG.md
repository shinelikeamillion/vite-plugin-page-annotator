# Changelog

## 0.1.0

First release.

- Works with Vite 8+ (exact source locations) and Vite 7 (CSS selectors only, with a startup warning).

- Vite plugin that tags JSX elements with `data-loc` (file:line:column) in dev and injects the annotation UI.
- In-page UI: hold ⌘ (Ctrl) to hover and click an element to pick it, ⌘+Enter to send; or lock the mode with Alt+A. Pick an element, write what should change, optional element screenshot, drafts list, send.
- Toolbar shows on first visit with a short hint, and `vite dev` prints the shortcuts under its URLs; ⌘⇧2 / Ctrl+Shift+2 hides or shows it (remembered); settings panel (right-click ⠿) with language, custom fix prompt and history.
- One note can cover several elements: with the note box open, ⌘+click (Ctrl+click) adds or removes elements; they are sent as an `elements` array, with one stacked screenshot.
- History tab: pick records (or select all) to send them again to the current agent, which puts them back in the queue as pending and copies the prompt, or to delete them along with their screenshots.
- Queue in `<root>/.page-annotator/` with `pending → delivered → done` states.
- `page-annotator-mcp` stdio MCP server: `get_page_annotations`, `mark_annotations_done`, `clear_page_annotations`.
- Routing between agents: each MCP server registers itself as online, every sent batch carries a `target` (the most recently used agent by default, changeable in settings) and each agent only reads its own.
- Claude Code plugin `page-annotator-inbox` that puts each sent prompt into the prompt box.
- English by default, Chinese available (`pageAnnotator({ lang: 'zh' })` or the settings panel).
