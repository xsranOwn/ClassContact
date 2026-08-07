import { defineStore } from 'pinia';
import { http } from '../api/http.js';
import { getSocket } from '../api/socket.js';
import { cacheMessages, getCachedMessages, patchCachedMessage } from '../utils/cache.js';

export const useChatStore = defineStore('chat', {
  state: () => ({
    conversations: [],
    activePeerId: null,
    messages: {}, // peerId -> [message]
    onlineUsers: {}, // userId -> bool
    typingUsers: {}, // userId -> ts
    unreadTotal: 0,
    initialized: false,
  }),
  actions: {
    init() {
      if (this.initialized) return;
      this.initialized = true;
      const socket = getSocket();
      socket.on('message:new', this.onMessageNew);
      socket.on('message:read', this.onMessageRead);
      socket.on('message:file-deleted', this.onFileDeleted);
      socket.on('typing', this.onTyping);
      socket.on('presence', this.onPresence);
      this.refreshConversations();
    },
    async refreshConversations() {
      const { conversations } = await http.get('/messages/conversations');
      this.conversations = conversations;
      this.unreadTotal = conversations.reduce((s, c) => s + (c.unread || 0), 0);
    },
    async openConversation(peerId) {
      this.activePeerId = peerId;
      // 1) 先读本地缓存秒开(离线也可查看已加载过的会话)
      const cached = await getCachedMessages(peerId);
      if (cached?.length) this.messages[peerId] = cached;
      try {
        // 2) 服务器为准刷新并回写缓存
        const { messages } = await http.get(`/messages/${peerId}?limit=50`);
        this.messages[peerId] = messages;
        this.markRead(peerId);
        cacheMessages(peerId, messages);
      } catch (e) {
        // 网络失败:保留缓存内容,离线可读
        if (!this.messages[peerId]?.length) throw e;
      }
    },
    /** 离开聊天窗口时清空,列表页收到消息一律走刷新分支(否则残留导致不刷新+误标已读) */
    closeConversation() {
      this.activePeerId = null;
    },
    async loadMore(peerId, oldestMsg) {
      const { messages } = await http.get(
        `/messages/${peerId}?limit=50&before_at=${encodeURIComponent(oldestMsg.created_at)}&before_id=${oldestMsg.id}`
      );
      const rest = messages.filter((m) => !this.messages[peerId]?.some((x) => x.id === m.id));
      this.messages[peerId] = [...rest, ...(this.messages[peerId] || [])];
      cacheMessages(peerId, this.messages[peerId]);
      return rest.length;
    },
    async markRead(peerId) {
      await http.post(`/messages/${peerId}/read`).catch(() => {});
      const conv = this.conversations.find((c) => c.peer_id === peerId);
      if (conv) conv.unread = 0;
      this.unreadTotal = this.conversations.reduce((s, c) => s + (c.unread || 0), 0);
      getSocket().emit('message:read', { from: peerId });
    },
    sendText(peerId, content) {
      return this.send({ to: peerId, type: 'text', content });
    },
    sendFile(peerId, file) {
      return this.send({
        to: peerId,
        type: file.type || 'file', // image / video / file
        content: file.file_name,
        file_url: file.file_url,
        file_name: file.file_name,
        file_size: file.file_size,
      });
    },
    send(payload) {
      return new Promise((resolve, reject) => {
        getSocket().emit('message:send', payload, (ack) => {
          if (ack?.error) return reject(new Error(ack.error));
          this.appendMessage(payload.to, ack.message);
          resolve(ack.message);
        });
      });
    },
    sendTyping(peerId, isTyping) {
      getSocket().emit('typing', { to: peerId, isTyping });
    },
    appendMessage(peerId, message) {
      if (!this.messages[peerId]) this.messages[peerId] = [];
      if (!this.messages[peerId].some((m) => m.id === message.id)) {
        this.messages[peerId].push(message);
      }
      cacheMessages(peerId, this.messages[peerId]);
      this.refreshConversations();
    },
    /** 对方删除文件:实时同步「已删除」并更新本地缓存 */
    onFileDeleted({ id }) {
      for (const [peerId, list] of Object.entries(this.messages)) {
        const m = list?.find((x) => x.id === id);
        if (m) {
          m.file_deleted = 1;
          patchCachedMessage(peerId, id, { file_deleted: 1 });
          break;
        }
      }
    },
    onMessageNew({ message, from }) {
      if (this.activePeerId === message.sender_id) {
        // 正在聊天窗口中:追加并回执已读
        this.appendMessage(message.sender_id, message);
        this.markRead(message.sender_id);
      } else {
        // 列表页/其他会话:刷新会话列表(未读角标、最新消息)
        this.refreshConversations();
      }
      // 系统通知统一由 Web Push + service worker 处理(前台聚焦自动抑制),此处不再重复弹窗
    },
    onMessageRead({ by }) {
      // by = 读了「我」消息的人;把「我发给 by」的消息标记为已读
      // (注意:不能写成 sender_id === by,那是对方发给我的消息)
      let me = '';
      try {
        // JWT payload 是 base64url,需先还原为标准 base64 再解码
        const b64 = (localStorage.getItem('token') || '').split('.')[1] || '';
        const normalized = b64.replace(/-/g, '+').replace(/_/g, '/');
        me = JSON.parse(atob(normalized)).uid || '';
      } catch {
        /* 解析失败则跳过已读标记 */
      }
      const msgs = this.messages[by];
      if (msgs) {
        msgs.forEach((m) => {
          if (m.sender_id === me && !m.read_at) m.read_at = new Date().toISOString();
        });
      }
    },
    onTyping({ from, isTyping }) {
      if (isTyping) this.typingUsers[from] = Date.now();
      else delete this.typingUsers[from];
    },
    onPresence({ user_id, online }) {
      this.onlineUsers[user_id] = online;
    },
  },
});
