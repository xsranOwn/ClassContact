<template>
  <div class="page-body">
    <!-- 班主任:C 创建班级(两种模式) -->
    <div v-if="auth.user?.role === 'head_teacher'" class="card">
      <h3 class="sec-title">创建班级</h3>
      <div class="mode-switch">
        <label><input type="radio" value="code" v-model="createMode" /> 按年级+班级号</label>
        <label><input type="radio" value="manual" v-model="createMode" /> 手动指定编号</label>
      </div>
      <form class="row-form" @submit.prevent="createClass">
        <template v-if="createMode === 'code'">
          <select v-model="newGrade" class="input">
            <option value="" disabled>选择年级</option>
            <option v-for="y in years" :key="y" :value="y">{{ y }}</option>
          </select>
          <input v-model="newClassNo" class="input" placeholder="班级号(如 15)" />
        </template>
        <template v-else>
          <input v-model="newCode" class="input" placeholder="班级编号(如 XX01,须唯一)" />
          <input v-model="newName" class="input" placeholder="班级名称" />
        </template>
        <button class="btn" :disabled="creating">{{ creating ? '创建中…' : '创建' }}</button>
      </form>
      <p v-if="createMode === 'code' && newGrade && newClassNo" class="preview">
        班级编号: <b>{{ newGrade }}{{ newClassNo }}</b>,名称:{{ newGrade }}级{{ newClassNo }}班
      </p>
      <p v-if="createdScreen" class="screen-hint">
        大屏账号已创建:用户名 <b>{{ createdScreen.username }}</b> 初始密码 <b>{{ createdScreen.password }}</b>(请妥善保存,可在下方重置)
      </p>
    </div>

    <!-- C/A/B:凭邀请码添加班级 -->
    <div v-if="auth.user?.role === 'head_teacher' || auth.user?.role === 'teacher' || auth.user?.role === 'screen'" class="card">
      <h3 class="sec-title">添加班级</h3>
      <form class="row-form" @submit.prevent="joinClass">
        <input v-model="inviteCode" class="input" placeholder="输入班主任提供的邀请码" required />
        <button class="btn" :disabled="joining">{{ joining ? '申请中…' : '申请加入' }}</button>
      </form>
    </div>

    <!-- 我的班级 -->
    <template v-for="cls in classes" :key="cls.id">
      <div class="card">
        <div class="cls-head">
          <span class="cls-name">{{ cls.name }}</span>
          <span v-if="cls.my_status" class="status-tag" :class="cls.my_status">
            {{ cls.my_status === 'approved' ? '已加入' : '待审核' }}
          </span>
          <span v-if="cls.owner_id === auth.user?.id" class="invite-code" @click="copyCode(cls)">
            {{ cls.invite_code }}
          </span>
          <button v-if="cls.owner_id === auth.user?.id" class="btn small danger" @click="deleteClass(cls)">删除班级</button>
        </div>

        <!-- 大屏账号(C owner 可见) -->
        <div v-if="cls.owner_id === auth.user?.id && cls.screen_username" class="screen-row">
          <span>大屏账号:<b>{{ cls.screen_username }}</b></span>
          <button class="btn small ghost" @click="resetScreen(cls)">重置密码</button>
        </div>

        <template v-if="cls.owner_id === auth.user?.id">
          <div v-if="pendingList(cls).length" class="apply-list">
            <div class="apply-title">待审核申请</div>
            <div class="apply-item" v-for="m in pendingList(cls)" :key="m.id">
              <span>{{ m.display_name }}({{ m.username }})</span>
              <span class="apply-actions">
                <button class="btn small" @click="review(cls, m, 'approve')">通过</button>
                <button class="btn small danger" @click="review(cls, m, 'reject')">拒绝</button>
              </span>
            </div>
          </div>
          <div class="member-list">
            <div class="apply-title">成员({{ cls.members ? approvedList(cls).length : 0 }})</div>
            <div v-if="cls.members" class="apply-item" v-for="m in approvedList(cls)" :key="m.id">
              <span>{{ m.display_name }}({{ m.username }}) · {{ ROLE_LABELS[m.role] }}</span>
              <button
                v-if="m.id !== auth.user?.id && m.role !== 'screen'"
                class="btn small ghost"
                @click="removeMember(cls, m)"
              >移除</button>
            </div>
          </div>
        </template>

        <p v-else-if="cls.owner_id === auth.user?.id" class="empty">暂无成员</p>
      </div>
    </template>

    <div v-if="!classes.length" class="empty">
      {{ auth.user?.role === 'head_teacher' ? '还没有班级,请先创建' : '还没有加入任何班级' }}
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { useAuthStore, ROLE_LABELS } from '../stores/auth.js';
import { http } from '../api/http.js';
import { getSocket } from '../api/socket.js';

const auth = useAuthStore();
const classes = ref([]);
const newName = ref('');
const newCode = ref('');
const newGrade = ref('');
const newClassNo = ref('');
const createMode = ref('code');
const years = ref([]);
const inviteCode = ref('');
const creating = ref(false);
const joining = ref(false);
const createdScreen = ref(null);

