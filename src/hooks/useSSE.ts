import { useCallback, useRef } from 'react';
import { fetch } from '@tauri-apps/plugin-http';
import { useRequestStore } from '../stores/requestStore';
import { useResponseStore } from '../stores/responseStore';
import { addHistory } from '../lib/db';
import { buildUrl } from '../lib/http';
import { SSEParser } from '../lib/sse';

let abortController: AbortController | null = null;

export function useSSE() {
  const { url, getHeadersRecord, getQueryParamsRecord, getHeadersForStorage, getParamsForStorage } = useRequestStore();
  const {
    setStreamState,
    addStreamMessage,
    clearStreamMessages,
    refreshHistory,
  } = useResponseStore();
  const connectedAtRef = useRef<number>(0);

  const connect = useCallback(async () => {
    if (!url.trim()) return;

    abortController = new AbortController();
    setStreamState({ loading: true, error: undefined });
    clearStreamMessages();
    connectedAtRef.current = Date.now();

    try {
      const fullUrl = buildUrl(url, getQueryParamsRecord());
      const headers: Record<string, string> = {
        Accept: 'text/event-stream',
        ...getHeadersRecord(),
      };

      const response = await fetch(fullUrl, {
        method: 'GET',
        headers,
        signal: abortController.signal,
      });

      if (response.status >= 400) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      setStreamState({ connected: true, loading: false });

      if (response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        const parser = new SSEParser();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            parser.parse(chunk, (event) => {
              const content = event.data ?? JSON.stringify(event);
              addStreamMessage({
                direction: 'in',
                timestamp: Date.now(),
                content,
                event: event.event,
              });
            });
          }
          parser.flush((event) => {
            const content = event.data ?? JSON.stringify(event);
            addStreamMessage({
              direction: 'in',
              timestamp: Date.now(),
              content,
              event: event.event,
            });
          });
        } finally {
          reader.releaseLock();
        }
      }

      setStreamState({ connected: false });
      const elapsed = Date.now() - connectedAtRef.current;
      await addHistory(
        'sse',
        null,
        url,
        getHeadersForStorage(),
        getParamsForStorage(),
        null,
        response.status,
        elapsed
      );
      refreshHistory();
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        const elapsed = Date.now() - connectedAtRef.current;
        await addHistory(
          'sse',
          null,
          url,
          getHeadersForStorage(),
          getParamsForStorage(),
          null,
          undefined,
          elapsed
        );
        refreshHistory();
      } else {
        setStreamState({
          connected: false,
          loading: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    } finally {
      abortController = null;
      setStreamState({ connected: false });
    }
  }, [
    url,
    getHeadersRecord,
    getQueryParamsRecord,
    getHeadersForStorage,
    getParamsForStorage,
    setStreamState,
    addStreamMessage,
    clearStreamMessages,
    refreshHistory,
  ]);

  const disconnect = useCallback(() => {
    if (abortController) {
      abortController.abort();
    }
  }, []);

  return {
    connect,
    disconnect,
  };
}
