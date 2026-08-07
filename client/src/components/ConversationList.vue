<template>
  <div class="conv-list">
    <div
      v-for="c in conversations"
      :key="c.peer_id"
      class="conv-item"
      :class="{ active: c.peer_id === activePeerId, dragover: dragPeer === c.peer_id }"
      @click="$emit('select', c.peer_id)"
      @dragover.prevent="dragPeer = c.peer_id"
      @dragleave="dragPeer = null"
      @drop.prevent="onDrop(c, $event)"
    >
      <div class="avatar" :class="'role-' + c.role">
        {{ c.display_name.slice(0, 1) }}
        <span v-if="online[c.peer_id]" class="dot"></span>
      </div>
      <div class="conv-main">
        <div class="conv-top">
          <span class="conv-name">
            {{ c.display_name }}
            <span v-if="c.class_name" class="cls-tag">{{ shortClassName(c.class_name) }}</span>
          </span>
          <span class="conv-time">{{ fmtTime(c.last_at) }}</span>
        </div>
        <div class="conv-bottom">
          <span class="conv-last" :class="{ unread: c.unread }">
            {{ lastText(c) }}
          </span>
          <span v-if="c.unread" class="badge">{{ c.unread > 99 ? '99+' : c.unread }}</span>
        </div>
      </div>
    </div>
    <div v-if="!conversations.length" class="empty">暂无会话,加入班级后即可与班级大屏沟通</div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { shortClassName } from '../utils/format.js';
defineProps({
  conversations: { type: Array, default: () => [] },
  activePeerId: { type: String, default: null },
  online: { type: Object, default: () => ({}) },
});
const emit = defineEmits(['select', 'drop-file']);
const dragPeer = ref(null);

function onDrop(c, e) {
  dragPeer.value = null;
  const file = e.dataTransfer?.files?.[0];
  if (file) emit('drop-file', c.peer_id, file);
}

function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const pad = (n) => String(n).padStart(2, '0');
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (sameDay) return hm;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function lastText(c) {
  if (!c.last_msg_id) return '';
  if (c.last_type === 'file') {
    // 文件消息展示上传原始名称;已删除则持久显示「文件已删除」
    if (c.last_file_deleted) return '[文件已删除]';
    return `[文件] ${String(c.last_content || '').replace(/^\d{13}-[a-z0-9]{6}-/, '')}`;
  }
  return c.last_content || '';
}
</script>

<style scoped>
.conv-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  cursor: pointer;
  border-bottom: 1px solid var(--wx-border);
  transition: background 0.12s;
}
.conv-item:hover { background: var(--wx-hover); }
.conv-item.active { background: var(--wx-active); }
.conv-item.dragover { background: var(--wx-green); opacity: 0.85; }

.avatar {
  position: relative;
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

.dot {
  position: absolute;
  right: -1px;
  bottom: -1px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #31d700;
  border: 2px solid #fff;
}

.conv-main {
  flex: 1;
  min-width: 0;
}
.conv-top,
.conv-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.conv-name {
  font-size: 15px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;
  gap: 6px;
}
.cls-tag {
  font-size: 10px;
  color: var(--wx-green);
  border: 1px solid var(--wx-green);
  border-radius: 3px;
  padding: 0 4px;
  flex-shrink: 0;
}
.conv-time {
  font-size: 11px;
  color: var(--wx-text-light);
  flex-shrink: 0;
  margin-left: 8px;
}
.conv-last {
  font-size: 13px;
  color: var(--wx-text-light);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.conv-last.unread { color: var(--wx-text); }
.badge {
  background: #fa5151;
  color: #fff;
  font-size: 11px;
  min-width: 18px;
  height: 18px;
  line-height: 18px;
  border-radius: 9px;
  text-align: center;
  padding: 0 5px;
  flex-shrink: 0;
  margin-left: 6px;
}
</style>
