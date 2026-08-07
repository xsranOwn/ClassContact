import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { sendPushToUser } from '../services/push.js';

const router = Router();
router.use(requireAuth);

// GET /api/push/vapid-public-key  前端订阅所需的 VAPID 公钥
router.get('/vapid-public-key', (_req, res) => {
  res.json({ publicKey: config.vapid.publicKey || '' });
});

// POST /api/push/subscribe { endpoint, keys: { p256dh, auth } }  保存订阅
router.post('/subscribe', async (req, res, next) => {
  try {
    const { endpoint, keys } = req.body || {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: 'endpoint / keys.p256dh / keys.auth 必填' });
    }
    const id = randomUUID();
    await pool.query(
      `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth)
       VALUES (:id, :uid, :endpoint, :p256dh, :auth)
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), p256dh = VALUES(p256dh), auth = VALUES(auth)`,
      { id, uid: req.user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth }
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/push/unsubscribe { endpoint }  取消订阅
router.post('/unsubscribe', async (req, res, next) => {
  try {
    const { endpoint } = req.body || {};
    if (!endpoint) return res.status(400).json({ error: 'endpoint 必填' });
    await pool.query('DELETE FROM push_subscriptions WHERE endpoint = :endpoint AND user_id = :uid', { endpoint, uid: req.user.id });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/push/test  给自己发送一条测试推送(验证通知链路)
router.post('/test', async (req, res, next) => {
  try {
    await sendPushToUser(req.user.id, {
      title: '测试通知',
      body: '这是一条测试推送,通知功能正常',
      data: { from: req.user.id, type: 'text' },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
