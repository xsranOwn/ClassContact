import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { getIO } from '../socket/index.js';
import { deleteFile, parseItemId } from '../services/onedrive.js';

/** 主键一律为 CHAR(36) UUID(crypto.randomUUID 生成),先校验格式再入库查询 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const router = Router();
router.use(requireAuth);

/** 校验两用户是否可聊天:
 *  1) 班级(approved)成员 ↔ 该班专属大屏(B, users.class_id = 班级)
 *  2) 加入某班的大屏(B, class_members) ↔ 该班专属大屏(大屏间互发)
 *  加入的大屏因 users.class_id 非本班,教师/班主任看不到也聊不了它 */
export async function canChat(a, b) {
  const [rows] = await pool.query(
    `SELECT 1
       FROM class_members cm
       JOIN users u ON u.id = cm.user_id AND cm.status = 'approved'
      WHERE (cm.user_id = :a AND EXISTS(
              SELECT 1 FROM users ub WHERE ub.id = :b AND ub.role = 'screen' AND ub.class_id = cm.class_id))
         OR (cm.user_id = :b AND EXISTS(
              SELECT 1 FROM users ua WHERE ua.id = :a AND ua.role = 'screen' AND ua.class_id = cm.class_id))`,
    { a, b }
  );
  return rows.length > 0;
}

/** 普通用户(c/a/admin):会话 = 其已加入班级的大屏(B) */
async function memberConversations(uid) {
  return pool.query(
    `SELECT s.id AS peer_id, s.username, s.display_name, s.role, s.avatar,
            c.id AS class_id, c.name AS class_name,
            lm.id AS last_msg_id, lm.type AS last_type, lm.content AS last_content,
            lm.file_deleted AS last_file_deleted,
            lm.created_at AS last_at,
            (SELECT COUNT(*) FROM messages m
              WHERE m.sender_id = s.id AND m.receiver_id = :uid AND m.read_at IS NULL) AS unread
       FROM class_members cm
       JOIN classes c ON c.id = cm.class_id
       JOIN users s ON s.class_id = c.id AND s.role = 'screen'
       LEFT JOIN messages lm ON lm.id = (
            SELECT m.id FROM messages m
             WHERE (m.sender_id = :uid AND m.receiver_id = s.id)
                OR (m.sender_id = s.id AND m.receiver_id = :uid)
             ORDER BY m.created_at DESC, m.id DESC LIMIT 1
       )
      WHERE cm.user_id = :uid AND cm.status = 'approved'
      ORDER BY COALESCE(lm.created_at, 0) DESC`,
    { uid }
  );
}

/** 大屏(B):会话 = 本班已批准成员 + 加入班级的专属大屏(大屏间互发) */
async function bigScreenConversations(uid) {
  return pool.query(
    `SELECT u.id AS peer_id, u.username, u.display_name, u.role, u.avatar,
            lm.id AS last_msg_id, lm.type AS last_type, lm.content AS last_content,
            lm.file_deleted AS last_file_deleted,
            lm.created_at AS last_at,
            (SELECT COUNT(*) FROM messages m
              WHERE m.sender_id = u.id AND m.receiver_id = :uid AND m.read_at IS NULL) AS unread
       FROM class_members cm
       JOIN users u ON u.id = cm.user_id
       LEFT JOIN messages lm ON lm.id = (
            SELECT m.id FROM messages m
             WHERE (m.sender_id = :uid AND m.receiver_id = u.id)
                OR (m.sender_id = u.id AND m.receiver_id = :uid)
             ORDER BY m.created_at DESC, m.id DESC LIMIT 1
       )
      WHERE cm.class_id = (SELECT class_id FROM users WHERE id = :uid)
        AND cm.status = 'approved' AND u.id != :uid
      UNION ALL
      SELECT s.id AS peer_id, s.username, s.display_name, s.role, s.avatar,
            lm.id AS last_msg_id, lm.type AS last_type, lm.content AS last_content,
            lm.file_deleted AS last_file_deleted,
            lm.created_at AS last_at,
            (SELECT COUNT(*) FROM messages m
              WHERE m.sender_id = s.id AND m.receiver_id = :uid AND m.read_at IS NULL) AS unread
       FROM class_members mycm
       JOIN users s ON s.class_id = mycm.class_id AND s.role = 'screen' AND s.id != :uid
       LEFT JOIN messages lm ON lm.id = (
            SELECT m.id FROM messages m
             WHERE (m.sender_id = :uid AND m.receiver_id = s.id)
                OR (m.sender_id = s.id AND m.receiver_id = :uid)
             ORDER BY m.created_at DESC, m.id DESC LIMIT 1
       )
      WHERE mycm.user_id = :uid AND mycm.status = 'approved'
        AND mycm.class_id != (SELECT class_id FROM users WHERE id = :uid)
      ORDER BY COALESCE(last_at, 0) DESC`,
    { uid }
  );
}

