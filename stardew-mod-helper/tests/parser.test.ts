import { describe, expect, it } from 'vitest';
import {
  buildDownloadPlan,
  buildParsedMod,
  detectPrerequisites,
  findChineseFiles,
  isChineseFile,
  parseModIds,
  pickMainFile,
} from '../src/services/modParser';
import { makeFile, makeMeta, makeParsedMod } from './fixtures';

// ---------------------------------------------------------------- A: parseModIds
describe('A. parseModIds —— 多/单 ID 智能识别', () => {
  it('纯数字单个 ID', () => {
    expect(parseModIds('1915')).toEqual([1915]);
  });

  it('完整 N 网 URL', () => {
    expect(parseModIds('https://www.nexusmods.com/stardewvalley/mods/2400?tab=files')).toEqual([
      2400,
    ]);
  });

  it('混合混排：URL + 逗号 + 换行 + 空格，去重保序且忽略 file_id 参数', () => {
    const input = 'https://www.nexusmods.com/stardewvalley/mods/1915?file_id=99, 2400\n1915 5098';
    expect(parseModIds(input)).toEqual([1915, 2400, 5098]);
  });

  it('过滤非法范围：0、超大数、纯文本无数字', () => {
    expect(parseModIds('0')).toEqual([]);
    expect(parseModIds('100000000 999999999')).toEqual([]);
    expect(parseModIds('no digits here')).toEqual([]);
  });

  it('负号按 DESIGN「抽裸数字」语义视为分隔符', () => {
    // DESIGN §3.3 定义：先抽 URL，再抽裸数字，去重保序，过滤 1..99999999。
    // 因此 "-5" 中负号被当作分隔符，提取出的 5 落在合法范围，属预期行为。
    // 若产品侧要求把负数整体判为非法，则需工程师在 push() 前排除负号前缀（见测试报告观察项）。
    expect(parseModIds('-5')).toEqual([5]);
  });

  it('中文逗号 / 分号分隔也能识别', () => {
    expect(parseModIds('1915，2400；5098')).toEqual([1915, 2400, 5098]);
  });
});

// ---------------------------------------------------------------- B: buildDownloadPlan
describe('B. buildDownloadPlan —— Premium 降级核心', () => {
  it('tier=premium -> action=direct，items 正确且无降级 note', () => {
    const plan = buildDownloadPlan(makeParsedMod(), 100, false, 'premium');
    expect(plan.tier).toBe('premium');
    expect(plan.action).toBe('direct');
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0]).toMatchObject({ modId: 1915, kind: 'main' });
    expect(plan.items[0].file.file_id).toBe(100);
    expect(plan.note).toBeUndefined();
  });

  it('tier=standard 且 manualAction 默认 -> action=open 且带降级提示 note', () => {
    const plan = buildDownloadPlan(makeParsedMod(), 100, false, 'standard');
    expect(plan.action).toBe('open');
    expect(plan.note).toContain('Premium');
  });

  it('tier=standard 且 manualAction=copy -> action=copy', () => {
    const plan = buildDownloadPlan(makeParsedMod(), 100, false, 'standard', 'copy');
    expect(plan.action).toBe('copy');
    expect(plan.note).toBeDefined();
  });

  it('includeChinese=true 时汉化文件加入 items 且 kind=chinese，不重复', () => {
    const plan = buildDownloadPlan(makeParsedMod(), 100, true, 'premium');
    expect(plan.items).toHaveLength(2);
    expect(plan.items[1]).toMatchObject({ kind: 'chinese' });
    expect(plan.items[1].file.file_id).toBe(101);
    const fileIds = plan.items.map((item) => item.file.file_id);
    expect(new Set(fileIds).size).toBe(fileIds.length);
  });

  it('filePageUrls 的 key 为 `${modId}:${fileId}`，URL 含 tab=files&file_id=', () => {
    const plan = buildDownloadPlan(makeParsedMod(), 100, true, 'standard');
    expect(Object.keys(plan.filePageUrls).sort()).toEqual(['1915:100', '1915:101']);
    expect(plan.filePageUrls['1915:100']).toContain('tab=files&file_id=100');
    expect(plan.filePageUrls['1915:100']).toContain(
      'https://www.nexusmods.com/stardewvalley/mods/1915',
    );
  });
});

