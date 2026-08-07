import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { pool } from '../db/pool.js';
import { canChat } from '../routes/messages.js';
import { sendPushToUser } from '../services/push.js';

/** 用户/消息主键均为 CHAR(36) UUID,先校验格式再进入查询与投递 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let ioRef = null;

/** 供路由/服务获取 Socket.IO 实例,用于广播实时事件(如文件删除) */
export function getIO() {
  return ioRef;
}

/** 初始化 Socket.IO:握手鉴权 + 连接事件 */
export function initSocket(io) {
  ioRef = io;

  // JWT 握手鉴权:客户端连接时传 handshake.auth.token
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || '';
      const payload = jwt.verify(token, config.jwtSecret);
      const [rows] = await pool.query(
        `SELECT id, username, display_name, role, avatar FROM users WHERE id = :id`,
        { id: payload.uid }
      );
      if (!rows.length) return next(new Error('账号不存在'));
      socket.user = rows[0];
      next();
    } catch {
      next(new Error('认证失败'));
    }
  });

  io.on('connection', async (socket) => {
    const uid = socket.user.id;
    socket.join(`user:${uid}`); // 个人房间:单聊投递用

    // 加入该用户相关的班级房间(owner 或成员,含 pending)
    try {
      const [cls] = await pool.query(
        `SELECT DISTINCT c.id FROM classes c
         LEFT JOIN class_members cm ON cm.class_id = c.id AND cm.user_id = :uid
         WHERE c.owner_id = :uid OR cm.user_id = :uid`,
        { uid }
      );
      for (const c of cls) socket.join(`class:${c.id}`);
    } catch (err) {
      console.error('[socket] join class rooms failed:', err.message);
    }

    socket.emit('me', { user: socket.user });

    // 在线状态广播
    io.emit('presence', { user_id: uid, online: true, at: Date.now() });
    socket.on('disconnect', () => {
      io.emit('presence', { user_id: uid, online: false, at: Date.now() });
    });

    registerMessageEvents(socket, io);
  });

  console.log('[socket] Socket.IO 已就绪');
}

/** 实时消息事件:发送 / 已读回执 / 打字提示 */
function registerMessageEvents(socket, io) {
  // 发送消息(仅好友):持久化后投递给接收者
  socket.on('message:send', async (payload, ack) => {
    try {
      const { to, type = 'text', content = '', file_url = null, file_name = null, file_size = null } =
        payload || {};
      const receiverId = String(to || '');
      if (!receiverId || receiverId === socket.user.id || !UUID_RE.test(receiverId)) {
        return ack?.({ error: '无效的接收者' });
      }
      if (!['text', 'image', 'video', 'file'].includes(type)) {
        return ack?.({ error: '无效的消息类型' });
      }
      if (type === 'text' && !content.trim()) {
        return ack?.({ error: '消息内容为空' });
      }
      if (!(await canChat(socket.user.id, receiverId))) {
        return ack?.({ error: '仅本班大屏与班级成员之间可发送消息' });
      }

      const msgId = randomUUID();
      await pool.query(
        `INSERT INTO messages (id, sender_id, receiver_id, type, content, file_url, file_name, file_size)
         VALUES (:id, :sid, :rid, :type, :content, :file_url, :file_name, :file_size)`,
        {
          id: msgId,
          sid: socket.user.id,
          rid: receiverId,
          type,
          content,
          file_url,
          file_name,
          file_size: file_size ? Number(file_size) : null,
        }
      );
      const [rows] = await pool.query('SELECT * FROM messages WHERE id = :id', { id: msgId });
      const message = rows[0];

      io.to(`user:${receiverId}`).emit('message:new', { message, from: socket.user.id });
      ack?.({ ok: true, message });

      // 始终推送 Web Push(在线也推):由 service worker 判断前台聚焦则抑制,
      // 后台/离线一定弹通知,保证「收得到」
      sendPushToUser(receiverId, {
        title: socket.user.display_name,
        body: type === 'file' ? `[文件] ${file_name || ''}` : content,
        data: { from: socket.user.id, type },
      });
    } catch (err) {
      console.error('[socket] message:send failed:', err.message);
      ack?.({ error: '发送失败' });
    }
  });

  // 已读回执:标记来自对方的消息已读,并通知对方
  socket.on('message:read', async (payload) => {
    try {
      const from = String(payload?.from || '');
      if (!from || from === socket.user.id || !UUID_RE.test(from)) return;
      // 仅会话对象之间互发已读回执:防止向任意 user:{uid} 伪造回执
      if (!(await canChat(socket.user.id, from))) return;
      // 标记已读(幂等)。注意:前端 markRead 已先经 REST 写入 read_at,
      // 此处 UPDATE 可能影响 0 行,因此不能依赖 affectedRows——
      // 必须无条件回执,否则发送方永远收不到实时「已读」。
      await pool.query(
        `UPDATE messages SET read_at = COALESCE(read_at, UTC_TIMESTAMP())
          WHERE sender_id = :from AND receiver_id = :me AND read_at IS NULL`,
        { from, me: socket.user.id }
      );
      io.to(`user:${from}`).emit('message:read', { by: socket.user.id, at: Date.now() });
    } catch (err) {
      console.error('[socket] message:read failed:', err.message);
    }
  });

  // 打字提示
  socket.on('typing', async (payload) => {
    try {
      const to = String(payload?.to || '');
      if (!to || to === socket.user.id || !UUID_RE.test(to)) return;
      // 仅聊天对象之间广播,防止向任意 user:{uid} 伪造打字提示
      if (!(await canChat(socket.user.id, to))) return;
      io.to(`user:${to}`).emit('typing', {
        from: socket.user.id,
        isTyping: Boolean(payload.isTyping),
      });
    } catch (err) {
      // 校验失败(如 DB 抖动)静默忽略,不广播也不报错
    }
  });
}

/** 向班级房间广播成员变动信号(供 REST 路由调用) */
export function broadcastClassUpdate(classId) {
  if (!ioRef) return;
  ioRef.to(`class:${classId}`).emit('class:members_changed', {
    class_id: classId,
    at: Date.now(),
  });
}
