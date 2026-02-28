import { useRef, useEffect } from 'react';
import { JsonView, darkStyles } from 'react-json-view-lite';
import 'react-json-view-lite/dist/index.css';
import { useResponseStore } from '../../stores/responseStore';

export function StreamViewer() {
  const { stream } = useResponseStore();
  const { connected, messages, loading, error } = stream;
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (loading && messages.length === 0) {
    return (
      <div className="stream-viewer loading">
        <p>连接中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="stream-viewer error">
        <p className="error-msg">{error}</p>
      </div>
    );
  }

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
      <div className="stream-status">
        <span className={connected ? 'status-connected' : 'status-disconnected'}>
          {connected ? '已连接' : '未连接'}
        </span>
        <span className="message-count">共 {messages.length} 条消息</span>
      </div>
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
    </div>
  );
}
