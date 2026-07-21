import type { BodyFormField, BodyType, HttpMethod, KeyValueField, RawType } from '../types';

const EMPTY_KV: KeyValueField = { key: '', value: '', description: '', enabled: true };
const EMPTY_FORM_FIELD: BodyFormField = {
  key: '',
  value: '',
  description: '',
  enabled: true,
  type: 'text',
};
const METHODS = new Set<HttpMethod>([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
]);

export interface ParsedCurlCommand {
  method: HttpMethod;
  url: string;
  headers: KeyValueField[];
  bodyType: BodyType;
  bodyFormFields: BodyFormField[];
  body: string;
  rawType: RawType;
  binaryPath: string;
}

/** 按 cURL 常见 shell 写法分词；仅处理引号和反斜杠，不执行任何 shell 内容。 */
export function tokenizeCurlCommand(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: "'" | '"' | null = null;
  let escaping = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (escaping) {
      if (char !== '\n' && char !== '\r') current += char;
      escaping = false;
      continue;
    }
    if (quote === "'") {
      if (char === "'") quote = null;
      else current += char;
      continue;
    }
    if (quote === '"') {
      if (char === '"') quote = null;
      else if (char === '\\') escaping = true;
      else current += char;
      continue;
    }
    if (char === '\\') {
      escaping = true;
    } else if (char === "'" || char === '"') {
      quote = char;
    } else if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }

  if (escaping) current += '\\';
  if (current) tokens.push(current);
  return tokens;
}

function splitHeader(value: string): KeyValueField | null {
  const separator = value.indexOf(':');
  if (separator < 1) return null;
  return {
    ...EMPTY_KV,
    key: value.slice(0, separator).trim(),
    value: value.slice(separator + 1).trim(),
  };
}

function rawTypeFromHeaders(headers: KeyValueField[]): RawType {
  const contentType =
    headers.find((header) => header.key.toLowerCase() === 'content-type')?.value.toLowerCase() ??
    '';
  if (contentType.includes('json')) return 'json';
  if (contentType.includes('xml')) return 'xml';
  return 'text';
}

function parseFormField(value: string): BodyFormField | null {
  const separator = value.indexOf('=');
  if (separator < 1) return null;
  const key = value.slice(0, separator).trim();
  const data = value.slice(separator + 1);
  if (!key) return null;

  if (data.startsWith('@')) {
    const path = data.slice(1);
    const name = path.replace(/^.*[/\\]/, '');
    return {
      ...EMPTY_FORM_FIELD,
      key,
      value: name,
      type: 'file',
      files: path ? [{ path, name }] : [],
    };
  }

  return { ...EMPTY_FORM_FIELD, key, value: data };
}

function readFlagValue(
  token: string,
  tokens: string[],
  index: number,
  shortFlag: string,
  longFlag: string
): [string | null, number] | null {
  if (token === shortFlag || token === longFlag) return [tokens[index + 1] ?? null, 1];
  const longPrefix = longFlag + '=';
  if (token.startsWith(longPrefix)) return [token.slice(longPrefix.length), 0];
  return null;
}

function readDataFlag(token: string, tokens: string[], index: number) {
  const flags = ['--data-binary', '--data-raw', '--data', '-d'] as const;
  for (const flag of flags) {
    if (token === flag) return { flag, value: tokens[index + 1] ?? '', consumed: 1 };
    const prefix = flag + '=';
    if (token.startsWith(prefix)) {
      return { flag, value: token.slice(prefix.length), consumed: 0 };
    }
  }
  return null;
}

export function parseCurlCommand(input: string): ParsedCurlCommand | null {
  const tokens = tokenizeCurlCommand(input);
  if (tokens[0]?.toLowerCase() !== 'curl') return null;

  let method: HttpMethod | null = null;
  const headers: KeyValueField[] = [];
  const formFields: BodyFormField[] = [];
  let data = '';
  let binaryPath = '';
  let hasData = false;
  let url = '';

  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    const request = readFlagValue(token, tokens, index, '-X', '--request');
    const header = readFlagValue(token, tokens, index, '-H', '--header');
    const form = readFlagValue(token, tokens, index, '-F', '--form');
    const dataFlag = readDataFlag(token, tokens, index);

    if (request) {
      const value = request[0]?.toUpperCase() as HttpMethod;
      if (METHODS.has(value)) method = value;
      index += request[1];
      continue;
    }
    if (header) {
      if (header[0]) {
        const parsed = splitHeader(header[0]);
        if (parsed) headers.push(parsed);
      }
      index += header[1];
      continue;
    }
    if (form) {
      if (form[0]) {
        const parsed = parseFormField(form[0]);
        if (parsed) formFields.push(parsed);
      }
      index += form[1];
      continue;
    }
    if (dataFlag) {
      hasData = true;
      if (dataFlag.flag === '--data-binary' && dataFlag.value.startsWith('@')) {
        binaryPath = dataFlag.value.slice(1);
      } else {
        data = dataFlag.value;
      }
      index += dataFlag.consumed;
      continue;
    }
    if (/^https?:\/\//i.test(token)) url = token;
  }

  if (!url) return null;

  const bodyType: BodyType =
    formFields.length > 0 ? 'form-data' : binaryPath ? 'binary' : hasData ? 'raw' : 'form-data';

  return {
    method: method ?? (formFields.length > 0 || hasData ? 'POST' : 'GET'),
    url,
    headers: [...headers, { ...EMPTY_KV }],
    bodyType,
    bodyFormFields:
      formFields.length > 0 ? [...formFields, { ...EMPTY_FORM_FIELD }] : [{ ...EMPTY_FORM_FIELD }],
    body: data,
    rawType: rawTypeFromHeaders(headers),
    binaryPath,
  };
}
