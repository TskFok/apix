import { useErrorLogStore, type ErrorLogSource } from '../stores/errorLogStore';

function safeJsonStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(
    value,
    (_key, current) => {
      if (typeof current === 'object' && current !== null) {
        if (seen.has(current)) return '[Circular]';
        seen.add(current);
      }
      if (typeof current === 'bigint') return String(current);
      if (typeof current === 'function') return `[Function ${current.name || 'anonymous'}]`;
      return current;
    },
    2
  );
}

function toErrorMessage(error: unknown): {
  name?: string;
  message: string;
  stack?: string;
  detail?: string;
} {
  if (error instanceof Error) {
    const base = {
      name: error.name,
      message: error.message || String(error),
      stack: error.stack,
    };
    const anyError = error as Error & { cause?: unknown };
    if (anyError.cause !== undefined) {
      return {
        ...base,
        detail: `cause: ${typeof anyError.cause === 'string' ? anyError.cause : safeJsonStringify(anyError.cause)}`,
      };
    }
    return base;
  }

  if (typeof error === 'string') {
    return { message: error };
  }

  if (error == null) {
    return { message: String(error) };
  }

  try {
    return {
      message: 'Non-Error exception',
      detail: safeJsonStringify(error),
    };
  } catch {
    return { message: String(error) };
  }
}

export function appendErrorLog(source: ErrorLogSource, error: unknown, context?: Record<string, unknown>): void {
  const payload = toErrorMessage(error);
  useErrorLogStore.getState().addEntry({
    source,
    ...payload,
    context,
  });
}

let globalErrorListenersBound = false;

export function setupGlobalErrorCollection(): void {
  if (globalErrorListenersBound || typeof window === 'undefined') return;
  globalErrorListenersBound = true;

  window.addEventListener('error', (event) => {
    appendErrorLog('runtime', event.error ?? event.message, {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    appendErrorLog('promise', event.reason, {
      type: 'unhandledrejection',
    });
  });
}
