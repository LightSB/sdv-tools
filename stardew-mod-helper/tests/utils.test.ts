import { describe, expect, it } from 'vitest';
import { extractModIdsFromText, stripBBCode } from '../src/utils/bbcode';
import { formatError, NexusApiError } from '../src/utils/errors';
import { formatAuthors, formatDate, formatFileSize } from '../src/utils/format';

// ---------------------------------------------------------------- E1: stripBBCode
describe('E1. stripBBCode', () => {
  it('移除各种 BBCode 标签、解码实体、折叠空白并保留链接文字', () => {
    const input =
      '[b]Hello[/b] [i]World[/i] [url=https://x.com]Link[/url] &nbsp; A&amp;B [code]x[/code]\n\n   Done';
    const out = stripBBCode(input);
    expect(out).toContain('Hello');
    expect(out).toContain('World');
    expect(out).toContain('Link');
    expect(out).toContain('A&B');
    expect(out).toContain('Done');
    expect(out).not.toContain('[b]');
    expect(out).not.toContain('[/url]');
    expect(out).not.toContain('[code]');
    expect(out).not.toContain('&nbsp;');
    expect(out).not.toContain('&amp;');
    expect(out).not.toMatch(/\s{2,}/);
  });

  it('列表项标记转换为项目符号，空输入返回空串', () => {
    expect(stripBBCode('[list][*]one[*]two[/list]')).toContain('•');
    expect(stripBBCode('')).toBe('');
  });
});

// ---------------------------------------------------------------- E2: extractModIdsFromText
describe('E2. extractModIdsFromText', () => {
  it('从文本中的 N 网链接抽 ID，去重保序', () => {
    const text =
      '见 https://www.nexusmods.com/stardewvalley/mods/1915 与 ' +
      'http://www.nexusmods.com/stardewvalley/mods/2400?tab=files，' +
      '再附 https://www.nexusmods.com/stardewvalley/mods/1915';
    expect(extractModIdsFromText(text)).toEqual([1915, 2400]);
  });

  it('无链接时返回空数组', () => {
    expect(extractModIdsFromText('plain text 123 没有链接')).toEqual([]);
  });
});

// ---------------------------------------------------------------- E3: formatError
describe('E3. formatError', () => {
  const API_KEY = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';

  it('401 -> Key 无效文案', () => {
    expect(formatError(new NexusApiError('bad', 401, '/users/validate.json'))).toContain(
      'Key 无效',
    );
  });

  it('403 -> 无权限文案', () => {
    expect(formatError(new NexusApiError('forbidden', 403, '/x'))).toContain('权限');
  });

  it('429 -> 请求频繁文案', () => {
    expect(formatError(new NexusApiError('slow down', 429, '/x'))).toContain('频繁');
  });

  it('网络错误 -> 中文文案', () => {
    expect(formatError(new Error('Failed to fetch'))).toContain('网络');
  });

  it('绝不泄露 apiKey（普通 Error message 含 key）', () => {
    const out = formatError(new Error(`request failed apikey: ${API_KEY} at /users/validate.json`));
    expect(out).not.toContain(API_KEY);
  });

  it('绝不泄露 apiKey（NexusApiError status=0 的 message 含 key）', () => {
    const out = formatError(new NexusApiError(`boom apikey: ${API_KEY}`, 0, '/x'));
    expect(out).not.toContain(API_KEY);
  });
});

// ---------------------------------------------------------------- 附加：format 工具
describe('附加：format 工具', () => {
  it('formatFileSize 处理 KB/MB/非法值', () => {
    expect(formatFileSize(512)).toContain('KB');
    expect(formatFileSize(2048)).toContain('MB');
    expect(formatFileSize(-1)).toBe('—');
  });

  it('formatDate 非法值返回占位符', () => {
    expect(formatDate('not-a-date')).toBe('—');
  });

  it('formatAuthors 超过 2 位折叠为「等」', () => {
    const authors = [
      { user_id: 1, name: 'A' },
      { user_id: 2, name: 'B' },
      { user_id: 3, name: 'C' },
    ];
    expect(formatAuthors(authors)).toContain('等 3 人');
    expect(formatAuthors([])).toBe('未知作者');
  });
});
