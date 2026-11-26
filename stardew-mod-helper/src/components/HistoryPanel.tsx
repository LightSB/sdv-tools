import { useMemo, useState } from 'react';
import { APP_CONFIG } from '../config';
import { useApp } from '../hooks/useAppState';
import { useToast } from '../hooks/useToast';
import { exportMods, type ExportFormat } from '../services/exportService';
import type { DownloadAction } from '../types/domain';
import { formatDate } from '../utils/format';
import { buildModOptions, filterHistory } from '../utils/history';
import EmptyState from './ui/EmptyState';

const actionLabels: Record<DownloadAction, string> = {
  direct: '一键直下',
  open: '打开 N 网',
  copy: '复制链接',
};

const formatLabels: Record<ExportFormat, string> = {
  md: 'Markdown',
  json: 'JSON',
  csv: 'CSV',
};

const secondaryActionStyle = {
  borderColor: 'var(--app-border)',
  backgroundColor: 'var(--app-surface)',
  color: 'var(--app-text)',
};

/** 下载历史：按时间倒序展示，支持搜索、模组筛选、导出、再次下载与一键清空。 */
export default function HistoryPanel() {
  const { state, actions } = useApp();
  const { pushToast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [search, setSearch] = useState('');
  const [filterModId, setFilterModId] = useState<number | 'all'>('all');
  const [exportFormatMenuOpen, setExportFormatMenuOpen] = useState(false);

  const modOptions = useMemo(() => buildModOptions(state.history), [state.history]);
  const visible = useMemo(
    () => filterHistory(state.history, { search, modId: filterModId }),
    [state.history, search, filterModId],
  );

  const handleExport = (format: ExportFormat): void => {
    setExportFormatMenuOpen(false);
    if (state.history.length === 0) {
      pushToast('暂无可导出的记录', 'info');
      return;
    }
    const ok = exportMods(state.history, format);
    pushToast(
      ok ? `已导出 ${formatLabels[format]} 清单` : '暂无可导出的记录',
      ok ? 'success' : 'info',
    );
  };

  return (
    <section aria-labelledby="history-title" className="space-y-3">
      <div className="app-card p-3">
        <div className="flex items-center justify-between gap-2 px-1">
          <div>
            <h2 id="history-title" className="text-sm font-semibold text-[var(--app-text)]">
              下载历史
            </h2>
            <p className="mt-0.5 text-xs text-[var(--app-muted)]">
              共 {state.history.length} 条 · 最新在前
            </p>
          </div>
          <div className="relative flex items-center gap-2">
            <button
              type="button"
              disabled={state.history.length === 0}
              onClick={() => setExportFormatMenuOpen((open) => !open)}
              aria-haspopup="menu"
              aria-expanded={exportFormatMenuOpen}
              aria-label="导出下载历史清单"
              title={state.history.length === 0 ? '暂无可导出的记录' : '导出清单'}
              className="tap-target rounded-lg px-3 text-xs font-medium text-brand-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              导出 ▾
            </button>
            {exportFormatMenuOpen && state.history.length > 0 && (
              <div
                role="menu"
                className="absolute right-0 top-full z-10 mt-1 w-28 rounded-xl border p-1 shadow-card"
                style={{
                  backgroundColor: 'var(--app-surface)',
                  borderColor: 'var(--app-border)',
                }}
              >
                {(['md', 'json', 'csv'] as ExportFormat[]).map((format) => (
                  <button
                    key={format}
                    type="button"
                    role="menuitem"
                    onClick={() => handleExport(format)}
                    className="tap-target block w-full rounded-lg px-3 py-2 text-left text-xs text-[var(--app-text)] hover:bg-brand-500/10"
                  >
                    {formatLabels[format]}
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                if (confirming) {
                  actions.clearHistory();
                  setConfirming(false);
                } else {
                  setConfirming(true);
                }
              }}
              className="tap-target rounded-lg px-3 text-xs font-medium text-rose-400"
              aria-label={
                confirming
                  ? '确认清空全部下载历史（含全部记录，不受搜索/筛选影响）'
                  : '将清空全部下载历史（含全部记录，不受搜索/筛选影响）'
              }
            >
              {confirming ? '确认清空全部？' : '清空历史'}
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索模组名 / 文件名 / ID"
            aria-label="搜索下载历史"
            className="tap-target min-w-0 flex-1 rounded-xl border px-3 py-2 text-xs outline-none"
            style={{
              backgroundColor: 'var(--app-surface)',
              borderColor: 'var(--app-border)',
              color: 'var(--app-text)',
            }}
          />
          <select
            value={filterModId === 'all' ? 'all' : String(filterModId)}
            onChange={(event) => {
              const value = event.target.value;
              setFilterModId(value === 'all' ? 'all' : Number(value));
            }}
            aria-label="按模组筛选下载历史"
            className="tap-target rounded-xl border px-3 py-2 text-xs outline-none"
            style={{
              backgroundColor: 'var(--app-surface)',
              borderColor: 'var(--app-border)',
              color: 'var(--app-text)',
            }}
          >
            <option value="all">全部模组</option>
            {modOptions.map((option) => (
              <option key={option.modId} value={option.modId}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {state.history.length === 0 ? (
        <EmptyState
          title="还没有下载记录"
          description="完成一次下载后，这里会记录模组、文件与版本，方便你随时回看。"
        />
      ) : visible.length === 0 ? (
        <p
          className="app-card p-6 text-center text-xs text-[var(--app-muted)]"
          role="status"
        >
          没有匹配的记录
        </p>
      ) : (
        visible.map((entry) => (
          <article key={entry.id} className="app-card p-4">
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-500"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v3h16v-3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <a
                  href={`${APP_CONFIG.webBaseUrl}/${APP_CONFIG.gameDomain}/mods/${entry.modId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate text-sm font-semibold text-[var(--app-text)] hover:text-brand-500"
                  aria-label={`在 N 网查看 ${entry.modName}`}
                >
                  {entry.modName}
                </a>
                <p className="mt-1 truncate text-xs text-[var(--app-muted)]">
                  {entry.fileName} · v{entry.version || '—'}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="chip bg-brand-500/15 text-brand-500">
                    {actionLabels[entry.action]}
                  </span>
                  {entry.tier === 'premium' && <span className="chip chip--chinese">Premium</span>}
                  <span className="text-[11px] text-[var(--app-muted)]">
                    {formatDate(entry.downloadedAt)}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void actions.redownload(entry);
                    }}
                    aria-label={`再次下载 ${entry.modName} 的 ${entry.fileName}`}
                    className="tap-target rounded-lg border px-3 py-1.5 text-xs font-medium"
                    style={secondaryActionStyle}
                  >
                    再次下载
                  </button>
                  {entry.tier !== 'premium' && (
                    <button
                      type="button"
                      onClick={() => {
                        void actions.redownload(entry, 'copy');
                      }}
                      aria-label={`复制 ${entry.modName} 的文件页链接`}
                      className="tap-target rounded-lg border px-3 py-1.5 text-xs font-medium"
                      style={secondaryActionStyle}
                    >
                      复制链接
                    </button>
                  )}
                </div>
              </div>
            </div>
          </article>
        ))
      )}
    </section>
  );
}
