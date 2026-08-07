import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { pool } from '../db/pool.js';

/** 签发 7 天有效的 JWT */
export function signToken(user) {
  return jwt.sign({ uid: user.id, role: user.role }, config.jwtSecret, { expiresIn: '7d' });
}

/** 认证中间件:校验 Bearer token 并加载用户到 req.user */
export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) return res.status(401).json({ error: '未登录' });

    const payload = jwt.verify(token, config.jwtSecret);
    const [rows] = await pool.query(
      `SELECT id, username, display_name, role, avatar, created_at
         FROM users WHERE id = :id`,
      { id: payload.uid }
    );
    if (!rows.length) return res.status(401).json({ error: '账号不存在' });
    req.user = rows[0];
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') return res.status(401).json({ error: '登录已过期' });
    return res.status(401).json({ error: '登录无效' });
  }
}

/** 角色校验中间件,用法:requireRole('admin') 或 requireRole('c','a','b') */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: '未登录' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: '无权限' });
    next();
  };
}

/** 去除敏感字段的用户视图 */
export function publicUser(u) {
  return {
    id: u.id,
    username: u.username,
    display_name: u.display_name,
    role: u.role,
    avatar: u.avatar,
    created_at: u.created_at,
  };
}
