import { useRef, useEffect, useState } from 'react';
import { JsonView, darkStyles } from 'react-json-view-lite';
import 'react-json-view-lite/dist/index.css';
import { useResponseStore } from '../../stores/responseStore';
import { useErrorLogStore } from '../../stores/errorLogStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { IconResponseAreaCollapse, IconResponseAreaExpand } from '../responseAreaToggleIcons';
import { FastTooltip } from '../FastTooltip/FastTooltip';

export type StreamViewerProps = {
  responseExpanded?: boolean;
  onToggleResponseExpand?: () => void;
};

export function StreamViewer({
  responseExpanded = false,
  onToggleResponseExpand,
}: StreamViewerProps = {}) {
  const [activeTab, setActiveTab] = useState<'messages' | 'errors'>('messages');
  const { stream } = useResponseStore();
  const { connected, messages, loading, error } = stream;
  const errorLogs = useErrorLogStore((s) => s.entries);
  const clearErrorLogs = useErrorLogStore((s) => s.clearEntries);
  const collectErrorLogs = useSettingsStore((s) => s.collectErrorLogs);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toTimeString().slice(0, 8);
  };

  const tryParse = (content: string): unknown => {
    try {
      return JSON.parse(content);
    } catch {
      return null;
    }
  };

  return (
    <div className="stream-viewer">
      <div className="stream-viewer-toolbar">
        <div className="response-tabs">
          <button
            type="button"
            className={`response-tab ${activeTab === 'messages' ? 'active' : ''}`}
            onClick={() => setActiveTab('messages')}
          >
            消息
          </button>
          <button
            type="button"
            className={`response-tab ${activeTab === 'errors' ? 'active' : ''}`}
            onClick={() => setActiveTab('errors')}
          >
            错误日志 ({errorLogs.length})
          </button>
        </div>
        {activeTab === 'errors' && errorLogs.length > 0 && (
          <button type="button" className="response-log-clear-btn" onClick={clearErrorLogs}>
            清空日志
          </button>
        )}
        {onToggleResponseExpand && (
          <FastTooltip
            label={responseExpanded ? '收起响应区，恢复请求区高度' : '展开响应区至右侧可用高度'}
          >
            <button
              type="button"
              className={`response-copy-body-btn response-expand-area-btn${
                responseExpanded ? ' response-expand-area-btn--active' : ''
              }`}
              onClick={onToggleResponseExpand}
              aria-label={responseExpanded ? '收起响应区' : '展开响应区'}
              aria-pressed={responseExpanded}
            >
              {responseExpanded ? <IconResponseAreaExpand /> : <IconResponseAreaCollapse />}
            </button>
          </FastTooltip>
        )}
      </div>
      <div className="stream-status">
        <span className={connected ? 'status-connected' : 'status-disconnected'}>
          {loading ? '连接中...' : connected ? '已连接' : '未连接'}
        </span>
        <span className="message-count">共 {messages.length} 条消息</span>
      </div>
      {activeTab === 'messages' ? (
        <>
          {error && (
            <div className="stream-inline-error">
              <p className="error-msg">{error}</p>
            </div>
          )}
          <div className="stream-messages">
            {messages.length === 0 ? (
              <p className="muted">暂无消息</p>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  className={`stream-msg stream-msg-${m.direction}`}
                >
                  <span className="msg-time">{formatTime(m.timestamp)}</span>
                  <span className="msg-dir">{m.direction === 'in' ? '←' : '→'}</span>
                  {m.event && <span className="msg-event">{m.event}</span>}
                  <div className="msg-content">
                    {(() => {
                      const parsed = tryParse(m.content);
                      return parsed ? (
                        <JsonView data={parsed} style={darkStyles} />
                      ) : (
                        <pre>{m.content}</pre>
                      );
                    })()}
                  </div>
                </div>
              ))
            )}
            <div ref={bottomRef} />
          </div>
        </>
      ) : (
        <div className="response-errors-panel">
          {!collectErrorLogs ? (
            <div className="response-empty">
              <span className="response-empty-icon">—</span>
              <p>报错收集已关闭，请先在顶部开启“报错收集”开关。</p>
            </div>
          ) : errorLogs.length === 0 ? (
            <div className="response-empty">
              <span className="response-empty-icon">—</span>
              <p>暂无错误日志</p>
            </div>
          ) : (
            <div className="response-error-log-list">
              {errorLogs.map((log) => (
                <article key={log.id} className="response-error-log-item">
                  <header className="response-error-log-head">
                    <span className="response-error-log-time">{new Date(log.timestamp).toLocaleString()}</span>
                    <span className="response-error-log-source">{log.source.toUpperCase()}</span>
                  </header>
                  <p className="response-error-log-message">
                    {log.name ? `${log.name}: ` : ''}
                    {log.message}
                  </p>
                  {log.detail && <pre className="response-error-log-detail">{log.detail}</pre>}
                  {log.stack && <pre className="response-error-log-stack">{log.stack}</pre>}
                  {log.context && Object.keys(log.context).length > 0 && (
                    <pre className="response-error-log-context">{JSON.stringify(log.context, null, 2)}</pre>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
