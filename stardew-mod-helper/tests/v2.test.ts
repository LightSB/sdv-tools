// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_CONFIG } from '../src/config';
import { CHINESE_KEYWORDS, KNOWN_TRANSLATIONS } from '../src/data/chineseKeywords';
import { PREREQUISITE_DB } from '../src/data/prerequisites';
import { executeDownloadPlan } from '../src/services/downloadService';
import {
  buildDownloadPlan,
  buildParsedMod,
  findChineseFiles,
  isChineseFile,
  parseModIds,
} from '../src/services/modParser';
import {
  buildExportData,
  buildExportFileName,
  exportMods,
  renderCsv,
  renderJson,
  renderMarkdown,
  type ExportRow,
} from '../src/services/exportService';
import type { HistoryEntry } from '../src/types/domain';
import type { ModFile } from '../src/types/nexus';
import { copyText, openFilePage, triggerBrowserDownload } from '../src/utils/download';
import { buildModOptions, filterHistory, matchHistoryEntry } from '../src/utils/history';
import { checkVersionNote, extractMajorVersion, normalizeGameVersion } from '../src/utils/version';
import { makeFile, makeMeta, makeParsedMod } from './fixtures';

// 副作用工具统一 mock，使 executeDownloadPlan 的断言聚焦于策略本身（沿用 v1 downloadService.test.ts 风格）
vi.mock('../src/utils/download', () => ({
  copyText: vi.fn(async () => true),
  openFilePage: vi.fn(),
  triggerBrowserDownload: vi.fn(),
}));

/** 构造历史条目；默认不带 v2 新字段，用于验证 Q7「旧记录留空」兜底。 */
function makeEntry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: 'e1',
    modId: 1915,
    modName: 'Content Patcher',
    fileId: 100,
    fileName: 'CP_2.0.zip',
    version: '2.0.0',
    tier: 'standard',
    action: 'open',
    downloadedAt: '2026-06-01T10:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// ================================================================ A. version.ts
describe('A. version.ts —— 版本提醒纯函数', () => {
  describe('A1. normalizeGameVersion', () => {
    it("单元素数组 ['1.6.8'] → '1.6.8'", () => {
      expect(normalizeGameVersion(['1.6.8'])).toBe('1.6.8');
    });

    it('多元素数组用顿号连接', () => {
      expect(normalizeGameVersion(['1.6.8', '1.6.9'])).toBe('1.6.8、1.6.9');
    });

    it('数组中空串/非字符串项被过滤', () => {
      expect(normalizeGameVersion(['1.6.8', '', '1.7'])).toBe('1.6.8、1.7');
    });

    it('字符串原样返回', () => {
      expect(normalizeGameVersion('1.6')).toBe('1.6');
      expect(normalizeGameVersion('')).toBe('');
    });

    it('null / undefined → 空串', () => {
      expect(normalizeGameVersion(null)).toBe('');
      expect(normalizeGameVersion(undefined)).toBe('');
    });
  });

  describe('A2. extractMajorVersion', () => {
    it("['1.6.8'] → '1.6'", () => {
      expect(extractMajorVersion(['1.6.8'])).toBe('1.6');
    });

    it("'1.7' → '1.7'；'1.6.8' → '1.6'", () => {
      expect(extractMajorVersion('1.7')).toBe('1.7');
      expect(extractMajorVersion('1.6.8')).toBe('1.6');
    });

    it('多元素数组取首项', () => {
      expect(extractMajorVersion(['1.5.4', '1.6.8'])).toBe('1.5');
    });

    it('无法解析 → null', () => {
      expect(extractMajorVersion('abc')).toBeNull();
      expect(extractMajorVersion(null)).toBeNull();
      expect(extractMajorVersion(undefined)).toBeNull();
      expect(extractMajorVersion([])).toBeNull();
    });
  });

  describe('A3. checkVersionNote（温和提示，不阻断）', () => {
    it('1.5 与基线 1.6 不一致 → 含版本号的温和文案', () => {
      const note = checkVersionNote(['1.5.0'], '1.6');
      expect(note).not.toBeNull();
      expect(note).toContain('1.5');
      expect(note).toContain('1.6');
      // DESIGN §3.3 文案为「可能存在失效风险，建议核对后再下载」
      expect(note).toContain('失效');
      expect(note).toContain('建议核对');
    });

    it('1.6 与基线一致 → null', () => {
      expect(checkVersionNote(['1.6.8'], '1.6')).toBeNull();
      expect(checkVersionNote('1.6', '1.6')).toBeNull();
    });

    it('无版本信息 → null', () => {
      expect(checkVersionNote(null)).toBeNull();
      expect(checkVersionNote(undefined)).toBeNull();
      expect(checkVersionNote('')).toBeNull();
      expect(checkVersionNote('unknown')).toBeNull();
    });

    it('默认基线取自 APP_CONFIG.gameVersionBaseline', () => {
      expect(APP_CONFIG.gameVersionBaseline).toBe('1.6');
      expect(checkVersionNote('1.7')).not.toBeNull();
      expect(checkVersionNote('1.6')).toBeNull();
    });

    it('绝不出现「禁止/错误/不兼容/阻断/不可下载/无法下载」等阻断词', () => {
      const note = checkVersionNote('1.5', '1.6') ?? '';
      const blockingWords = ['禁止', '错误', '不兼容', '阻断', '不可下载', '无法下载'];
      for (const word of blockingWords) {
        expect(note).not.toContain(word);
      }
    });
  });
});

