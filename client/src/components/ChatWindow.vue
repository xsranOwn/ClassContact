<template>
  <div class="chat-window" @dragover.prevent @drop.prevent="onDrop">
    <header class="chat-header">
      <button class="back-btn" @click="$emit('back')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <div class="chat-title">
        <div>{{ peer?.display_name }}</div>
        <div class="chat-sub">
          <template v-if="peer?.class_name">{{ shortClassName(peer.class_name) }} · </template>
          {{ typing ? '正在输入…' : online ? '在线' : peer?.unread ? `未读 ${peer.unread}` : '' }}
        </div>
      </div>
    </header>

    <div ref="listRef" class="msg-list" @scroll="onScroll">
      <div v-if="hasMore" class="load-more" @click="$emit('load-more')">加载更早消息</div>
      <template v-for="(m, i) in messages" :key="m.id">
        <div v-if="showTime(i)" class="time-line">{{ fmtTime(m.created_at) }}</div>
        <div class="msg-row" :class="m.sender_id === me?.id ? 'self' : 'other'">
          <div class="bubble" :class="m.type === 'file' ? 'file' : ''">
        <template v-if="m.type === 'image'">
          <img
            v-if="previewUrl(m)"
            class="msg-img"
            :src="previewUrl(m)"
            :alt="stripStorePrefix(m.file_name)"
            @click="openPreview(m)"
          />
          <span v-else class="file-deleted">图片加载失败</span>
          <div class="file-actions">
            <template v-if="m.file_deleted">
              <span class="file-deleted">已删除</span>
            </template>
            <template v-else>
              <button class="file-dl" @click="downloadFile(m)">下载</button>
              <button class="file-del" @click="deleteFileMsg(m)">删除</button>
            </template>
          </div>
        </template>
        <template v-else-if="m.type === 'video'">
          <div v-if="previewUrl(m)" class="msg-video-wrap" @click="openPreview(m)">
            <video class="msg-video" :src="previewUrl(m)" controls preload="metadata" @click.stop />
          </div>
          <span v-else class="file-deleted">视频加载失败</span>
          <div class="file-actions">
            <template v-if="m.file_deleted">
              <span class="file-deleted">已删除</span>
            </template>
            <template v-else>
              <button class="file-dl" @click="downloadFile(m)">下载</button>
              <button class="file-del" @click="deleteFileMsg(m)">删除</button>
            </template>
          </div>
        </template>
        <template v-else-if="m.type === 'file'">
              <div class="file-card" @click="openPreview(m)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M13 2v7h7"/></svg>
                <div class="file-info">
                  <div class="file-name" :title="m.file_name">{{ stripStorePrefix(m.file_name) }}</div>
                  <div class="file-size">{{ fmtSize(m.file_size) }}</div>
                </div>
              </div>
              <div class="file-actions">
                <template v-if="m.file_deleted">
                  <span class="file-deleted">已删除</span>
                </template>
                <template v-else>
                  <button class="file-dl" @click="downloadFile(m)">下载</button>
                  <button class="file-del" @click="deleteFileMsg(m)">删除</button>
                </template>
              </div>
            </template>
            <template v-else>{{ m.content }}</template>
          </div>
          <span v-if="m.sender_id === me?.id && m.read_at" class="read-tick">已读</span>
        </div>
      </template>
      <div v-if="!messages.length" class="empty">开始和对方沟通吧</div>
    </div>

    <footer class="chat-input-bar">
      <label class="file-btn" title="发送文件">
        <input type="file" style="display: none" @change="onFile" />
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
      </label>
      <textarea
        v-model="draft"
        class="chat-input"
        rows="1"
        placeholder="输入消息…"
        @keydown.enter.exact.prevent="sendText"
        @input="onInput"
      ></textarea>
      <button class="btn small send-btn" :disabled="!draft.trim() || sending" @click="sendText">
        发送
      </button>
    </footer>

    <!-- 上传/下载进度 -->
    <div v-if="transfer" class="transfer-progress">
      <div class="transfer-row">
        <span class="up-name" :title="transfer.name">
          {{ transfer.kind === 'download' ? '下载 ' : '上传 ' }}{{ transfer.name }}
        </span>
        <span class="up-pct">{{ transfer.progress }}%</span>
        <button class="up-cancel" @click="cancelTransfer">取消</button>
      </div>
      <div class="up-bar"><div class="up-fill" :style="{ width: transfer.progress + '%' }"></div></div>
    </div>

    <!-- 图片/视频/文件 预览弹窗(带文件名 + 下载 + 删除) -->
    <div v-if="previewing" class="preview-modal" @click.self="closePreview">
      <div class="preview-panel">
        <div class="preview-head">
          <span class="preview-name" :title="previewing.file_name">{{ stripStorePrefix(previewing.file_name) }}</span>
          <button class="btn small ghost" @click="closePreview">✕</button>
        </div>
        <div class="preview-body">
          <img v-if="previewing.type === 'image' && previewUrl(previewing)" :src="previewUrl(previewing)" class="preview-media" />
          <video v-else-if="previewing.type === 'video' && previewUrl(previewing)" :src="previewUrl(previewing)" controls autoplay class="preview-media" />
          <div v-else class="preview-empty">该类型暂不支持在线预览,请下载查看</div>
        </div>
        <div class="preview-actions">
          <template v-if="previewing.file_deleted">
            <span class="file-deleted">已删除</span>
          </template>
          <template v-else>
            <button class="btn small" @click="downloadFile(previewing)">下载</button>
            <button class="btn small danger" @click="deleteFileMsg(previewing)">删除</button>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { useAuthStore } from '../stores/auth.js';
