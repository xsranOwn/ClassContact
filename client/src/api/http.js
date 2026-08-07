// 轻量 fetch 封装:自动携带 token、统一错误、401 跳登录
import { useAuthStore } from '../stores/auth.js';

const BASE = '/api';

async function request(method, path, body) {
  const auth = useAuthStore();
  const headers = {};
  if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (auth.token) headers['Authorization'] = `Bearer ${auth.token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && path !== '/auth/login') {
    auth.logout();
    window.location.href = '/login';
    throw new Error('登录已过期');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `请求失败(${res.status})`);
  return data;
}

export const http = {
  get: (p) => request('GET', p),
  post: (p, b) => request('POST', p, b),
  put: (p, b) => request('PUT', p, b),
  delete: (p, b) => request('DELETE', p, b),
  upload: (p, formData) => request('POST', p, formData),
};
