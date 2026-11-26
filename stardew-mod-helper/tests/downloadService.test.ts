// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DownloadItem, DownloadPlan } from '../src/types/domain';
import type { ModFile } from '../src/types/nexus';
import { executeDownloadPlan } from '../src/services/downloadService';
import { copyText, openFilePage, triggerBrowserDownload } from '../src/utils/download';

// mock 掉 DOM 副作用工具，使断言聚焦于执行策略本身。
vi.mock('../src/utils/download', () => ({
  copyText: vi.fn(async () => true),
  openFilePage: vi.fn(),
  triggerBrowserDownload: vi.fn(),
}));

function makeFile(file_id: number): ModFile {
  return {
    file_id,
    file_name: `mod_${file_id}.zip`,
    version: '1.0.0',
    category_name: 'Main Files',
    is_primary: true,
    size_kb: 1024,
    uploaded_at: '2024-01-01T00:00:00Z',
  };
}

function makeItem(modId: number, file_id: number): DownloadItem {
  return { modId, file: makeFile(file_id), kind: 'main' };
}

function makePlan(
  tier: 'premium' | 'standard',
  action: 'direct' | 'open' | 'copy',
  items: DownloadItem[],
): DownloadPlan {
  const filePageUrls: Record<string, string> = {};
  for (const item of items) {
    filePageUrls[`${item.modId}:${item.file.file_id}`] =
      `https://www.nexusmods.com/stardewvalley/mods/${item.modId}` +
      `?tab=files&file_id=${item.file.file_id}`;
  }
  return { tier, action, items, filePageUrls };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('F. executeDownloadPlan —— 副作用与 Premium 守卫', () => {
  it('standard(open) 计划：fetch 调用次数必须为 0，仅打开网页（最关键安全断言）', async () => {
    const plan = makePlan('standard', 'open', [makeItem(1915, 100), makeItem(2400, 200)]);
    const results = await executeDownloadPlan(plan, 'SECRET_KEY_SHOULD_NOT_LEAK');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(openFilePage).toHaveBeenCalledTimes(2);
    expect(copyText).not.toHaveBeenCalled();
    expect(triggerBrowserDownload).not.toHaveBeenCalled();
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it('standard(copy) 计划：fetch 次数为 0，走复制分支', async () => {
    const plan = makePlan('standard', 'copy', [makeItem(1915, 100)]);
    const results = await executeDownloadPlan(plan, 'k');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(copyText).toHaveBeenCalledTimes(1);
    expect(openFilePage).not.toHaveBeenCalled();
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it('双重守卫：tier=standard 即使 action=direct 也不触达 fetch', async () => {
    const plan = makePlan('standard', 'direct', [makeItem(1915, 100)]);
    await executeDownloadPlan(plan, 'k');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(openFilePage).toHaveBeenCalledTimes(1);
    expect(triggerBrowserDownload).not.toHaveBeenCalled();
  });

  it('premium 计划：每个 item 调用一次 download_link.json，直链来自 URI', async () => {
    fetchMock.mockImplementation(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => [{ URI: `https://cdn.example/${url.includes('1915') ? 'a' : 'b'}.zip` }],
    }));
    const plan = makePlan('premium', 'direct', [makeItem(1915, 100), makeItem(2400, 200)]);

    const results = await executeDownloadPlan(plan, 'k');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.every((url) => url.includes('download_link.json'))).toBe(true);
    expect(urls[0]).toContain('/mods/1915/files/100/download_link.json');
    expect(urls[1]).toContain('/mods/2400/files/200/download_link.json');
    expect(triggerBrowserDownload).toHaveBeenCalledTimes(2);
    expect(results.map((r) => r.uri)).toEqual([
      'https://cdn.example/a.zip',
      'https://cdn.example/b.zip',
    ]);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it('premium 单项失败不中断其余项，逐项回调 onProgress', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/mods/1915/')) {
        return { ok: false, status: 403, json: async () => ({}) };
      }
      return { ok: true, status: 200, json: async () => [{ URI: 'https://cdn.example/ok.zip' }] };
    });
    const plan = makePlan('premium', 'direct', [makeItem(1915, 100), makeItem(2400, 200)]);
    const onProgress = vi.fn();

    const results = await executeDownloadPlan(plan, 'k', onProgress);

    expect(results).toHaveLength(2);
    expect(results[0].ok).toBe(false);
    expect(results[0].error).toBeDefined();
    expect(results[1].ok).toBe(true);
    expect(results[1].uri).toBe('https://cdn.example/ok.zip');
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(triggerBrowserDownload).toHaveBeenCalledTimes(1);
  });
});
