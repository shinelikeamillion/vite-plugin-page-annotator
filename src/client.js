// Page annotator: click elements in the running page, leave change requests,
// send them to the dev server queue (read by the page-annotator MCP server).
(() => {
  if (window.__pageAnnotator) return;
  const cfg = window.__PAGE_ANNOTATOR__ || {};
  const ENDPOINT = cfg.endpoint || '/__annotator/submit';
  const STORAGE_KEY = 'page-annotator:draft';
  const SHOT_PREF_KEY = 'page-annotator:screenshot';
  const BAR_POS_KEY = 'page-annotator:bar-pos';
  const SETTINGS_KEY = 'page-annotator:settings';
  const DEFAULT_PROMPTS = cfg.defaultPrompts || {};

  // ---------- settings + UI strings ----------
  const STRINGS = {
    zh: {
      notePh: '这里要怎么改？Enter 保存，Shift+Enter 换行', shotOpt: '附带元素截图',
      parent: '↑ 父', parentTip: '改选父元素（⌥↑，输入框为空时直接 ↑）', child: '↓ 子', childTip: '改选子元素（⌥↓，输入框为空时直接 ↓）',
      del: '删除', copyShot: '复制截图', copyShotTip: '把这条的截图复制到剪贴板', cancel: '取消', save: '保存',
      popHint: '右键退出标注 · ↑↓ 切换父/子元素', dragPop: '拖动移动标注框',
      grip: '拖动移动工具栏，双击复位，右键打开设置', toggle: '◎ 标注', toggleTip: 'Alt+A 或 ⌘+点击开始，右键退出',
      count: (n) => `${n} 条`, countTip: '查看 / 修改全部标注', clear: '清空', clearTip: '清空全部', send: '发送',
      confirmClear: (n) => `清空全部 ${n} 条标注？`, libFail: '截图库加载失败',
      copiedBoth: '已复制 prompt 和截图：⌘V 粘贴文字，Ctrl+V 粘贴图片（Claude Code / Codex 终端）',
      copiedText: '已复制 prompt 到剪贴板', copiedNone: '剪贴板不可用，可在 Claude / Codex 里说"处理页面标注"',
      sent: (n, range, hint) => `已发送 ${n} 条（${range}）。${hint}`, sendFail: (m) => `发送失败：${m}`,
      noShot: '这条没有截图', shotCopied: '截图已复制，可直接粘贴到对话框', copyFail: (m) => `复制失败：${m}`,
      empty: '还没有标注。⌘+点击页面进入标注模式', scrollTo: '滚动到该元素', lost: '页面上找不到这个元素了',
      settings: '设置', lang: '语言', promptLabel: '修复 prompt', promptHelp: '发送时使用。可用占位：{{count}} 条数、{{ids}} 编号、{{page}} 页面地址、{{json}} 标注 JSON（没写会自动附在最后）',
      resetPrompt: '恢复默认', shotDefault: '新标注默认附带截图', close: '关闭', saved: '已保存',
      tabSettings: '设置', tabHistory: '历史', hAll: '全部', hPending: '待处理', hDone: '已完成', hEmpty: '没有记录',
      hLoadFail: (m) => `读取历史失败：${m}`, st_pending: '待处理', st_delivered: '已读取', st_done: '已完成',
      hHelp: '已发送的标注，存在项目根目录 .page-annotator/（已完成的保留最近 200 条）', refresh: '刷新',
    },
    en: {
      notePh: 'What should change here? Enter to save, Shift+Enter for a new line', shotOpt: 'Attach element screenshot',
      parent: '↑ Parent', parentTip: 'Pick the parent element (⌥↑, or ↑ while the box is empty)', child: '↓ Child', childTip: 'Pick a child element (⌥↓, or ↓ while the box is empty)',
      del: 'Delete', copyShot: 'Copy screenshot', copyShotTip: 'Copy this annotation\'s screenshot', cancel: 'Cancel', save: 'Save',
      popHint: 'Right-click to exit · ↑↓ parent / child', dragPop: 'Drag to move',
      grip: 'Drag to move, double-click to reset, right-click for settings', toggle: '◎ Annotate', toggleTip: 'Alt+A or ⌘+click to start, right-click to exit',
      count: (n) => `${n} item${n === 1 ? '' : 's'}`, countTip: 'View / edit all annotations', clear: 'Clear', clearTip: 'Clear all', send: 'Send',
      confirmClear: (n) => `Clear all ${n} annotations?`, libFail: 'Could not load the screenshot library',
      copiedBoth: 'Prompt and screenshot copied: ⌘V pastes text, Ctrl+V pastes the image (Claude Code / Codex terminal)',
      copiedText: 'Prompt copied to the clipboard', copiedNone: 'Clipboard unavailable; ask Claude / Codex to "handle the page annotations"',
      sent: (n, range, hint) => `Sent ${n} (${range}). ${hint}`, sendFail: (m) => `Send failed: ${m}`,
      noShot: 'This annotation has no screenshot', shotCopied: 'Screenshot copied; paste it into the chat', copyFail: (m) => `Copy failed: ${m}`,
      empty: 'No annotations yet. ⌘+click the page to start', scrollTo: 'Scroll to the element', lost: 'This element is no longer on the page',
      settings: 'Settings', lang: 'Language', promptLabel: 'Fix prompt', promptHelp: 'Used when sending. Placeholders: {{count}} count, {{ids}} ids, {{page}} page URL, {{json}} annotation JSON (appended at the end if left out)',
      resetPrompt: 'Reset to default', shotDefault: 'Attach screenshots to new annotations by default', close: 'Close', saved: 'Saved',
      tabSettings: 'Settings', tabHistory: 'History', hAll: 'All', hPending: 'Open', hDone: 'Done', hEmpty: 'Nothing here',
      hLoadFail: (m) => `Could not load history: ${m}`, st_pending: 'open', st_delivered: 'read', st_done: 'done',
      hHelp: 'Sent annotations, kept in .page-annotator/ at the project root (the latest 200 done ones)', refresh: 'Refresh',
    },
  };
  /** @type {{ lang: 'zh'|'en', prompts: Record<string, string> }} prompts: custom template per language */
  // English unless the plugin was configured with lang: 'zh'; the viewer's own pick is kept
  let settings = { lang: cfg.lang === 'zh' ? 'zh' : 'en', prompts: {} };
  try { settings = { ...settings, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; } catch { /* storage off */ }
  const saveSettings = () => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* storage off */ } };
  const t = (key, ...args) => { const v = (STRINGS[settings.lang] || STRINGS.en)[key]; return typeof v === 'function' ? v(...args) : v; };
  const promptFor = (lang) => settings.prompts[lang] || DEFAULT_PROMPTS[lang] || '';
  const SCREENSHOT_LIB = cfg.screenshotLib || '/__annotator/vendor/modern-screenshot.js';

  const host = document.createElement('page-annotator');
  host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
<style>
  :host { all: initial; }
  * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif; }
  .hl { position: fixed; border: 2px solid #7c5cff; background: rgba(124,92,255,.12); border-radius: 3px; pointer-events: none; transition: all .04s linear; }
  .hl.picked { border-style: solid; background: rgba(124,92,255,.18); }
  .hl-label { position: absolute; left: -2px; bottom: 100%; margin-bottom: 4px; white-space: nowrap; max-width: 60vw; overflow: hidden; text-overflow: ellipsis;
    background: #1d1b26; color: #e9e6ff; font-size: 11px; padding: 3px 6px; border-radius: 4px; font-family: ui-monospace, Menlo, monospace; }
  .hl-label.below { bottom: auto; top: 100%; margin: 4px 0 0; }
  .pin { position: fixed; width: 22px; height: 22px; margin: -11px 0 0 -11px; border-radius: 50%; background: #7c5cff; color: #fff; font-size: 12px; font-weight: 600;
    display: flex; align-items: center; justify-content: center; pointer-events: auto; cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,.35); border: 2px solid #fff; }
  .pin.lost { background: #8a8796; }
  .pin:hover { transform: scale(1.12); }
  .outline { position: fixed; border: 1px dashed rgba(124,92,255,.7); border-radius: 3px; pointer-events: none; }
  .pop { position: fixed; width: 320px; background: #1d1b26; color: #e9e6ff; border-radius: 10px; padding: 10px; pointer-events: auto;
    box-shadow: 0 10px 30px rgba(0,0,0,.45); border: 1px solid #353146; }
  .pop .meta { cursor: move; user-select: none; touch-action: none; font-size: 11px; color: #a39fb8; font-family: ui-monospace, Menlo, monospace; margin-bottom: 8px; word-break: break-all; }
  .pop textarea { width: 100%; min-height: 72px; resize: vertical; background: #12111a; color: #fff; border: 1px solid #353146; border-radius: 6px; padding: 8px; font-size: 13px; outline: none; }
  .pop textarea:focus { border-color: #7c5cff; }
  .row { display: flex; gap: 6px; margin-top: 8px; align-items: center; }
  .row .grow { flex: 1; }
  .shot-opt { display: flex; align-items: center; gap: 5px; font-size: 12px; color: #a39fb8; margin-top: 8px; cursor: pointer; user-select: none; }
  .shot-opt input { accent-color: #7c5cff; margin: 0; }
  .pin.shot::after { content: ''; position: absolute; right: -3px; bottom: -3px; width: 8px; height: 8px; border-radius: 50%; background: #3ddc97; border: 1.5px solid #fff; }
  button { font-size: 12px; border: 1px solid #353146; background: #2a2738; color: #e9e6ff; border-radius: 6px; padding: 5px 10px; cursor: pointer; }
  button:hover { background: #353146; }
  button.primary { background: #7c5cff; border-color: #7c5cff; color: #fff; }
  button.primary:hover { background: #6a4bf0; }
  button.danger { color: #ff8a8a; }
  button:disabled { opacity: .45; cursor: default; }
  .bar { position: fixed; right: 16px; bottom: 16px; display: flex; gap: 6px; align-items: center; pointer-events: auto; background: #1d1b26; padding: 6px; border-radius: 10px;
    box-shadow: 0 6px 20px rgba(0,0,0,.4); border: 1px solid #353146; }
  .bar .grip { cursor: grab; color: #8a8796; font-size: 14px; padding: 0 2px 0 4px; user-select: none; touch-action: none; line-height: 1; }
  .bar .grip:hover { color: #e9e6ff; }
  .bar.dragging, .bar.dragging .grip { cursor: grabbing; }
  .bar .toggle.on { background: #7c5cff; border-color: #7c5cff; color: #fff; }
  .bar .count { font-size: 12px; color: #a39fb8; padding: 0 4px; text-align: center; font-variant-numeric: tabular-nums; }
  .bar > * { white-space: nowrap; flex: none; box-sizing: border-box; }
  .bar .count { cursor: pointer; border-radius: 6px; padding: 5px 6px; }
  .bar .count:hover, .bar .count.open { background: #2a2738; color: #e9e6ff; }
  .list { position: fixed; right: 16px; bottom: 64px; width: 360px; max-height: min(60vh, 520px); overflow: auto; pointer-events: auto; background: #1d1b26; color: #e9e6ff;
    border-radius: 10px; border: 1px solid #353146; box-shadow: 0 10px 30px rgba(0,0,0,.45); padding: 6px; }
  .list .empty { font-size: 12px; color: #a39fb8; padding: 10px; text-align: center; }
  .li { display: flex; gap: 8px; align-items: flex-start; padding: 6px; border-radius: 8px; }
  .li:hover, .li.cur { background: #2a2738; }
  .li .num { flex: none; width: 22px; height: 22px; border-radius: 50%; background: #7c5cff; color: #fff; font-size: 12px; font-weight: 600; display: flex; align-items: center; justify-content: center; cursor: pointer; margin-top: 2px; }
  .li .num.lost { background: #8a8796; }
  .li .body { flex: 1; min-width: 0; }
  .li textarea { width: 100%; min-height: 26px; height: 26px; resize: none; overflow: hidden; background: transparent; color: #fff; border: 1px solid transparent; border-radius: 6px; padding: 3px 6px; font-size: 13px; line-height: 18px; outline: none; }
  .li textarea:hover { border-color: #353146; }
  .li textarea:focus { border-color: #7c5cff; background: #12111a; }
  .li .loc { font-size: 10.5px; color: #8a8796; font-family: ui-monospace, Menlo, monospace; padding: 0 7px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .li img { display: block; max-width: 100%; max-height: 90px; margin: 4px 7px 0; border-radius: 4px; border: 1px solid #353146; background: #fff; }
  .li .x { flex: none; padding: 2px 7px; border: none; background: none; color: #8a8796; font-size: 14px; }
  .li .x:hover { color: #ff8a8a; background: #353146; }
  .hint { font-size: 10.5px; color: #8a8796; margin-top: 6px; }
  .settings { position: fixed; width: 420px; max-width: calc(100vw - 8px); pointer-events: auto; background: #1d1b26; color: #e9e6ff; border-radius: 10px; border: 1px solid #353146;
    box-shadow: 0 10px 30px rgba(0,0,0,.45); padding: 12px; font-size: 12px; }
  .tabs { display: flex; gap: 4px; margin-bottom: 10px; border-bottom: 1px solid #353146; }
  .tabs .tab { background: none; border: none; border-bottom: 2px solid transparent; border-radius: 0; color: #a39fb8; padding: 4px 8px 6px; }
  .tabs .tab.on { color: #fff; border-bottom-color: #7c5cff; }
  .hist-filter .hf.on { background: #2a2738; border-color: #7c5cff; color: #fff; }
  .hist-rows { max-height: 320px; overflow: auto; margin: 8px 0 4px; }
  .hrow { display: flex; gap: 8px; padding: 6px 2px; border-top: 1px solid #2a2738; }
  .hrow:first-child { border-top: none; }
  .hrow .hmain { flex: 1; min-width: 0; }
  .hrow .hnote { white-space: pre-wrap; word-break: break-word; }
  .hrow .hmeta { color: #8a8796; font-size: 11px; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .hrow .hid { color: #a39fb8; font-variant-numeric: tabular-nums; }
  .hrow .st { font-size: 10px; padding: 1px 5px; border-radius: 4px; margin-left: 4px; background: #2a2738; color: #a39fb8; }
  .hrow .st.pending { background: #3a2f12; color: #f5c451; }
  .hrow .st.done { background: #13311f; color: #5fd38d; }
  .hrow img { width: 56px; height: 40px; object-fit: cover; border-radius: 4px; border: 1px solid #353146; cursor: zoom-in; flex: none; }
  .hist-empty { color: #8a8796; padding: 12px 0; text-align: center; }
  .set-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
  .set-row select { background: #12111a; color: #fff; border: 1px solid #353146; border-radius: 6px; padding: 4px 6px; font-size: 12px; }
  .set-label { color: #a39fb8; margin-bottom: 4px; }
  .set-prompt { width: 100%; height: 200px; resize: vertical; background: #12111a; color: #fff; border: 1px solid #353146; border-radius: 6px; padding: 8px;
    font: 12px/1.5 ui-monospace, Menlo, monospace; outline: none; }
  .set-prompt:focus { border-color: #7c5cff; }
  .set-help { color: #8a8796; font-size: 11px; margin-top: 4px; line-height: 1.5; }
  .toast { position: fixed; right: 16px; bottom: 64px; background: #1d1b26; color: #e9e6ff; font-size: 12px; padding: 8px 12px; border-radius: 8px; border: 1px solid #353146; max-width: 360px; }
  .toast.err { border-color: #ff6b6b; color: #ffb3b3; }
  [hidden] { display: none !important; }
</style>
<div class="outlines"></div>
<div class="hl" hidden><span class="hl-label"></span></div>
<div class="pins"></div>
<div class="pop" hidden>
  <div class="meta"></div>
  <textarea data-t-ph="notePh"></textarea>
  <label class="shot-opt"><input type="checkbox" class="shot-check"> <span data-t="shotOpt"></span></label>
  <div class="row">
    <button class="parent" data-t="parent" data-t-title="parentTip"></button>
    <button class="child" data-t="child" data-t-title="childTip"></button>
    <button class="danger del" data-t="del"></button>
    <button class="copyshot" data-t="copyShot" data-t-title="copyShotTip"></button>
    <span class="grow"></span>
    <button class="cancel" data-t="cancel"></button>
    <button class="primary save" data-t="save"></button>
  </div>
  <div class="hint" data-t="popHint"></div>
</div>
<div class="list" hidden></div>
<div class="settings" hidden>
  <div class="tabs"><button class="tab on" data-tab="settings" data-t="tabSettings"></button><button class="tab" data-tab="history" data-t="tabHistory"></button></div>
  <div class="hist" hidden>
    <div class="row hist-filter">
      <button class="hf on" data-f="all" data-t="hAll"></button><button class="hf" data-f="pending" data-t="hPending"></button><button class="hf" data-f="done" data-t="hDone"></button>
      <span class="grow"></span><button class="hist-refresh" data-t="refresh"></button>
    </div>
    <div class="hist-rows"></div>
    <div class="set-help" data-t="hHelp"></div>
  </div>
  <div class="set-body">
  <label class="set-row"><span data-t="lang"></span>
    <select class="set-lang"><option value="en">English</option><option value="zh">中文</option></select>
  </label>
  <div class="set-label" data-t="promptLabel"></div>
  <textarea class="set-prompt" spellcheck="false"></textarea>
  <div class="set-help" data-t="promptHelp"></div>
  <label class="shot-opt"><input type="checkbox" class="set-shot"> <span data-t="shotDefault"></span></label>
  </div>
  <div class="row"><button class="set-reset" data-t="resetPrompt"></button><span class="grow"></span><button class="primary set-close" data-t="close"></button></div>
</div>
<div class="bar">
  <span class="grip" data-t-title="grip">⠿</span>
  <button class="toggle" data-t="toggle" data-t-title="toggleTip"></button>
  <span class="count" data-t-title="countTip"></span>
  <button class="clear" data-t="clear" data-t-title="clearTip"></button>
  <button class="primary send" data-t="send"></button>
</div>
<div class="toast" hidden></div>`;
  document.documentElement.appendChild(host);

  // the whole tool stays hidden and inert until ⌘⇧2 (Ctrl+Shift+2 elsewhere); the choice is remembered
  const ENABLED_KEY = 'page-annotator:enabled';
  let enabled = false;
  try { enabled = localStorage.getItem(ENABLED_KEY) === '1'; } catch { /* storage off */ }
  host.style.display = enabled ? '' : 'none';

  const $ = (s) => root.querySelector(s);
  const hl = $('.hl'), hlLabel = $('.hl-label'), pins = $('.pins'), outlines = $('.outlines');
  const pop = $('.pop'), popMeta = $('.pop .meta'), popText = $('.pop textarea');
  const btnToggle = $('.toggle'), btnSend = $('.send'), btnClear = $('.clear'), count = $('.count');
  const toastEl = $('.toast'), list = $('.list');
  const shotCheck = $('.shot-check');
  try { shotCheck.checked = localStorage.getItem(SHOT_PREF_KEY) === '1'; } catch { /* storage off */ }
  shotCheck.addEventListener('change', () => {
    try { localStorage.setItem(SHOT_PREF_KEY, shotCheck.checked ? '1' : '0'); } catch { /* storage off */ }
  });

  /** @type {{el: Element|null, note: string, info: any, wantShot: boolean, shot?: Promise<string|null>}[]} */
  let items = [];
  let active = false;
  let hoverEl = null;
  /** editing: { el, index } — index null for a new item */
  let editing = null;
  /** element highlighted from the list panel */
  let previewEl = null;
  /** hover target came from ↑/↓, not the mouse */
  let kbNav = false;
  /** children we walked up from, so ↓ goes back the same way */
  let navTrail = [];
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  const modClick = (e) => (isMac ? e.metaKey : e.ctrlKey) && (e.button === 0 || e.button === undefined);

  const own = (e) => e.composedPath().includes(host);

  // ---------- element description ----------
  function cssPath(el) {
    const parts = [];
    while (el && el.nodeType === 1 && el !== document.body && el !== document.documentElement) {
      if (el.id) { parts.unshift(`#${CSS.escape(el.id)}`); break; }
      const tid = el.getAttribute('data-testid');
      if (tid) { parts.unshift(`[data-testid="${tid}"]`); break; }
      const parent = el.parentElement;
      if (!parent) break;
      const same = [...parent.children].filter((c) => c.tagName === el.tagName);
      const tag = el.tagName.toLowerCase();
      parts.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(el) + 1})` : tag);
      el = parent;
    }
    return parts.join(' > ');
  }

  function reactComponents(el) {
    const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
    let f = key ? el[key] : null;
    const names = [];
    while (f && names.length < 4) {
      let t = f.type;
      if (t && typeof t === 'object') t = t.type || t.render || null; // memo / forwardRef
      if (typeof t === 'function') {
        const n = t.displayName || t.name;
        if (n && /^[A-Z]/.test(n) && names[0] !== n) names.unshift(n);
      }
      f = f.return;
    }
    return names.join(' › ');
  }

  const STYLE_KEYS = ['display', 'position', 'color', 'background-color', 'font-size', 'font-weight', 'padding', 'margin', 'border-radius', 'gap'];
  function pickStyles(el) {
    const cs = getComputedStyle(el);
    const out = {};
    for (const k of STYLE_KEYS) {
      const v = cs.getPropertyValue(k);
      if (v && v !== 'normal' && v !== 'none' && v !== '0px' && v !== 'rgba(0, 0, 0, 0)' && v !== 'static') out[k] = v;
    }
    return out;
  }

  function describe(el) {
    const locEl = el.closest('[data-loc]');
    const r = el.getBoundingClientRect();
    const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
    return {
      tag: el.tagName.toLowerCase(),
      loc: locEl ? locEl.getAttribute('data-loc') : null,
      locIsAncestor: !!locEl && locEl !== el,
      component: reactComponents(el),
      selector: cssPath(el),
      text: text.length > 120 ? `${text.slice(0, 120)}…` : text,
      classes: (typeof el.className === 'string' ? el.className : el.getAttribute('class') || '').trim().slice(0, 240),
      rect: { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) },
      styles: pickStyles(el),
    };
  }

  const shortLabel = (el) => {
    const loc = el.closest('[data-loc]')?.getAttribute('data-loc');
    const cls = typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/)[0]}` : '';
    const r = el.getBoundingClientRect();
    return `${el.tagName.toLowerCase()}${cls}  ${Math.round(r.width)}×${Math.round(r.height)}${loc ? `  ${loc}` : ''}`;
  };

  // ---------- drawing ----------
  function placeBox(box, r) {
    box.style.left = `${r.left}px`; box.style.top = `${r.top}px`;
    box.style.width = `${r.width}px`; box.style.height = `${r.height}px`;
  }

  function resolve(item) {
    if (item.el && item.el.isConnected) return item.el;
    try { item.el = document.querySelector(item.info.selector); } catch { item.el = null; }
    return item.el;
  }

  function renderPins() {
    pins.textContent = '';
    outlines.textContent = '';
    items.forEach((item, i) => {
      const pin = document.createElement('div');
      pin.className = 'pin';
      pin.textContent = String(i + 1);
      pin.title = item.note;
      pin.classList.toggle('shot', !!item.wantShot);
      pin.addEventListener('click', (e) => { e.stopPropagation(); const el = resolve(item); if (el) openEditor(el, i); });
      pins.appendChild(pin);
      const o = document.createElement('div');
      o.className = 'outline';
      outlines.appendChild(o);
    });
    count.textContent = t('count', items.length);
    btnSend.disabled = btnClear.disabled = items.length === 0;
    renderList();
    saveDraft();
  }

  function frame() {
    if (!enabled) { requestAnimationFrame(frame); return; }
    items.forEach((item, i) => {
      const pin = pins.children[i], o = outlines.children[i];
      if (!pin) return;
      const el = resolve(item);
      if (!el) { pin.classList.add('lost'); o.hidden = true; return; }
      pin.classList.remove('lost');
      const r = el.getBoundingClientRect();
      pin.style.left = `${Math.min(Math.max(r.right, 12), innerWidth - 12)}px`;
      pin.style.top = `${Math.min(Math.max(r.top, 12), innerHeight - 12)}px`;
      o.hidden = !active && !editing && list.hidden;
      placeBox(o, r);
    });
    const target = editing ? editing.el : previewEl || (active ? hoverEl : null);
    if (target && target.isConnected) {
      const r = target.getBoundingClientRect();
      hl.hidden = false;
      hl.classList.toggle('picked', !!editing || target === previewEl);
      placeBox(hl, r);
      hlLabel.classList.toggle('below', r.top < 28);
      if (editing && !editing.dragged) positionPopover(r);
    } else {
      hl.hidden = true;
    }
    besideBar(list);
    besideBar(setPanel);
    besideBar(toastEl);
    requestAnimationFrame(frame);
  }

  function positionPopover(r) {
    const w = 320, h = pop.offsetHeight || 160, gap = 8;
    let top = r.bottom + gap;
    if (top + h > innerHeight - 8) top = r.top - h - gap;
    if (top < 8) top = Math.min(innerHeight - h - 8, Math.max(8, r.top + 8));
    const left = Math.min(Math.max(8, r.left), innerWidth - w - 8);
    pop.style.left = `${left}px`; pop.style.top = `${top}px`;
  }

  // ---------- editor ----------
  // ---------- parent / child navigation ----------
  function step(el, dir) {
    if (dir === 'up') {
      const p = el.parentElement;
      if (!p || p === document.body || p === document.documentElement) return el;
      navTrail.push(el);
      return p;
    }
    const back = navTrail.pop();
    if (back && back.parentElement === el) return back;
    navTrail = [];
    const kids = [...el.children].filter((c) => { const r = c.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    return kids[0] || el;
  }

  function setHover(el) {
    hoverEl = el;
    hlLabel.textContent = shortLabel(el);
  }

  function moveEditTarget(dir) {
    if (!editing) return;
    editing.el = step(editing.el, dir);
    const label = shortLabel(editing.el);
    popMeta.textContent = (editing.index != null ? `#${editing.index + 1}  ` : '') + label;
    hlLabel.textContent = label;
  }

  function openEditor(el, index = null) {
    navTrail = [];
    editing = { el, index };
    const existing = index != null ? items[index] : null;
    popMeta.textContent = (index != null ? `#${index + 1}  ` : '') + shortLabel(el);
    hlLabel.textContent = shortLabel(el);
    popText.value = existing ? existing.note : '';
    if (existing) shotCheck.checked = !!existing.wantShot;
    $('.del').hidden = index == null;
    $('.copyshot').hidden = !(existing && existing.wantShot);
    pop.hidden = false;
    positionPopover(el.getBoundingClientRect());
    setTimeout(() => popText.focus(), 0);
  }

  function closeEditor() {
    editing = null;
    pop.hidden = true;
  }

  function saveEditor() {
    if (!editing) return;
    const note = popText.value.trim();
    const { el, index } = editing;
    if (!note) { if (index == null) closeEditor(); else deleteItem(index); return; }
    const prev = index != null ? items[index] : null;
    const wantShot = shotCheck.checked;
    const entry = { el, note, info: describe(el), wantShot };
    // capture now so the picture shows the element as the person saw it
    if (wantShot) entry.shot = prev && prev.wantShot && prev.el === el && prev.shot ? prev.shot : capture(el);
    if (index == null) items.push(entry); else items[index] = entry;
    closeEditor();
    renderPins();
  }

  function deleteItem(index) {
    items.splice(index, 1);
    closeEditor();
    renderPins();
  }

  $('.save').addEventListener('click', saveEditor);
  $('.cancel').addEventListener('click', closeEditor);
  $('.del').addEventListener('click', () => editing && editing.index != null && deleteItem(editing.index));
  // drag the popover by its header; it then stays put until closed
  popMeta.dataset.tTitle = 'dragPop';
  popMeta.addEventListener('pointerdown', (e) => {
    if (!editing || e.button !== 0) return;
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY, left: pop.offsetLeft, top: pop.offsetTop };
    popMeta.setPointerCapture(e.pointerId);
    const move = (ev) => {
      if (!editing) return;
      editing.dragged = true;
      const left = Math.min(Math.max(0, start.left + ev.clientX - start.x), innerWidth - pop.offsetWidth);
      const top = Math.min(Math.max(0, start.top + ev.clientY - start.y), innerHeight - 24);
      pop.style.left = `${left}px`; pop.style.top = `${top}px`;
    };
    const up = () => {
      popMeta.removeEventListener('pointermove', move);
      popMeta.removeEventListener('pointerup', up);
      popMeta.removeEventListener('pointercancel', up);
      popText.focus();
    };
    popMeta.addEventListener('pointermove', move);
    popMeta.addEventListener('pointerup', up);
    popMeta.addEventListener('pointercancel', up);
  });

  $('.parent').addEventListener('click', () => { moveEditTarget('up'); popText.focus(); });
  $('.child').addEventListener('click', () => { moveEditTarget('down'); popText.focus(); });
  popText.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && (e.altKey || popText.value === '')) {
      e.preventDefault();
      moveEditTarget(e.key === 'ArrowUp' ? 'up' : 'down');
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); saveEditor(); }
    if (e.key === 'Escape') { e.preventDefault(); closeEditor(); }
  });

  // ---------- inspect mode ----------
  function setActive(on) {
    active = on;
    btnToggle.classList.toggle('on', on);
    document.documentElement.style.cursor = on ? 'crosshair' : '';
    if (!on) { hoverEl = null; kbNav = false; closeEditor(); }
  }
  btnToggle.addEventListener('click', () => setActive(!active));

  window.addEventListener('mousemove', (e) => {
    if (!active || editing || own(e)) return;
    const el = e.target;
    if (!(el instanceof Element) || el === hoverEl) return;
    // small mouse jitter inside the element picked with ↑/↓ keeps that pick
    if (kbNav && hoverEl && (hoverEl.contains(el) || el.contains(hoverEl))) return;
    kbNav = false;
    navTrail = [];
    setHover(el);
  }, true);

  const stop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  };
  // in annotate mode the page gets no clicks; outside it, ⌘+click (Ctrl+click elsewhere) starts annotating
  const swallow = (e) => {
    if (!enabled || own(e) || !(active || modClick(e))) return;
    stop(e);
  };
  for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'dblclick', 'auxclick']) {
    window.addEventListener(type, swallow, true);
  }
  window.addEventListener('click', (e) => {
    if (!enabled || own(e) || !(active || modClick(e))) return;
    stop(e);
    if (!(e.target instanceof Element)) return;
    const t = e.target;
    const pick = kbNav && hoverEl && (hoverEl.contains(t) || t.contains(hoverEl)) ? hoverEl : t;
    // ⌘+click only switches annotate mode on; the next click picks
    if (!active) { setActive(true); setHover(t); return; }
    openEditor(pick);
  }, true);
  window.addEventListener('contextmenu', (e) => {
    if (!active || own(e)) return;
    stop(e);
    setActive(false);
  }, true);

  window.addEventListener('keydown', (e) => {
    if ((isMac ? e.metaKey : e.ctrlKey) && e.shiftKey && !e.altKey && e.code === 'Digit2') { stop(e); setEnabled(!enabled); return; }
    if (!enabled) return;
    if (e.altKey && e.code === 'KeyA') { e.preventDefault(); setActive(!active); return; }
    if (!active || own(e)) return;
    if (e.key === 'Escape') { e.preventDefault(); if (editing) closeEditor(); else setActive(false); return; }
    if (editing || !hoverEl) return;
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      stop(e);
      kbNav = true;
      setHover(step(hoverEl, e.key === 'ArrowUp' ? 'up' : 'down'));
    } else if (e.key === 'Enter') {
      stop(e);
      openEditor(hoverEl);
    }
  }, true);

  // ---------- screenshots ----------
  let libPromise;
  function loadScreenshotLib() {
    if (window.modernScreenshot) return Promise.resolve(window.modernScreenshot);
    libPromise ||= new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SCREENSHOT_LIB;
      s.onload = () => resolve(window.modernScreenshot);
      s.onerror = () => { libPromise = null; reject(new Error(t('libFail'))); };
      document.head.appendChild(s);
    });
    return libPromise;
  }

  function backgroundOf(el) {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const bg = getComputedStyle(n).backgroundColor;
      if (bg && bg !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(bg)) return bg;
    }
    return '#ffffff';
  }

  async function capture(el) {
    try {
      const lib = await loadScreenshotLib();
      const r = el.getBoundingClientRect();
      const scale = Math.min(window.devicePixelRatio || 1, 2, 1600 / Math.max(r.width, r.height, 1));
      return await lib.domToPng(el, { scale, backgroundColor: backgroundOf(el), timeout: 10000 });
    } catch (err) {
      console.warn('[page-annotator] screenshot failed', err);
      return null;
    }
  }

  /** Screenshot for an item, recapturing after a reload dropped the image. */
  function shotFor(item) {
    if (!item.wantShot) return null;
    if (!item.shot) {
      const el = resolve(item);
      item.shot = el ? capture(el) : Promise.resolve(null);
    }
    return item.shot;
  }

  // ---------- send ----------
  let toastTimer;
  function toast(msg, isErr = false) {
    toastEl.textContent = msg;
    toastEl.classList.toggle('err', isErr);
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toastEl.hidden = true), isErr ? 6000 : 3500);
  }

  btnClear.addEventListener('click', () => {
    if (!items.length || !confirm(t('confirmClear', items.length))) return;
    items = [];
    closeEditor();
    renderPins();
  });

  // ---------- clipboard: JSON text + one labeled image of all screenshots ----------
  const loadImage = (src) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

  /** Stack screenshots vertically, each under a "#id note" label, into one PNG. */
  async function composeShots(entries) {
    const imgs = await Promise.all(entries.map((e) => loadImage(e.dataUrl)));
    const PAD = 16, LABEL = 30, GAP = 14;
    const width = Math.min(1600, Math.max(480, ...imgs.map((im) => im.naturalWidth + PAD * 2)));
    const sizes = imgs.map((im) => {
      const k = Math.min(1, (width - PAD * 2) / im.naturalWidth);
      return { w: Math.round(im.naturalWidth * k), h: Math.round(im.naturalHeight * k) };
    });
    const height = PAD + sizes.reduce((sum, sz) => sum + LABEL + sz.h + GAP, 0) - GAP + PAD;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f4f3f8';
    ctx.fillRect(0, 0, width, height);
    let y = PAD;
    entries.forEach((e, i) => {
      ctx.fillStyle = '#7c5cff';
      ctx.font = '600 16px -apple-system, "PingFang SC", sans-serif';
      ctx.textBaseline = 'middle';
      const label = `#${e.id}  ${e.note.replace(/\s+/g, ' ')}`;
      ctx.fillText(label.length > 80 ? `${label.slice(0, 80)}…` : label, PAD, y + LABEL / 2 - 2, width - PAD * 2);
      y += LABEL;
      ctx.drawImage(imgs[i], PAD, y, sizes[i].w, sizes[i].h);
      ctx.strokeStyle = '#d6d2e6';
      ctx.strokeRect(PAD - 0.5, y - 0.5, sizes[i].w + 1, sizes[i].h + 1);
      y += sizes[i].h + GAP;
    });
    return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'));
  }

  /**
   * Must be called synchronously inside the click handler: the clipboard write
   * starts while the click still counts as a user gesture, and the content
   * arrives later through promises. Resolves to what ended up on the clipboard.
   */
  function copyResult(resultPromise, withImage) {
    const textBlob = () => resultPromise.then((r) => new Blob([r.data.prompt], { type: 'text/plain' }));
    const imageBlob = () => resultPromise.then((r) => {
      const entries = r.shots
        .map((dataUrl, i) => ({ dataUrl, id: r.data.ids[i], note: r.sent[i].note }))
        .filter((e) => e.dataUrl);
      if (!entries.length) throw new Error('no screenshots');
      return composeShots(entries);
    });
    const textOnly = () => resultPromise
      .then((r) => navigator.clipboard.writeText(r.data.prompt))
      .then(() => 'text', () => 'none');
    if (!navigator.clipboard) return Promise.resolve('none');
    if (!withImage || typeof ClipboardItem === 'undefined' || !navigator.clipboard.write) return textOnly();
    return navigator.clipboard
      .write([new ClipboardItem({ 'text/plain': textBlob(), 'image/png': imageBlob() })])
      .then(() => 'both', textOnly);
  }

  btnSend.addEventListener('click', () => {
    if (!items.length) return;
    btnSend.disabled = true;
    const sent = items.slice();
    const result = (async () => {
      const shots = await Promise.all(sent.map(shotFor));
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: location.href,
          title: document.title,
          viewport: { w: innerWidth, h: innerHeight },
          lang: settings.lang,
          promptTemplate: settings.prompts[settings.lang] || undefined,
          items: sent.map((it, i) => ({ note: it.note, ...it.info, screenshot: shots[i] })),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      return { data, shots, sent };
    })();
    const copied = copyResult(result, sent.some((it) => it.wantShot));

    Promise.all([result, copied]).then(([{ data }, what]) => {
      const range = `#${data.ids[0]}–#${data.ids[data.ids.length - 1]}`;
      const hint = t({ both: 'copiedBoth', text: 'copiedText', none: 'copiedNone' }[what]);
      toast(t('sent', data.ids.length, range, hint));
      toggleList(false);
      items = items.filter((it) => !sent.includes(it));
      renderPins();
      setActive(false);
    }).catch((err) => {
      toast(t('sendFail', err.message), true);
    }).finally(() => {
      btnSend.disabled = items.length === 0;
    });
  });

  // ---------- per-annotation copy ----------
  async function copyOne(item) {
    const dataUrl = await shotFor(item);
    if (!dataUrl) throw new Error(t('noShot'));
    return composeShots([{ dataUrl, id: items.indexOf(item) + 1, note: item.note }]);
  }

  $('.copyshot').addEventListener('click', () => {
    const item = editing && editing.index != null ? items[editing.index] : null;
    if (!item) return;
    // started inside the click so it still counts as a user gesture
    navigator.clipboard.write([new ClipboardItem({ 'image/png': copyOne(item) })])
      .then(() => toast(t('shotCopied')))
      .catch((err) => toast(t('copyFail', err.message), true));
  });

  // ---------- list panel: preview, edit, delete ----------
  const autoGrow = (ta) => { ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight + 2}px`; };

  function renderList() {
    if (list.hidden) return;
    list.textContent = '';
    if (!items.length) {
      list.innerHTML = `<div class="empty">${t('empty')}</div>`;
      return;
    }
    items.forEach((item, i) => {
      const row = document.createElement('div');
      row.className = 'li';
      const el = resolve(item);
      row.innerHTML = '<div class="num"></div><div class="body"><textarea rows="1"></textarea><div class="loc"></div></div><button class="x">✕</button>';
      row.querySelector('.x').title = t('del');
      const num = row.querySelector('.num'), ta = row.querySelector('textarea'), loc = row.querySelector('.loc');
      num.textContent = String(i + 1);
      num.classList.toggle('lost', !el);
      num.title = el ? t('scrollTo') : t('lost');
      loc.textContent = item.info.loc || item.info.selector || '';
      loc.title = loc.textContent;
      ta.value = item.note;
      if (item.wantShot && item.shot) {
        item.shot.then((src) => {
          if (!src) return;
          const img = document.createElement('img');
          img.src = src;
          row.querySelector('.body').appendChild(img);
        });
      }
      row.addEventListener('mouseenter', () => { previewEl = resolve(item); row.classList.add('cur'); });
      row.addEventListener('mouseleave', () => { previewEl = null; row.classList.remove('cur'); });
      num.addEventListener('click', () => {
        const target = resolve(item);
        if (target) target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      });
      ta.addEventListener('input', () => {
        autoGrow(ta);
        if (ta.value.trim()) { item.note = ta.value.trim(); pins.children[i] && (pins.children[i].title = item.note); saveDraft(); }
      });
      ta.addEventListener('blur', () => { ta.value = item.note; autoGrow(ta); });
      ta.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); ta.blur(); }
        if (e.key === 'Escape') ta.blur();
      });
      row.querySelector('.x').addEventListener('click', () => {
        previewEl = null;
        items.splice(i, 1);
        closeEditor();
        renderPins();
      });
      list.appendChild(row);
      requestAnimationFrame(() => autoGrow(ta));
    });
  }

  function toggleList(show = list.hidden) {
    list.hidden = !show;
    if (show) setPanel.hidden = true;
    count.classList.toggle('open', show);
    if (!show) previewEl = null;
    renderList();
  }
  count.addEventListener('click', () => toggleList());

  // ---------- toolbar: draggable, the list and toast follow it ----------
  const bar = $('.bar'), grip = $('.grip');
  let barPos = null; // { left, top } once moved; null = default bottom-right corner
  try { barPos = JSON.parse(localStorage.getItem(BAR_POS_KEY) || 'null'); } catch { barPos = null; }

  function placeBar() {
    if (!barPos) { bar.style.left = bar.style.top = ''; bar.style.right = bar.style.bottom = '16px'; return; }
    const left = Math.min(Math.max(4, barPos.left), innerWidth - bar.offsetWidth - 4);
    const top = Math.min(Math.max(4, barPos.top), innerHeight - bar.offsetHeight - 4);
    bar.style.right = bar.style.bottom = 'auto';
    bar.style.left = `${left}px`; bar.style.top = `${top}px`;
  }

  /** Put a floating panel above the toolbar (below when there is no room), right edges aligned. */
  function besideBar(panel) {
    if (panel.hidden) return;
    const b = bar.getBoundingClientRect(), h = panel.offsetHeight, w = panel.offsetWidth, gap = 8;
    const top = b.top - gap - h >= 4 ? b.top - gap - h : Math.min(b.bottom + gap, innerHeight - h - 4);
    panel.style.right = panel.style.bottom = 'auto';
    panel.style.left = `${Math.min(Math.max(4, b.right - w), innerWidth - w - 4)}px`;
    panel.style.top = `${Math.max(4, top)}px`;
  }

  grip.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const r = bar.getBoundingClientRect();
    const dx = e.clientX - r.left, dy = e.clientY - r.top;
    grip.setPointerCapture(e.pointerId);
    bar.classList.add('dragging');
    const move = (ev) => { barPos = { left: ev.clientX - dx, top: ev.clientY - dy }; placeBar(); };
    const up = () => {
      bar.classList.remove('dragging');
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      grip.removeEventListener('pointercancel', up);
      try { localStorage.setItem(BAR_POS_KEY, JSON.stringify(barPos)); } catch { /* storage off */ }
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
    grip.addEventListener('pointercancel', up);
  });
  grip.addEventListener('dblclick', () => {
    barPos = null;
    try { localStorage.removeItem(BAR_POS_KEY); } catch { /* storage off */ }
    placeBar();
  });
  addEventListener('resize', placeBar);

  // ---------- settings panel (right-click the ⠿ grip) ----------
  const setPanel = $('.settings'), setLang = $('.set-lang'), setPrompt = $('.set-prompt'), setShot = $('.set-shot');

  function applyLang() {
    root.querySelectorAll('[data-t]').forEach((n) => { n.textContent = t(n.dataset.t); });
    root.querySelectorAll('[data-t-title]').forEach((n) => { n.title = t(n.dataset.tTitle); });
    root.querySelectorAll('[data-t-ph]').forEach((n) => { n.placeholder = t(n.dataset.tPh); });
    fixBarWidths();
    count.textContent = t('count', items.length);
    renderList();
    if (!histBox.hidden) renderHistory();
  }

  // lock the toolbar's width per language, so a changing count never makes it grow or shrink
  function fixBarWidths() {
    for (const n of [btnToggle, count]) n.style.width = '';
    count.textContent = t('count', 999);
    const cw = count.getBoundingClientRect().width;
    const tw = btnToggle.getBoundingClientRect().width;
    if (cw) count.style.width = `${Math.ceil(cw)}px`;
    if (tw) btnToggle.style.width = `${Math.ceil(tw)}px`;
    count.textContent = t('count', items.length);
  }

  // ---------- history tab ----------
  const API_BASE = (cfg.endpoint || '/__annotator/submit').replace(/\/submit$/, '');
  const histBox = $('.hist'), histRows = $('.hist-rows'), setBody = $('.set-body');
  let histFilter = 'all', histItems = [];

  function showTab(name) {
    root.querySelectorAll('.tabs .tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
    histBox.hidden = name !== 'history';
    setBody.hidden = name === 'history';
    $('.set-reset').hidden = name === 'history';
    if (name === 'history') loadHistory();
  }

  async function loadHistory() {
    try {
      const res = await fetch(`${API_BASE}/history`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      histItems = (await res.json()).items || [];
      renderHistory();
    } catch (err) {
      histRows.innerHTML = '';
      const d = document.createElement('div'); d.className = 'hist-empty'; d.textContent = t('hLoadFail', err.message);
      histRows.appendChild(d);
    }
  }

  function renderHistory() {
    const rows = histItems.filter((it) => histFilter === 'all'
      || (histFilter === 'done' ? it.status === 'done' : it.status !== 'done'));
    histRows.innerHTML = '';
    if (!rows.length) {
      const d = document.createElement('div'); d.className = 'hist-empty'; d.textContent = t('hEmpty');
      histRows.appendChild(d);
      return;
    }
    const fmt = new Intl.DateTimeFormat(settings.lang === 'zh' ? 'zh-CN' : 'en', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    for (const it of rows) {
      const row = document.createElement('div'); row.className = 'hrow';
      const main = document.createElement('div'); main.className = 'hmain';
      const head = document.createElement('div'); head.className = 'hnote';
      const id = document.createElement('span'); id.className = 'hid'; id.textContent = `#${it.id} `;
      const st = document.createElement('span'); st.className = `st ${it.status}`; st.textContent = t(`st_${it.status}`) || it.status;
      head.append(id, document.createTextNode(it.note || ''), st);
      const meta = document.createElement('div'); meta.className = 'hmeta';
      let page = (it.page && typeof it.page === 'object' ? it.page.url : it.page) || '';
      try { page = new URL(page).pathname; } catch { /* keep as is */ }
      meta.textContent = [it.createdAt ? fmt.format(new Date(it.createdAt)) : '', page, it.loc || it.selector || ''].filter(Boolean).join(' · ');
      meta.title = meta.textContent;
      main.append(head, meta);
      row.appendChild(main);
      if (it.hasShot) {
        const img = document.createElement('img');
        img.src = `${API_BASE}/shot/${it.id}`;
        img.addEventListener('click', () => window.open(img.src, '_blank'));
        row.appendChild(img);
      }
      histRows.appendChild(row);
    }
  }

  root.querySelectorAll('.tabs .tab').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  root.querySelectorAll('.hist-filter .hf').forEach((b) => b.addEventListener('click', () => {
    histFilter = b.dataset.f;
    root.querySelectorAll('.hist-filter .hf').forEach((x) => x.classList.toggle('on', x === b));
    renderHistory();
  }));
  $('.hist-refresh').addEventListener('click', loadHistory);

  function fillSettings() {
    setLang.value = settings.lang;
    setPrompt.value = promptFor(settings.lang);
    setShot.checked = shotCheck.checked;
  }

  function toggleSettings(show = setPanel.hidden) {
    setPanel.hidden = !show;
    if (show) { toggleList(false); fillSettings(); if (!histBox.hidden) loadHistory(); }
  }

  grip.addEventListener('contextmenu', (e) => { e.preventDefault(); toggleSettings(); });
  setLang.addEventListener('change', () => {
    settings.lang = setLang.value === 'zh' ? 'zh' : 'en';
    saveSettings();
    applyLang();
    fillSettings();
  });
  setPrompt.addEventListener('input', () => {
    const v = setPrompt.value;
    // only a template that differs from the default is kept, so default updates still reach it
    if (v.trim() && v !== DEFAULT_PROMPTS[settings.lang]) settings.prompts[settings.lang] = v;
    else delete settings.prompts[settings.lang];
    saveSettings();
  });
  setPrompt.addEventListener('keydown', (e) => e.stopPropagation());
  $('.set-reset').addEventListener('click', () => {
    delete settings.prompts[settings.lang];
    saveSettings();
    fillSettings();
  });
  setShot.addEventListener('change', () => {
    shotCheck.checked = setShot.checked;
    try { localStorage.setItem(SHOT_PREF_KEY, setShot.checked ? '1' : '0'); } catch { /* storage off */ }
  });
  $('.set-close').addEventListener('click', () => toggleSettings(false));

  // ---------- draft persistence across reloads ----------
  function saveDraft() {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items.map(({ note, info, wantShot }) => ({ note, info, wantShot })))); } catch { /* storage off */ }
  }
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]');
    items = saved.map((s) => ({ el: null, note: s.note, info: s.info, wantShot: !!s.wantShot }));
  } catch { items = []; }

  function setEnabled(on) {
    enabled = on;
    try { localStorage.setItem(ENABLED_KEY, on ? '1' : '0'); } catch { /* storage off */ }
    if (!on) { setActive(false); toggleList(false); setPanel.hidden = true; }
    host.style.display = on ? '' : 'none';
    if (on) { fixBarWidths(); placeBar(); }
  }

  renderPins();
  applyLang();
  placeBar();
  requestAnimationFrame(frame);
  window.__pageAnnotator = { show: () => setEnabled(true), hide: () => setEnabled(false), open: () => { setEnabled(true); setActive(true); }, close: () => setActive(false), get items() { return items; } };
})();
