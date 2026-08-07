<template>
  <div class="page-body">
    <!-- 次 tab 已提升到主 tabbar(路由驱动) -->

    <!-- ============ 账号管理 ============ -->
    <template v-if="tab === 'users'">
      <div class="card">
        <h3 class="sec-title">新建账号</h3>
        <div class="form-grid">
          <input v-model="form.username" class="input" placeholder="用户名(3-32位字母数字下划线)" />
          <input v-model="form.password" class="input" type="password" placeholder="初始密码(至少6位)" />
          <input v-model="form.display_name" class="input" placeholder="显示名称" />
          <select v-model="form.role" class="input">
            <option value="c">班主任</option>
            <option value="a">教师</option>
          </select>
        </div>
        <button class="btn" style="margin-top: 10px" :disabled="creating" @click="createUser">
          {{ creating ? '创建中…' : '创建账号' }}
        </button>
      </div>

      <div class="card">
        <h3 class="sec-title">账号列表(可修改教师/班主任身份)</h3>
        <div class="filter-row">
          <select v-model="roleFilter" class="input" style="width: 160px" @change="loadUsers">
            <option value="">全部角色</option>
            <option value="c">班主任</option>
            <option value="a">教师</option>
            <option value="admin">管理员</option>
          </select>
        </div>
        <div class="user-row" v-for="u in users" :key="u.id">
          <div class="avatar" :class="'role-' + u.role">{{ u.display_name.slice(0, 1) }}</div>
          <div class="user-main">
            <div>{{ u.display_name }} <span class="role-tag">{{ ROLE_LABELS[u.role] }}</span></div>
            <div class="user-sub">@{{ u.username }}</div>
          </div>
          <div class="user-actions">
            <template v-if="u.role === 'teacher' || u.role === 'head_teacher'">
              <button class="btn small ghost" @click="switchRole(u, u.role === 'teacher' ? 'head_teacher' : 'teacher')">
                设为{{ u.role === 'teacher' ? '班主任' : '教师' }}
              </button>
            </template>
            <button class="btn small ghost" @click="resetPassword(u)">重置密码</button>
            <button v-if="u.id !== auth.user?.id" class="btn small danger" @click="deleteUser(u)">
              删除
            </button>
          </div>
        </div>
        <div v-if="!users.length" class="empty">暂无用户</div>
      </div>
    </template>

    <!-- ============ 班级管理 ============ -->
    <template v-else-if="tab === 'classes'">
      <div class="card">
        <h3 class="sec-title">新建班级</h3>
        <div class="mode-switch">
          <label><input type="radio" value="code" v-model="classForm.mode" /> 按年级+班级号</label>
          <label><input type="radio" value="manual" v-model="classForm.mode" /> 手动指定编号与名称</label>
        </div>

        <div v-if="classForm.mode === 'code'" class="form-grid">
          <select v-model="classForm.grade" class="input">
            <option value="" disabled>选择年级</option>
            <option v-for="y in years" :key="y" :value="y">{{ y }}</option>
          </select>
          <input v-model="classForm.class_no" class="input" placeholder="班级编号(数字,如 15)" />
          <select v-model="classForm.owner_id" class="input">
            <option value="" disabled>选择班主任</option>
            <option v-for="c in masters" :key="c.id" :value="c.id">{{ c.display_name }}(@{{ c.username }})</option>
          </select>
        </div>
        <div v-else class="form-grid">
          <input v-model="classForm.code" class="input" placeholder="班级编号(如 XX01,须唯一)" />
          <input v-model="classForm.name" class="input" placeholder="班级名称" />
          <select v-model="classForm.owner_id" class="input">
            <option value="" disabled>选择班主任</option>
            <option v-for="c in masters" :key="c.id" :value="c.id">{{ c.display_name }}(@{{ c.username }})</option>
          </select>
        </div>
        <p v-if="classForm.mode === 'code' && classForm.grade && classForm.class_no" class="preview">
          班级编号: <b>{{ classForm.grade }}{{ classForm.class_no }}</b>,名称:{{ classForm.grade }}级{{ classForm.class_no }}班
        </p>
        <button class="btn" style="margin-top: 10px" :disabled="creating" @click="createClass">
          {{ creating ? '创建中…' : '创建班级' }}
        </button>
        <p v-if="createdScreen" class="screen-hint">
          大屏账号:用户名 <b>{{ createdScreen.username }}</b> 初始密码 <b>{{ createdScreen.password }}</b>
        </p>
        <!-- 年级范围(近 X 年)配置 -->
        <div class="years-config">
          <span class="tip small">年级范围(近 <b>X</b> 年):</span>
          <input
            v-model.number="yearsBack"
            type="number"
            min="1"
            max="30"
            class="input"
            style="width: 80px"
            placeholder="6"
          />
          <button class="btn small ghost" :disabled="savingYears" @click="saveYearsBack">
            {{ savingYears ? '保存中…' : '保存' }}
          </button>
        </div>
      </div>

      <div class="card">
        <h3 class="sec-title">班级列表(可修改班主任)</h3>
        <div class="user-row" v-for="cls in adminClasses" :key="cls.id">
          <div class="user-main">
            <div>
              <b>{{ cls.code || '-' }}</b> {{ cls.name }}
              <span class="cls-owner">班主任:{{ cls.owner_name }}</span>
            </div>
            <div class="user-sub">大屏:{{ cls.screen_username || '-' }} · 成员 {{ cls.member_count }} 人</div>
          </div>
          <div class="user-actions">
            <select v-model="ownerDraft[cls.id]" class="input" style="width: 150px">
              <option value="" disabled>改班主任…</option>
              <option v-for="c in masters" :key="c.id" :value="c.id">{{ c.display_name }}</option>
            </select>
            <button class="btn small ghost" @click="changeOwner(cls)">确认</button>
            <button class="btn small ghost" @click="resetScreenPassword(cls)">重置大屏密码</button>
            <button class="btn small danger" @click="deleteClass(cls)">删除班级</button>
          </div>
        </div>
        <div v-if="!adminClasses.length" class="empty">暂无班级</div>
      </div>
    </template>

    <!-- ============ 绑定管理 ============ -->
    <template v-else>
      <div class="card">
        <h3 class="sec-title">班级 ↔ 教师绑定</h3>
        <div class="mode-switch">
          <label><input type="radio" value="class" v-model="bindView" /> 班级绑定的老师</label>
          <label><input type="radio" value="teacher" v-model="bindView" /> 老师绑定的班级</label>
        </div>

        <div v-if="bindView === 'class'" class="row-form">
          <select v-model="bindClassId" class="input" @change="loadBindings">
            <option value="" disabled>选择班级</option>
            <option v-for="c in adminClasses" :key="c.id" :value="c.id">{{ c.code || c.name }} {{ c.name }}</option>
          </select>
          <select v-model="bindUserId" class="input">
            <option value="" disabled>添加教师…</option>
            <option v-for="t in teachers" :key="t.id" :value="t.id">{{ t.display_name }}(@{{ t.username }})</option>
          </select>
          <button class="btn" :disabled="!bindClassId || !bindUserId" @click="addBinding">添加</button>
        </div>
        <div v-else class="row-form">
          <select v-model="bindTeacherId" class="input" @change="loadBindings">
            <option value="" disabled>选择教师</option>
            <option v-for="t in teachers" :key="t.id" :value="t.id">{{ t.display_name }}(@{{ t.username }})</option>
          </select>
        </div>

        <div class="member-list" style="margin-top: 10px">
          <div class="apply-title" v-if="bindView === 'class'">该班绑定的教师</div>
          <div class="apply-title" v-else>该教师绑定的班级</div>
          <div class="apply-item" v-for="b in bindings" :key="b.id || b.key">
            <span>{{ bindView === 'class' ? b.display_name + '(' + b.username + ')' : b.code + ' ' + b.name }}</span>
            <button class="btn small danger" @click="removeBinding(b)">解除</button>
          </div>
          <div v-if="!bindings.length" class="empty">暂无绑定</div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore, ROLE_LABELS } from '../stores/auth.js';
