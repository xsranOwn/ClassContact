import https from 'node:https';
import dns from 'node:dns';
import webpush from 'web-push';
import { config } from '../config.js';
import { pool } from '../db/pool.js';

/**
 * 关键修复:Node 20+ 的 https 默认 autoSelectFamily 会并发解析并先连 IPv6,
 * 服务器 IPv6 不可达(黑洞)会把连接整个拖超时 → APNs(web.push.apple.com)推送
 * 全部 ETIMEDOUT。此处关闭 autoSelectFamily 并强制 IPv4 解析,推送直连成功。
 */
const ipv4Agent = new https.Agent({
  autoSelectFamily: false,
  keepAlive: true,
  lookup: (hostname, opts, cb) => dns.lookup(hostname, { ...opts, family: 4, all: false }, cb),
});

export function vapidConfigured() {
  return Boolean(config.vapid.publicKey && config.vapid.privateKey);
}

/** 向指定用户的所有订阅推送 Web Push 通知(失效订阅自动清理) */
export async function sendPushToUser(userId, { title, body, data = {} }) {
  if (!vapidConfigured()) return;
  webpush.setVapidDetails(config.vapid.subject, config.vapid.publicKey, config.vapid.privateKey);
  const [subs] = await pool.query(
    'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = :uid',
    { uid: userId }
  );
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title, body, data }),
        { TTL: 300, agent: ipv4Agent }
      );
    } catch (err) {
      // 404/410 = 订阅已失效,清理
      if (err.statusCode === 404 || err.statusCode === 410) {
        await pool.query('DELETE FROM push_subscriptions WHERE id = :id', { id: s.id });
      } else {
        console.error('[push] 发送失败:', err.statusCode || '', err.message);
      }
    }
  }
}
