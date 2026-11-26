/** 内置高频前置模组知识库条目。 */
export interface KnownMod {
  modId: number | null;
  name: string;
  aliases: string[];
  note?: string;
  isBaseline?: boolean;
}

/**
 * 前置知识库。
 * - `modId: null` 表示名称型条目（如 Custom Music）：命中后只展示文本标签，不生成 N 网链接。
 * - `isBaseline: true` 的条目（SMAPI）始终出现在前置列表中。
 * - 仅收录可信 N 网 ID；未经确认的模组一律 `modId: null` 名称型，严禁编造 ID。
 */
export const PREREQUISITE_DB: KnownMod[] = [
  {
    modId: 2400,
    name: 'SMAPI',
    aliases: ['smapi'],
    note: '几乎所有模组都需要',
    isBaseline: true,
  },
  {
    modId: 1915,
    name: 'Content Patcher',
    aliases: ['content patcher', 'contentpatcher', 'cp', '内容补丁'],
  },
  {
    modId: 5098,
    name: 'Generic Mod Config Menu',
    aliases: ['gmcm', 'generic mod config menu', '配置菜单', '模组配置菜单'],
  },
  {
    modId: 1349,
    name: 'SpaceCore',
    aliases: ['spacecore', 'space core', '太空核心'],
  },
  {
    modId: 1924,
    name: 'Farm Type Manager',
    aliases: ['farm type manager', 'ftm', '农场类型管理器'],
  },
  {
    modId: 2616,
    name: 'Json Assets',
    aliases: ['json assets', 'jsonassets', 'ja', 'json资产'],
  },
  {
    modId: 3758,
    name: 'Stardew Valley Expanded',
    aliases: ['sve', 'expanded', 'stardew valley expanded', '星露谷扩展'],
    note: '大型扩展模组，常作为其他模组的前置',
  },
  {
    modId: null,
    name: 'Custom Music',
    aliases: ['custom music', '自定义音乐'],
    note: '名称型前置，无对应 N 网页面',
  },
  {
    modId: null,
    name: 'Custom Locations',
    aliases: ['custom locations', 'custom location', '自定义地点', '自定义地图'],
    note: '名称型前置，ID 未经确认，不生成链接',
  },
  {
    modId: null,
    name: 'Mail Framework Mod',
    aliases: ['mail framework mod', 'mail framework', '邮件框架', '邮件框架模组'],
    note: '名称型前置，ID 未经确认，不生成链接',
  },
  {
    modId: null,
    name: 'Better Piece of Cake',
    aliases: ['better piece of cake', '更好的蛋糕', '蛋糕模组'],
    note: '名称型前置，ID 未经确认，不生成链接',
  },
  {
    modId: null,
    name: 'SVE 关联补丁',
    aliases: ['sve patch', 'sve 补丁', 'stardew valley expanded patch', 'sve 关联补丁'],
    note: '名称型前置，ID 未经确认，不生成链接',
  },
];
