import { useToast, type ToastType } from '../../hooks/useToast';

const toneClasses: Record<ToastType, string> = {
  success: 'border-brand-400/40 bg-brand-600/95 text-white',
  error: 'border-rose-300/40 bg-rose-600/95 text-white',
  info: 'border-slate-400/40 bg-slate-800/95 text-slate-50',
};

const iconText: Record<ToastType, string> = {
  success: '✓',
  error: '!',
  info: 'i',
};

/** 轻量 Toast 渲染容器：点击任意条可提前关闭。 */
export default function Toast() {
  const { toasts, dismissToast } = useToast();

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[70] flex flex-col items-center gap-2 px-4"
      style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}
      role="status"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          onClick={() => dismissToast(toast.id)}
          aria-label={`关闭提示：${toast.message}`}
          className={`pointer-events-auto flex min-h-[44px] w-full max-w-md items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-medium shadow-xl backdrop-blur transition ${toneClasses[toast.type]}`}
        >
          <span
            aria-hidden="true"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/40 text-xs font-bold"
          >
            {iconText[toast.type]}
          </span>
          <span className="flex-1 leading-snug">{toast.message}</span>
        </button>
      ))}
    </div>
  );
}
