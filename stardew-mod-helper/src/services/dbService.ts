/** 【v4 R49/Q1】IndexedDB 薄封装：mods / meta / cloudMods 三个 store，原生 API，零新增依赖。 */
import { APP_CONFIG } from '../config';
import type { CloudModRef, GitHubSettings, LocalMod } from '../types/workspace';

const STORE_MODS = 'mods';
const STORE_META = 'meta';
const STORE_CLOUD = 'cloudMods';
/** 首版 schema 版本；写入 meta（永不含 token）。 */
export const SCHEMA_VERSION = 4;

let dbPromise: Promise<IDBDatabase> | null = null;

/** 打开（必要时建库）数据库；stores: mods(keyPath id) / meta(keyPath key) / cloudMods(keyPath folderName)。 */
export function openDB(): Promise<IDBDatabase> {
  if (dbPromise) {
    return dbPromise;
  }
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('当前环境不支持 IndexedDB'));
      return;
    }
    const request = indexedDB.open(APP_CONFIG.db.name, APP_CONFIG.db.version);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_MODS)) {
        db.createObjectStore(STORE_MODS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORE_CLOUD)) {
        db.createObjectStore(STORE_CLOUD, { keyPath: 'folderName' });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error('无法打开本地数据库'));
    request.onblocked = () => reject(new Error('本地数据库被其他页面占用'));
  }).catch((error: unknown) => {
    dbPromise = null;
    throw error;
  });
  return dbPromise;
}

function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        let request: IDBRequest<T>;
        try {
          const transaction = db.transaction(storeName, mode);
          request = run(transaction.objectStore(storeName));
        } catch (error) {
          reject(error);
          return;
        }
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('本地数据库操作失败'));
      }),
  );
}

/** 保存单个模组（含 fileTree 的 Blob，原生结构化克隆，绝不 JSON.stringify）。 */
export function saveMod(mod: LocalMod): Promise<void> {
  return withStore<IDBValidKey>(STORE_MODS, 'readwrite', (store) => store.put(mod)).then(
    () => undefined,
  );
}

/** 读取全部本地模组（顺序按 addedAt 由调用方排序）。 */
export async function loadAllMods(): Promise<LocalMod[]> {
  const mods = await withStore<LocalMod[]>(STORE_MODS, 'readonly', (store) => store.getAll());
  return Array.isArray(mods) ? mods : [];
}

/** 删除单个模组。 */
export function deleteMod(id: string): Promise<void> {
  return withStore<undefined>(STORE_MODS, 'readwrite', (store) =>
    store.delete(id) as IDBRequest<undefined>,
  ).then(() => undefined);
}

/** 清空本地库：clear(mods) + clear(cloudMods)；meta 按参数决定是否清。 */
export async function clearAll(includeMeta = false): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    try {
      const names = includeMeta ? [STORE_MODS, STORE_CLOUD, STORE_META] : [STORE_MODS, STORE_CLOUD];
      const transaction = db.transaction(names, 'readwrite');
      for (const name of names) {
        transaction.objectStore(name).clear();
      }
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('清空本地库失败'));
      transaction.onabort = () => reject(transaction.error ?? new Error('清空本地库失败'));
    } catch (error) {
      reject(error);
    }
  });
}

/** 保存 meta：selectedPackIds / github 设置（无 token）/ cloudMods / schemaVersion。 */
export function saveMeta(key: string, value: unknown): Promise<void> {
  return withStore<IDBValidKey>(STORE_META, 'readwrite', (store) => store.put({ key, value })).then(
    () => undefined,
  );
}

/** 读取 meta；不存在返回 undefined。 */
export async function loadMeta<T>(key: string): Promise<T | undefined> {
  const record = await withStore<{ key: string; value: T } | undefined>(STORE_META, 'readonly', (store) =>
    store.get(key),
  );
  return record?.value;
}

/** 云端模组快照缓存（加速分段②/③展示，可缺省）。 */
export function saveCloudMod(ref: CloudModRef): Promise<void> {
  return withStore<IDBValidKey>(STORE_CLOUD, 'readwrite', (store) => store.put(ref)).then(
    () => undefined,
  );
}

/** 读取全部云端模组快照。 */
export async function loadAllCloudMods(): Promise<CloudModRef[]> {
  const refs = await withStore<CloudModRef[]>(STORE_CLOUD, 'readonly', (store) => store.getAll());
  return Array.isArray(refs) ? refs : [];
}

/** 便捷读取无 token 的 GitHub 设置（调用方负责兜底默认值）。 */
export function loadGitHubSettings(): Promise<GitHubSettings | undefined> {
  return loadMeta<GitHubSettings>('github');
}
