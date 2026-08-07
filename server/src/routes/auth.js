import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db/pool.js';
import { signToken, requireAuth, publicUser } from '../middleware/auth.js';

const router = Router();

// POST /api/auth/login { username, password } -> { token, user }
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: '用户名和密码必填' });

    const [rows] = await pool.query('SELECT * FROM users WHERE username = :username', { username });
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me -> 当前登录用户
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// PUT /api/auth/me  修改自己的资料(所有角色通用)
//   { display_name }                    改名
//   { old_password, new_password }      改密码(需校验当前密码)
router.put('/me', requireAuth, async (req, res, next) => {
  try {
    const { display_name, old_password, new_password } = req.body || {};
    if (display_name !== undefined) {
      const name = String(display_name).trim();
      if (!name || name.length > 20) return res.status(400).json({ error: '显示名需为 1-20 个字符' });
      await pool.query('UPDATE users SET display_name = :name WHERE id = :id', { name, id: req.user.id });
    }
    if (new_password !== undefined) {
      if (!old_password) return res.status(400).json({ error: '请输入当前密码' });
      if (String(new_password).length < 6) return res.status(400).json({ error: '新密码至少 6 位' });
      const [rows] = await pool.query('SELECT password_hash FROM users WHERE id = :id', { id: req.user.id });
      if (!(await bcrypt.compare(old_password, rows[0].password_hash))) {
        return res.status(401).json({ error: '当前密码错误' });
      }
      const hash = await bcrypt.hash(String(new_password), 10);
      await pool.query('UPDATE users SET password_hash = :hash WHERE id = :id', { hash, id: req.user.id });
    }
    const [rows] = await pool.query(
      'SELECT id, username, display_name, role, avatar, created_at FROM users WHERE id = :id',
      { id: req.user.id }
    );
    res.json({ user: publicUser(rows[0]) });
  } catch (err) {
    next(err);
  }
});

export default router;
