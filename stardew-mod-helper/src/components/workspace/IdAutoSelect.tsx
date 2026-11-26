import { useState } from 'react';
import { useApp } from '../../hooks/useAppState';

/** 按一组 ID 自动勾选对应模组；输入解析与匹配全在 action 内完成，零网络请求（R51）。 */
export default function IdAutoSelect() {
  const { actions } = useApp();
  const [input, setInput] = useState('');

  return (
    <section className="app-card p-4" aria-label="按 ID 勾选模组">
      <h3 className="text-sm font-semibold text-[var(--app-text)]">按 ID 勾选</h3>
      <p className="mt-1 text-[11px] leading-relaxed text-[var(--app-muted)]">
        粘贴一组模组 ID，支持逗号/空格/换行/N 网链接混排；命中模组将自动加入打包勾选。
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="例如 1915, 2400 或模组页链接"
          aria-label="模组 ID 列表"
          className="tap-target min-w-0 flex-1 rounded-xl border px-3 text-xs text-[var(--app-text)]"
          style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface)' }}
        />
        <button
          type="button"
          className="primary-btn text-xs"
          onClick={() => actions.selectByIds(input)}
          disabled={input.trim().length === 0}
        >
          自动勾选
        </button>
      </div>
    </section>
  );
}
