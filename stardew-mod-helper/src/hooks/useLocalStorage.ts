import { useCallback, useState } from 'react';

/**
 * 泛型 localStorage 状态：JSON 解析失败回退初始值，写入失败静默忽略（隐私模式）。
 * 返回 [值, 设置值, 删除键]，删除用于「清除密钥」这类需要真正移除条目的场景。
 */
export function useLocalStorage<T>(
  key: string,
  initial: T,
): [T, (value: T | ((previous: T) => T)) => void, () => void] {
  const [stored, setStored] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) {
        return initial;
      }
      return JSON.parse(raw) as T;
    } catch {
      return initial;
    }
  });

  const setValue = useCallback(
    (value: T | ((previous: T) => T)): void => {
      setStored((previous) => {
        const next = typeof value === 'function' ? (value as (previous: T) => T)(previous) : value;
        try {
          window.localStorage.setItem(key, JSON.stringify(next));
        } catch {
          // 存储不可用时只保留内存态
        }
        return next;
      });
    },
    [key],
  );

  const removeValue = useCallback((): void => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // 存储不可用时静默忽略
    }
    setStored(initial);
  }, [initial, key]);

  return [stored, setValue, removeValue];
}