async function load() {
  const { classes: list } = await http.get('/classes/mine');
  for (const c of list) {
    if (c.owner_id === auth.user?.id) {
      try {
        const { members, screen } = await http.get(`/classes/${c.id}`);
        c.members = members;
        c.screen = screen;
      } catch {
        c.members = [];
      }
    }
  }
  classes.value = list;
}

async function createClass() {
  creating.value = true;
  try {
    const payload = { mode: createMode.value };
    if (createMode.value === 'code') {
      if (!newGrade.value || !newClassNo.value) return alert('请选择年级并填写班级号');
      payload.grade = Number(newGrade.value);
      payload.class_no = newClassNo.value;
    } else {
      if (!newName.value) return alert('请填写班级名称');
      payload.code = newCode.value || null;
      payload.name = newName.value;
    }
    const { class: cls, screen } = await http.post('/classes', payload);
    newName.value = '';
    newCode.value = '';
    newGrade.value = '';
    newClassNo.value = '';
    createdScreen.value = screen; // 一次性展示初始密码
    await load();
  } catch (e) {
    alert(e.message);
  } finally {
    creating.value = false;
  }
}

async function joinClass() {
  joining.value = true;
  try {
    await http.post('/classes/join', { invite_code: inviteCode.value });
    inviteCode.value = '';
    await load();
    alert('申请已提交,等待班主任审核');
  } catch (e) {
    alert(e.message);
  } finally {
    joining.value = false;
  }
}

async function review(cls, member, action) {
  try {
    await http.post(`/classes/${cls.id}/review`, { user_id: member.id, action });
    await load();
  } catch (e) {
    alert(e.message);
  }
}

async function removeMember(cls, member) {
  if (!confirm(`确认移除 ${member.display_name}?`)) return;
  try {
    await http.delete(`/classes/${cls.id}/members/${member.id}`);
    await load();
  } catch (e) {
    alert(e.message);
  }
}

async function resetScreen(cls) {
  const password = prompt(`输入大屏账号 ${cls.screen_username} 的新密码(至少6位)`);
  if (!password) return;
  try {
    await http.put(`/classes/${cls.id}/screen/password`, { password });
    alert('大屏密码已重置');
  } catch (e) {
    alert(e.message);
  }
}

async function deleteClass(cls) {
  if (!confirm(`确认删除班级「${cls.name}」?将同时删除该班大屏账号及其全部消息`)) return;
  try {
    await http.delete(`/classes/${cls.id}`);
    createdScreen.value = null;
    await load();
  } catch (e) {
    alert(e.message);
  }
}

function pendingList(cls) {
  return (cls.members || []).filter((m) => m.status === 'pending');
}
function approvedList(cls) {
  return (cls.members || []).filter((m) => m.status === 'approved');
}

function copyCode(cls) {
  navigator.clipboard?.writeText(cls.invite_code);
  alert(`邀请码 ${cls.invite_code} 已复制`);
}

let socket;
onMounted(() => {
  load();
  http.get('/settings/grade-years').then(({ years: list }) => (years.value = list)).catch(() => {});
  socket = getSocket();
  socket.on('class:members_changed', load);
});
onBeforeUnmount(() => {
  socket?.off('class:members_changed', load);
});
</script>

<style scoped>
.sec-title { font-size: 15px; margin-bottom: 10px; }
.row-form { display: flex; gap: 8px; }
.mode-switch {
  display: flex;
  gap: 16px;
  margin-bottom: 10px;
  font-size: 14px;
}
.mode-switch label { display: flex; align-items: center; gap: 4px; cursor: pointer; }
.preview { font-size: 13px; color: var(--wx-text-light); margin-top: 8px; }
.screen-hint {
  margin-top: 10px;
  font-size: 13px;
  color: #f5a623;
  background: rgba(245, 166, 35, 0.08);
  border-radius: 6px;
  padding: 8px 10px;
  line-height: 1.6;
}
.cls-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.cls-name { font-size: 16px; font-weight: 600; flex: 1; }
.status-tag { font-size: 12px; border-radius: 3px; padding: 2px 6px; }
.status-tag.approved { color: var(--wx-green); background: rgba(7, 193, 96, 0.1); }
.status-tag.pending { color: #f5a623; background: rgba(245, 166, 35, 0.12); }
.invite-code {
  font-size: 13px;
  color: var(--wx-green);
  cursor: pointer;
  border: 1px dashed var(--wx-green);
  padding: 2px 8px;
  border-radius: 4px;
}
.screen-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  font-size: 13px;
  color: var(--wx-text-light);
}
.screen-row b { color: var(--wx-text); }
.apply-list { margin-top: 10px; }
.apply-title { font-size: 13px; color: var(--wx-text-light); margin: 8px 0 6px; }
.apply-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
  border-bottom: 1px solid #f0f0f0;
  font-size: 14px;
}
.apply-actions { display: flex; gap: 6px; }
.member-list { margin-top: 4px; }
</style>
