// @vitest-environment jsdom
import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiPath, APP_CONFIG } from '../src/config';
import {
  createWorkspaceInitialState,
  workspaceReducer,
  type WorkspaceAction,
} from '../src/hooks/workspaceReducer';
import type { AppState } from '../src/types/domain';
import type { ModFile } from '../src/types/nexus';
import type { FSTreeNode, LocalMod, UpdateInfo } from '../src/types/workspace';
import {
  compareVersions,
  decideUpdateStatus,
  detectAllUpdates,
  detectModUpdate,
  extractNexusModIds,
  pickLatestFile,
} from '../src/services/updateService';
import {
  buildModsZip,
  buildPackFileName,
  buildTreeFromEntries,
  extractManifest,
  parseModsZip,
  resolvePackFolderName,
  sanitizeFileName,
} from '../src/services/zipService';
import { makeFile } from './fixtures';

// ---------------------------------------------------------------- helpers
type FetchCall = { url: string; init?: RequestInit };

/** 用 fetch stub 捕获真实 nexusApi.request 生成的 URL，兼顾行为断言与错误归一化验证。 */
function stubFetch(
  handler: (url: string, init?: RequestInit) => unknown | Promise<unknown>,
) {
  const calls: FetchCall[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    return handler(url, init);
  });
  vi.stubGlobal('fetch', fn);
  return { fn, calls };
}

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as Response;
}

function makeLocalMod(overrides: Partial<LocalMod> = {}): LocalMod {
  return {
    id: 'mod-1',
    name: 'Demo Mod',
    author: 'Tester',
    version: '1.0.0',
    description: 'demo',
    manifest: {
      Name: 'Demo Mod',
      Author: 'Tester',
      Version: '1.0.0',
      Description: 'demo',
      UpdateKeys: ['Nexus:1915'],
      UniqueID: 'demo.mod',
    },
    updateKeys: ['Nexus:1915'],
    nexusModIds: [1915],
    fileTree: [],
    fileCount: 1,
    totalSize: 0,
    rootFolder: '',
    source: 'folder-zip',
    uniqueId: 'demo.mod',
    updateStatus: 'unknown',
    updateInfo: null,
    checkError: '尚未检测',
    lastCheckedAt: null,
    addedAt: '2024-01-01T00:00:00Z',
    dirty: false,
    modifiedAt: '2024-01-01T00:00:00Z',
    syncStatus: 'local-only',
    lastSyncedAt: null,
    cloudFolderName: '',
    fileShaMap: {},
    ...overrides,
  };
}

function makeUpdateInfo(
  overrides: Partial<UpdateInfo> = {},
): UpdateInfo {
  return {
    modId: 1915,
    version: '1.0.0',
    uploadedAt: '2024-01-01T00:00:00Z',
    fileId: 100,
    ...overrides,
  };
}

/** workspaceReducer 只碰工作区字段，其余字段用合法最小占位即可。 */
function makeAppState(): AppState {
  return {
    apiKey: '',
    keyStatus: 'unset',
    tier: 'standard',
    userName: null,
    keyMessage: '',
    idsInput: '',
    mods: [],
    loadingIds: [],
    loadErrors: {},
    selectedFiles: {},
    includeChinese: {},
    history: [],
    theme: 'light',
    tab: 'workspace',
    ...createWorkspaceInitialState(),
  };
}

/** v4 层级树 fixture：data 一律 Blob（与生产代码同形态）。 */
function fileNode(name: string, text: string, nodeId = `node-${name}`): FSTreeNode {
  const blob = new Blob([text], { type: 'text/plain' });
  return {
    nodeId,
    name,
    kind: 'file',
    children: [],
    data: blob,
    size: blob.size,
    mime: 'text/plain',
  };
}

/** 相对路径 → Blob 映射 → 层级树，供 manifest / 打包测试复用。 */
async function treeFromFiles(files: Record<string, string>): Promise<FSTreeNode[]> {
  return buildTreeFromEntries(
    Object.entries(files).map(([path, text]) => ({
      path,
      blob: new Blob([text], { type: 'text/plain' }),
      mime: 'text/plain',
    })),
  );
}

