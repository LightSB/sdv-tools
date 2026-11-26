import { useApp } from '../../hooks/useAppState';
import type { FSTreeNode } from '../../types/workspace';

/** nodeId 路径 → 可读名称；任一级找不到即停止。 */
function resolveNames(tree: FSTreeNode[], path: string[]): string[] {
  const names: string[] = [];
  let level = tree;
  for (const id of path) {
    const node = level.find((item) => item.nodeId === id && item.kind === 'dir');
    if (!node) {
      break;
    }
    names.push(node.name);
    level = node.children;
  }
  return names;
}

/** 面包屑导航：点任一级返回；左侧"返回上级"由操作栏提供（R50）。 */
export default function Breadcrumb() {
  const { state, actions } = useApp();
  const { modId, path } = state.explorer;
  const mod = state.localMods.find((item) => item.id === modId);
  if (!mod) {
    return null;
  }
  const names = resolveNames(mod.fileTree, path);

  return (
    <nav className="breadcrumb" aria-label="文件浏览路径">
      <button
        type="button"
        className="tap-target shrink-0 rounded-lg px-2 text-xs font-semibold text-brand-500"
        onClick={() => actions.openFolder(mod.id)}
      >
        模组根
      </button>
      {path.map((nodeId, index) => (
        <span key={nodeId} className="flex min-w-0 items-center gap-1">
          <span aria-hidden="true" className="text-[var(--app-muted)]">/</span>
          <button
            type="button"
            className="tap-target min-w-0 truncate rounded-lg px-2 text-xs text-[var(--app-text)]"
            onClick={() => actions.navigateInto(nodeId)}
            aria-label={`返回到 ${names[index] ?? '上一级'}`}
          >
            {names[index] ?? '上一级'}
          </button>
        </span>
      ))}
    </nav>
  );
}
