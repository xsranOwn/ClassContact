import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 无论 cwd 在哪,都从项目根目录加载 .env
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

export const ROOT = path.join(__dirname, '..');

export const config = {
  port: Number(process.env.PORT || 3000),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  clientOrigin: (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    name: process.env.DB_NAME || 'chatroom',
  },

  graph: {
    tenantId: process.env.GRAPH_TENANT_ID || '',
    clientId: process.env.GRAPH_CLIENT_ID || '',
    clientSecret: process.env.GRAPH_CLIENT_SECRET || '',
    // 二选一:配置 driveId 用 /drives/{id};配置 userUpn(如 classroom@xxx.onmicrosoft.com)用 /users/{upn}/drive
    driveId: process.env.GRAPH_DRIVE_ID || '',
    userUpn: process.env.GRAPH_USER_UPN || '',
    filesRoot: process.env.GRAPH_FILES_ROOT || 'chatroom-files',
  },

  vapid: {
    publicKey: process.env.VAPID_PUBLIC_KEY || '',
    privateKey: process.env.VAPID_PRIVATE_KEY || '',
    subject: process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
  },

  // 文件上传的本地暂存目录(Graph 上传失败时的兜底,生产可忽略)
  uploadsDir: path.join(__dirname, '..', 'uploads'),
};

export function isGraphConfigured() {
  const creds = config.graph.tenantId && config.graph.clientId && config.graph.clientSecret;
  return Boolean(creds && (config.graph.driveId || config.graph.userUpn));
}
