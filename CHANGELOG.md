# Changelog

## 0.1.0

First release.

- Vite plugin that tags JSX elements with `data-loc` (file:line:column) in dev and injects the annotation UI.
- In-page UI: pick an element, write what should change, optional element screenshot, drafts list, send.
- Toggle with ⌘⇧2 / Ctrl+Shift+2 (remembered); settings panel (right-click ⠿) with language, custom fix prompt and history.
- Queue in `<root>/.page-annotator/` with `pending → delivered → done` states.
- `page-annotator-mcp` stdio MCP server: `get_page_annotations`, `mark_annotations_done`, `clear_page_annotations`.
- Claude Code plugin `page-annotator-inbox` that puts each sent prompt into the prompt box.
- English by default, Chinese available (`pageAnnotator({ lang: 'zh' })` or the settings panel).
