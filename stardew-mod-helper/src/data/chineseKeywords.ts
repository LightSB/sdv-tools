/**
 * 汉化识别关键词表。
 * 英文短词（如 cn）由 modParser 做边界判定，避免命中无关单词。
 */
export const CHINESE_KEYWORDS: string[] = [
  'chinese',
  '中文',
  '汉化',
  '漢化',
  '简体',
  '簡體',
  '繁体',
  '繁體',
  'zh-cn',
  'zh_cn',
  'zh-tw',
  'zh_tw',
  'translation',
  'localization',
  'cn',
  // v2 扩充：常见汉化标记词（短词仍由 modParser 边界判定）
  '简中',
  '汉化补丁',
  '漢化補丁',
  '翻译',
  '翻譯',
  'chinese simplified',
  'localized',
];

/**
 * 已知汉化模组映射：modId -> 该模组汉化文件常见的文件名关键词。
 * 仅录入可信 modId；modParser.isChineseFile 以 file_id 优先、modId 兜底双键查表。
 * 不确定 ID 的汉化包请使用名称型关键词，写入 CHINESE_KEYWORDS，禁止编造 ID。
 */
export const KNOWN_TRANSLATIONS: Record<number, string[]> = {
  36170: ['translateall', 'translate all', 'translateall 汉化'],
};
