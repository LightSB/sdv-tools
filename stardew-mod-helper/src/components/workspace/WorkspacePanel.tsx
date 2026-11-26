import { useState } from 'react';
import { useApp } from '../../hooks/useAppState';
import type { WorkspaceSegment } from '../../types/domain';
import LibrarySearch from './LibrarySearch';
import LocalModLibrary from './LocalModLibrary';
import PackPanel from './PackPanel';

const segments: Array<{ key: WorkspaceSegment; label: string }> = [
  { key: 'local', label: '本地模组库' },
  { key: 'library', label: '模组库搜索' },
  { key: 'pack', label: '打包所选' },
];

/** 工作区容器：三分段（局部 state，不进全局 reducer）+ 全局 Key 状态提示（R32/R48）。 */
export default function WorkspacePanel() {
  const { state } = useApp();
  const [segment, setSegment] = useState<WorkspaceSegment>('local');

  return (
    <div className="space-y-4">
      {state.keyStatus !== 'valid' && (
        <div
          role="status"
          className="app-card px-4 py-3 text-xs leading-relaxed text-[var(--app-muted)]"
        >
          更新检测需要已校验的 API Key；模组库搜索与打包无需 Key。
        </div>
      )}

      <div role="tablist" aria-label="工作区分段" className="app-card flex gap-1 p-1">
        {segments.map((item) => {
          const active = segment === item.key;
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSegment(item.key)}
              className={`tap-target min-w-0 flex-1 rounded-xl px-2 text-center text-[11px] font-semibold transition sm:text-xs ${
                active ? 'bg-brand-500/15 text-brand-500' : 'text-[var(--app-muted)]'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {segment === 'local' ? (
        <LocalModLibrary onGoPack={() => setSegment('pack')} />
      ) : segment === 'library' ? (
        <LibrarySearch onGoPack={() => setSegment('pack')} />
      ) : (
        <PackPanel onGoLocal={() => setSegment('local')} />
      )}
    </div>
  );
}
