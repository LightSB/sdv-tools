// @vitest-environment jsdom
/**
 * v4 补充测试（QA / 严过关）
 * 覆盖：fsTree 边界、idSelect、librarySearch 零网络、githubService 隐私边界、
 * zipService 层级打包回归、exportService 库清单、workspaceReducer 增量、全仓安全静态回归。
 * 仅新增测试，不修改任何业务源码。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_CONFIG } from '../src/config';
import type { AppState } from '../src/types/domain';
import type {
  CloudModRef,
  FlatFileItem,
  FSTreeNode,
  GitHubConfig,
  LocalMod,
} from '../src/types/workspace';
import { blobToBytes, buildTreeFromPaths, computeStats, deleteNode, findNode, guessMime, insertFile, insertFolder, isTextFile, listChildren, makeNodeId, renameNode, safeNodeName, textPreview } from '../src/utils/fsTree';
import { matchModsByInputIds } from '../src/utils/idSelect';
import { searchLibrary } from '../src/utils/librarySearch';
import * as dbServiceModule from '../src/services/dbService';
import { buildLibraryExportData, buildLibraryExportFileName, exportLibrary, renderLibraryCsv, renderLibraryJson, renderLibraryMd } from '../src/services/exportService';
import {
  configure,
  listCloudMods,
  readToken,
  testConnection,
  updateMod,
  uploadMod,
  writeToken,
  clearToken,
} from '../src/services/githubService';
import {
  buildModsZip,
  extractManifest,
  packTreeToZip,
  resolveModFolderName,
} from '../src/services/zipService';
import {
  createWorkspaceInitialState,
  defaultGitHubSettings,
  workspaceReducer,
} from '../src/hooks/workspaceReducer';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

/* ------------------------------------------------------------------ 公共夹具 */

function blob(text: string): Blob {
  return new Blob([text], { type: 'text/plain' });
}

function fileNode(name: string, data: Blob): FSTreeNode {
  return {
    nodeId: `node-${name}`,
    name,
    kind: 'file',
    children: [],
    data,
    size: data.size,
    mime: guessMime(name),
  };
}

function dirNode(name: string, children: FSTreeNode[]): FSTreeNode {
  return { nodeId: `dir-${name}`, name, kind: 'dir', children, size: 0 };
}

function flat(entries: Record<string, string>): FlatFileItem[] {
  return Object.entries(entries).map(([path, text]) => ({ path, blob: blob(text) }));
}

function makeLocalMod(overrides: Partial<LocalMod> = {}): LocalMod {
  return {
    id: 'mod-1',
    name: 'Demo Mod',
    author: 'Tester',
    version: '1.0.0',
    description: 'demo',
    manifest: null,
    updateKeys: ['Nexus:1915'],
    nexusModIds: [1915],
    fileTree: [],
    fileCount: 1,
    totalSize: 100,
    rootFolder: 'DemoFolder',
    source: 'folder-zip',
    uniqueId: 'demo.mod',
    updateStatus: 'latest',
    updateInfo: null,
    checkError: '',
    lastCheckedAt: null,
    addedAt: '2024-01-01T00:00:00Z',
    dirty: false,
    modifiedAt: '2024-01-01T00:00:00Z',
    syncStatus: 'synced',
    lastSyncedAt: '2024-01-02T00:00:00Z',
    cloudFolderName: 'DemoFolder',
    fileShaMap: {},
    ...overrides,
  };
}

function makeCloud(overrides: Partial<CloudModRef> = {}): CloudModRef {
  return {
    folderName: 'CloudFolder',
    remotePath: 'mods/CloudFolder',
    localModId: null,
    lastSyncedAt: '2024-01-03T00:00:00Z',
    syncStatus: 'synced',
    fileShaMap: {},
    fileCount: 3,
    totalSize: 300,
    remoteModifiedAt: '2024-01-03T00:00:00Z',
    ...overrides,
  };
}

function makeCfg(overrides: Partial<GitHubConfig> = {}): GitHubConfig {
  return {
    owner: 'LightSB',
    repo: 'private-mods',
    branch: 'main',
    basePath: 'mods/',
    status: 'connected',
    connectedAt: '2024-01-01T00:00:00Z',
    error: '',
    token: 'ghp_SUPER_SECRET_123456',
    ...overrides,
  };
}

interface FetchCall {
  url: string;
  init?: RequestInit;
}

function stubFetch(
  handler: (url: string, init?: RequestInit) => { status: number; body?: unknown } | Promise<{ status: number; body?: unknown }>,
): { calls: FetchCall[]; mock: ReturnType<typeof vi.fn> } {
  const calls: FetchCall[] = [];
  const mock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const { status, body } = await handler(url, init);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as unknown as Response;
  });
  vi.stubGlobal('fetch', mock);
  return { calls, mock };
}

function appStateWith(partial: Partial<AppState>): AppState {
  return { ...(createWorkspaceInitialState() as AppState), ...partial };
}

/* ============================================================== A. fsTree 深层边界 */