// ---------------------------------------------------------------- C: detectPrerequisites
describe('C. detectPrerequisites —— 前置识别', () => {
  it('SMAPI(2400) 作为基线恒在，即使描述为空', () => {
    const list = detectPrerequisites(makeMeta(), '');
    const smapi = list.find((p) => p.modId === 2400);
    expect(smapi).toBeDefined();
    expect(smapi?.name).toBe('SMAPI');
    expect(smapi?.url).toContain('/mods/2400');
    expect(smapi?.source).toBe('knowledge');
  });

  it('从描述命中 Content Patcher / GMCM（含别名 cp、gmcm）', () => {
    const list = detectPrerequisites(makeMeta(), 'Requires cp and gmcm to work');
    expect(list.some((p) => p.modId === 1915)).toBe(true);
    expect(list.some((p) => p.modId === 5098)).toBe(true);
  });

  it('modId:null 的知识库条目产出 modId=0、url 为空串', () => {
    const list = detectPrerequisites(makeMeta(), 'Needs Custom Music for background tracks');
    const customMusic = list.find((p) => p.name === 'Custom Music');
    expect(customMusic).toBeDefined();
    expect(customMusic?.modId).toBe(0);
    expect(customMusic?.url).toBe('');
  });

  it('同一 modId 不重复：名称命中与 URL ID 命中只产出一项', () => {
    const meta = makeMeta({
      description:
        'Requires Content Patcher. See https://www.nexusmods.com/stardewvalley/mods/1915 for details.',
    });
    const list = detectPrerequisites(meta, '');
    expect(list.filter((p) => p.modId === 1915)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------- D: 汉化识别
describe('D. isChineseFile / findChineseFiles —— 汉化识别', () => {
  it.each([
    'MyMod_Chinese.zip',
    '汉化补丁.7z',
    'Mod_简体中文.zip',
    '繁体版.zip',
    'mod_CN.zip',
  ])('识别汉化文件名：%s', (name) => {
    expect(isChineseFile(makeFile(1, name))).toBe(true);
  });

  it('无关英文文件名判为 false', () => {
    expect(isChineseFile(makeFile(1, 'Beautiful_Farm_v2.zip'))).toBe(false);
    expect(isChineseFile(makeFile(2, 'Duncan_Mod.zip'))).toBe(false);
  });

  it('描述中的汉化关键词也能命中', () => {
    expect(isChineseFile(makeFile(1, 'pack.zip', { description: '[b]中文翻译包[/b]' }))).toBe(true);
  });

  it('findChineseFiles 从文件列表中筛出汉化项', () => {
    const files = [
      makeFile(1, 'MainMod.zip'),
      makeFile(2, 'MainMod_Chinese.zip'),
      makeFile(3, 'Optional_Other.zip'),
      makeFile(4, '汉化包.zip'),
    ];
    expect(findChineseFiles(files).map((f) => f.file_id)).toEqual([2, 4]);
  });

  it('pickMainFile 优先 is_primary，再退回首项', () => {
    const files = [makeFile(1, 'first.zip'), makeFile(2, 'primary.zip', { is_primary: true })];
    expect(pickMainFile(files)?.file_id).toBe(2);
    expect(pickMainFile([])).toBeNull();
  });
});

// ---------------------------------------------------------------- 集成：buildParsedMod
describe('集成：buildParsedMod 聚合', () => {
  it('聚合摘要 / 主文件 / 汉化 / 前置', () => {
    const meta = makeMeta({
      summary: '[b]Adds CP support[/b]',
      description: 'Requires gmcm to configure',
    });
    const files = [makeFile(10, 'Main.zip', { is_primary: true }), makeFile(11, 'Main_中文.zip')];
    const parsed = buildParsedMod(1915, meta, files);
    expect(parsed.modId).toBe(1915);
    expect(parsed.mainFile?.file_id).toBe(10);
    expect(parsed.chineseFiles.map((f) => f.file_id)).toEqual([11]);
    expect(parsed.plainSummary).toContain('Adds CP support');
    expect(parsed.prerequisites.some((p) => p.modId === 2400)).toBe(true);
    expect(parsed.prerequisites.some((p) => p.modId === 5098)).toBe(true);
  });
});
