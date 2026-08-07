// 一键初始化(替代 db:init + seed):
//   1. 生成 .env(不存在时从 .env.example 复制)
//   2. 生成随机 JWT_SECRET(缺失或仍为占位值时写入 .env)
//   3. 生成 VAPID 密钥对(Web Push,VAPID_PUBLIC_KEY/PRIVATE_KEY 为空时写入 .env)
//   4. 建库建表(server/src/db/init.js)
//   5. 创建/重置管理员(server/src/seed.js,默认 admin/admin123)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import webpush from 'web-push';

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

// 2. 自动补全密钥:JWT_SECRET(缺失/占位 → 随机 96 位 hex)与 VAPID(为空 → 生成密钥对)
if (fs.existsSync(envPath)) {
  let env = fs.readFileSync(envPath, 'utf8');
  const get = (k) => {
    const m = env.match(new RegExp(`^${k}=(.*)$`, 'm'));
    return m ? m[1].trim() : '';
  };
  const set = (k, v) => {
    env = new RegExp(`^${k}=.*$`, 'm').test(env)
      ? env.replace(new RegExp(`^${k}=.*$`, 'm'), `${k}=${v}`)
      : env + (env.endsWith('\n') ? '' : '\n') + `${k}=${v}\n`;
  };

  const jwt = get('JWT_SECRET');
  if (!jwt || /^(change-me-to-a-long-random-string|please-change-me)$/i.test(jwt)) {
    set('JWT_SECRET', crypto.randomBytes(48).toString('hex'));
    console.log('[init] 已生成随机 JWT_SECRET 并写入 .env');
  }

  if (!get('VAPID_PUBLIC_KEY') && !get('VAPID_PRIVATE_KEY')) {
    const { publicKey, privateKey } = webpush.generateVAPIDKeys();
    set('VAPID_PUBLIC_KEY', publicKey);
    set('VAPID_PRIVATE_KEY', privateKey);
    console.log('[init] 已生成 VAPID 密钥对(Web Push)并写入 .env');
  }

  fs.writeFileSync(envPath, env);
}

// 3. 建库建表(动态 import:此时 .env 已就绪,init.js 内部会自行加载)
await import('./db/init.js');

// 4. 创建/重置管理员
await import('./seed.js');

console.log(
  '[init] ✅ 初始化完成:数据库就绪 + 管理员就绪(admin/admin123,可用 ADMIN_USERNAME/ADMIN_PASSWORD 覆盖) + JWT/VAPID 密钥就绪'
);
