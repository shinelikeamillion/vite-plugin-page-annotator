export interface QueueItem {
  id: number;
  status: 'pending' | 'delivered' | 'done';
  note: string;
  screenshot?: string;
  [key: string]: unknown;
}
export function queueFile(root: string): string;
export function readQueue(root: string): { nextId: number; items: QueueItem[] };
export function writeQueue(root: string, q: { nextId: number; items: QueueItem[] }): void;
export function addSubmission(root: string, payload: unknown): QueueItem[];
export function clearQueue(root: string): number;
export function toJson(items: QueueItem[]): Record<string, unknown>;
export const DEFAULT_PROMPTS: Record<'zh' | 'en', string>;
export function toPrompt(items: QueueItem[], options?: { lang?: string; template?: string }): string;
export function outboxFile(root: string): string;
export function writeOutbox(root: string, items: QueueItem[], prompt: string): void;
