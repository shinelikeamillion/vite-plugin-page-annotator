import type { Plugin } from 'vite';

export interface PageAnnotatorOptions {
  /**
   * Tag lowercase JSX elements in .jsx/.tsx files with `data-loc="file:line:col"`,
   * so each annotation points at its source line. Default true.
   */
  locator?: boolean;
  /**
   * Default UI language and fix-prompt language. Each viewer can switch it in the
   * settings panel (right-click the ⠿ grip). Default 'en'.
   */
  lang?: 'en' | 'zh';
}

/** Dev-only (`vite dev`): source locations, the in-page annotator UI and its endpoints. */
export function pageAnnotator(options?: PageAnnotatorOptions): Plugin[];
export default pageAnnotator;
