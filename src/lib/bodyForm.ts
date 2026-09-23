import type { BodyFormField } from '../types';

export const EMPTY_BODY_FORM_FIELD: BodyFormField = {
  key: '',
  value: '',
  description: '',
  enabled: true,
  type: 'text',
};

function getUrlEncodedPart(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('?')) return trimmed.slice(1);
  try {
    const url = new URL(trimmed);
    if (url.search) return url.search.slice(1);
  } catch {
    // 普通 a=1&b=1 输入不需要按 URL 解析。
  }
  return trimmed;
}

export function parseBodyFormInput(input: string): BodyFormField[] {
  const trimmed = input.trim();
  if (!trimmed) return [];

  // 完整 URL 继续按查询串导入；冒号行中的值则不做 URL 解码。
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)) {
    const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const matches = lines.map((line) => line.match(/^([^:=&?]+):\s*(.*)$/));
    if (matches.every((match) => match !== null)) {
      return matches.map((match) => ({
        ...EMPTY_BODY_FORM_FIELD,
        key: match[1].trim(),
        value: match[2].trim(),
      }));
    }
  }

  const raw = getUrlEncodedPart(input);
  if (!raw) return [];

  const fields: BodyFormField[] = [];
  const params = new URLSearchParams(raw);
  params.forEach((value, key) => {
    const normalizedKey = key.trim();
    if (!normalizedKey) return;
    fields.push({
      ...EMPTY_BODY_FORM_FIELD,
      key: normalizedKey,
      value,
    });
  });
  return fields;
}
