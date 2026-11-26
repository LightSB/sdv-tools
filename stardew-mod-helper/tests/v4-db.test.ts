// @vitest-environment node
/**
 * v4 补充测试：dbService（IndexedDB 持久化）往返验证。
 * 使用 fake-indexeddb 提供内存 IndexedDB；node 环境原生 Blob 可被结构化克隆，
 * 与浏览器行为一致，可直接验证「Blob 字节不被 JSON 序列化破坏」。
 */
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { APP_CONFIG } from '../src/config';
import {
  clearAll,
  deleteMod,
  loadAllCloudMods,
  loadAllMods,
  loadGitHubSettings,
  loadMeta,
  openDB,
  saveCloudMod,
  saveMeta,
  saveMod,
} from '../src/services/dbService';
import type { CloudModRef, FSTreeNode, LocalMod } from '../src/types/workspace';

function makeLocalMod(overrides: Partial<LocalMod> = {}): LocalMod {
  return {
    id: 'db-mod-1',
    name: 'Blob Roundtrip',
    author: 'QA',
    version: '1.0.0',
    description: '',
    manifest: null,
    updateKeys: [],
    nexusModIds: [1915],
    fileTree: [],
    fileCount: 0,
    totalSize: 0,
    rootFolder: 'BlobMod',
    source: 'folder-zip',
    uniqueId: 'qa.blob',
    updateStatus: 'unknown',
    updateInfo: null,
    checkError: '',
    lastCheckedAt: null,
    addedAt: '2024-01-01T00:00:00Z',
    dirty: false,
    modifiedAt: '2024-01-01T00:00:00Z',
    syncStatus: 'local-only',
    lastSyncedAt: null,
    cloudFolderName: 'BlobMod',
    fileShaMap: {},
    ...overrides,
  };
}

function makeCloud(overrides: Partial<CloudModRef> = {}): CloudModRef {
  return {
    folderName: 'CloudA',
    remotePath: 'mods/CloudA',
    localModId: null,
    lastSyncedAt: '2024-01-01T00:00:00Z',
    syncStatus: 'synced',
    fileShaMap: { 'a.txt': 'sha-a' },
    fileCount: 1,
    totalSize: 5,
    remoteModifiedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

beforeEach(async () => {
  await clearAll(true);
});

describe('D. dbService——IndexedDB 三 store 幂等与 Blob 字节往返', () => {
  it('D1 openDB 幂等，含 mods/meta/cloudMods 三个 store，库名/版本取 APP_CONFIG', async () => {
    const [db1, db2] = await Promise.all([openDB(), openDB()]);
    expect(db1).toBe(db2);
    expect(db1.name).toBe(APP_CONFIG.db.name);
    expect(db1.version).toBe(APP_CONFIG.db.version);
    const names = Array.from(db1.objectStoreNames).sort();
    expect(names).toEqual(['cloudMods', 'meta', 'mods']);
    expect(await openDB()).toBe(db1);
  });

  it('D2 saveMod → loadAllMods 往返，fileTree 内 Blob 字节完整且仍为 Blob', async () => {
    const bytes = new Uint8Array(256);
    for (let i = 0; i < 256; i += 1) bytes[i] = i;
    const data = new Blob([bytes], { type: 'application/octet-stream' });
    const tree: FSTreeNode[] = [
      {
        nodeId: 'dir-1', name: 'Assets', kind: 'dir', size: 0,
        children: [{ nodeId: 'file-1', name: 'a.xnb', kind: 'file', children: [], data, size: data.size }],
      },
    ];
    const mod = makeLocalMod({ fileTree: tree, fileCount: 1, totalSize: bytes.length });
    await saveMod(mod);
    const loaded = await loadAllMods();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe(mod.id);
    const stored = loaded[0].fileTree[0].children[0].data!;
    expect(stored).toBeInstanceOf(Blob);
    const restored = new Uint8Array(await stored.arrayBuffer());
    expect(Array.from(restored)).toEqual(Array.from(bytes));
    expect(loaded[0].fileTree[0].children[0].nodeId).toBe('file-1');
  });

  it('D3 saveMod 同 id 再存为 upsert（put 非 add），deleteMod 移除单条', async () => {
    await saveMod(makeLocalMod({ id: 'x', name: 'Old' }));
    await saveMod(makeLocalMod({ id: 'x', name: 'New' }));
    expect((await loadAllMods()).map((m) => m.name)).toEqual(['New']);
    await saveMod(makeLocalMod({ id: 'y', name: 'Keep' }));
    await deleteMod('x');
    expect((await loadAllMods()).map((m) => m.id)).toEqual(['y']);
  });

  it('D4 saveMeta/loadMeta 往返；loadGitHubSettings 便捷读取无 token 设置', async () => {
    const selected = ['db-mod-1', 'db-mod-2'];
    await saveMeta('selectedPackIds', selected);
    expect(await loadMeta<string[]>('selectedPackIds')).toEqual(selected);
    const github = {
      owner: 'LightSB', repo: 'private', branch: 'main', basePath: 'mods/',
      status: 'connected' as const, connectedAt: '2024-02-02T00:00:00Z', error: '',
    };
    await saveMeta('github', github);
    expect(await loadGitHubSettings()).toEqual(github);
    expect(await loadMeta('not-exist')).toBeUndefined();
  });

  it('D5 clearAll(false) 清 mods/cloudMods 但保留 meta；clearAll(true) 连 meta 一起清', async () => {
    await saveMod(makeLocalMod());
    await saveCloudMod(makeCloud());
    await saveMeta('github', { owner: 'keep' });
    await clearAll();
    expect(await loadAllMods()).toEqual([]);
    expect(await loadAllCloudMods()).toEqual([]);
    expect(await loadMeta('github')).toEqual({ owner: 'keep' });
    await saveMod(makeLocalMod({ id: 'again' }));
    await clearAll(true);
    expect(await loadAllMods()).toEqual([]);
    expect(await loadMeta('github')).toBeUndefined();
  });

  it('D6 saveCloudMod/loadAllCloudMods 往返含 fileShaMap', async () => {
    const ref = makeCloud();
    await saveCloudMod(ref);
    await saveCloudMod(makeCloud({ folderName: 'CloudB' }));
    const loaded = await loadAllCloudMods();
    expect(loaded).toHaveLength(2);
    expect(loaded.find((r) => r.folderName === 'CloudA')?.fileShaMap).toEqual({ 'a.txt': 'sha-a' });
  });

  it('D7 源码级确认：saveMod 用 put(mod)，不存在 JSON.stringify(mod)', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../src/services/dbService.ts', import.meta.url)), 'utf8',
    );
    expect(source).toContain('store.put(mod)');
    expect(source).not.toMatch(/JSON\.stringify\s*\(/);
    expect(source).toContain("createObjectStore(STORE_MODS, { keyPath: 'id' })");
    expect(source).toContain("createObjectStore(STORE_META, { keyPath: 'key' })");
    expect(source).toContain("createObjectStore(STORE_CLOUD, { keyPath: 'folderName' })");
  });
});
