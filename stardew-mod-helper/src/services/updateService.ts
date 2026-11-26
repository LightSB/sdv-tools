import { APP_CONFIG } from '../config';
import type { ModFile } from '../types/nexus';
import type { LocalMod, UpdateDetectionResult, UpdateInfo } from '../types/workspace';
import { formatError } from '../utils/errors';
import { fetchFiles } from './nexusApi';

const NO_MANIFEST_MESSAGE =
  '此模组缺少 manifest.json 或 UpdateKeys，无法自动检测更新，请到 N 网手动查看。';
const NO_FILES_MESSAGE = 'N 网未找到可用文件';

/** 【纯函数 Q3】UpdateKeys → Nexus modId：仅 'Nexus:' 前缀、去 @子键、数字校验、去重保序。 */
export function extractNexusModIds(updateKeys: string[]): number[] {
  if (!Array.isArray(updateKeys)) {
    return [];
  }
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const key of updateKeys) {
    if (typeof key !== 'string' || !/^Nexus:/i.test(key)) {
      continue;
    }
    const raw = key.slice(6).split('@')[0].trim();
    if (!/^\d+$/.test(raw)) {
      continue;
    }
    const modId = Number(raw);
    if (!Number.isSafeInteger(modId) || modId <= 0 || seen.has(modId)) {
      continue;
    }
    seen.add(modId);
    ids.push(modId);
  }
  return ids;
}

