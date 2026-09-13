/**
 * 文件记录管理路由 — PostgreSQL CRUD
 * 文件: src/routes/file-records.ts
 */

import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { pool } from '../config/db';
import { success, error } from '../middleware/response';
import type { FileRecord, FileRecordListQuery } from '../types';

const router = Router();

// ── 上传目录 ──
const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'file-records');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// ── 帮助函数：修复 multer 中文文件名编码问题 ──
function fixFilenameEncoding(name: string): string {
  if (!name) return name;
  try {
    if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(name)) return name;
    const buf = Buffer.from(name, 'latin1');
    const utf8 = buf.toString('utf8');
    if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(utf8)) return utf8;
    if (/[\u00c0-\u00ff]{2,}/.test(name)) return utf8;
  } catch { /* ignore */ }
  return name;
}

// ── Multer 配置 ──
const storage = multer.diskStorage({
  destination: (req: any, file: any, cb: any) => { cb(null, uploadDir); },
  filename: (req: any, file: any, cb: any) => {
    const originalname = fixFilenameEncoding(file.originalname);
    const ext = path.extname(originalname);
    const name = Date.now() + '-' + Math.round(Math.random() * 1e9) + ext;
    cb(null, name);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

// ── 初始化数据库表 ──
(async function initTable(): Promise<void> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS file_records (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(500) NOT NULL,
        original_name VARCHAR(500) NOT NULL,
        file_type VARCHAR(50) DEFAULT 'other',
        size BIGINT DEFAULT 0,
        mimetype VARCHAR(200) DEFAULT '',
        module VARCHAR(100) DEFAULT 'general',
        uploaded_by VARCHAR(200) DEFAULT '',
        user_id VARCHAR(200) DEFAULT '',
        record_id VARCHAR(200) DEFAULT '',
        extra_info TEXT DEFAULT '',
        filepath VARCHAR(1000) DEFAULT '',
        is_deleted BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('[FileRecords] 数据库表 file_records 已就绪');
  } catch (err: any) {
    console.warn('[FileRecords] 数据库表初始化失败（内存模式）:', err.message);
  }
})();

// ── 帮助函数：检测文件类型 ──
function detectFileType(mimetype: string): string {
  if (!mimetype) return 'other';
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  if (mimetype.startsWith('audio/')) return 'audio';
  if (mimetype === 'application/pdf') return 'pdf';
  if (mimetype.includes('word') || mimetype.includes('document')) return 'document';
  if (mimetype.includes('spreadsheet') || mimetype.includes('excel') || mimetype.includes('csv')) return 'spreadsheet';
  if (mimetype.includes('presentation') || mimetype.includes('powerpoint')) return 'presentation';
  if (mimetype.includes('zip') || mimetype.includes('rar') || mimetype.includes('7z') || mimetype.includes('tar')) return 'archive';
  if (mimetype.startsWith('text/')) return 'text';
  return 'other';
}

function formatSize(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + units[i];
}

// ══════════════ 路由 ══════════════

// GET /api/file-records — 列表
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const query: FileRecordListQuery = req.query as any;
    const limit = Math.min(parseInt(query.limit || '50', 10) || 50, 200);
    const offset = ((parseInt(query.page || '1', 10) || 1) - 1) * limit;

    const where: string[] = ['is_deleted = false'];
    const params: any[] = [];
    let idx = 1;

    if (query.search) {
      where.push('(original_name ILIKE $' + idx + ' OR filename ILIKE $' + idx + ')');
      params.push('%' + query.search + '%');
      idx++;
    }
    if (query.type) {
      where.push('file_type = $' + idx);
      params.push(query.type);
      idx++;
    }
    if (query.module && query.module !== '') {
      where.push('module = $' + idx);
      params.push(query.module);
      idx++;
    }

    let orderBy = 'created_at DESC';
    if (query.sort === 'asc') orderBy = 'created_at ASC';
    if (query.sort === 'name') orderBy = 'original_name ASC';
    if (query.sort === 'size') orderBy = 'size DESC';

    const countResult = await pool.query(
      'SELECT COUNT(*) AS total FROM file_records WHERE ' + where.join(' AND '),
      params
    );
    const total = parseInt(countResult.rows[0].total, 10);

    params.push(limit);
    params.push(offset);
    const result = await pool.query(
      'SELECT * FROM file_records WHERE ' + where.join(' AND ') +
      ' ORDER BY ' + orderBy + ' LIMIT $' + idx + ' OFFSET $' + (idx + 1),
      params
    );

    const files = result.rows.map((r: any) => ({
      id: r.id,
      filename: r.filename,
      originalName: r.original_name,
      fileType: r.file_type,
      size: r.size,
      sizeFormatted: formatSize(r.size),
      mimetype: r.mimetype,
      module: r.module,
      uploadedBy: r.uploaded_by,
      userId: r.user_id,
      recordId: r.record_id,
      extraInfo: r.extra_info,
      filepath: r.filepath,
      uploadDate: r.created_at,
      uploadTime: r.created_at,
    }));

    res.json(success({ files, total, limit, offset }, '查询成功'));
  } catch (err: any) {
    console.error('[FileRecords] 列表查询失败:', err.message);
    res.json(error(-1, '查询文件列表失败: ' + err.message));
  }
});

