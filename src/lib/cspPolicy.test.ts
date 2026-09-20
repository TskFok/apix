import { describe, it, expect } from 'vitest';
import { normalizeCspSources } from './cspPolicy';

describe('normalizeCspSources', () => {
  it('把空格分隔字符串拆成 token', () => {
    expect(normalizeCspSources("'self' data: blob:")).toEqual([
      "'self'",
      'data:',
      'blob:',
    ]);
  });

  it('把字符串数组拆成 token，并展开数组元素内的空格', () => {
    expect(normalizeCspSources(["'self'", 'ipc: http://ipc.localhost'])).toEqual([
      "'self'",
      'ipc:',
      'http://ipc.localhost',
    ]);
  });

  it('忽略多余空白并丢弃空 token', () => {
    expect(normalizeCspSources("  'self'   'none'  ")).toEqual(["'self'", "'none'"]);
  });

  it('对 null、undefined 和非字符串输入返回空数组', () => {
    expect(normalizeCspSources(null)).toEqual([]);
    expect(normalizeCspSources(undefined)).toEqual([]);
    expect(normalizeCspSources(1)).toEqual([]);
    expect(normalizeCspSources({ src: "'self'" })).toEqual([]);
  });
});
