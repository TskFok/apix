import { useEffect, useState, useRef, useCallback } from 'react';
import { RequestBuilder } from './components/RequestBuilder';
import { ResponseViewer } from './components/ResponseViewer';
import { StreamViewer } from './components/StreamViewer';
import { HistoryPanel } from './components/HistoryPanel';
import { FavoritesPanel } from './components/FavoritesPanel';
import { ProjectTreePanel } from './components/ProjectTreePanel';
import { ProjectGlobalsPanel } from './components/ProjectGlobalsPanel';
import { useRequestStore } from './stores/requestStore';
import { useResponseStore } from './stores/responseStore';
import { useSettingsStore, IDLE_TIMEOUT_OPTIONS } from './stores/settingsStore';
import { useHttpRequest } from './hooks/useHttpRequest';
import { useWebSocket } from './hooks/useWebSocket';
import { useSSE } from './hooks/useSSE';
import { useEscapeToClose } from './hooks/useEscapeToClose';
import { setupGlobalErrorCollection } from './lib/errorLog';
import { setTheme as setTauriTheme } from '@tauri-apps/api/app';
import { message } from '@tauri-apps/plugin-dialog';
import { initDb, getProject } from './lib/db';
import { DEFAULT_PROJECT_ENVIRONMENTS, parseProjectGlobalConfig } from './lib/projectMerge';
import { FastTooltip } from './components/FastTooltip/FastTooltip';
import './App.css';

const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 480;
const SIDEBAR_DEFAULT = 260;
const STORAGE_KEY = 'apix-sidebar-width';
const THEME_KEY = 'apix-theme';

const REQUEST_PANEL_MIN = 120;
const REQUEST_PANEL_MAX = 600;
const REQUEST_PANEL_DEFAULT = 280;
const REQUEST_PANEL_STORAGE_KEY = 'apix-request-panel-height';
/** 展开响应区时请求区保留高度（与 REQUEST_PANEL_MIN 一致，保证可滚动编辑） */
const REQUEST_PANEL_HEIGHT_WHEN_RESPONSE_EXPANDED = REQUEST_PANEL_MIN;