/** 递归列举层级树中的文件路径，供建树/打包断言使用。 */
function collectPaths(tree: FSTreeNode[], prefix = ''): string[] {
  const result: string[] = [];
  for (const node of tree) {
    const path = prefix.length > 0 ? `${prefix}/${node.name}` : node.name;
    if (node.kind === 'file') {
      result.push(path);
    } else {
      result.push(...collectPaths(node.children, path));
    }
  }
  return result;
}

function makeManifestJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    Name: 'Demo Mod',
    Author: 'Tester',
    Version: '1.0.0',
    Description: 'demo description',
    UpdateKeys: ['Nexus:1915'],
    UniqueID: 'demo.mod',
    ...overrides,
  });
}

/** parseModsZip 只需要 name/size/arrayBuffer；显式构造避免依赖 jsdom Blob 实现差异。 */
function makeZipFile(name: string, bytes: Uint8Array): File {
  return {
    name,
    size: bytes.byteLength,
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  } as unknown as File;
}

async function zipBytes(zip: JSZip): Promise<Uint8Array> {
  return zip.generateAsync({ type: 'uint8array' });
}

async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') {
    return new Uint8Array(await blob.arrayBuffer());
  }
  return new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ================================================================ A. updateService 纯函数
describe('A. updateService 纯函数', () => {
  describe('A1. extractNexusModIds', () => {
    it('去 @ 子键、仅 Nexus、去重保序、非 Nexus 跳过', () => {
      expect(
        extractNexusModIds([
          'Nexus:1915',
          'Nexus:2400@GeodeCrusher',
          'GitHub:xxx',
          'Nexus:1915',
        ]),
      ).toEqual([1915, 2400]);
    });

    it('非法数字一律跳过', () => {
      expect(
        extractNexusModIds([
          'Nexus:abc',
          'Nexus:0',
          'Nexus:-1',
          'Nexus:12x',
          'Nexus:42',
        ]),
      ).toEqual([42]);
    });

    it('前缀大小写不敏感；非数组返回空', () => {
      expect(extractNexusModIds(['nexus:77'])).toEqual([77]);
      expect(extractNexusModIds([])).toEqual([]);
      expect(extractNexusModIds(null as unknown as string[])).toEqual([]);
    });
  });

  describe('A2. compareVersions', () => {
    it('1.6.1 > 1.6.0 → 1；1.5 < 1.6 → -1；相等 → 0', () => {
      expect(compareVersions('1.6.1', '1.6.0')).toBe(1);
      expect(compareVersions('1.5', '1.6')).toBe(-1);
      expect(compareVersions('1.6.0', '1.6.0')).toBe(0);
    });

    it('v 前缀可解析；位数不同按补 0 对齐', () => {
      expect(compareVersions('v1.6', '1.6.0')).toBe(0);
      expect(compareVersions('v1.6.1', '1.6')).toBe(1);
    });

    it('任一不可解析 → null', () => {
      expect(compareVersions('abc', '1.6')).toBeNull();
      expect(compareVersions('1.6', 'unknown')).toBeNull();
    });
  });

  describe('A3. pickLatestFile', () => {
    const newFile = (fileId: number, version: string, uploadedAt: string, isPrimary = false) =>
      makeFile(fileId, `mod-${fileId}.zip`, { version, uploaded_at: uploadedAt, is_primary: isPrimary });

    it('is_primary 优先，即使上传更早', () => {
      const files = [
        newFile(1, '2.0', '2024-06-01T00:00:00Z'),
        newFile(2, '1.9', '2024-01-01T00:00:00Z', true),
      ];
      expect(pickLatestFile(files)?.file_id).toBe(2);
    });

    it('多个主文件取 uploaded_at 最新', () => {
      const files = [
        newFile(1, '2.0', '2024-06-01T00:00:00Z', true),
        newFile(2, '2.1', '2024-07-01T00:00:00Z', true),
        newFile(3, '9.9', '2025-01-01T00:00:00Z'),
      ];
      expect(pickLatestFile(files)?.file_id).toBe(2);
    });

    it('无主文件取 uploaded_at 最新；空数组 → null', () => {
      const files = [
        newFile(1, '2.0', '2024-06-01T00:00:00Z'),
        newFile(2, '2.1', '2024-07-01T00:00:00Z'),
      ];
      expect(pickLatestFile(files)?.file_id).toBe(2);
      expect(pickLatestFile([])).toBeNull();
    });
  });

  describe('A4. decideUpdateStatus', () => {
    const local = {
      version: '1.6.0',
      lastCheckedAt: '2024-05-01T00:00:00Z',
      addedAt: '2024-01-01T00:00:00Z',
    };

    it('本地 < 线上 → outdated；相等 → latest', () => {
      expect(decideUpdateStatus(local, [makeUpdateInfo({ version: '1.6.1' })])).toMatchObject({
        status: 'outdated',
        checkError: '',
      });
      expect(decideUpdateStatus(local, [makeUpdateInfo({ version: '1.6.0' })])).toMatchObject({
        status: 'latest',
        checkError: '',
      });
    });

    it('本地 > 线上 → latest 且 checkError 含「本地版本较新」，绝不为 outdated', () => {
      const result = decideUpdateStatus(local, [makeUpdateInfo({ version: '1.5.0' })]);
      expect(result.status).toBe('latest');
      expect(result.status).not.toBe('outdated');
      expect(result.checkError).toContain('本地版本较新');
    });

    it('版本不可解析 → 时间兜底：uploadedAt 晚于 lastCheckedAt → outdated', () => {
      const result = decideUpdateStatus(
        { ...local, version: 'unknown' },
        [makeUpdateInfo({ version: 'v2', uploadedAt: '2024-06-01T00:00:00Z' })],
      );
      expect(result.status).toBe('outdated');
    });

    it('时间兜底：uploadedAt 早于 addedAt（无 lastCheckedAt）→ latest', () => {
      const result = decideUpdateStatus(
        { ...local, version: 'unknown', lastCheckedAt: null },
        [makeUpdateInfo({ version: 'v2', uploadedAt: '2023-01-01T00:00:00Z' })],
      );
      expect(result.status).toBe('latest');
    });

    it('全失败 → unknown', () => {
      const result = decideUpdateStatus(local, [], [1915]);
      expect(result.status).toBe('unknown');
      expect(result.updateInfo).toBeNull();
      expect(result.checkError).toContain('失败');
    });

    it('部分失败按成功结果判定，错误不写进文案', () => {
      const result = decideUpdateStatus(
        local,
        [makeUpdateInfo({ version: '1.6.1' })],
        [2400],
      );
      expect(result.status).toBe('outdated');
      expect(result.checkError).toBe('');
      expect(result.checkError).not.toContain('失败');
    });
  });
});