import { useChatStore } from '../stores/chat.js';
import { uploadDirect } from '../api/upload.js';
import { cacheBlob, getCachedBlob } from '../utils/cache.js';
import { shortClassName } from '../utils/format.js';

const props = defineProps({
  peer: { type: Object, default: null },
  messages: { type: Array, default: () => [] },
  online: { type: Boolean, default: false },
  typing: { type: Boolean, default: false },
  hasMore: { type: Boolean, default: false },
});
const emit = defineEmits(['back', 'load-more']);

const auth = useAuthStore();
const chat = useChatStore();
const me = computed(() => auth.user);
const draft = ref('');
const sending = ref(false);
const transfer = ref(null); // { name, progress, kind: upload|download, abort: AbortController, uploadUrl? }
const listRef = ref(null);
let typingTimer = null;

// 图片/视频预览缓存(fetch 带 token 拿 blob → objectURL)
const previewCache = reactive({});
const previewing = ref(null); // 当前预览弹窗的消息
function previewUrl(m) {
  return previewCache[m.id] || '';
}
async function loadPreview(m) {
  if (previewCache[m.id] || m.file_deleted || !m.file_url) return;
  const id = (m.file_url || '').replace('graph:', '');
  // 1) 优先读 IndexedDB 缓存(刷新/离线不重拉)
  try {
    const hit = await getCachedBlob(m.id);
    if (hit?.blob) {
      previewCache[m.id] = URL.createObjectURL(hit.blob);
      return;
    }
  } catch {
    /* 继续走网络 */
  }
  // 2) 拉取后写入 IndexedDB
  try {
    const res = await fetch(`/api/files/download/${id}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
    });
    if (!res.ok) return;
    const blob = await res.blob();
    previewCache[m.id] = URL.createObjectURL(blob);
    cacheBlob(m.id, blob, blob.type);
  } catch {
    /* 预览失败忽略 */
  }
}
/** 打开预览弹窗(图片/视频/文件统一) */
function openPreview(m) {
  if (m.type === 'image' || m.type === 'video') loadPreview(m);
  previewing.value = m;
}
function closePreview() {
  previewing.value = null;
}
// 消息列表变化时,为图片/视频消息加载预览
watch(
  () => props.messages,
  (list) => {
    (list || []).forEach((m) => {
      if (m.type === 'image' || m.type === 'video') loadPreview(m);
    });
  },
  { immediate: true, deep: true }
);

// iOS 键盘呼出适配:键盘弹出时底部安全区留白归零(原提示线位置由键盘占据)
let kbCleanup = null;
onMounted(() => {
  const vv = window.visualViewport;
  if (vv) {
    const onVp = () => {
      const kbOpen = vv.height < window.innerHeight - 60;
      document.documentElement.style.setProperty(
        '--kb-inset',
        kbOpen ? '0px' : 'env(safe-area-inset-bottom)'
      );
    };
    onVp();
    vv.addEventListener('resize', onVp);
    kbCleanup = () => vv.removeEventListener('resize', onVp);
  }
});
onBeforeUnmount(() => kbCleanup?.());

watch(
  () => props.messages.length,
  async () => {
    await nextTick();
    const el = listRef.value;
    if (el) el.scrollTop = el.scrollHeight;
  },
  { flush: 'post', immediate: true } // immediate:初始加载也滚动到最新消息(底部)
);

function showTime(i) {
  if (i === 0) return true;
  const a = new Date(props.messages[i - 1].created_at).getTime();
  const b = new Date(props.messages[i].created_at).getTime();
  return b - a > 5 * 60 * 1000; // 5 分钟
}

function fmtTime(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtSize(n) {
  if (!n) return '';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}

/** 剥离历史消息的「时间戳-随机-」存储前缀,展示上传原始名称 */
function stripStorePrefix(name) {
  return String(name || '').replace(/^\d{13}-[a-z0-9]{6}-/, '');
}

/** 取消当前上传/下载;上传时同时清理 OneDrive 上传会话 */
function cancelTransfer() {
  if (!transfer.value) return;
  if (transfer.value.kind === 'upload' && transfer.value.uploadUrl) {
    fetch(transfer.value.uploadUrl, { method: 'DELETE' }).catch(() => {});
  }
  transfer.value.abort?.abort();
  transfer.value = null;
}

/** 鉴权下载:流式读取带进度,可取消;完成后保存为原文件名 */
async function downloadFile(m) {
  const id = (m.file_url || '').replace('graph:', '');
  const abort = new AbortController();
  transfer.value = { name: stripStorePrefix(m.file_name) || 'file', progress: 0, kind: 'download', abort };
  try {
    const res = await fetch(`/api/files/download/${id}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
      signal: abort.signal,
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      if (res.status === 404) m.file_deleted = 1; // OneDrive 文件丢失,同步标记
      throw new Error(j.error || '下载失败');
    }
    const total = Number(res.headers.get('content-length')) || 0;
    const reader = res.body.getReader();
    const chunks = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      if (total && transfer.value) transfer.value.progress = Math.round((received / total) * 100);
    }
    const blob = new Blob(chunks);
    if (transfer.value) transfer.value.progress = 100;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = stripStorePrefix(m.file_name) || 'file';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    if (e.name !== 'AbortError') alert(e.message);
  } finally {
    if (transfer.value?.kind === 'download') transfer.value = null;
  }
}

