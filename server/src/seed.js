import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { pool } from './db/pool.js';

/**
 * 初始化/重置管理员账号(默认 admin / admin123)
 * 可通过环境变量 ADMIN_USERNAME / ADMIN_PASSWORD 覆盖。
 * 依赖先执行 `npm run db:init` 完成建表。
 */
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

async function main() {
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  await pool.query(
    `INSERT INTO users (id, username, password_hash, display_name, role)
     VALUES (:id, :username, :hash, '系统管理员', 'admin')
     ON DUPLICATE KEY UPDATE
       password_hash = VALUES(password_hash),
       display_name  = VALUES(display_name)`,
    { id: randomUUID(), username: ADMIN_USERNAME, hash }
  );
  console.log(`[seed] 管理员账号就绪: ${ADMIN_USERNAME}`);
  await pool.end();
}

await main().catch((err) => {
  console.error('[seed] 失败:', err.message);
  process.exit(1);
});