import { http } from '../api/http.js';

const auth = useAuthStore();
const route = useRoute();
// 管理页次 tab 由主 tab 路由驱动(/admin/users | /admin/classes | /admin/bindings)
const tab = computed(() => route.params.tab || 'users');
const users = ref([]);
const allUsers = ref([]);
const adminClasses = ref([]);
const years = ref([]);
const yearsBack = ref(6);
const savingYears = ref(false);
const roleFilter = ref('');
const creating = ref(false);
const form = ref({ username: '', password: '', display_name: '', role: 'teacher' });
const classForm = reactive({ mode: 'code', grade: '', class_no: '', code: '', name: '', owner_id: '' });
const createdScreen = ref(null);
const ownerDraft = reactive({});
const bindView = ref('class');
const bindClassId = ref('');
const bindUserId = ref('');
const bindTeacherId = ref('');
const bindings = ref([]);

const masters = computed(() => allUsers.value.filter((u) => u.role === 'head_teacher'));
const teachers = computed(() => allUsers.value.filter((u) => u.role === 'teacher' || u.role === 'head_teacher'));

async function loadUsers() {
  const q = roleFilter.value ? `?role=${roleFilter.value}` : '';
  const { users: list } = await http.get(`/admin/users${q}`);
  users.value = list;
}
async function loadAll() {
  const { users: list } = await http.get('/admin/users');
  allUsers.value = list;
}
async function loadClasses() {
  const { classes } = await http.get('/admin/classes');
  adminClasses.value = classes;
}
async function loadYears() {
  const { years: list, years_back } = await http.get('/settings/grade-years');
  years.value = list;
  yearsBack.value = years_back;
}

