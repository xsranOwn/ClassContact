<template>
  <div class="share-page">
    <header class="share-header">
      <h2>分享到</h2>
      <p class="hint">选择接收人(文本将直接发送,文件会上传后发送)</p>
    </header>

    <!-- 分享内容预览 -->
    <section v-if="text || files.length" class="share-preview">
      <p v-if="text" class="preview-text">{{ text }}</p>
      <ul v-if="files.length" class="preview-files">
        <li v-for="(f, i) in files" :key="i">
          <span class="file-icon">📄</span>
          <span class="file-name">{{ f.name }}</span>
          <span class="file-size">{{ fmtSize(f.size) }}</span>
        </li>
      </ul>
    </section>
    <p v-else class="hint">没有可分享的内容(分享失败或为空)</p>

    <!-- 接收人列表 -->
    <ul class="peer-list">
      <li v-for="c in chat.conversations" :key="c.peer_id" @click="sendTo(c)" class="peer-item">
        <div class="peer-avatar">{{ avatarText(c) }}</div>
        <div class="peer-info">
          <div class="peer-name">{{ c.display_name || c.username }}</div>
          <div class="peer-sub">{{ c.class_name }}</div>
        </div>
      </li>
    </ul>

    <!-- 上传进度 -->
    <div v-if="sending" class="sending-bar">
      <div class="bar" :style="{ width: progress + '%' }"></div>
      <span>{{ sending === 'upload' ? `上传中 ${progress}%` : '发送中…' }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useChatStore } from '../stores/chat.js';
import { uploadDirect } from '../utils/upload.js';

const router = useRouter();
const chat = useChatStore();

const text = ref('');
const files = ref([]); // { name, type, size, blob }
const sending = ref(null); // null | 'upload' | 'send'
const progress = ref(0);

const SHARE_DB = 'chatroom-share';
const SHARE_STORE = 'entries';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SHARE_DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(SHARE_STORE)) req.result.createObjectStore(SHARE_STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAllEntries() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SHARE_STORE, 'readonly');
    const req = tx.objectStore(SHARE_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function clearEntries(ids) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SHARE_STORE, 'readwrite');
    const store = tx.objectStore(SHARE_STORE);
    ids.forEach((id) => store.delete(id));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

onMounted(async () => {
  if (!chat.initialized) chat.init();
  // 1) 优先取 SW 存入 IndexedDB 的分享(POST 文件/文本)
  const entries = await getAllEntries().catch(() => []);
  if (entries.length) {
    const e = entries[entries.length - 1];
    text.value = e.text || '';
    files.value = e.files || [];
    return;
  }
  // 2) GET 分享(文本/URL,直接进 query)
  const q = new URLSearchParams(window.location.search);
  text.value = q.get('text') || q.get('url') || q.get('title') || '';
});

function fmtSize(n) {
  if (!n && n !== 0) return '';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / (1024 * 1024)).toFixed(1) + ' MB';
}

function avatarText(c) {
  const s = c.display_name || c.username || '?';
  return s.slice(0, 1).toUpperCase();
}

async function sendTo(peer) {
  if (sending.value) return;
  try {
    if (text.value && files.value.length === 0) {
      sending.value = 'send';
      await chat.sendText(peer.peer_id, text.value);
    } else if (files.value.length) {
      for (const f of files.value) {
        sending.value = 'upload';
        progress.value = 0;
        const blob = f.blob instanceof Blob ? f.blob : new Blob([f.blob], { type: f.type });
        const file = new File([blob], f.name, { type: f.type });
        const meta = await uploadDirect(file, (p) => (progress.value = p));
        sending.value = 'send';
        await chat.sendFile(peer.peer_id, meta);
      }
    } else {
      alert('没有可分享的内容');
      return;
    }
    await clearEntries(
      (await getAllEntries()).map((e) => e.id)
    );
    router.replace('/chat');
  } catch (err) {
    alert('发送失败:' + (err.message || err));
    sending.value = null;
  }
}
</script>

<style scoped>
.share-page {
  max-width: 560px;
  margin: 0 auto;
  padding: 16px;
  height: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}
.share-header h2 { margin: 0 0 4px; font-size: 18px; color: var(--wx-text); }
.hint { font-size: 13px; color: var(--wx-sub); margin: 4px 0; }
.share-preview {
  background: var(--wx-card);
  border: 1px solid var(--wx-border);
  border-radius: 10px;
  padding: 10px 12px;
  margin: 12px 0;
}
.preview-text { font-size: 14px; color: var(--wx-text); margin: 0; word-break: break-all; }
.preview-files { list-style: none; margin: 0; padding: 0; }
.preview-files li { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 14px; }
.file-icon { font-size: 18px; }
.file-name { flex: 1; color: var(--wx-text); word-break: break-all; }
.file-size { color: var(--wx-sub); font-size: 12px; }
.peer-list { list-style: none; margin: 8px 0 0; padding: 0; flex: 1; overflow-y: auto; }
.peer-item {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 8px; border-radius: 8px; cursor: pointer;
}
.peer-item:hover { background: var(--wx-hover); }
.peer-avatar {
  width: 40px; height: 40px; border-radius: 8px;
  background: var(--wx-brand); color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 18px; flex-shrink: 0;
}
.peer-name { font-size: 15px; color: var(--wx-text); }
.peer-sub { font-size: 12px; color: var(--wx-sub); }
.sending-bar { display: flex; align-items: center; gap: 8px; padding: 8px 4px; font-size: 13px; color: var(--wx-sub); }
.sending-bar .bar { flex: 1; height: 6px; background: var(--wx-border); border-radius: 3px; overflow: hidden; }
</style>