// ================================================================ B. detectModUpdate
describe('B. detectModUpdate —— 只调 files.json', () => {
  const R39_TEXT = '缺少 manifest.json 或 UpdateKeys';

  it('无 manifest → unknown + R39 固定文案，fetch 调用次数为 0', async () => {
    const { fn } = stubFetch(() => jsonResponse([]));
    const result = await detectModUpdate(makeLocalMod({ manifest: null }), 'key');
    expect(result.status).toBe('unknown');
    expect(result.checkError).toContain(R39_TEXT);
    expect(fn).toHaveBeenCalledTimes(0);
  });

  it('无 Nexus 键 → unknown + R39 固定文案，fetch 调用次数为 0', async () => {
    const { fn } = stubFetch(() => jsonResponse([]));
    const result = await detectModUpdate(
      makeLocalMod({ nexusModIds: [], updateKeys: ['GitHub:xxx'] }),
      'key',
    );
    expect(result.status).toBe('unknown');
    expect(result.checkError).toContain(R39_TEXT);
    expect(fn).toHaveBeenCalledTimes(0);
  });

  it('正常：调 fetchFiles 取 files.json，产出 outdated；从未请求 download_link.json', async () => {
    const { calls } = stubFetch(() =>
      jsonResponse([
        makeFile(11, 'main.zip', {
          is_primary: true,
          version: '2.0.0',
          uploaded_at: '2024-06-01T00:00:00Z',
        }),
        makeFile(12, 'old.zip', { version: '1.0.0', uploaded_at: '2024-05-01T00:00:00Z' }),
      ]),
    );
    const result = await detectModUpdate(makeLocalMod({ version: '1.0.0' }), 'key');
    expect(result.status).toBe('outdated');
    expect(result.updateInfo).toMatchObject({ modId: 1915, version: '2.0.0', fileId: 11 });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('/games/stardewvalley/mods/1915/files.json');
    expect(calls.every((call) => !call.url.includes('download_link'))).toBe(true);
  });

  it('files 为空 → unknown + "N 网未找到可用文件"', async () => {
    stubFetch(() => jsonResponse([]));
    const result = await detectModUpdate(makeLocalMod(), 'key');
    expect(result.status).toBe('unknown');
    expect(result.checkError).toContain('未找到可用文件');
  });

  it.each([
    [401, 'API Key 无效或已过期'],
    [429, '请求过于频繁'],
  ])('HTTP %i → unknown + formatError 中文文案', async (status, expectedText) => {
    stubFetch(() => jsonResponse({}, status));
    const result = await detectModUpdate(makeLocalMod(), 'key');
    expect(result.status).toBe('unknown');
    expect(result.checkError).toContain(expectedText);
    expect(result.checkError).not.toContain('key');
  });

  it('网络错误 → unknown + 中文网络文案', async () => {
    stubFetch(() => {
      throw new Error('Failed to fetch');
    });
    const result = await detectModUpdate(makeLocalMod(), 'key');
    expect(result.status).toBe('unknown');
    expect(result.checkError).toContain('网络异常');
  });

  it('多个 modId：部分失败按成功结果判定，错误不写进 checkError', async () => {
    const { calls } = stubFetch((url) => {
      if (url.includes('/1915/')) {
        return jsonResponse([
          makeFile(20, 'main.zip', {
            is_primary: true,
            version: '2.0.0',
            uploaded_at: '2024-06-01T00:00:00Z',
          }),
        ]);
      }
      throw new Error('Failed to fetch');
    });
    const result = await detectModUpdate(
      makeLocalMod({ version: '1.0.0', nexusModIds: [1915, 2400] }),
      'key',
    );
    expect(result.status).toBe('outdated');
    expect(result.checkError).toBe('');
    expect(calls).toHaveLength(2);
  });
});

