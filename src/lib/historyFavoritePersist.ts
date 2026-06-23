import { getHistoryById, getFavoriteById, updateFavorite } from './db';
import { resolveHistoryRemarkForUpdate, resolveFavoriteNameForUpdate } from './persistProjectEndpoint';

export async function resolveRemarkForHistoryPersistence(
  currentHistoryId: number | null,
  endpointRemark: string
): Promise<string | null> {
  if (currentHistoryId != null) {
    const row = await getHistoryById(currentHistoryId);
    return resolveHistoryRemarkForUpdate(row?.remark ?? null, endpointRemark);
  }
  return endpointRemark.trim() || null;
}

export async function persistFavoriteDraftIfNeeded(
  currentFavoriteId: number | null,
  args: {
    url: string;
    protocol: string;
    method: string | null;
    headers: string;
    params: string | null;
    body: string | null;
    endpointRemark: string;
  },
  refreshFavorites: () => void
): Promise<void> {
  if (currentFavoriteId == null) return;
  const fav = await getFavoriteById(currentFavoriteId);
  const name = resolveFavoriteNameForUpdate(fav?.name, args.url, args.endpointRemark);
  await updateFavorite(
    currentFavoriteId,
    name,
    args.protocol,
    args.method,
    args.url,
    args.headers,
    args.params,
    args.body
  );
  refreshFavorites();
}
