import { Router } from 'express';
import crypto, { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { pool, withTransaction } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { broadcastClassUpdate } from '../socket/index.js';

const router = Router();
router.use(requireAuth);

/** 生成 8 位无易混淆字符的邀请码 */
function genInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += chars[crypto.randomInt(chars.length)];
  return s;
}

export async function loadClass(req, res) {
  const id = req.params.id;
  const [rows] = await pool.query('SELECT * FROM classes WHERE id = :id', { id });
  if (!rows.length) {
    res.status(404).json({ error: '班级不存在' });
    return null;
  }
  return rows[0];
}

async function isOwnerOrApprovedMember(cls, userId) {
  if (cls.owner_id === userId) return true;
  const [m] = await pool.query(
    `SELECT 1 FROM class_members WHERE class_id = :cid AND user_id = :uid AND status = 'approved'`,
    { cid: cls.id, uid: userId }
  );
  return m.length > 0;
}

/** 查询班级绑定的大屏账号(不含密码) */
async function loadScreen(cls) {
  const [rows] = await pool.query(
    `SELECT id, username, display_name, role FROM users WHERE class_id = :cid AND role = 'screen'`,
    { cid: cls.id }
  );
  return rows[0] || null;
}

/** 可选的年级列表(管理员配置 years_back,默认近 6 年) */
async function gradeYears() {
  const [rows] = await pool.query(
    `SELECT setting_value FROM settings WHERE setting_key = 'years_back'`
  );
  const back = Number(rows[0]?.setting_value || 6);
  const now = new Date().getFullYear();
  const years = [];
  for (let y = now; y > now - back; y--) years.push(y);
  return years;
}

/** 创建班级(两种模式),返回 { class, screen };失败抛 { statusCode, message } */
export async function createClass(ownerId, body) {
  const { mode = 'manual', grade, class_no, code: manualCode, name } = body || {};
  let code = null;
  let className = '';

  if (mode === 'code') {
    const g = String(grade ?? '').trim();
    const cn = String(class_no ?? '').trim();
    if (!/^\d{4}$/.test(g)) throw Object.assign(new Error('请选择正确的年级'), { statusCode: 400 });
    if (!/^\d{1,4}$/.test(cn)) throw Object.assign(new Error('班级编号需为数字(如 15)'), { statusCode: 400 });
    const years = await gradeYears();
    if (!years.includes(Number(g))) {
      throw Object.assign(
        new Error(`年级需在 ${years[years.length - 1]} ~ ${years[0]} 之间(可在管理后台配置)`),
        { statusCode: 400 }
      );
    }
    code = `${g}${cn}`;
    className = `${g}级${cn}班`;
  } else {
    code = manualCode?.trim() || null;
    className = name?.trim() || '';
    if (code && !/^[A-Za-z0-9]{2,20}$/.test(code)) {
      throw Object.assign(new Error('班级编号需为 2-20 位字母或数字'), { statusCode: 400 });
    }
  }
  if (!className) throw Object.assign(new Error('班级名称必填'), { statusCode: 400 });

  // 业务编号查重
  if (code) {
    const [dup] = await pool.query('SELECT id FROM classes WHERE code = :code', { code });
    if (dup.length) throw Object.assign(new Error(`班级编号 ${code} 已存在`), { statusCode: 409 });
  }

  for (let i = 0; i < 5; i++) {
    const invite = genInviteCode();
    try {
      const created = await withTransaction(async (conn) => {
        const classId = randomUUID();
        await conn.query(
          `INSERT INTO classes (id, code, name, invite_code, owner_id) VALUES (:id, :code, :name, :invite, :owner)`,
          { id: classId, code, name: className, invite, owner: ownerId }
        );
        const memberId = randomUUID();
        await conn.query(
          `INSERT INTO class_members (id, class_id, user_id, status) VALUES (:mid, :cid, :uid, 'approved')`,
          { mid: memberId, cid: classId, uid: ownerId }
        );
        // 自动创建班级大屏账号(用户名=班级业务编号,默认密码=用户名,class_id 绑定,随班级生命周期)
        const screenUsername = code || `screen_${classId.slice(0, 8)}`;
        const screenPassword = screenUsername; // 默认密码与用户名相同
        const screenId = randomUUID();
        const hash = await bcrypt.hash(screenPassword, 10);
        await conn.query(
          `INSERT INTO users (id, username, password_hash, display_name, role, class_id)
           VALUES (:id, :u, :h, :dn, 'screen', :cid)`,
          { id: screenId, u: screenUsername, h: hash, dn: `${className}大屏`, cid: classId }
        );
        return { classId, screen: { id: screenId, username: screenUsername, password: screenPassword } };
      });
      const [rows] = await pool.query('SELECT * FROM classes WHERE id = :id', { id: created.classId });
      return { class: rows[0], screen: created.screen };
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') continue; // 邀请码冲突,重试
      throw err;
    }
  }
  throw Object.assign(new Error('邀请码生成失败,请重试'), { statusCode: 500 });
}

