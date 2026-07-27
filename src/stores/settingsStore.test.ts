import { describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore } from './settingsStore';
import { IDLE_TIMEOUT_OPTIONS } from './settingsStore';

describe('settingsStore', () => {
  beforeEach(() => {
    useSettingsStore.setState({ idleTimeoutMs: 5 * 60_000, collectErrorLogs: false });
  });

  it('默认空闲超时为 5 分钟', () => {
    useSettingsStore.setState({ idleTimeoutMs: 5 * 60_000 });
    expect(useSettingsStore.getState().idleTimeoutMs).toBe(5 * 60_000);
  });

  it('setIdleTimeoutMs 可更新空闲超时', () => {
    useSettingsStore.getState().setIdleTimeoutMs(60_000);
    expect(useSettingsStore.getState().idleTimeoutMs).toBe(60_000);
  });

  it('可设置为 0 关闭空闲超时', () => {
    useSettingsStore.getState().setIdleTimeoutMs(0);
    expect(useSettingsStore.getState().idleTimeoutMs).toBe(0);
  });

  it('IDLE_TIMEOUT_OPTIONS 包含关闭和多个时间选项', () => {
    const values = IDLE_TIMEOUT_OPTIONS.map((o) => o.value);
    expect(values).toContain(0);
    expect(values).toContain(60_000);
    expect(values).toContain(5 * 60_000);
    expect(values).toContain(10 * 60_000);
    expect(values).toContain(30 * 60_000);
  });

  it('默认不收集报错日志，可通过 setCollectErrorLogs 修改', () => {
    expect(useSettingsStore.getState().collectErrorLogs).toBe(false);
    useSettingsStore.getState().setCollectErrorLogs(true);
    expect(useSettingsStore.getState().collectErrorLogs).toBe(true);
  });

  it('默认校验证书，并允许更新忽略证书校验设置', () => {
    const state = useSettingsStore.getState();

    expect(state.ignoreTlsCertificateErrors).toBe(false);

    state.setIgnoreTlsCertificateErrors(true);

    expect(useSettingsStore.getState().ignoreTlsCertificateErrors).toBe(true);
  });
});
