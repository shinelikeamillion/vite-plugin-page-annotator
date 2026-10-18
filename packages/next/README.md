# next-page-annotator

**Point at your live Next.js page. Let Claude Code or Codex fix it.**

Visual in-page annotation tool built for **Next.js** (App Router & Pages Router) and seamless AI coding workflows with **Claude Code** and **OpenAI Codex**.

---

## 30-Second Setup for Next.js

### 1. Install the package

```bash
npm i -D next-page-annotator
```

### 2. Add the Route Handler (Next.js App Router)

Create `app/api/__annotator/[...path]/route.ts`:

```ts
import { createAnnotatorHandler } from 'next-page-annotator/server';

export const { GET, POST } = createAnnotatorHandler({
  lang: 'en', // 'en' | 'zh'
});
```

*(For Pages Router, create `pages/api/__annotator/[...path].ts` and export `createPagesApiHandler()`.)*

### 3. Mount in your Root Layout (`app/layout.tsx`)

```tsx
import { PageAnnotator } from 'next-page-annotator';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        {/* Only active during dev; zero bytes in production builds */}
        <PageAnnotator />
      </body>
    </html>
  );
}
```

### 4. Ignore the local queue directory

Add `.page-annotator/` to `.gitignore`:

```gitignore
.page-annotator/
```

---

## How It Works

1. Run `npm run dev` and open your Next.js app in the browser.
2. Press **⌘⇧2** (`Ctrl+Shift+2`) to wake up the toolbar.
3. **⌘+Click** (`Alt+A`) to annotate any UI element, write what to change, and hit **Enter**.
4. Click **Send** to stream annotations into `.page-annotator/`.
5. Tell Claude Code or Codex: **"handle the page annotations"** via MCP (`npx page-annotator-mcp`).

## License

[MIT](LICENSE)
