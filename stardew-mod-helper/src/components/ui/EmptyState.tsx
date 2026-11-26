import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

/** 统一的空状态：像素风插画 + 主文案 + 可选操作区。 */
export default function EmptyState({ title, description = '', action }: EmptyStateProps) {
  return (
    <div className="app-card flex flex-col items-center px-6 py-12 text-center">
      <svg
        viewBox="0 0 120 120"
        className="mb-5 h-24 w-24"
        role="img"
        aria-label="空状态插画：一块像素草地与蘑菇"
      >
        <rect x="16" y="16" width="88" height="88" rx="18" fill="#1e293b" />
        <rect x="16" y="76" width="88" height="28" fill="#15803d" />
        <rect x="16" y="72" width="88" height="8" fill="#4ade80" />
        <rect x="30" y="84" width="8" height="8" fill="#166534" />
        <rect x="78" y="92" width="8" height="8" fill="#166534" />
        <rect x="55" y="54" width="10" height="22" fill="#f1f5f9" />
        <rect x="46" y="40" width="28" height="16" rx="4" fill="#f59e0b" />
        <rect x="53" y="44" width="5" height="5" fill="#fffbeb" />
        <rect x="64" y="48" width="4" height="4" fill="#fffbeb" />
        <circle cx="36" cy="38" r="3" fill="#94a3b8" />
        <circle cx="88" cy="48" r="2" fill="#94a3b8" />
      </svg>
      <h2 className="text-base font-semibold text-[var(--app-text)]">{title}</h2>
      {description.length > 0 && (
        <p className="mt-2 max-w-xs text-sm leading-relaxed text-[var(--app-muted)]">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
