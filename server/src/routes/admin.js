import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { pool, withTransaction } from '../db/pool.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { createClass, loadClass } from './classes.js';
import { broadcastClassUpdate } from '../socket/index.js';
import { deleteFile, parseItemId } from '../services/onedrive.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));

// ---------- 账号管理 ----------

// POST /api/admin/users  新建 C/A/B 账号
router.post('/users', async (req, res, next) => {
  try {
    const { username, password, display_name, role } = req.body || {};
    if (!username || !password || !display_name) {
      return res.status(400).json({ error: 'username / password / display_name 必填' });
    }
    if (!['head_teacher', 'teacher'].includes(role)) {
      return res.status(400).json({ error: 'role 必须是 head_teacher(班主任)/ teacher(教师);大屏(screen)账号由班级自动创建,无需手动建立' });
    }
    if (!/^[A-Za-z0-9_]{3,32}$/.test(username)) {
      return res.status(400).json({ error: '用户名需为 3-32 位字母/数字/下划线' });
    }
    if (password.length < 6) return res.status(400).json({ error: '密码至少 6 位' });

    const hash = await bcrypt.hash(password, 10);
    const id = randomUUID();
    await pool.query(
      `INSERT INTO users (id, username, password_hash, display_name, role)
       VALUES (:id, :username, :hash, :display_name, :role)`,
      { id, username, hash, display_name, role }
    );
    const [rows] = await pool.query(
      `SELECT id, username, display_name, role, avatar, created_at FROM users WHERE id = :id`,
      { id }
    );
    res.status(201).json({ user: rows[0] });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: '用户名已存在' });
    next(err);
  }
});

