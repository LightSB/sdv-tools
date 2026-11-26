import JSZip from 'jszip';
import { APP_CONFIG } from '../config';
import type {
  FlatFileItem,
  FSTreeNode,
  LocalMod,
  Manifest,
  ManifestParseResult,
  ModParseOutcome,
  ModSource,
  ProgressCallback,
} from '../types/workspace';
import { blobToBytes, buildTreeFromPaths, computeStats, guessMime, readBlobText } from '../utils/fsTree';
import { extractNexusModIds } from './updateService';

export type ZipMode = 'folder-zip' | 'single-zip';

const SYSTEM_SEGMENTS = new Set(['__MACOSX', '.DS_Store', 'Thumbs.db']);
const MANIFEST_NAME = /^manifest\.json$/i;

function normalizeEntryName(name: string): string {
  return name.replace(/^\.\//, '').replace(/^\/+/, '');
}

function isSystemEntry(name: string): boolean {
  const normalized = normalizeEntryName(name);
  const segments = normalized.split('/').filter((segment) => segment.length > 0);
  return segments.some(
    (segment) => SYSTEM_SEGMENTS.has(segment) || segment.startsWith('._'),
  );
}

function createLocalId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function parseManifestObject(raw: unknown): Manifest {
  const source: Record<string, unknown> =
    raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const lowered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    lowered[key.toLowerCase()] = value;
  }
  const asString = (value: unknown): string => (typeof value === 'string' ? value : '');
  let updateKeys: string[] = [];
  if (Array.isArray(lowered.updatekeys)) {
    updateKeys = lowered.updatekeys.filter((key): key is string => typeof key === 'string');
  } else if (typeof lowered.updatekeys === 'string') {
    updateKeys = [lowered.updatekeys];
  }
  return {
    Name: asString(lowered.name),
    Author: asString(lowered.author),
    Version: asString(lowered.version),
    Description: asString(lowered.description),
    UpdateKeys: updateKeys,
    UniqueID: asString(lowered.uniqueid),
  };
}

/**
 * 上传入口：读 File → JSZip.loadAsync → 按 mode 拆模组根 → 各根解压为 FlatFileItem[] → 层级建树/解析 manifest。
 * 入参用 File 而非裸 ArrayBuffer：需要 file.name 兜底命名、file.size 做阈值提示（Q7/Q8）。
 * 损坏/加密 zip 捕获后写入 skipped，已成功的模组照常返回（失败隔离）。
 */
