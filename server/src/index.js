import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import dns from 'node:dns';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { config, ROOT } from './config.js';
import routes from './routes/index.js';
import { initSocket } from './socket/index.js';
import './db/pool.js'; // 初始化连接池

// 关键:服务器 IPv6 不可达时,DNS 默认 IPv6 优先会导致 APNs(FCM)推送全部连接失败。
// 必须最先设置,进程内所有 fetch(web-push、Graph)统一 IPv4 优先。
dns.setDefaultResultOrder('ipv4first');

const app = express();

app.use(cors({ origin: config.clientOrigin, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use('/api', routes);

// 托管前端构建产物(client/dist):单端口全栈部署(443/80 映射直连本服务即可)
const distDir = path.join(ROOT, '..', 'client', 'dist');
if (fs.existsSync(distDir)) {
  app.use(
    express.static(distDir, {
      // index.html / sw.js / manifest 不缓存(保证更新即时生效);
      // 带内容哈希的 /assets/* 长缓存 immutable
      setHeaders(res, filePath) {
        const norm = filePath.replace(/\\/g, '/');
        if (norm.endsWith('/index.html') || norm.endsWith('/sw.js') || norm.endsWith('/manifest.webmanifest')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        } else if (norm.includes('/assets/')) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    })
  );
  // SPA fallback:非 API / 非 socket.io 的 GET 都返回 index.html(no-cache)
  app.get(/^\/(?!api\/|socket\.io).*/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(distDir, 'index.html'));
  });
  console.log(`[chatroom] 前端静态托管: ${distDir}`);
} else {
  console.warn(`[chatroom] 未找到前端产物 ${distDir},仅提供 API(请先 npm --prefix client run build)`);
}

// 统一错误处理
app.use((err, req, res, _next) => {
  console.error('[http error]', err);
  // 生产环境不向客户端泄露内部错误详情(数据库 SQL、表名、堆栈等)
  const message =
    process.env.NODE_ENV === 'production'
      ? '服务器错误'
      : err.message || '服务器错误';
  res.status(err.statusCode || 500).json({ error: message });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: config.clientOrigin, credentials: true },
});

// 实时通道:握手鉴权 + 个人/班级房间
initSocket(io);

server.listen(config.port, () => {
  console.log(`[chatroom] 服务已启动: http://localhost:${config.port}`);
});
