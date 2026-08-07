import mysql from 'mysql2/promise';
import { config } from '../config.js';

export const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.name,
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4_unicode_ci',
  timezone: 'Z', // 读取时按 UTC 解析(配合下方会话时区,时间统一以 UTC 存储/返回)
  namedPlaceholders: true,
});

// 会话时区设为 UTC:TIMESTAMP 列按 UTC 墙钟返回,与 timezone:'Z' 一致,
// 避免 TIMESTAMP(本地墙钟)被当作 UTC 解析造成 ±8 小时偏差
pool.on('connection', (conn) => {
  conn.query("SET time_zone = '+00:00'", (err) => {
    if (err) console.error('[pool] 设置会话时区失败:', err.message);
  });
});

/** 事务辅助:执行 fn(conn),成功后提交,失败回滚 */
export async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
