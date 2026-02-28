import { fetch } from '@tauri-apps/plugin-http';
import type { HttpMethod } from '../types';

export interface HttpRequestOptions {
  method: HttpMethod;
  url: string;
  headers?: Record<string, string>;
  body?: string | FormData | URLSearchParams | Uint8Array;
}

export interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  timeMs: number;
}

function headersToRecord(headers: Headers): Record<string, string> {
  const obj: Record<string, string> = {};
  headers.forEach((v, k) => {
    obj[k] = v;
  });
  return obj;
}

export async function sendHttpRequest(options: HttpRequestOptions): Promise<HttpResponse> {
  const start = Date.now();
  const { method, url, headers = {}, body } = options;

  const init: RequestInit = {
    method,
    headers: Object.entries(headers).reduce((acc, [k, v]) => {
      if (v) acc[k] = v;
      return acc;
    }, {} as Record<string, string>),
  };

  if (body && method !== 'GET' && method !== 'HEAD') {
    if (typeof body === 'string') {
      init.body = body;
    } else if (body instanceof URLSearchParams) {
      init.body = body.toString();
      if (!(init.headers as Record<string, string>)['Content-Type']) {
        (init.headers as Record<string, string>)['Content-Type'] =
          'application/x-www-form-urlencoded';
      }
    } else if (body instanceof FormData) {
      init.body = body;
      delete (init.headers as Record<string, string>)['Content-Type'];
    } else if (body instanceof Uint8Array) {
      init.body = body;
      delete (init.headers as Record<string, string>)['Content-Type'];
    }
  }

  const response = await fetch(url, init as RequestInit & { method: string });
  const timeMs = Date.now() - start;

  let bodyText = '';
  if (response.body) {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const c of chunks) {
      result.set(c, offset);
      offset += c.length;
    }
    bodyText = new TextDecoder().decode(result);
  }

  return {
    status: response.status,
    statusText: response.statusText,
    headers: headersToRecord(response.headers),
    body: bodyText,
    timeMs,
  };
}

export function buildUrl(base: string, params: Record<string, string>): string {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (k && v) searchParams.set(k, v);
  });
  const query = searchParams.toString();
  if (!query) return base;
  return base.includes('?') ? `${base}&${query}` : `${base}?${query}`;
}