describe('A. fsTree 层级树——重构正确性与不可变性', () => {
  it('A1 同目录多文件合并到同一 dir，所有 nodeId 唯一', () => {
    const tree = buildTreeFromPaths(
      flat({
        'Root/a.txt': 'a',
        'Root/b.txt': 'b',
        'Root/sub/c.txt': 'c',
        'Root/sub/d.txt': 'd',
      }),
    );
    expect(tree).toHaveLength(1);
    const root = tree[0];
    expect(root.name).toBe('Root');
    expect(root.children.map((n) => n.name)).toEqual(['sub', 'a.txt', 'b.txt']);
    const sub = root.children.find((n) => n.name === 'sub')!;
    expect(sub.children.map((n) => n.name)).toEqual(['c.txt', 'd.txt']);
    const ids: string[] = [];
    const walk = (nodes: FSTreeNode[]): void => {
      for (const node of nodes) {
        ids.push(node.nodeId);
        walk(node.children);
      }
    };
    walk(tree);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.length > 0)).toBe(true);
  });

  it('A2 buildTreeFromPaths 过滤空段/./..，系统项过滤由调用方负责', () => {
    const tree = buildTreeFromPaths(
      flat({ './a//b/../c.txt': 'x', '/Root//d.txt': 'y' }),
    );
    // 系统项 __MACOSX 仍会出现在树里——证明 fsTree 自身不做业务过滤
    const withSystem = buildTreeFromPaths(flat({ '__MACOSX/x.txt': 'z', 'normal.txt': 'n' }));
    expect(withSystem.map((n) => n.name)).toContain('__MACOSX');
    expect(tree.map((n) => n.name).sort()).toEqual(['Root', 'a']);
  });

  it('A3 insertFile/insertFolder 返回新树，原树与原子节点均不被 mutate', () => {
    const original = buildTreeFromPaths(flat({ 'a/b.txt': 'x' }));
    const a = original[0];
    const child = a.children[0];
    const snapshot = JSON.stringify(original.map((n) => ({ ...n, data: undefined })));

    const next = insertFile(original, a.nodeId, fileNode('new.txt', blob('new')));
    expect(next).not.toBe(original);
    expect(original[0].children).toHaveLength(1);
    expect(a).toBe(original[0]); // 入参节点对象未替换
    expect(child.nodeId).toBe(a.children[0].nodeId);
    expect(JSON.stringify(original.map((n) => ({ ...n, data: undefined })))).toBe(snapshot);
    expect(findNode(next, a.nodeId)!.children.map((n) => n.name)).toContain('new.txt');

    const withRoot = insertFolder(original, null, dirNode('Empty', []));
    expect(withRoot).not.toBe(original);
    expect(original.some((n) => n.name === 'Empty')).toBe(false);
    expect(withRoot.some((n) => n.name === 'Empty')).toBe(true);
  });

  it('A4 renameNode 递归深层节点：只改 name，nodeId/children/data 完全保留', () => {
    const tree = buildTreeFromPaths(flat({ 'a/b/c.txt': 'deep' }));
    const a = tree[0];
    const b = a.children[0];
    const c = b.children[0];
    const renamed = renameNode(tree, c.nodeId, 'renamed.txt');
    const found = findNode(renamed, c.nodeId)!;
    expect(found.name).toBe('renamed.txt');
    expect(found.nodeId).toBe(c.nodeId);
    expect(found.kind).toBe('file');
    expect(found.data).toBe(c.data); // 字节引用不变
    expect(renamed[0]).not.toBe(a);
    expect(renamed[0].children[0]).not.toBe(b);
    expect(renamed[0].name).toBe('a');
    expect(tree[0].children[0].children[0].name).toBe('c.txt'); // 原树不变
    // 空/非法名回退到原 name，不会破坏定位
    expect(findNode(renameNode(tree, c.nodeId, '<>'), c.nodeId)!.name).toBe('c.txt');
  });

  it('A5 deleteNode 删整棵子树；深层分支互不影响；删不存在 id 返回同一棵树', () => {
    const tree = buildTreeFromPaths(flat({ 'A/x/1.txt': '1', 'A/y/2.txt': '2', 'B/3.txt': '3' }));
    const a = tree.find((n) => n.name === 'A')!;
    const x = a.children.find((n) => n.name === 'x')!;
    const y = a.children.find((n) => n.name === 'y')!;
    const pruned = deleteNode(tree, x.nodeId);
    expect(findNode(pruned, x.nodeId)).toBeNull();
    expect(findNode(pruned, x.children[0].nodeId)).toBeNull();
    expect(findNode(pruned, y.nodeId)?.name).toBe('y');
    expect(findNode(pruned, tree.find((n) => n.name === 'B')!.nodeId)?.name).toBe('B');
    expect(tree.find((n) => n.name === 'A')!.children).toHaveLength(2);
    expect(deleteNode(tree, 'not-exist')).toBe(tree);
  });

  it('A6 listChildren path=[] 返回根层，非法 path 返回空；computeStats 不计 dir', () => {
    const tree = buildTreeFromPaths(flat({ 'a/b.txt': 'hello', 'a/sub/c.txt': 'world!' }));
    expect(listChildren(tree, [])).toBe(tree);
    expect(listChildren(tree, ['bad-id'])).toEqual([]);
    const a = tree[0];
    const sub = a.children.find((n) => n.name === 'sub')!;
    expect(listChildren(tree, [a.nodeId, sub.nodeId]).map((n) => n.name)).toEqual(['c.txt']);
    expect(computeStats(tree)).toEqual({
      fileCount: 2,
      totalSize: blob('hello').size + blob('world!').size,
    });
    expect(computeStats([dirNode('only-empty', [])])).toEqual({ fileCount: 0, totalSize: 0 });
  });

  it('A7 safeNodeName 去非法字符/控制符/结尾点，空串回退 fallback', () => {
    expect(safeNodeName('a\0b\x1Fc')).toBe('abc');
    expect(safeNodeName('  name.  ')).toBe('name');
    expect(safeNodeName('..')).toBe('未命名');
    expect(safeNodeName('  ', '自定义')).toBe('自定义');
    expect(safeNodeName(null as unknown as string, 'fb')).toBe('fb');
  });

  it('A8 guessMime/isTextFile 文本与二进制边界', () => {
    expect(guessMime('a.json')).toBe('application/json');
    expect(guessMime('a.txt')).toBe('text/plain');
    expect(guessMime('a.PNG')).toBe('image/png');
    expect(guessMime('a.zip')).toBe('application/zip');
    expect(guessMime('a.unknown')).toBe('application/octet-stream');
    expect(isTextFile('a.json')).toBe(true);
    expect(isTextFile('a.txt')).toBe(true);
    expect(isTextFile('a.png')).toBe(false);
    expect(isTextFile('a.zip')).toBe(false);
    expect(isTextFile('a.bin', 'application/json')).toBe(true);
  });

  it('A9 textPreview 截断标记、恰好不截断、二进制返回空预览', async () => {
    expect(await textPreview(blob('abcdef'), 'a.txt', undefined, 3)).toEqual({
      isText: true,
      preview: 'abc',
      truncated: true,
    });
    expect(await textPreview(blob('abc'), 'a.txt', undefined, 10)).toEqual({
      isText: true,
      preview: 'abc',
      truncated: false,
    });
    expect(await textPreview(new Blob([new Uint8Array([1, 2, 3])]), 'a.zip', 'application/zip')).toEqual({
      isText: false,
      preview: '',
      truncated: false,
    });
  });
});

