// 一键初始化(替代 db:init + seed):
//   1. 生成 .env(不存在时从 .env.example 复制)
//   2. 生成随机 JWT_SECRET(缺失或仍为占位值时写入 .env)
//   3. 建库建表(server/src/db/init.js)
//   4. 创建/重置管理员(server/src/seed.js,默认 admin/admin123)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const envPath = path.join(ROOT, '.env');
const examplePath = path.join(ROOT, '.env.example');

// 1. 确保 .env 存在(从 .env.example 复制)
if (!fs.existsSync(envPath)) {
  if (fs.existsSync(examplePath)) {
    fs.copyFileSync(examplePath, envPath);
    console.log('[init] 已生成 .env(基于 .env.example,请按需修改数据库等配置)');
  } else {
    console.warn('[init] 未找到 .env.example,跳过 .env 生成');
  }
}

// 2. JWT_SECRET:缺失或仍为占位值时,生成 96 位十六进制随机串写入 .env
if (fs.existsSync(envPath)) {
  let env = fs.readFileSync(envPath, 'utf8');
  const m = env.match(/^JWT_SECRET=(.*)$/m);
  const cur = m ? m[1].trim() : '';
  if (!cur || /^(change-me-to-a-long-random-string|please-change-me)$/i.test(cur)) {
    const secret = crypto.randomBytes(48).toString('hex');
    env = m
      ? env.replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${secret}`)
      : env + (env.endsWith('\n') ? '' : '\n') + `JWT_SECRET=${secret}\n`;
    fs.writeFileSync(envPath, env);
    console.log('[init] 已生成随机 JWT_SECRET 并写入 .env');
  }
}

// 3. 建库建表(动态 import:此时 .env 已就绪,init.js 内部会自行加载)
await import('./db/init.js');

// 4. 创建/重置管理员
await import('./seed.js');

console.log('[init] ✅ 初始化完成:数据库就绪 + 管理员账号就绪(admin/admin123,可用 ADMIN_USERNAME/ADMIN_PASSWORD 覆盖)');
