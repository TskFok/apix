import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setTheme as setTauriTheme } from '@tauri-apps/api/app';
import App from './App';
import { useRequestStore } from './stores/requestStore';
import { useSettingsStore } from './stores/settingsStore';

vi.mock('@tauri-apps/api/app', () => ({
  setTheme: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  message: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./lib/db', () => ({
  initDb: vi.fn().mockResolvedValue(undefined),
  getProject: vi.fn().mockResolvedValue(null),
}));

vi.mock('./lib/errorLog', () => ({
  setupGlobalErrorCollection: vi.fn(),
}));

vi.mock('./hooks/useHttpRequest', () => ({
  useHttpRequest: () => ({ send: vi.fn() }),
}));

vi.mock('./hooks/useWebSocket', () => ({
  useWebSocket: () => ({ connect: vi.fn(), disconnect: vi.fn(), send: vi.fn() }),
}));

vi.mock('./hooks/useSSE', () => ({
  useSSE: () => ({ connect: vi.fn(), disconnect: vi.fn() }),
}));

vi.mock('./components/RequestBuilder', () => ({
  RequestBuilder: () => <div>RequestBuilder</div>,
}));

vi.mock('./components/ResponseViewer', () => ({
  ResponseViewer: () => <div>ResponseViewer</div>,
}));

vi.mock('./components/StreamViewer', () => ({
  StreamViewer: () => <div>StreamViewer</div>,
}));

vi.mock('./components/HistoryPanel', () => ({
  HistoryPanel: () => <div>HistoryPanel</div>,
}));

vi.mock('./components/FavoritesPanel', () => ({
  FavoritesPanel: () => <div>FavoritesPanel</div>,
}));

vi.mock('./components/ProjectTreePanel', () => ({
  ProjectTreePanel: () => <div>ProjectTreePanel</div>,
}));

vi.mock('./components/ProjectGlobalsPanel', () => ({
  ProjectGlobalsPanel: () => <div>ProjectGlobalsPanel</div>,
}));

vi.mock('./components/FastTooltip/FastTooltip', () => ({
  FastTooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

describe('App', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: vi.fn().mockReturnValue(null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
      configurable: true,
    });
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    await useRequestStore.getState().newRequest();
    useSettingsStore.getState().setCollectErrorLogs(false);
  });

  it('点击右上角环境打开项目全局快速编辑弹窗', async () => {
    await useRequestStore.getState().setProjectContext({
      projectId: 1,
      moduleId: 2,
      endpointId: 3,
      globalConfig: {
        headers: [],
        variables: [],
        activeEnvironmentId: 'dev',
        environments: [
          { id: 'dev', name: '开发', baseUrl: '', headers: [], variables: [] },
          { id: 'prod', name: '生产', baseUrl: 'https://api.example.com', headers: [], variables: [] },
        ],
      },
    });

    render(<App />);

    const shortcut = screen.getByRole('button', { name: '打开环境快速编辑，当前环境：开发' });
    expect(shortcut).toHaveTextContent('环境');
    expect(shortcut).toHaveTextContent('开发');

    fireEvent.click(shortcut);

    const dialog = screen.getByRole('dialog', { name: '项目全局快速编辑' });
    expect(within(dialog).getByText('ProjectGlobalsPanel')).toBeInTheDocument();
  });

  it('按 Escape 关闭项目全局快速编辑弹窗', async () => {
    await useRequestStore.getState().setProjectContext({
      projectId: 1,
      moduleId: 2,
      endpointId: 3,
      globalConfig: {
        headers: [],
        variables: [],
        activeEnvironmentId: 'dev',
        environments: [
          { id: 'dev', name: '开发', baseUrl: '', headers: [], variables: [] },
        ],
      },
    });

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '打开环境快速编辑，当前环境：开发' }));
    expect(screen.getByRole('dialog', { name: '项目全局快速编辑' })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: '项目全局快速编辑' })).not.toBeInTheDocument();
  });

  it('在右上角以开关形式切换报错收集', () => {
    render(<App />);

    const switchInput = screen.getByRole('switch', { name: '报错收集' });
    expect(switchInput).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(switchInput);

    expect(useSettingsStore.getState().collectErrorLogs).toBe(true);
    expect(switchInput).toHaveAttribute('aria-checked', 'true');
  });

  it('在右上角以统一样式切换深色浅色主题', async () => {
    render(<App />);

    const themeButton = screen.getByRole('button', { name: '切换为深色主题' });
    expect(themeButton).toHaveClass('theme-toggle-btn');
    expect(themeButton).toHaveTextContent('主题');
    expect(themeButton).toHaveTextContent('浅色');

    fireEvent.click(themeButton);

    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(screen.getByRole('button', { name: '切换为浅色主题' })).toHaveTextContent('深色');
    await waitFor(() => expect(setTauriTheme).toHaveBeenLastCalledWith('dark'));
  });
});
