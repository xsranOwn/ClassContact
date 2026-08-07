<template>
  <div class="login-page">
    <div class="login-box">
      <div class="login-logo">班级沟通</div>
      <div class="login-sub">教师与大屏,随时在线</div>
      <form @submit.prevent="onSubmit">
        <input v-model="username" class="input" placeholder="用户名" autocomplete="username" />
        <input
          v-model="password"
          type="password"
          class="input"
          placeholder="密码"
          autocomplete="current-password"
          style="margin-top: 12px"
        />
        <p v-if="error" class="login-error">{{ error }}</p>
        <button class="btn login-btn" :disabled="loading">{{ loading ? '登录中…' : '登 录' }}</button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const username = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);

async function onSubmit() {
  error.value = '';
  loading.value = true;
  try {
    await auth.login(username.value.trim(), password.value);
    router.push(route.query.redirect ? String(route.query.redirect) : '/');
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-page {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(160deg, #ffffff 0%, #f0f0f0 60%, #ededed 60.1%);
}
@media (prefers-color-scheme: dark) {
  .login-page {
    background: linear-gradient(160deg, #1c1e21 0%, #111214 60%, #111214 60.1%);
  }
}
.login-box {
  width: 340px;
  max-width: 90vw;
  background: var(--wx-white);
  border-radius: 12px;
  padding: 36px 28px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
}
.login-logo {
  font-size: 26px;
  font-weight: 700;
  color: var(--wx-text);
  text-align: center;
}
.login-sub {
  text-align: center;
  color: var(--wx-text-light);
  font-size: 13px;
  margin: 6px 0 24px;
}
.login-btn {
  width: 100%;
  margin-top: 18px;
  padding: 11px;
  font-size: 16px;
}
.login-error {
  color: #fa5151;
  font-size: 13px;
  margin-top: 10px;
  text-align: center;
}
</style>
