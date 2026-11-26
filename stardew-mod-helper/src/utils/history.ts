import type { HistoryEntry } from '../types/domain';

/** 历史筛选条件：模糊词 + 模组 ID（'all' 表示全部）。 */
export interface HistoryFilter {
  search: string;
  modId: number | 'all';
}

/**
 * 大小写不敏感模糊匹配：modName / fileName / String(modId) 三选一命中即可；空词恒 true。
 */
export function matchHistoryEntry(entry: HistoryEntry, search: string): boolean {
  const q = search.trim().toLowerCase();
  if (q.length === 0) {
    return true;
  }
  return (
    entry.modName.toLowerCase().includes(q) ||
    entry.fileName.toLowerCase().includes(q) ||
    String(entry.modId).toLowerCase().includes(q)
  );
}

/**
 * 组合筛选：模组筛选 ∧ 搜索，均满足才保留；不改变入参顺序（原 history 已按时间倒序）。
 */
export function filterHistory(
  history: HistoryEntry[],
  filter: HistoryFilter,
): HistoryEntry[] {
  return history.filter(
    (entry) =>
      (filter.modId === 'all' || entry.modId === filter.modId) &&
      matchHistoryEntry(entry, filter.search),
  );
}

/** 模组筛选下拉项。 */
export interface ModOption {
  modId: number;
  label: string;
}

/**
 * 从 history 按 modId 去重生成筛选项（同 ID 保留首次出现的名称），
 * 按 label 用 localeCompare('zh-CN') 排序。
 */
export function buildModOptions(history: HistoryEntry[]): ModOption[] {
  const byModId = new Map<number, string>();
  for (const entry of history) {
    if (!byModId.has(entry.modId)) {
      byModId.set(entry.modId, entry.modName);
    }
  }
  return Array.from(byModId, ([modId, name]) => ({
    modId,
    label: `${name}（${modId}）`,
  })).sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'));
}