// ================================================================ B. history.ts
describe('B. history.ts —— 历史搜索与筛选纯函数', () => {
  const entries: HistoryEntry[] = [
    makeEntry({ id: 'a', modId: 1915, modName: 'Content Patcher', fileName: 'CP_2.0.zip' }),
    makeEntry({ id: 'b', modId: 2400, modName: 'SMAPI', fileName: 'SMAPI_4.0.zip' }),
    makeEntry({ id: 'c', modId: 1915, modName: 'Content Patcher', fileName: 'CP_中文.zip' }),
  ];

  describe('B1. matchHistoryEntry', () => {
    it('空搜索（含空白）恒为 true', () => {
      expect(matchHistoryEntry(entries[0], '')).toBe(true);
      expect(matchHistoryEntry(entries[0], '   ')).toBe(true);
    });

    it('按 modName 大小写不敏感模糊匹配', () => {
      expect(matchHistoryEntry(entries[0], 'content')).toBe(true);
      expect(matchHistoryEntry(entries[0], 'PATCHER')).toBe(true);
    });

    it('按 fileName 大小写不敏感模糊匹配', () => {
      expect(matchHistoryEntry(entries[0], 'cp_2.0')).toBe(true);
      expect(matchHistoryEntry(entries[1], 'smapi_4')).toBe(true);
    });

    it('按 modId 模糊匹配', () => {
      expect(matchHistoryEntry(entries[0], '1915')).toBe(true);
      expect(matchHistoryEntry(entries[1], '240')).toBe(true);
    });

    it('不匹配 → false', () => {
      expect(matchHistoryEntry(entries[0], 'nonexistent')).toBe(false);
      expect(matchHistoryEntry(entries[0], '9999')).toBe(false);
    });
  });

  describe('B2. filterHistory', () => {
    it('modId = all 时只按搜索过滤', () => {
      const result = filterHistory(entries, { search: 'cp', modId: 'all' });
      expect(result.map((e) => e.id)).toEqual(['a', 'c']);
    });

    it('搜索 ∧ 模组筛选叠加', () => {
      const result = filterHistory(entries, { search: '中文', modId: 1915 });
      expect(result.map((e) => e.id)).toEqual(['c']);
      expect(filterHistory(entries, { search: '中文', modId: 2400 })).toEqual([]);
    });

    it('模组筛选单独生效且保持原顺序', () => {
      const result = filterHistory(entries, { search: '', modId: 1915 });
      expect(result.map((e) => e.id)).toEqual(['a', 'c']);
    });

    it('不修改入参', () => {
      const snapshot = JSON.stringify(entries);
      filterHistory(entries, { search: 'cp', modId: 1915 });
      expect(JSON.stringify(entries)).toBe(snapshot);
    });
  });

  describe('B3. buildModOptions', () => {
    it('按 modId 去重并保留首次出现的名称', () => {
      const options = buildModOptions(entries);
      const cp = options.find((o) => o.modId === 1915);
      expect(cp?.label).toBe('Content Patcher（1915）');
      expect(options.filter((o) => o.modId === 1915)).toHaveLength(1);
    });

    it('label 格式固定为「名称（ID）」且含全部模组', () => {
      const options = buildModOptions(entries);
      expect(options).toHaveLength(2);
      expect(options.every((o) => /^.+（\d+）$/.test(o.label))).toBe(true);
    });

    it('中文名称按 zh-CN 排序（拼音序）', () => {
      const history = [
        makeEntry({ id: '1', modId: 3, modName: '柑橘' }),
        makeEntry({ id: '2', modId: 1, modName: '艾草' }),
        makeEntry({ id: '3', modId: 2, modName: '薄荷' }),
      ];
      expect(buildModOptions(history).map((o) => o.label)).toEqual([
        '艾草（1）',
        '薄荷（2）',
        '柑橘（3）',
      ]);
    });

    it('不改变入参；空历史返回空数组', () => {
      const snapshot = JSON.stringify(entries);
      buildModOptions(entries);
      expect(JSON.stringify(entries)).toBe(snapshot);
      expect(buildModOptions([])).toEqual([]);
    });
  });
});

