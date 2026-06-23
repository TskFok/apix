import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { defaultStyles } from 'react-json-view-lite';
import { ResponseJsonView } from './ResponseJsonView';
import 'react-json-view-lite/dist/index.css';
import { useResponseStore } from '../../stores/responseStore';
import { useErrorLogStore } from '../../stores/errorLogStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { IconResponseAreaCollapse, IconResponseAreaExpand } from '../responseAreaToggleIcons';
import { FastTooltip } from '../FastTooltip/FastTooltip';

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function IconCopyResponse() {
  return (
    <svg
      className="response-copy-icon-svg"
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function IconCheckResponse() {
  return (
    <svg
      className="response-copy-icon-svg"
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function HighlightedText({
  text,
  searchQuery,
  contentRef,
  currentMatchLine,
}: {
  text: string;
  searchQuery: string;
  contentRef: React.RefObject<HTMLDivElement | null>;
  currentMatchLine: number;
}) {
  const lines = text.split('\n');
  const query = searchQuery.trim().toLowerCase();

  useEffect(() => {
    if (!contentRef.current || currentMatchLine < 0) return;
    const el = contentRef.current.querySelector(`[data-line="${currentMatchLine}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentMatchLine, contentRef]);

  if (!query) {
    return (
      <pre className="response-body-raw">
        {lines.map((line, i) => (
          <div key={i} data-line={i}>
            {line || '\n'}
          </div>
        ))}
      </pre>
    );
  }

  const re = new RegExp(`(${escapeRegex(searchQuery)})`, 'gi');
  return (
    <pre className="response-body-raw response-searchable">
      {lines.map((line, i) => {
        const parts = line.split(re);
        const isCurrentLine = i === currentMatchLine;
        return (
          <div
            key={i}
            data-line={i}
            className={isCurrentLine ? 'search-current-line' : ''}
          >
            {parts.map((part, j) =>
              part.toLowerCase() === query ? (
                <mark key={j} className="search-highlight">
                  {part}
                </mark>
              ) : (
                part
              )
            )}
            {line === '' ? '\n' : ''}
          </div>
        );
      })}
    </pre>
  );
}

/** JSON 语法高亮：key 深蓝、数字 绿、字符串 深红、标点 黑、白底 */
const jsonSyntaxStyles = {
  ...defaultStyles,
  container: 'apix-json-container',
  label: 'apix-json-label',
  clickableLabel: 'apix-json-label apix-json-clickable',
  stringValue: 'apix-json-string',
  numberValue: 'apix-json-number',
  booleanValue: 'apix-json-boolean',
  nullValue: 'apix-json-null',
  undefinedValue: 'apix-json-undefined',
  otherValue: 'apix-json-other',
  punctuation: 'apix-json-punctuation',
  collapseIcon: 'apix-json-expander apix-json-collapse',
  expandIcon: 'apix-json-expander apix-json-expand',
  collapsedContent: 'apix-json-collapsed',
  quotesForFieldNames: true,
};

function getStatusClass(status: number): string {
  if (status >= 200 && status < 300) return 'ok';
  if (status >= 300 && status < 400) return 'redirect';
  if (status >= 400 && status < 500) return 'client-err';
  if (status >= 500) return 'server-err';
  return 'unknown';
}

function formatErrorTime(timestamp: number): string {
  const d = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function buildErrorLogCopyText(logs: Array<{
  timestamp: number;
  source: string;
  name?: string;
  message: string;
  detail?: string;
  stack?: string;
  context?: Record<string, unknown>;
}>): string {
  if (logs.length === 0) return '';
  return logs
    .map((log) => {
      const lines = [
        `[${formatErrorTime(log.timestamp)}] [${log.source}] ${log.name ? `${log.name}: ` : ''}${log.message}`,
      ];
      if (log.detail) lines.push(`detail: ${log.detail}`);
      if (log.stack) lines.push(`stack:\n${log.stack}`);
      if (log.context && Object.keys(log.context).length > 0) {
        lines.push(`context:\n${JSON.stringify(log.context, null, 2)}`);
      }
      return lines.join('\n');
    })
    .join('\n\n');
}

/** 从响应头中获取 content-type（不区分大小写），可能带参数如 "text/html; charset=utf-8" */
export function getContentTypeFromHeaders(headers: Record<string, string>): string | undefined {
  const key = Object.keys(headers).find((k) => k.toLowerCase() === 'content-type');
  return key ? headers[key] : undefined;
}

export function isHtmlResponse(headers: Record<string, string>): boolean {
  const ct = getContentTypeFromHeaders(headers);
  return ct != null && ct.trim().toLowerCase().startsWith('text/html');
}

/** 复制用文本：合法 JSON 则格式化缩进，否则原文 */
export function getTextToCopyFromResponseBody(body: string): string {
  if (!body) return '';
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

export type ResponseViewerProps = {
  /** 响应区是否已拉满主区域下方空间 */
  responseExpanded?: boolean;
  /** 切换展开 / 恢复请求区高度 */
  onToggleResponseExpand?: () => void;
};

export function ResponseViewer({
  responseExpanded = false,
  onToggleResponseExpand,
}: ResponseViewerProps = {}) {
  const [activeTab, setActiveTab] = useState<'headers' | 'body' | 'errors'>('body');
  const [copyHint, setCopyHint] = useState(false);
  const [htmlViewMode, setHtmlViewMode] = useState<'preview' | 'source'>('preview');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const { http } = useResponseStore();
  const { status, statusText, headers, body, timeMs, loading, error } = http;
  const errorLogs = useErrorLogStore((s) => s.entries);
  const clearErrorLogs = useErrorLogStore((s) => s.clearEntries);
  const collectErrorLogs = useSettingsStore((s) => s.collectErrorLogs);

  const isHtml = isHtmlResponse(headers);
  // 若 body 可解析为 JSON，则按 JSON 显示，不因 Content-Type 为 text/html 而用 iframe 预览
  const treatAsJson = useMemo(() => {
    if (!body) return false;
    try {
      JSON.parse(body);
      return true;
    } catch {
      return false;
    }
  }, [body]);
  const showAsHtml = isHtml && !treatAsJson;
  useEffect(() => {
    if (!showAsHtml) setHtmlViewMode('preview');
  }, [showAsHtml]);

  const textToCopy = useMemo(() => {
    if (activeTab === 'errors') {
      return buildErrorLogCopyText(errorLogs);
    }
    if (activeTab === 'headers') {
      return Object.entries(headers)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n');
    }
    return getTextToCopyFromResponseBody(body);
  }, [activeTab, headers, body, errorLogs]);

  const searchableText = useMemo(() => {
    if (activeTab === 'errors') return textToCopy;
    if (activeTab === 'headers') return textToCopy;
    if (activeTab === 'body' && body) {
      try {
        return JSON.stringify(JSON.parse(body), null, 2);
      } catch {
        return body;
      }
    }
    return '';
  }, [activeTab, body, textToCopy]);

  const matchLineIndices = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query || !searchableText) return [];
    return searchableText
      .split('\n')
      .map((line, i) => (line.toLowerCase().includes(query) ? i : -1))
      .filter((i) => i >= 0);
  }, [searchableText, searchQuery]);

  const matchCount = matchLineIndices.length;

  useEffect(() => {
    setCopyHint(false);
  }, [activeTab]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'f' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen((o) => !o);
        if (!searchOpen) {
          setTimeout(() => searchInputRef.current?.focus(), 0);
        }
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [searchOpen]);

  useEffect(() => {
    setCurrentMatchIndex(0);
  }, [searchQuery]);

  const goPrev = () => {
    if (matchCount === 0) return;
    setCurrentMatchIndex((i) => (i - 1 + matchCount) % matchCount);
  };

  const goNext = () => {
    if (matchCount === 0) return;
    setCurrentMatchIndex((i) => (i + 1) % matchCount);
  };

  const handleCopyClipboard = useCallback(async () => {
    if (!textToCopy) return;
    const done = () => {
      setCopyHint(true);
      window.setTimeout(() => setCopyHint(false), 2000);
    };
    try {
      await navigator.clipboard.writeText(textToCopy);
      done();
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = textToCopy;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        done();
      } catch {
        // ignore
      }
    }
  }, [textToCopy]);

  const showSearchableContent = searchOpen && searchQuery.trim() && searchableText;

  if (loading) {
    return (
      <div className="response-viewer loading">
        <div className="response-loading">
          <div className="response-spinner" />
          <p className="response-loading-text">请求中...</p>
        </div>
      </div>
    );
  }

  let parsedBody: unknown = null;
  let parseError = false;
  if (body) {
    try {
      parsedBody = JSON.parse(body);
    } catch {
      parseError = true;
    }
  }

  const headerEntries = Object.entries(headers);

  return (
    <div className="response-viewer">
      <div className="response-toolbar">
        <div className="response-badges">
          {status != null && (
            <span className={`response-badge response-badge-status response-badge-${getStatusClass(status)}`}>
              {status} {statusText}
            </span>
          )}
          {timeMs != null && (
            <span className="response-badge response-badge-time">
              <span className="response-badge-dot" /> {timeMs} ms
            </span>
          )}
        </div>
        <div className="response-toolbar-actions">
          <div className="response-tabs">
            <button
              type="button"
              className={`response-tab ${activeTab === 'headers' ? 'active' : ''}`}
              onClick={() => setActiveTab('headers')}
            >
              Headers
            </button>
            <button
              type="button"
              className={`response-tab ${activeTab === 'body' ? 'active' : ''}`}
              onClick={() => setActiveTab('body')}
            >
              Body
            </button>
            <button
              type="button"
              className={`response-tab ${activeTab === 'errors' ? 'active' : ''}`}
              onClick={() => setActiveTab('errors')}
            >
              错误日志 ({errorLogs.length})
            </button>
          </div>
          <FastTooltip
            label={
              !textToCopy
                ? activeTab === 'headers'
                  ? '无响应头'
                  : activeTab === 'errors'
                    ? '无错误日志'
                    : '无响应体'
                : activeTab === 'headers'
                  ? '复制全部响应头到剪贴板'
                  : activeTab === 'errors'
                    ? '复制错误日志到剪贴板'
                    : '复制响应体到剪贴板'
            }
          >
            <button
              type="button"
              className={`response-copy-body-btn${copyHint ? ' response-copy-body-btn--done' : ''}`}
              onClick={() => void handleCopyClipboard()}
              disabled={!textToCopy}
              aria-label={
                copyHint
                  ? '已复制到剪贴板'
                  : activeTab === 'headers'
                    ? '复制全部响应头'
                    : activeTab === 'errors'
                      ? '复制错误日志'
                      : '复制响应体'
              }
            >
              {copyHint ? <IconCheckResponse /> : <IconCopyResponse />}
            </button>
          </FastTooltip>
          {activeTab === 'errors' && errorLogs.length > 0 && (
            <button
              type="button"
              className="response-log-clear-btn"
              onClick={clearErrorLogs}
            >
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
      </div>

      {searchOpen && (
        <div className="response-search-bar">
          <input
            ref={searchInputRef}
            type="text"
            autoCapitalize="off"
            autoCorrect="off"
            className="response-search-input"
            placeholder="搜索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.shiftKey ? goPrev() : goNext();
              }
            }}
          />
          <span className="response-search-count">
            {searchQuery.trim()
              ? matchCount > 0
                ? `${currentMatchIndex + 1}/${matchCount}`
                : '无结果'
              : ''}
          </span>
          <FastTooltip label="上一个 (Shift+Enter)">
            <button
              type="button"
              className="response-search-nav"
              onClick={goPrev}
              disabled={matchCount === 0}
            >
              ↑
            </button>
          </FastTooltip>
          <FastTooltip label="下一个 (Enter)">
            <button
              type="button"
              className="response-search-nav"
              onClick={goNext}
              disabled={matchCount === 0}
            >
              ↓
            </button>
          </FastTooltip>
          <FastTooltip label="关闭 (Esc)">
            <button type="button" className="response-search-close" onClick={() => setSearchOpen(false)}>
              ×
            </button>
          </FastTooltip>
        </div>
      )}

      <div className="response-content" ref={contentRef}>
        {activeTab === 'headers' && (
          <div className="response-headers-panel">
            {headerEntries.length === 0 ? (
              <div className="response-empty">
                <span className="response-empty-icon">—</span>
                <p>无响应头</p>
              </div>
            ) : showSearchableContent ? (
              <div className="response-body-json">
                <HighlightedText
                  text={searchableText}
                  searchQuery={searchQuery}
                  contentRef={contentRef}
                  currentMatchLine={matchCount > 0 ? matchLineIndices[currentMatchIndex] ?? -1 : -1}
                />
              </div>
            ) : (
              <div className="response-headers-table">
                {headerEntries.map(([key, value]) => (
                  <div key={key} className="response-header-row">
                    <span className="response-header-key">{key}</span>
                    <span className="response-header-value">{value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {activeTab === 'body' && (
          <div className="response-body-panel">
            {error ? (
              <div className="response-error-card">
                <span className="response-error-icon" aria-hidden>!</span>
                <div>
                  <p className="response-error-title">请求失败</p>
                  <p className="response-error-msg">{error}</p>
                </div>
              </div>
            ) : !body ? (
              <div className="response-empty">
                <span className="response-empty-icon">—</span>
                <p>空响应体</p>
              </div>
            ) : showAsHtml ? (
              <>
                <div className="response-html-tabs">
                  <button
                    type="button"
                    className={`response-html-tab ${htmlViewMode === 'preview' ? 'active' : ''}`}
                    onClick={() => setHtmlViewMode('preview')}
                  >
                    预览
                  </button>
                  <button
                    type="button"
                    className={`response-html-tab ${htmlViewMode === 'source' ? 'active' : ''}`}
                    onClick={() => setHtmlViewMode('source')}
                  >
                    源代码
                  </button>
                </div>
                {htmlViewMode === 'preview' ? (
                  <div className="response-body-html-preview">
                    <iframe
                      title="HTML 预览"
                      srcDoc={body}
                      sandbox="allow-same-origin"
                      className="response-body-html-iframe"
                    />
                  </div>
                ) : showSearchableContent ? (
                  <div className="response-body-json">
                    <HighlightedText
                      text={searchableText}
                      searchQuery={searchQuery}
                      contentRef={contentRef}
                      currentMatchLine={matchCount > 0 ? matchLineIndices[currentMatchIndex] ?? -1 : -1}
                    />
                  </div>
                ) : (
                  <pre className="response-body-raw">{body}</pre>
                )}
              </>
            ) : showSearchableContent ? (
              <div className="response-body-json">
                <HighlightedText
                  text={searchableText}
                  searchQuery={searchQuery}
                  contentRef={contentRef}
                  currentMatchLine={matchCount > 0 ? matchLineIndices[currentMatchIndex] ?? -1 : -1}
                />
              </div>
            ) : parsedBody && !parseError ? (
              <div className="response-body-json">
                <ResponseJsonView data={parsedBody} style={jsonSyntaxStyles} />
              </div>
            ) : (
              <pre className="response-body-raw">{body}</pre>
            )}
          </div>
        )}
        {activeTab === 'errors' && (
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
                      <span className="response-error-log-time">{formatErrorTime(log.timestamp)}</span>
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
    </div>
  );
}