function getInitialTheme(): 'light' | 'dark' {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function syncNativeAppTheme(theme: 'light' | 'dark') {
  void setTauriTheme(theme).catch(() => undefined);
}

function App() {
  const prevSideTabRef = useRef<'history' | 'favorites' | 'projects'>('projects');
  const [sideTab, setSideTab] = useState<'history' | 'favorites' | 'projects'>('projects');
  const [theme, setTheme] = useState<'light' | 'dark'>(getInitialTheme);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const w = parseInt(stored, 10);
      if (!Number.isNaN(w) && w >= SIDEBAR_MIN && w <= SIDEBAR_MAX) return w;
    }
    return SIDEBAR_DEFAULT;
  });
  const [requestPanelHeight, setRequestPanelHeight] = useState(() => {
    const stored = localStorage.getItem(REQUEST_PANEL_STORAGE_KEY);
    if (stored) {
      const h = parseInt(stored, 10);
      if (!Number.isNaN(h) && h >= REQUEST_PANEL_MIN && h <= REQUEST_PANEL_MAX) return h;
    }
    return REQUEST_PANEL_DEFAULT;
  });
  const [responseAreaExpanded, setResponseAreaExpanded] = useState(false);
  const responseAreaExpandedRef = useRef(false);
  const savedRequestPanelHeightRef = useRef<number | null>(null);
  const requestPanelHeightRef = useRef(requestPanelHeight);
  requestPanelHeightRef.current = requestPanelHeight;
  useEffect(() => {
    responseAreaExpandedRef.current = responseAreaExpanded;
  }, [responseAreaExpanded]);

  const isResizing = useRef(false);
  const isRequestPanelResizing = useRef(false);
  const mainRef = useRef<HTMLElement>(null);
  const protocol = useRequestStore((s) => s.protocol);
  const currentProjectId = useRequestStore((s) => s.currentProjectId);
  const projectGlobalConfig = useRequestStore((s) => s.projectGlobalConfig);
  const showProjectGlobalsPage =
    useRequestStore((s) => s.mainWorkspace === 'project_settings' && s.currentProjectId != null);
  const [projectGlobalsQuickEditOpen, setProjectGlobalsQuickEditOpen] = useState(false);
  const streamConnected = useResponseStore((s) => s.stream.connected);
  const responseMode = useResponseStore((s) => s.mode);
  const projectEnvironments =
    currentProjectId != null && projectGlobalConfig
      ? projectGlobalConfig.environments?.length
        ? projectGlobalConfig.environments
        : DEFAULT_PROJECT_ENVIRONMENTS
      : [];
  const activeProjectEnvironmentId =
    projectGlobalConfig?.activeEnvironmentId &&
    projectEnvironments.some((env) => env.id === projectGlobalConfig.activeEnvironmentId)
      ? projectGlobalConfig.activeEnvironmentId
      : projectEnvironments[0]?.id ?? '';
  const activeProjectEnvironmentName =
    projectEnvironments.find((env) => env.id === activeProjectEnvironmentId)?.name ??
    projectEnvironments[0]?.name ??
    '默认环境';
  const showProjectEnvironmentShortcut =
    currentProjectId != null && projectGlobalConfig != null && projectEnvironments.length > 0;

  const { send: sendHttp } = useHttpRequest();
  const { connect: connectWs, disconnect: disconnectWs, send: sendWs } =
    useWebSocket();
  const { connect: connectSse, disconnect: disconnectSse } = useSSE();

  useEffect(() => {
    initDb().catch(console.error);
    setupGlobalErrorCollection();
  }, []);

  useEffect(() => {
    const prev = prevSideTabRef.current;
    prevSideTabRef.current = sideTab;
    if (prev === 'projects' && sideTab !== 'projects') {
      void useRequestStore.getState().flushProjectGlobalsDraft();
    }
  }, [sideTab]);

  useEffect(() => {
    const preventContextMenu = (e: MouseEvent) => e.preventDefault();
    document.addEventListener('contextmenu', preventContextMenu);
    return () => document.removeEventListener('contextmenu', preventContextMenu);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
    syncNativeAppTheme(theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'light' ? 'dark' : 'light'));
  const idleTimeoutMs = useSettingsStore((s) => s.idleTimeoutMs);
  const setIdleTimeoutMs = useSettingsStore((s) => s.setIdleTimeoutMs);
  const collectErrorLogs = useSettingsStore((s) => s.collectErrorLogs);
  const setCollectErrorLogs = useSettingsStore((s) => s.setCollectErrorLogs);

  const closeProjectGlobalsQuickEdit = useCallback(() => {
    setProjectGlobalsQuickEditOpen(false);
    void useRequestStore.getState().flushProjectGlobalsDraft();
  }, []);

  useEscapeToClose(projectGlobalsQuickEditOpen, closeProjectGlobalsQuickEdit);

  useEffect(() => {
    if (!showProjectEnvironmentShortcut) {
      setProjectGlobalsQuickEditOpen(false);
    }
  }, [showProjectEnvironmentShortcut]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (isResizing.current) {
        const w = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, e.clientX));
        setSidebarWidth(w);
        localStorage.setItem(STORAGE_KEY, String(w));
      }
      if (isRequestPanelResizing.current && mainRef.current && !responseAreaExpandedRef.current) {
        const rect = mainRef.current.getBoundingClientRect();
        const maxH = rect.height - 80;
        const newH = Math.max(
          REQUEST_PANEL_MIN,
          Math.min(maxH, e.clientY - rect.top - 8)
        );
        setRequestPanelHeight(newH);
        localStorage.setItem(REQUEST_PANEL_STORAGE_KEY, String(newH));
      }
    };
    const onUp = () => {
      isResizing.current = false;
      isRequestPanelResizing.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      onUp();
    };
  }, []);

  const toggleResponseAreaExpand = useCallback(() => {
    setResponseAreaExpanded((exp) => {
      if (!exp) {
        savedRequestPanelHeightRef.current = requestPanelHeightRef.current;
        setRequestPanelHeight(REQUEST_PANEL_HEIGHT_WHEN_RESPONSE_EXPANDED);
        return true;
      }
      const restore =
        savedRequestPanelHeightRef.current != null
          ? savedRequestPanelHeightRef.current
          : REQUEST_PANEL_DEFAULT;
      const clamped = Math.max(REQUEST_PANEL_MIN, Math.min(REQUEST_PANEL_MAX, restore));
      setRequestPanelHeight(clamped);
      localStorage.setItem(REQUEST_PANEL_STORAGE_KEY, String(clamped));
      return false;
    });
  }, []);

  useEffect(() => {
    useResponseStore.setState({
      mode: protocol === 'http' ? 'http' : 'stream',
    });
  }, [protocol]);

  const prevProtocol = useRef(protocol);
  useEffect(() => {
    if (prevProtocol.current === 'ws' && protocol !== 'ws') {
      disconnectWs();
    }
    if (prevProtocol.current === 'sse' && protocol !== 'sse') {
      disconnectSse();
    }
    prevProtocol.current = protocol;
  }, [protocol, disconnectWs, disconnectSse]);

  const wsConnected = streamConnected && protocol === 'ws';
  const sseConnected = streamConnected && protocol === 'sse';

  const newRequest = useRequestStore((s) => s.newRequest);
  const setProjectContext = useRequestStore((s) => s.setProjectContext);
  const newEndpointDraft = useRequestStore((s) => s.newEndpointDraft);
  const resetResponse = useResponseStore((s) => s.reset);

  const handleNewRequest = () => {
    if (wsConnected) disconnectWs();
    if (sseConnected) disconnectSse();
    void (async () => {
      const st = useRequestStore.getState();
      const target = st.newEndpointTargetModule;
      if (sideTab === 'projects' && target != null) {
        await st.flushProjectGlobalsDraft();
        const proj = await getProject(target.projectId);
        const cfg = proj ? parseProjectGlobalConfig(proj.global_config) : { headers: [], variables: [] };
        await setProjectContext({
          projectId: target.projectId,
          moduleId: target.moduleId,
          endpointId: null,
          globalConfig: cfg,
        });
        await newEndpointDraft();
        useResponseStore.getState().setPendingTreeExpand({
          projectId: target.projectId,
          moduleId: target.moduleId,
        });
      } else {
        if (sideTab === 'projects' && target == null) {
          await message(
            '请先在左侧树中点击模块名称（展开接口列表并选中默认模块），再使用「+ 新建」即可在该模块下创建接口。',
            { title: 'Apix', kind: 'info' }
          );
        }
        await newRequest();
      }
      st.setCurrentHistoryId(null);
      st.setCurrentFavoriteId(null);
      st.setSuppressPersistToProject(false);
      resetResponse();
    })();
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>
          <img src="/logo.png" alt="Apix" className="app-logo" />
        </h1>
        <div className="header-actions">
          {showProjectEnvironmentShortcut && (
            <button
              type="button"
              className="environment-shortcut-button"
              onClick={() => setProjectGlobalsQuickEditOpen(true)}
              aria-label={`打开环境快速编辑，当前环境：${activeProjectEnvironmentName}`}
            >
              <span className="environment-shortcut-text">环境</span>
              <span className="environment-shortcut-current">{activeProjectEnvironmentName}</span>
            </button>
          )}
          <FastTooltip label="开启后会收集更完整的错误细节，便于排查">
            <label className={`error-collect-label ${collectErrorLogs ? 'is-active' : ''}`}>
              <input
                type="checkbox"
                role="switch"
                aria-label="报错收集"
                aria-checked={collectErrorLogs}
                className="error-collect-checkbox"
                checked={collectErrorLogs}
                onChange={(e) => setCollectErrorLogs(e.target.checked)}
              />
              <span className="error-collect-switch" aria-hidden="true">
                <span className="error-collect-switch-thumb" />
              </span>
              <span className="error-collect-text">报错收集</span>
              <span className="error-collect-state" aria-hidden="true">
                {collectErrorLogs ? '开' : '关'}
              </span>
            </label>
          </FastTooltip>
          {(protocol === 'ws' || protocol === 'sse') && (
            <label className="idle-timeout-label">
              <span className="idle-timeout-text">空闲超时</span>
              <FastTooltip label="连接空闲超过此时间将自动断开">
                <select
                  className="idle-timeout-select"
                  value={idleTimeoutMs}
                  onChange={(e) => setIdleTimeoutMs(Number(e.target.value))}
                >
                {IDLE_TIMEOUT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
                </select>
              </FastTooltip>
            </label>
          )}
          <FastTooltip label={theme === 'light' ? '切换为深色' : '切换为浅色'}>
            <button
              type="button"
              className={`theme-toggle-btn ${theme === 'dark' ? 'is-dark' : ''}`}
              onClick={toggleTheme}
              aria-label={theme === 'light' ? '切换为深色主题' : '切换为浅色主题'}
            >
              <span className="theme-toggle-icon" aria-hidden="true">
                {theme === 'light' ? '☾' : '☀'}
              </span>
              <span className="theme-toggle-text">主题</span>
              <span className="theme-toggle-state">{theme === 'light' ? '浅色' : '深色'}</span>
            </button>
          </FastTooltip>
        </div>
      </header>

      {projectGlobalsQuickEditOpen && showProjectEnvironmentShortcut && (
        <div className="modal-overlay" role="presentation" onClick={closeProjectGlobalsQuickEdit}>
          <div
            className="modal-dialog project-globals-quick-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="project-globals-quick-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="project-globals-quick-head">
              <div>
                <h2 id="project-globals-quick-title" className="project-globals-quick-title">
                  项目全局快速编辑
                </h2>
                <p className="project-globals-quick-subtitle">当前环境：{activeProjectEnvironmentName}</p>
              </div>
              <button
                type="button"
                className="project-globals-quick-close"
                onClick={closeProjectGlobalsQuickEdit}
                aria-label="关闭项目全局快速编辑"
              >
                ×
              </button>
            </div>
            <div className="project-globals-quick-body">
              <ProjectGlobalsPanel />
            </div>
          </div>
        </div>
      )}

      <div className="app-body">
        <aside
          className="sidebar"
          style={{ width: sidebarWidth, minWidth: sidebarWidth, maxWidth: sidebarWidth }}
        >
          <div className="sidebar-tabs">
            <div className="sidebar-tabs-left">
              <button
                type="button"
                className={`sidebar-tab ${sideTab === 'projects' ? 'active' : ''}`}
                onClick={() => setSideTab('projects')}
              >
                项目
              </button>
              <button
                type="button"
                className={`sidebar-tab ${sideTab === 'history' ? 'active' : ''}`}
                onClick={() => setSideTab('history')}
              >
                历史
              </button>
              <button
                type="button"
                className={`sidebar-tab ${sideTab === 'favorites' ? 'active' : ''}`}
                onClick={() => setSideTab('favorites')}
              >
                收藏
              </button>
            </div>
            <FastTooltip label="创建新请求。在项目 Tab 下若已点击过某模块名称，则在该模块下新建接口草稿">
              <button type="button" className="sidebar-new-request-btn" onClick={handleNewRequest}>
                + 新建
              </button>
            </FastTooltip>
          </div>
          {sideTab === 'projects' && <ProjectTreePanel />}
          {sideTab === 'history' && (
            <HistoryPanel protocol={protocol} />
          )}
          {sideTab === 'favorites' && (
            <FavoritesPanel protocol={protocol} />
          )}
        </aside>
        <div
          className="sidebar-resizer"
          onMouseDown={(e) => {
            e.preventDefault();
            isResizing.current = true;
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
          }}
          role="separator"
          aria-label="调整侧边栏宽度"
        />
        <main
          ref={mainRef}
          className={`main${responseAreaExpanded ? ' main--response-expanded' : ''}`}
        >
          <div
            className="request-panel-wrapper"
            style={{ height: requestPanelHeight, minHeight: requestPanelHeight, maxHeight: requestPanelHeight }}
          >
            {showProjectGlobalsPage ? (
              <div className="request-panel-main">
                <ProjectGlobalsPanel />
              </div>
            ) : (
              <div className="request-panel-main">
                <RequestBuilder
                  onSendHttp={sendHttp}
                  onConnectWs={connectWs}
                  onDisconnectWs={disconnectWs}
                  onConnectSse={connectSse}
                  onDisconnectSse={disconnectSse}
                  onSendWsMessage={wsConnected ? sendWs : undefined}
                  wsConnected={!!wsConnected}
                  sseConnected={!!sseConnected}
                />
              </div>
            )}
          </div>
          <div
            className="request-response-resizer"
            onMouseDown={(e) => {
              e.preventDefault();
              isRequestPanelResizing.current = true;
              document.body.style.cursor = 'row-resize';
              document.body.style.userSelect = 'none';
            }}
            role="separator"
            aria-label="调整请求区与响应区高度"
          />
          <div className="response-area">
            {responseMode === 'http' ? (
              <ResponseViewer
                responseExpanded={responseAreaExpanded}
                onToggleResponseExpand={toggleResponseAreaExpand}
              />
            ) : (
              <StreamViewer
                responseExpanded={responseAreaExpanded}
                onToggleResponseExpand={toggleResponseAreaExpand}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