// ================================================================ C. exportService.ts
describe('C. exportService.ts —— 导出数据组装与渲染', () => {
  const fullEntry = makeEntry({
    id: 'full',
    modId: 3758,
    modName: 'Stardew Valley Expanded',
    fileId: 500,
    fileName: 'SVE_1.15.zip',
    version: '1.15.0',
    gameVersion: '1.6.8',
    chinese: ['SVE_简中.zip', 'SVE_补丁.zip'],
    prerequisites: ['SMAPI', 'Content Patcher', 'SpaceCore'],
    downloadedAt: '2026-06-01T10:00:00Z',
  });

  describe('C1. buildExportData', () => {
    it('字段齐全且列顺序正确', () => {
      const [row] = buildExportData([fullEntry]);
      expect(Object.keys(row)).toEqual([
        'modName',
        'modId',
        'fileName',
        'version',
        'gameVersion',
        'chinese',
        'prerequisites',
        'downloadedAt',
      ]);
      expect(row).toEqual({
        modName: 'Stardew Valley Expanded',
        modId: 3758,
        fileName: 'SVE_1.15.zip',
        version: '1.15.0',
        gameVersion: '1.6.8',
        chinese: 'SVE_简中.zip、SVE_补丁.zip',
        prerequisites: 'SMAPI、Content Patcher、SpaceCore',
        downloadedAt: '2026-06-01T10:00:00Z',
      });
    });

    it('chinese / prerequisites 数组用顿号连接', () => {
      const [row] = buildExportData([fullEntry]);
      expect(row.chinese).toBe('SVE_简中.zip、SVE_补丁.zip');
      expect(row.prerequisites).toBe('SMAPI、Content Patcher、SpaceCore');
    });

    it('旧记录（无新字段）留空兜底，绝不出现 undefined / null 字面量', () => {
      const [row] = buildExportData([makeEntry()]);
      expect(row.gameVersion).toBe('');
      expect(row.chinese).toBe('');
      expect(row.prerequisites).toBe('');
      const serialized = JSON.stringify(buildExportData([makeEntry()]));
      expect(serialized).not.toContain('undefined');
      expect(serialized).not.toContain('null');
    });

    it('version 为空 → 「—」占位', () => {
      const [row] = buildExportData([makeEntry({ version: '' })]);
      expect(row.version).toBe('—');
    });

    it('空 history → 空数组', () => {
      expect(buildExportData([])).toEqual([]);
    });
  });

  describe('C2. renderMarkdown', () => {
    it('含标题、条数与表头，列顺序与设计一致', () => {
      const md = renderMarkdown(buildExportData([fullEntry]));
      expect(md).toContain('# 星露谷模组下载清单');
      expect(md).toContain('共 1 条');
      expect(md).toContain(
        '| 模组名 | ID | 文件 | 版本 | 游戏版本 | 汉化 | 前置 | 下载时间 |',
      );
      expect(md).toContain('| --- | --- | --- | --- | --- | --- | --- | --- |');
      expect(md).toContain('Stardew Valley Expanded');
    });

    it('单元格内 | 转义为 \\|，换行压成空格', () => {
      const row: ExportRow = {
        ...buildExportData([fullEntry])[0],
        modName: 'A|B\nC',
      };
      const md = renderMarkdown([row]);
      expect(md).toContain('A\\|B C');
      expect(md).not.toContain('A|B');
    });
  });

  describe('C3. renderJson', () => {
    it('可被 JSON.parse 直接解析且结构稳定（无 BOM）', () => {
      const rows = buildExportData([fullEntry, makeEntry()]);
      const json = renderJson(rows);
      expect(json.startsWith('\uFEFF')).toBe(false);
      expect(JSON.parse(json)).toEqual(rows);
    });
  });

  describe('C4. renderCsv', () => {
    it('开头带 UTF-8 BOM，行以 CRLF 分隔，列顺序正确', () => {
      const csv = renderCsv(buildExportData([fullEntry]));
      expect(csv.startsWith('\uFEFF')).toBe(true);
      expect(csv.endsWith('\r\n')).toBe(true);
      expect(csv).toContain('模组名,ID,文件,版本,游戏版本,汉化,前置,下载时间');
    });

    it('含双引号 / 逗号 / 换行的单元格被正确加引号转义', () => {
      const row: ExportRow = {
        ...buildExportData([fullEntry])[0],
        fileName: 'a,b"c\nd',
      };
      const csv = renderCsv([row]);
      expect(csv).toContain('"a,b""c\nd"');
    });
  });

  describe('C5. buildExportFileName', () => {
    const fixed = new Date('2026-06-01T12:00:00Z');

    it.each([
      ['md', 'stardew-mods-2026-06-01.md'],
      ['json', 'stardew-mods-2026-06-01.json'],
      ['csv', 'stardew-mods-2026-06-01.csv'],
    ] as const)('%s 格式文件名格式正确', (format, expected) => {
      expect(buildExportFileName(format, fixed)).toBe(expected);
    });

    it('前缀取自 APP_CONFIG.exportFileNamePrefix', () => {
      expect(APP_CONFIG.exportFileNamePrefix).toBe('stardew-mods');
      expect(buildExportFileName('md', fixed)).toMatch(
        new RegExp(`^${APP_CONFIG.exportFileNamePrefix}-\\d{4}-\\d{2}-\\d{2}\\.md$`),
      );
    });

    it('非法日期入参回退到当前日期，仍产出合法文件名', () => {
      expect(buildExportFileName('md', new Date('invalid'))).toMatch(
        /^stardew-mods-\d{4}-\d{2}-\d{2}\.md$/,
      );
    });
  });

  describe('C6. exportMods —— 纯前端下载副作用', () => {
    it('空历史返回 false，不产生文件（不调用 createObjectURL / click）', () => {
      const createSpy = vi.fn(() => 'blob:unused');
      Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        writable: true,
        value: createSpy,
      });
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

      expect(exportMods([], 'md')).toBe(false);
      expect(createSpy).not.toHaveBeenCalled();
      expect(clickSpy).not.toHaveBeenCalled();
    });

    it('非空历史返回 true，触发 Blob / createObjectURL / <a>.click() 并在 1s 后 revoke', () => {
      vi.useFakeTimers();
      let capturedBlob: Blob | undefined;
      let capturedDownload = '';
      const createSpy = vi.fn((blob: Blob) => {
        capturedBlob = blob;
        return 'blob:mock-url';
      });
      const revokeSpy = vi.fn();
      Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        writable: true,
        value: createSpy,
      });
      Object.defineProperty(URL, 'revokeObjectURL', {
        configurable: true,
        writable: true,
        value: revokeSpy,
      });
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
        this: HTMLAnchorElement,
      ) {
        capturedDownload = this.download;
      });

      const result = exportMods([fullEntry], 'md');

      expect(result).toBe(true);
      expect(createSpy).toHaveBeenCalledTimes(1);
      expect(capturedBlob).toBeInstanceOf(Blob);
      expect(capturedBlob?.type).toBe('text/markdown;charset=utf-8');
      expect(capturedDownload).toMatch(/^stardew-mods-\d{4}-\d{2}-\d{2}\.md$/);
      expect(revokeSpy).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1000);
      expect(revokeSpy).toHaveBeenCalledWith('blob:mock-url');
    });
  });
});

