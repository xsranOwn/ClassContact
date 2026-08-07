import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// GET /api/users/friends  我的好友列表
router.get('/friends', async (req, res, next) => {
  try {
    const uid = req.user.id;
    const [rows] = await pool.query(
      `SELECT u.id, u.username, u.display_name, u.role, u.avatar
         FROM friendships f
         JOIN users u ON u.id = IF(f.user_a = :uid, f.user_b, f.user_a)
        WHERE f.user_a = :uid OR f.user_b = :uid
        ORDER BY u.id`,
      { uid }
    );
    res.json({ friends: rows });
  } catch (err) {
    next(err);
  }
});

export default router;
