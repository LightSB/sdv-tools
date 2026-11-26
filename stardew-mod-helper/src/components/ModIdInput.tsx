import { useMemo } from 'react';
import { useApp } from '../hooks/useAppState';
import { parseModIds } from '../services/modParser';

/** 多行 ID 输入区：实时显示识别数量，一键批量拉取。 */
export default function ModIdInput() {
  const { state, actions } = useApp();
  const idCount = useMemo(() => parseModIds(state.idsInput).length, [state.idsInput]);
  const canResolve = idCount > 0 && state.keyStatus === 'valid';

  return (
    <section className="app-card p-4" aria-labelledby="mod-id-title">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="mod-id-title" className="text-sm font-semibold text-[var(--app-text)]">
          模组 ID / 链接
        </h2>
        <span
          className={`chip ${idCount > 0 ? 'bg-brand-500/15 text-brand-500' : 'bg-slate-500/10 text-[var(--app-muted)]'}`}
          role="status"
        >
          已识别 {idCount} 个 ID
        </span>
      </div>

      <textarea
        value={state.idsInput}
        onChange={(event) => actions.setIdsInput(event.target.value)}
        rows={4}
        placeholder="粘贴模组 ID 或链接，多个用逗号 / 空格 / 换行分隔"
        aria-label="模组 ID 或链接输入区"
        spellCheck={false}
        className="w-full resize-y rounded-xl border bg-transparent px-3 py-3 text-sm leading-relaxed outline-none placeholder:text-[var(--app-muted)] focus:border-brand-500"
        style={{ borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void actions.resolveMods()}
          disabled={!canResolve}
          className="primary-btn flex-1"
          aria-label={`识别并加载 ${idCount} 个模组`}
        >
          识别并加载
          {idCount > 0 ? `（${idCount}）` : ''}
        </button>
        <button
          type="button"
          onClick={() => actions.setIdsInput('')}
          disabled={state.idsInput.length === 0}
          className="secondary-btn shrink-0"
          aria-label="清空已输入的模组 ID"
        >
          清空
        </button>
      </div>
      {state.keyStatus !== 'valid' && (
        <p className="mt-2 text-xs text-amber-400" role="status">
          请先在上方可用的 API Key 完成校验，再加载模组。
        </p>
      )}
    </section>
  );
}
