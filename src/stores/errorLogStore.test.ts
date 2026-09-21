import { beforeEach, describe, expect, it } from 'vitest';
import { useErrorLogStore } from './errorLogStore';
import { useSettingsStore } from './settingsStore';
import { appendErrorLog } from '../lib/errorLog';

describe('errorLogStore', () => {
  beforeEach(() => {
    useErrorLogStore.setState({ entries: [] });
    useSettingsStore.setState({ collectErrorLogs: false });
  });

  it('开关关闭时不记录日志', () => {
    useErrorLogStore.getState().addEntry({ source: 'http', message: 'x' });
    expect(useErrorLogStore.getState().entries).toHaveLength(0);
  });

  it('开关开启时记录日志，并保留明细字段', () => {
    useSettingsStore.getState().setCollectErrorLogs(true);
    useErrorLogStore.getState().addEntry({
      source: 'sse',
      message: 'failed',
      name: 'NetworkError',
      detail: 'details',
      stack: 'stack line',
      context: { url: 'https://example.com/stream' },
    });

    const [first] = useErrorLogStore.getState().entries;
    expect(first).toBeTruthy();
    expect(first.source).toBe('sse');
    expect(first.name).toBe('NetworkError');
    expect(first.detail).toBe('details');
    expect(first.stack).toContain('stack');
    expect(first.context).toEqual({ url: 'https://example.com/stream' });
    expect(first.id).toBeTruthy();
    expect(typeof first.timestamp).toBe('number');
  });

  it('clearEntries 可清空日志', () => {
    useSettingsStore.getState().setCollectErrorLogs(true);
    useErrorLogStore.getState().addEntry({ source: 'unknown', message: 'a' });
    expect(useErrorLogStore.getState().entries).toHaveLength(1);
    useErrorLogStore.getState().clearEntries();
    expect(useErrorLogStore.getState().entries).toHaveLength(0);
  });

  it('请求凭据在进入日志存储前脱敏，且不会修改原始上下文', () => {
    useSettingsStore.getState().setCollectErrorLogs(true);
    const context = {
      method: 'POST',
      resolvedUrl: 'https://alice:private-password@example.com/api?token=query-secret&custom=custom-secret#fragment-secret',
      headers: { Authorization: 'Bearer auth-secret', Cookie: 'session=cookie-secret', 'X-Custom': 'custom-header-secret' },
      body: { password: 'body-secret' },
    };
    const original = JSON.stringify(context);
    appendErrorLog('http', new Error(`Failed for ${context.resolvedUrl}; Bearer auth-secret`), context);

    const [entry] = useErrorLogStore.getState().entries;
    const serialized = JSON.stringify(entry);
    for (const secret of ['alice', 'private-password', 'query-secret', 'custom-secret', 'fragment-secret', 'auth-secret', 'cookie-secret', 'custom-header-secret', 'body-secret']) {
      expect(serialized).not.toContain(secret);
    }
    expect(serialized).toContain('example.com/api');
    expect(entry.context?.method).toBe('POST');
    expect(entry.context?.headers).toEqual({ Authorization: '[REDACTED]', Cookie: '[REDACTED]', 'X-Custom': '[REDACTED]' });
    expect(JSON.stringify(context)).toBe(original);
  });

  it('嵌套异常 cause、堆栈和直接入库的认证值都会脱敏', () => {
    useSettingsStore.getState().setCollectErrorLogs(true);
    const error = Object.assign(new Error('network failed'), {
      cause: { request: { headers: { 'X-Api-Key': 'cause-api-key' }, auth: { password: 'cause-password' } } },
    });
    error.stack = 'Error: request failed https://example.com/api?access_token=stack-secret';
    appendErrorLog('http', error);
    useErrorLogStore.getState().addEntry({
      source: 'promise',
      message: 'Authorization: Bearer inline-secret\nCookie: session=inline-cookie; theme=dark',
      context: { nested: { client_secret: 'nested-secret', pwd: 'short-password-secret', status: 503 } },
    });
    const serialized = JSON.stringify(useErrorLogStore.getState().entries);
    for (const secret of ['cause-api-key', 'cause-password', 'stack-secret', 'inline-secret', 'inline-cookie', 'nested-secret', 'short-password-secret']) {
      expect(serialized).not.toContain(secret);
    }
    expect(serialized).toContain('503');
  });

  it('WebSocket 发送失败只保存动作信息，不记录原始消息载荷', () => {
    useSettingsStore.getState().setCollectErrorLogs(true);
    const message = '{"username":"private-user","password":"private-pass","data":"private-message"}';
    appendErrorLog('ws', new Error('send failed'), { action: 'send', message });
    const [entry] = useErrorLogStore.getState().entries;
    expect(entry.context?.action).toBe('send');
    expect(entry.context?.message).toBe('[REDACTED]');
    expect(JSON.stringify(entry)).not.toContain('private-');
  });

  it('循环异常对象仍能记录为可复制的脱敏日志', () => {
    useSettingsStore.getState().setCollectErrorLogs(true);
    const context: Record<string, unknown> = { api_key: 'cycle-secret', retry: 1 };
    context.self = context;
    appendErrorLog('unknown', { nested: context }, context);
    const serialized = JSON.stringify(useErrorLogStore.getState().entries);
    expect(serialized).not.toContain('cycle-secret');
    expect(serialized).toContain('[Circular]');
    expect(serialized).toContain('retry');
  });

  it('独立异常 URL 中的合法单引号不会截断凭据脱敏', () => {
    useSettingsStore.getState().setCollectErrorLogs(true);
    useErrorLogStore.getState().addEntry({
      source: 'runtime',
      message: "request failed https://alice:pa'ss@example.com/api?custom=abcde",
      stack: "at https://example.com/api?token=it'contains'quotes",
    });
    const serialized = JSON.stringify(useErrorLogStore.getState().entries);
    for (const secret of ['alice', "pa'ss", 'abcde', "it'contains'quotes"]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it('已识别的短凭据和消息也会从异常文本副本中移除', () => {
    useSettingsStore.getState().setCollectErrorLogs(true);
    appendErrorLog('http', new Error('Request failed with key 123'), {
      headers: { 'X-API-Key': '123' },
    });
    appendErrorLog('ws', new Error('Could not send abc'), { action: 'send', message: 'abc' });
    const entries = useErrorLogStore.getState().entries;
    expect(entries[0].message).toBe('Could not send [REDACTED]');
    expect(entries[1].message).toBe('Request failed with key [REDACTED]');
    expect(entries[0].source).toBe('ws');
  });
});