// GET /api/messages/conversations  会话列表:普通用户=班级大屏,大屏=班级成员
router.get('/conversations', async (req, res, next) => {
  try {
    const uid = req.user.id;
    const [rows] =
      req.user.role === 'screen' ? await bigScreenConversations(uid) : await memberConversations(uid);
    res.json({ conversations: rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/messages/:peerId?before=<msgId>&limit=<n>  与聊天对象的历史消息(升序返回)
router.get('/:peerId', async (req, res, next) => {
  try {
    const uid = req.user.id;
    const peerId = req.params.peerId;
    if (!UUID_RE.test(peerId || '')) return res.status(400).json({ error: '无效的会话对象 id' });
    if (!(await canChat(uid, peerId))) {
      return res.status(403).json({ error: '仅本班大屏与班级成员之间可查看消息' });
    }
    const limit = Math.min(Number(req.query.limit || 50) || 50, 100);
    // 游标分页:按 created_at 降序(UUID 主键无时间序,不能用于排序/分页)
    const beforeAt = req.query.before_at || null;
    const beforeId = req.query.before_id || null;
    // 游标是 (created_at, id) 复合键,必须成对传入:只传 before_at 时
    // id < '' 恒为 false 会漏掉同 created_at 的边界消息;只传 before_id 时
    // 分页条件被静默跳过,返回的仍是第一页。两者不一致直接 400。
    if (Boolean(beforeAt) !== Boolean(beforeId)) {
      return res.status(400).json({ error: '分页参数 before_at 与 before_id 必须成对提供' });
    }

    let sql = `SELECT id, sender_id, receiver_id, type, content,
                      file_url, file_name, file_size, read_at, created_at,
                      file_deleted
                 FROM messages
                WHERE (sender_id = :uid AND receiver_id = :peer)
                   OR (sender_id = :peer AND receiver_id = :uid)`;
    const params = { uid, peer: peerId };
    if (beforeAt) {
      sql += ' AND (created_at < :bat OR (created_at = :bat AND id < :bid))';
      params.bat = beforeAt;
      params.bid = beforeId;
    }
    sql += ' ORDER BY created_at DESC, id DESC LIMIT :limit';
    params.limit = limit;

    const [rows] = await pool.query(sql, params);
    res.json({ messages: rows.reverse() });
  } catch (err) {
    next(err);
  }
});

// POST /api/messages/:peerId/read  标记来自对方的消息已读
router.post('/:peerId/read', async (req, res, next) => {
  try {
    const uid = req.user.id;
    const peerId = req.params.peerId;
    if (!UUID_RE.test(peerId || '')) return res.status(400).json({ error: '无效的会话对象 id' });
    const [r] = await pool.query(
      `UPDATE messages SET read_at = COALESCE(read_at, UTC_TIMESTAMP())
        WHERE sender_id = :peer AND receiver_id = :uid AND read_at IS NULL`,
      { peer: peerId, uid }
    );
    res.json({ ok: true, updated: r.affectedRows });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/messages/:id/file  发送者或接收者删除文件消息的文件
// 标记为已删除(消息保留),并尽力从 OneDrive 删除文件
router.delete('/:id/file', async (req, res, next) => {
  try {
    const id = req.params.id;
    const uid = req.user.id;
    if (!UUID_RE.test(id || '')) return res.status(400).json({ error: '无效的消息 id' });
    const [rows] = await pool.query('SELECT * FROM messages WHERE id = :id', { id });
    if (!rows.length) return res.status(404).json({ error: '消息不存在' });
    const m = rows[0];
    if (m.sender_id !== uid && m.receiver_id !== uid) {
      return res.status(403).json({ error: '仅发送者或接收者可删除文件' });
    }
    if (!['file', 'image', 'video'].includes(m.type) || !m.file_url) {
      return res.status(400).json({ error: '该消息不是文件消息' });
    }
    await pool.query('UPDATE messages SET file_deleted = 1 WHERE id = :id', { id });
    // 广播删除事件:发送方与接收方实时同步「已删除」(本地缓存也据此更新)
    const io = getIO();
    if (io) {
      for (const uid of new Set([m.sender_id, m.receiver_id])) {
        io.to(`user:${uid}`).emit('message:file-deleted', { id, message_id: id });
      }
    }
    // 尽力删除 OneDrive 文件(失败不影响标记);file_url 非 graph:{itemId}
    // 格式时(脏数据/异常值)不拼入 Graph 请求,直接跳过
    const itemId = parseItemId(m.file_url);
    if (itemId) {
      try {
        await deleteFile(itemId);
      } catch {
        /* OneDrive 删除失败或已不存在,忽略 */
      }
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