/* ============================================================== B. idSelect 补充 */

describe('B. idSelect 按 ID 自动勾选——纯集合求交', () => {
  it('B1 一个 mod 命中多个输入 id 只返回一次 mod.id；未匹配 id 去重且保持输入顺序', () => {
    const mods = [
      makeLocalMod({ id: 'a', nexusModIds: [1915, 2400] }),
      makeLocalMod({ id: 'b', nexusModIds: [999] }),
    ];
    const before = JSON.stringify(mods);
    expect(matchModsByInputIds(mods, [2400, 1915, 999, 777, 777])).toEqual({
      matchedIds: ['a', 'b'],
      unmatchedIds: [777],
    });
    expect(JSON.stringify(mods)).toBe(before);
  });

  it('B2 无 nexusModIds 的旧模组不命中；mods 非数组不抛错', () => {
    const legacy = makeLocalMod({ id: 'legacy', nexusModIds: undefined as unknown as number[] });
    expect(matchModsByInputIds([legacy], [1915])).toEqual({ matchedIds: [], unmatchedIds: [1915] });
    expect(matchModsByInputIds(null as unknown as LocalMod[], [1915])).toEqual({
      matchedIds: [],
      unmatchedIds: [1915],
    });
    expect(matchModsByInputIds([], null as unknown as number[])).toEqual({
      matchedIds: [],
      unmatchedIds: [],
    });
  });
});

/* ============================================================== C. librarySearch 补充 */

describe('C. librarySearch 本地搜索——按字段命中且零网络', () => {
  const mods = [
    makeLocalMod({
      id: 'cp',
      name: 'Content Patcher',
      author: 'CyanTrigger',
      uniqueId: 'ContentPatcher',
      rootFolder: 'CPFolder',
      updateKeys: ['Nexus:1915@CurseForge:123'],
      nexusModIds: [1915],
      manifest: {
        Name: 'CP Manifest Name', Author: '', Version: '', Description: '',
        UpdateKeys: [], UniqueID: '',
      },
    }),
    makeLocalMod({
      id: 'sc', name: 'SpaceCore', author: 'spacechase0', fileCount: 0,
      nexusModIds: [9999], updateKeys: ['Nexus:9999'],
    }),
  ];

  it('C1 name / manifest.Name / author / uniqueId / rootFolder / updateKeys / nexusModIds 均可命中', () => {
    const find = (q: string): string[] =>
      searchLibrary(mods, [], { query: q, includeCloud: false }).map((h) => h.id);
    expect(find('content')).toEqual(['cp']);
    expect(find('manifest name')).toEqual(['cp']);
    expect(find('CYAN')).toEqual(['cp']);
    expect(find('contentpatcher')).toEqual(['cp']);
    expect(find('cpfolder')).toEqual(['cp']);
    expect(find('curseforge')).toEqual(['cp']);
    expect(find('1915')).toEqual(['cp']);
    expect(find('spacecore')).toEqual(['sc']);
    expect(find('不存在的关键词')).toEqual([]);
  });

  it('C2 空 query 返回全部本地模组；首尾空格被忽略', () => {
    expect(searchLibrary(mods, [], { query: '', includeCloud: false })).toHaveLength(2);
    expect(searchLibrary(mods, [], { query: '   ', includeCloud: false })).toHaveLength(2);
  });

  it('C3 云端 localModId=null → selectable=false；本地有同 folderName 且 fileCount>0 → true', () => {
    const clouds = [
      makeCloud({ folderName: 'RemoteOnly', localModId: null }),
      makeCloud({ folderName: 'CPFolder', localModId: 'cp' }),
      makeCloud({ folderName: 'SpaceCore', localModId: 'sc' }),
    ];
    const hits = searchLibrary(mods, clouds, { query: '', includeCloud: true });
    const cloud = (name: string) => hits.find((h) => h.key === `cloud:${name}`)!;
    expect(cloud('RemoteOnly').selectable).toBe(false);
    expect(cloud('CPFolder').selectable).toBe(true);
    expect(cloud('SpaceCore').selectable).toBe(false); // 本地 fileCount=0
    expect(hits.filter((h) => h.kind === 'cloud')).toHaveLength(3);
  });

  it('C4 includeCloud=false 完全不含云端；全程 fetch 调用次数为 0', () => {
    const spy = vi.fn(() => Promise.resolve({ ok: true, json: async () => [] }));
    vi.stubGlobal('fetch', spy);
    const withCloud = searchLibrary(mods, [makeCloud()], { query: '', includeCloud: true });
    const withoutCloud = searchLibrary(mods, [makeCloud()], { query: '', includeCloud: false });
    expect(withCloud.some((h) => h.kind === 'cloud')).toBe(true);
    expect(withoutCloud.every((h) => h.kind === 'local')).toBe(true);
    expect(spy).toHaveBeenCalledTimes(0);
  });
});

