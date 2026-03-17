import { invoke } from '@tauri-apps/api/core';
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

interface RustHttpResponse {
  status: number;
  status_text: string;
  headers: Record<string, string>;
  body: string;
  time_ms: number;
}

export async function sendHttpRequest(options: HttpRequestOptions): Promise<HttpResponse> {
  const { method, url, headers = {}, body } = options;

  const cleanHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (v) cleanHeaders[k] = v;
  }

  let bodyStr: string | undefined;
  if (body && method !== 'GET' && method !== 'HEAD') {
    if (typeof body === 'string') {
      bodyStr = body;
    } else if (body instanceof URLSearchParams) {
      bodyStr = body.toString();
      if (!cleanHeaders['Content-Type']) {
        cleanHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
      }
    } else if (body instanceof FormData) {
      // FormData 需要特殊处理：序列化为 multipart 字符串
      // 目前先用浏览器 Request API 序列化
      const req = new Request('http://localhost', { method: 'POST', body });
      const buf = await req.arrayBuffer();
      bodyStr = new TextDecoder().decode(buf);
      const ct = req.headers.get('content-type');
      if (ct) cleanHeaders['Content-Type'] = ct;
    } else if (body instanceof Uint8Array) {
      bodyStr = new TextDecoder().decode(body);
    }
  }

  const resp = await invoke<RustHttpResponse>('http_request', {
    payload: {
      method,
      url,
      headers: cleanHeaders,
      body: bodyStr ?? null,
    },
  });

  return {
    status: resp.status,
    statusText: resp.status_text,
    headers: resp.headers,
    body: resp.body,
    timeMs: resp.time_ms,
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

/** 仅编码 & 和 =，用于地址栏展示，避免 [ ] 等被转成 %5B %5D */
function encodeForDisplay(s: string): string {
  return s.replace(/&/g, '%26').replace(/=/g, '%3D');
}

/** 构建用于地址栏展示的 URL，保留 [0] 等字符原样显示 */
export function buildDisplayUrl(base: string, params: Record<string, string>): string {
  const parts = Object.entries(params)
    .filter(([k, v]) => k && v)
    .map(([k, v]) => `${encodeForDisplay(k)}=${encodeForDisplay(v)}`);
  const query = parts.join('&');
  if (!query) return base;
  return base.includes('?') ? `${base}&${query}` : `${base}?${query}`;
}

export interface ParsedUrl {
  base: string;
  params: Array<{ key: string; value: string }>;
}

/**
 * 将完整 URL 解析为 base（不含查询串）和 params 列表。
 * 解析失败时返回 base 为原输入、params 为空。
 */
export function parseUrlToBaseAndParams(full: string): ParsedUrl {
  try {
    const url = new URL(full);
    let base = url.origin + url.pathname;
    if (base.endsWith('/') && url.pathname === '/') {
      base = base.slice(0, -1);
    }
    const params: Array<{ key: string; value: string }> = [];
    url.searchParams.forEach((value, key) => {
      params.push({ key, value });
    });
    return { base, params };
  } catch {
    return { base: full, params: [] };
  }
}
