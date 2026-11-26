// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_CONFIG } from '../src/config';
import {
  buildLibraryExportData,
  buildLibraryExportFileName,
  exportLibrary,
  renderLibraryCsv,
  renderLibraryJson,
  renderLibraryMd,
} from '../src/services/exportService';
import type { CloudModRef, FlatFileItem, FSTreeNode, LocalMod } from '../src/types/workspace';
import {
  buildTreeFromPaths,
  computeStats,
  deleteNode,
  findNode,
  guessMime,
  insertFile,
  insertFolder,
  isTextFile,
  listChildren,
  makeNodeId,
  renameNode,
  safeNodeName,
  textPreview,
} from '../src/utils/fsTree';
import { matchModsByInputIds } from '../src/utils/idSelect';
import { searchLibrary } from '../src/utils/librarySearch';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function blob(text: string): Blob {
  return new Blob([text], { type: 'text/plain' });
}

function items(entries: Record<string, string>): FlatFileItem[] {
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

// ================================================================ 1. fsTree
describe('1. fsTree 层级树纯函数', () => {
  it('buildTreeFromPaths 按 / 建层级，目录优先、size 取 Blob 字节数', () => {
    const tree = buildTreeFromPaths(
      items({ 'manifest.json': '{}', 'content/a.txt': 'hello', 'content/deep/b.txt': 'world' }),
    );
    expect(tree.map((node) => node.name)).toEqual(['content', 'manifest.json']);
    const content = tree.find((node) => node.name === 'content');
    expect(content?.kind).toBe('dir');
    expect(content?.children.map((node) => node.name)).toEqual(['deep', 'a.txt']);
    const deep = content?.children.find((node) => node.name === 'deep');
    expect(deep?.children[0].name).toBe('b.txt');
    expect(deep?.children[0].data).toBeInstanceOf(Blob);
    expect(deep?.children[0].size).toBe(blob('world').size);
  });

  it('renameNode 只改 name，nodeId 与子树原样保留', () => {
    const tree = buildTreeFromPaths(items({ 'a/b.txt': 'x' }));
    const folder = tree[0];
    const child = folder.children[0];
    const renamed = renameNode(tree, folder.nodeId, 'NewName');
    expect(renamed[0].nodeId).toBe(folder.nodeId);
    expect(renamed[0].name).toBe('NewName');
    expect(renamed[0].children[0].nodeId).toBe(child.nodeId);
    expect(renamed[0].children[0].name).toBe('b.txt');
    expect(tree[0].name).toBe('a'); // 入参不变
  });

  it('deleteNode 删除整棵子树，其他节点保留；findNode 深度优先', () => {
    const tree = buildTreeFromPaths(items({ 'a/b.txt': 'x', 'c.txt': 'y' }));
    const a = tree.find((node) => node.name === 'a')!;
    const pruned = deleteNode(tree, a.nodeId);
    expect(pruned.map((node) => node.name)).toEqual(['c.txt']);
    expect(findNode(pruned, a.nodeId)).toBeNull();
    expect(findNode(tree, a.children[0].nodeId)?.name).toBe('b.txt');
  });

  it('insertFile / insertFolder 在指定 parentId 下插入（null=根）', () => {
    let tree = buildTreeFromPaths(items({ 'a/b.txt': 'x' }));
    const a = tree.find((node) => node.name === 'a')!;
    const fileNode: FSTreeNode = {
      nodeId: makeNodeId(), name: 'new.txt', kind: 'file', children: [], data: blob('new'), size: 3,
    };
    tree = insertFile(tree, a.nodeId, fileNode);
    expect(listChildren(tree, [a.nodeId]).map((node) => node.name)).toEqual(['b.txt', 'new.txt']);
    tree = insertFolder(tree, null, {
      nodeId: makeNodeId(), name: 'empty', kind: 'dir', children: [], size: 0,
    });
    expect(tree.some((node) => node.name === 'empty')).toBe(true);
  });

  it('computeStats 递归汇总 file 数与 size；listChildren 按 nodeId 路径定位', () => {
    const tree = buildTreeFromPaths(items({ 'a/b.txt': 'hello', 'a/c/d.txt': 'world!' }));
    expect(computeStats(tree)).toEqual({
      fileCount: 2,
      totalSize: blob('hello').size + blob('world!').size,
    });
    const a = tree.find((node) => node.name === 'a')!;
    expect(listChildren(tree, []).some((node) => node.nodeId === a.nodeId)).toBe(true);
    expect(listChildren(tree, [a.nodeId]).map((node) => node.name)).toEqual(['c', 'b.txt']);
    expect(listChildren(tree, ['missing'])).toEqual([]);
  });

  it('guessMime / isTextFile / safeNodeName 边界', () => {
    expect(guessMime('manifest.json')).toBe('application/json');
    expect(guessMime('unknown.bin')).toBe('application/octet-stream');
    expect(isTextFile('a.cfg')).toBe(true);
    expect(isTextFile('a.png', 'image/png')).toBe(false);
    expect(safeNodeName('  Bad<Name>?. ', 'fallback')).toBe('BadName');
    expect(safeNodeName('<>:"', 'fallback')).toBe('fallback');
  });

  it('textPreview 文本截断 / 二进制返回 isText=false', async () => {
    const text = await textPreview(blob('abcdef'), 'a.txt', undefined, 3);
    expect(text).toEqual({ isText: true, preview: 'abc', truncated: true });
    const binary = await textPreview(new Blob([new Uint8Array([0, 1, 2])]), 'a.png', 'image/png');
    expect(binary).toEqual({ isText: false, preview: '', truncated: false });
  });
});

// ================================================================ 2. idSelect
describe('2. idSelect 按 ID 勾选', () => {
  it('交集命中，未匹配 ID 汇总；不写回模组对象', () => {
    const mods = [
      makeLocalMod({ id: 'a', nexusModIds: [1915, 2400] }),
      makeLocalMod({ id: 'b', nexusModIds: [3000] }),
    ];
    const result = matchModsByInputIds(mods, [1915, 3000, 9999, 1915]);
    expect(result).toEqual({ matchedIds: ['a', 'b'], unmatchedIds: [9999] });
    expect(mods[0].nexusModIds).toEqual([1915, 2400]);
  });

  it('空输入与非法 id 返回空结果', () => {
    expect(matchModsByInputIds([makeLocalMod()], [])).toEqual({ matchedIds: [], unmatchedIds: [] });
    expect(matchModsByInputIds([makeLocalMod()], [0, -1, 1.5])).toEqual({
      matchedIds: [],
      unmatchedIds: [],
    });
  });
});

// ================================================================ 3. librarySearch
describe('3. librarySearch 模组库搜索', () => {
  const mods = [
    makeLocalMod({
      id: 'a',
      name: 'Content Patcher',
      author: 'CyanTrigger',
      uniqueId: 'ContentPatcher',
      rootFolder: 'CP',
      updateKeys: ['Nexus:1915'],
      nexusModIds: [1915],
    }),
    makeLocalMod({ id: 'b', name: 'SpaceCore', author: 'spacechase0', fileCount: 0 }),
  ];

  it('空 query 返回全部本地；关键词大小写不敏感且匹配多字段', () => {
    expect(searchLibrary(mods, [], { query: '', includeCloud: true }).map((hit) => hit.id)).toEqual([
      'a', 'b',
    ]);
    const hits = searchLibrary(mods, [], { query: 'cyan', includeCloud: false });
    expect(hits.map((hit) => hit.id)).toEqual(['a']);
    expect(searchLibrary(mods, [], { query: '1915', includeCloud: false })[0].id).toBe('a');
  });

  it('fileCount=0 的本地项不可勾选；云端未拉取项 selectable=false', () => {
    const hits = searchLibrary(mods, [makeCloud({ folderName: 'CP' })], {
      query: '',
      includeCloud: true,
    });
    expect(hits.find((hit) => hit.id === 'b')?.selectable).toBe(false);
    const cloud = hits.find((hit) => hit.key === 'cloud:CP')!;
    expect(cloud.kind).toBe('cloud');
    expect(cloud.selectable).toBe(false);
  });

  it('includeCloud=false 不并入云端元数据', () => {
    const hits = searchLibrary(mods, [makeCloud()], { query: '', includeCloud: false });
    expect(hits.every((hit) => hit.kind === 'local')).toBe(true);
  });
});

// ================================================================ 4. exportLibrary
describe('4. exportLibrary 库清单导出', () => {
  it('buildLibraryExportData 本地 + 云端按 folderName 去重，标注来源', () => {
    const rows = buildLibraryExportData(
      [makeLocalMod()],
      [makeCloud(), makeCloud({ folderName: 'DemoFolder' })],
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      folderName: 'DemoFolder',
      nexusIds: '1915',
      source: 'folder-zip',
    });
    expect(rows[1]).toMatchObject({ folderName: 'CloudFolder', source: 'cloud' });
  });

  it('CSV 带 UTF-8 BOM，MD 转义 |，JSON 为稳定结构', () => {
    const rows = buildLibraryExportData([makeLocalMod({ name: 'A|B' })], []);
    const csv = renderLibraryCsv(rows);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('A|B');
    expect(renderLibraryMd(rows)).toContain('A\\|B');
    expect(JSON.parse(renderLibraryJson(rows))[0].name).toBe('A|B');
  });

  it('文件名 stardew-mod-library-YYYY-MM-DD.{md|json|csv}', () => {
    const now = new Date('2026-06-01T12:34:56Z');
    expect(buildLibraryExportFileName('md', now)).toBe('stardew-mod-library-2026-06-01.md');
    expect(buildLibraryExportFileName('csv', now)).toBe('stardew-mod-library-2026-06-01.csv');
    expect(APP_CONFIG.libraryExportFileNamePrefix).toBe('stardew-mod-library');
  });

  it('空库返回 false 且不触发下载；非空返回 true', () => {
    const createUrl = vi.fn(() => 'blob:mock');
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    vi.stubGlobal('URL', { ...URL, createObjectURL: createUrl, revokeObjectURL: vi.fn() });
    expect(exportLibrary([], [], 'md')).toBe(false);
    expect(createUrl).toHaveBeenCalledTimes(0);
    expect(exportLibrary([makeLocalMod()], [], 'md')).toBe(true);
    expect(createUrl).toHaveBeenCalledTimes(1);
  });
});