// ================================================================ C. detectAllUpdates
describe('C. detectAllUpdates —— 缓存 / 并发 / 失败隔离', () => {
  const recent = () => new Date(Date.now() - 60_000).toISOString();

  it('缓存命中（10min 内且非 force）→ 跳过请求并回传缓存结果', async () => {
    const { fn } = stubFetch(() => jsonResponse([]));
    const onResult = vi.fn();
    const mods = [
      makeLocalMod({
        id: 'a',
        lastCheckedAt: recent(),
        updateStatus: 'latest',
        updateInfo: makeUpdateInfo(),
        checkError: '',
      }),
    ];
    const results = await detectAllUpdates(mods, 'key', onResult, false);
    expect(fn).toHaveBeenCalledTimes(0);
    expect(results['a'].status).toBe('latest');
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult).toHaveBeenCalledWith('a', expect.objectContaining({ status: 'latest' }));
  });

  it('force=true → 忽略缓存强制重新请求', async () => {
    const { fn } = stubFetch(() => jsonResponse([]));
    const mods = [
      makeLocalMod({ id: 'a', lastCheckedAt: recent(), updateStatus: 'latest' }),
    ];
    await detectAllUpdates(mods, 'key', vi.fn(), true);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('并发上限 ≤ 3；6 个模组逐条 onResult 回调', async () => {
    let active = 0;
    let maxActive = 0;
    const { fn } = stubFetch(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 20));
      active -= 1;
      return jsonResponse([
        makeFile(30, 'main.zip', {
          is_primary: true,
          version: '2.0.0',
          uploaded_at: '2024-06-01T00:00:00Z',
        }),
      ]);
    });
    const mods = Array.from({ length: 6 }, (_, index) =>
      makeLocalMod({ id: `m${index}`, nexusModIds: [2000 + index] }),
    );
    const onResult = vi.fn();
    const results = await detectAllUpdates(mods, 'key', onResult, true);
    expect(fn).toHaveBeenCalledTimes(6);
    expect(maxActive).toBeLessThanOrEqual(APP_CONFIG.update.concurrency);
    expect(maxActive).toBeGreaterThanOrEqual(1);
    expect(onResult).toHaveBeenCalledTimes(6);
    expect(Object.keys(results)).toEqual(
      expect.arrayContaining(['m0', 'm1', 'm2', 'm3', 'm4', 'm5']),
    );
  });

  it('单条失败不中断其他项', async () => {
    stubFetch((url) => {
      if (url.includes('/2001/')) {
        throw new Error('Failed to fetch');
      }
      return jsonResponse([
        makeFile(40, 'main.zip', {
          is_primary: true,
          version: '2.0.0',
          uploaded_at: '2024-06-01T00:00:00Z',
        }),
      ]);
    });
    const mods = [
      makeLocalMod({ id: 'ok', nexusModIds: [2000] }),
      makeLocalMod({ id: 'bad', nexusModIds: [2001] }),
    ];
    const results = await detectAllUpdates(mods, 'key', vi.fn(), true);
    expect(results['ok'].status).toBe('outdated');
    expect(results['bad'].status).toBe('unknown');
    expect(results['bad'].checkError).toContain('网络异常');
  });
});

