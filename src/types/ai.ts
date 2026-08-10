/**
 * src/types/ai.ts
 * ---------------
 * Shared TypeScript types for the AI Context System renderer protocol.
 *
 * These mirror the shapes produced by the main-process AI modules
 * (ai/*.cjs) so the renderer and preload stay in sync with the
 * streaming chat protocol:
 *
 *   window.electronAPI.chatWithAI(text, requestId)
 *   window.electronAPI.onChatChunk(({ requestId, chunk, full }) => ...)
 *   window.electronAPI.onChatDone(({ requestId, result }) => ...)
 */

/**
 * A single planner task produced by the AI (or the fallback planner).
 */
export interface PlannerTask {
  type: 'mkdir' | 'winget_install' | 'winget_list' | 'write_file';
  label: string;
  params: { path?: string; id?: string; content?: string };
  estimated_seconds: number;
  status: 'pending' | 'already_installed';
  note?: string;
}

/**
 * A request the planner explicitly refused (unknown package, etc.).
 */
export interface SkippedRequest {
  request: string;
  reason: string;
}

/**
 * Every user message is classified by the Intent Detector before any
 * context is built or any provider is called.
 */
export type Intent = 'CHAT' | 'TASK' | 'UNKNOWN';

/**
 * Result of calling the assistant.
 */
export interface ChatResult {
  success: boolean;
  intent: Intent;
  reply: string;
  error?: string;
  tasks?: PlannerTask[];
  tasks_skipped?: SkippedRequest[];
  source?: 'server' | 'planner';
}

/**
 * Streaming chunk event emitted while the model is answering.
 */
export interface ChatChunkEvent {
  requestId: string;
  chunk: string;
  full: string;
}

/**
 * Streaming completion event emitted when the model finished answering.
 */
export interface ChatDoneEvent {
  requestId: string;
  result: ChatResult;
}

/**
 * The window.electronAPI surface used by the renderer.
 */
export interface ElectronAPI {
  executeTask: (p: {
    taskId: string;
    type: string;
    params: Record<string, string>;
  }) => Promise<{ success: boolean; taskId: string; error?: string }>;

  /**
   * Ask the assistant. Returns immediately with the requestId; actual
   * results arrive as chat:done (and chat:chunk events while streaming).
   */
  chatWithAI: (prompt: string, requestId: string) => Promise<{ success: boolean; requestId: string; error?: string }>;

  /** Fallback for environments without the AI context system. */
  chatWithAILegacy?: (prompt: string) => Promise<{
    success: boolean;
    reply?: string;
    error?: string;
    tasks?: PlannerTask[];
    tasks_skipped?: SkippedRequest[];
  }>;

  wingetList: () => Promise<{ success: boolean; output?: string; error?: string }>;
  openReport: (reportPath: string) => Promise<{ success: boolean; error?: string }>;
  openReportFolder: (reportPath: string) => Promise<{ success: boolean; error?: string }>;

  onTaskUpdate: (cb: (d: { id: string; status: string; command?: string }) => void) => () => void;
  onTaskLog: (cb: (d: { id: string; line: string }) => void) => () => void;
  onReportCreated: (cb: (d: { id: string; reportPath: string }) => void) => () => void;

  onChatChunk: (cb: (d: ChatChunkEvent) => void) => () => void;
  onChatDone: (cb: (d: ChatDoneEvent) => void) => () => void;
}