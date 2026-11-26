/**
 * 【v4 R49/Q2/Q3/Q5】GitHub Contents API 直连服务。
 * 隐私铁律：token 只在 localStorage + 调用期内存；本文件所有函数均为 action 显式调用的纯服务，无任何自动触发。
 */
import { APP_CONFIG } from '../config';
import type {
  CloudModRef,
  FlatFileItem,
  GitHubConfig,
  GitHubSettings,
  LocalMod,
} from '../types/workspace';
import { blobToBytes, guessMime } from '../utils/fsTree';
import { resolveModFolderName } from './zipService';

const TOKEN_MESSAGE =
  'Token 失效或权限不足：请在 GitHub → Settings → Developer settings → Fine-grained tokens 重新生成（仅授权该私有仓库、Contents: Read and write），再回到工具重新配置。已同步的数据不会被清除。';
const NOT_FOUND_MESSAGE = '仓库或路径不存在，请检查 owner/repo/分支/根路径';
const RATE_LIMIT_MESSAGE = 'GitHub 请求过于频繁，请稍后重试';
const NETWORK_MESSAGE = '网络异常，请检查连接';

/** 带状态码的内部错误；对外统一转成中文文案，绝不拼入 token。 */
class GithubRequestError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'GithubRequestError';
    this.status = status;
    Object.setPrototypeOf(this, GithubRequestError.prototype);
  }
}

interface ContentsItem {
  name: string;
  path: string;
  type: 'file' | 'dir' | 'symlink' | 'submodule';
  sha: string;
  size?: number;
  content?: string;
  encoding?: string;
}

interface PutResult {
  content?: { sha?: string } | null;
}

/* ---- token 边界：仅 localStorage + 调用期内存 ---- */

/** 读取本机 token；无则空串。 */
export function readToken(): string {
  if (typeof localStorage === 'undefined') {
    return '';
  }
  try {
    return localStorage.getItem(APP_CONFIG.github.tokenStorageKey) ?? '';
  } catch {
    return '';
  }
}

/** 仅写 localStorage；不进 state / IDB / 日志。 */
export function writeToken(token: string): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(APP_CONFIG.github.tokenStorageKey, typeof token === 'string' ? token : '');
  } catch {
    // 隐私模式下 localStorage 不可写：静默失败，由 testConnection 明确提示
  }
}

/** 仅删 localStorage 项；不清任何已同步数据。 */
export function clearToken(): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  try {
    localStorage.removeItem(APP_CONFIG.github.tokenStorageKey);
  } catch {
    // 忽略
  }
}

/** 配置：写 token 到 localStorage，返回可存 state/IDB 的**无 token** 设置。 */
export function configure(input: GitHubSettings & { token: string }): GitHubSettings {
  writeToken(input.token ?? '');
  return {
    owner: input.owner,
    repo: input.repo,
    branch: input.branch,
    basePath: input.basePath,
    status: input.status,
    connectedAt: input.connectedAt,
    error: input.error,
  };
}

/* ---- 内部工具 ---- */

function normalizeBasePath(basePath: string): string {
  const trimmed = typeof basePath === 'string' ? basePath.trim().replace(/^\/+|\/+$/g, '') : '';
  return trimmed.length > 0 ? `${trimmed}/` : '';
}

/** remotePath 无首尾 '/'，形如 `mods/Crop` 或 `Crop`。 */
function remotePathFor(cfg: GitHubConfig, folderName: string): string {
  return `${normalizeBasePath(cfg.basePath)}${folderName}`;
}

function contentsPath(cfg: GitHubConfig, remotePath: string, suffix = ''): string {
  const owner = encodeURIComponent(cfg.owner.trim());
  const repo = encodeURIComponent(cfg.repo.trim());
  const full = [remotePath.replace(/^\/+|\/+$/g, ''), suffix.replace(/^\/+/, '')]
    .filter((part) => part.length > 0)
    .join('/');
  return `/repos/${owner}/${repo}/contents/${full}`;
}

function commitsPath(cfg: GitHubConfig, remotePath: string): string {
  const owner = encodeURIComponent(cfg.owner.trim());
  const repo = encodeURIComponent(cfg.repo.trim());
  return `/repos/${owner}/${repo}/commits?path=${encodeURIComponent(remotePath)}&per_page=1`;
}

function messageForStatus(status: number): string {
  if (status === 401 || status === 403) {
    return TOKEN_MESSAGE;
  }
  if (status === 404) {
    return NOT_FOUND_MESSAGE;
  }
  if (status === 429) {
    return RATE_LIMIT_MESSAGE;
  }
  return `GitHub 请求失败（HTTP ${status}）`;
}

