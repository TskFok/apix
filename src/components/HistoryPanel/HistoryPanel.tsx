import { useEffect, useState } from 'react';
import { message, confirm } from '@tauri-apps/plugin-dialog';
import { useRequestStore } from '../../stores/requestStore';
import { useResponseStore } from '../../stores/responseStore';
import { getHistory, clearHistory, deleteHistoryById, addFavorite } from '../../lib/db';
import { Modal } from '../Modal';
import type { HistoryItem } from '../../types';
import type { Protocol } from '../../types';

interface HistoryPanelProps {
  protocol: Protocol;
  onRefresh?: () => void;
}

export function HistoryPanel({ protocol, onRefresh }: HistoryPanelProps) {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [favoriteModal, setFavoriteModal] = useState<HistoryItem | null>(null);
  const loadFrom = useRequestStore((s) => s.loadFrom);
  const setHttpResponse = useResponseStore((s) => s.setHttpResponse);
  const setMode = useResponseStore((s) => s.setMode);
  const historyRefreshTrigger = useResponseStore((s) => s.historyRefreshTrigger);
  const refreshFavorites = useResponseStore((s) => s.refreshFavorites);

  const fetchHistory = async () => {
    setLoading(true);
    const list = await getHistory();
    setItems(list);
    setLoading(false);
  };

  useEffect(() => {
    fetchHistory();
  }, [protocol, historyRefreshTrigger]);

  const handleClick = (item: HistoryItem) => {
    loadFrom({
      protocol: item.protocol as Protocol,
      method: item.method ?? undefined,
      url: item.url,
      headers: item.headers,
      params: item.params ?? undefined,
      body: item.body ?? undefined,
    });
    if (item.protocol === 'http' && (item.response_headers != null || item.response_body != null)) {
      setMode('http');
      let headers: Record<string, string> = {};
      if (item.response_headers) {
        try {
          headers = JSON.parse(item.response_headers) as Record<string, string>;
        } catch {
          // ignore parse error
        }
      }
      setHttpResponse({
        status: item.response_status,
        headers,
        body: item.response_body ?? '',
        timeMs: item.response_time_ms,
        loading: false,
      });
    }
    onRefresh?.();
  };

  const handleClear = async () => {
    const ok = await confirm('确定要清空全部历史记录吗？此操作不可恢复。', {
      title: '确认清空',
      kind: 'warning',
      okLabel: '确定清空',
      cancelLabel: '取消',
    });
    if (!ok) return;
    await clearHistory();
    setItems([]);
    onRefresh?.();
  };

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    const ok = await confirm('确定要删除这条历史记录吗？', {
      title: '确认删除',
      kind: 'warning',
      okLabel: '确定',
      cancelLabel: '取消',
    });
    if (!ok) return;
    await deleteHistoryById(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
    onRefresh?.();
  };

  const handleFavoriteClick = (e: React.MouseEvent, item: HistoryItem) => {
    e.stopPropagation();
    setFavoriteModal(item);
  };

  const handleFavoriteConfirm = async (name: string) => {
    if (!favoriteModal) return;
    const displayName = name.trim() || (favoriteModal.url.length > 40 ? favoriteModal.url.slice(0, 40) + '...' : favoriteModal.url);
    await addFavorite(
      displayName,
      favoriteModal.protocol,
      favoriteModal.method ?? null,
      favoriteModal.url,
      favoriteModal.headers,
      favoriteModal.params ?? null,
      favoriteModal.body ?? null
    );
    setFavoriteModal(null);
    refreshFavorites();
    onRefresh?.();
    await message('收藏成功！', { title: 'Apix', kind: 'info' });
  };

  const filtered = protocol ? items.filter((i) => i.protocol === protocol) : items;

  const methodClass = (m?: string) => {
    if (!m) return '';
    const lower = m.toUpperCase();
    if (lower === 'GET') return 'method-get';
    if (lower === 'POST') return 'method-post';
    if (lower === 'PUT') return 'method-put';
    if (lower === 'PATCH') return 'method-patch';
    if (lower === 'DELETE') return 'method-delete';
    if (lower === 'HEAD') return 'method-head';
    if (lower === 'OPTIONS') return 'method-options';
    return '';
  };

  return (
    <div className="history-panel">
      <div className="panel-header">
        <h3>历史记录</h3>
        <button type="button" className="clear-btn" onClick={handleClear}>
          清空
        </button>
      </div>
      {loading ? (
        <p className="muted">加载中...</p>
      ) : filtered.length === 0 ? (
        <p className="muted">暂无历史</p>
      ) : (
        <ul className="history-list">
          {filtered.map((item) => (
            <li
              key={item.id}
              className="history-item"
              onClick={() => handleClick(item)}
            >
              <div className="history-item-main">
                <div className="history-item-tags">
                  <span className="item-protocol">{item.protocol}</span>
                  {item.method && (
                    <span className={`item-method ${methodClass(item.method)}`}>
                      {item.method}
                    </span>
                  )}
                  <button
                    type="button"
                    className="item-favorite-btn"
                    onClick={(e) => handleFavoriteClick(e, item)}
                    title="收藏"
                    aria-label="收藏此记录"
                  >
                    ☆
                  </button>
                  <button
                    type="button"
                    className="item-delete-btn"
                    onClick={(e) => handleDelete(e, item.id)}
                    title="删除"
                    aria-label="删除此记录"
                  >
                    ×
                  </button>
                </div>
                <span className="item-url" title={item.url}>
                  {item.url}
                </span>
                <span className="item-time">
                  {new Date(item.created_at).toLocaleString()}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Modal
        key={favoriteModal?.id}
        open={!!favoriteModal}
        title="收藏请求"
        defaultValue={favoriteModal ? (favoriteModal.url.length > 40 ? favoriteModal.url.slice(0, 40) + '...' : favoriteModal.url) : ''}
        placeholder="请输入收藏名称"
        onClose={() => setFavoriteModal(null)}
        onConfirm={handleFavoriteConfirm}
        confirmLabel="收藏"
      />
    </div>
  );
}
