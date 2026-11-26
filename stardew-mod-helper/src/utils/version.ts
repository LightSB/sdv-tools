import { APP_CONFIG } from '../config';

/**
 * 归一化 game_version（string[] | string | null | undefined）为可读字符串。
 * 数组用顿号连接，空值统一返回空串。
 */
export function normalizeGameVersion(
  value: string[] | string | null | undefined,
): string {
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === 'string' && item.length > 0).join('、');
  }
  if (typeof value === 'string') {
    return value;
  }
  return '';
}

/**
 * 提取主版本 x.y，如 ["1.6.8"] → "1.6"、"1.7" → "1.7"；无法解析返回 null。
 */
export function extractMajorVersion(
  value: string[] | string | null | undefined,
): string | null {
  const raw: string | null | undefined = Array.isArray(value) ? value[0] : value;
  const match: RegExpMatchArray | null =
    typeof raw === 'string' ? raw.match(/\d+\.\d+/) : null;
  return match ? match[0] : null;
}

/**
 * 版本兼容提醒：与基线主版本不一致返回温和文案（可能失效 / 建议核对），
 * 一致或无信息返回 null。绝不返回阻断性措辞，不参与下载计划分支。
 */
export function checkVersionNote(
  gameVersion: string[] | string | null | undefined,
  baseline: string = APP_CONFIG.gameVersionBaseline,
): string | null {
  const major: string | null = extractMajorVersion(gameVersion);
  const baselineMajor: string | null = extractMajorVersion(baseline);
  if (major === null || baselineMajor === null) {
    return null;
  }
  if (major === baselineMajor) {
    return null;
  }
  return `此模组标注游戏版本 ${major}，与当前推荐版本 ${baselineMajor} 不一致，可能存在失效风险，建议核对后再下载。`;
}
