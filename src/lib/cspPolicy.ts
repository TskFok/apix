export function normalizeCspSources(value: unknown): string[] {
  if (typeof value === 'string') {
    return value.split(/\s+/).filter(Boolean);
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) =>
      typeof item === 'string' ? item.split(/\s+/).filter(Boolean) : []
    );
  }
  return [];
}