export async function parseModsZip(
  file: File,
  mode: ZipMode,
  onProgress?: ProgressCallback,
): Promise<ModParseOutcome> {
  const outcome: ModParseOutcome = {
    mods: [],
    skipped: [],
    duplicateNames: [],
    recognizedFolders: [],
  };
  onProgress?.({ phase: 'reading', current: 0, total: file.size, message: '正在读取 zip 文件' });

  try {
    const buffer = await file.arrayBuffer();
    onProgress?.({ phase: 'reading', current: file.size, total: file.size, message: '读取完成' });
    const zip = await JSZip.loadAsync(buffer);
    const entries = Object.values(zip.files).filter(
      (entry) => !entry.dir && normalizeEntryName(entry.name).length > 0 && !isSystemEntry(entry.name),
    );
    const folders = new Set<string>();
    Object.values(zip.files).forEach((entry) => {
      const cleaned = normalizeEntryName(entry.name).replace(/\/+$/, '');
      if (cleaned.length === 0 || isSystemEntry(cleaned)) {
        return;
      }
      const segments = cleaned.split('/');
      if ((entry.dir && segments.length === 1) || segments.length > 1) {
        folders.add(segments[0]);
      }
    });
    const topLevelFiles = entries.filter((entry) => !normalizeEntryName(entry.name).includes('/'));
    const baseName = file.name.replace(/\.zip$/i, '') || '未命名模组';
    const specs: Array<{ root: string; prefix: string; entries: JSZip.JSZipObject[]; name: string }> = [];

    if (mode === 'folder-zip') {
      for (const folder of folders) {
        const prefix = `${folder}/`;
        specs.push({
          root: folder,
          prefix,
          entries: entries.filter((entry) => normalizeEntryName(entry.name).startsWith(prefix)),
          name: folder,
        });
      }
      if (topLevelFiles.length > 0) {
        specs.push({ root: '', prefix: '', entries: topLevelFiles, name: baseName });
      }
      outcome.recognizedFolders = Array.from(folders);
    } else {
      const lowerBase = baseName.toLowerCase();
      const sameNameRoot = Array.from(folders).find((folder) => {
        const lowerFolder = folder.toLowerCase();
        return (
          lowerFolder === lowerBase ||
          (/-(\d+)$/.test(lowerFolder) && lowerFolder.replace(/-\d+$/, '') === lowerBase)
        );
      });
      if (folders.size === 1 && sameNameRoot !== undefined) {
        const prefix = `${sameNameRoot}/`;
        specs.push({
          root: sameNameRoot,
          prefix,
          entries: entries.filter((entry) => normalizeEntryName(entry.name).startsWith(prefix)),
          name: baseName,
        });
      } else {
        specs.push({ root: '', prefix: '', entries, name: baseName });
      }
    }

    if (specs.length === 0) {
      outcome.skipped.push({ name: file.name, reason: '压缩包内没有可识别的模组文件' });
      return outcome;
    }

    onProgress?.({ phase: 'unzip', current: 0, total: specs.length, message: '正在解压' });
    for (let index = 0; index < specs.length; index += 1) {
      const spec = specs[index];
      try {
        const items: FlatFileItem[] = [];
        for (const entry of spec.entries) {
          const normalized = normalizeEntryName(entry.name);
          const path =
            spec.prefix.length > 0 && normalized.startsWith(spec.prefix)
              ? normalized.slice(spec.prefix.length)
              : normalized;
          if (path.length === 0) {
            continue;
          }
          items.push({ path, blob: await entry.async('blob'), mime: guessMime(path) });
        }
        const fileTree = await buildTreeFromEntries(items, onProgress);
        onProgress?.({
          phase: 'manifest',
          current: index + 1,
          total: specs.length,
          message: '正在解析 manifest',
        });
        outcome.mods.push(await assembleLocalMod(fileTree, spec.root, spec.name, mode));
      } catch (error) {
        outcome.skipped.push({
          name: spec.name || file.name,
          reason: error instanceof Error ? error.message : '无法解析该模组',
        });
      }
    }

    const seenIds = new Set<string>();
    const seenNames = new Set<string>();
    for (const mod of outcome.mods) {
      const duplicateById = mod.uniqueId.length > 0 && seenIds.has(mod.uniqueId);
      const duplicateByName = seenNames.has(mod.name);
      if (duplicateById || duplicateByName) {
        outcome.duplicateNames.push(mod.name);
      }
      if (mod.uniqueId.length > 0) {
        seenIds.add(mod.uniqueId);
      }
      seenNames.add(mod.name);
    }
  } catch {
    outcome.skipped.push({ name: file.name, reason: '无法解压：文件可能已加密或损坏' });
  }
  return outcome;
}

/** 【新签名】从扁平文件项层级建树（内部调用 fsTree.buildTreeFromPaths），过滤系统项。 */
export async function buildTreeFromEntries(
  items: FlatFileItem[],
  onProgress?: ProgressCallback,
): Promise<FSTreeNode[]> {
  const filtered = (Array.isArray(items) ? items : []).filter(
    (item) => item && typeof item.path === 'string' && item.path.length > 0 && !isSystemEntry(item.path),
  );
  const tree = buildTreeFromPaths(filtered);
  onProgress?.({ phase: 'unzip', current: filtered.length, total: filtered.length, message: '解压完成' });
  return tree;
}

/**
 * 【适配】从 FSTreeNode[] 中找根下的 manifest.json（大小写不敏感），只读预览式解码。
 * 注意：FSTreeNode.data 为 Blob，读取字节必须 await；签名返回 Promise。
 * 不递归子目录，避免误读子模组 manifest。
 */
export async function extractManifest(fileTree: FSTreeNode[]): Promise<ManifestParseResult> {
  const manifestNode = (Array.isArray(fileTree) ? fileTree : []).find(
    (node) => node.kind === 'file' && MANIFEST_NAME.test(node.name) && node.data !== undefined,
  );
  if (!manifestNode || manifestNode.data === undefined) {
    return { manifest: null, reason: '未找到有效的 manifest.json' };
  }
  try {
    const text = await readBlobText(manifestNode.data);
    const parsed: unknown = JSON.parse(text);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { manifest: null, reason: '未找到有效的 manifest.json' };
    }
    return { manifest: parseManifestObject(parsed) };
  } catch {
    return { manifest: null, reason: '未找到有效的 manifest.json' };
  }
}

