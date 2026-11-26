/** 【v4 R50】层级文件树纯函数：建树 / 增删改名 / 查找 / 列举 / 统计 / 文本预览。全部无副作用。 */
import type { FSTreeNode, FlatFileItem } from '../types/workspace';

export interface TreeStats {
  fileCount: number;
  totalSize: number;
}

export interface TextPreview {
  isText: boolean;
  preview: string;
  truncated: boolean;
}

const TEXT_EXTENSIONS = new Set([
  'json', 'txt', 'cfg', 'ini', 'md', 'xml', 'yml', 'yaml', 'log', 'csv', 'conf', 'properties', 'sln', 'cs', 'js', 'ts',
]);

/** 生成稳定 nodeId：crypto.randomUUID() 兜底 `${Date.now()}-${random}`。 */
export function makeNodeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** 扩展名 → mime；未知返回 application/octet-stream。 */
export function guessMime(name: string): string {
  const extension = typeof name === 'string' ? name.split('.').pop()?.toLowerCase() ?? '' : '';
  const table: Record<string, string> = {
    json: 'application/json',
    txt: 'text/plain',
    cfg: 'text/plain',
    ini: 'text/plain',
    conf: 'text/plain',
    properties: 'text/plain',
    md: 'text/markdown',
    xml: 'application/xml',
    yml: 'text/yaml',
    yaml: 'text/yaml',
    log: 'text/plain',
    csv: 'text/csv',
    css: 'text/css',
    html: 'text/html',
    js: 'text/javascript',
    ts: 'text/plain',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    zip: 'application/zip',
    dll: 'application/octet-stream',
    pdb: 'application/octet-stream',
    xnb: 'application/octet-stream',
  };
  return table[extension] ?? 'application/octet-stream';
}

/** 是否文本类（json/txt/cfg/ini/md/xml/yml/yaml/log/csv 等）。 */
export function isTextFile(name: string, mime?: string): boolean {
  const extension = typeof name === 'string' ? name.split('.').pop()?.toLowerCase() ?? '' : '';
  const mimeText =
    typeof mime === 'string' &&
    (mime.startsWith('text/') ||
      mime.includes('json') ||
      mime.includes('xml') ||
      mime.includes('yaml'));
  return TEXT_EXTENSIONS.has(extension) || mimeText;
}

