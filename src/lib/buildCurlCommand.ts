import type { BodyType, HttpMethod, RawType } from '../types';
import type { ResolvedForSend } from './projectMerge';
import { buildUrl } from './http';

/** POSIX shell 单引号包裹（内部单引号写成 `'\''`） */
export function quoteForShSingle(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

function hasHeaderCaseInsensitive(headers: Record<string, string>, name: string): boolean {
  const lower = name.toLowerCase();
  return Object.keys(headers).some((k) => k.toLowerCase() === lower);
}

function contentTypeForRaw(rawType: RawType): string {
  switch (rawType) {
    case 'json':
      return 'application/json';
    case 'xml':
      return 'application/xml';
    default:
      return 'text/plain';
  }
}

export function buildHttpCurlCommand(input: {
  method: HttpMethod;
  resolved: ResolvedForSend;
  bodyType: BodyType;
  rawType: RawType;
}): string {
  const { method, resolved, bodyType, rawType } = input;
  const m = method.toUpperCase() as HttpMethod;
  const fullUrl = buildUrl(resolved.url, resolved.queryParams);
  const parts: string[] = ['curl'];

  if (m === 'HEAD') {
    parts.push('-X', 'HEAD');
  } else if (m !== 'GET') {
    parts.push('-X', m);
  }

  for (const [k, v] of Object.entries(resolved.headers)) {
    const hk = k.trim();
    if (!hk) continue;
    if (hk.toLowerCase() === 'content-length') continue;
    parts.push('-H', quoteForShSingle(`${hk}: ${v}`));
  }

  if (m !== 'GET' && m !== 'HEAD') {
    if (bodyType === 'raw') {
      const data = resolved.body;
      if (data) {
        if (!hasHeaderCaseInsensitive(resolved.headers, 'content-type')) {
          parts.push('-H', quoteForShSingle(`Content-Type: ${contentTypeForRaw(rawType)}`));
        }
        parts.push('--data-raw', quoteForShSingle(data));
      }
    } else if (bodyType === 'x-www-form-urlencoded') {
      const params = new URLSearchParams();
      for (const f of resolved.bodyFormFields) {
        if (f.enabled === false) continue;
        const key = f.key.trim();
        if (!key) continue;
        params.append(key, f.value);
      }
      const bodyStr = params.toString();
      if (bodyStr) {
        if (!hasHeaderCaseInsensitive(resolved.headers, 'content-type')) {
          parts.push(
            '-H',
            quoteForShSingle('Content-Type: application/x-www-form-urlencoded')
          );
        }
        parts.push('--data-raw', quoteForShSingle(bodyStr));
      }
    } else if (bodyType === 'form-data') {
      for (const f of resolved.bodyFormFields) {
        if (f.enabled === false) continue;
        const key = f.key.trim();
        if (!key) continue;
        if (f.type === 'file') {
          const files =
            f.files && f.files.length > 0
              ? f.files
              : f.filePath
                ? [{ path: f.filePath, name: f.value || 'file' }]
                : [];
          for (const file of files) {
            parts.push('-F', quoteForShSingle(`${key}=@${file.path}`));
          }
        } else {
          parts.push('-F', quoteForShSingle(`${key}=${f.value}`));
        }
      }
    } else if (bodyType === 'binary' && resolved.binaryPath?.trim()) {
      parts.push('--data-binary', quoteForShSingle(`@${resolved.binaryPath.trim()}`));
    }
  }

  parts.push(quoteForShSingle(fullUrl));
  return parts.join(' ');
}

/** SSE：流式 GET，合并解析后的 URL 与请求头 */
export function buildSseCurlCommand(resolved: ResolvedForSend): string {
  const fullUrl = buildUrl(resolved.url, resolved.queryParams);
  const parts: string[] = ['curl', '-N'];
  if (!hasHeaderCaseInsensitive(resolved.headers, 'accept')) {
    parts.push('-H', quoteForShSingle('Accept: text/event-stream'));
  }
  for (const [k, v] of Object.entries(resolved.headers)) {
    const hk = k.trim();
    if (!hk) continue;
    if (hk.toLowerCase() === 'content-length') continue;
    parts.push('-H', quoteForShSingle(`${hk}: ${v}`));
  }
  parts.push(quoteForShSingle(fullUrl));
  return parts.join(' ');
}

/** WebSocket 无法用 curl 完成握手，生成注释 + wscat 示例 */
export function buildWsCurlHint(resolved: ResolvedForSend): string {
  const fullUrl = buildUrl(resolved.url, resolved.queryParams);
  return (
    `# WebSocket 无法通过普通 curl 完成握手；请使用 wscat、websocat 等工具。\n` +
    `# 示例（需安装 wscat）: wscat -c ${quoteForShSingle(fullUrl)}`
  );
}

export function buildCurlCommandFromRequest(input: {
  protocol: 'http' | 'ws' | 'sse';
  method: HttpMethod;
  resolved: ResolvedForSend;
  bodyType: BodyType;
  rawType: RawType;
}): string {
  if (input.protocol === 'http') {
    return buildHttpCurlCommand({
      method: input.method,
      resolved: input.resolved,
      bodyType: input.bodyType,
      rawType: input.rawType,
    });
  }
  if (input.protocol === 'sse') {
    return buildSseCurlCommand(input.resolved);
  }
  return buildWsCurlHint(input.resolved);
}
