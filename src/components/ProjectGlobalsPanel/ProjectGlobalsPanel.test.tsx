import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { confirm } from '@tauri-apps/plugin-dialog';
import { ProjectGlobalsPanel } from './ProjectGlobalsPanel';
import { useRequestStore } from '../../stores/requestStore';
import { parseProjectGlobalConfig } from '../../lib/projectMerge';

vi.mock('../../lib/db', () => ({
  getProject: vi.fn().mockResolvedValue({ id: 1, name: '测试项目', global_config: null }),
  updateProject: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  message: vi.fn().mockResolvedValue(undefined),
  confirm: vi.fn().mockResolvedValue(true),
}));

describe('ProjectGlobalsPanel', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await useRequestStore.getState().newRequest();
    await useRequestStore.getState().enterProjectSettingsView(1, {
      headers: [{ key: 'H', value: '1', description: '', enabled: true }],
      variables: [],
    });
  });

  it('展示项目名称与全局 Headers 区块', async () => {
    render(<ProjectGlobalsPanel />);
    expect(await screen.findByText('测试项目')).toBeInTheDocument();
    expect(screen.getByText('全局 Headers')).toBeInTheDocument();
  });

  it('不再展示环境变量与认证配置区块', async () => {
    await useRequestStore.getState().enterProjectSettingsView(1, {
      headers: [],
      variables: [],
      activeEnvironmentId: 'test',
      environments: [
        {
          id: 'test',
          name: '测试',
          baseUrl: '',
          headers: [],
          variables: [{ key: 'token', value: 'env-token', description: '', enabled: true }],
        },
      ],
      auth: { type: 'bearer', token: '{{token}}', enabled: true },
    });

    render(<ProjectGlobalsPanel />);

    expect(await screen.findByText('测试项目')).toBeInTheDocument();
    expect(screen.queryByText('环境变量')).not.toBeInTheDocument();
    expect(screen.queryByText('认证配置')).not.toBeInTheDocument();
    expect(screen.queryByText('+ 添加环境变量')).not.toBeInTheDocument();
    expect(screen.queryByText('Bearer Token')).not.toBeInTheDocument();
  });

  it('切换环境时全局 Base URL、Headers 与共享变量跟随环境变化', async () => {
    await useRequestStore.getState().enterProjectSettingsView(1, {
      headers: [{ key: 'X-Legacy', value: 'legacy', description: '', enabled: true }],
      baseUrl: 'https://legacy.example.com',
      variables: [],
      activeEnvironmentId: 'test',
      environments: [
        {
          id: 'test',
          name: '测试',
          baseUrl: 'https://test.example.com',
          headers: [{ key: 'X-Env', value: 'test', description: '', enabled: true }],
          variables: [{ key: 'token', value: 'TEST_TOKEN', description: '', enabled: true }],
        },
        {
          id: 'prod',
          name: '生产',
          baseUrl: 'https://prod.example.com',
          headers: [{ key: 'X-Env', value: 'prod', description: '', enabled: true }],
          variables: [{ key: 'token', value: 'PROD_TOKEN', description: '', enabled: true }],
        },
      ],
    });

    render(<ProjectGlobalsPanel />);

    expect(await screen.findByDisplayValue('https://test.example.com')).toBeInTheDocument();
    expect(screen.getByDisplayValue('test')).toBeInTheDocument();
    expect(screen.getByDisplayValue('TEST_TOKEN')).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue('测试'), { target: { value: 'prod' } });

    expect(await screen.findByDisplayValue('https://prod.example.com')).toBeInTheDocument();
    expect(screen.getByDisplayValue('prod')).toBeInTheDocument();
    expect(screen.getByDisplayValue('PROD_TOKEN')).toBeInTheDocument();
  });

  it('旧版顶层 Base URL 和 Headers 在默认环境中可见', async () => {
    await useRequestStore.getState().enterProjectSettingsView(
      1,
      parseProjectGlobalConfig(
        JSON.stringify({
          headers: [{ key: 'X-Legacy', value: 'legacy', description: '', enabled: true }],
          baseUrl: 'https://legacy.example.com',
          variables: [],
        })
      )
    );

    render(<ProjectGlobalsPanel />);

    expect(await screen.findByDisplayValue('https://legacy.example.com')).toBeInTheDocument();
    expect(screen.getByDisplayValue('X-Legacy')).toBeInTheDocument();
    expect(screen.getByDisplayValue('legacy')).toBeInTheDocument();
  });

  it('首个共享变量 key 为空时仍可继续添加变量行', async () => {
    render(<ProjectGlobalsPanel />);

    expect(await screen.findByText('测试项目')).toBeInTheDocument();
    expect(screen.getAllByPlaceholderText('key')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: '+ 添加变量' }));

    expect(screen.getAllByPlaceholderText('key')).toHaveLength(2);
  });

  it('新建环境通过名称输入确认后创建并选中', async () => {
    render(<ProjectGlobalsPanel />);

    fireEvent.click(screen.getByRole('button', { name: '新建' }));
    fireEvent.change(screen.getByLabelText('环境名称'), { target: { value: '预发' } });
    fireEvent.click(screen.getByRole('button', { name: '确认新建环境' }));

    expect(screen.getByDisplayValue('预发')).toBeInTheDocument();
    expect(useRequestStore.getState().projectGlobalConfig?.activeEnvironmentId).toMatch(/^env-/);
    const environments = useRequestStore.getState().projectGlobalConfig?.environments ?? [];
    expect(environments[environments.length - 1]?.name).toBe('预发');
  });

  it('重命名环境通过名称输入确认后更新当前环境名称', async () => {
    await useRequestStore.getState().enterProjectSettingsView(1, {
      headers: [],
      variables: [],
      activeEnvironmentId: 'dev',
      environments: [
        { id: 'dev', name: '开发', baseUrl: '', headers: [], variables: [] },
        { id: 'prod', name: '生产', baseUrl: '', headers: [], variables: [] },
      ],
    });

    render(<ProjectGlobalsPanel />);

    fireEvent.click(screen.getByRole('button', { name: '重命名' }));
    fireEvent.change(screen.getByLabelText('环境名称'), { target: { value: '本地开发' } });
    fireEvent.click(screen.getByRole('button', { name: '确认重命名环境' }));

    expect(screen.getByDisplayValue('本地开发')).toBeInTheDocument();
    expect(useRequestStore.getState().projectGlobalConfig?.environments?.[0]?.name).toBe('本地开发');
  });

  it('删除环境先等待确认，取消时不删除', async () => {
    vi.mocked(confirm).mockResolvedValueOnce(false);
    await useRequestStore.getState().enterProjectSettingsView(1, {
      headers: [],
      variables: [],
      activeEnvironmentId: 'prod',
      environments: [
        { id: 'dev', name: '开发', baseUrl: '', headers: [], variables: [] },
        { id: 'prod', name: '生产', baseUrl: '', headers: [], variables: [] },
      ],
    });

    render(<ProjectGlobalsPanel />);

    fireEvent.click(screen.getByRole('button', { name: '删除' }));

    expect(confirm).toHaveBeenCalledWith('删除环境「生产」？', {
      title: '确认删除',
      kind: 'warning',
    });
    expect(useRequestStore.getState().projectGlobalConfig?.environments).toHaveLength(2);
    expect(useRequestStore.getState().projectGlobalConfig?.activeEnvironmentId).toBe('prod');
  });
});
