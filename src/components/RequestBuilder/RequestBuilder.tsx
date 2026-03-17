import { useState, useEffect, useCallback, useMemo } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { useRequestStore } from '../../stores/requestStore';
import type { HttpMethod, BodyType } from '../../types';
import { FileSelectModal } from '../FileSelectModal/FileSelectModal';
import { buildDisplayUrl, parseUrlToBaseAndParams } from '../../lib/http';

const METHODS: HttpMethod[] = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
];

interface RequestBuilderProps {
  onSendHttp: () => void;
  onConnectWs: () => void;
  onDisconnectWs: () => void;
  onConnectSse: () => void;
  onDisconnectSse: () => void;
  onSendWsMessage?: (msg: string) => void;
  wsConnected: boolean;
  sseConnected: boolean;
}

export function RequestBuilder({
  onSendHttp,
  onConnectWs,
  onDisconnectWs,
  onConnectSse,
  onDisconnectSse,
  onSendWsMessage,
  wsConnected,
  sseConnected,
}: RequestBuilderProps) {
  const [wsMessage, setWsMessage] = useState('');
  const {
    protocol,
    method,
    url,
    headers,
    queryParams,
    body,
    bodyType,
    bodyFormFields,
    rawType,
    binaryPath,
    setProtocol,
    setMethod,
    setUrl,
    setHeaders,
    setQueryParams,
    setBody,
    setBodyType,
    setBodyFormFields,
    setRawType,
    setBinaryPath,
    addHeader,
    removeHeader,
    addQueryParam,
    removeQueryParam,
    addBodyFormField,
    removeBodyFormField,
    getQueryParamsRecord,
  } = useRequestStore();

  const displayUrl = useMemo(
    () => buildDisplayUrl(url, getQueryParamsRecord()),
    [url, getQueryParamsRecord, queryParams]
  );

  const handleUrlChange = useCallback(
    (value: string) => {
      const { base, params } = parseUrlToBaseAndParams(value);
      setUrl(base);
      if (params.length > 0) {
        const EMPTY_KV = { key: '', value: '', description: '', enabled: true };
        const next = params.map((p) => ({ ...p, description: '', enabled: true }));
        next.push({ ...EMPTY_KV });
        setQueryParams(next);
      } else {
        setQueryParams([{ key: '', value: '', description: '', enabled: true }]);
      }
    },
    [setUrl, setQueryParams]
  );

  const [activeTab, setActiveTab] = useState<'params' | 'headers' | 'body'>('params');
  const [fileModalFieldIndex, setFileModalFieldIndex] = useState<number | null>(null);

  const isHttp = protocol === 'http';
  const isWs = protocol === 'ws';
  const isSse = protocol === 'sse';

  const handleSend = useCallback(() => {
    if (!url.trim()) return;
    if (isHttp) onSendHttp();
    else if (isWs) wsConnected ? onDisconnectWs() : onConnectWs();
    else if (isSse) sseConnected ? onDisconnectSse() : onConnectSse();
  }, [url, isHttp, isWs, isSse, wsConnected, sseConnected, onSendHttp, onConnectWs, onDisconnectWs, onConnectSse, onDisconnectSse]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSend();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [handleSend]);

  useEffect(() => {
    if (bodyType !== 'form-data') setFileModalFieldIndex(null);
  }, [bodyType]);

  const getSendButtonLabel = () => {
    if (isHttp) return '发送';
    if (isWs) return wsConnected ? '断开' : '连接';
    if (isSse) return sseConnected ? '断开' : '连接';
    return '发送';
  };

  return (
    <div className="request-builder">
      <div className="request-bar">
        <div className="protocol-tabs">
          {(['http', 'ws', 'sse'] as const).map((p) => (
            <button
              key={p}
              type="button"
              className={`protocol-tab ${protocol === p ? 'active' : ''}`}
              onClick={() => setProtocol(p)}
            >
              {p.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="url-row">
          {isHttp && (
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as HttpMethod)}
              className="method-select"
            >
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          )}
          <input
            type="text"
            autoCapitalize="off"
            autoCorrect="off"
            value={displayUrl}
            onChange={(e) => handleUrlChange(e.target.value)}
            placeholder={
              isHttp
                ? 'https://api.example.com/...'
                : isWs
                  ? 'ws://localhost:8080'
                  : 'https://api.example.com/events'
            }
            className="url-input"
          />
          <button
            type="button"
            className="send-btn"
            onClick={handleSend}
            disabled={!url.trim()}
            title={`${getSendButtonLabel()} (⌘↵ 或 Ctrl+↵)`}
          >
            {getSendButtonLabel()}
          </button>
        </div>
      </div>

      <div className="request-tabs">
        <button
          type="button"
          className={activeTab === 'params' ? 'active' : ''}
          onClick={() => setActiveTab('params')}
        >
          Params
        </button>
        <button
          type="button"
          className={activeTab === 'headers' ? 'active' : ''}
          onClick={() => setActiveTab('headers')}
        >
          Headers
        </button>
        {(isHttp || (isWs && wsConnected)) && (
          <button
            type="button"
            className={activeTab === 'body' ? 'active' : ''}
            onClick={() => setActiveTab('body')}
          >
            {isWs ? 'Messages' : 'Body'}
          </button>
        )}
      </div>

      <div className="request-panel">
        {activeTab === 'params' && (
          <div className="params-editor">
            <div className="form-fields-table">
              <div className="form-fields-header">
                <span className="col-checkbox" />
                <span className="col-key">key</span>
                <span className="col-value">value</span>
                <span className="col-desc">description</span>
                <span className="col-actions" />
              </div>
              {queryParams.map((p, i) => (
                <div key={i} className="form-field-row">
                  <label className="col-checkbox col-checkbox-label">
                    <input
                      type="checkbox"
                      checked={p.enabled !== false}
                      onChange={(e) => {
                        const next = [...queryParams];
                        next[i] = { ...next[i], enabled: e.target.checked };
                        setQueryParams(next);
                      }}
                    />
                  </label>
                  <div className="col-key">
                    <input
                      className="col-key-input"
                      autoCapitalize="off"
                      autoCorrect="off"
                      placeholder="key"
                      value={p.key}
                      onChange={(e) => {
                        const next = [...queryParams];
                        next[i] = { ...next[i], key: e.target.value };
                        setQueryParams(next);
                      }}
                    />
                  </div>
                  <div className="col-value">
                    <input
                      className="col-value-input"
                      autoCapitalize="off"
                      autoCorrect="off"
                      placeholder="value"
                      value={p.value}
                      onChange={(e) => {
                        const next = [...queryParams];
                        next[i] = { ...next[i], value: e.target.value };
                        setQueryParams(next);
                      }}
                    />
                  </div>
                  <div className="col-desc">
                    <input
                      className="col-desc-input"
                      autoCapitalize="off"
                      autoCorrect="off"
                      placeholder="描述（不参与请求）"
                      value={p.description}
                      onChange={(e) => {
                        const next = [...queryParams];
                        next[i] = { ...next[i], description: e.target.value };
                        setQueryParams(next);
                      }}
                    />
                  </div>
                <div className="col-actions">
                  <button
                    type="button"
                    className="remove-btn"
                    onClick={() => removeQueryParam(i)}
                    title="删除"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                      <path d="M10 11v6M14 11v6" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
            </div>
            <button type="button" className="form-add-btn" onClick={addQueryParam}>
              + 添加参数
            </button>
          </div>
        )}
        {activeTab === 'headers' && (
          <div className="headers-editor">
            <div className="form-fields-table">
              <div className="form-fields-header">
                <span className="col-checkbox" />
                <span className="col-key">key</span>
                <span className="col-value">value</span>
                <span className="col-desc">description</span>
                <span className="col-actions" />
              </div>
              {headers.map((h, i) => (
                <div key={i} className="form-field-row">
                  <label className="col-checkbox col-checkbox-label">
                    <input
                      type="checkbox"
                      checked={h.enabled !== false}
                      onChange={(e) => {
                        const next = [...headers];
                        next[i] = { ...next[i], enabled: e.target.checked };
                        setHeaders(next);
                      }}
                    />
                  </label>
                  <div className="col-key">
                    <input
                      className="col-key-input"
                      autoCapitalize="off"
                      autoCorrect="off"
                      placeholder="Header"
                      value={h.key}
                      onChange={(e) => {
                        const next = [...headers];
                        next[i] = { ...next[i], key: e.target.value };
                        setHeaders(next);
                      }}
                    />
                  </div>
                  <div className="col-value">
                    <input
                      className="col-value-input"
                      autoCapitalize="off"
                      autoCorrect="off"
                      placeholder="Value"
                      value={h.value}
                      onChange={(e) => {
                        const next = [...headers];
                        next[i] = { ...next[i], value: e.target.value };
                        setHeaders(next);
                      }}
                    />
                  </div>
                  <div className="col-desc">
                    <input
                      className="col-desc-input"
                      autoCapitalize="off"
                      autoCorrect="off"
                      placeholder="描述（不参与请求）"
                      value={h.description}
                      onChange={(e) => {
                        const next = [...headers];
                        next[i] = { ...next[i], description: e.target.value };
                        setHeaders(next);
                      }}
                    />
                  </div>
                <div className="col-actions">
                  <button
                    type="button"
                    className="remove-btn"
                    onClick={() => removeHeader(i)}
                    title="删除"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                      <path d="M10 11v6M14 11v6" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
            </div>
            <button type="button" className="form-add-btn" onClick={addHeader}>
              + 添加 Header
            </button>
          </div>
        )}
        {activeTab === 'body' && isWs && wsConnected && onSendWsMessage && (
          <div className="ws-send">
            <input
              type="text"
              autoCapitalize="off"
              autoCorrect="off"
              placeholder="输入消息并发送"
              value={wsMessage}
              onChange={(e) => setWsMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onSendWsMessage(wsMessage);
                  setWsMessage('');
                }
              }}
            />
            <button
              type="button"
              onClick={() => {
                onSendWsMessage(wsMessage);
                setWsMessage('');
              }}
            >
              发送
            </button>
          </div>
        )}
        {activeTab === 'body' && isHttp && (
          <div className="body-editor">
            <div className="body-type-select">
              {(['form-data', 'x-www-form-urlencoded', 'raw', 'binary'] as BodyType[]).map((t) => (
                <label key={t}>
                  <input
                    type="radio"
                    checked={bodyType === t}
                    onChange={() => setBodyType(t)}
                  />
                  {t === 'form-data' && 'form-data'}
                  {t === 'x-www-form-urlencoded' && 'x-www-form-urlencoded'}
                  {t === 'raw' && 'raw'}
                  {t === 'binary' && 'binary'}
                </label>
              ))}
            </div>

            {(bodyType === 'form-data' || bodyType === 'x-www-form-urlencoded') && (
              <div className="body-form-fields">
                <div className="form-fields-table">
                  <div className="form-fields-header">
                    <span className="col-checkbox" />
                    <span className="col-key">key</span>
                    <span className="col-value">value</span>
                    <span className="col-desc">description</span>
                    <span className="col-actions" />
                  </div>
                  {bodyFormFields.map((f, i) => (
                    <div key={i} className="form-field-row">
                      <label className="col-checkbox col-checkbox-label">
                        <input
                          type="checkbox"
                          checked={f.enabled !== false}
                          onChange={(e) => {
                            const next = [...bodyFormFields];
                            next[i] = { ...next[i], enabled: e.target.checked };
                            setBodyFormFields(next);
                          }}
                        />
                      </label>
                    <div className={`col-key ${bodyType === 'form-data' ? 'col-key-with-type' : 'col-key-simple'}`}>
                      <input
                        className="col-key-input"
                        autoCapitalize="off"
                        autoCorrect="off"
                        placeholder="key"
                        value={f.key}
                        onChange={(e) => {
                          const next = [...bodyFormFields];
                          next[i] = { ...next[i], key: e.target.value };
                          setBodyFormFields(next);
                        }}
                      />
                      {bodyType === 'form-data' && (
                        <div className="value-type-toggle" role="group" aria-label="值类型">
                          <button
                            type="button"
                            className={`value-type-btn ${f.type !== 'file' ? 'active' : ''}`}
                            onClick={() => {
                              const next = [...bodyFormFields];
                              next[i] = { ...next[i], type: 'text' as const, value: next[i].value, files: undefined, filePath: undefined };
                              setBodyFormFields(next);
                            }}
                          >
                            Text
                          </button>
                          <button
                            type="button"
                            className={`value-type-btn ${f.type === 'file' ? 'active' : ''}`}
                            onClick={() => {
                              const next = [...bodyFormFields];
                              next[i] = { ...next[i], type: 'file' as const, value: '', files: next[i].files ?? [], filePath: undefined };
                              setBodyFormFields(next);
                            }}
                          >
                            File
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="col-value form-value-cell">
                      {bodyType === 'form-data' && f.type === 'file' ? (
                        <div
                          className="file-list-wrap file-value-trigger"
                          onClick={() => setFileModalFieldIndex(i)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => e.key === 'Enter' && setFileModalFieldIndex(i)}
                        >
                          <div className="file-list">
                            {(f.files ?? (f.filePath ? [{ path: f.filePath, name: f.value || f.filePath.replace(/^.*[/\\]/, '') }] : [])).map((file, fi) => (
                              <div
                                key={fi}
                                className="file-item"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <span className="file-item-name" title={file.path}>{file.name}</span>
                                <button
                                  type="button"
                                  className="file-item-remove"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const next = [...bodyFormFields];
                                    const files = next[i].files ?? (next[i].filePath ? [{ path: next[i].filePath!, name: next[i].value || next[i].filePath!.replace(/^.*[/\\]/, '') }] : []);
                                    const newFiles = files.filter((_, idx) => idx !== fi);
                                    next[i] = {
                                      ...next[i],
                                      type: 'file' as const,
                                      files: newFiles,
                                      filePath: undefined,
                                      value: '',
                                    };
                                    setBodyFormFields(next);
                                  }}
                                  title="删除"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                            {(!f.files || f.files.length === 0) && !f.filePath && (
                              <span className="file-empty">点击选择文件</span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <input
                          className="col-value-input"
                          autoCapitalize="off"
                          autoCorrect="off"
                          placeholder="value"
                          value={f.value}
                          onChange={(e) => {
                            const next = [...bodyFormFields];
                            next[i] = { ...next[i], value: e.target.value, type: 'text' as const };
                            setBodyFormFields(next);
                          }}
                        />
                      )}
                    </div>
                    <input
                      className="col-desc col-desc-input"
                      autoCapitalize="off"
                      autoCorrect="off"
                      placeholder="描述（不参与请求）"
                      value={f.description}
                      onChange={(e) => {
                        const next = [...bodyFormFields];
                        next[i] = { ...next[i], description: e.target.value };
                        setBodyFormFields(next);
                      }}
                    />
                    <div className="col-actions">
                      <button
                        type="button"
                        className="remove-btn"
                        onClick={() => removeBodyFormField(i)}
                        title="删除"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                          <path d="M10 11v6M14 11v6" strokeLinecap="round" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
                </div>
                <button type="button" className="form-add-btn" onClick={addBodyFormField}>
                  + 添加字段
                </button>
                {bodyType === 'form-data' && fileModalFieldIndex !== null && (
                  <FileSelectModal
                    open={true}
                    onClose={() => setFileModalFieldIndex(null)}
                    files={
                      bodyFormFields[fileModalFieldIndex]?.files ??
                      (bodyFormFields[fileModalFieldIndex]?.filePath
                        ? [{ path: bodyFormFields[fileModalFieldIndex].filePath!, name: bodyFormFields[fileModalFieldIndex].value || bodyFormFields[fileModalFieldIndex].filePath!.replace(/^.*[/\\]/, '') }]
                        : [])
                    }
                    onFilesChange={(files) => {
                      const next = [...bodyFormFields];
                      const idx = fileModalFieldIndex;
                      if (idx >= 0 && idx < next.length) {
                        next[idx] = {
                          ...next[idx],
                          type: 'file' as const,
                          files,
                          filePath: undefined,
                          value: '',
                        };
                        setBodyFormFields(next);
                      }
                    }}
                    onSelectFromLocal={async () => {
                      const selected = await open({ multiple: true, directory: false });
                      const paths = selected == null ? [] : Array.isArray(selected) ? selected : [selected];
                      if (paths.length > 0) {
                        const idx = fileModalFieldIndex;
                        const curFiles = bodyFormFields[idx]?.files ?? (bodyFormFields[idx]?.filePath ? [{ path: bodyFormFields[idx].filePath!, name: bodyFormFields[idx].value || bodyFormFields[idx].filePath!.replace(/^.*[/\\]/, '') }] : []);
                        const newEntries = paths.map((p) => ({ path: p, name: p.replace(/^.*[/\\]/, '') }));
                        const next = [...bodyFormFields];
                        next[idx] = {
                          ...next[idx],
                          type: 'file' as const,
                          files: [...curFiles, ...newEntries],
                          filePath: undefined,
                          value: '',
                        };
                        setBodyFormFields(next);
                      }
                    }}
                  />
                )}
              </div>
            )}

            {bodyType === 'raw' && (
              <>
                <div className="raw-type-select">
                  <label>
                    <input
                      type="radio"
                      checked={rawType === 'json'}
                      onChange={() => setRawType('json')}
                    />
                    JSON
                  </label>
                  <label>
                    <input
                      type="radio"
                      checked={rawType === 'text'}
                      onChange={() => setRawType('text')}
                    />
                    Text
                  </label>
                  <label>
                    <input
                      type="radio"
                      checked={rawType === 'xml'}
                      onChange={() => setRawType('xml')}
                    />
                    XML
                  </label>
                </div>
                <textarea
                  autoCapitalize="off"
                  autoCorrect="off"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder='{"key": "value"}'
                  rows={8}
                />
              </>
            )}

            {bodyType === 'binary' && (
              <div className="binary-select">
                <input
                  type="text"
                  className="binary-path-input"
                  autoCapitalize="off"
                  autoCorrect="off"
                  placeholder="选择文件或输入路径"
                  value={binaryPath}
                  onChange={(e) => setBinaryPath(e.target.value)}
                />
                <button
                  type="button"
                  onClick={async () => {
                    const selected = await open({
                      multiple: false,
                      directory: false,
                    });
                    if (selected) setBinaryPath(selected);
                  }}
                >
                  选择文件
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
