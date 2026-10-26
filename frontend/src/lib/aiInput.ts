export const MAX_MESSAGE_CHARS = 2000;
export const MAX_HISTORY_ITEMS = 20;

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export type ChatInput = { ok: true; message: string; history: ChatMessage[] } | { ok: false; detail: string };

/**
 * Validate the body of a chat request.
 *
 * `history` comes from the browser, so it is untrusted: only user/assistant turns
 * are kept (a client-supplied `system` turn would be a prompt-injection channel),
 * each is length-capped, and anything else is dropped.
 */
export function parseChatInput(body: unknown): ChatInput {
  const b = (body ?? {}) as Record<string, unknown>;

  const message = typeof b.message === 'string' ? b.message.trim() : '';
  if (!message) return { ok: false, detail: 'message is required' };
  if (message.length > MAX_MESSAGE_CHARS) {
    return { ok: false, detail: `message must be at most ${MAX_MESSAGE_CHARS} characters` };
  }

  const history: ChatMessage[] = [];
  if (Array.isArray(b.history)) {
    for (const item of b.history.slice(-MAX_HISTORY_ITEMS)) {
      const turn = item as Record<string, unknown>;
      if (turn?.role !== 'user' && turn?.role !== 'assistant') continue;
      if (typeof turn.content !== 'string' || !turn.content.trim()) continue;
      history.push({ role: turn.role, content: turn.content.slice(0, MAX_MESSAGE_CHARS) });
    }
  }
  return { ok: true, message, history };
}
