// chatroom 自定义 Service Worker
// - 预缓存静态资源
// - Web Push:前台聚焦时不弹(避免打扰),后台/离线时弹系统通知
// - 通知点击:聚焦/打开应用
import { precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { NetworkOnly } from 'workbox-strategies';

precacheAndRoute(self.__WB_MANIFEST);
// 导航始终走网络(SPA fallback 由后端返回最新 index.html)
registerRoute(new NavigationRoute(new NetworkOnly()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data.json();
  } catch {
    /* 忽略非 JSON */
  }
  // 始终弹通知(含前台):保证 iOS/各平台「收得到」;
  // 消息本身仍会实时进入会话,通知仅作提醒
  event.waitUntil(
    self.registration.showNotification(data.title || '新消息', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'chat-' + (data.data?.from || ''),
      data: data.data || {},
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      if (list.length) {
        list[0].focus();
        return list[0].navigate('/');
      }
      return self.clients.openWindow('/');
    })
  );
});

// ============ PWA 系统分享接收(Web Share Target) ============
// 系统「分享到班级沟通」:POST multipart 到达 /share,
// 读取文本/文件存入 IndexedDB,再导航到前端 /share 页选择接收人。
const SHARE_DB = 'chatroom-share';
const SHARE_STORE = 'entries';

function openShareDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SHARE_DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(SHARE_STORE)) {
        req.result.createObjectStore(SHARE_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function putShareEntry(entry) {
  const db = await openShareDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SHARE_STORE, 'readwrite');
    tx.objectStore(SHARE_STORE).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function handleSharePost(request) {
  try {
    const formData = await request.formData();
    const title = String(formData.get('title') || '');
    const text = String(formData.get('text') || formData.get('url') || '');
    const files = (formData.getAll('files') || []).filter((f) => f instanceof File);
    await putShareEntry({
      id: Date.now(),
      title,
      text,
      files: files.map((f) => ({ name: f.name, type: f.type, size: f.size, blob: f })),
    });
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (list.length) {
      await list[0].focus();
      await list[0].navigate('/share');
    } else {
      await self.clients.openWindow('/share');
    }
    return Response.redirect('/share');
  } catch (err) {
    return Response.redirect('/share?error=1');
  }
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === 'POST' && url.origin === self.location.origin && url.pathname === '/share') {
    event.respondWith(handleSharePost(event.request));
  }
});