// ================================================================ D. zipService 纯函数
describe('D. zipService 纯函数', () => {
  describe('D1. sanitizeFileName', () => {
    it('去非法字符与控制符、压缩空白、去首尾空格与结尾点', () => {
      expect(sanitizeFileName('  My<Mod>:Name?/With|Star*  ', 'fallback')).toBe(
        'MyModNameWithStar',
      );
      expect(sanitizeFileName('  Mod\u0001Name.  ', 'fallback')).toBe('ModName');
      expect(sanitizeFileName('A   B', 'fallback')).toBe('A B');
    });

    it('空串 / 全非法 / 全点 → fallback', () => {
      expect(sanitizeFileName('', 'fallback')).toBe('fallback');
      expect(sanitizeFileName('   ', 'fallback')).toBe('fallback');
      expect(sanitizeFileName('<>:/\\|?*', 'fallback')).toBe('fallback');
      expect(sanitizeFileName('...', 'fallback')).toBe('fallback');
    });
  });

  describe('D2. resolvePackFolderName', () => {
    it('rootFolder 优先', () => {
      expect(
        resolvePackFolderName(
          makeLocalMod({ id: 'x', rootFolder: 'OriginFolder', manifest: null }),
        ),
      ).toBe('OriginFolder');
    });

    it('无 rootFolder → 安全化模组名；模组名也为空 → mod-{id}（Q4）', () => {
      expect(resolvePackFolderName(makeLocalMod({ id: 'x', rootFolder: '' }))).toBe('Demo Mod');
      expect(
        resolvePackFolderName(makeLocalMod({ id: 'x', rootFolder: '', name: '', manifest: null })),
      ).toBe('mod-x');
      expect(
        resolvePackFolderName(makeLocalMod({ id: 'x', rootFolder: 'Bad:Name', manifest: null })),
      ).toBe('BadName');
    });
  });

  describe('D3. extractManifest', () => {
    it('正常五字段 + UniqueID 提取', async () => {
      const result = await extractManifest([
        fileNode('manifest.json', makeManifestJson()),
        fileNode('content/a.txt', 'hello'),
      ]);
      expect(result.manifest).toEqual({
        Name: 'Demo Mod',
        Author: 'Tester',
        Version: '1.0.0',
        Description: 'demo description',
        UpdateKeys: ['Nexus:1915'],
        UniqueID: 'demo.mod',
      });
    });

    it('键名大小写不敏感', async () => {
      const result = await extractManifest([
        fileNode(
          'MANIFEST.JSON',
          JSON.stringify({
            nAmE: 'Case Mod',
            AUTHOR: 'Someone',
            version: '3.2.1',
            description: 'd',
            Updatekeys: ['Nexus:7'],
            uniqueid: 'case.mod',
          }),
        ),
      ]);
      expect(result.manifest).toEqual({
        Name: 'Case Mod',
        Author: 'Someone',
        Version: '3.2.1',
        Description: 'd',
        UpdateKeys: ['Nexus:7'],
        UniqueID: 'case.mod',
      });
    });

    it('UpdateKeys 为字符串时包成数组', async () => {
      const result = await extractManifest([
        fileNode('manifest.json', JSON.stringify({ Name: 'S', UpdateKeys: 'Nexus:99' })),
      ]);
      expect(result.manifest?.UpdateKeys).toEqual(['Nexus:99']);
    });

    it('无 manifest → manifest:null 且带 reason', async () => {
      const result = await extractManifest([fileNode('readme.txt', 'no manifest here')]);
      expect(result.manifest).toBeNull();
      expect(result.reason).toContain('manifest.json');
    });

    it('非法 JSON → null', async () => {
      const result = await extractManifest([fileNode('manifest.json', '{ not json')]);
      expect(result.manifest).toBeNull();
    });
  });

  describe('D4. buildPackFileName', () => {
    it('格式 stardew-mods-pack-YYYY-MM-DD.zip', () => {
      expect(buildPackFileName(new Date('2026-06-01T12:34:56Z'))).toBe(
        'stardew-mods-pack-2026-06-01.zip',
      );
    });
  });
});

