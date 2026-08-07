<template>
  <div class="page main-layout">
    <header class="page-header">
      <span>{{ title }}</span>
      <!-- 桌面端导航(移动端由底部 tabbar 承担);admin 直达三个管理 tab -->
      <nav class="desktop-nav hide-on-mobile">
        <template v-if="!auth.isAdmin">
          <router-link to="/" exact-active-class="active" replace>会话</router-link>
          <router-link to="/classes" active-class="active" replace>班级</router-link>
        </template>
        <template v-else>
          <router-link to="/admin/users" active-class="active" replace>账号管理</router-link>
          <router-link to="/admin/classes" active-class="active" replace>班级管理</router-link>
          <router-link to="/admin/bindings" active-class="active" replace>绑定管理</router-link>
        </template>
        <router-link to="/me" active-class="active" replace>我的</router-link>
        <button class="logout-link" @click="logout">退出登录</button>
      </nav>
    </header>

    <div class="main-body">
      <router-view />
    </div>

    <!-- 移动端底部导航;admin 直达三个管理 tab;切换用 replace 避免侧滑转场 -->
    <nav class="tabbar">
      <template v-if="!auth.isAdmin">
        <router-link to="/" exact-active-class="active" replace>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          会话
        </router-link>
        <router-link to="/classes" exact-active-class="active" replace>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
          班级
        </router-link>
      </template>
      <template v-else>
        <router-link to="/admin/users" exact-active-class="active" replace>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          账号管理
        </router-link>
        <router-link to="/admin/classes" exact-active-class="active" replace>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
          班级管理
        </router-link>
        <router-link to="/admin/bindings" exact-active-class="active" replace>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M4 12h16M4 17h10"/></svg>
          绑定管理
        </router-link>
      </template>
      <router-link to="/me" exact-active-class="active" replace>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z"/><path d="M5.3 19a7 7 0 0 1 13.4 0"/></svg>
        我的
      </router-link>
    </nav>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const TITLES = {
  '/': '班级沟通',
  '/classes': '班级',
  '/admin/users': '账号管理',
  '/admin/classes': '班级管理',
  '/admin/bindings': '绑定管理',
  '/me': '我的',
};
const title = computed(() => TITLES[route.path] || '班级沟通');

function logout() {
  auth.logout();
  router.push('/login');
}
</script>

<style scoped>
.main-layout {
  background: var(--wx-bg);
}
.main-body {
  flex: 1;
  min-height: 0;
  display: flex;
}
.main-body > * {
  flex: 1;
  min-width: 0;
}
.desktop-nav {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
}
.desktop-nav a {
  color: var(--wx-text);
  text-decoration: none;
  padding: 4px 10px;
  border-radius: 4px;
}
.desktop-nav a:hover { background: var(--wx-hover); }
.desktop-nav a.active { background: var(--wx-active); font-weight: 600; }
.logout-link {
  margin-left: 8px;
  border: 1px solid var(--wx-border);
  background: none;
  color: var(--wx-text);
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 4px;
}
.logout-link:hover { background: var(--wx-hover); }
</style>
