'use client';

/**
 * useAIChat
 *
 * React hook for the AI chat flow.
 *
 * Backend contract (see backend/app/routes/ai_chat.py):
 *   POST  /api/ai/chat              -> { response: string }
 *
 * The hook:
 * 1. POSTs the prompt.
 * 2. Resolves with the response text.
 *
 * It surfaces granular state (`isLoading`, `phase`, `error`) so the
 * UI can show a "thinking..." indicator.
 */

import { useCallback, useRef, useState } from 'react';
import { api } from '@/lib/api';

export type ChatPhase = 'idle' | 'queued' | 'in_progress' | 'complete' | 'failed';

export interface UseAIChatOptions {}

export interface UseAIChatResult {
  /** Send a prompt and resolve with the assistant's response text. */
  send: (
    message: string,
    history?: { role: string; content: string }[],
  ) => Promise<string>;
  /** Cancel the current request state. */
  cancel: () => void;
  /** True from the moment send() is called until it resolves or rejects. */
  isLoading: boolean;
  /** Current request phase, useful for status indicators. */
  phase: ChatPhase;
  /** Last error thrown by send(), or null if none. */
  error: Error | null;
}

export function useAIChat(_options: UseAIChatOptions = {}): UseAIChatResult {
  const [isLoading, setIsLoading] = useState(false);
  const [phase, setPhase] = useState<ChatPhase>('idle');
  const [error, setError] = useState<Error | null>(null);

  // useRef so cancel() can flip the flag without re-rendering the hook.
  const cancelledRef = useRef(false);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
  }, []);

  const send = useCallback(
    async (
      message: string,
      history: { role: string; content: string }[] = [],
    ): Promise<string> => {
      cancelledRef.current = false;
      setIsLoading(true);
      setPhase('in_progress');
      setError(null);

      try {
        const response = await api.sendChatMessage(message, history);
        if (cancelledRef.current) {
          throw new Error('Request cancelled');
        }
        setPhase('complete');
        return response.response;
      } catch (err) {
        const e = err instanceof Error ? err : new Error('Unknown AI error');
        setError(e);
        setPhase((current) => (current === 'complete' ? current : 'failed'));
        throw e;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  return { send, cancel, isLoading, phase, error };
}
