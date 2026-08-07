<template>
  <div v-if="banner === 'ios'" class="ios-banner">
    <span>
      📱 在 iPhone/iPad 上接收消息通知:请用 <b>Safari</b> 打开后点「分享」→「<b>添加到主屏幕</b>」,再从主屏幕图标打开并<b>允许通知</b>(iOS 仅支持 PWA 推送)
    </span>
    <button @click="dismissBanner('ios')">知道了</button>
  </div>
  <div v-else-if="banner === 'harmony'" class="ios-banner">
    <span>
      📱 华为/荣耀手机接收后台通知:请用<b>「华为浏览器」</b>打开本站点并「<b>添加到主屏幕</b>」(Chrome 在国内无法接收推送)
    </span>
    <button @click="dismissBanner('harmony')">知道了</button>
  </div>
  <router-view />
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import { useAuthStore } from './stores/auth.js';
import { setupPushSubscription, detectPushDevice } from './push.js';

const auth = useAuthStore();
const banner = ref('');

function dismissBanner(kind) {
  banner.value = '';
  localStorage.setItem(kind === 'ios' ? 'ios-push-hint' : 'harmony-push-hint', '1');
}

onMounted(() => {
  const { ios, harmonyPhone, huaweiBrowser, standalone } = detectPushDevice();
  // iOS 普通 Safari 标签页:PushManager 不可用,引导安装 PWA(一次性)
  if (ios && !standalone && !localStorage.getItem('ios-push-hint')) {
    banner.value = 'ios';
  }
  // 华为/荣耀手机 + 非华为浏览器:Chrome 端点走 FCM 国内不通,引导换华为浏览器(一次性)
  else if (harmonyPhone && !huaweiBrowser && !localStorage.getItem('harmony-push-hint')) {
    banner.value = 'harmony';
  }
  if (auth.isLoggedIn) setupPushSubscription();
  // 切换账号后重新登录:强制重新注册推送(浏览器端点是站点级唯一的,
  // 必须把 endpoint 归属改绑到新用户,否则新账号收不到推送)
  watch(
    () => auth.isLoggedIn,
    (v) => {
      if (v) setupPushSubscription(true);
    }
  );
});
</script>

<style scoped>
.ios-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1000;
  background: #fff7e6;
  color: #8a5b00;
  border-bottom: 1px solid #ffe0a3;
  font-size: 13px;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.ios-banner button {
  flex-shrink: 0;
  border: 1px solid #d9a441;
  background: var(--wx-white);
  color: #8a5b00;
  border-radius: 4px;
  padding: 4px 10px;
  font-size: 12px;
}
</style>
