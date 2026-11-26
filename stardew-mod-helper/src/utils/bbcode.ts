/** BBCode 标签 → 纯文本，并解码常见 HTML 实体、折叠空白。 */
export function stripBBCode(bbcode: string): string {
  if (typeof bbcode !== 'string' || bbcode.length === 0) {
    return '';
  }

  let text = bbcode;
  // 链接与图片标签：保留链接文字，丢弃图片占位与 URL 参数
  text = text.replace(/\[url=[^\]]*\]/gi, '');
  text = text.replace(/\[img[^\]]*\]/gi, '');
  text = text.replace(/\[\*\]/gi, ' • ');
  // 其余成对/单独标签统一剥离（保留内部文本）
  text = text.replace(/\[\/?[a-z][^\[\]]*\]/gi, ' ');

  text = text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'");

  return text.replace(/\s+/g, ' ').trim();
}

/**
 * 从文本中的 N 网链接抽取 mod ID，去重保序。
 * 匹配形如 nexusmods.com/stardewvalley/mods/1915 的 URL。
 */
export function extractModIdsFromText(text: string): number[] {
  const result: number[] = [];
  if (typeof text !== 'string' || text.length === 0) {
    return result;
  }

  const seen = new Set<number>();
  // 每次使用新实例，避免 RegExp.lastIndex 造成的状态污染
  const pattern = new RegExp('nexusmods\\.com\\/[^/\\s]+\\/mods\\/(\\d+)', 'gi');
  let match: RegExpExecArray | null = pattern.exec(text);
  while (match !== null) {
    const id = Number(match[1]);
    if (Number.isInteger(id) && id >= 1 && id <= 99999999 && !seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
    match = pattern.exec(text);
  }
  return result;
}
