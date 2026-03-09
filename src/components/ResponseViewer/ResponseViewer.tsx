import { useState, useEffect, useRef, useMemo } from 'react';
import { JsonView, defaultStyles } from 'react-json-view-lite';
import 'react-json-view-lite/dist/index.css';
import { useResponseStore } from '../../stores/responseStore';

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

/** 从响应头中获取 content-type（不区分大小写），可能带参数如 "text/html; charset=utf-8" */
export function getContentTypeFromHeaders(headers: Record<string, string>): string | undefined {
  const key = Object.keys(headers).find((k) => k.toLowerCase() === 'content-type');
  return key ? headers[key] : undefined;
}

export function isHtmlResponse(headers: Record<string, string>): boolean {
  const ct = getContentTypeFromHeaders(headers);
  return ct != null && ct.trim().toLowerCase().startsWith('text/html');
}

export function ResponseViewer() {
  const [activeTab, setActiveTab] = useState<'headers' | 'body'>('body');
  const [htmlViewMode, setHtmlViewMode] = useState<'preview' | 'source'>('preview');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const { http } = useResponseStore();
  const { status, statusText, headers, body, timeMs, loading, error } = http;

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

  const searchableText = useMemo(() => {
    if (activeTab === 'headers') {
      return Object.entries(headers)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n');
    }
    if (activeTab === 'body' && body) {
      try {
        return JSON.stringify(JSON.parse(body), null, 2);
      } catch {
        return body;
      }
    }
    return '';
  }, [activeTab, headers, body]);

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

  if (error) {
    return (
      <div className="response-viewer error">
        <div className="response-error-card">
          <span className="response-error-icon" aria-hidden>!</span>
          <div>
            <p className="response-error-title">请求失败</p>
            <p className="response-error-msg">{error}</p>
          </div>
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
          <button
            type="button"
            className="response-search-nav"
            onClick={goPrev}
            title="上一个 (Shift+Enter)"
            disabled={matchCount === 0}
          >
            ↑
          </button>
          <button
            type="button"
            className="response-search-nav"
            onClick={goNext}
            title="下一个 (Enter)"
            disabled={matchCount === 0}
          >
            ↓
          </button>
          <button
            type="button"
            className="response-search-close"
            onClick={() => setSearchOpen(false)}
            title="关闭 (Esc)"
          >
            ×
          </button>
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
            {!body ? (
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
                <JsonView data={parsedBody} style={jsonSyntaxStyles} />
              </div>
            ) : (
              <pre className="response-body-raw">{body}</pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
