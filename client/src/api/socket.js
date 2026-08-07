import { io } from 'socket.io-client';

let socket = null;

/** 获取单例 socket(带 token) */
export function getSocket() {
  if (socket) return socket;
  const token = localStorage.getItem('token');
  socket = io('/', { auth: { token }, transports: ['websocket', 'polling'] });
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