// ================================================================ D. modParser.ts 增量
describe('D. modParser.ts —— v2 增量与 v1 回归', () => {
  describe('D1. buildParsedMod 派生 versionNote', () => {
    it('主文件 game_version=1.5 → 生成温和版本提醒', () => {
      const files = [makeFile(10, 'Main.zip', { is_primary: true, game_version: ['1.5.0'] })];
      const parsed = buildParsedMod(1915, makeMeta(), files);
      expect(parsed.versionNote).toBeDefined();
      expect(parsed.versionNote).toContain('1.5');
      expect(parsed.versionNote).toContain('失效');
      expect(parsed.versionNote).toContain('建议核对');
    });

    it('主文件 game_version=1.6（与基线一致）→ 无提醒', () => {
      const files = [makeFile(10, 'Main.zip', { is_primary: true, game_version: ['1.6.8'] })];
      const parsed = buildParsedMod(1915, makeMeta(), files);
      expect(parsed.versionNote).toBeUndefined();
    });

    it('主文件无 game_version → 无提醒', () => {
      const parsed = buildParsedMod(1915, makeMeta(), [makeFile(10, 'Main.zip', { is_primary: true })]);
      expect(parsed.versionNote).toBeUndefined();
    });
  });

  describe('D2. isChineseFile 双键查表（modId 参数 + 旧 file_id 兼容）', () => {
    it("KNOWN_TRANSLATIONS[36170]（modId 键）命中 → true", () => {
      const file: ModFile = makeFile(999999, 'TranslateAll_Pack.zip');
      expect(KNOWN_TRANSLATIONS[36170]).toBeDefined();
      expect(isChineseFile(file, 36170)).toBe(true);
      // 不传 modId 时该中性文件名不应命中任何关键词
      expect(isChineseFile(file)).toBe(false);
    });

    it('旧 file_id 键仍兼容（file_id=36170）', () => {
      const file: ModFile = makeFile(36170, 'TranslateAll_ByFileId.zip');
      expect(isChineseFile(file)).toBe(true);
      // modId 传无关值也不影响 file_id 键优先命中
      expect(isChineseFile(file, 999)).toBe(true);
    });
  });

  describe('D3. findChineseFiles 传 modId 识别 TranslateAll', () => {
    it('传入 modId=36170 时能识别汉化文件', () => {
      // 文件名刻意不含任何 CHINESE_KEYWORDS，只能靠 modId=36170 的映射关键词命中
      const files = [
        makeFile(888888, 'MainMod.zip', { is_primary: true }),
        makeFile(777777, 'TranslateAll_Pack.zip'),
      ];
      expect(findChineseFiles(files, '', 36170).map((f) => f.file_id)).toEqual([777777]);
      expect(findChineseFiles(files)).toEqual([]);
    });

    it('buildParsedMod 内部把 modId 透传给 findChineseFiles', () => {
      const files = [
        makeFile(10, 'Main.zip', { is_primary: true }),
        makeFile(777777, 'TranslateAll_Pack.zip'),
      ];
      const parsed = buildParsedMod(36170, makeMeta({ mod_id: 36170 }), files);
      expect(parsed.chineseFiles.map((f) => f.file_id)).toEqual([777777]);
    });
  });

  describe('D4. v1 核心纯函数回归', () => {
    it('parseModIds 仍正确识别去重、忽略 file_id', () => {
      // 详细用例见 parser.test.ts，这里做关键冒烟回归
      const input = 'https://www.nexusmods.com/stardewvalley/mods/1915?file_id=99, 2400 1915';
      expect(parseModIds(input)).toEqual([1915, 2400]);
    });

    it('buildDownloadPlan：standard includeChinese=false 仅含主文件；premium 为 direct', () => {
      const standard = buildDownloadPlan(makeParsedMod(), 100, false, 'standard');
      expect(standard.items).toHaveLength(1);
      expect(standard.items[0].kind).toBe('main');
      expect(standard.action).toBe('open');

      const premium = buildDownloadPlan(makeParsedMod(), 100, false, 'premium');
      expect(premium.action).toBe('direct');
    });
  });
});

