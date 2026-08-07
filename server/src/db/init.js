import mysql from 'mysql2/promise';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '..', '.env') });

const host = process.env.DB_HOST || '127.0.0.1';
const port = Number(process.env.DB_PORT || 3306);
const user = process.env.DB_USER || 'root';
const password = process.env.DB_PASSWORD || '';
const dbName = process.env.DB_NAME || 'chatroom';

async function main() {
  const conn = await mysql.createConnection({ host, port, user, password, multipleStatements: true });
  await conn.query(
    `CREATE DATABASE IF NOT EXISTS \`${dbName}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await conn.query(`USE \`${dbName}\``);
  const schema = readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await conn.query(schema);
  // users.class_id 外键(指向 classes,班级删除时置空,由应用层先删大屏账号)
  try {
    await conn.query(
      'ALTER TABLE users ADD CONSTRAINT fk_users_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL'
    );
  } catch {
    /* 已存在则跳过(幂等) */
  }
  console.log(`[db:init] 数据库「${dbName}」初始化完成(${host}:${port})`);
  await conn.end();
}

await main().catch((err) => {
  console.error('[db:init] 失败:', err.message);
  process.exit(1);
});
