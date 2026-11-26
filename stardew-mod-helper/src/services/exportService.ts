import { APP_CONFIG } from '../config';
import type { HistoryEntry } from '../types/domain';
import type { CloudModRef, LocalMod } from '../types/workspace';

export type ExportFormat = 'md' | 'json' | 'csv';

/** 导出中间结构：三种格式共用这一份组装数据（Q1）。 */
export interface ExportRow {
  modName: string;
  modId: number;
  fileName: string;
  version: string;
  gameVersion: string;
  chinese: string;
  prerequisites: string;
  downloadedAt: string;
}

/** 列顺序：模组名 / ID / 文件 / 版本 / 游戏版本 / 汉化 / 前置 / 下载时间。 */
const EXPORT_COLUMNS: readonly string[] = [
  '模组名',
  'ID',
  '文件',
  '版本',
  '游戏版本',
  '汉化',
  '前置',
  '下载时间',
];

function rowToCells(row: ExportRow): string[] {
  return [
    row.modName,
    String(row.modId),
    row.fileName,
    row.version,
    row.gameVersion,
    row.chinese,
    row.prerequisites,
    row.downloadedAt,
  ];
}

/** 从 history 组装导出数据（Q3：数据源唯一为 history；Q7：旧记录留空）。 */
export function buildExportData(history: HistoryEntry[]): ExportRow[] {
  return history.map((entry) => ({
    modName: entry.modName ?? '',
    modId: entry.modId,
    fileName: entry.fileName ?? '',
    version: entry.version || '—',
    gameVersion: entry.gameVersion ?? '',
    chinese: (entry.chinese ?? []).join('、'),
    prerequisites: (entry.prerequisites ?? []).join('、'),
    downloadedAt: entry.downloadedAt ?? '',
  }));
}

/** 渲染为 Markdown 表格（含标题、导出时间、条数）。 */
export function renderMarkdown(rows: ExportRow[]): string {
  const escapeCell = (value: string): string =>
    value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
  const lines: string[] = [
    '# 星露谷模组下载清单',
    '',
    `> 导出时间：${new Date().toISOString()} · 共 ${rows.length} 条`,
    '',
    `| ${EXPORT_COLUMNS.join(' | ')} |`,
    `| ${EXPORT_COLUMNS.map(() => '---').join(' | ')} |`,
  ];
  for (const row of rows) {
    lines.push(`| ${rowToCells(row).map(escapeCell).join(' | ')} |`);
  }
  return `${lines.join('\n')}\n`;
}

/** 渲染为稳定结构 JSON（JSON.stringify(rows, null, 2)，不加 BOM / 注释）。 */
export function renderJson(rows: ExportRow[]): string {
  return JSON.stringify(rows, null, 2);
}