/** 删除文件消息(发送者/接收者均可):标记已删除,双方不可再下载 */
async function deleteFileMsg(m) {
  if (!confirm(`确认删除文件「${stripStorePrefix(m.file_name)}」?删除后收发双方均无法下载`)) return;
  try {
    const res = await fetch(`/api/messages/${m.id}/file`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || '删除失败');
    m.file_deleted = 1; // 本地即时标记为已删除
    if (previewing.value === m) previewing.value = null; // 弹窗中删除则关闭
  } catch (e) {
    alert(e.message);
  }
}

async function sendText() {
  const content = draft.value.trim();
  if (!content || sending.value) return;
  sending.value = true;
  try {
    await chat.sendText(props.peer.peer_id, content);
    draft.value = '';
  } catch (e) {
    alert(e.message);
  } finally {
    sending.value = false;
  }
}

/** 上传并发送(选文件与拖拽共用);按 MIME 自动生成 image/video/file 类型 */
async function uploadAndSend(file) {
  if (!file) return;
  if (file.size > 50 * 1024 * 1024) return alert('文件不能超过 50MB');
  const abort = new AbortController();
  transfer.value = { name: file.name, progress: 0, kind: 'upload', abort, uploadUrl: null };
  try {
    const meta = await uploadDirect(
      file,
      (p) => {
        if (transfer.value) transfer.value.progress = p;
      },
      abort.signal
    );
    await chat.sendFile(props.peer.peer_id, meta);
  } catch (err) {
    if (err.name !== 'AbortError') alert(err.message);
  } finally {
    transfer.value = null;
  }
}

function onFile(e) {
  const file = e.target.files?.[0];
  e.target.value = '';
  uploadAndSend(file);
}

/** 拖拽文件到聊天区:直接上传给当前联系人 */
function onDrop(e) {
  const file = e.dataTransfer?.files?.[0];
  uploadAndSend(file);
}

function onInput() {
  chat.sendTyping(props.peer.peer_id, true);
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => chat.sendTyping(props.peer.peer_id, false), 1500);
}

function onScroll() {
  const el = listRef.value;
  if (el && el.scrollTop < 30) emit('load-more');
}
</script>

<style scoped>
.chat-window {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--wx-bg);
}
.chat-header {
  background: var(--wx-surface);
  padding: 10px 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  border-bottom: 1px solid var(--wx-border);
  flex-shrink: 0;
}
.back-btn {
  display: none;
  border: none;
  background: none;
  width: 32px;
  height: 32px;
  color: var(--wx-text);
}
.chat-title { font-size: 16px; font-weight: 600; }
.chat-sub { font-size: 12px; font-weight: 400; color: var(--wx-text-light); }

