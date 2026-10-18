# vite-plugin-page-annotator

在 Vite 开发页面上点选元素、写下要改什么，一键交给 Claude Code 或 Codex。每条标注带源码位置（`文件:行:列`），截图可选，发送时会附上一段修复 prompt。

只在 `vite dev` 下生效，`vite build` 的产物里什么都没有。

## 安装

```bash
npm i -D vite-plugin-page-annotator
```

还没发布到 npm 时，用本地路径或 git 地址安装：

```bash
npm i -D file:../page-annotator
```

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { pageAnnotator } from 'vite-plugin-page-annotator';

export default defineConfig({
  plugins: [pageAnnotator(), react()],
});
```

需要 Vite 8 及以上（`data-loc` 用 Vite 自带的 `parseAst` 解析 JSX/TSX）。在 `.gitignore` 里加上 `.page-annotator/`。

选项：`pageAnnotator({ locator: false })` 关掉给 JSX 元素加 `data-loc`，此时标注只带 CSS selector。

## 用法

| 操作 | 作用 |
| --- | --- |
| `⌘⇧2`（其他系统 `Ctrl+Shift+2`） | 显示 / 隐藏整个工具，状态会记住。默认隐藏，隐藏时不拦截任何点击 |
| `⌘+点击`（其他系统 `Ctrl+点击`）或 `Alt+A` | 进入标注模式（这一下不选中元素） |
| 点击元素 | 打开标注框，写需求，`Enter` 保存，`Shift+Enter` 换行 |
| `↑` / `↓` | 在父 / 子元素间切换（标注框里输入框为空时直接按，有文字时用 `⌥↑` / `⌥↓`） |
| 右键 / `Esc` | 退出标注模式 |
| 拖动工具栏左边的 ⠿ | 移动工具栏，双击复位 |
| 右键 ⠿ | 打开设置：界面语言、自定义修复 prompt、默认是否截图，以及历史记录 |
| 点「N 条」 | 查看全部草稿，可改文案、删除、滚动到元素 |
| 「发送」 | 写入队列，同时把修复 prompt（含 JSON）和拼好的截图放进剪贴板 |

自定义 prompt 可用占位：`{{count}}` 条数、`{{ids}}` 编号、`{{page}}` 页面地址、`{{json}}` 标注 JSON（没写会自动附在末尾）。

## 交给 AI

发送后有三种方式把标注交给 AI，任选一种：

**1. 剪贴板**：直接在 Claude Code / Codex 里粘贴。

**2. MCP**：AI 调用 `get_page_annotations` 读取，改完后调用 `mark_annotations_done` 标记完成。

Claude Code（项目根目录的 `.mcp.json`）：

```json
{
  "mcpServers": {
    "page-annotator": {
      "command": "node",
      "args": ["node_modules/vite-plugin-page-annotator/src/mcp-server.js"]
    }
  }
}
```

Codex（`~/.codex/config.toml`）：

```toml
[mcp_servers.page-annotator]
command = "npx"
args = ["page-annotator-mcp", "--root", "/path/to/your/project"]
```

**3. 自动填进 Claude Code 输入框**：包里带了一个 Claude Code 插件，每秒检查一次发送记录，有新的就把 prompt 填进输入框（已有草稿会保留，追加在后面），回车即可发送。

```bash
claude --plugin-dir node_modules/vite-plugin-page-annotator/claude-plugin
```

## 数据存在哪

都在项目根目录的 `.page-annotator/` 下：

- `annotations.json`：标注队列，状态依次是 `pending`（已发送）→ `delivered`（AI 已读取）→ `done`（已处理）。已完成的保留最近 200 条，设置面板的「历史」里可以查看。
- `shots/<id>.png`：元素截图。
- `outbox.json`：最近一次发送的 prompt，给 Claude Code 插件读取。

旧版本存在 `node_modules/.page-annotator/`，首次运行时会自动搬过来。

## 文件

- `src/index.js`：Vite 插件，负责加 `data-loc`、注入页面 UI，以及 `/__annotator/*` 接口（提交、历史、截图）。
- `src/client.js`：页面里的标注 UI，放在 Shadow DOM 里，不影响页面样式。
- `src/store.js`：队列读写，以及生成 prompt。
- `src/mcp-server.js`：MCP stdio 服务，没有额外依赖（`page-annotator-mcp`）。
- `claude-plugin/`：Claude Code 插件，负责自动填入输入框。

## License

MIT
