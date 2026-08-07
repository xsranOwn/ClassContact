import { defineStore } from 'pinia';
import { http } from '../api/http.js';
import { getSocket, disconnectSocket } from '../api/socket.js';
import { useChatStore } from './chat.js';

export const ROLE_LABELS = { admin: '管理员', head_teacher: '班主任', teacher: '教师', screen: '班级大屏' };

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem('token') || '',
    user: JSON.parse(localStorage.getItem('user') || 'null'),
  }),
  getters: {
    isLoggedIn: (s) => Boolean(s.token),
    isAdmin: (s) => s.user?.role === 'admin',
    isTeacher: (s) => s.user?.role === 'head_teacher' || s.user?.role === 'teacher',
  },
  actions: {
    async login(username, password) {
      const { token, user } = await http.post('/auth/login', { username, password });
      this.token = token;
      this.user = user;
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      getSocket(); // 建立实时连接
    },
    /** 修改自己的显示名(所有角色通用) */
    async updateDisplayName(name) {
      const { user } = await http.put('/auth/me', { display_name: name });
      this.user = user;
      localStorage.setItem('user', JSON.stringify(user));
      return user;
    },
    /** 修改自己的密码(所有角色通用) */
    async changePassword(oldPassword, newPassword) {
      const { user } = await http.put('/auth/me', {
        old_password: oldPassword,
        new_password: newPassword,
      });
      this.user = user;
      localStorage.setItem('user', JSON.stringify(user));
      return user;
    },
    logout() {
      this.token = '';
      this.user = null;
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      disconnectSocket();
      // 重置会话状态:下次登录会用新 socket 重新绑定实时监听
      useChatStore().$reset();
    },
  },
});
