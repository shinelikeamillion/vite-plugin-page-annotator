export interface QueueItem {
  id: number;
  status: 'pending' | 'delivered' | 'done';
  note: string;
  /** set when one note covers several elements; each has its own loc / selector / text */
  elements?: { loc?: string | null; selector?: string; text?: string; [key: string]: unknown }[];
  screenshot?: string;
  /** agent id the annotation was sent to ('claude', 'codex', ...); absent = any agent */
  target?: string;
  [key: string]: unknown;
}
export function queueFile(root: string): string;
export function readQueue(root: string): { nextId: number; items: QueueItem[] };
export function writeQueue(root: string, q: { nextId: number; items: QueueItem[] }): void;
export function addSubmission(root: string, payload: unknown): QueueItem[];
export function clearQueue(root: string): number;
export function historyItems(root: string, limit?: number): Record<string, unknown>[];
export function resendItems(root: string, ids: number[], target?: string): QueueItem[];
export function deleteItems(root: string, ids: number[]): number[];
export function toJson(items: QueueItem[]): Record<string, unknown>;
export const DEFAULT_PROMPTS: Record<'zh' | 'en', string>;
export function toPrompt(items: QueueItem[], options?: { lang?: string; template?: string }): string;
export function outboxFile(root: string): string;
export function writeOutbox(root: string, items: QueueItem[], prompt: string, target?: string): void;
export interface AgentInfo { agent: string; client: string; lastActive: number }
export function agentId(clientName: string): string;
export function isForAgent(item: QueueItem, agent: string): boolean;
export function registerAgent(root: string, info: { agent: string; pid?: number; client?: string; lastActive?: number }): string;
export function unregisterAgent(root: string, agent: string, pid?: number): void;
export function listAgents(root: string, now?: number): AgentInfo[];
