import type { BodyFormField } from '../types';
import type { ApixExportedEndpoint } from './projectImportExport';

export const EXPORT_REDACTED_VALUE = '[已脱敏]';

const SENSITIVE_NORMALIZED_NAMES = new Set([
  'auth',
  'authentication',
  'authorization',
  'proxyauthorization',
  'cookie',
  'setcookie',
  'token',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'key',
  'apikey',
  'xapikey',
  'accesskey',
  'secret',
  'clientsecret',
  'secretkey',
  'privatekey',
  'signature',
  'sig',
  'passphrase',
  'password',
  'passwd',
  'pwd',
  'session',
  'sessionid',
  'credential',
  'credentials',
]);

const SENSITIVE_NAME_PARTS = new Set([
  'authorization',
  'cookie',
  'token',
  'secret',
  'password',
  'passwd',
  'pwd',
  'credential',
  'credentials',
  'signature',
  'sig',
  'passphrase',
]);

/** 识别常见敏感字段，兼容大小写、连字符、下划线及 camelCase 变体。 */
export function isSensitiveExportFieldName(name: string): boolean {
  const withCamelBoundaries = name.replace(/([a-z\d])([A-Z])/g, '$1 $2');
  const parts = withCamelBoundaries
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const normalized = parts.join('');
  if (SENSITIVE_NORMALIZED_NAMES.has(normalized)) return true;
  return parts.length > 1 && parts.some((part) => SENSITIVE_NAME_PARTS.has(part));
}

function fileNameOnly(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return '';
  return trimmed.split(/[\\/]/).filter(Boolean).pop() ?? '';
}

function sanitizeSearchParams(params: URLSearchParams): URLSearchParams {
  const safe = new URLSearchParams();
  params.forEach((value, key) => {
    safe.append(key, isSensitiveExportFieldName(key) ? EXPORT_REDACTED_VALUE : value);
  });
  return safe;
}

function sanitizeRelativeOrInvalidUrl(raw: string): string {
  const hashAt = raw.indexOf('#');
  const withoutHash = hashAt >= 0 ? raw.slice(0, hashAt) : raw;
  const queryAt = withoutHash.indexOf('?');
  let base = queryAt >= 0 ? withoutHash.slice(0, queryAt) : withoutHash;
  const query = queryAt >= 0 ? withoutHash.slice(queryAt + 1) : '';
  let changed = hashAt >= 0;

  const authorityMatch = base.match(/^((?:[a-z][a-z\d+.-]*:)?\/\/)([^/]*)(.*)$/i);
  if (authorityMatch) {
    const [, prefix, authority, rest] = authorityMatch;
    const userinfoEnd = authority.lastIndexOf('@');
    if (userinfoEnd >= 0) {
      const userinfo = authority.slice(0, userinfoEnd);
      const host = authority.slice(userinfoEnd + 1);
      base = `${prefix}${userinfo.includes(':') ? `${EXPORT_REDACTED_VALUE}:${EXPORT_REDACTED_VALUE}` : EXPORT_REDACTED_VALUE}@${host}${rest}`;
      changed = true;
    }
  }

  if (queryAt < 0) return changed ? base : raw;
  const queryParams = new URLSearchParams(query);
  const hasSensitiveQuery = [...queryParams.keys()].some(isSensitiveExportFieldName);
  if (!hasSensitiveQuery) return changed ? `${base}?${query}` : raw;
  const safeQuery = sanitizeSearchParams(queryParams).toString();
  return `${base}?${safeQuery}`;
}

export function sanitizeExportUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return raw;
  try {
    const url = new URL(trimmed);
    const hasSensitiveQuery = [...url.searchParams.keys()].some(isSensitiveExportFieldName);
    const needsChange = !!url.username || !!url.password || !!url.hash || hasSensitiveQuery;
    if (!needsChange) return trimmed;
    if (url.username) url.username = EXPORT_REDACTED_VALUE;
    if (url.password) url.password = EXPORT_REDACTED_VALUE;
    if (hasSensitiveQuery) url.search = sanitizeSearchParams(url.searchParams).toString();
    url.hash = '';
    return url.toString();
  } catch {
    return sanitizeRelativeOrInvalidUrl(raw);
  }
}

function parseJsonObjectArray(json: string | null | undefined): Record<string, unknown>[] | null {
  if (json == null || !String(json).trim()) return [];
  try {
    const value = JSON.parse(json) as unknown;
    if (!Array.isArray(value)) return null;
    return value.filter(
      (item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item)
    );
  } catch {
    return null;
  }
}

