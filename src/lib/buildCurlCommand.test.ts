import { describe, it, expect } from 'vitest';
import {
  quoteForShSingle,
  buildHttpCurlCommand,
  buildSseCurlCommand,
  buildWsCurlHint,
  buildCurlCommandFromRequest,
} from './buildCurlCommand';
import type { ResolvedForSend } from './projectMerge';

function r(partial: Partial<ResolvedForSend> = {}): ResolvedForSend {
  return {
    url: 'https://api.example.com/v1',
    headers: {},
    queryParams: {},
    body: '',
    bodyFormFields: [],
    binaryPath: '',
    ...partial,
  };
}

describe('quoteForShSingle', () => {
  it('包裹普通字符串', () => {
    expect(quoteForShSingle('hello')).toBe("'hello'");
  });

  it('转义内部单引号', () => {
    expect(quoteForShSingle("a'b")).toBe("'a'\\''b'");
  });
});

describe('buildHttpCurlCommand', () => {
  it('GET 无 -X，带 query', () => {
    const cmd = buildHttpCurlCommand({
      method: 'GET',
      resolved: r({ url: 'https://x.com/a', queryParams: { q: '1' } }),
      bodyType: 'raw',
      rawType: 'json',
    });
    expect(cmd).toBe("curl 'https://x.com/a?q=1'");
    expect(cmd).not.toContain('-X');
  });

  it('HEAD 含 -X HEAD', () => {
    const cmd = buildHttpCurlCommand({
      method: 'HEAD',
      resolved: r(),
      bodyType: 'raw',
      rawType: 'json',
    });
    expect(cmd).toContain('-X HEAD');
  });

  it('POST raw JSON 与默认 Content-Type', () => {
    const cmd = buildHttpCurlCommand({
      method: 'POST',
      resolved: r({ body: '{"a":1}' }),
      bodyType: 'raw',
      rawType: 'json',
    });
    expect(cmd).toContain('-X POST');
    expect(cmd).toContain('Content-Type: application/json');
    expect(cmd).toContain('--data-raw');
    expect(cmd).toContain('{"a":1}');
  });

  it('已有 Content-Type 时不重复', () => {
    const cmd = buildHttpCurlCommand({
      method: 'POST',
      resolved: r({
        body: '{}',
        headers: { 'Content-Type': 'application/vnd.api+json' },
      }),
      bodyType: 'raw',
      rawType: 'json',
    });
    expect(cmd.match(/Content-Type/g)?.length).toBe(1);
  });

  it('x-www-form-urlencoded', () => {
    const cmd = buildHttpCurlCommand({
      method: 'POST',
      resolved: r({
        bodyFormFields: [
          { key: 'a', value: '1', description: '', enabled: true },
          { key: 'b', value: '2', description: '', enabled: true },
        ],
      }),
      bodyType: 'x-www-form-urlencoded',
      rawType: 'json',
    });
    expect(cmd).toContain('application/x-www-form-urlencoded');
    expect(cmd).toContain('a=1&b=2');
  });

  it('form-data 文本与文件', () => {
    const cmd = buildHttpCurlCommand({
      method: 'POST',
      resolved: r({
        bodyFormFields: [
          { key: 'name', value: 'x', description: '', enabled: true, type: 'text' },
          {
            key: 'f',
            value: 'a.png',
            description: '',
            enabled: true,
            type: 'file',
            filePath: '/tmp/a.png',
          },
        ],
      }),
      bodyType: 'form-data',
      rawType: 'json',
    });
    expect(cmd).toContain("-F 'name=x'");
    expect(cmd).toContain("-F 'f=@/tmp/a.png'");
  });

  it('自定义请求头', () => {
    const cmd = buildHttpCurlCommand({
      method: 'GET',
      resolved: r({ headers: { Authorization: 'Bearer t' } }),
      bodyType: 'raw',
      rawType: 'json',
    });
    expect(cmd).toContain("Authorization: Bearer t");
  });
});

describe('buildSseCurlCommand', () => {
  it('含 -N 与默认 Accept', () => {
    const cmd = buildSseCurlCommand(r({ url: 'https://e.com/s' }));
    expect(cmd.startsWith('curl -N')).toBe(true);
    expect(cmd).toContain('Accept: text/event-stream');
    expect(cmd.endsWith("'https://e.com/s'")).toBe(true);
  });
});

describe('buildWsCurlHint', () => {
  it('多行注释与 wscat', () => {
    const cmd = buildWsCurlHint(r({ url: 'ws://h:8080/ws' }));
    expect(cmd).toContain('WebSocket');
    expect(cmd).toContain('wscat -c');
    expect(cmd).toContain('ws://h:8080/ws');
  });
});

describe('buildCurlCommandFromRequest', () => {
  it('按协议分发', () => {
    const base = { method: 'GET' as const, resolved: r(), bodyType: 'raw' as const, rawType: 'json' as const };
    expect(buildCurlCommandFromRequest({ ...base, protocol: 'http' })).toContain('curl');
    expect(buildCurlCommandFromRequest({ ...base, protocol: 'sse' })).toContain('-N');
    expect(buildCurlCommandFromRequest({ ...base, protocol: 'ws' })).toContain('wscat');
  });
});
