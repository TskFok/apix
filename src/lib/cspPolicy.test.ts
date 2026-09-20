import { describe, it, expect } from 'vitest';
import tauriConf from '../../src-tauri/tauri.conf.json';
import { normalizeCspSources } from './cspPolicy';

const PRODUCTION_CSP: Record<string, string> = {
  'default-src': "'self'",
  'script-src': "'self'",
  'style-src': "'self' 'unsafe-inline'",
  'img-src': "'self' data: blob:",
  'font-src': "'self'",
  'connect-src': 'ipc: http://ipc.localhost https://ipc.localhost',
  'frame-src': "'self'",
  'object-src': "'none'",
  'base-uri': "'self'",
  'form-action': "'none'",
  'frame-ancestors': "'none'",
};

const DEV_CSP: Record<string, string> = {
  ...PRODUCTION_CSP,
  'script-src': "'self' 'unsafe-inline' 'unsafe-eval'",
  'connect-src':
    'ipc: http://ipc.localhost https://ipc.localhost http://localhost:1422 ws://localhost:1422 ws://localhost:1421 http://127.0.0.1:1422 ws://127.0.0.1:1422 ws://127.0.0.1:1421',
};

function loadTauriSecurity(): {
  csp: unknown;
  devCsp?: unknown;
  freezePrototype?: unknown;
  dangerousDisableAssetCspModification?: unknown;
} {
  return tauriConf.app.security as {
    csp: unknown;
    devCsp?: unknown;
    freezePrototype?: unknown;
    dangerousDisableAssetCspModification?: unknown;
  };
}

function expectDirectiveObject(value: unknown, expected: Record<string, string>) {
  expect(value).not.toBeNull();
  expect(typeof value).toBe('object');
  expect(Array.isArray(value)).toBe(false);
  const directives = value as Record<string, unknown>;
  expect(Object.keys(directives).sort()).toEqual(Object.keys(expected).sort());
  for (const [key, raw] of Object.entries(directives)) {
    expect(typeof raw).toBe('string');
    expect(normalizeCspSources(raw)).toEqual(normalizeCspSources(expected[key]));
  }
}

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

describe('tauri CSP 配置', () => {
  it('生产 csp 为收紧的指令对象', () => {
    const security = loadTauriSecurity();
    expectDirectiveObject(security.csp, PRODUCTION_CSP);
    expect(normalizeCspSources((security.csp as Record<string, string>)['script-src'])).not.toContain(
      "'unsafe-inline'"
    );
    expect(normalizeCspSources((security.csp as Record<string, string>)['script-src'])).not.toContain(
      "'unsafe-eval'"
    );
    expect(
      normalizeCspSources((security.csp as Record<string, string>)['frame-src']).some(
        (token) => token.startsWith('http:') || token.startsWith('https:')
      )
    ).toBe(false);
  });

  it('devCsp 仅放宽脚本与本机 HMR 连接', () => {
    const security = loadTauriSecurity();
    expectDirectiveObject(security.devCsp, DEV_CSP);
    const connectSrc = normalizeCspSources(
      (security.devCsp as Record<string, string>)['connect-src']
    );
    for (const token of [
      'http://localhost:1422',
      'ws://localhost:1422',
      'ws://localhost:1421',
      'http://127.0.0.1:1422',
      'ws://127.0.0.1:1422',
      'ws://127.0.0.1:1421',
    ]) {
      expect(connectSrc).toContain(token);
    }
  });

  it('不关闭 Tauri CSP 改写，也不额外开启其他安全开关', () => {
    const security = loadTauriSecurity();
    expect(security.dangerousDisableAssetCspModification).toBeUndefined();
    expect(security.freezePrototype).toBeUndefined();
  });
});