/** 渲染为 CSV（UTF-8 BOM 前置，Excel 中文不乱码）。 */
export function renderCsv(rows: ExportRow[]): string {
  const escapeCell = (value: string): string => {
    const text = typeof value === 'string' ? value : '';
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines: string[] = [EXPORT_COLUMNS.map(escapeCell).join(',')];
  for (const row of rows) {
    lines.push(rowToCells(row).map(escapeCell).join(','));
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/** 文件名：stardew-mods-YYYY-MM-DD.{md|json|csv}，日期取 now 的 UTC 日期。 */
export function buildExportFileName(format: ExportFormat, now: Date = new Date()): string {
  const dateValue: Date =
    now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  return `${APP_CONFIG.exportFileNamePrefix}-${dateValue.toISOString().slice(0, 10)}.${format}`;
}

/**
 * 触发导出：组装 → 渲染 → Blob → <a download> → revokeObjectURL。
 * 空历史返回 false（不产生文件）；全程纯前端，不经过任何网络。
 */
export function exportMods(history: HistoryEntry[], format: ExportFormat): boolean {
  if (!Array.isArray(history) || history.length === 0) {
    return false;
  }

  const rows: ExportRow[] = buildExportData(history);
  let content: string;
  let mimeType: string;
  switch (format) {
    case 'json':
      content = renderJson(rows);
      mimeType = 'application/json;charset=utf-8';
      break;
    case 'csv':
      content = renderCsv(rows);
      mimeType = 'text/csv;charset=utf-8';
      break;
    case 'md':
    default:
      content = renderMarkdown(rows);
      mimeType = 'text/markdown;charset=utf-8';
      break;
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = buildExportFileName(format);
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

/* ============================ 【v4 R53】模组库清单导出（历史导出以上函数不动） ============================ */

/** 【新增】库清单行：模组名/文件夹名/作者/版本/Nexus ID/更新状态/文件数/大小/来源/加入时间。 */
export interface LibraryExportRow {
  name: string;
  folderName: string;
  author: string;
  version: string;
  nexusIds: string;
  updateStatus: string;
  fileCount: number;
  totalSize: number;
  source: string;
  addedAt: string;
}

const LIBRARY_COLUMNS: readonly string[] = [
  '模组名',
  '文件夹名',
  '作者',
  '版本',
  'Nexus ID',
  '更新状态',
  '文件数',
  '大小(B)',
  '来源',
  '加入时间',
];

function libraryRowToCells(row: LibraryExportRow): Array<string | number> {
  return [
    row.name,
    row.folderName,
    row.author,
    row.version,
    row.nexusIds,
    row.updateStatus,
    row.fileCount,
    row.totalSize,
    row.source,
    row.addedAt,
  ];
}

/** 本地 + 云端去重合并（按 folderName），标注来源。 */
export function buildLibraryExportData(
  mods: LocalMod[],
  clouds: CloudModRef[],
): LibraryExportRow[] {
  const rows: LibraryExportRow[] = [];
  const seen = new Set<string>();
  for (const mod of Array.isArray(mods) ? mods : []) {
    const folderName = mod.cloudFolderName || mod.rootFolder || mod.name;
    seen.add(folderName);
    rows.push({
      name: mod.name,
      folderName,
      author: mod.author || '',
      version: mod.version || '',
      nexusIds: (Array.isArray(mod.nexusModIds) ? mod.nexusModIds : []).join(','),
      updateStatus: mod.updateStatus,
      fileCount: mod.fileCount,
      totalSize: mod.totalSize,
      source: mod.source,
      addedAt: mod.addedAt,
    });
  }
  for (const ref of Array.isArray(clouds) ? clouds : []) {
    if (seen.has(ref.folderName)) {
      continue;
    }
    seen.add(ref.folderName);
    rows.push({
      name: ref.folderName,
      folderName: ref.folderName,
      author: '',
      version: '',
      nexusIds: '',
      updateStatus: ref.syncStatus,
      fileCount: ref.fileCount,
      totalSize: ref.totalSize,
      source: 'cloud',
      addedAt: ref.lastSyncedAt,
    });
  }
  return rows;
}

/** 渲染为 Markdown 表格（标题 / 导出时间 / 条数；转义 '|' 与换行）。 */
export function renderLibraryMd(rows: LibraryExportRow[]): string {
  const escapeCell = (value: string | number): string =>
    String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
  const lines: string[] = [
    '# 星露谷模组库清单',
    '',
    `> 导出时间：${new Date().toISOString()} · 共 ${rows.length} 条`,
    '',
    `| ${LIBRARY_COLUMNS.join(' | ')} |`,
    `| ${LIBRARY_COLUMNS.map(() => '---').join(' | ')} |`,
  ];
  for (const row of rows) {
    lines.push(`| ${libraryRowToCells(row).map(escapeCell).join(' | ')} |`);
  }
  return `${lines.join('\n')}\n`;
}

/** 渲染为稳定结构 JSON（不加 BOM / 注释）。 */
export function renderLibraryJson(rows: LibraryExportRow[]): string {
  return JSON.stringify(rows, null, 2);
}

/** 渲染为 CSV（UTF-8 BOM 前置，Excel 中文不乱码）。 */
export function renderLibraryCsv(rows: LibraryExportRow[]): string {
  const escapeCell = (value: string | number): string => {
    const text = String(value ?? '');
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines: string[] = [LIBRARY_COLUMNS.map(escapeCell).join(',')];
  for (const row of rows) {
    lines.push(libraryRowToCells(row).map(escapeCell).join(','));
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/** 文件名：stardew-mod-library-YYYY-MM-DD.{md|json|csv}。 */
export function buildLibraryExportFileName(format: ExportFormat, now: Date = new Date()): string {
  const dateValue: Date =
    now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  return `${APP_CONFIG.libraryExportFileNamePrefix}-${dateValue.toISOString().slice(0, 10)}.${format}`;
}

/** 触发库清单导出；本地 + 云端皆空时返回 false，不产生文件。 */
export function exportLibrary(
  mods: LocalMod[],
  clouds: CloudModRef[],
  format: ExportFormat,
): boolean {
  const rows = buildLibraryExportData(mods, clouds);
  if (rows.length === 0) {
    return false;
  }
  let content: string;
  let mimeType: string;
  switch (format) {
    case 'json':
      content = renderLibraryJson(rows);
      mimeType = 'application/json;charset=utf-8';
      break;
    case 'csv':
      content = renderLibraryCsv(rows);
      mimeType = 'text/csv;charset=utf-8';
      break;
    case 'md':
    default:
      content = renderLibraryMd(rows);
      mimeType = 'text/markdown;charset=utf-8';
      break;
  }
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = buildLibraryExportFileName(format);
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
