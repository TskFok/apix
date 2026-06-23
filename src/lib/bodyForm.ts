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

export function parseUrlEncodedBodyInput(input: string): BodyFormField[] {
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