async function saveYearsBack() {
  const back = Number(yearsBack.value);
  if (!back || back < 1 || back > 30) return alert('年级范围需为 1-30');
  savingYears.value = true;
  try {
    await http.put('/settings/years-back', { years_back: back });
    await loadYears();
    alert(`已保存:年级下拉显示近 ${back} 年`);
  } catch (e) {
    alert(e.message || '保存失败');
  } finally {
    savingYears.value = false;
  }
}

// 路由切换时加载对应数据
watch(
  tab,
  (t) => {
    if (t === 'classes') loadClassesAndAll();
    if (t === 'bindings') loadClassesAndAll();
    if (t === 'users') loadUsersAndAll();
  },
  { immediate: true }
);

async function loadClassesAndAll() {
  await Promise.all([loadClasses(), loadAll(), loadYears()]);
}
async function loadUsersAndAll() {
  await Promise.all([loadUsers(), loadAll()]);
}

async function createUser() {
  creating.value = true;
  try {
    await http.post('/admin/users', form.value);
    form.value = { username: '', password: '', display_name: '', role: 'teacher' };
    await Promise.all([loadUsers(), loadAll()]);
  } catch (e) {
    alert(e.message);
  } finally {
    creating.value = false;
  }
}

async function switchRole(u, role) {
  if (!confirm(`确认将 ${u.display_name} 设为${role === 'head_teacher' ? '班主任' : '教师'}?`)) return;
  try {
    await http.put(`/admin/users/${u.id}/role`, { role });
    await Promise.all([loadUsers(), loadAll()]);
  } catch (e) {
    alert(e.message);
  }
}

async function resetPassword(u) {
  const password = prompt(`输入 ${u.display_name} 的新密码(至少6位)`);
  if (!password) return;
  try {
    await http.put(`/admin/users/${u.id}/password`, { password });
    alert('密码已重置');
  } catch (e) {
    alert(e.message);
  }
}

async function deleteUser(u) {
  if (!confirm(`确认删除 ${u.display_name}?将同时清理其消息、班级关联`)) return;
  try {
    await http.delete(`/admin/users/${u.id}`);
    await Promise.all([loadUsers(), loadAll()]);
  } catch (e) {
    alert(e.message);
  }
}

async function createClass() {
  if (!classForm.owner_id) return alert('请选择班主任');
  creating.value = true;
  try {
    const payload = { mode: classForm.mode, owner_id: classForm.owner_id };
    if (classForm.mode === 'code') {
      payload.grade = Number(classForm.grade);
      payload.class_no = classForm.class_no;
    } else {
      payload.code = classForm.code;
      payload.name = classForm.name;
    }
    const { class: cls, screen } = await http.post('/admin/classes', payload);
    createdScreen.value = screen;
    classForm.grade = '';
    classForm.class_no = '';
    classForm.code = '';
    classForm.name = '';
    classForm.owner_id = '';
    await Promise.all([loadClasses(), loadAll()]);
    alert(`班级「${cls.name}」已创建`);
  } catch (e) {
    alert(e.message);
  } finally {
    creating.value = false;
  }
}

async function changeOwner(cls) {
  const ownerId = ownerDraft[cls.id];
  if (!ownerId) return alert('请选择新班主任');
  try {
    await http.put(`/admin/classes/${cls.id}/owner`, { owner_id: ownerId });
    alert('班主任已更换');
    await loadClasses();
  } catch (e) {
    alert(e.message);
  }
}

