import { beforeEach, describe, expect, it } from 'vitest';
import { useErrorLogStore } from './errorLogStore';
import { useSettingsStore } from './settingsStore';

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
});
