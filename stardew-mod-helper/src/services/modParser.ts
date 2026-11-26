import { APP_CONFIG, apiPath } from '../config';
import { CHINESE_KEYWORDS, KNOWN_TRANSLATIONS } from '../data/chineseKeywords';
import { PREREQUISITE_DB, type KnownMod } from '../data/prerequisites';
import type {
  DownloadItem,
  DownloadPlan,
  ParsedMod,
  PremiumTier,
  Prerequisite,
} from '../types/domain';
import type { Mod, ModFile } from '../types/nexus';
import { extractModIdsFromText, stripBBCode } from '../utils/bbcode';
import { checkVersionNote } from '../utils/version';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 关键词匹配：ASCII 短词（cn / cp / ftm / gmcm）加词边界，避免误命中。 */
function containsKeyword(haystack: string, keyword: string): boolean {
  const needle = keyword.toLowerCase().trim();
  if (needle.length === 0) {
    return false;
  }
  const isAscii = /^[\x00-\x7f]+$/.test(needle);
  if (isAscii && needle.length <= 4) {
    return new RegExp(`(^|[^a-z0-9])${escapeRegExp(needle)}([^a-z0-9]|$)`).test(haystack);
  }
  return haystack.includes(needle);
}

function containsAnyKeyword(haystack: string, keywords: string[]): boolean {
  return keywords.some((keyword) => containsKeyword(haystack, keyword));
}

function modPageUrl(modId: number): string {
  return `${APP_CONFIG.webBaseUrl}/${APP_CONFIG.gameDomain}/mods/${modId}`;
}

/** 从混排文本提取 mod ID：先抽 URL，再抽裸数字，去重保序，过滤 1..99999999。 */
export function parseModIds(input: string): number[] {
  const text = typeof input === 'string' ? input : '';
  const result: number[] = [];
  const seen = new Set<number>();

  const push = (id: number): void => {
    if (Number.isInteger(id) && id >= 1 && id <= 99999999 && !seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  };

  extractModIdsFromText(text).forEach(push);

  // 去掉 URL 片段，避免把 file_id、页码等数字误当作 mod ID
  const withoutUrls = text
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/www\.nexusmods\.com\/\S+/gi, ' ');
  const numberPattern = /\d+/g;
  let match: RegExpExecArray | null = numberPattern.exec(withoutUrls);
  while (match !== null) {
    push(Number(match[0]));
    match = numberPattern.exec(withoutUrls);
  }
  return result;
}

/** 判断单个文件是否为汉化文件（文件名 + 描述 + 关键词边界 + 内置映射）。 */
export function isChineseFile(file: ModFile, modId?: number): boolean {
  if (!file || typeof file !== 'object') {
    return false;
  }

  const pieces: string[] = [file.file_name ?? '', file.description ?? ''];
  const localized = file.content_localized;
  if (Array.isArray(localized)) {
    pieces.push(localized.join(' '));
  } else if (typeof localized === 'string') {
    pieces.push(localized);
  }
  // v1 的 file_id 键优先；v2 支持 modId 键（如 TranslateAll 36170），双键兼容。
  const knownKeywords =
    KNOWN_TRANSLATIONS[file.file_id] ?? KNOWN_TRANSLATIONS[modId ?? -1] ?? [];
  const text = stripBBCode(pieces.join(' ')).toLowerCase();
  return containsAnyKeyword(text, [...CHINESE_KEYWORDS, ...knownKeywords]);
}

/** 从文件列表中筛出汉化文件；模组整体即为汉化包时，主文件也纳入。 */
export function findChineseFiles(
  files: ModFile[],
  metaDescription = '',
  modId?: number,
): ModFile[] {
  if (!Array.isArray(files)) {
    return [];
  }
  const description = stripBBCode(metaDescription ?? '').toLowerCase();
  const modIsTranslation = containsAnyKeyword(description, CHINESE_KEYWORDS);

  return files.filter((file) => {
    if (isChineseFile(file, modId)) {
      return true;
    }
    if (!modIsTranslation) {
      return false;
    }
    return file.is_primary === true || file.category_name === 'Main Files';
  });
}

/** 选取主文件：优先 is_primary，其次 category_name==='Main Files'，再退回首项。 */
export function pickMainFile(files: ModFile[]): ModFile | null {
  if (!Array.isArray(files) || files.length === 0) {
    return null;
  }
  return (
    files.find((file) => file.is_primary === true) ??
    files.find((file) => file.category_name === 'Main Files') ??
    files[0]
  );
}