// ================================================================ E. zip 解析与打包
describe('E. zip 解析与打包（真实 JSZip，全程无网络）', () => {
  let networkSpy: ReturnType<typeof vi.fn>;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  beforeEach(() => {
    const { fn } = stubFetch(() => {
      throw new Error('zipService 不应发起网络请求');
    });
    networkSpy = fn;
  });

  it('folder-zip：两个顶层文件夹拆出 2 个模组，系统项被过滤', async () => {
    const zip = new JSZip();
    zip.file(
      'Alpha/manifest.json',
      makeManifestJson({ Name: 'Alpha', Version: '1.0.0', UpdateKeys: ['Nexus:1915'], UniqueID: 'alpha' }),
    );
    zip.file('Alpha/content/a.txt', 'hello A');
    zip.file(
      'Beta/manifest.json',
      makeManifestJson({
        Name: 'Beta',
        Version: '2.0.0',
        UpdateKeys: ['Nexus:2400@X', 'Nexus:2400', 'GitHub:xxx'],
        UniqueID: 'beta',
      }),
    );
    zip.file('Beta/content/b.txt', 'hello B');
    zip.file('__MACOSX/._Alpha', 'junk');
    zip.file('.DS_Store', 'junk');

    const outcome = await parseModsZip(makeZipFile('mods.zip', await zipBytes(zip)), 'folder-zip');
    expect(outcome.skipped).toEqual([]);
    expect(outcome.mods).toHaveLength(2);

    const alpha = outcome.mods.find((mod) => mod.name === 'Alpha');
    const beta = outcome.mods.find((mod) => mod.name === 'Beta');
    expect(alpha).toMatchObject({
      version: '1.0.0',
      source: 'folder-zip',
      rootFolder: 'Alpha',
      fileCount: 2,
      nexusModIds: [1915],
    });
    expect(beta).toMatchObject({
      version: '2.0.0',
      rootFolder: 'Beta',
      nexusModIds: [2400],
    });
    expect(
      outcome.mods.some((mod) =>
        collectPaths(mod.fileTree).some(
          (path) => path.includes('__MACOSX') || path.includes('.DS_Store'),
        ),
      ),
    ).toBe(false);
    expect(collectPaths(beta?.fileTree ?? []).includes('content/b.txt')).toBe(true);
    expect(networkSpy).toHaveBeenCalledTimes(0);
  });

  it('single-zip：同名外层目录被剥离成一个模组', async () => {
    const zip = new JSZip();
    zip.file('ContentPatcher/manifest.json', makeManifestJson({ Name: 'Content Patcher', UniqueID: 'cp' }));
    zip.file('ContentPatcher/patch.json', '{}');
    zip.file('__MACOSX/._cp', 'junk');

    const outcome = await parseModsZip(
      makeZipFile('ContentPatcher.zip', await zipBytes(zip)),
      'single-zip',
    );
    expect(outcome.skipped).toEqual([]);
    expect(outcome.mods).toHaveLength(1);
    expect(outcome.mods[0].name).toBe('Content Patcher');
    expect(outcome.mods[0].rootFolder).toBe('ContentPatcher');
    expect(outcome.mods[0].source).toBe('single-zip');
    expect(collectPaths(outcome.mods[0].fileTree)).toEqual(
      expect.arrayContaining(['manifest.json', 'patch.json']),
    );
    expect(networkSpy).toHaveBeenCalledTimes(0);
  });

  it('损坏 buffer → skipped 有错误项，不抛异常，其他包照常处理', async () => {
    const broken = await parseModsZip(
      makeZipFile('broken.zip', new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05])),
      'folder-zip',
    );
    expect(broken.mods).toEqual([]);
    expect(broken.skipped).toHaveLength(1);
    expect(broken.skipped[0].name).toBe('broken.zip');
    expect(broken.skipped[0].reason).toContain('无法解压');

    const healthyZip = new JSZip();
    healthyZip.file('Healthy/manifest.json', makeManifestJson({ Name: 'Healthy' }));
    const healthy = await parseModsZip(
      makeZipFile('healthy.zip', await zipBytes(healthyZip)),
      'folder-zip',
    );
    expect(healthy.skipped).toEqual([]);
    expect(healthy.mods).toHaveLength(1);
    expect(networkSpy).toHaveBeenCalledTimes(0);
  });

  it('buildModsZip：顶层文件夹名/层级/内容保持，同名加 -2 不覆盖', async () => {
    const firstMod = makeLocalMod({
      id: 'first',
      name: 'Same',
      rootFolder: 'SameName',
      fileTree: await treeFromFiles({
        'manifest.json': makeManifestJson({ Name: 'Same' }),
        'sub/deep.txt': 'deep content',
      }),
      fileCount: 2,
    });
    const secondMod = makeLocalMod({
      id: 'second',
      name: 'Same',
      rootFolder: 'SameName',
      fileTree: await treeFromFiles({
        'manifest.json': makeManifestJson({ Name: 'Same', Version: '2.0.0' }),
      }),
      fileCount: 1,
    });

    const progress = vi.fn();
    const blob = await buildModsZip([firstMod, secondMod], progress);
    const result = await JSZip.loadAsync(await blobToBytes(blob));
    const fileNames = Object.keys(result.files).filter((name) => !result.files[name].dir);

    expect(fileNames).toEqual(
      expect.arrayContaining([
        'SameName/manifest.json',
        'SameName/sub/deep.txt',
        'SameName-2/manifest.json',
      ]),
    );
    expect(await result.file('SameName/sub/deep.txt')?.async('string')).toBe('deep content');
    expect(JSON.parse(await result.file('SameName-2/manifest.json')!.async('string'))).toMatchObject(
      { Version: '2.0.0' },
    );
    expect(progress).toHaveBeenCalled();
    expect(networkSpy).toHaveBeenCalledTimes(0);
  });
});

