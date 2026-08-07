<template>
  <div class="chat-layout">
    <!-- 会话列表(桌面端常驻;移动端选中会话后隐藏) -->
    <div class="chat-list-panel" :class="{ 'hide-mobile': activePeer }">
      <ConversationList
        :conversations="chat.conversations"
        :active-peer-id="chat.activePeerId"
        :online="chat.onlineUsers"
        @select="openConversation"
        @drop-file="handleDropFile"
      />
    </div>

    <!-- 聊天窗口(桌面端常驻,移动端覆盖) -->
    <div class="chat-main-panel" :class="{ 'hide-mobile': !activePeer }">
      <ChatWindow
        v-if="activePeer"
        :peer="activePeer"
        :messages="chat.messages[activePeer.peer_id] || []"
        :online="!!chat.onlineUsers[activePeer.peer_id]"
        :typing="isPeerTyping"
        :has-more="hasMore"
        @back="closeConversation"
        @load-more="loadMore"
      />
      <div v-else class="empty chat-placeholder">选择一个会话开始沟通</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ConversationList from '../components/ConversationList.vue';
import ChatWindow from '../components/ChatWindow.vue';
import { useChatStore } from '../stores/chat.js';
import { uploadDirect } from '../api/upload.js';

const chat = useChatStore();
const route = useRoute();
const router = useRouter();
const hasMore = ref(true);

const activePeer = computed(() =>
  chat.conversations.find((c) => c.peer_id === chat.activePeerId) || null
);
const isPeerTyping = computed(() => {
  if (!activePeer.value) return false;
  const ts = chat.typingUsers[activePeer.value.peer_id];
  return Boolean(ts && Date.now() - ts < 3000);
});

// 会话由 URL ?peer= 驱动:浏览器后退 / iOS 滑动返回会触发 popstate 自动关闭聊天
watch(
  () => route.query.peer,
  (peer) => {
    const pid = peer ? String(peer) : null;
    chat.activePeerId = pid;
    hasMore.value = true;
    if (pid) chat.openConversation(pid);
  },
  { immediate: true }
);

function openConversation(peerId) {
  // push 产生历史记录,便于返回手势/浏览器后退关闭
  router.push({ query: { ...route.query, peer: peerId } });
}

function closeConversation() {
  // 优先后退(配合 iOS 滑动返回);无可退历史时直接清除参数
  if (window.history.state?.back) router.back();
  else router.replace({ query: { ...route.query, peer: undefined } });
}

// 组件卸载(切换 tab / 路由离开)时清空活跃会话,列表页收到消息必须走刷新分支
onUnmounted(() => chat.closeConversation());

async function loadMore() {
  if (!activePeer.value) return;
  const msgs = chat.messages[activePeer.value.peer_id] || [];
  if (!msgs.length) return;
  const count = await chat.loadMore(activePeer.value.peer_id, msgs[0]);
  if (count === 0) hasMore.value = false;
}

/** 拖拽文件到会话项:上传并发送给对应联系人 */
async function handleDropFile(peerId, file) {
  if (!file) return;
  if (file.size > 50 * 1024 * 1024) return alert('文件不能超过 50MB');
  // 先打开该会话,再上传发送
  await chat.openConversation(peerId);
  router.push({ query: { ...route.query, peer: peerId } });
  try {
    const meta = await uploadDirect(file, () => {});
    await chat.sendFile(peerId, meta);
  } catch (err) {
    alert(err.message || '上传失败');
  }
}

onMounted(() => {
  chat.init();
});
</script>

<style scoped>
/* 桌面端:左列表常驻;移动端:选中会话后隐藏列表、未选时隐藏聊天窗 */
@media (max-width: 768px) {
  .chat-list-panel.hide-mobile,
  .chat-main-panel.hide-mobile {
    display: none;
  }
}
.chat-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}
</style>