/* ============================================================== E. githubService 隐私边界 */

describe('E. githubService——token 边界 / 错误文案 / 无破坏性副作用', () => {
  it('E1 configure 写入 localStorage，返回设置不含 token 且其余字段正确', () => {
    const input = {
      owner: 'LightSB', repo: 'mods', branch: 'dev', basePath: 'custom/',
      status: 'connected' as const, connectedAt: '2024-05-01T00:00:00Z', error: '',
      token: 'ghp_CONFIGURE_SECRET',
    };
    const settings = configure(input);
    expect(localStorage.getItem(APP_CONFIG.github.tokenStorageKey)).toBe('ghp_CONFIGURE_SECRET');
    expect(settings).toEqual({
      owner: 'LightSB', repo: 'mods', branch: 'dev', basePath: 'custom/',
      status: 'connected', connectedAt: '2024-05-01T00:00:00Z', error: '',
    });
    expect('token' in settings).toBe(false);
    expect(JSON.stringify(settings)).not.toContain('ghp_CONFIGURE_SECRET');
  });

  it('E2 readToken/writeToken/clearToken 往返正确，clear 后为空串', () => {
    expect(readToken()).toBe('');
    writeToken('ghp_AB');
    expect(readToken()).toBe('ghp_AB');
    writeToken('ghp_CD');
    expect(readToken()).toBe('ghp_CD');
    clearToken();
    expect(readToken()).toBe('');
    expect(localStorage.getItem(APP_CONFIG.github.tokenStorageKey)).toBeNull();
  });

  it('E3 testConnection 401/403 → Q5 文案（含"已同步的数据不会被清除"）', async () => {
    const cfg = makeCfg();
    for (const status of [401, 403]) {
      const { calls } = stubFetch(async () => ({ status, body: { message: 'Bad credentials' } }));
      const result = await testConnection(cfg);
      expect(result.ok).toBe(false);
      expect(result.message).toContain('Token 失效或权限不足');
      expect(result.message).toContain('已同步的数据不会被清除');
      expect(result.message).not.toContain(cfg.token);
      expect(calls).toHaveLength(1); // 若误触清库 API 会额外产生请求
    }
  });

  it('E4 testConnection 404 → 仓库不存在文案；429 → 频繁文案；网络异常有文案', async () => {
    const cfg = makeCfg();
    stubFetch(async () => ({ status: 404, body: {} }));
    expect((await testConnection(cfg)).message).toContain('仓库或路径不存在');
    stubFetch(async () => ({ status: 429, body: {} }));
    expect((await testConnection(cfg)).message).toContain('请求过于频繁');
    const boom = vi.fn(() => Promise.reject(new Error('network down')));
    vi.stubGlobal('fetch', boom);
    expect((await testConnection(cfg)).message).toContain('网络异常');
  });

  it('E5 错误路径不调用 dbService.clearAll / dbService.deleteMod（源码级静态断言）', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/services/githubService.ts'), 'utf8',
    );
    // githubService 不应导入 dbService，更不应出现清库调用
    expect(source).not.toMatch(/from\s+['"]\.\/dbService['"]/);
    expect(source).not.toMatch(/\bclearAll\s*\(/);
    expect(source).not.toMatch(/\bdeleteMod\s*\(\s*['"` ]/); // 仅保留自身导出的 deleteMod(cfg, folder)
    // 同时确认 dbService 中的清库函数在该模块运行期未被 spy 触发
    const clearSpy = vi.spyOn(dbServiceModule, 'clearAll').mockResolvedValue(undefined);
    const deleteSpy = vi.spyOn(dbServiceModule, 'deleteMod').mockResolvedValue(undefined);
    const cfg = makeCfg();
    stubFetch(async () => ({ status: 401, body: {} }));
    return testConnection(cfg).then(() => {
      expect(clearSpy).toHaveBeenCalledTimes(0);
      expect(deleteSpy).toHaveBeenCalledTimes(0);
    });
  });

  it('E6 所有 GitHub 请求带 Bearer；token 不出现在 URL / console', async () => {
    const cfg = makeCfg();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { calls } = stubFetch(async (url, init) => {
      if (init?.method === 'GET' && url.includes('/contents/')) {
        return { status: 200, body: [{ name: 'A', path: 'mods/A', type: 'dir', sha: 's1' }] };
      }
      return { status: 200, body: {} };
    });
    await testConnection(cfg);
    const refs = await listCloudMods(cfg);
    expect(refs).toHaveLength(1);
    expect(calls.length).toBeGreaterThan(1);
    for (const call of calls) {
      expect((call.init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${cfg.token}`);
      expect(call.url).not.toContain(cfg.token);
      expect(call.url.startsWith(APP_CONFIG.github.apiBase)).toBe(true);
    }
    for (const spy of [logSpy, errSpy, warnSpy]) {
      for (const args of spy.mock.calls) {
        expect(JSON.stringify(args)).not.toContain(cfg.token);
      }
    }
  });

  it('E7 uploadMod 单文件 >100MB → onWarn 并跳过，不产生 PUT', async () => {
    const cfg = makeCfg();
    const huge = { size: APP_CONFIG.github.maxFileBytes + 1 } as unknown as Blob;
    const mod = makeLocalMod({
      id: 'huge', rootFolder: 'HugeMod', cloudFolderName: 'HugeMod',
      fileTree: [fileNode('huge.bin', huge)],
    });
    const { calls } = stubFetch(async () => ({ status: 404, body: {} }));
    const warns: string[] = [];
    const ref = await uploadMod(cfg, mod, (msg) => warns.push(msg));
    expect(warns.some((m) => m.includes('超过 100MB') && m.includes('huge.bin'))).toBe(true);
    expect(calls.every((c) => c.init?.method !== 'PUT')).toBe(true);
    expect(ref.fileCount).toBe(0);
  });

  it('E8 updateMod sha 相同 → 跳过未变文件（PUT/DELETE 次数为 0）', async () => {
    const cfg = makeCfg();
    const mod = makeLocalMod({
      id: 'm', rootFolder: 'Mod', cloudFolderName: 'Mod',
      fileTree: [fileNode('a.txt', blob('a')), fileNode('b.txt', blob('b'))],
      fileShaMap: { 'a.txt': 'sha-a', 'b.txt': 'sha-b' },
    });
    const { calls } = stubFetch(async () => ({
      status: 200,
      body: [
        { name: 'a.txt', path: 'mods/Mod/a.txt', type: 'file', sha: 'sha-a' },
        { name: 'b.txt', path: 'mods/Mod/b.txt', type: 'file', sha: 'sha-b' },
      ],
    }));
    const ref = await updateMod(cfg, mod, makeCloud({ folderName: 'Mod', localModId: 'm' }));
    expect(calls.filter((c) => c.init?.method === 'PUT' || c.init?.method === 'DELETE')).toHaveLength(0);
    expect(ref.fileShaMap).toMatchObject({ 'a.txt': 'sha-a', 'b.txt': 'sha-b' });
    expect(ref.fileCount).toBe(2);
  });

  it('E9 listCloudMods 404 → []，不抛错', async () => {
    const { calls } = stubFetch(async () => ({ status: 404, body: {} }));
    expect(await listCloudMods(makeCfg())).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it('E10 分块 btoa 对 >64KB 字节不爆栈，base64 内容正确', async () => {
    const cfg = makeCfg();
    const bytes = new Uint8Array(70_000).fill(65); // 2 个以上 0x8000 分块
    const mod = makeLocalMod({
      id: 'big', rootFolder: 'Big', cloudFolderName: 'Big',
      fileTree: [fileNode('big.txt', new Blob([bytes]))],
    });
    const { calls } = stubFetch(async (_url, init) =>
      init?.method === 'PUT'
        ? { status: 200, body: { content: { sha: 'new-sha' } } }
        : { status: 404, body: {} },
    );
    const ref = await uploadMod(cfg, mod);
    const put = calls.find((c) => c.init?.method === 'PUT');
    expect(put).toBeDefined();
    const body = JSON.parse(put!.init!.body as string) as { content: string };
    const decoded = atob(body.content);
    expect(decoded.length).toBe(bytes.length);
    expect(decoded.slice(0, 5)).toBe('AAAAA');
    expect(ref.fileShaMap['big.txt']).toBe('new-sha');
  });

  it('E11 单目录 >1000 文件 → onWarn 并跳过余下文件', async () => {
    const cfg = makeCfg();
    const nodes = Array.from({ length: 1002 }, (_, i) => fileNode(`f${i}.txt`, blob('x')));
    const mod = makeLocalMod({ id: 'many', rootFolder: 'Many', cloudFolderName: 'Many', fileTree: nodes });
    stubFetch(async (_url, init) =>
      init?.method === 'PUT'
        ? { status: 200, body: { content: { sha: 's' } } }
        : { status: 404, body: {} },
    );
    const warns: string[] = [];
    const ref = await uploadMod(cfg, mod, (msg) => warns.push(msg));
    expect(warns.some((m) => m.includes('超过 1000 个文件'))).toBe(true);
    expect(ref.fileCount).toBe(APP_CONFIG.github.maxFilesPerDir);
  });
});

/* ============================================================== F. zipService 层级打包回归 */

describe('F. zipService——extractManifest 与层级树打包', () => {
  const manifestJson = JSON.stringify({
    NAME: 'Case Test', AUTHOR: 'QA', VERSION: '1.2.3', DESCRIPTION: 'd',
    UPDATEKEYS: ['Nexus:1915'], UNIQUEID: 'qa.mod',
  });

  it('F1 根 manifest.json 大小写不敏感、键名 lowercase 归一；字符串 UpdateKeys 转数组', async () => {
    const result = await extractManifest([fileNode('MANIFEST.JSON', blob(manifestJson))]);
    expect(result.reason).toBeUndefined();
    expect(result.manifest).toEqual({
      Name: 'Case Test', Author: 'QA', Version: '1.2.3', Description: 'd',
      UpdateKeys: ['Nexus:1915'], UniqueID: 'qa.mod',
    });
    const single = await extractManifest([fileNode('manifest.json', blob('{"name":"X","updatekeys":"Nexus:1"}'))]);
    expect(single.manifest?.UpdateKeys).toEqual(['Nexus:1']);
  });

  it('F2 子目录里的 manifest 不被误读；无 manifest / 非法 JSON 返回 null+reason', async () => {
    const nested = [dirNode('sub', [fileNode('manifest.json', blob(manifestJson))]), fileNode('a.txt', blob('a'))];
    const nestedResult = await extractManifest(nested);
    expect(nestedResult.manifest).toBeNull();
    expect(nestedResult.reason).toBe('未找到有效的 manifest.json');
    expect((await extractManifest([])).manifest).toBeNull();
    expect((await extractManifest([fileNode('manifest.json', blob('{bad json'))])).manifest).toBeNull();
    expect((await extractManifest([dirNode('dir', [])])).reason).toContain('未找到有效');
  });

  it('F3 packTreeToZip：rootFolder 优先、同名 -2、子目录层级、字节一致、空目录不写入', async () => {
    const binary = new Uint8Array([0, 1, 2, 250, 255]);
    const modA = makeLocalMod({
      id: 'a', rootFolder: 'MyMod', cloudFolderName: 'MyMod', name: 'A',
      fileTree: [
        fileNode('manifest.json', blob(manifestJson)),
        dirNode('Assets', [fileNode('a.xnb', new Blob([binary]))]),
        dirNode('EmptyDir', []),
      ],
    });
    const modB = makeLocalMod({
      id: 'b', rootFolder: 'MyMod', cloudFolderName: 'MyMod', name: 'B',
      fileTree: [fileNode('readme.txt', blob('hello'))],
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const zip = await JSZip.loadAsync(await (await packTreeToZip([modA, modB])).arrayBuffer());
    const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir).sort();
    expect(names).toEqual([
      'MyMod-2/readme.txt',
      'MyMod/Assets/a.xnb',
      'MyMod/manifest.json',
    ]);
    expect(names.some((n) => n.includes('EmptyDir'))).toBe(false);
    const bytes = new Uint8Array(await zip.file('MyMod/Assets/a.xnb')!.async('arraybuffer'));
    expect(Array.from(bytes)).toEqual(Array.from(binary));
    expect(await zip.file('MyMod-2/readme.txt')!.async('string')).toBe('hello');
    expect(fetchSpy).toHaveBeenCalledTimes(0);
  });

  it('F4 buildModsZip 别名与 packTreeToZip 产物一致；resolveModFolderName 兜底安全化', async () => {
    const mod = makeLocalMod({
      id: 'x', name: 'Bad/Name:*?', rootFolder: '', cloudFolderName: '',
      fileTree: [fileNode('a.txt', blob('content'))],
    });
    // rootFolder 与 cloudFolderName 都为空 → 用安全化后的 name（非法字符被剥离）
    expect(resolveModFolderName(mod)).toBe('BadName');
    const fullyIllegal = makeLocalMod({
      id: 'x', name: '<>:"/\\|?*', rootFolder: '', cloudFolderName: '',
      fileTree: [fileNode('a.txt', blob('content'))],
    });
    expect(resolveModFolderName(fullyIllegal)).toBe('mod-x'); // 全非法 → id 兜底
    const viaAlias = await JSZip.loadAsync(await (await buildModsZip([mod])).arrayBuffer());
    const viaNew = await JSZip.loadAsync(await (await packTreeToZip([mod])).arrayBuffer());
    const list = (z: JSZip) => Object.keys(z.files).filter((n) => !z.files[n].dir).sort();
    expect(list(viaAlias)).toEqual(list(viaNew));
    expect(list(viaAlias)).toEqual(['BadName/a.txt']);
  });
});

/* ============================================================== G. exportService 库清单导出补充 */

describe('G. exportService——库清单字段完整性 / 转义 / 空库', () => {
  it('G1 字段齐全；本地+云端按 folderName 去重并标来源', () => {
    const local = makeLocalMod({
      name: 'Full', cloudFolderName: 'FolderA', author: 'Author', version: '2.0',
      nexusModIds: [11, 22], updateStatus: 'outdated', fileCount: 4, totalSize: 4096,
      source: 'cloud', addedAt: '2024-02-02T00:00:00Z',
    });
    const rows = buildLibraryExportData(
      [local],
      [makeCloud({ folderName: 'FolderA' }), makeCloud({ folderName: 'FolderB' })],
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      name: 'Full', folderName: 'FolderA', author: 'Author', version: '2.0',
      nexusIds: '11,22', updateStatus: 'outdated', fileCount: 4, totalSize: 4096,
      source: 'cloud', addedAt: '2024-02-02T00:00:00Z',
    });
    expect(rows[1]).toMatchObject({ folderName: 'FolderB', source: 'cloud', author: '', nexusIds: '' });
  });

  it('G2 旧模组缺新字段 → 空串兜底，三种格式均不出现 undefined/null 字面量', () => {
    const legacy = {
      id: 'legacy', name: 'Old Mod', fileCount: 1, totalSize: 10,
      rootFolder: 'Old', updateStatus: 'unknown', source: 'folder-zip',
      addedAt: '2023-01-01T00:00:00Z',
    } as unknown as LocalMod;
    const rows = buildLibraryExportData([legacy], []);
    expect(rows[0]).toMatchObject({ author: '', version: '', nexusIds: '' });
    const csv = renderLibraryCsv(rows);
    const md = renderLibraryMd(rows);
    const json = renderLibraryJson(rows);
    expect(csv + md + json).not.toMatch(/undefined|null/);
    expect(JSON.parse(json)[0].name).toBe('Old Mod');
  });

  it('G3 CSV BOM + 逗号/引号/换行转义；MD 转义 |；JSON 可 parse', () => {
    const rows = buildLibraryExportData([makeLocalMod({ name: 'A,B"Q\nLine', author: 'X|Y' })], []);
    const csv = renderLibraryCsv(rows);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"A,B""Q\nLine"');
    expect(csv.endsWith('\r\n')).toBe(true);
    const md = renderLibraryMd(rows);
    expect(md).toContain('A,B"Q Line');
    expect(md).toContain('X\\|Y');
    expect(() => JSON.parse(renderLibraryJson(rows))).not.toThrow();
  });

  it('G4 文件名三格式 + 非法日期兜底；空库 exportLibrary 返回 false 且不创建 URL', () => {
    const now = new Date('2026-07-08T09:10:11Z');
    expect(buildLibraryExportFileName('md', now)).toBe('stardew-mod-library-2026-07-08.md');
    expect(buildLibraryExportFileName('json', now)).toBe('stardew-mod-library-2026-07-08.json');
    expect(buildLibraryExportFileName('csv', now)).toBe('stardew-mod-library-2026-07-08.csv');
    expect(buildLibraryExportFileName('md', new Date('bad'))).toMatch(/^stardew-mod-library-\d{4}-\d{2}-\d{2}\.md$/);

    const createObjectURL = vi.fn(() => 'blob:mock');
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL: vi.fn() });
    expect(exportLibrary([], [], 'csv')).toBe(false);
    expect(createObjectURL).toHaveBeenCalledTimes(0);
  });
});

/* ============================================================== H. workspaceReducer 增量 */

describe('H. workspaceReducer——v4 增量 action', () => {
  it('H1 createWorkspaceInitialState 13 字段齐全，libraryHydrated=false，github 无 token', () => {
    const state = createWorkspaceInitialState();
    expect(Object.keys(state).sort()).toEqual([
      'checkingIds', 'cloudMods', 'conflict', 'explorer', 'github', 'libraryHydrated',
      'librarySearch', 'localMods', 'packProgress', 'selectedPackIds', 'syncBusy',
      'syncProgress', 'uploadProgress',
    ]);
    expect(state.libraryHydrated).toBe(false);
    expect(state.librarySearch).toEqual({ query: '', includeCloud: true });
    expect('token' in defaultGitHubSettings()).toBe(false);
  });

  it('H2 HYDRATE_LIBRARY 写入 mods/meta 并置 libraryHydrated=true，重置瞬时字段', () => {
    const mod = makeLocalMod({ id: 'm1' });
    const cloud = makeCloud();
    const settings = defaultGitHubSettings();
    const dirty = appStateWith({
      libraryHydrated: false,
      checkingIds: ['m1'],
      conflict: { localModId: 'm1', folderName: 'F', localModifiedAt: 'a', remoteModifiedAt: 'b' },
      syncBusy: true,
      uploadProgress: { phase: 'done', current: 1, total: 1 },
    });
    const next = workspaceReducer(dirty, {
      type: 'HYDRATE_LIBRARY',
      mods: [mod],
      meta: { selectedPackIds: ['m1'], github: settings, cloudMods: [cloud] },
    });
    expect(next.localMods).toEqual([mod]);
    expect(next.selectedPackIds).toEqual(['m1']);
    expect(next.cloudMods).toEqual([cloud]);
    expect(next.github).toEqual(settings);
    expect(next.libraryHydrated).toBe(true);
    expect(next.checkingIds).toEqual([]);
    expect(next.conflict).toBeNull();
    expect(next.syncBusy).toBe(false);
    expect(next.uploadProgress).toBeNull();
    expect(next.explorer).toEqual({ modId: null, path: [] });
    expect(dirty.libraryHydrated).toBe(false);
  });

  it('H3 HYDRATE_LIBRARY 空 meta → 全部走安全默认值', () => {
    const next = workspaceReducer(appStateWith({}), {
      type: 'HYDRATE_LIBRARY', mods: [], meta: {},
    });
    expect(next.selectedPackIds).toEqual([]);
    expect(next.cloudMods).toEqual([]);
    expect(next.github).toEqual(defaultGitHubSettings());
    expect(next.libraryHydrated).toBe(true);
  });

  it('H4 REPLACE_LOCAL_MOD 只替换指定 id，其余对象引用不变', () => {
    const a = makeLocalMod({ id: 'a', name: 'A' });
    const b = makeLocalMod({ id: 'b', name: 'B' });
    const state = appStateWith({ localMods: [a, b] });
    const replacement = makeLocalMod({ id: 'a', name: 'A2', dirty: true });
    const next = workspaceReducer(state, { type: 'REPLACE_LOCAL_MOD', mod: replacement });
    expect(next.localMods[0]).toBe(replacement);
    expect(next.localMods[1]).toBe(b);
    expect(state.localMods[0]).toBe(a);
  });

  it('H5 ADD_SELECTED 按 id 合并去重，且不写回模组对象', () => {
    const a = makeLocalMod({ id: 'a', fileCount: 2 });
    const state = appStateWith({ localMods: [a], selectedPackIds: ['a'] });
    const next = workspaceReducer(state, { type: 'ADD_SELECTED', ids: ['a', 'b', 'b'] });
    expect(next.selectedPackIds).toEqual(['a', 'b']);
    expect(next.localMods[0]).toBe(a);
    expect('selected' in a).toBe(false);
    expect(state.selectedPackIds).toEqual(['a']);
  });

  it('H6 SET_CONFLICT 写入与清除冲突载荷', () => {
    const conflict = {
      localModId: 'm', folderName: 'F', localModifiedAt: '2024-01-01', remoteModifiedAt: '2024-01-02',
    };
    const set = workspaceReducer(appStateWith({}), { type: 'SET_CONFLICT', conflict });
    expect(set.conflict).toEqual(conflict);
    const cleared = workspaceReducer(set, { type: 'SET_CONFLICT', conflict: null });
    expect(cleared.conflict).toBeNull();
  });

  it('H7 APPLY_UPDATE_RESULT 回归：状态/信息/时间/脏标记全部写入，其他模组不变', () => {
    const a = makeLocalMod({ id: 'a' });
    const b = makeLocalMod({ id: 'b' });
    const state = appStateWith({ localMods: [a, b] });
    const result = {
      status: 'outdated' as const,
      updateInfo: { modId: 1915, version: '9.9', uploadedAt: '2024-06-01T00:00:00Z', fileId: 7 },
      checkError: '',
    };
    const next = workspaceReducer(state, {
      type: 'APPLY_UPDATE_RESULT', id: 'a', result, checkedAt: '2024-06-02T00:00:00Z',
    });
    expect(next.localMods[0]).toMatchObject({
      updateStatus: 'outdated', updateInfo: result.updateInfo, checkError: '',
      lastCheckedAt: '2024-06-02T00:00:00Z', dirty: true, modifiedAt: '2024-06-02T00:00:00Z',
    });
    expect(next.localMods[1]).toBe(b);
    expect(state.localMods[0].updateStatus).toBe('latest');
  });

  it('H8 已删除的搜索 action case 不再存在（静态确认）', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/hooks/workspaceReducer.ts'), 'utf8',
    );
    expect(source).not.toMatch(/case '(PERFORM_SEARCH|SET_SEARCH_QUERY|SET_ACTIVE_QUERY|CLEAR_SEARCH|ADD_PENDING_DOWNLOAD|REMOVE_PENDING_DOWNLOAD)'/);
    expect(source).not.toMatch(/\bsearchState\b|\bpendingDownloads\b/);
  });
});

/* ============================================================== I. 关键安全回归（静态） */

const SRC_ROOT = join(process.cwd(), 'src');

function allSourceFiles(dir = SRC_ROOT): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...allSourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe('I. 安全回归——删除项零残留 / 更新链只读 files.json / SW 唯一注册', () => {
  it('I1 更新检测源码只经 fetchFiles 读 files.json，不触达 download_link.json', () => {
    const update = readFileSync(join(SRC_ROOT, 'services/updateService.ts'), 'utf8');
    expect(update).toContain('fetchFiles');
    expect(update).not.toMatch(/downloadLink|download_link/);
    const config = readFileSync(join(SRC_ROOT, 'config/index.ts'), 'utf8');
    expect(config).toContain('files: (modId: number)');
    // download_link 仅作为 premium 直链端点存在，调用点必须位于 premium 守卫之后
    const download = readFileSync(join(SRC_ROOT, 'services/downloadService.ts'), 'utf8');
    const guardIndex = download.indexOf("plan.tier === 'premium'");
    const callIndex = download.indexOf('getDownloadLink(');
    expect(guardIndex).toBeGreaterThan(-1);
    expect(callIndex).toBeGreaterThan(guardIndex);
  });

  it('I2 SW：useRegisterSW / UpdatePrompt 源码 0 处；registerSW 调用仅 main.tsx 一处', () => {
    const files = allSourceFiles();
    const texts = files.map((path) => ({ path, text: readFileSync(path, 'utf8') }));
    expect(texts.some(({ text }) => text.includes('useRegisterSW'))).toBe(false);
    expect(texts.some(({ text }) => text.includes('UpdatePrompt'))).toBe(false);
    const registrations = texts.filter(({ text }) => /registerSW\s*\(\s*\{/.test(text));
    expect(registrations).toHaveLength(1);
    expect(registrations[0].path.endsWith(`${'main.tsx'}`)).toBe(true);
    const main = readFileSync(join(SRC_ROOT, 'main.tsx'), 'utf8');
    expect(main).toContain('registerSW({ immediate: true })');
  });

  it('I3 删除项零残留：searchMods / search.json / SearchState / PendingDownload / ModSearch / SearchResultCard', () => {
    const pattern = /\bsearchMods\b|search\.json|\bSearchState\b|\bPendingDownload\b|\bModSearch\b|\bSearchResultCard\b/;
    const offenders = allSourceFiles().filter((path) => pattern.test(readFileSync(path, 'utf8')));
    expect(offenders).toEqual([]);
    const config = readFileSync(join(SRC_ROOT, 'config/index.ts'), 'utf8');
    expect(config).not.toMatch(/\bapiPath\.search\b|\bgameId\b|search\s*:\s*\{/);
  });

  it('I4 层级树与 Blob 契约：源码无 FileNode 残留，树节点 data 类型为 Blob', () => {
    const offenders = allSourceFiles().filter((path) => /\bFileNode\b/.test(readFileSync(path, 'utf8')));
    expect(offenders).toEqual([]);
    const types = readFileSync(join(SRC_ROOT, 'types/workspace.ts'), 'utf8');
    expect(types).toContain('data?: Blob;');
  });
});
