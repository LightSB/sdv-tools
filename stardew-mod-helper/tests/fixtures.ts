import type { ParsedMod } from '../src/types/domain';
import type { Mod, ModFile } from '../src/types/nexus';

/** 构造一个符合 ModFile DTO 的测试文件对象。 */
export function makeFile(
  file_id: number,
  file_name: string,
  overrides: Partial<ModFile> = {},
): ModFile {
  return {
    file_id,
    file_name,
    version: '1.0.0',
    category_name: 'Main Files',
    is_primary: false,
    size_kb: 1024,
    uploaded_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

/** 构造一个符合 Mod DTO 的测试元数据对象。 */
export function makeMeta(overrides: Partial<Mod> = {}): Mod {
  return {
    mod_id: 1915,
    game_id: 1303,
    name: 'Test Mod',
    version: '1.0.0',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
    authors: [{ user_id: 1, name: 'Tester' }],
    summary: '',
    description: '',
    picture_url: null,
    ...overrides,
  };
}

/** 构造一个 ParsedMod，供 buildDownloadPlan 等纯函数隔离测试。 */
export function makeParsedMod(overrides: Partial<ParsedMod> = {}): ParsedMod {
  const mainFile = makeFile(100, 'TestMod_Main.zip', { is_primary: true });
  const chineseFile = makeFile(101, 'TestMod_Chinese.zip');
  return {
    modId: 1915,
    meta: makeMeta(),
    files: [mainFile, chineseFile],
    mainFile,
    chineseFiles: [chineseFile],
    prerequisites: [],
    plainSummary: '',
    isChineseTranslation: false,
    ...overrides,
  };
}