// POST /api/classes  C 创建班级(两种模式)
router.post('/', async (req, res, next) => {
  try {
    if (req.user.role !== 'head_teacher') return res.status(403).json({ error: '仅班主任可创建班级' });
    const result = await createClass(req.user.id, req.body || {});
    res.status(201).json(result);
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
});

// GET /api/classes/mine  C/A/B 看自己的班级(创建的 + 已加入的),含大屏账号
router.get('/mine', async (req, res, next) => {
  try {
    // 大屏(B):绑定班(users.class_id)+ 加入班(class_members)
    if (req.user.role === 'screen') {
      const [rows] = await pool.query(
        `SELECT c.*, COALESCE(cm.status, 'approved') AS my_status,
                s.id AS screen_id, s.username AS screen_username, s.display_name AS screen_display_name
           FROM classes c
           LEFT JOIN users s ON s.class_id = c.id AND s.role = 'screen'
           LEFT JOIN class_members cm ON cm.class_id = c.id AND cm.user_id = :uid
          WHERE c.id = :myClass OR cm.user_id = :uid
          ORDER BY c.id`,
        { myClass: req.user.class_id || '', uid: req.user.id }
      );
      return res.json({ classes: rows });
    }
    const [rows] = await pool.query(
      `SELECT c.*, cm.status AS my_status,
              s.id AS screen_id, s.username AS screen_username, s.display_name AS screen_display_name
         FROM classes c
         JOIN class_members cm ON cm.class_id = c.id
         LEFT JOIN users s ON s.class_id = c.id AND s.role = 'screen'
        WHERE cm.user_id = :uid
        ORDER BY c.id`,
      { uid: req.user.id }
    );
    res.json({ classes: rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/classes/join { invite_code }  A/B/C 凭邀请码申请入班(pending,审核后生效)
router.post('/join', async (req, res, next) => {
  try {
    const code = (req.body?.invite_code || '').trim().toUpperCase();
    if (!code) return res.status(400).json({ error: '邀请码必填' });
    if (!['teacher', 'screen', 'head_teacher'].includes(req.user.role)) {
      return res.status(403).json({ error: '仅教师/班主任/班级大屏账号可申请入班' });
    }
    const [cls] = await pool.query('SELECT * FROM classes WHERE invite_code = :code', { code });
    if (!cls.length) return res.status(404).json({ error: '邀请码无效' });
    const c = cls[0];
    if (c.owner_id === req.user.id) return res.status(400).json({ error: '不能加入自己创建的班级' });
    // 大屏账号不能申请加入自己绑定的班级
    if (req.user.role === 'screen' && req.user.class_id === c.id) {
      return res.status(400).json({ error: '已绑定该班级,无需申请' });
    }

    await pool.query(
      `INSERT INTO class_members (id, class_id, user_id, status) VALUES (:mid, :cid, :uid, 'pending')
       ON DUPLICATE KEY UPDATE status = status`,
      { mid: randomUUID(), cid: c.id, uid: req.user.id }
    );
    broadcastClassUpdate(c.id); // 通知班主任刷新待审核列表
    res.json({ ok: true, class_id: c.id, message: '申请已提交,等待班主任审核' });
  } catch (err) {
    next(err);
  }
});

// GET /api/classes/:id  班级详情 + 成员名单(含 pending)+ 大屏账号(仅 owner 或已批准成员可见)
router.get('/:id', async (req, res, next) => {
  try {
    const cls = await loadClass(req, res);
    if (!cls) return;
    if (!(await isOwnerOrApprovedMember(cls, req.user.id))) {
      return res.status(403).json({ error: '无权查看该班级' });
    }
    const [members] = await pool.query(
      `SELECT u.id, u.username, u.display_name, u.role, u.avatar, cm.status, cm.created_at AS joined_at
         FROM class_members cm JOIN users u ON u.id = cm.user_id
        WHERE cm.class_id = :cid
        ORDER BY cm.status DESC, cm.id`,
      { cid: cls.id }
    );
    const screen = await loadScreen(cls);
    res.json({ class: cls, members, screen });
  } catch (err) {
    next(err);
  }
});

// POST /api/classes/:id/review { user_id, action: approve|reject }  班主任审核入班申请
router.post('/:id/review', async (req, res, next) => {
  try {
    const cls = await loadClass(req, res);
    if (!cls) return;
    if (cls.owner_id !== req.user.id) return res.status(403).json({ error: '仅班主任可审核' });
    const userId = String(req.body?.user_id || '').trim();
    const { action } = req.body || {};
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'action 必须是 approve / reject' });
    }
    if (action === 'approve') {
      const [r] = await pool.query(
        `UPDATE class_members SET status = 'approved'
          WHERE class_id = :cid AND user_id = :uid AND status = 'pending'`,
        { cid: cls.id, uid: userId }
      );
      if (!r.affectedRows) return res.status(404).json({ error: '未找到该用户的待审核申请' });
    } else {
      const [r] = await pool.query('DELETE FROM class_members WHERE class_id = :cid AND user_id = :uid', {
        cid: cls.id,
        uid: userId,
      });
      if (!r.affectedRows) return res.status(404).json({ error: '未找到该申请' });
    }
    broadcastClassUpdate(cls.id); // 审核结果同步给全体成员(含大屏 B)
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/classes/:id/members/:userId  班主任移除成员
router.delete('/:id/members/:userId', async (req, res, next) => {
  try {
    const cls = await loadClass(req, res);
    if (!cls) return;
    if (cls.owner_id !== req.user.id) return res.status(403).json({ error: '仅班主任可移除成员' });
    const userId = req.params.userId;
    const [r] = await pool.query('DELETE FROM class_members WHERE class_id = :cid AND user_id = :uid', {
      cid: cls.id,
      uid: userId,
    });
    if (!r.affectedRows) return res.status(404).json({ error: '成员不存在' });
    broadcastClassUpdate(cls.id); // 成员变动同步给全体成员(含大屏 B)
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// PUT /api/classes/:id/screen/password { password }  班主任重置大屏账号密码
router.put('/:id/screen/password', async (req, res, next) => {
  try {
    const cls = await loadClass(req, res);
    if (!cls) return;
    if (cls.owner_id !== req.user.id) return res.status(403).json({ error: '仅班主任可重置大屏密码' });
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

// DELETE /api/classes/:id  班主任删除班级:自动删除该班大屏(B)账号
router.delete('/:id', async (req, res, next) => {
  try {
    const cls = await loadClass(req, res);
    if (!cls) return;
    if (cls.owner_id !== req.user.id) return res.status(403).json({ error: '仅班主任可删除班级' });
    await withTransaction(async (conn) => {
      // 先删大屏账号(级联清理其消息/订阅),再删班级(级联成员)
      await conn.query(`DELETE FROM users WHERE class_id = :cid AND role = 'screen'`, { cid: cls.id });
      await conn.query('DELETE FROM classes WHERE id = :id', { id: cls.id });
    });
    broadcastClassUpdate(cls.id); // 通知原成员刷新班级列表
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
