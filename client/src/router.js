import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from './stores/auth.js';
import LoginView from './views/LoginView.vue';
import MainLayout from './views/MainLayout.vue';
import ChatView from './views/ChatView.vue';
import ClassesView from './views/ClassesView.vue';
import AdminView from './views/AdminView.vue';
import ProfileView from './views/ProfileView.vue';
import ShareTargetView from './views/ShareTargetView.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', component: LoginView },
    { path: '/share', component: ShareTargetView, meta: { bare: true } },
    {
      path: '/',
      component: MainLayout,
      children: [
        { path: '', component: ChatView },
        { path: 'classes', component: ClassesView },
        { path: 'admin/:tab(users|classes|bindings)', component: AdminView, meta: { admin: true } },
        { path: 'me', component: ProfileView },
      ],
    },
  ],
});

router.beforeEach((to) => {
  const auth = useAuthStore();
  // 分享目标页:未登录时引导登录,登录后回 /share
  if (to.path === '/share') {
    if (!auth.isLoggedIn) return { path: '/login', query: { redirect: '/share' } };
    return true;
  }
  if (to.path !== '/login' && !auth.isLoggedIn) return '/login';
  if (to.path === '/login' && auth.isLoggedIn) return '/';
  if (to.meta.admin && !auth.isAdmin) return '/';
  // 管理员无需会话,首页直达账号管理
  if (to.path === '/' && auth.isAdmin) return '/admin/users';
  return true;
});

export default router;