/** 前置识别：SMAPI 基线 + 文本关键词/别名/URL ID 关联知识库，按 modId 去重。 */
export function detectPrerequisites(meta: Mod, plainText = ''): Prerequisite[] {
  const result: Prerequisite[] = [];
  const seen = new Set<number>();

  const add = (prerequisite: Prerequisite): void => {
    if (seen.has(prerequisite.modId)) {
      return;
    }
    seen.add(prerequisite.modId);
    result.push(prerequisite);
  };

  const rawText = `${meta?.summary ?? ''} ${plainText ?? ''} ${meta?.description ?? ''}`;
  const text = stripBBCode(rawText).toLowerCase();

  // 1) 基线前置（SMAPI）始终展示
  for (const known of PREREQUISITE_DB) {
    if (!known.isBaseline || known.modId === null) {
      continue;
    }
    add({
      modId: known.modId,
      name: known.name,
      url: modPageUrl(known.modId),
      source: 'knowledge',
      note: known.note,
    });
  }

  // 2) 名称 / 别名命中内置知识库
  for (const known of PREREQUISITE_DB) {
    if (known.isBaseline) {
      continue;
    }
    const aliases: string[] = [known.name, ...known.aliases];
    if (!containsAnyKeyword(text, aliases)) {
      continue;
    }
    add({
      modId: known.modId ?? 0,
      name: known.name,
      url: known.modId === null ? '' : modPageUrl(known.modId),
      source: 'knowledge',
      note: known.note,
    });
  }

  // 3) 描述里的 N 网链接 ID（用户/作者直接给出前置链接）
  // 原始文本 + 纯文本都扫一遍，兼容 [url=...] 标签内藏着的 N 网链接
  for (const id of extractModIdsFromText(`${rawText} ${text}`)) {
    if (seen.has(id)) {
      continue;
    }
    const known: KnownMod | undefined = PREREQUISITE_DB.find((item) => item.modId === id);
    add({
      modId: id,
      name: known?.name ?? `模组 ${id}`,
      url: modPageUrl(id),
      source: 'description',
      note: known?.note,
    });
  }

  return result;
}

/** 聚合为 ParsedMod。 */
export function buildParsedMod(modId: number, meta: Mod, files: ModFile[]): ParsedMod {
  const safeFiles: ModFile[] = Array.isArray(files) ? files : [];
  const summary = stripBBCode(meta.summary ?? '');
  const description = stripBBCode(meta.description ?? '');
  const plainSummary = summary.length > 0 ? summary : description.slice(0, 240);
  const chineseFiles = findChineseFiles(safeFiles, meta.description ?? '', modId);
  const translationText = `${meta.name ?? ''} ${summary} ${description}`.toLowerCase();
  const versionFile = pickMainFile(safeFiles);

  return {
    modId,
    meta,
    files: safeFiles,
    mainFile: pickMainFile(safeFiles),
    chineseFiles,
    prerequisites: detectPrerequisites(meta, plainSummary),
    plainSummary,
    isChineseTranslation: containsAnyKeyword(translationText, CHINESE_KEYWORDS),
    versionNote: checkVersionNote(versionFile?.game_version) ?? undefined,
  };
}

/**
 * 生成下载计划。
 * Premium -> action:'direct'；standard -> 'open' | 'copy'，绝不进入直链分支。
 */
export function buildDownloadPlan(
  mod: ParsedMod,
  fileId: number,
  includeChinese: boolean,
  tier: PremiumTier,
  manualAction: 'open' | 'copy' = 'open',
): DownloadPlan {
  const items: DownloadItem[] = [];
  const selected = mod.files.find((file) => file.file_id === fileId) ?? mod.mainFile;
  if (selected) {
    items.push({ modId: mod.modId, file: selected, kind: 'main' });
  }

  if (includeChinese) {
    for (const chineseFile of mod.chineseFiles) {
      if (items.some((item) => item.file.file_id === chineseFile.file_id)) {
        continue;
      }
      items.push({ modId: mod.modId, file: chineseFile, kind: 'chinese' });
    }
  }

  const filePageUrls: Record<string, string> = {};
  for (const item of items) {
    filePageUrls[`${item.modId}:${item.file.file_id}`] = apiPath.filePage(
      item.modId,
      item.file.file_id,
    );
  }

  if (tier === 'premium') {
    return { tier, action: 'direct', items, filePageUrls };
  }

  return {
    tier,
    action: manualAction,
    items,
    filePageUrls,
    note: 'N 网 Premium 可一键直下',
  };
}