// ================================================================ E. 知识库数据完整性
describe('E. 知识库数据完整性', () => {
  const TRUSTED_IDS = new Set([2400, 1915, 5098, 1349, 1924, 2616, 3758]);

  describe('E1. prerequisites.ts', () => {
    it('所有数字 ID 均在可信集合内，未确认项一律 modId:null', () => {
      for (const item of PREREQUISITE_DB) {
        if (item.modId !== null) {
          expect(TRUSTED_IDS.has(item.modId)).toBe(true);
          expect(item.aliases.length).toBeGreaterThan(0);
        } else {
          expect(item.name.length).toBeGreaterThan(0);
          expect(item.aliases.length).toBeGreaterThan(0);
        }
      }
    });

    it('SMAPI(2400) 为 baseline', () => {
      const smapi = PREREQUISITE_DB.find((item) => item.modId === 2400);
      expect(smapi?.name).toBe('SMAPI');
      expect(smapi?.isBaseline).toBe(true);
    });

    it('SVE(3758) 存在且 aliases 含 sve / expanded', () => {
      const sve = PREREQUISITE_DB.find((item) => item.modId === 3758);
      expect(sve).toBeDefined();
      expect(sve?.name).toBe('Stardew Valley Expanded');
      expect(sve?.aliases).toContain('sve');
      expect(sve?.aliases).toContain('expanded');
    });

    it('名称型条目覆盖 Custom Locations / Mail Framework Mod / Better Piece of Cake / SVE 关联补丁', () => {
      const nameOnly = PREREQUISITE_DB.filter((item) => item.modId === null).map((i) => i.name);
      expect(nameOnly).toEqual(
        expect.arrayContaining([
          'Custom Locations',
          'Mail Framework Mod',
          'Better Piece of Cake',
          'SVE 关联补丁',
        ]),
      );
    });
  });

  describe('E2. chineseKeywords.ts', () => {
    it('CHINESE_KEYWORDS 含 v2 新增词', () => {
      for (const word of ['简中', '汉化补丁', '漢化補丁', '翻译', '翻譯', 'chinese simplified', 'localized']) {
        expect(CHINESE_KEYWORDS).toContain(word);
      }
    });

    it('KNOWN_TRANSLATIONS 含 TranslateAll(36170) 且关键词非空', () => {
      expect(KNOWN_TRANSLATIONS[36170]).toBeDefined();
      expect(KNOWN_TRANSLATIONS[36170].length).toBeGreaterThan(0);
      expect(KNOWN_TRANSLATIONS[36170]).toContain('translateall');
    });
  });
});

