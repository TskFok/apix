import type { ErrorLogEntry } from '../stores/errorLogStore';

const REDACTED = '[REDACTED]';
const normalizedKey = (key: string) => key.replace(/[^a-z0-9]/gi, '').toLowerCase();
const isSecretKey = (key: string) =>
  /password|passwd|passphrase|secret|token|authorization|cookie|credential|apikey|privatekey|session/.test(normalizedKey(key)) ||
  /^(auth|key|pwd)$/.test(normalizedKey(key));
const isPayloadKey = (key: string) =>
  /^(body|requestbody|responsebody|payload|data|message|filepath|binarypath)$/.test(normalizedKey(key));

type LogInput = Omit<ErrorLogEntry, 'id' | 'timestamp'> & { timestamp?: number };

/** 日志在入库时脱敏，展示和复制只能接触处理后的副本。 */
export function sanitizeErrorLogEntry(entry: LogInput): LogInput {
  const secrets = new Set<string>();
  const seen = new WeakSet<object>();

  function remember(value: unknown, visited = new WeakSet<object>()): void {
    if (typeof value === 'string') {
      if (value) secrets.add(value);
    } else if (value && typeof value === 'object' && !visited.has(value)) {
      visited.add(value);
      Object.values(value).forEach((item) => remember(item, visited));
    }
  }

  function redactUrl(raw: string): string {
    try {
      const absolute = /^[a-z][a-z\d+.-]*:\/\//i.test(raw);
      const url = new URL(raw, 'https://redaction.invalid');
      if (!url.username && !url.password && !url.search && !url.hash) return raw;
      remember(decodeURIComponent(url.username));
      remember(decodeURIComponent(url.password));
      url.username = '';
      url.password = '';
      const params = new URLSearchParams();
      url.searchParams.forEach((value, key) => {
        remember(value);
        params.append(key, REDACTED);
      });
      url.search = params.toString();
      if (url.hash) {
        remember(decodeURIComponent(url.hash.slice(1)));
        url.hash = REDACTED;
      }
      return absolute ? url.href : `${url.pathname}${url.search}${url.hash}`;
    } catch {
      // 格式不正确时也不保留 URL 凭据、查询串和 fragment。
      return raw.replace(/(\/\/)[^/\s]*@/, '$1').replace(/[?#].*$/, `?${REDACTED}`);
    }
  }

  function redactText(text: string): string {
    const prefix = text.startsWith('cause: ') ? 'cause: ' : '';
    const json = text.slice(prefix.length).trim();
    if (json.startsWith('{') || json.startsWith('[')) {
      try {
        return prefix + JSON.stringify(redactValue(JSON.parse(json)), null, 2);
      } catch {
        // 普通诊断文本继续按 URL 和认证字段处理。
      }
    }
    return text
      .replace(/\b(?:https?|wss?):\/\/[^\s<>]+/gi, (raw) => {
        const suffix = raw.match(/["'`),.;]+$/)?.[0] ?? '';
        return redactUrl(suffix ? raw.slice(0, -suffix.length) : raw) + suffix;
      })
      .replace(/(\b(?:authorization|proxy[-_ ]?authorization|cookie|set[-_ ]?cookie)\s*[:=]\s*)[^\r\n]+/gi,
        (_match, label: string) => `${label}${REDACTED}`)
      .replace(/\b(Bearer|Basic)\s+[a-z\d._~+/=-]+/gi, `$1 ${REDACTED}`)
      .replace(/(["']?)([\w.-]+)\1(\s*[:=]\s*)("[^"\n]*"|'[^'\n]*'|[^\s,;&}\]]+)/g,
        (match, quote: string, key: string, separator: string, value: string) => {
          if (!isSecretKey(key) || value.startsWith(REDACTED.slice(0, -1))) return match;
          remember(value.replace(/^["']|["']$/g, ''));
          return `${quote}${key}${quote}${separator}${REDACTED}`;
        });
  }

  function redactValue(value: unknown, key = ''): unknown {
    if (isSecretKey(key) || isPayloadKey(key)) {
      remember(value);
      return REDACTED;
    }
    if (typeof value === 'string') {
      return normalizedKey(key).endsWith('url') ? redactUrl(value) : redactText(value);
    }
    if (typeof value === 'bigint') return String(value);
    if (typeof value === 'function') return '[Function]';
    if (!value || typeof value !== 'object') return value;
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    if (normalizedKey(key).endsWith('headers')) {
      remember(value);
      return Object.fromEntries(Object.keys(value).map((name) => [name, REDACTED]));
    }
    if (Array.isArray(value)) return value.map((item) => redactValue(item));
    return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, redactValue(item, name)]));
  }

  const sanitized: LogInput = {
    ...entry,
    context: entry.context ? redactValue(entry.context) as Record<string, unknown> : undefined,
    message: redactText(entry.message),
    name: entry.name ? redactText(entry.name) : undefined,
    detail: entry.detail ? redactText(entry.detail) : undefined,
    stack: entry.stack ? redactText(entry.stack) : undefined,
  };

  // 异常信息有时重复引用上下文中的值；同时清理这些无字段名的副本。
  const values = [...secrets].filter((value) => value !== REDACTED)
    .sort((a, b) => b.length - a.length);
  const secretPattern = values.length > 0
    ? new RegExp(
        ['\\[REDACTED\\]', '%5BREDACTED%5D', ...values.map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))].join('|'),
        'g'
      )
    : null;
  function removeKnownSecrets(value: unknown): unknown {
    if (typeof value === 'string') {
      return secretPattern ? value.replace(secretPattern, (match) =>
        match === '%5BREDACTED%5D' ? match : REDACTED
      ) : value;
    }
    if (Array.isArray(value)) return value.map(removeKnownSecrets);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, removeKnownSecrets(item)]));
    }
    return value;
  }
  return { ...removeKnownSecrets(sanitized) as LogInput, source: entry.source, timestamp: entry.timestamp };
}
