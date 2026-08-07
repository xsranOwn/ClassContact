// 浏览器直传 OneDrive(不经服务器转发):签发会话 → 分片 PUT → 返回消息元信息
// 按文件 MIME 自动判定消息类型:image / video / file
export async function uploadDirect(file, onProgress, signal) {
  // 1. 服务器签发直传会话(仅生成 upload_url,不转发文件)
  const res = await fetch('/api/files/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
    body: JSON.stringify({ file_name: file.name }),
    signal,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || '获取上传地址失败');
  const { upload_url, file_name } = j;

  // 2. 分片直传(片 5MB,Graph 要求除最后一片外 >=320KB 且为倍数)
  const CHUNK = 5 * 1024 * 1024;
  const total = file.size;
  let offset = 0;
  while (offset < total) {
    const end = Math.min(offset + CHUNK, total);
    const r = await fetch(upload_url, {
      method: 'PUT',
      headers: {
        'Content-Length': String(end - offset),
        'Content-Range': `bytes ${offset}-${end - 1}/${total}`,
      },
      body: file.slice(offset, end),
      signal,
    });
    if (r.status === 201) {
      const item = await r.json();
      onProgress(100);
      const type = file.type?.startsWith('image/') ? 'image' : file.type?.startsWith('video/') ? 'video' : 'file';
      return { file_url: `graph:${item.id}`, file_name, file_size: total, type };
    }
    if (r.status !== 202) {
      throw new Error(`上传失败(HTTP ${r.status})`);
    }
    offset = end;
    onProgress(Math.round((offset / total) * 100));
  }
  throw new Error('上传未完成');
}
