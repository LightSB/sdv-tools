/** 【v4 R51】按一组 Nexus ID 自动勾选：纯集合求交，零网络。输入文本由 action 先经 modParser.parseModIds 解析。 */
import type { LocalMod } from '../types/workspace';

export interface MatchResult {
  matchedIds: string[];
  unmatchedIds: number[];
}

/**
 * inputIds ∩ mod.nexusModIds ≠ ∅ 即命中；未命中的 id 汇总返回。
 * 只返回本地模组 id 列表，不写回模组对象（勾选单一数据源为 selectedPackIds）。
 */
export function matchModsByInputIds(mods: LocalMod[], inputIds: number[]): MatchResult {
  const matchedIds: string[] = [];
  const matchedNumbers = new Set<number>();
  const candidates = Array.isArray(inputIds)
    ? Array.from(new Set(inputIds.filter((id) => Number.isSafeInteger(id) && id > 0)))
    : [];

  for (const mod of Array.isArray(mods) ? mods : []) {
    const nexusIds = Array.isArray(mod.nexusModIds) ? mod.nexusModIds : [];
    const hit = candidates.some((id) => nexusIds.includes(id));
    if (!hit) {
      continue;
    }
    matchedIds.push(mod.id);
    for (const id of nexusIds) {
      if (candidates.includes(id)) {
        matchedNumbers.add(id);
      }
    }
  }

  return {
    matchedIds,
    unmatchedIds: candidates.filter((id) => !matchedNumbers.has(id)),
  };
}
