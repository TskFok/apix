import { useEffect, useState } from 'react';
import { confirm } from '@tauri-apps/plugin-dialog';
import { useRequestStore } from '../../stores/requestStore';
import {
  getFavorites,
  deleteFavorite,
} from '../../lib/db';
import { useResponseStore } from '../../stores/responseStore';
import type { FavoriteItem } from '../../types';
import type { Protocol } from '../../types';

interface FavoritesPanelProps {
  protocol: Protocol;
  onRefresh?: () => void;
}

export function FavoritesPanel({
  protocol,
  onRefresh,
}: FavoritesPanelProps) {
  const [items, setItems] = useState<FavoriteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const loadFrom = useRequestStore((s) => s.loadFrom);
  const favoritesRefreshTrigger = useResponseStore((s) => s.favoritesRefreshTrigger);

  const fetchFavorites = async () => {
    setLoading(true);
    const list = await getFavorites();
    setItems(list);
    setLoading(false);
  };

  useEffect(() => {
    fetchFavorites();
  }, [protocol, favoritesRefreshTrigger]);

  const handleClick = (item: FavoriteItem) => {
    loadFrom({
      protocol: item.protocol as Protocol,
      method: item.method ?? undefined,
      url: item.url,
      headers: item.headers,
      params: item.params ?? undefined,
      body: item.body ?? undefined,
    });
    onRefresh?.();
  };

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    const ok = await confirm('确定要删除这条收藏吗？', {
      title: '确认删除',
      kind: 'warning',
      okLabel: '确定',
      cancelLabel: '取消',
    });
    if (!ok) return;
    await deleteFavorite(id);
    fetchFavorites();
    onRefresh?.();
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
    <div className="favorites-panel">
      <div className="panel-header">
        <h3>收藏</h3>
      </div>
      {loading ? (
        <p className="muted">加载中...</p>
      ) : filtered.length === 0 ? (
        <p className="muted">暂无收藏</p>
      ) : (
        <ul className="favorites-list">
          {filtered.map((item) => (
            <li
              key={item.id}
              className="favorite-item"
              onClick={() => handleClick(item)}
            >
              <div className="favorite-item-main">
                <div className="favorite-item-tags">
                  <span className="favorite-item-name">{item.name}</span>
                  <span className="item-protocol">{item.protocol}</span>
                  {item.method && (
                    <span className={`item-method ${methodClass(item.method)}`}>
                      {item.method}
                    </span>
                  )}
                  <button
                    type="button"
                    className="item-delete-btn favorite-delete-btn"
                    onClick={(e) => handleDelete(e, item.id)}
                    title="删除"
                    aria-label="删除此收藏"
                  >
                    ×
                  </button>
                </div>
                <span className="favorite-item-url" title={item.url}>
                  {item.url}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