function sanitizeKeyValueJson(json: string | null | undefined): string | null | undefined {
  const rows = parseJsonObjectArray(json);
  if (rows == null) return json;
  return JSON.stringify(
    rows.map((row) => {
      const key = typeof row.key === 'string' ? row.key : '';
      return {
        ...row,
        ...(isSensitiveExportFieldName(key) ? { value: EXPORT_REDACTED_VALUE } : {}),
      };
    })
  );
}

function sanitizeJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeJsonValue);
  if (!value || typeof value !== 'object') return value;
  const safe: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    safe[key] = isSensitiveExportFieldName(key) ? EXPORT_REDACTED_VALUE : sanitizeJsonValue(child);
  }
  return safe;
}

function sanitizeJsonRawBody(raw: string): { body: string; omittedForSafety: boolean } {
  if (!raw.trim()) return { body: raw, omittedForSafety: false };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return { body: '', omittedForSafety: true };
    }
    return { body: JSON.stringify(sanitizeJsonValue(parsed), null, 2), omittedForSafety: false };
  } catch {
    return { body: '', omittedForSafety: true };
  }
}

function sanitizeBodyFormField(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const field = value as Partial<BodyFormField>;
  const key = typeof field.key === 'string' ? field.key : '';
  const isFile = field.type === 'file';
  const safeFiles = Array.isArray(field.files)
    ? field.files.map((file) => ({
        ...file,
        name: fileNameOnly(typeof file.name === 'string' ? file.name : ''),
        path: fileNameOnly(typeof file.path === 'string' ? file.path : ''),
      }))
    : field.files;
  return {
    ...field,
    ...(isFile
      ? {
          value: fileNameOnly(typeof field.value === 'string' ? field.value : ''),
          filePath: typeof field.filePath === 'string' ? fileNameOnly(field.filePath) : field.filePath,
          files: safeFiles,
        }
      : isSensitiveExportFieldName(key)
        ? { value: EXPORT_REDACTED_VALUE }
        : {}),
  };
}

function sanitizeBodyJson(body: string | null | undefined): string | null | undefined {
  if (body == null || !String(body).trim()) return body;
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return body;
    const rawBody = typeof parsed.body === 'string' ? parsed.body : '';
    const supportedBodyTypes = new Set(['raw', 'form-data', 'x-www-form-urlencoded', 'binary']);
    const requestedBodyType = typeof parsed.bodyType === 'string' ? parsed.bodyType : 'raw';
    const bodyType = supportedBodyTypes.has(requestedBodyType) ? requestedBodyType : 'raw';
    const rawType =
      parsed.rawType === 'json' || parsed.rawType === 'text' || parsed.rawType === 'xml'
        ? parsed.rawType
        : 'json';
    const isUnknownBodyType = !supportedBodyTypes.has(requestedBodyType);
    const isRaw = bodyType === 'raw';
    const sanitizedRaw =
      isRaw && !isUnknownBodyType && rawType === 'json'
        ? sanitizeJsonRawBody(rawBody)
        : {
            body: isRaw && rawBody.trim() ? '' : rawBody,
            omittedForSafety: isRaw && (!!rawBody.trim() || isUnknownBodyType),
          };
    return JSON.stringify({
      ...parsed,
      bodyType,
      rawType: isUnknownBodyType ? 'text' : rawType,
      body: isRaw ? sanitizedRaw.body : '',
      ...(sanitizedRaw.omittedForSafety ? { exportBodyOmittedForSafety: true } : {}),
      bodyFormFields: Array.isArray(parsed.bodyFormFields)
        ? parsed.bodyFormFields.map(sanitizeBodyFormField)
        : parsed.bodyFormFields,
      binaryPath:
        typeof parsed.binaryPath === 'string' ? fileNameOnly(parsed.binaryPath) : parsed.binaryPath,
    });
  } catch {
    return body;
  }
}

function endpointNameWasGeneratedFromUrl(name: string, url: string): boolean {
  let generated: string;
  try {
    const parsed = new URL(url);
    generated = parsed.pathname.split('/').filter(Boolean).pop() ?? '未命名接口';
  } catch {
    generated = url.trim() ? url.trim().slice(0, 40) : '未命名接口';
  }
  return name === generated;
}

/**
 * 为 HTML 文档生成独立脱敏副本；不会修改原始项目导出对象或数据库内容。
 */
export function sanitizeEndpointForApiDoc(ep: ApixExportedEndpoint): ApixExportedEndpoint {
  return {
    ...ep,
    name: endpointNameWasGeneratedFromUrl(ep.name, ep.url) ? sanitizeExportUrl(ep.name) : ep.name,
    url: sanitizeExportUrl(ep.url),
    headers: sanitizeKeyValueJson(ep.headers) ?? '[]',
    params: sanitizeKeyValueJson(ep.params) ?? null,
    body: sanitizeBodyJson(ep.body) ?? null,
    response_headers: null,
    response_body: null,
  };
}