/** 重置该班级大屏账号密码 */
async function resetScreenPassword(cls) {
  const password = prompt(`输入班级「${cls.name}」大屏账号的新密码(至少6位)`);
  if (!password) return;
  try {
    await http.post(`/admin/classes/${cls.id}/screen/reset-password`, { password });
    alert(`大屏账号密码已重置(用户名:${cls.screen_username})`);
  } catch (e) {
    alert(e.message);
  }
}

/** 删除班级(自动删除该班大屏账号) */
async function deleteClass(cls) {
  if (!confirm(`确认删除班级「${cls.name}」?将同时删除其大屏账号、班级成员与关联消息`)) return;
  try {
    await http.post(`/admin/classes/${cls.id}/delete`);
    alert('班级已删除');
    await loadClasses();
  } catch (e) {
    alert(e.message);
  }
}

async function loadBindings() {
  try {
    if (bindView.value === 'class') {
      if (!bindClassId.value) return (bindings.value = []);
      const { bindings: list } = await http.get(`/admin/bindings?class_id=${bindClassId.value}`);
      bindings.value = list.map((b) => ({ ...b, key: 'u' + b.id }));
    } else {
      if (!bindTeacherId.value) return (bindings.value = []);
      const { bindings: list } = await http.get(`/admin/bindings?teacher_id=${bindTeacherId.value}`);
      bindings.value = list.map((b) => ({ ...b, key: 'c' + b.id }));
    }
  } catch (e) {
    alert(e.message);
  }
}

async function addBinding() {
  try {
    await http.post('/admin/bindings', { class_id: bindClassId.value, user_id: bindUserId.value });
    bindUserId.value = '';
    await loadBindings();
  } catch (e) {
    alert(e.message);
  }
}

async function removeBinding(b) {
  try {
    if (bindView.value === 'class') {
      await http.delete('/admin/bindings', { class_id: bindClassId.value, user_id: b.id });
    } else {
      // 教师视角:列表项 b.id 即班级 id
      await http.delete('/admin/bindings', { class_id: b.id, user_id: bindTeacherId.value });
    }
    await loadBindings();
  } catch (e) {
    alert(e.message);
  }
}

watch(bindView, () => {
  bindings.value = [];
});
</script>

<style scoped>
.tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.tabs button {
  flex: 1;
  border: none;
  background: var(--wx-white);
  padding: 10px;
  border-radius: 8px;
  font-size: 14px;
  color: var(--wx-text);
}
.tabs button.active {
  background: var(--wx-green);
  color: #fff;
}
.sec-title { font-size: 15px; margin-bottom: 10px; }
.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 8px;
}
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
.years-config {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dashed #eee;
}
.filter-row { margin-bottom: 8px; }
.user-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid #f0f0f0;
}
/* 手机端:头像/信息保持同行,操作区整体换到下一行,避免按钮挤压 */
@media (max-width: 768px) {
  .user-row { flex-wrap: wrap; }
  .user-actions { flex-wrap: wrap; width: 100%; justify-content: flex-start; margin-top: 4px; }
  .user-actions .input { width: 100% !important; }
}
.avatar {
  width: 38px;
  height: 38px;
  border-radius: 6px;
  background: #b2b2b2;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  flex-shrink: 0;
}
.avatar.role-teacher { background: #5aa9e6; }
.avatar.role-screen { background: #07c160; }
.avatar.role-head_teacher { background: #f5a623; }
.avatar.role-admin { background: #9b59b6; }
.user-main { flex: 1; font-size: 14px; min-width: 0; }
.user-sub { font-size: 12px; color: var(--wx-text-light); }
.user-actions { display: flex; gap: 6px; align-items: center; }
.role-tag {
  font-size: 11px;
  color: var(--wx-green);
  border: 1px solid var(--wx-green);
  border-radius: 3px;
  padding: 0 4px;
  margin-left: 6px;
}
.cls-owner { font-size: 12px; color: var(--wx-text-light); margin-left: 8px; }
.row-form { display: flex; gap: 8px; }
.row-form .input { flex: 1; }
.apply-title { font-size: 13px; color: var(--wx-text-light); margin: 8px 0 6px; }
.apply-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
  border-bottom: 1px solid #f0f0f0;
  font-size: 14px;
}
</style>
