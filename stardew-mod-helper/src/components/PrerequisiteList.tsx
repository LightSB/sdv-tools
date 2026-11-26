import { useId, useState } from 'react';
import type { Prerequisite } from '../types/domain';

/** 前置模组可展开列表；无 N 网页面的名称型条目渲染为纯文本。 */
export default function PrerequisiteList({ items }: { items: Prerequisite[] }) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 overflow-hidden rounded-xl border" style={{ borderColor: 'var(--app-border)' }}>
      <button
        type="button"
        onClick={() => setExpanded((previous) => !previous)}
        aria-expanded={expanded}
        aria-controls={listId}
        aria-label={expanded ? '收起前置模组列表' : `展开 ${items.length} 个前置模组`}
        className="tap-target flex w-full items-center gap-2 bg-brand-500/5 px-3 py-2.5 text-left text-xs font-semibold text-brand-500"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M10 4h4v3h3a2 2 0 0 1 2 2v3h-3v4h3v3a2 2 0 0 1-2 2h-3v-3h-4v3H7a2 2 0 0 1-2-2v-3H2v-4h3V9a2 2 0 0 1 2-2h3V4Z" strokeLinejoin="round" />
        </svg>
        <span className="flex-1">前置模组 · {items.length} 项</span>
        <svg
          viewBox="0 0 24 24"
          className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {expanded && (
        <ul id={listId} className="divide-y" style={{ borderColor: 'var(--app-border)' }}>
          {items.map((item) => {
            const content = (
              <div className="flex items-center gap-2 py-2.5">
                <span
                  className={`chip shrink-0 ${
                    item.source === 'knowledge'
                      ? 'bg-sky-500/10 text-sky-400'
                      : 'bg-accent-400/10 text-accent-400'
                  }`}
                >
                  {item.source === 'knowledge' ? '知识库' : '描述'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--app-text)]">
                    {item.name}
                    {item.modId > 0 ? ` · ${item.modId}` : ''}
                  </p>
                  {item.note && (
                    <p className="truncate text-xs text-[var(--app-muted)]">{item.note}</p>
                  )}
                </div>
                {item.url.length > 0 && (
                  <span aria-hidden="true" className="text-xs text-[var(--app-muted)]">
                    ↗
                  </span>
                )}
              </div>
            );

            return (
              <li key={`${item.modId}-${item.name}`} className="px-3">
                {item.url.length > 0 ? (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`在 N 网打开前置模组 ${item.name}`}
                    className="block rounded-lg focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    {content}
                  </a>
                ) : (
                  <div aria-label={`前置模组 ${item.name}，暂无 N 网页面`}>{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
