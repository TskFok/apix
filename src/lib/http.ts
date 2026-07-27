import { invoke } from '@tauri-apps/api/core';
import type { HttpMethod } from '../types';

export interface HttpRequestOptions {
  method: HttpMethod;
  url: string;
  headers?: Record<string, string>;
  body?: string | FormData | URLSearchParams | Uint8Array;
  /** 是否跳过 TLS 证书校验，仅用于受信任的调试环境 */
  ignoreTlsCertificateErrors?: boolean;
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

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export async function sendHttpRequest(options: HttpRequestOptions): Promise<HttpResponse> {
  const { method, url, headers = {}, body, ignoreTlsCertificateErrors = false } = options;

  const cleanHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (v) cleanHeaders[k] = v;
  }

  let bodyBase64: string | undefined;
  if (body && method !== 'GET' && method !== 'HEAD') {
    if (typeof body === 'string') {
      bodyBase64 = bytesToBase64(new TextEncoder().encode(body));
    } else if (body instanceof URLSearchParams) {
      bodyBase64 = bytesToBase64(new TextEncoder().encode(body.toString()));
      if (!cleanHeaders['Content-Type']) {
        cleanHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
      }
    } else if (body instanceof FormData) {
      // FormData 需要序列化为 multipart 原始字节，不能按文本解码，否则二进制文件会损坏。
      const req = new Request('http://localhost', { method: 'POST', body });
      const buf = await req.arrayBuffer();
      bodyBase64 = bytesToBase64(new Uint8Array(buf));
      const ct = req.headers.get('content-type');
      if (ct) cleanHeaders['Content-Type'] = ct;
    } else if (body instanceof Uint8Array) {
      bodyBase64 = bytesToBase64(body);
    }
  }

  const resp = await invoke<RustHttpResponse>('http_request', {
    payload: {
      method,
      url,
      headers: cleanHeaders,
      body_base64: bodyBase64 ?? null,
      ignore_tls_certificate_errors: ignoreTlsCertificateErrors,
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

function decodeQueryPart(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, ' '));
  } catch {
    return s;
  }
}

export interface DisplayQueryField {
  key: string;
  value: string;
  enabled?: boolean;
  queryEmptyShowsEquals?: boolean;
}

export interface BuildDisplayUrlFromQueryFieldsOptions {
  /** search 原始串在 ? 后以 & 结尾（如 ?a=1&），表示正在输入下一参数 */
  trailingAmpersand?: boolean;
}

/**
 * 用 Params 表行构建地址栏展示 URL（可区分 ?a 与 ?a=）。
 * Record 版 {@link buildDisplayUrl} 无此信息时空 value 仅输出 key。
 */
export function buildDisplayUrlFromQueryFields(
  base: string,
  fields: DisplayQueryField[],
  options?: BuildDisplayUrlFromQueryFieldsOptions
): string {
  const parts = fields
    .filter((f) => f.enabled !== false && f.key.trim())
    .map((f) => {
      const ek = encodeForDisplay(f.key.trim());
      const vv = f.value ?? '';
      if (!vv) {
        return f.queryEmptyShowsEquals ? `${ek}=` : ek;
      }
      return `${ek}=${encodeForDisplay(vv)}`;
    });
  let query = parts.join('&');
  const ta = options?.trailingAmpersand === true;
  if (ta) {
    query = query ? `${query}&` : '&';
  }
  if (!query) return base;
  if (base.includes('?')) {
    const sep = base.endsWith('?') || base.endsWith('&') ? '' : '&';
    return `${base}${sep}${query}`;
  }
  return `${base}?${query}`;
}

/** 构建用于地址栏展示的 URL，保留 [0] 等字符原样显示（无 Query 行标志时空 value 不带 =） */
export function buildDisplayUrl(base: string, params: Record<string, string>): string {
  const parts = Object.entries(params)
    .filter(([k]) => k.trim())
    .map(([k, v]) => {
      const ek = encodeForDisplay(k.trim());
      const vv = v ?? '';
      if (!vv) return ek;
      return `${ek}=${encodeForDisplay(vv)}`;
    });
  const query = parts.join('&');
  if (!query) return base;
  if (base.includes('?')) {
    const sep = base.endsWith('?') || base.endsWith('&') ? '' : '&';
    return `${base}${sep}${query}`;
  }
  return `${base}?${query}`;
}

export interface ParsedQueryPart {
  key: string;
  value: string;
  /** 原始片段为 `key=`（空值但带等号）时为 true */
  emptyValueHasTrailingEquals?: boolean;
}

export interface ParsedUrl {
  base: string;
  params: ParsedQueryPart[];
  /** 原始 ? 后片段以 & 结尾（忽略已拆进 params 的尾部空段） */
  trailingAmpersand?: boolean;
}

/** 从 `?a=1&b` 原始 search 解析，以区分 `?a` 与 `?a=`（URLSearchParams 无法区分） */
function parseSearchStringToParams(search: string): ParsedQueryPart[] {
  if (!search || search === '?') return [];
  const raw = search.startsWith('?') ? search.slice(1) : search;
  const out: ParsedQueryPart[] = [];
  for (const segment of raw.split('&')) {
    if (!segment) continue;
    const eq = segment.indexOf('=');
    if (eq === -1) {
      out.push({ key: decodeQueryPart(segment), value: '' });
      continue;
    }
    const key = decodeQueryPart(segment.slice(0, eq));
    const value = decodeQueryPart(segment.slice(eq + 1));
    const part: ParsedQueryPart = { key, value };
    if (value === '') {
      part.emptyValueHasTrailingEquals = true;
    }
    out.push(part);
  }
  return out;
}

/**
 * 将完整 URL 解析为 base（不含查询串）和 params 列表。
 * 解析失败时返回 base 为原输入、params 为空。
 */
export function parseUrlToBaseAndParams(full: string): ParsedUrl {
  const trimmedEnd = full.trimEnd();
  try {
    const url = new URL(trimmedEnd);
    let base = url.origin + url.pathname;
    const schemeIdx = trimmedEnd.indexOf('://');
    const hasSlashAfterHost =
      schemeIdx !== -1 && trimmedEnd.indexOf('/', schemeIdx + 3) !== -1;
    // 无显式 "/" 时 URL 仍会规范化出 pathname "/"；去掉该斜杠以保持 https://host 形态。
    // 用户输入 "https://host/" 时必须保留尾部 "/"，否则无法在地址栏继续输入路径。
    if (
      base.endsWith('/') &&
      url.pathname === '/' &&
      !hasSlashAfterHost &&
      !trimmedEnd.endsWith('/')
    ) {
      base = base.slice(0, -1);
    }
    // new URL 会丢掉仅含 "?" 的空查询串，或仅有 "?" 的 search，导致无法输入 "?"
    if (
      trimmedEnd.endsWith('?') &&
      (url.search === '' || url.search === '?')
    ) {
      return { base: `${base}?`, params: [] };
    }
    const params = parseSearchStringToParams(url.search);
    const rawQ = url.search.startsWith('?') ? url.search.slice(1) : '';
    const trailingAmpersand = rawQ.length > 0 && rawQ.endsWith('&');
    return {
      base,
      params,
      ...(trailingAmpersand ? { trailingAmpersand: true } : {}),
    };
  } catch {
    return { base: full, params: [] };
  }
}
