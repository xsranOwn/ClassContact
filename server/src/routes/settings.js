import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

/** 年级列表(近 years_back 年,管理员可配置) */
async function gradeYears() {
  const [rows] = await pool.query(`SELECT setting_value FROM settings WHERE setting_key = 'years_back'`);
  const back = Number(rows[0]?.setting_value || 6);
  const now = new Date().getFullYear();
  const years = [];
  for (let y = now; y > now - back; y--) years.push(y);
  return years;
}

// GET /api/settings/grade-years  可选的年级列表(登录即可)
router.get('/grade-years', requireAuth, async (req, res, next) => {
  try {
    const years = await gradeYears();
    res.json({ years, years_back: years.length });
  } catch (err) {
    next(err);
  }
});

// PUT /api/settings/years-back { years_back }  管理员配置年级年数
router.put('/years-back', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const back = Number(req.body?.years_back);
    if (!back || back < 1 || back > 30) return res.status(400).json({ error: 'years_back 需为 1-30' });
    await pool.query(
      `INSERT INTO settings (setting_key, setting_value) VALUES ('years_back', :v)
       ON DUPLICATE KEY UPDATE setting_value = :v`,
      { v: String(back) }
    );
    res.json({ ok: true, years_back: back });
  } catch (err) {
    next(err);
  }
});

export default router;
