import React from 'react';

export interface PageAnnotatorProps {
  lang?: 'en' | 'zh';
  basePath?: string;
}

export declare const PageAnnotator: React.FC<PageAnnotatorProps>;
export default PageAnnotator;

export interface AnnotatorHandlerOptions {
  lang?: 'en' | 'zh';
  basePath?: string;
}

export declare function createAnnotatorHandler(options?: AnnotatorHandlerOptions): {
  GET: (req: Request, context: { params: { path?: string[] } | Promise<{ path?: string[] }> }) => Promise<Response>;
  POST: (req: Request, context: { params: { path?: string[] } | Promise<{ path?: string[] }> }) => Promise<Response>;
};

export declare function createPagesApiHandler(options?: AnnotatorHandlerOptions): (req: any, res: any) => Promise<any>;
