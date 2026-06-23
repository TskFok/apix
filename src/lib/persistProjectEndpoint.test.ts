import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  defaultEndpointNameFromUrl,
  resolveEndpointDisplayName,
  resolveHistoryRemarkForUpdate,
  resolveFavoriteNameForUpdate,
  persistProjectEndpointIfNeeded,
} from './persistProjectEndpoint';
import { useRequestStore } from '../stores/requestStore';
import { useResponseStore } from '../stores/responseStore';
import * as db from './db';

vi.mock('./db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./db')>();
  return {
    ...actual,
    addApiEndpoint: vi.fn().mockResolvedValue(999),
    updateApiEndpoint: vi.fn().mockResolvedValue(undefined),
    getModuleById: vi.fn().mockResolvedValue({ project_id: 88 }),
  };
});

describe('defaultEndpointNameFromUrl', () => {
  it('uses last path segment', () => {
    expect(defaultEndpointNameFromUrl('https://api.example.com/v1/users/list')).toBe('list');
  });

  it('falls back when no path', () => {
    expect(defaultEndpointNameFromUrl('https://api.example.com')).toBe('未命名接口');
  });

  it('truncates invalid url string', () => {
    const long = 'x'.repeat(50);
    expect(defaultEndpointNameFromUrl(long)).toBe(long.slice(0, 40));
  });
});

describe('resolveEndpointDisplayName', () => {
  it('uses trimmed remark when non-empty', () => {
    expect(resolveEndpointDisplayName('https://a.com/x', '  登录  ')).toBe('登录');
  });

  it('falls back to defaultEndpointNameFromUrl when remark empty', () => {
    expect(resolveEndpointDisplayName('https://a.com/v1/users', '')).toBe('users');
    expect(resolveEndpointDisplayName('https://a.com/v1/users', '   ')).toBe('users');
  });
});

describe('resolveHistoryRemarkForUpdate', () => {
  it('prefers new remark when non-empty', () => {
    expect(resolveHistoryRemarkForUpdate('旧', '新备注')).toBe('新备注');
  });

  it('keeps existing when new remark empty', () => {
    expect(resolveHistoryRemarkForUpdate('仅历史', '')).toBe('仅历史');
    expect(resolveHistoryRemarkForUpdate('仅历史', '   ')).toBe('仅历史');
  });

  it('returns null when both empty', () => {
    expect(resolveHistoryRemarkForUpdate(null, '')).toBeNull();
    expect(resolveHistoryRemarkForUpdate('', '')).toBeNull();
  });
});

describe('resolveFavoriteNameForUpdate', () => {
  it('prefers remark when non-empty', () => {
    expect(resolveFavoriteNameForUpdate('旧名', 'https://a.com/x', '显示名')).toBe('显示名');
  });

  it('keeps existing name when remark empty', () => {
    expect(resolveFavoriteNameForUpdate('收藏A', 'https://a.com/x', '')).toBe('收藏A');
  });

  it('falls back to url default when no name and no remark', () => {
    expect(resolveFavoriteNameForUpdate(null, 'https://a.com/v1/list', '')).toBe('list');
  });
});

describe('persistProjectEndpointIfNeeded', () => {
  beforeEach(async () => {
    vi.mocked(db.addApiEndpoint).mockClear();
    vi.mocked(db.updateApiEndpoint).mockClear();
    await useRequestStore.getState().newRequest();
    useResponseStore.setState({ pendingTreeExpand: null });
  });

  it('插入新接口时设置 pendingTreeExpand 供项目树展开', async () => {
    await useRequestStore.getState().setProjectContext({
      projectId: 10,
      moduleId: 5,
      endpointId: null,
      globalConfig: { headers: [], variables: [] },
    });
    useRequestStore.getState().setUrl('https://api.example.com/ping');
    await persistProjectEndpointIfNeeded();
    expect(vi.mocked(db.addApiEndpoint)).toHaveBeenCalled();
    expect(useResponseStore.getState().pendingTreeExpand).toEqual({
      projectId: 10,
      moduleId: 5,
    });
  });

  it('更新已有接口时不设置 pendingTreeExpand', async () => {
    await useRequestStore.getState().setProjectContext({
      projectId: 10,
      moduleId: 5,
      endpointId: 77,
      globalConfig: { headers: [], variables: [] },
    });
    useRequestStore.getState().setUrl('https://api.example.com/x');
    await persistProjectEndpointIfNeeded();
    expect(vi.mocked(db.updateApiEndpoint)).toHaveBeenCalled();
    expect(useResponseStore.getState().pendingTreeExpand).toBeNull();
  });
});