// GET /api/admin/users?role=c|a|b  用户列表(可按角色过滤)
router.get('/users', async (req, res, next) => {
  try {
    const { role } = req.query;
    // 账号管理不展示班级大屏(B)账号(由班级生命周期管理)
    let sql = `SELECT id, username, display_name, role, avatar, created_at FROM users WHERE role != 'screen'`;
    const params = {};
    if (role) {
      sql += ' AND role = :role';
      params.role = role;
    }
    sql += ' ORDER BY id';
    const [rows] = await pool.query(sql, params);
    res.json({ users: rows });
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/users/:id/password  重置密码
router.put('/users/:id/password', async (req, res, next) => {
  try {
    const id = req.params.id;
    const { password } = req.body || {};
    if (!password || password.length < 6) return res.status(400).json({ error: '新密码至少 6 位' });
    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query('UPDATE users SET password_hash = :hash WHERE id = :id', { hash, id });
    if (!result.affectedRows) return res.status(404).json({ error: '用户不存在' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/users/:id  删除用户(不能删自己;好友/消息/班级关联级联清理;其上传的 OneDrive 文件一并删除)
router.delete('/users/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    if (id === req.user.id) return res.status(400).json({ error: '不能删除自己的账号' });
    // 同步删除该用户上传的 OneDrive 文件(尽力而为)
    const [files] = await pool.query(
      `SELECT file_url FROM messages
        WHERE sender_id = :id AND type = 'file' AND file_url IS NOT NULL AND file_deleted = 0`,
      { id }
    );
    for (const f of files) {
      const itemId = parseItemId(f.file_url);
      if (!itemId) continue; // 格式异常的 file_url 不拼入 Graph 请求
      try {
        await deleteFile(itemId);
      } catch {
        /* 忽略单文件删除失败 */
      }
    }
    const [result] = await pool.query('DELETE FROM users WHERE id = :id', { id });
    if (!result.affectedRows) return res.status(404).json({ error: '用户不存在' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---------- 好友关系管理(任意两用户之间) ----------

// GET /api/admin/friends  全部好友关系(含双方用户名)
router.get('/friends', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT f.id, f.user_a, f.user_b,
              ua.username AS username_a, ua.display_name AS display_a, ua.role AS role_a,
              ub.username AS username_b, ub.display_name AS display_b, ub.role AS role_b,
              f.created_at
         FROM friendships f
         JOIN users ua ON ua.id = f.user_a
         JOIN users ub ON ub.id = f.user_b
        ORDER BY f.id`
    );
    res.json({ friends: rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/friends { user_a, user_b }  建立任意两用户间好友
router.post('/friends', async (req, res, next) => {
  try {
    const user_a = String(req.body?.user_a || '').trim();
    const user_b = String(req.body?.user_b || '').trim();
    if (!user_a || !user_b || user_a === user_b) {
      return res.status(400).json({ error: '需要两个不同的用户 id' });
    }
    const [exist] = await pool.query('SELECT id FROM users WHERE id IN (:ids)', { ids: [user_a, user_b] });
    if (exist.length !== 2) return res.status(404).json({ error: '用户不存在' });

    // 按字典序规范化存储
    const [a, b] = user_a < user_b ? [user_a, user_b] : [user_b, user_a];
    await pool.query(
      'INSERT INTO friendships (user_a, user_b) VALUES (:a, :b) ON DUPLICATE KEY UPDATE id = id',
      { a, b }
    );
    res.status(201).json({ ok: true, friendship: { user_a: a, user_b: b } });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/friends { user_a, user_b }  解除好友
router.delete('/friends', async (req, res, next) => {
  try {
    const user_a = String(req.body?.user_a || '').trim();
    const user_b = String(req.body?.user_b || '').trim();
    if (!user_a || !user_b) return res.status(400).json({ error: '需要两个用户 id' });
    const [result] = await pool.query(
      'DELETE FROM friendships WHERE user_a = :a AND user_b = :b',
      { a: user_a < user_b ? user_a : user_b, b: user_a < user_b ? user_b : user_a }
    );
    if (!result.affectedRows) return res.status(404).json({ error: '好友关系不存在' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---------- 账号身份管理 ----------

// PUT /api/admin/users/:id/role { role: c|a }  修改教师/班主任身份
router.put('/users/:id/role', async (req, res, next) => {
  try {
    const id = req.params.id;
    const { role } = req.body || {};
    if (!['head_teacher', 'teacher'].includes(role)) {
      return res.status(400).json({ error: 'role 只能是 head_teacher(班主任)或 teacher(教师)' });
    }
    const [r] = await pool.query('UPDATE users SET role = :role WHERE id = :id', { role, id });
    if (!r.affectedRows) return res.status(404).json({ error: '用户不存在' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---------- 班级管理(管理员) ----------

// POST /api/admin/classes  新建班级(两种模式,指定班主任 owner_id)
router.post('/classes', async (req, res, next) => {
  try {
    const ownerId = String(req.body?.owner_id || '').trim();
    if (!ownerId) return res.status(400).json({ error: 'owner_id(班主任)必填' });
    const [owner] = await pool.query('SELECT role FROM users WHERE id = :id', { id: ownerId });
    if (!owner.length || owner[0].role !== 'head_teacher') {
      return res.status(400).json({ error: '指定的班主任不存在或角色不是班主任' });
    }
    const result = await createClass(ownerId, req.body || {});
    res.status(201).json(result);
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
});

// GET /api/admin/classes  全部班级(含班主任、大屏账号、成员数)
router.get('/classes', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.id, c.code, c.name, c.invite_code, c.owner_id,
              u.display_name AS owner_name, u.username AS owner_username,
              s.id AS screen_id, s.username AS screen_username,
              (SELECT COUNT(*) FROM class_members cm WHERE cm.class_id = c.id AND cm.status = 'approved') AS member_count
         FROM classes c
         JOIN users u ON u.id = c.owner_id
         LEFT JOIN users s ON s.class_id = c.id AND s.role = 'screen'
        ORDER BY c.id`
    );
    res.json({ classes: rows });
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/classes/:id/owner { owner_id }  修改班级班主任
router.put('/classes/:id/owner', async (req, res, next) => {
  try {
    const id = req.params.id;
    const ownerId = String(req.body?.owner_id || '').trim();
    if (!ownerId) return res.status(400).json({ error: 'owner_id 必填' });
    const [owner] = await pool.query('SELECT role FROM users WHERE id = :id', { id: ownerId });
    if (!owner.length || owner[0].role !== 'head_teacher') {
      return res.status(400).json({ error: '新班主任不存在或角色不是班主任' });
    }
    const [r] = await pool.query('UPDATE classes SET owner_id = :oid WHERE id = :id', { oid: ownerId, id });
    if (!r.affectedRows) return res.status(404).json({ error: '班级不存在' });
    // 新班主任自动成为成员
    await pool.query(
      `INSERT INTO class_members (id, class_id, user_id, status) VALUES (:mid, :cid, :uid, 'approved')
       ON DUPLICATE KEY UPDATE status = 'approved'`,
      { mid: randomUUID(), cid: id, uid: ownerId }
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---------- 绑定管理(班级 ↔ 教师/班主任,取代好友管理) ----------

// POST /api/admin/classes/:id/screen/reset-password { password }  管理员重置任意班级大屏密码
router.post('/classes/:id/screen/reset-password', async (req, res, next) => {
  try {
    const cls = await loadClass(req, res);
    if (!cls) return;
    const { password } = req.body || {};
    if (!password || password.length < 6) return res.status(400).json({ error: '新密码至少 6 位' });
    const hash = await bcrypt.hash(password, 10);
    const [r] = await pool.query(
      `UPDATE users SET password_hash = :h WHERE class_id = :cid AND role = 'screen'`,
      { h: hash, cid: cls.id }
    );
    if (!r.affectedRows) return res.status(404).json({ error: '未找到该班大屏账号' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/classes/:id/delete  管理员删除班级:自动删除该班大屏(B)账号
router.post('/classes/:id/delete', async (req, res, next) => {
  try {
    const cls = await loadClass(req, res);
    if (!cls) return;
    await withTransaction(async (conn) => {
      await conn.query(`DELETE FROM users WHERE class_id = :cid AND role = 'screen'`, { cid: cls.id });
      await conn.query('DELETE FROM classes WHERE id = :id', { id: cls.id });
    });
    broadcastClassUpdate(cls.id); // 通知原成员刷新班级列表
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/bindings?class_id=4   班级绑定的老师
// GET /api/admin/bindings?teacher_id=3 老师绑定的班级
router.get('/bindings', async (req, res, next) => {
  try {
    const { class_id, teacher_id } = req.query;
    if (class_id) {
      const [rows] = await pool.query(
        `SELECT u.id, u.username, u.display_name, u.role, cm.status
           FROM class_members cm JOIN users u ON u.id = cm.user_id
          WHERE cm.class_id = :cid AND u.role IN ('teacher','head_teacher')
            AND u.id != (SELECT owner_id FROM classes WHERE id = :cid)
          ORDER BY u.id`,
        { cid: String(class_id) }
      );
      return res.json({ bindings: rows });
    }
    if (teacher_id) {
      const [rows] = await pool.query(
        `SELECT c.id, c.code, c.name, c.invite_code
           FROM class_members cm JOIN classes c ON c.id = cm.class_id
          WHERE cm.user_id = :uid AND cm.status = 'approved'
          ORDER BY c.id`,
        { uid: String(teacher_id) }
      );
      return res.json({ bindings: rows });
    }
    res.status(400).json({ error: '需提供 class_id 或 teacher_id' });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/bindings { class_id, user_id }  绑定(添加为班级成员)
router.post('/bindings', async (req, res, next) => {
  try {
    const classId = String(req.body?.class_id || '').trim();
    const userId = String(req.body?.user_id || '').trim();
    const [user] = await pool.query('SELECT role FROM users WHERE id = :id', { id: userId });
    if (!user.length) return res.status(404).json({ error: '用户不存在' });
    if (!['teacher', 'head_teacher'].includes(user[0].role)) {
      return res.status(400).json({ error: '仅教师(A)或班主任(C)可与班级绑定' });
    }
    const [cls] = await pool.query('SELECT id FROM classes WHERE id = :id', { id: classId });
    if (!cls.length) return res.status(404).json({ error: '班级不存在' });
    await pool.query(
      `INSERT INTO class_members (id, class_id, user_id, status) VALUES (:mid, :cid, :uid, 'approved')
       ON DUPLICATE KEY UPDATE status = 'approved'`,
      { mid: randomUUID(), cid: classId, uid: userId }
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/bindings { class_id, user_id }  解绑(班主任与大屏不可解绑)
router.delete('/bindings', async (req, res, next) => {
  try {
    const classId = String(req.body?.class_id || '').trim();
    const userId = String(req.body?.user_id || '').trim();
    const [cls] = await pool.query('SELECT owner_id FROM classes WHERE id = :id', { id: classId });
    if (!cls.length) return res.status(404).json({ error: '班级不存在' });
    if (cls[0].owner_id === userId) return res.status(400).json({ error: '不能解绑班主任,请通过修改班主任操作' });
    const [r] = await pool.query(
      'DELETE FROM class_members WHERE class_id = :cid AND user_id = :uid',
      { cid: classId, uid: userId }
    );
    if (!r.affectedRows) return res.status(404).json({ error: '该用户未绑定此班级' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
