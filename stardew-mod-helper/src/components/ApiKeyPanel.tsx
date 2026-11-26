import { useRef, useState, type FocusEvent } from 'react';
import { useApp } from '../hooks/useAppState';

/** API Key 配置区：密码输入、失焦自动校验、手动校验、一键清除。 */
export default function ApiKeyPanel() {
  const { state, actions } = useApp();
  const [showKey, setShowKey] = useState(false);
  const validatedKeyRef = useRef('');

  const handleBlur = (event: FocusEvent<HTMLInputElement>): void => {
    // 焦点移向「校验」按钮时交给按钮处理，避免同一密钥重复请求
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof HTMLElement && nextTarget.dataset.validate === 'true') {
      return;
    }
    const trimmed = state.apiKey.trim();
    if (trimmed.length > 0 && trimmed !== validatedKeyRef.current) {
      validatedKeyRef.current = trimmed;
      void actions.validate();
    }
  };

  const handleValidate = (): void => {
    validatedKeyRef.current = state.apiKey.trim();
    void actions.validate();
  };

  const handleClear = (): void => {
    validatedKeyRef.current = '';
    actions.clearKey();
  };

  return (
    <section id="api-key-panel" className="app-card scroll-mt-24 p-4" aria-labelledby="api-key-title">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="api-key-title" className="text-sm font-semibold text-[var(--app-text)]">
          N 网 API Key
        </h2>
        <span className="chip bg-brand-500/10 text-brand-500">仅存本机</span>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type={showKey ? 'text' : 'password'}
            value={state.apiKey}
            onChange={(event) => actions.setKey(event.target.value)}
            onBlur={handleBlur}
            placeholder="粘贴你的 Nexus Mods API Key"
            aria-label="Nexus Mods API Key"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            className="tap-target w-full rounded-xl border bg-transparent px-3 pr-11 text-sm outline-none placeholder:text-[var(--app-muted)] focus:border-brand-500"
            style={{ borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
          />
          <button
            type="button"
            onClick={() => setShowKey((previous) => !previous)}
            aria-label={showKey ? '隐藏密钥' : '显示密钥'}
            className="tap-target absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-xl text-[var(--app-muted)]"
          >
            {showKey ? (
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M3 3l18 18M10.6 10.7a2 2 0 0 0 2.8 2.8M6.7 6.8C4.6 8.2 3 10.2 2 12c1.6 3.1 5.3 6 10 6 1.6 0 3.1-.3 4.4-.9M9.9 5.2A10.6 10.6 0 0 1 12 5c4.7 0 8.4 2.9 10 6-1 1.9-2.6 3.6-4.7 4.8" strokeLinecap="round" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z" />
                <circle cx="12" cy="12" r="2.5" />
              </svg>
            )}
          </button>
        </div>
        <button
          type="button"
          onClick={handleValidate}
          data-validate="true"
          disabled={state.keyStatus === 'checking'}
          className="primary-btn shrink-0"
          aria-label="校验 API Key"
        >
          {state.keyStatus === 'checking' ? '校验中' : '校验'}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p
          className={`min-h-[18px] flex-1 text-xs leading-relaxed ${
            state.keyStatus === 'invalid' || state.keyStatus === 'error'
              ? 'text-rose-400'
              : 'text-[var(--app-muted)]'
          }`}
          role="status"
        >
          {state.keyMessage || '密钥仅保存在此设备，不会上传到任何服务器。'}
          {state.keyStatus === 'valid' && state.userName ? ` · ${state.userName}` : ''}
        </p>
        <button
          type="button"
          onClick={handleClear}
          disabled={state.apiKey.length === 0}
          className="tap-target shrink-0 rounded-lg px-2 text-xs font-medium text-rose-400 disabled:opacity-40"
          aria-label="清除本机 API Key"
        >
          清除密钥
        </button>
      </div>
    </section>
  );
}