/** 【纯函数 Q2】版本号逐段比较：a>b → 1，a<b → -1，相等 → 0，任一不可解析 → null。 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 | null {
  const parse = (value: string): number[] | null => {
    if (typeof value !== 'string') {
      return null;
    }
    const matched = value.trim().match(/^v?(\d+(?:\.\d+)*)/);
    if (!matched) {
      return null;
    }
    return matched[1].split('.').map((segment) => Number(segment));
  };
  const left = parse(a);
  const right = parse(b);
  if (left === null || right === null) {
    return null;
  }
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = left[index] ?? 0;
    const rightPart = right[index] ?? 0;
    if (leftPart > rightPart) {
      return 1;
    }
    if (leftPart < rightPart) {
      return -1;
    }
  }
  return 0;
}

/** 【纯函数】选最新主文件：is_primary 优先（多个取 uploaded_at 最新），无主文件取 uploaded_at 最新。 */
export function pickLatestFile(files: ModFile[]): ModFile | null {
  if (!Array.isArray(files) || files.length === 0) {
    return null;
  }
  const primaryFiles = files.filter((file) => Boolean(file) && file.is_primary === true);
  const pool = primaryFiles.length > 0 ? primaryFiles : files.filter((file) => Boolean(file));
  if (pool.length === 0) {
    return null;
  }
  const uploadedTime = (file: ModFile): number => {
    const parsed = Date.parse(file.uploaded_at);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  return pool.reduce((best, current) => (uploadedTime(current) > uploadedTime(best) ? current : best), pool[0]);
}

/**
 * 【纯函数】版本优先 / 时间兜底判定；多 modId 任一 outdated 即整体 outdated。
 * failedIds 只在全部失败（latest 为空）时参与 unknown 判定，部分失败按成功结果判定（Q3）。
 */
export function decideUpdateStatus(
  local: Pick<LocalMod, 'version' | 'lastCheckedAt' | 'addedAt'>,
  latest: UpdateInfo[],
  failedIds: number[] = [],
): UpdateDetectionResult {
  const infos = Array.isArray(latest) ? latest : [];
  if (infos.length === 0) {
    return {
      status: 'unknown',
      updateInfo: null,
      checkError: failedIds.length > 0 ? '更新检测失败，请稍后重试' : NO_FILES_MESSAGE,
    };
  }

  const baselineRaw = local.lastCheckedAt ?? local.addedAt;
  const baseline = Date.parse(baselineRaw);
  const baselineTime = Number.isFinite(baseline) ? baseline : 0;

  let bestOutdated: UpdateInfo | null = null;
  let localNewer = false;

  for (const info of infos) {
    const comparison = compareVersions(local.version, info.version);
    let outdated = false;
    if (comparison === null) {
      const uploaded = Date.parse(info.uploadedAt);
      outdated = Number.isFinite(uploaded) && uploaded > baselineTime;
    } else if (comparison < 0) {
      outdated = true;
    } else if (comparison > 0) {
      localNewer = true;
    }

    if (outdated) {
      if (bestOutdated === null) {
        bestOutdated = info;
      } else {
        const versionCompare = compareVersions(info.version, bestOutdated.version);
        const newerByVersion = versionCompare === 1;
        const newerByTime =
          versionCompare === null && Date.parse(info.uploadedAt) > Date.parse(bestOutdated.uploadedAt);
        if (newerByVersion || newerByTime) {
          bestOutdated = info;
        }
      }
    }
  }

  if (bestOutdated !== null) {
    return { status: 'outdated', updateInfo: bestOutdated, checkError: '' };
  }
  return {
    status: 'latest',
    updateInfo: infos[0],
    checkError: localNewer ? '本地版本较新' : '',
  };
}

/**
 * 检测单个模组：manifest=null 或 nexusModIds 为空 → 直接 unknown（不发请求）；
 * 否则对每个 modId 串行 fetchFiles（files.json），汇总后 decideUpdateStatus。
 */
export async function detectModUpdate(
  localMod: LocalMod,
  apiKey: string,
): Promise<UpdateDetectionResult> {
  if (localMod.manifest === null || localMod.nexusModIds.length === 0) {
    return { status: 'unknown', updateInfo: null, checkError: NO_MANIFEST_MESSAGE };
  }

  const successes: UpdateInfo[] = [];
  const failures: Array<{ modId: number; error: unknown }> = [];
  for (const modId of localMod.nexusModIds) {
    try {
      const files = await fetchFiles(modId, apiKey);
      const latestFile = pickLatestFile(files);
      if (latestFile === null) {
        failures.push({ modId, error: new Error(NO_FILES_MESSAGE) });
        continue;
      }
      successes.push({
        modId,
        version: typeof latestFile.version === 'string' ? latestFile.version : '',
        uploadedAt: typeof latestFile.uploaded_at === 'string' ? latestFile.uploaded_at : '',
        fileId: latestFile.file_id,
      });
    } catch (error) {
      failures.push({ modId, error });
    }
  }

  if (successes.length === 0) {
    return {
      status: 'unknown',
      updateInfo: null,
      checkError: failures.length > 0 ? formatError(failures[0].error) : NO_FILES_MESSAGE,
    };
  }
  return decideUpdateStatus(localMod, successes, failures.map((failure) => failure.modId));
}

/**
 * 批量检测：并发 ≤ APP_CONFIG.update.concurrency 的 worker pool；
 * 缓存命中（未过期且 force=false）跳过；每条完成即 onResult；单条失败不中断。
 */
export async function detectAllUpdates(
  mods: LocalMod[],
  apiKey: string,
  onResult: (id: string, result: UpdateDetectionResult) => void,
  force = false,
): Promise<Record<string, UpdateDetectionResult>> {
  const results: Record<string, UpdateDetectionResult> = {};
  let cursor = 0;
  const size = Math.min(APP_CONFIG.update.concurrency, mods.length);
  const workers = Array.from({ length: size }, async () => {
    while (cursor < mods.length) {
      const mod = mods[cursor++];
      const cached =
        mod.lastCheckedAt !== null &&
        Date.now() - Date.parse(mod.lastCheckedAt) < APP_CONFIG.update.cacheTtlMs &&
        mod.updateStatus !== 'unknown';
      let result: UpdateDetectionResult;
      if (cached && !force) {
        result = {
          status: mod.updateStatus,
          updateInfo: mod.updateInfo,
          checkError: mod.checkError,
        };
      } else {
        try {
          result = await detectModUpdate(mod, apiKey);
        } catch (error) {
          result = { status: 'unknown', updateInfo: null, checkError: formatError(error) };
        }
      }
      results[mod.id] = result;
      onResult(mod.id, result);
    }
  });
  await Promise.all(workers);
  return results;
}
