# vite-plugin-page-annotator

[English](README.md) · **简体中文** · [官网](https://shinelikeamillion.github.io/vite-plugin-page-annotator/)

在 Vite 开发页面上点选元素、写下要改什么，一次交给 Claude Code 或 Codex。每条标注都带源码位置（`文件:行:列`），可以附元素截图，发送时会附上一段现成的修复 prompt。

只在 `vite dev` 下生效，`vite build` 的产物里没有它的任何代码。

![标注一个按钮：标注框显示元素的源码位置和修改需求](https://shinelikeamillion.github.io/vite-plugin-page-annotator/screenshots/annotate.png)

## 环境要求

- Vite 8 及以上（用 Vite 自带的 `parseAst` 解析 JSX/TSX，加上 `data-loc`）
- Node 20.19 及以上
- 源码定位需要 JSX 框架（React、Preact、Solid 等）。其他页面也能用，只是标注里给的是 CSS selector。

## 安装

```bash
npm i -D github:shinelikeamillion/vite-plugin-page-annotator
```

在 `vite.config.ts` 里加上，放在框架插件前面：

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { pageAnnotator } from 'vite-plugin-page-annotator';

export default defineConfig({
  plugins: [pageAnnotator({ lang: 'zh' }), react()],
});
```

把数据目录加进 `.gitignore`：

```gitignore
.page-annotator/
```

### 选项

| 选项 | 默认值 | 作用 |
| --- | --- | --- |
| `lang` | `'en'` | 界面和修复 prompt 的语言，`'en'` 或 `'zh'`。每个人仍可在设置面板里自己切换。 |
| `locator` | `true` | 给 JSX 元素加 `data-loc`。设为 `false` 时只发送 CSS selector。 |

## 使用教程

1. 运行 `npm run dev`，打开页面。
2. 按 **⌘⇧2**（Windows/Linux 为 Ctrl+Shift+2）显示工具栏。默认是隐藏的，开关状态会记住。
3. 在页面任意处 **⌘+点击**（Ctrl+点击），或按 **Alt+A**，进入标注模式。这一下不会选中元素。
4. 鼠标悬停可以看到元素和它的源码位置，点击选中。写下要怎么改，按 **Enter** 保存（**Shift+Enter** 换行）。需要的话勾选「附带元素截图」。
5. 选错了？用 **↑ / ↓** 切换到父元素或子元素（输入框里已有文字时用 **⌥↑ / ⌥↓**）。
6. 想加几条就加几条。点工具栏上的「N 条」可以查看、修改、删除。

   ![草稿列表：三条标注，其中一条带截图](https://shinelikeamillion.github.io/vite-plugin-page-annotator/screenshots/drafts.png)

7. 点「发送」。标注写入队列，同时修复 prompt（含 JSON）和截图会复制到剪贴板。
8. 交给 AI：直接粘贴，或者让它通过 MCP 读取队列（见下文）。

| 快捷键 | 作用 |
| --- | --- |
| ⌘⇧2 / Ctrl+Shift+2 | 显示 / 隐藏整个工具（状态会记住） |
| ⌘+点击 / Ctrl+点击、Alt+A | 进入标注模式 |
| 右键、Esc | 退出标注模式 |
| ↑ / ↓（⌥↑ / ⌥↓） | 改选父 / 子元素 |
| Enter / Shift+Enter | 保存 / 换行 |
| 拖动 ⠿ | 移动工具栏，双击复位 |
| 右键 ⠿ | 设置：语言、修复 prompt、默认截图、历史记录 |

### 设置和历史

右键工具栏左边的 ⠿ 打开设置面板。「历史」页列出所有发送过的标注，带状态和截图。

| 设置 | 历史 |
| --- | --- |
| ![设置面板：语言、修复 prompt、默认截图](https://shinelikeamillion.github.io/vite-plugin-page-annotator/screenshots/settings.png) | ![历史页：待处理和已完成的标注](https://shinelikeamillion.github.io/vite-plugin-page-annotator/screenshots/history.png) |

（截图里的界面是英文，可以在设置里切换成中文。）

### 自定义修复 prompt

可以在设置面板里改写修复 prompt。可用的占位符：`{{count}}` 条数、`{{ids}}` 编号、`{{page}}` 页面地址、`{{json}}` 标注 JSON。没写 `{{json}}` 时，JSON 会自动附在末尾。

## 交给 AI

三种方式任选一种。

### 1. 剪贴板

点「发送」后，直接粘贴到 Claude Code、Codex 或任意对话里。终端里 ⌘V 粘贴文字，Ctrl+V 粘贴截图。

### 2. MCP 服务

包里带了一个没有额外依赖的 stdio MCP 服务 `page-annotator-mcp`，提供三个工具：

| 工具 | 作用 |
| --- | --- |
| `get_page_annotations` | 返回已发送的标注（JSON 和截图），并标记为「已读取」 |
| `mark_annotations_done` | 把 AI 处理完的 id 标记为「已完成」 |
| `clear_page_annotations` | 清空队列（只在你明确要求时使用） |

Claude Code，在项目根目录的 `.mcp.json`：

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

Codex，在 `~/.codex/config.toml`：

```toml
[mcp_servers.page-annotator]
command = "npx"
args = ["page-annotator-mcp", "--root", "/path/to/your/project"]
```

然后对 AI 说「处理页面标注」。

项目根目录依次取 `--root`、`$PAGE_ANNOTATOR_ROOT`、当前工作目录。

### 3. 直接填进 Claude Code 输入框

Claude Code 插件 `page-annotator-inbox` 会检查发送记录。每次点「发送」，它把修复 prompt 填进输入框（追加在已有草稿后面），回车即可发送。

```bash
claude plugin install page-annotator-inbox --marketplace shinelikeamillion/vite-plugin-page-annotator
```

也可以在 Claude Code 会话里输入：`/plugin install page-annotator-inbox --marketplace shinelikeamillion/vite-plugin-page-annotator`。不安装、先试用：

```bash
claude --plugin-dir node_modules/vite-plugin-page-annotator/claude-plugin
```

## 数据存在哪

都在项目根目录的 `.page-annotator/` 下：

- `annotations.json`：标注队列，状态依次是 `pending`（已发送）→ `delivered`（AI 已读取）→ `done`（已完成）。已完成的保留最近 200 条，在设置面板的「历史」里查看。
- `shots/<id>.png`：元素截图。
- `outbox.json`：最近一次发送的 prompt，给 Claude Code 插件读取。

旧版本存在 `node_modules/.page-annotator/`，首次运行时会自动搬过来。

## 实现

- `src/index.js`：Vite 插件，给 JSX 元素加 `data-loc`、注入页面 UI，并提供 `/__annotator/*` 接口（提交、历史、截图）。
- `src/client.js`：页面里的标注 UI，放在 Shadow DOM 里，不影响页面样式。
- `src/store.js`：队列读写和 prompt 生成（也以 `vite-plugin-page-annotator/store` 导出）。
- `src/mcp-server.js`：MCP 服务。
- `claude-plugin/`：Claude Code 插件。

## 开发

```bash
npm install
npm run check     # 语法检查
npm test          # store 测试
npm run test:mod  # Claude Code 插件测试
```

`example/` 是一个接好插件的 React 落地页示例（`cd example && npm install && npm run dev`），上面的截图就来自它。

## License

[MIT](LICENSE)
