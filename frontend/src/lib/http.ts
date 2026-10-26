/**
 * `fetch` for third-party services (LLM providers, Google token check): every call gets a deadline, so a
 * provider that hangs cannot hold a serverless function until the platform kills it.
 * Throws a `TimeoutError` DOMException when the deadline passes.
 */
export function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs: number): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

/** Deadlines in milliseconds. */
export const TIMEOUTS = {
  /** One LLM model call (Gemini, Groq). */
  llmCall: 8_000,
  /** All LLM attempts of one chat request together; after this the built-in answer is used. */
  llmTotal: 20_000,
  /** Google's id-token check on sign-in. */
  tokenInfo: 5_000,
} as const;