async function assembleLocalMod(
  fileTree: FSTreeNode[],
  rootFolder: string,
  baseName: string,
  source: ModSource,
): Promise<LocalMod> {
  const parsed = await extractManifest(fileTree);
  const manifest = parsed.manifest;
  const stats = computeStats(fileTree);
  const updateKeys = manifest?.UpdateKeys ?? [];
  const addedAt = new Date().toISOString();
  const id = createLocalId();
  return {
    id,
    name: manifest?.Name || rootFolder || baseName,
    author: manifest?.Author ?? '',
    version: manifest?.Version ?? '',
    description: manifest?.Description ?? '',
    manifest,
    updateKeys,
    nexusModIds: extractNexusModIds(updateKeys),
    fileTree,
    fileCount: stats.fileCount,
    totalSize: stats.totalSize,
    rootFolder,
    source,
    uniqueId: manifest?.UniqueID ?? '',
    updateStatus: 'unknown',
    updateInfo: null,
    checkError: '尚未检测',
    lastCheckedAt: null,
    addedAt,
    dirty: false,
    modifiedAt: addedAt,
    syncStatus: 'local-only',
    lastSyncedAt: null,
    cloudFolderName: sanitizeFileName(rootFolder || manifest?.Name || `mod-${id}`, `mod-${id}`),
    fileShaMap: {},
  };
}

/** 【新增 Q4】rootFolder → sanitize(name) → mod-{id}，打包与云端共用此函数。 */
export function resolveModFolderName(mod: LocalMod): string {
  const raw = mod.rootFolder || (mod.name ? sanitizeFileName(mod.name, '') : '') || `mod-${mod.id}`;
  return sanitizeFileName(raw, `mod-${mod.id}`);
}

/** v3 兼容别名：语义已与 resolveModFolderName 一致（rootFolder 优先）。 */
export function resolvePackFolderName(mod: LocalMod): string {
  return resolveModFolderName(mod);
}

/** 去非法字符 `<>:"/\|?*` 与控制字符、压缩空白、去首尾空格与结尾点；空串返回 fallback。 */
export function sanitizeFileName(name: string, fallback: string): string {
  if (typeof name !== 'string') {
    return fallback;
  }
  const cleaned = name
    .replace(/[<>:"/\\|?*\x00-\x1F\x7F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.\s]+$/, '')
    .trim();
  return cleaned.length > 0 ? cleaned : fallback;
}

/** 打包文件名：stardew-mods-pack-YYYY-MM-DD.zip（日期取 UTC）。 */
export function buildPackFileName(now: Date = new Date()): string {
  return `${APP_CONFIG.pack.fileNamePrefix}-${now.toISOString().slice(0, 10)}.zip`;
}

/**
 * 【新签名】递归打包 FSTreeNode：dir 递归拼路径，file await blob.arrayBuffer() 后 zip.file()。
 * 空目录沿用 v3 行为（不单独写入）。全程无 fetch，只产出 Blob。
 */
export async function packTreeToZip(
  mods: LocalMod[],
  onProgress?: ProgressCallback,
): Promise<Blob> {
  const zip = new JSZip();
  const used = new Map<string, number>();
  const totalFiles = (Array.isArray(mods) ? mods : []).reduce(
    (sum, mod) => sum + computeStats(mod.fileTree).fileCount,
    0,
  );
  let done = 0;

  for (const mod of Array.isArray(mods) ? mods : []) {
    const baseFolder = resolveModFolderName(mod);
    let folder = baseFolder;
    let suffix = used.get(baseFolder) ?? 1;
    while (used.has(folder)) {
      suffix += 1;
      folder = `${baseFolder}-${suffix}`;
    }
    used.set(baseFolder, suffix);
    used.set(folder, suffix);

    const walk = async (nodes: FSTreeNode[], prefix: string): Promise<void> => {
      for (const node of nodes) {
        const relative = prefix.length > 0 ? `${prefix}/${node.name}` : node.name;
        if (node.kind === 'dir') {
          await walk(node.children, relative);
          continue;
        }
        if (!node.data) {
          continue;
        }
        const bytes = await blobToBytes(node.data);
        zip.file(`${folder}/${relative}`, bytes);
        done += 1;
        onProgress?.({
          phase: 'packing',
          current: done,
          total: totalFiles,
          message: `正在打包 ${mod.name}`,
        });
      }
    };
    await walk(mod.fileTree, '');
  }

  return zip.generateAsync(
    { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
    (metadata) =>
      onProgress?.({
        phase: 'packing',
        current: Math.round(metadata.percent),
        total: 100,
        message: '正在生成 zip',
      }),
  );
}

/** 向后兼容别名（v3 测试与既有调用）：内部直接 return packTreeToZip(...)。 */
export function buildModsZip(mods: LocalMod[], onProgress?: ProgressCallback): Promise<Blob> {
  return packTreeToZip(mods, onProgress);
}