/** 统一请求：拼 base、带 Bearer、错误归一化；token 绝不出现在 URL 或错误文案中。 */
async function requestGithub<T>(
  cfg: GitHubConfig,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = `${APP_CONFIG.github.apiBase}${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      method: init?.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': APP_CONFIG.github.apiVersion,
        'User-Agent': 'sdmh',
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new GithubRequestError(0, NETWORK_MESSAGE);
  }
  if (!response.ok) {
    throw new GithubRequestError(response.status, messageForStatus(response.status));
  }
  if (response.status === 204) {
    return undefined as T;
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new GithubRequestError(0, 'GitHub 返回了无法解析的内容');
  }
}

/** Uint8Array 分块 btoa，避免 String.fromCharCode(...bigArray) 爆栈。 */
async function encodeBase64(blob: Blob): Promise<string> {
  const bytes = await blobToBytes(blob);
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}

/** base64 → Blob。 */
function decodeBase64(content: string, mime: string): Blob {
  const binary = atob(content.replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mime });
}

interface FlatFile {
  path: string;
  blob: Blob;
}

/** 本地树 → 扁平文件（带相对路径）；同时按目录统计文件数触发 1000 文件预警。 */
function collectLocalFiles(
  tree: LocalMod['fileTree'],
  onWarn?: (msg: string) => void,
  prefix = '',
  output: FlatFile[] = [],
  dirCounts: Record<string, number> = {},
  warnedDirs: Set<string> = new Set(),
): FlatFile[] {
  for (const node of tree) {
    const relative = prefix.length > 0 ? `${prefix}/${node.name}` : node.name;
    if (node.kind === 'dir') {
      collectLocalFiles(node.children, onWarn, relative, output, dirCounts, warnedDirs);
      continue;
    }
    if (!node.data) {
      continue;
    }
    const directory = relative.includes('/') ? relative.slice(0, relative.lastIndexOf('/')) : '(root)';
    dirCounts[directory] = (dirCounts[directory] ?? 0) + 1;
    if (dirCounts[directory] > APP_CONFIG.github.maxFilesPerDir) {
      if (!warnedDirs.has(directory)) {
        warnedDirs.add(directory);
        onWarn?.(`目录 ${directory} 超过 1000 个文件，GitHub Contents API 将拒绝，已跳过余下文件`);
      }
      continue;
    }
    if (node.data.size > APP_CONFIG.github.maxFileBytes) {
      onWarn?.(`文件 ${relative} 超过 100MB，GitHub Contents API 将拒绝，已跳过`);
      continue;
    }
    output.push({ path: relative, blob: node.data });
  }
  return output;
}

/** 空目录收集：写入 .gitkeep 保持仓库结构。 */
function collectEmptyDirs(
  tree: LocalMod['fileTree'],
  prefix = '',
  output: string[] = [],
): string[] {
  for (const node of tree) {
    if (node.kind !== 'dir') {
      continue;
    }
    const relative = prefix.length > 0 ? `${prefix}/${node.name}` : node.name;
    let hasFile = false;
    const walk = (nodes: LocalMod['fileTree']): void => {
      for (const child of nodes) {
        if (child.kind === 'file' && child.data) {
          hasFile = true;
        } else if (child.kind === 'dir') {
          walk(child.children);
        }
      }
    };
    walk(node.children);
    if (!hasFile) {
      output.push(relative);
    } else {
      collectEmptyDirs(node.children, relative, output);
    }
  }
  return output;
}

/** 递归读取远端目录，返回相对路径 → sha。404 视为空目录。 */
async function collectRemoteShas(
  cfg: GitHubConfig,
  remotePath: string,
  output: Record<string, string> = {},
  prefix = '',
  depth = 0,
): Promise<Record<string, string>> {
  if (depth > 30) {
    return output;
  }
  let items: ContentsItem[];
  try {
    items = await requestGithub<ContentsItem[]>(cfg, contentsPath(cfg, remotePath));
  } catch (error) {
    if (error instanceof GithubRequestError && error.status === 404) {
      return output;
    }
    throw error;
  }
  if (!Array.isArray(items)) {
    return output;
  }
  // 列举只读：超出 1000 的目录项本次不纳入 sha 映射，上传时按新建处理。
  for (const item of items.slice(0, APP_CONFIG.github.maxFilesPerDir)) {
    const relative = prefix.length > 0 ? `${prefix}/${item.name}` : item.name;
    if (item.type === 'dir') {
      await collectRemoteShas(cfg, `${remotePath}/${item.name}`, output, relative, depth + 1);
    } else if (item.type === 'file') {
      output[relative] = item.sha;
    }
  }
  return output;
}

function makeRef(
  cfg: GitHubConfig,
  folderName: string,
  shaMap: Record<string, string>,
  fileCount: number,
  totalSize: number,
  localModId: string | null,
): CloudModRef {
  const now = new Date().toISOString();
  return {
    folderName,
    remotePath: remotePathFor(cfg, folderName),
    localModId,
    lastSyncedAt: now,
    syncStatus: 'synced',
    fileShaMap: shaMap,
    fileCount,
    totalSize,
    remoteModifiedAt: now,
  };
}

/** 只读校验：GET /repos/{owner}/{repo}。401/403/404/429 给明确文案，不清数据。 */
export async function testConnection(
  cfg: GitHubConfig,
): Promise<{ ok: boolean; message: string }> {
  try {
    await requestGithub<Record<string, unknown>>(
      cfg,
      `/repos/${encodeURIComponent(cfg.owner.trim())}/${encodeURIComponent(cfg.repo.trim())}`,
    );
    return { ok: true, message: '已连接' };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : NETWORK_MESSAGE,
    };
  }
}

/** 列举：GET contents/{basePath}?ref={branch}，顶层目录映射为 CloudModRef[]；404 → []。 */
export async function listCloudMods(cfg: GitHubConfig): Promise<CloudModRef[]> {
  let items: ContentsItem[];
  try {
    items = await requestGithub<ContentsItem[]>(
      cfg,
      `${contentsPath(cfg, normalizeBasePath(cfg.basePath).replace(/\/$/, ''))}?ref=${encodeURIComponent(cfg.branch)}`,
    );
  } catch (error) {
    if (error instanceof GithubRequestError && error.status === 404) {
      return [];
    }
    throw error;
  }
  if (!Array.isArray(items)) {
    return [];
  }
  return items
    .filter((item) => item.type === 'dir')
    .map((item) => ({
      folderName: item.name,
      remotePath: remotePathFor(cfg, item.name),
      localModId: null,
      lastSyncedAt: '',
      syncStatus: 'synced' as const,
      fileShaMap: {},
      fileCount: 0,
      totalSize: 0,
      remoteModifiedAt: '',
    }));
}

/** 全量上传：逐文件 PUT，空目录写 .gitkeep；返回含 shaMap 的 ref。 */
export async function uploadMod(
  cfg: GitHubConfig,
  mod: LocalMod,
  onWarn?: (msg: string) => void,
): Promise<CloudModRef> {
  const folderName = resolveModFolderName(mod);
  const remotePath = remotePathFor(cfg, folderName);
  const remoteShas = await collectRemoteShas(cfg, remotePath);
  const files = collectLocalFiles(mod.fileTree, onWarn);
  const shaMap: Record<string, string> = {};
  let totalSize = 0;

  for (const file of files) {
    const body: Record<string, string> = {
      message: `chore: upload ${folderName}/${file.path}`,
      content: await encodeBase64(file.blob),
      branch: cfg.branch,
    };
    const existing = remoteShas[file.path];
    if (existing) {
      body.sha = existing;
    }
    const result = await requestGithub<PutResult>(
      cfg,
      contentsPath(cfg, remotePath, file.path),
      { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    );
    shaMap[file.path] = result?.content?.sha ?? existing ?? '';
    totalSize += file.blob.size;
  }

  for (const directory of collectEmptyDirs(mod.fileTree)) {
    const keepPath = `${directory}/.gitkeep`;
    const body: Record<string, string> = {
      message: `chore: keep ${folderName}/${keepPath}`,
      content: '',
      branch: cfg.branch,
    };
    const existing = remoteShas[keepPath];
    if (existing) {
      body.sha = existing;
    }
    const result = await requestGithub<PutResult>(
      cfg,
      contentsPath(cfg, remotePath, keepPath),
      { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    );
    shaMap[keepPath] = result?.content?.sha ?? existing ?? '';
  }

  return makeRef(cfg, folderName, shaMap, files.length, totalSize, mod.id);
}

/** 增量更新：按 fileShaMap 跳过未变文件，仅 PUT 变更文件；远端多余文件 DELETE。 */
export async function updateMod(
  cfg: GitHubConfig,
  mod: LocalMod,
  ref: CloudModRef,
  onWarn?: (msg: string) => void,
): Promise<CloudModRef> {
  const folderName = ref.folderName || resolveModFolderName(mod);
  const remotePath = remotePathFor(cfg, folderName);
  const remoteShas = await collectRemoteShas(cfg, remotePath);
  const files = collectLocalFiles(mod.fileTree, onWarn);
  const localPaths = new Set(files.map((file) => file.path));
  const shaMap: Record<string, string> = { ...remoteShas };
  let totalSize = 0;

  for (const file of files) {
    totalSize += file.blob.size;
    const currentSha = remoteShas[file.path];
    const recordedSha = mod.fileShaMap[file.path];
    if (currentSha && recordedSha && currentSha === recordedSha) {
      shaMap[file.path] = currentSha;
      continue;
    }
    const body: Record<string, string> = {
      message: `chore: update ${folderName}/${file.path}`,
      content: await encodeBase64(file.blob),
      branch: cfg.branch,
    };
    if (currentSha) {
      body.sha = currentSha;
    }
    const result = await requestGithub<PutResult>(
      cfg,
      contentsPath(cfg, remotePath, file.path),
      { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    );
    shaMap[file.path] = result?.content?.sha ?? currentSha ?? '';
  }

  for (const [relative, sha] of Object.entries(remoteShas)) {
    if (localPaths.has(relative)) {
      continue;
    }
    await requestGithub(cfg, contentsPath(cfg, remotePath, relative), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `chore: delete ${folderName}/${relative}`,
        sha,
        branch: cfg.branch,
      }),
    });
    delete shaMap[relative];
  }

  return makeRef(cfg, folderName, shaMap, files.length, totalSize, ref.localModId ?? mod.id);
}

/** 删除：逐文件 DELETE（需 sha）；调用方在删除确认后调用，不清本地库。 */
export async function deleteMod(cfg: GitHubConfig, folderName: string): Promise<void> {
  const remotePath = remotePathFor(cfg, folderName);
  const shaMap = await collectRemoteShas(cfg, remotePath);
  for (const [relative, sha] of Object.entries(shaMap)) {
    await requestGithub(cfg, contentsPath(cfg, remotePath, relative), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `chore: delete ${folderName}/${relative}`,
        sha,
        branch: cfg.branch,
      }),
    });
  }
}

/** 下载回本地：递归读取目录 → FlatFileItem[]（blob），供 buildTreeFromPaths 建树。 */
export async function downloadMod(
  cfg: GitHubConfig,
  ref: CloudModRef,
): Promise<{
  folderName: string;
  files: FlatFileItem[];
  shaMap: Record<string, string>;
  remoteModifiedAt: string;
}> {
  const files: FlatFileItem[] = [];
  const shaMap: Record<string, string> = {};

  const walk = async (remotePath: string, prefix: string, depth: number): Promise<void> => {
    if (depth > 30) {
      return;
    }
    let items: ContentsItem[];
    try {
      items = await requestGithub<ContentsItem[]>(
        cfg,
        `${contentsPath(cfg, remotePath)}?ref=${encodeURIComponent(cfg.branch)}`,
      );
    } catch (error) {
      if (error instanceof GithubRequestError && error.status === 404) {
        return;
      }
      throw error;
    }
    if (!Array.isArray(items)) {
      return;
    }
    for (const item of items.slice(0, APP_CONFIG.github.maxFilesPerDir)) {
      const relative = prefix.length > 0 ? `${prefix}/${item.name}` : item.name;
      if (item.type === 'dir') {
        await walk(`${remotePath}/${item.name}`, relative, depth + 1);
        continue;
      }
      if (item.type !== 'file') {
        continue;
      }
      const detail = await requestGithub<ContentsItem>(
        cfg,
        `${contentsPath(cfg, remotePath, item.name)}?ref=${encodeURIComponent(cfg.branch)}`,
      );
      const content = detail.content ?? item.content ?? '';
      const mime = guessMime(item.name);
      files.push({ path: relative, blob: decodeBase64(content, mime), mime });
      shaMap[relative] = detail.sha ?? item.sha;
    }
  };

  await walk(ref.remotePath, '', 0);

  let remoteModifiedAt = '';
  try {
    const commits = await requestGithub<Array<{ commit?: { committer?: { date?: string } } }>>(
      cfg,
      commitsPath(cfg, ref.remotePath),
    );
    remoteModifiedAt = commits?.[0]?.commit?.committer?.date ?? '';
  } catch {
    remoteModifiedAt = '';
  }

  return { folderName: ref.folderName, files, shaMap, remoteModifiedAt };
}
