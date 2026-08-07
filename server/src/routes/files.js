import { Router } from 'express';
import multer from 'multer';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { getIO } from '../socket/index.js';
import { uploadFile, createUploadSession, getDownloadUrl, deleteFile } from '../services/onedrive.js';

const router = Router();
router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

// POST /api/files/upload-url { file_name }  创建浏览器直传会话(不经服务器转发文件内容)
// 返回 upload_url:浏览器分片 PUT 直传 OneDrive(免鉴权、限时、仅该路径)
router.post('/upload-url', async (req, res, next) => {
  try {
    // JSON body 已是正确 UTF-8,直接使用(不能套用 multipart 的 latin1 兼容转换,否则中文乱码)
    const originalName = (req.body?.file_name || '').trim();
    if (!originalName) return res.status(400).json({ error: 'file_name 必填' });
    const { uploadUrl } = await createUploadSession(originalName);
    res.status(201).json({ upload_url: uploadUrl, file_name: originalName });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
});

// POST /api/files/upload  multipart/form-data,字段名 file
// 上传到 OneDrive 企业版,返回 file_url(graph:{itemId})供消息引用
router.post('/upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: '缺少文件字段 file' });
    // busboy 以 latin1 解码 multipart 文件名,转回 UTF-8 避免中文乱码
    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    const meta = await uploadFile(originalName, req.file.buffer);
    res.status(201).json({
      file: {
        file_url: `graph:${meta.itemId}`,
        // 展示上传原始名称(Graph 存储路径带时间戳前缀,不用于展示)
        file_name: originalName,
        file_size: meta.size,
        mime: req.file.mimetype,
      },
    });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
});

// GET /api/files/download/:itemId  302 重定向到 Graph 签名下载地址(浏览器可直接下载/预览)
router.get('/download/:itemId', async (req, res, next) => {
  try {
    // 已删除的文件消息拒绝下载(删除状态持久化到 messages.file_deleted)
    const [del] = await pool.query(
      `SELECT id FROM messages WHERE file_url = :url AND file_deleted = 1 LIMIT 1`,
      { url: `graph:${req.params.itemId}` }
    );
    if (del.length) return res.status(403).json({ error: '文件已被删除' });
    const url = await getDownloadUrl(req.params.itemId);
    res.redirect(url);
  } catch (err) {
    if (err.statusCode === 404) {
      // OneDrive 文件已不存在(文件夹/文件被外部删除):同步标记对应消息为已删除
      await pool
        .query(
          `UPDATE messages SET file_deleted = 1
            WHERE file_url = :url AND file_deleted = 0`,
          { url: `graph:${req.params.itemId}` }
        )
        .catch(() => {});
      return res.status(404).json({ error: '文件已被删除' });
    }
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
});

// DELETE /api/files/:itemId  从 OneDrive 删除
router.delete('/:itemId', async (req, res, next) => {
  try {
    await deleteFile(req.params.itemId);
    res.json({ ok: true });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
});

export default router;
