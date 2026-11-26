import { useMemo } from 'react';
import { useApp } from '../../hooks/useAppState';
import { formatFileSize } from '../../utils/format';
import { searchLibrary, type LibraryHit } from '../../utils/librarySearch';
import EmptyState from '../ui/EmptyState';

interface LibrarySearchProps {
  onGoPack: () => void;
}

/** 分段②：模组库本地/云端搜索 + 勾选 + 拉取；纯本地实时过滤，零网络请求（R48/Q8）。 */
export default function LibrarySearch({ onGoPack }: LibrarySearchProps) {
  const { state, actions } = useApp();
  const hits = useMemo<LibraryHit[]>(
    () =>
      searchLibrary(state.localMods, state.cloudMods, {
        query: state.librarySearch.query,
        includeCloud: state.librarySearch.includeCloud,
      }),
    [state.localMods, state.cloudMods, state.librarySearch],
  );
  const selected = new Set(state.selectedPackIds);

  return (
    <div className="space-y-4">
      <section className="app-card p-4" aria-label="模组库搜索">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-[var(--app-text)]">模组库搜索</h2>
          <p className="text-[11px] text-[var(--app-muted)]">零网络请求 · 共 {hits.length} 条结果</p>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-[var(--app-muted)]">
          从已上传模组（含云端已同步元数据）中按名称、作者、UniqueID、文件夹名、UpdateKeys 与 Nexus ID 模糊匹配。
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={state.librarySearch.query}
            onChange={(event) => actions.setLibraryQuery(event.target.value)}
            placeholder="输入关键词，实时过滤本地模组库"
            aria-label="搜索模组库"
            className="tap-target min-w-0 flex-1 rounded-xl border px-3 text-xs text-[var(--app-text)]"
            style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface)' }}
          />
          <label className="tap-target flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-1 text-xs text-[var(--app-muted)]">
            <input
              type="checkbox"
              className="h-4 w-4 accent-brand-600"
              checked={state.librarySearch.includeCloud}
              onChange={(event) => actions.setIncludeCloud(event.target.checked)}
            />
            包含云端
          </label>
        </div>

        {hits.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              title="没有匹配的模组，换个关键词试试"
              description={state.librarySearch.query.length === 0 ? '先上传模组，或在设置中同步到云端。' : undefined}
            />
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {hits.map((hit) => {
              const isCloud = hit.kind === 'cloud';
              return (
                <li key={hit.key} className="app-card p-3">
                  <div className="flex flex-wrap items-start gap-2">
                    <label
                      className={`tap-target flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-1 text-xs ${
                        hit.selectable ? 'text-[var(--app-muted)]' : 'opacity-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-brand-600"
                        checked={isCloud ? false : selected.has(hit.id)}
                        disabled={!hit.selectable}
                        onChange={() => actions.togglePackSelect(hit.id)}
                        aria-label={`勾选 ${hit.name} 用于打包`}
                      />
                      {isCloud ? '云端' : '打包'}
                    </label>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-[var(--app-text)]">
                        {hit.name}
                        {isCloud && <span className="chip chip--muted ml-2">未在本地</span>}
                      </p>
                      <p className="mt-1 text-[11px] leading-relaxed text-[var(--app-muted)]">
                        {hit.author || '未知作者'} · 目录 {hit.folderName} · {hit.fileCount} 个文件 ·{' '}
                        {formatFileSize(hit.totalSize / 1024)} · {hit.updateStatus}
                      </p>
                      {isCloud && !hit.selectable && (
                        <p className="mt-1 text-[11px] text-[var(--app-muted)]">
                          需先拉取再打包（云端文件树不在本地）。
                        </p>
                      )}
                    </div>
                    {isCloud && (
                      <button
                        type="button"
                        className="secondary-btn text-xs"
                        disabled={state.syncBusy}
                        onClick={() => void actions.pullFromCloud([hit.id])}
                      >
                        拉取
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="secondary-btn flex-1 text-xs"
            disabled={state.selectedPackIds.length === 0}
            onClick={onGoPack}
          >
            去打包（已选 {state.selectedPackIds.length}）
          </button>
        </div>
      </section>
    </div>
  );
}