// ================================================================ F. workspaceReducer
describe('F. workspaceReducer', () => {
  it('初始态 13 字段齐全且全部 idle', () => {
    const state = createWorkspaceInitialState();
    expect(Object.keys(state)).toEqual(
      expect.arrayContaining([
        'localMods',
        'selectedPackIds',
        'librarySearch',
        'explorer',
        'checkingIds',
        'uploadProgress',
        'packProgress',
        'syncProgress',
        'cloudMods',
        'github',
        'syncBusy',
        'conflict',
        'libraryHydrated',
      ]),
    );
    expect(state.librarySearch).toEqual({ query: '', includeCloud: true });
    expect(state.explorer).toEqual({ modId: null, path: [] });
    expect(state.uploadProgress).toBeNull();
    expect(state.packProgress).toBeNull();
    expect(state.syncProgress).toBeNull();
    expect(state.syncBusy).toBe(false);
    expect(state.conflict).toBeNull();
    expect(state.libraryHydrated).toBe(false);
  });

  it('ADD_LOCAL_MODS / REMOVE_LOCAL_MOD（同步清 selectedPackIds 与 checkingIds）', () => {
    let state = makeAppState();
    state = workspaceReducer(state, { type: 'ADD_LOCAL_MODS', mods: [makeLocalMod({ id: 'a' })] });
    expect(state.localMods.map((mod) => mod.id)).toEqual(['a']);

    state = workspaceReducer(state, { type: 'TOGGLE_PACK_SELECT', id: 'a' });
    state = workspaceReducer(state, { type: 'SET_CHECKING_IDS', ids: ['a'] });
    state = workspaceReducer(state, { type: 'REMOVE_LOCAL_MOD', id: 'a' });
    expect(state.localMods).toEqual([]);
    expect(state.selectedPackIds).toEqual([]);
    expect(state.checkingIds).toEqual([]);
  });

  it('TOGGLE_PACK_SELECT 仅 fileCount>0 生效，再次切换可取消', () => {
    let state = workspaceReducer(makeAppState(), {
      type: 'ADD_LOCAL_MODS',
      mods: [
        makeLocalMod({ id: 'empty', fileCount: 0 }),
        makeLocalMod({ id: 'full', fileCount: 3 }),
      ],
    });
    const unchanged = workspaceReducer(state, { type: 'TOGGLE_PACK_SELECT', id: 'empty' });
    expect(unchanged).toBe(state);

    state = workspaceReducer(state, { type: 'TOGGLE_PACK_SELECT', id: 'full' });
    expect(state.selectedPackIds).toEqual(['full']);
    state = workspaceReducer(state, { type: 'TOGGLE_PACK_SELECT', id: 'full' });
    expect(state.selectedPackIds).toEqual([]);
  });

  it('APPLY_UPDATE_RESULT 写 status/info/checkError/lastCheckedAt', () => {
    let state = workspaceReducer(makeAppState(), {
      type: 'ADD_LOCAL_MODS',
      mods: [makeLocalMod({ id: 'a' })],
    });
    const info = makeUpdateInfo({ version: '2.0.0' });
    state = workspaceReducer(state, {
      type: 'APPLY_UPDATE_RESULT',
      id: 'a',
      result: { status: 'outdated', updateInfo: info, checkError: '' },
      checkedAt: '2024-06-01T00:00:00Z',
    });
    expect(state.localMods[0]).toMatchObject({
      updateStatus: 'outdated',
      updateInfo: info,
      checkError: '',
      lastCheckedAt: '2024-06-01T00:00:00Z',
    });
  });

  it('HYDRATE_LIBRARY 一次性恢复库 / 勾选 / GitHub 设置并解除门控', () => {
    const settings = { ...createWorkspaceInitialState().github, owner: 'LightSB', status: 'connected' as const };
    const state = workspaceReducer(makeAppState(), {
      type: 'HYDRATE_LIBRARY',
      mods: [makeLocalMod({ id: 'restored' })],
      meta: { selectedPackIds: ['restored'], github: settings, cloudMods: [] },
    });
    expect(state.localMods.map((mod) => mod.id)).toEqual(['restored']);
    expect(state.selectedPackIds).toEqual(['restored']);
    expect(state.github.owner).toBe('LightSB');
    expect(state.libraryHydrated).toBe(true);
  });

  it('REPLACE_LOCAL_MOD 只替换目标模组，ADD_SELECTED 合并不重复', () => {
    let state = workspaceReducer(makeAppState(), {
      type: 'ADD_LOCAL_MODS',
      mods: [makeLocalMod({ id: 'a' }), makeLocalMod({ id: 'b' })],
    });
    state = workspaceReducer(state, {
      type: 'REPLACE_LOCAL_MOD',
      mod: makeLocalMod({ id: 'a', name: 'Renamed' }),
    });
    expect(state.localMods.map((mod) => mod.name)).toEqual(['Renamed', 'Demo Mod']);

    state = workspaceReducer(state, { type: 'ADD_SELECTED', ids: ['a', 'b', 'a'] });
    expect(state.selectedPackIds).toEqual(['a', 'b']);
  });
});