.msg-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.load-more {
  text-align: center;
  color: var(--wx-green);
  font-size: 13px;
  cursor: pointer;
  padding: 4px;
}
.time-line {
  text-align: center;
  font-size: 11px;
  color: var(--wx-text-light);
  margin: 4px 0;
}
.msg-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}
.msg-row.self { justify-content: flex-end; }
.bubble {
  max-width: 70%;
  padding: 9px 12px;
  border-radius: 8px;
  font-size: 15px;
  line-height: 1.45;
  word-break: break-word;
  white-space: pre-wrap;
}
.other .bubble { background: var(--wx-bubble-other); border-top-left-radius: 2px; }
.self .bubble { background: var(--wx-bubble-self); border-top-right-radius: 2px; }
.read-tick { font-size: 10px; color: var(--wx-text-light); align-self: flex-end; }

.msg-img {
  max-width: 220px;
  max-height: 220px;
  border-radius: 8px;
  display: block;
  cursor: zoom-in;
  object-fit: cover;
}
.msg-video {
  max-width: 240px;
  max-height: 240px;
  border-radius: 8px;
  display: block;
  background: #000;
}
.file-card {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 200px;
}
.file-card svg { width: 36px; height: 36px; color: var(--wx-green); flex-shrink: 0; }
.file-info { min-width: 0; }
.file-name {
  font-size: 14px;
  max-width: 180px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.file-size { font-size: 12px; color: var(--wx-text-light); }
.file-dl {
  display: inline-block;
  margin-top: 6px;
  font-size: 13px;
  color: var(--wx-green);
  text-decoration: none;
}
.file-actions {
  display: flex;
  gap: 8px;
  margin-top: 6px;
  font-size: 13px;
}
.file-actions .file-dl {
  margin-top: 0;
  border: none;
  background: none;
  color: var(--wx-green);
  padding: 0;
  cursor: pointer;
}
.file-del {
  border: none;
  background: none;
  color: #fa5151;
  padding: 0;
  cursor: pointer;
  font-size: 13px;
}
.file-deleted {
  color: var(--wx-text-light);
  font-size: 13px;
}

.chat-input-bar {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 8px 10px calc(8px + var(--kb-inset, env(safe-area-inset-bottom))); /* iOS 手势条安全区;键盘弹出时由 --kb-inset 归零 */
  background: var(--wx-surface);
}
.file-btn {
  color: var(--wx-text);
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.file-btn svg { width: 22px; height: 22px; }
.chat-input {
  flex: 1;
  border: none;
  border-radius: 6px;
  background: var(--wx-input-bg);
  color: var(--wx-text);
  padding: 8px 10px;
  font-size: 15px;
  resize: none;
  max-height: 96px;
}
.send-btn { flex-shrink: 0; }

/* 上传/下载进度条 */
.transfer-progress {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 12px calc(6px + var(--kb-inset, env(safe-area-inset-bottom))); /* iOS 提示线安全区 */
  background: var(--wx-surface);
  border-top: 1px solid var(--wx-border);
  font-size: 12px;
}
.transfer-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.up-name {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--wx-text);
}
.up-pct {
  color: var(--wx-text-light);
}
.up-cancel {
  border: none;
  background: none;
  color: var(--wx-danger);
  padding: 0;
  cursor: pointer;
  font-size: 12px;
}
.up-bar {
  height: 6px;
  background: var(--wx-border);
  border-radius: 3px;
  overflow: hidden;
}
.up-fill {
  height: 100%;
  background: var(--wx-green);
  transition: width 0.2s;
}

@media (max-width: 768px) {
  .back-btn { display: block; }
}

/* 预览弹窗 */
.preview-modal {
  position: fixed;
  inset: 0;
  z-index: 300;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.preview-panel {
  display: flex;
  flex-direction: column;
  max-width: 92vw;
  max-height: 88vh;
  background: var(--wx-surface, #fff);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
}
.preview-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--wx-border, #eee);
}
.preview-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--wx-text, #111);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.preview-body {
  flex: 1;
  min-height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
  overflow: auto;
}
.preview-media {
  max-width: 100%;
  max-height: 62vh;
  display: block;
}
.preview-empty {
  color: #999;
  font-size: 14px;
  padding: 40px 20px;
}
.preview-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 10px 14px;
  border-top: 1px solid var(--wx-border, #eee);
}
.msg-video-wrap { display: block; line-height: 0; }
</style>
