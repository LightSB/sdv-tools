import type { DownloadPlan, DownloadResult } from '../types/domain';
import { copyText, openFilePage, triggerBrowserDownload } from '../utils/download';
import { formatError } from '../utils/errors';
import { getDownloadLink } from './nexusApi';

/** iOS Safari 连续下载的最小间隔，降低被拦截概率。 */
const DOWNLOAD_INTERVAL_MS = 300;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * 执行下载计划。
 * - premium + direct：逐项换取直链后串行触发下载（间隔 300ms）。
 * - standard：按 action 打开 N 网文件页或复制链接，绝不调用 download_link.json。
 * 单项失败只记录到该条结果，不中断队列。
 */
export async function executeDownloadPlan(
  plan: DownloadPlan,
  apiKey: string,
  onProgress?: (result: DownloadResult) => void,
): Promise<DownloadResult[]> {
  const results: DownloadResult[] = [];

  // 双重守卫：standard 或任何非 direct 计划都不可能触达直链端点
  const useDirect = plan.tier === 'premium' && plan.action === 'direct';
  if (!useDirect) {
    for (const item of plan.items) {
      const filePage = plan.filePageUrls[`${item.modId}:${item.file.file_id}`] ?? '';
      let ok = false;
      let error: string | undefined;

      try {
        if (plan.action === 'copy') {
          ok = await copyText(filePage);
          if (!ok) {
            error = '复制失败，请手动复制文件页链接';
          }
        } else {
          if (filePage.length === 0) {
            throw new Error('缺少文件页地址');
          }
          openFilePage(filePage);
          ok = true;
        }
      } catch (err) {
        error = formatError(err);
      }

      const result: DownloadResult = { item, ok, error };
      results.push(result);
      onProgress?.(result);
    }
    return results;
  }

  for (let index = 0; index < plan.items.length; index += 1) {
    const item = plan.items[index];
    if (index > 0) {
      await delay(DOWNLOAD_INTERVAL_MS);
    }

    try {
      const uri = await getDownloadLink(item.modId, item.file.file_id, apiKey);
      triggerBrowserDownload(uri, item.file.file_name);
      const result: DownloadResult = { item, ok: true, uri };
      results.push(result);
      onProgress?.(result);
    } catch (err) {
      const result: DownloadResult = { item, ok: false, error: formatError(err) };
      results.push(result);
      onProgress?.(result);
    }
  }

  return results;
}