/** 安全化节点名（去 `<>:"/\|?*` 与控制符、压缩空白、去首尾点），空串回退 fallback。 */
export function safeNodeName(name: string, fallback = '未命名'): string {
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

function normalizePath(path: string): string[] {
  return path
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
    .split('/')
    .filter((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

function sortNodes(nodes: FSTreeNode[]): FSTreeNode[] {
  return [...nodes].sort((a, b) => {
    if (a.kind !== b.kind) {
      return a.kind === 'dir' ? -1 : 1;
    }
    return a.name.localeCompare(b.name, 'zh-CN');
  });
}

/** 扁平项 → 层级树（按 '/' 分段建 dir，系统项过滤由调用方做）。 */
export function buildTreeFromPaths(items: FlatFileItem[]): FSTreeNode[] {
  const roots: FSTreeNode[] = [];
  const dirIndex = new Map<FSTreeNode[], Map<string, FSTreeNode>>();

  const indexFor = (level: FSTreeNode[]): Map<string, FSTreeNode> => {
    let index = dirIndex.get(level);
    if (!index) {
      index = new Map();
      for (const node of level) {
        index.set(node.name, node);
      }
      dirIndex.set(level, index);
    }
    return index;
  };

  for (const item of Array.isArray(items) ? items : []) {
    const segments = normalizePath(item.path);
    if (segments.length === 0) {
      continue;
    }
    let level = roots;
    for (let index = 0; index < segments.length - 1; index += 1) {
      const name = segments[index];
      const current = indexFor(level).get(name);
      if (current && current.kind === 'dir') {
        level = current.children;
        continue;
      }
      const dir: FSTreeNode = {
        nodeId: makeNodeId(),
        name,
        kind: 'dir',
        children: [],
        size: 0,
      };
      const map = indexFor(level);
      map.set(name, dir);
      const existing = level.findIndex((node) => node.name === name);
      if (existing >= 0) {
        level[existing] = dir;
      } else {
        level.push(dir);
      }
      level = dir.children;
    }
    const fileName = segments[segments.length - 1];
    const blob = item.blob;
    const file: FSTreeNode = {
      nodeId: makeNodeId(),
      name: fileName,
      kind: 'file',
      children: [],
      data: blob,
      size: blob && typeof blob.size === 'number' ? blob.size : 0,
      mime: item.mime ?? guessMime(fileName),
    };
    const map = indexFor(level);
    map.set(fileName, file);
    const existing = level.findIndex((node) => node.name === fileName);
    if (existing >= 0) {
      level[existing] = file;
    } else {
      level.push(file);
    }
  }

  const sortDeep = (nodes: FSTreeNode[]): FSTreeNode[] => {
    for (const node of nodes) {
      if (node.kind === 'dir') {
        node.children = sortDeep(node.children);
      }
    }
    return sortNodes(nodes);
  };
  return sortDeep(roots);
}

function insertInto(
  tree: FSTreeNode[],
  parentId: string | null,
  node: FSTreeNode,
): FSTreeNode[] {
  if (parentId === null) {
    const withoutSameName = tree.filter((item) => item.name !== node.name);
    return sortNodes([...withoutSameName, node]);
  }
  let changed = false;
  const next = tree.map((current): FSTreeNode => {
    if (current.nodeId === parentId && current.kind === 'dir') {
      changed = true;
      return {
        ...current,
        children: [...current.children.filter((item) => item.name !== node.name), node],
      };
    }
    if (current.kind === 'dir') {
      const children = insertInto(current.children, parentId, node);
      if (children !== current.children) {
        changed = true;
        return { ...current, children };
      }
    }
    return current;
  });
  // 子层排序在递归内部已完成；这里只需保证父层顺序不变。
  return changed ? next : tree;
}

/** 在 parentId（null=树根）下插入 file 节点，返回**新树**（不可变）。 */
export function insertFile(
  tree: FSTreeNode[],
  parentId: string | null,
  node: FSTreeNode,
): FSTreeNode[] {
  return insertInto(tree, parentId, node);
}

/** 在 parentId 下插入空 dir 节点。 */
export function insertFolder(
  tree: FSTreeNode[],
  parentId: string | null,
  node: FSTreeNode,
): FSTreeNode[] {
  return insertInto(tree, parentId, { ...node, kind: 'dir', children: node.children ?? [], size: 0, data: undefined });
}

/** 按 nodeId 改名（只改 name，不动 nodeId/children）。 */
export function renameNode(tree: FSTreeNode[], nodeId: string, name: string): FSTreeNode[] {
  return tree.map((current): FSTreeNode => {
    if (current.nodeId === nodeId) {
      return { ...current, name: safeNodeName(name, current.name) };
    }
    if (current.kind === 'dir') {
      const children = renameNode(current.children, nodeId, name);
      return children === current.children ? current : { ...current, children };
    }
    return current;
  });
}

/** 按 nodeId 删除节点及其子树。 */
export function deleteNode(tree: FSTreeNode[], nodeId: string): FSTreeNode[] {
  const next: FSTreeNode[] = [];
  let changed = false;
  for (const current of tree) {
    if (current.nodeId === nodeId) {
      changed = true;
      continue;
    }
    if (current.kind === 'dir') {
      const children = deleteNode(current.children, nodeId);
      if (children !== current.children) {
        changed = true;
        next.push({ ...current, children });
        continue;
      }
    }
    next.push(current);
  }
  return changed ? next : tree;
}

/** 按 nodeId 查找（深度优先）。 */
export function findNode(tree: FSTreeNode[], nodeId: string): FSTreeNode | null {
  for (const node of tree) {
    if (node.nodeId === nodeId) {
      return node;
    }
    if (node.kind === 'dir') {
      const found = findNode(node.children, nodeId);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

/** 按 nodeId 路径（string[]）定位当前目录的直接子节点；path=[] 返回根层。 */
export function listChildren(tree: FSTreeNode[], path: string[]): FSTreeNode[] {
  let level = tree;
  const ids = Array.isArray(path) ? path : [];
  for (const id of ids) {
    const node = level.find((item) => item.nodeId === id && item.kind === 'dir');
    if (!node) {
      return [];
    }
    level = node.children;
  }
  return level;
}

/** 统计 file 节点数与 size 之和。 */
export function computeStats(tree: FSTreeNode[]): TreeStats {
  let fileCount = 0;
  let totalSize = 0;
  const walk = (nodes: FSTreeNode[]): void => {
    for (const node of nodes) {
      if (node.kind === 'file') {
        fileCount += 1;
        totalSize += typeof node.size === 'number' ? node.size : 0;
      } else {
        walk(node.children);
      }
    }
  };
  walk(tree);
  return { fileCount, totalSize };
}

/** Blob → Uint8Array，优先 arrayBuffer()，jsdom 兜底 FileReader。 */
export async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') {
    return new Uint8Array(await blob.arrayBuffer());
  }
  return new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error('无法读取文件内容'));
    reader.readAsArrayBuffer(blob);
  });
}

/** Blob → 文本，优先 text()，jsdom 兜底 FileReader。 */
export async function readBlobText(blob: Blob): Promise<string> {
  if (typeof blob.text === 'function') {
    return blob.text();
  }
  const bytes = await blobToBytes(blob);
  return new TextDecoder('utf-8').decode(bytes);
}

/**
 * 文本预览：文本取前 maxChars 字符（默认 2000）；
 * 二进制 isText=false、preview=''。只读，不提供编辑入口（Q6）。
 */
export async function textPreview(
  blob: Blob,
  name: string,
  mime?: string,
  maxChars = 2000,
): Promise<TextPreview> {
  if (!isTextFile(name, mime ?? blob?.type)) {
    return { isText: false, preview: '', truncated: false };
  }
  const text = await readBlobText(blob);
  const limit = Number.isFinite(maxChars) && maxChars >= 0 ? maxChars : 2000;
  return {
    isText: true,
    preview: text.slice(0, limit),
    truncated: text.length > limit,
  };
}
