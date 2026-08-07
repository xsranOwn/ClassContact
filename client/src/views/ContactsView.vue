<template>
  <div class="page-body">
    <p class="hint">好友关系由管理员统一配置</p>
    <div class="card friend-item" v-for="f in friends" :key="f.id" @click="goChat(f)">
      <div class="avatar" :class="'role-' + f.role">{{ f.display_name.slice(0, 1) }}</div>
      <div class="friend-main">
        <div class="friend-name">
          {{ f.display_name }}
          <span class="role-tag">{{ ROLE_LABELS[f.role] }}</span>
        </div>
        <div class="friend-sub">{{ online[f.id] ? '在线' : '离线' }}</div>
      </div>
      <button class="btn small ghost">发消息</button>
    </div>
    <div v-if="!friends.length" class="empty">暂无好友</div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { http } from '../api/http.js';
import { useChatStore } from '../stores/chat.js';
import { ROLE_LABELS } from '../stores/auth.js';

const router = useRouter();
const chat = useChatStore();
const friends = ref([]);
const online = computed(() => chat.onlineUsers);

function goChat(f) {
  chat.openConversation(f.id).then(() => router.push('/'));
}

onMounted(async () => {
  chat.init();
  const { friends: list } = await http.get('/users/friends');
  friends.value = list;
});
</script>

<style scoped>
.hint {
  font-size: 12px;
  color: var(--wx-text-light);
  margin-bottom: 10px;
}
.friend-item {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
}
.friend-item:hover { background: #fafafa; }
.avatar {
  width: 44px;
  height: 44px;
  border-radius: 6px;
  background: #b2b2b2;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  flex-shrink: 0;
}
.avatar.role-teacher { background: #5aa9e6; }
.avatar.role-screen { background: #07c160; }
.avatar.role-head_teacher { background: #f5a623; }
.avatar.role-admin { background: #9b59b6; }
.friend-main { flex: 1; min-width: 0; }
.friend-name { font-size: 15px; display: flex; align-items: center; gap: 8px; }
.role-tag {
  font-size: 11px;
  color: var(--wx-green);
  border: 1px solid var(--wx-green);
  border-radius: 3px;
  padding: 0 4px;
}
.friend-sub { font-size: 12px; color: var(--wx-text-light); }
</style>