// ================================================================ G. config 路径
describe('G. config 路径', () => {
  it('apiPath.modPage(1915) 为模组主页且不带 file_id', () => {
    expect(apiPath.modPage(1915)).toBe('https://www.nexusmods.com/stardewvalley/mods/1915');
  });
});

// ================================================================ H. 关键安全回归
describe('H. 关键安全回归 —— 更新检测链路零 download_link.json', () => {
  it('detectAllUpdates 全程只请求 files.json，不触达 download_link.json', async () => {
    const { calls } = stubFetch(() =>
      jsonResponse([
        makeFile(50, 'main.zip', {
          is_primary: true,
          version: '2.0.0',
          uploaded_at: '2024-06-01T00:00:00Z',
        }),
      ]),
    );
    const mods = [
      makeLocalMod({ id: 'a', nexusModIds: [1915] }),
      makeLocalMod({ id: 'b', nexusModIds: [2400] }),
    ];
    const results = await detectAllUpdates(mods, 'key', vi.fn(), true);
    expect(calls).toHaveLength(2);
    expect(calls.every((call) => call.url.endsWith('/files.json'))).toBe(true);
    expect(calls.every((call) => !call.url.includes('download_link'))).toBe(true);
    expect(results['a'].status).toBe('outdated');
  });
});
