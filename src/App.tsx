import { useEffect, useState, useRef } from 'react';
import { RequestBuilder } from './components/RequestBuilder';
import { ResponseViewer } from './components/ResponseViewer';
import { StreamViewer } from './components/StreamViewer';
import { HistoryPanel } from './components/HistoryPanel';
import { FavoritesPanel } from './components/FavoritesPanel';
import { useRequestStore } from './stores/requestStore';
import { useResponseStore } from './stores/responseStore';
import { useSettingsStore, IDLE_TIMEOUT_OPTIONS } from './stores/settingsStore';
import { useHttpRequest } from './hooks/useHttpRequest';
import { useWebSocket } from './hooks/useWebSocket';
import { useSSE } from './hooks/useSSE';
import { initDb } from './lib/db';
import './App.css';

const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 480;
const SIDEBAR_DEFAULT = 260;
const STORAGE_KEY = 'apix-sidebar-width';
const THEME_KEY = 'apix-theme';

function getInitialTheme(): 'light' | 'dark' {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function App() {
  const [sideTab, setSideTab] = useState<'history' | 'favorites'>('history');
  const [theme, setTheme] = useState<'light' | 'dark'>(getInitialTheme);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const w = parseInt(stored, 10);
      if (!Number.isNaN(w) && w >= SIDEBAR_MIN && w <= SIDEBAR_MAX) return w;
    }
    return SIDEBAR_DEFAULT;
  });
  const isResizing = useRef(false);
  const protocol = useRequestStore((s) => s.protocol);
  const streamConnected = useResponseStore((s) => s.stream.connected);
  const responseMode = useResponseStore((s) => s.mode);

  const { send: sendHttp } = useHttpRequest();
  const { connect: connectWs, disconnect: disconnectWs, send: sendWs } =
    useWebSocket();
  const { connect: connectSse, disconnect: disconnectSse } = useSSE();

  useEffect(() => {
    initDb().catch(console.error);
  }, []);

  useEffect(() => {
    const preventContextMenu = (e: MouseEvent) => e.preventDefault();
    document.addEventListener('contextmenu', preventContextMenu);
    return () => document.removeEventListener('contextmenu', preventContextMenu);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'light' ? 'dark' : 'light'));
  const idleTimeoutMs = useSettingsStore((s) => s.idleTimeoutMs);
  const setIdleTimeoutMs = useSettingsStore((s) => s.setIdleTimeoutMs);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const w = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, e.clientX));
      setSidebarWidth(w);
      localStorage.setItem(STORAGE_KEY, String(w));
    };
    const onUp = () => {
      isResizing.current = false;
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
  const resetResponse = useResponseStore((s) => s.reset);

  const handleNewRequest = () => {
    if (wsConnected) disconnectWs();
    if (sseConnected) disconnectSse();
    newRequest();
    resetResponse();
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>
          <img src="/logo.png" alt="Apix" className="app-logo" />
        </h1>
        <div className="header-actions">
          {(protocol === 'ws' || protocol === 'sse') && (
            <label className="idle-timeout-label">
              <span className="idle-timeout-text">空闲超时</span>
              <select
                className="idle-timeout-select"
                value={idleTimeoutMs}
                onChange={(e) => setIdleTimeoutMs(Number(e.target.value))}
                title="连接空闲超过此时间将自动断开"
              >
                {IDLE_TIMEOUT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            className="theme-toggle-btn"
            onClick={toggleTheme}
            title={theme === 'light' ? '切换为深色' : '切换为浅色'}
            aria-label={theme === 'light' ? '切换为深色主题' : '切换为浅色主题'}
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
        </div>
      </header>

      <div className="app-body">
        <aside
          className="sidebar"
          style={{ width: sidebarWidth, minWidth: sidebarWidth, maxWidth: sidebarWidth }}
        >
          <div className="sidebar-tabs">
            <div className="sidebar-tabs-left">
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
            <button
              type="button"
              className="sidebar-new-request-btn"
              onClick={handleNewRequest}
              title="创建新请求"
            >
              + 新建
            </button>
          </div>
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
        <main className="main">
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

          <div className="response-area">
            {responseMode === 'http' ? (
              <ResponseViewer />
            ) : (
              <StreamViewer />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
