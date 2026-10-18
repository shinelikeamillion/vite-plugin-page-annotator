# vite-plugin-page-annotator

[English](README.md) · **简体中文** · [官网与在线指南](https://shinelikeamillion.github.io/vite-plugin-page-annotator/?lang=zh) · [AI 索引说明 (`llms.txt`)](https://shinelikeamillion.github.io/vite-plugin-page-annotator/llms.txt)

**指着浏览器里的页面，直接让 Claude Code 或 Codex 改代码。**

不用再用文字费力描述「价格卡片第三列右下角的那个次级按钮」。在 `vite dev` 开发预览时，直接点选页面上的任意元素、写下修改需求，一键把批量标注无缝交给 **Claude Code** 或 **OpenAI Codex**。

每条标注都会自动附带：
- **精确到行列的 JSX 源码位置**（基于 Vite 原生 AST 解析的 `文件:行:列`），非 JSX 页面自动回退为 CSS Selector
- **元素文本与上下文**，同一行代码循环渲染多个元素时也能精准区分
- **可选的元素级截图**，自动保存到本地并随需求一并递交给 AI
- **开箱即用的修复 Prompt**，支持通过 **MCP 服务**、**Claude Code 输入框自动填充** 或 **系统剪贴板** 零摩擦流转

> **生产构建零侵入：** 仅在 `vite dev` 开发模式下运行，UI 封装在独立的 Shadow DOM 中，绝不污染业务样式；`vite build` 生产产物中不包含任何插件代码。

![标注一个按钮：标注框显示元素的源码位置和修改需求](https://shinelikeamillion.github.io/vite-plugin-page-annotator/screenshots/annotate.png)

---

## 最快上手：复制给 AI 自动集成到项目

不想手动改配置文件？直接复制下面这段话发给 **Claude Code**、**Codex** 或任意 AI 编程助手，让 AI 全自动帮你完成安装、Vite 配置与 MCP 对接：

```text
请帮我把 `vite-plugin-page-annotator` 集成到当前 Vite 项目中，以便我在浏览器里点选标注元素并直接发给你修改：

1. 使用当前项目的包管理器安装开发依赖：
   `npm i -D vite-plugin-page-annotator`（或对应的 pnpm / yarn / bun 命令）。
2. 打开 `vite.config.ts` 或 `vite.config.js`，引入 `import { pageAnnotator } from 'vite-plugin-page-annotator'`，并将 `pageAnnotator({ lang: 'zh' })` 放在 `plugins` 数组的【第一个位置】（必须在 `@vitejs/plugin-react` 等框架插件之前，以便在编译前注入 JSX 源码行列位置 `data-loc`）。
3. 检查 `.gitignore`，如果还没有 `.page-annotator/`，请将其添加进去。
4. 配置 MCP 服务，让你可以直接读取和标记我的页面标注：
   - 在项目根目录创建或更新 `.mcp.json`，加入：
     {
       "mcpServers": {
         "page-annotator": {
           "command": "npx",
           "args": ["page-annotator-mcp"]
         }
       }
     }
   - 如果我使用 OpenAI Codex（`~/.codex/config.toml` 或 `.codex/config.toml`），请同时告诉我对应的 `[mcp_servers.page-annotator]` 配置片段（带 `--root` 指向当前项目绝对路径）。
5. 完成后检查配置是否正常，并提醒我启动开发服务器后按 `Cmd+Shift+2`（Windows/Linux 按 `Ctrl+Shift+2`）呼出页面标注工具栏。
```

---

## 与 Claude Code & Codex 无缝连接

`vite-plugin-page-annotator` 专为「浏览器预览 ⇄ 终端 AI 编程代理」的高频修改闭环打造。提供三种无缝衔接方式，共享同一个 `.page-annotator/` 本地队列：

| 衔接方式 | 适用场景 | 工作流体验 |
| --- | --- | --- |
| **1. Claude Code 输入框直连插件** | Claude Code 重度用户（零粘贴） | 在浏览器里点「发送」，修复 Prompt 自动填入 Claude Code 终端输入框（保留已有草稿），直接按 `Enter` 即可。 |
| **2. MCP 服务 (`page-annotator-mcp`)** | **Claude Code** 与 **Codex** 原生工具调用 | 对 AI 说一句「处理页面标注」，AI 自动调用 `get_page_annotations` 读取标注与截图、定位源码修改，并自动调用 `mark_annotations_done` 销项。 |
| **3. 智能剪贴板复制** | 任意 AI 对话、IDE 插件或终端 | 点「发送」后自动复制修复 Prompt（含 JSON）与元素截图。终端里 `⌘V` 粘贴文字，`Ctrl+V` 粘贴截图。 |

### 方式一：直连 Claude Code 输入框（`page-annotator-inbox` 插件）

`page-annotator-inbox` 插件会实时监听项目的发送动作。每次在浏览器点击「发送」，它都会把组装好的修复 Prompt 直接塞进当前 Claude Code 的输入框中，你只需要敲一下回车。

```bash
claude plugin install page-annotator-inbox --marketplace shinelikeamillion/vite-plugin-page-annotator
```

或者在 Claude Code 会话内直接运行：
```text
/plugin install page-annotator-inbox --marketplace shinelikeamillion/vite-plugin-page-annotator
```

想免安装直接试用一次？
```bash
claude --plugin-dir node_modules/vite-plugin-page-annotator/claude-plugin
```

### 方式二：配置 MCP 服务（支持 Claude Code 与 Codex）

包内自带零外部依赖的 stdio MCP 服务 `page-annotator-mcp`，提供三个标准工具：

| MCP 工具 | 作用 |
| --- | --- |
| `get_page_annotations` | 获取待处理的页面标注（JSON + 元素截图图像块），并将状态从 `pending` 更新为 `delivered`（已读取）。 |
| `mark_annotations_done` | 将 AI 已改完的标注 ID 标记为 `done`（已完成），浏览器端历史面板会同步更新状态。 |
| `clear_page_annotations` | 清空整个标注队列（仅在你明确指令时调用）。 |

**Claude Code 配置** — 在项目根目录创建 `.mcp.json`：

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

**OpenAI Codex 配置** — 在 `~/.codex/config.toml`（或项目 `.codex/config.toml`）中添加：

```toml
[mcp_servers.page-annotator]
command = "npx"
args = ["page-annotator-mcp", "--root", "/path/to/your/project"]
```

*（注：项目根目录按 `--root` 参数 → `$PAGE_ANNOTATOR_ROOT` 环境变量 → 当前工作目录 的顺序自动解析。）*

配置完成后，在浏览器里发完标注，只需对 Claude Code 或 Codex 说：
> **「处理页面标注」** 或 **「按标注改」**

### 选择发给谁（Claude Code / Codex）

每个运行中的 `page-annotator-mcp` 会把自己登记到 `.page-annotator/agents/`（根据 MCP `clientInfo` 识别：`claude-code` → `claude`，`codex-mcp-client` → `codex`；可用 `--agent <id>` 或 `PAGE_ANNOTATOR_AGENT` 指定）。默认自动发给最近在用的工具（最近新开会话、或最近调用过标注工具的那个），在哪个工具里处理标注，后面的标注就跟到哪个，不用手动选。想固定发给某一个工具，在设置（右键 `⠿`）的「发送给」里选，默认是「自动」。每次发送都带上这个 target：

- `get_page_annotations` 只返回发给当前工具的标注，以及没有 target 的标注（发送时没有工具在线）。
- `page-annotator-inbox` 插件只把发给 `claude`（或没有 target）的标注填进 Claude Code 输入框。

### 方式三：剪贴板一键粘贴

点击工具栏的「发送」后，可直接粘贴到 Claude Code、Codex 或任何 AI 聊天窗口。在终端环境中，`⌘V` 粘贴 Prompt 文本，`Ctrl+V` 粘贴元素截图。

---

## 手动安装与配置

### 环境要求

- **Vite 8 及以上**（使用 Vite 原生 `parseAst` 解析 JSX/TSX 并注入 `data-loc`，无需额外编译依赖）
- **Node.js 20.19 及以上**
- **框架支持：** 任意 JSX/TSX 框架（**React、Preact、Solid、Qwik** 等）均可获得精确的 `文件:行:列` 源码定位；其他页面（Vue、Svelte、原生 HTML）也能正常使用，自动回退为 CSS Selector。

### 1. 安装依赖

```bash
npm i -D vite-plugin-page-annotator
```

### 2. 配置 `vite.config.ts`

将 `pageAnnotator()` 放在框架插件**前面**：

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { pageAnnotator } from 'vite-plugin-page-annotator';

export default defineConfig({
  plugins: [
    pageAnnotator({
      lang: 'zh', // 'en' | 'zh'，也可随时在页面设置面板中切换
      locator: true, // 设为 false 时不注入 data-loc，仅发送 CSS selector
    }),
    react(),
  ],
});
```

### 3. 忽略本地数据目录

将 `.page-annotator/` 加入 `.gitignore`：

```gitignore
.page-annotator/
```

### 插件配置项

| 选项 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `lang` | `'en' \| 'zh'` | `'en'` | 界面与默认修复 Prompt 的语言。每位开发者仍可在页面右上/设置面板里独立切换并记住偏好。 |
| `locator` | `boolean` | `true` | 是否在 `vite dev` 下为 JSX 元素注入 `data-loc="文件:行:列"`。设为 `false` 则仅发送 CSS Selector。 |

---

## 使用教程

1. 运行 `npm run dev`，在浏览器打开开发页面。
2. 按 **⌘⇧2**（Windows/Linux 为 `Ctrl+Shift+2`）呼出悬浮工具栏。默认隐藏不打扰，开关状态会自动记住。
3. **按住 ⌘**（Windows/Linux 为 `Ctrl`）进入标注模式：按住期间悬停即高亮元素并显示 `文件:行:列`，左键点击选中（不会触发页面原有点击）；松开即恢复正常浏览。想不按键持续标注，可点「◎ 标注」或按 **Alt+A** 锁定。
4. 选中后输入框保持打开，松开 ⌘ 直接打字即可。
5. 输入修改需求，按 **Enter** 保存（**Shift+Enter** 换行）。需要提供视觉参考时勾选「附带元素截图」。
6. 选到了外层容器或内层图标？按 **↑ / ↓** 即可切换到父元素或子元素（输入框内已有文字时用 **⌥↑ / ⌥↓**）。
7. 可以连续标注多处修改。点击工具栏上的「**N 条**」随时查看、编辑或删除草稿。

   ![草稿列表：三条标注，其中一条带截图](https://shinelikeamillion.github.io/vite-plugin-page-annotator/screenshots/drafts.png)

8. 点击「**发送**」或按 **⌘+Enter**（`Ctrl+Enter`，在输入框里也可以）。标注批次即刻写入本地队列、同步至 Claude Code / MCP 并复制到剪贴板。

### 快捷键一览

| 快捷键 | 作用 |
| --- | --- |
| **⌘⇧2** / **Ctrl+Shift+2** | 显示 / 隐藏标注工具栏（状态自动持久化） |
| 按住 **⌘** / **Ctrl** | 按住期间标注：悬停高亮，点击选中 |
| **Alt+A** / 「◎ 标注」 | 锁定 / 退出标注模式 |
| **⌘+Enter** / **Ctrl+Enter** | 发送全部标注（在输入框里：先保存再发送） |
| **右键**、**Esc** | 退出标注模式 / 关闭标注弹窗 |
| **↑ / ↓**（输入框有字时 **⌥↑ / ⌥↓**） | 向上改选父元素 / 向下改选子元素 |
| **Enter** / **Shift+Enter** | 保存当前标注 / 换行 |
| **拖动 ⠿** | 自由移动工具栏位置；双击 `⠿` 复位 |
| **右键 ⠿** | 打开设置与历史面板（切换语言、自定义 Prompt、默认截图开关、查看历史状态） |

### 设置面板与历史记录

右键点击工具栏左侧的 `⠿` 把手即可打开设置面板。「历史」标签页会完整记录所有已发送的标注、处理状态（待处理 / 已读取 / 已完成）以及缩略图。

| 设置面板 | 历史记录 |
| --- | --- |
| ![设置面板：语言、修复 prompt、默认截图](https://shinelikeamillion.github.io/vite-plugin-page-annotator/screenshots/settings.png) | ![历史页：待处理和已完成的标注](https://shinelikeamillion.github.io/vite-plugin-page-annotator/screenshots/history.png) |

### 自定义修复 Prompt 模板

你可以在设置面板中根据团队规范定制修复 Prompt，支持以下占位符：
- `{{count}}` — 本次发送的标注条数
- `{{ids}}` — 标注编号列表（如 `1, 2, 3`）
- `{{page}}` — 当前页面 URL
- `{{json}}` — 标注数据的 JSON 代码块（若模板中省略了 `{{json}}`，系统会自动追加在末尾）

---

## 数据存储与架构说明

所有标注数据均保存在项目根目录的 `.page-annotator/` 下（插件已自动配置 Vite 忽略该目录的文件监听，发送标注不会触发页面刷新）：

- `.page-annotator/annotations.json` — 标注队列，状态流转为 `pending`（已发送）→ `delivered`（AI 已读取）→ `done`（AI 已完成）。自动保留最近 200 条已完成记录供「历史」面板查看。
- `.page-annotator/shots/<id>.png` — 元素截图文件。
- `.page-annotator/outbox.json` — 最近一次发送的 Prompt 快照（含 `target`），供 Claude Code 插件实时读取。
- `.page-annotator/agents/` — 每个运行中的 MCP 服务一个心跳文件，`GET /__annotator/agents` 据此给工具栏列出在线工具。

### 源码结构

- [`src/index.js`](src/index.js) — Vite 插件核心：在 `serve` 阶段为 JSX 注入 `data-loc`、注入前端脚本并提供 `/__annotator/*` 接口。
- [`src/client.js`](src/client.js) — 浏览器端标注交互 UI，运行在 Shadow DOM 内，与页面样式完全隔离。
- [`src/store.js`](src/store.js) — 队列原子读写与 Prompt 生成器（同时通过 `vite-plugin-page-annotator/store` 导出）。
- [`src/mcp-server.js`](src/mcp-server.js) — 零依赖 stdio MCP 服务端。
- [`claude-plugin/`](claude-plugin/) — Claude Code 终端输入框自动填充插件。

## 本地开发与测试

```bash
npm install
npm run check     # 源码语法检查
npm test          # Store 与队列单元测试
npm run test:mod  # Claude Code 插件测试
```

`example/` 目录内置了一个已接入本插件的 React 落地页示例（`cd example && npm install && npm run dev`），文档中的截图均来自该示例。

## License

[MIT](LICENSE)
