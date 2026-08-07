// IndexedDB 持久缓存(chat-cache):
//  - messages:按 peerId 存最近会话消息(含 file_deleted 等字段),实现「已删除」标签与文字消息本地持久、离线可读
//  - blobs:按消息 id 存图片/视频 Blob,刷新/离线不再重新拉取
//  - clearAllCache():清除本地缓存(不动登录态),供「我的 → 清除本地缓存」调用
const DB_NAME = 'chat-cache';
const DB_VERSION = 1;
const MSG_STORE = 'messages';
const BLOB_STORE = 'blobs';
const MAX_MESSAGES_PER_PEER = 200;

let dbPromise = null;

function openDB() {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB 不可用'));
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(MSG_STORE)) {
        db.createObjectStore(MSG_STORE, { keyPath: 'peerId' });
      }
      if (!db.objectStoreNames.contains(BLOB_STORE)) {
        db.createObjectStore(BLOB_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function store(storeName, mode) {
  return openDB().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

/** 缓存某会话的消息列表(保留最近 MAX_MESSAGES_PER_PEER 条) */
export async function cacheMessages(peerId, messages) {
  try {
    const list = (messages || []).slice(-MAX_MESSAGES_PER_PEER);
    const s = await store(MSG_STORE, 'readwrite');
    s.put({ peerId, messages: list, cachedAt: Date.now() });
  } catch {
    /* 缓存失败不影响主流程 */
  }
}

/** 读取某会话的缓存消息(无则返回 null) */
export async function getCachedMessages(peerId) {
  try {
    const s = await store(MSG_STORE, 'readonly');
    return await new Promise((resolve) => {
      const req = s.get(peerId);
      req.onsuccess = () => resolve(req.result?.messages || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/** 更新缓存中某条消息的字段(如 file_deleted),不存在则忽略 */
export async function patchCachedMessage(peerId, messageId, patch) {
  try {
    const s = await store(MSG_STORE, 'readwrite');
    await new Promise((resolve) => {
      const req = s.get(peerId);
      req.onsuccess = () => {
        const row = req.result;
        if (row?.messages?.length) {
          const m = row.messages.find((x) => x.id === messageId);
          if (m) Object.assign(m, patch);
        }
        s.put(row || { peerId, messages: [], cachedAt: Date.now() });
        resolve();
      };
      req.onerror = () => resolve();
    });
  } catch {
    /* ignore */
  }
}

/** 缓存预览 Blob(图片/视频) */
export async function cacheBlob(messageId, blob, mime) {
  try {
    const s = await store(BLOB_STORE, 'readwrite');
    s.put({ id: messageId, blob, mime: mime || blob.type || 'application/octet-stream' });
  } catch {
    /* ignore */
  }
}

/** 读取缓存 Blob(无则返回 null) */
export async function getCachedBlob(messageId) {
  try {
    const s = await store(BLOB_STORE, 'readonly');
    return await new Promise((resolve) => {
      const req = s.get(messageId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/** 清空本地缓存(IndexedDB + Cache Storage),保留登录态 */
export async function clearAllCache() {
  try {
    await new Promise((resolve) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
    dbPromise = null;
  } catch {
    /* ignore */
  }
  try {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => !k.includes('workbox')).map((k) => caches.delete(k)));
  } catch {
    /* ignore */
  }
}
