/** 【v4 R48/Q8】模组库本地搜索：本地 + 云端元数据模糊匹配，纯函数、零网络。 */
import type { CloudModRef, LibrarySearchState, LocalMod } from '../types/workspace';

export interface LibraryHit {
  /** 本地 = mod.id；云端 = `cloud:${folderName}` */
  key: string;
  kind: 'local' | 'cloud';
  /** 本地 mod.id / 云端 folderName */
  id: string;
  name: string;
  author: string;
  folderName: string;
  updateStatus: string;
  fileCount: number;
  totalSize: number;
  /** 云端且未拉取 → false（Q8：需先拉取再打包） */
  selectable: boolean;
}

type SearchField = string | number | Array<string | number>;

function matches(query: string, fields: SearchField[]): boolean {
  if (query.length === 0) {
    return true;
  }
  return fields.some((field) => {
    if (Array.isArray(field)) {
      return field.some((item) => String(item ?? '').toLowerCase().includes(query));
    }
    return String(field ?? '').toLowerCase().includes(query);
  });
}

/**
 * 模糊匹配 name/manifest.Name/author/uniqueId/rootFolder/updateKeys/nexusModIds；
 * 大小写不敏感；空 query 返回全部本地模组；includeCloud 时并入云端元数据。
 */
export function searchLibrary(
  mods: LocalMod[],
  clouds: CloudModRef[],
  state: LibrarySearchState,
): LibraryHit[] {
  const query = typeof state?.query === 'string' ? state.query.trim().toLowerCase() : '';
  const localMods = Array.isArray(mods) ? mods : [];
  const cloudMods = Array.isArray(clouds) ? clouds : [];

  const hits: LibraryHit[] = localMods
    .filter((mod) =>
      matches(query, [
        mod.name,
        mod.manifest?.Name ?? '',
        mod.author,
        mod.uniqueId,
        mod.rootFolder,
        mod.updateKeys,
        mod.nexusModIds,
      ]),
    )
    .map((mod) => ({
      key: mod.id,
      kind: 'local' as const,
      id: mod.id,
      name: mod.name,
      author: mod.author,
      folderName: mod.cloudFolderName || mod.rootFolder || mod.name,
      updateStatus: mod.updateStatus,
      fileCount: mod.fileCount,
      totalSize: mod.totalSize,
      selectable: mod.fileCount > 0,
    }));

  if (state?.includeCloud === true) {
    for (const ref of cloudMods) {
      const linked = ref.localModId ? localMods.find((mod) => mod.id === ref.localModId) : undefined;
      const sameFolder = localMods.find(
        (mod) =>
          mod.cloudFolderName === ref.folderName ||
          mod.rootFolder === ref.folderName ||
          (linked !== undefined && mod.id === linked.id),
      );
      if (
        !matches(query, [
          ref.folderName,
          linked?.name ?? '',
          linked?.author ?? '',
          linked?.uniqueId ?? '',
        ])
      ) {
        continue;
      }
      hits.push({
        key: `cloud:${ref.folderName}`,
        kind: 'cloud',
        id: ref.folderName,
        name: linked?.name ?? ref.folderName,
        author: linked?.author ?? '',
        folderName: ref.folderName,
        updateStatus: linked?.updateStatus ?? ref.syncStatus,
        fileCount: ref.fileCount,
        totalSize: ref.totalSize,
        // 云端项文件树不在本地：未拉取到本地时禁止勾选打包（Q8/U4）
        selectable: ref.localModId !== null && sameFolder !== undefined && sameFolder.fileCount > 0,
      });
    }
  }

  return hits;
}