// ================================================================ F. 关键安全回归
describe('F. 关键安全回归 —— standard 零 fetch / premium 逐项换直链', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('再次下载场景（includeChinese=false + standard）：fetch=0，绝不触达 download_link.json', async () => {
    // Arrange：模拟 redownload 复用 v1 计划的调用链
    const main = makeFile(200, 'Main.zip', { is_primary: true });
    const zh = makeFile(201, 'Main_Chinese.zip');
    const mod = buildParsedMod(1915, makeMeta(), [main, zh]);
    const plan = buildDownloadPlan(mod, 200, false, 'standard');

    expect(plan.items).toHaveLength(1);
    expect(plan.items[0].kind).toBe('main');
    expect(plan.items[0].file.file_id).toBe(200);
    expect(plan.action).toBe('open');

    // Act
    const results = await executeDownloadPlan(plan, 'SECRET_KEY_MUST_NOT_LEAK');

    // Assert：零网络调用，仅打开网页
    expect(fetchMock).not.toHaveBeenCalled();
    expect(openFilePage).toHaveBeenCalledTimes(1);
    expect(copyText).not.toHaveBeenCalled();
    expect(triggerBrowserDownload).not.toHaveBeenCalled();
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(true);
    expect(Object.values(plan.filePageUrls).join(' ')).not.toContain('download_link.json');
  });

  it('standard(copy) 变体同样零 fetch、零直链', async () => {
    const plan = buildDownloadPlan(makeParsedMod(), 100, false, 'standard', 'copy');
    const results = await executeDownloadPlan(plan, 'SECRET');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(copyText).toHaveBeenCalledTimes(1);
    expect(triggerBrowserDownload).not.toHaveBeenCalled();
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it('premium 计划仍逐项换直链（含汉化项）', async () => {
    fetchMock.mockImplementation(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => [
        { URI: `https://cdn.example/${String(url).includes('/files/200/') ? 'main' : 'zh'}.zip` },
      ],
    }));
    const main = makeFile(200, 'Main.zip', { is_primary: true });
    const zh = makeFile(201, 'Main_Chinese.zip');
    const mod = buildParsedMod(1915, makeMeta(), [main, zh]);
    const plan = buildDownloadPlan(mod, 200, true, 'premium');

    expect(plan.items).toHaveLength(2);
    const results = await executeDownloadPlan(plan, 'k');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.every((url) => url.includes('download_link.json'))).toBe(true);
    expect(triggerBrowserDownload).toHaveBeenCalledTimes(2);
    expect(results.map((r) => r.uri)).toEqual([
      'https://cdn.example/main.zip',
      'https://cdn.example/zh.zip',
    ]);
    expect(results.every((r) => r.ok)).toBe(true);
  });
});
