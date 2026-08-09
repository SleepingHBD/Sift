export interface ReliableOperationResult<T> {
  ok: boolean;
  value?: T;
  error?: string;
  attempts: number;
  durationMs: number;
  timedOut: boolean;
}

export interface ReliabilityOptions {
  timeoutMs?: number;
  maxAttempts?: number;
  retryDelayMs?: number;
}

const defaultOptions = {
  timeoutMs: 18_000,
  maxAttempts: 2,
  retryDelayMs: 300,
};

export async function runReliableOperation<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  options: ReliabilityOptions = {},
): Promise<ReliableOperationResult<T>> {
  const timeoutMs = positiveInteger(options.timeoutMs, defaultOptions.timeoutMs);
  const maxAttempts = Math.min(3, positiveInteger(options.maxAttempts, defaultOptions.maxAttempts));
  const retryDelayMs = positiveInteger(options.retryDelayMs, defaultOptions.retryDelayMs);
  const startedAt = Date.now();
  let lastError = "The source could not be retrieved.";
  let timedOut = false;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const value = await operation(AbortSignal.timeout(timeoutMs));
      return { ok: true, value, attempts: attempt, durationMs: Date.now() - startedAt, timedOut: false };
    } catch (error) {
      lastError = safeErrorMessage(error);
      timedOut = isTimeoutError(error);
      if (attempt >= maxAttempts || !isRetryableConnectorError(error)) {
        return { ok: false, error: lastError, attempts: attempt, durationMs: Date.now() - startedAt, timedOut };
      }
      await delay(retryDelayMs * attempt);
    }
  }

  return { ok: false, error: lastError, attempts: maxAttempts, durationMs: Date.now() - startedAt, timedOut };
}

export function isRetryableConnectorError(error: unknown) {
  if (isTimeoutError(error)) return true;
  const message = safeErrorMessage(error).toLowerCase();
  return /http\s+(408|425|429|5\d\d)\b/.test(message)
    || /network|fetch failed|temporar(?:y|ily)|connection reset|connection closed|service unavailable/.test(message);
}

export function isTimeoutError(error: unknown) {
  if (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name)) return true;
  return /timed?\s*out|timeout/.test(safeErrorMessage(error).toLowerCase());
}

function safeErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return "The source could not be retrieved.";
}

function positiveInteger(value: number | undefined, fallback: number) {
  return Number.isFinite(value) && Number(value) > 0 ? Math.floor(Number(value)) : fallback;
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