// GET /api/file-records/:id — 单个文件
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.json(error(-1, '无效的文件ID'));
      return;
    }
    const result = await pool.query('SELECT * FROM file_records WHERE id = $1 AND is_deleted = false', [id]);
    if (result.rows.length === 0) {
      res.json(error(-2, '文件不存在'));
      return;
    }
    const r = result.rows[0];
    res.json(success({
      id: r.id, filename: r.filename, originalName: r.original_name,
      fileType: r.file_type, size: r.size, sizeFormatted: formatSize(r.size),
      mimetype: r.mimetype, module: r.module, uploadedBy: r.uploaded_by,
      uploadDate: r.created_at, filepath: r.filepath,
    }, '查询成功'));
  } catch (err: any) {
    res.json(error(-1, err.message));
  }
});

// POST /api/file-records/upload — 上传文件
router.post('/upload', upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.json(error(-1, '请选择要上传的文件'));
      return;
    }

    const file = req.file;
    const body = req.body || {};

    const originalname = fixFilenameEncoding(file.originalname);
    const fileType = detectFileType(file.mimetype);

    const result = await pool.query(
      `INSERT INTO file_records (filename, original_name, file_type, size, mimetype, module, uploaded_by, user_id, record_id, extra_info, filepath)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id, created_at`,
      [
        file.filename,
        originalname,
        fileType,
        file.size,
        file.mimetype,
        body.module || 'general',
        body.uploadedBy || '',
        body.userId || '',
        body.recordId || '',
        body.extraInfo || '',
        file.path,
      ]
    );

    const row = result.rows[0];
    res.json(success({
      id: row.id,
      filename: file.filename,
      originalName: originalname,
      fileType,
      size: file.size,
      sizeFormatted: formatSize(file.size),
      mimetype: file.mimetype,
      module: body.module || 'general',
      uploadedBy: body.uploadedBy || '',
      uploadDate: row.created_at,
    }, '上传成功'));
  } catch (err: any) {
    console.error('[FileRecords] 上传失败:', err.message);
    res.json(error(-2, '上传失败: ' + err.message));
  }
});

// GET /api/file-records/download/:id — 下载文件
router.get('/download/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.json(error(-1, '无效的文件ID'));
      return;
    }

    const result = await pool.query('SELECT * FROM file_records WHERE id = $1 AND is_deleted = false', [id]);
    if (result.rows.length === 0) {
      res.json(error(-2, '文件不存在'));
      return;
    }

    const record: FileRecord = result.rows[0];
    const filePath = record.filepath;

    if (!filePath || !fs.existsSync(filePath)) {
      res.json(error(-3, '文件已被删除或不存在'));
      return;
    }

    res.download(filePath, record.original_name);
  } catch (err: any) {
    res.json(error(-4, err.message));
  }
});

// DELETE /api/file-records/:id — 软删除
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.json(error(-1, '无效的文件ID'));
      return;
    }

    const result = await pool.query(
      'UPDATE file_records SET is_deleted = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND is_deleted = false',
      [id]
    );

    if (result.rowCount === 0) {
      res.json(error(-2, '文件不存在或已删除'));
      return;
    }
    res.json(success(null, '删除成功'));
  } catch (err: any) {
    res.json(error(-3, err.message));
  }
});

export default router;
