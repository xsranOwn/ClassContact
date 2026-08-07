<template>
  <div class="page-body">
    <div class="card profile">
      <div class="avatar" :class="'role-' + auth.user?.role">
        {{ (auth.user?.display_name || '?').slice(0, 1) }}
      </div>
      <div class="profile-name">{{ auth.user?.display_name }}</div>
      <div class="profile-sub">
        @{{ auth.user?.username }} · {{ ROLE_LABELS[auth.user?.role] }}
      </div>
      <button class="btn small ghost" style="margin-top: 8px" @click="rename">
        修改显示名
      </button>
      <button class="btn small ghost" style="margin-top: 6px" @click="changePwd">
        修改密码
      </button>
    </div>
    <div class="card">
      <div class="notify-row">
        <div class="notify-info">
          <div class="notify-title">消息通知</div>
          <div class="tip small">{{ pushStatusText }}</div>
        </div>
        <div class="notify-btns">
          <button v-if="pushStatus !== 'enabled'" class="btn small" :disabled="pushStatus === 'checking'" @click="enablePush">
            开启通知
          </button>
          <button class="btn small ghost" :disabled="sendingTest" @click="sendTest">
            {{ sendingTest ? '发送中…' : '发送测试通知' }}
          </button>
        </div>
        <span v-if="pushStatus === 'enabled'" class="status-on">已开启 ✓</span>
      </div>
    </div>
    <div class="card">
      <p class="tip">班级沟通系统</p>
      <p class="tip small">
        - 管理员可新建 C/A/B 账号并管理好友关系<br />
        - 班主任可创建班级、审核入班申请<br />
        - 教师与班级大屏实时沟通<br />
        - 文件通过 OneDrive 企业版存储
      </p>
    </div>
    <button class="btn danger logout" @click="logout">退出登录</button>
    <button class="btn small ghost logout" style="margin-top: 10px" @click="clearCache">
      清除本地缓存
    </button>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore, ROLE_LABELS } from '../stores/auth.js';
import { setupPushSubscription, getPushStatus } from '../push.js';

const router = useRouter();
const auth = useAuthStore();
const pushStatus = ref('checking');
const sendingTest = ref(false);

const pushStatusText = computed(
  () =>
    ({
      checking: '检查中…',
      enabled: '已开启,可接收消息通知',
      disabled: '未开启',
      unsupported: '当前浏览器/环境不支持网页通知',
      'ios-need-home': 'iOS 需先用 Safari「添加到主屏幕」后开启',
    })[pushStatus.value] || ''
);

async function checkPush() {
  pushStatus.value = await getPushStatus();
}

async function enablePush() {
  const r = await setupPushSubscription(true);
  if (r.ok) {
    pushStatus.value = 'enabled';
    alert('通知已开启');
  } else if (r.reason === 'ios-need-home') {
    pushStatus.value = 'ios-need-home';
    alert('请在 Safari 中点击「分享」→「添加到主屏幕」,再从主屏幕打开并允许通知');
  } else if (r.reason === 'unsupported') {
    pushStatus.value = 'unsupported';
  } else {
    alert(r.message || '开启失败,请检查浏览器通知权限');
  }
}

/** 发送一条测试推送(服务端经 APNs/FCM/WNS 投递) */
async function sendTest() {
  sendingTest.value = true;
  try {
    const res = await fetch('/api/push/test', {
      method: 'POST',
      headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || '发送失败');
    alert('测试通知已发送,请查看通知横幅(后台或锁屏更明显)');
  } catch (e) {
    alert(e.message);
  } finally {
    sendingTest.value = false;
  }
}

onMounted(checkPush);

function logout() {
  auth.logout();
  router.push('/login');
}

/** 修改自己的显示名(所有角色通用) */
async function rename() {
  const name = prompt('请输入新的显示名(1-20 个字符)', auth.user?.display_name || '');
  if (name === null) return;
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 20) return alert('显示名需为 1-20 个字符');
  try {
    await auth.updateDisplayName(trimmed);
    alert('显示名已更新');
  } catch (e) {
    alert(e.message || '修改失败');
  }
}

/** 修改自己的密码(所有角色通用) */
async function changePwd() {
  const oldPwd = prompt('请输入当前密码');
  if (oldPwd === null) return;
  const newPwd = prompt('请输入新密码(至少 6 位)');
  if (newPwd === null) return;
  if (newPwd.length < 6) return alert('新密码至少 6 位');
  try {
    await auth.changePassword(oldPwd, newPwd);
    alert('密码已修改,下次登录请使用新密码');
  } catch (e) {
    alert(e.message || '修改失败');
  }
}

/** 清除本地缓存(IndexedDB 消息/预览图 + 非 workbox 的 Cache Storage),保留登录态 */
async function clearCache() {
  if (!confirm('确认清除本地缓存?已下载的预览图和离线消息将被清除,下次打开时重新从服务器加载(不影响登录与服务器数据)')) return;
  const { clearAllCache } = await import('../utils/cache.js');
  await clearAllCache();
  alert('本地缓存已清除');
}
</script>

<style scoped>
.profile { text-align: center; }
.avatar {
  width: 64px;
  height: 64px;
  border-radius: 12px;
  background: #b2b2b2;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  margin: 0 auto 10px;
}
.avatar.role-teacher { background: #5aa9e6; }
.avatar.role-screen { background: #07c160; }
.avatar.role-head_teacher { background: #f5a623; }
.avatar.role-admin { background: #9b59b6; }
.profile-name { font-size: 18px; font-weight: 600; }
.profile-sub { font-size: 13px; color: var(--wx-text-light); margin-top: 4px; }
.tip { font-size: 14px; color: var(--wx-text-light); }
.tip.small { font-size: 12px; line-height: 1.8; margin-top: 8px; }
.notify-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}
.notify-info { flex: 1; }
.notify-btns { display: flex; gap: 6px; }
.notify-title { font-size: 15px; font-weight: 500; }
.notify-row .tip.small { margin-top: 2px; }
.status-on { color: var(--wx-green); font-size: 14px; }
.logout { width: 100%; padding: 11px; font-size: 15px; }
</style>
