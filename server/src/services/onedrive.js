import { config, isGraphConfigured } from '../config.js';

const GRAPH = 'https://graph.microsoft.com/v1.0';
let cachedToken = null;
let tokenExpiresAt = 0;

/** 驱动器基础路径:优先 /drives/{driveId},否则按用户账号 /users/{upn}/drive */
function baseDrive() {
  const { driveId, userUpn } = config.graph;
  return driveId ? `/drives/${driveId}` : `/users/${encodeURIComponent(userUpn)}/drive`;
}

/** 客户端凭据流获取 Graph access_token(带缓存) */
async function getToken() {
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) return cachedToken;
  const body = new URLSearchParams({
    client_id: config.graph.clientId,
    client_secret: config.graph.clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });
  const r = await fetch(
    `https://login.microsoftonline.com/${config.graph.tenantId}/oauth2/v2.0/token`,
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }
  );
  if (!r.ok) {
    throw new Error(`获取 Graph token 失败: ${r.status} ${(await r.text()).slice(0, 200)}`);
  }
  const j = await r.json();
  cachedToken = j.access_token;
  tokenExpiresAt = Date.now() + (j.expires_in || 3600) * 1000;
  return cachedToken;
}

/** 路径按段 URL 编码(保留 /) */
function encodePath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

/** SharePoint 文件名消毒:禁止字符/保留名/首尾点空格/控制字符,防 Graph 400 */
function sanitizeFileName(name) {
  let s = String(name || 'file')
    .replace(/[\\/:*?"<>|#%&{}$!@`'~\[\]\x00-\x1f]/g, '_')
    .trim();
  s = s.replace(/^[. ]+|[. ]+$/g, '_');
  s = s.replace(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i, '_$&');
  return s.slice(0, 100) || 'file';
}

/** 确保上传根目录存在(幂等:409 表示已存在) */
async function ensureRoot() {
  const token = await getToken();
  const r = await fetch(`${GRAPH}${baseDrive()}/root/children`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: config.graph.filesRoot, folder: {} }),
  });
  if (r.status !== 201 && r.status !== 409) {
    throw new Error(`创建 OneDrive 根目录失败: ${r.status}`);
  }
}

/** 确保按月目录存在(如 2026-08,幂等) */
async function ensureMonthDir(month) {
  const token = await getToken();
  const r = await fetch(`${GRAPH}${baseDrive()}/root:/${encodePath(config.graph.filesRoot)}:/children`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: month, folder: {} }),
  });
  if (r.status !== 201 && r.status !== 409) {
    throw new Error(`创建 OneDrive 月份目录失败: ${r.status}`);
  }
}

/** 当前月份目录名,如 2026-08(按服务器本地时间,避免月初 8 点前 UTC 串月) */
function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** 上传文件到 OneDrive 企业版(按月分文件夹),返回 itemId / name / size */
export async function uploadFile(fileName, buffer) {
  if (!isGraphConfigured()) {
    throw Object.assign(
      new Error('OneDrive 未配置:请在项目根目录 .env 填写 GRAPH_TENANT_ID/GRAPH_CLIENT_ID/GRAPH_CLIENT_SECRET/GRAPH_DRIVE_ID 后重启(见 README OneDrive 接入)'),
      { statusCode: 503 }
    );
  }
  await ensureRoot();
  const month = currentMonth();
  await ensureMonthDir(month);
  const token = await getToken();
  const safeName = fileName.replace(/[\\/:*?"<>|]/g, '_').slice(0, 100) || 'file';
  const path = `${config.graph.filesRoot}/${month}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
  const r = await fetch(`${GRAPH}${baseDrive()}/root:/${encodePath(path)}:/content`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
    body: buffer,
  });
  if (!r.ok) {
    throw new Error(`上传 OneDrive 失败: ${r.status} ${(await r.text()).slice(0, 300)}`);
  }
  const j = await r.json();
  return { itemId: j.id, name: j.name, size: j.size };
}

/** 创建分片上传会话(浏览器直传 OneDrive,服务器不转发文件内容)
 *  返回的 uploadUrl 免鉴权、限时、仅能传至该路径 */
export async function createUploadSession(fileName) {
  if (!isGraphConfigured()) {
    throw Object.assign(
      new Error('OneDrive 未配置:请在项目根目录 .env 填写 GRAPH_* 后重启'),
      { statusCode: 503 }
    );
  }
  await ensureRoot();
  const month = currentMonth();
  await ensureMonthDir(month);
  const token = await getToken();
  const safeName = sanitizeFileName(fileName);
  const path = `${config.graph.filesRoot}/${month}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
  const r = await fetch(`${GRAPH}${baseDrive()}/root:/${encodePath(path)}:/createUploadSession`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'rename' } }),
  });
  if (!r.ok) {
    throw new Error(`创建上传会话失败: ${r.status} ${(await r.text()).slice(0, 200)}`);
  }
  const j = await r.json();
  return { uploadUrl: j.uploadUrl, path };
}

/** 获取文件的临时签名下载 URL(供下载/预览);文件不存在时抛 { statusCode: 404 } */
export async function getDownloadUrl(itemId) {
  if (!isGraphConfigured()) {
    throw Object.assign(new Error('OneDrive 未配置:请在项目根目录 .env 填写 GRAPH_* 后重启'), { statusCode: 503 });
  }
  const token = await getToken();
  const r = await fetch(`${GRAPH}${baseDrive()}/items/${itemId}?select=@microsoft.graph.downloadUrl,name,size`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (r.status === 404) throw Object.assign(new Error('文件在 OneDrive 中已不存在'), { statusCode: 404 });
  if (!r.ok) throw new Error(`获取下载地址失败: ${r.status}`);
  const j = await r.json();
  if (!j['@microsoft.graph.downloadUrl']) throw new Error('Graph 未返回下载地址');
  return j['@microsoft.graph.downloadUrl'];
}

/** 从消息 file_url 解析 OneDrive itemId:
 *  仅接受 graph: 前缀 + 合法 itemId 字符(字母/数字/! . _ -),
 *  异常值(URL、路径片段、脏数据)返回 null,避免拼入 Graph 请求路径 */
export function parseItemId(fileUrl) {
  const m = String(fileUrl || '').match(/^graph:([A-Za-z0-9!._-]{8,200})$/);
  return m ? m[1] : null;
}

/** 从 OneDrive 删除文件 */
export async function deleteFile(itemId) {
  if (!isGraphConfigured()) {
    throw Object.assign(new Error('OneDrive 未配置:请在项目根目录 .env 填写 GRAPH_* 后重启'), { statusCode: 503 });
  }
  const token = await getToken();
  const r = await fetch(`${GRAPH}${baseDrive()}/items/${itemId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok && r.status !== 404) throw new Error(`删除 OneDrive 文件失败: ${r.status}`);
  return true;
}
