'use client';
// packages/next/src/client.jsx
// React client component that mounts Page Annotator UI in Next.js development mode.
import React, { useEffect } from 'react';

const DEFAULT_PROMPTS = {
  en: [
    'Please make the code changes for the {{count}} page annotations below. Each one is an element I picked in the page preview plus what I want changed:',
    '- `loc` is where the element is in the source (file:line:column); open that spot and edit it',
    '- `text` is the text on the element; use it to tell which one is meant when one line of code renders several elements',
    '- `screenshot` (when present) is a picture of the element at the time; look at it before editing',
    '',
    '{{json}}',
    '',
    'When done, summarize each change by #id and call mark_annotations_done (ids: [{{ids}}]).',
  ].join('\n'),
  zh: [
    '请按下面 {{count}} 条页面标注修改代码。每条是我在预览页面上点选的元素和修改需求：',
    '- `loc` 是元素在源码里的位置（文件:行:列），直接打开这个位置修改',
    '- `text` 是元素上的文字，同一行代码渲染出多个元素时，用它确认是哪一个',
    '- `screenshot`（如果有）是该元素当时的截图文件，先打开看一下再改',
    '',
    '{{json}}',
    '',
    '改完后按 #id 逐条简要说明改了什么，并调用 mark_annotations_done（ids: [{{ids}}]）。',
  ].join('\n'),
};

/**
 * @param {object} props
 * @param {'en' | 'zh'} [props.lang='en']
 * @param {string} [props.basePath='/api/__annotator']
 */
export function PageAnnotator({ lang = 'en', basePath = '/api/__annotator' }) {
  // Only execute in development environment in browser
  const isDev = process.env.NODE_ENV !== 'production';

  useEffect(() => {
    if (!isDev || typeof window === 'undefined') return;

    window.__PAGE_ANNOTATOR__ = {
      lang: lang === 'zh' ? 'zh' : 'en',
      endpoint: `${basePath}/submit`,
      screenshotLib: `${basePath}/vendor/modern-screenshot.js`,
      defaultPrompts: DEFAULT_PROMPTS,
    };

    const scriptId = '__page_annotator_client_script__';
    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.src = `${basePath}/client.js`;
      script.defer = true;
      document.body.appendChild(script);
    }
  }, [isDev, lang, basePath]);

  if (!isDev) return null;
  return null;
}

export default PageAnnotator;
