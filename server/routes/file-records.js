const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { pool } = require('../config/db');
const { success, error } = require('../middleware/response');

// ── 上传目录 ──
const uploadDir = path.join(__dirname, '..', 'uploads', 'file-records');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// ── 帮助函数：修复 multer 中文文件名编码问题 ──
// multer 对非 ASCII 文件名可能返回 Latin-1 编码的字节串，需转为 UTF-8
function fixFilenameEncoding(name) {
  if (!name) return name;
  try {
    // 如果已经是正常的 UTF-8 中文，直接返回
    if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(name)) return name;
    // 尝试 Latin-1 → UTF-8 解码
    var buf = Buffer.from(name, 'latin1');
    var utf8 = buf.toString('utf8');
    // 解码后包含中文则认为修复成功
    if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(utf8)) return utf8;
    // 检查是否有常见的乱码特征（Latin-1 高位字节）
    if (/[\u00c0-\u00ff]{2,}/.test(name)) return utf8;
  } catch(e) {}
  return name;
}

// ── Multer 配置 ──
const storage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, uploadDir); },
  filename: function (req, file, cb) {
    var originalname = fixFilenameEncoding(file.originalname);
    var ext = path.extname(originalname);
    var name = Date.now() + '-' + Math.round(Math.random() * 1e9) + ext;
    cb(null, name);
  }
});
const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// ── 初始化数据库表 ──
(async function initTable() {
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
  } catch (err) {
    console.warn('[FileRecords] 数据库表初始化失败（内存模式）:', err.message);
  }
})();

// ── 帮助函数：检测文件类型 ──
function detectFileType(mimetype) {
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

function formatSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  var k = 1024, units = ['B', 'KB', 'MB', 'GB'];
  var i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + units[i];
}

// ══════════════ 路由 ══════════════

// GET /api/file-records — 列表
router.get('/', async (req, res) => {
  try {
    var { search, type, module, sort, page, limit } = req.query;
    limit = Math.min(parseInt(limit) || 50, 200);
    var offset = ((parseInt(page) || 1) - 1) * limit;

    var where = ['is_deleted = false'];
    var params = [];
    var idx = 1;

    if (search) {
      where.push('(original_name ILIKE $' + idx + ' OR filename ILIKE $' + idx + ')');
      params.push('%' + search + '%');
      idx++;
    }
    if (type) {
      where.push('file_type = $' + idx);
      params.push(type);
      idx++;
    }
    if (module && module !== '') {
      where.push('module = $' + idx);
      params.push(module);
      idx++;
    }

    var orderBy = 'created_at DESC';
    if (sort === 'asc') orderBy = 'created_at ASC';
    if (sort === 'name') orderBy = 'original_name ASC';
    if (sort === 'size') orderBy = 'size DESC';

    // 查询总数
    var countParams = params.slice();
    var countResult = await pool.query(
      'SELECT COUNT(*) AS total FROM file_records WHERE ' + where.join(' AND '),
      countParams
    );
    var total = parseInt(countResult.rows[0].total);

    // 查询数据
    params.push(limit);
    params.push(offset);
    var result = await pool.query(
      'SELECT * FROM file_records WHERE ' + where.join(' AND ') +
      ' ORDER BY ' + orderBy + ' LIMIT $' + (idx++) + ' OFFSET $' + idx,
      params
    );

    var files = result.rows.map(function(r) {
      return {
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
        uploadTime: r.created_at
      };
    });

    res.json(success({ files: files, total: total, limit: limit, offset: offset }, '查询成功'));
  } catch (err) {
    console.error('[FileRecords] 列表查询失败:', err.message);
    res.json(error(-1, '查询文件列表失败: ' + err.message));
  }
});

// GET /api/file-records/:id — 单个文件
router.get('/:id', async (req, res) => {
  try {
    var id = parseInt(req.params.id);
    if (isNaN(id)) return res.json(error(-1, '无效的文件ID'));
    var result = await pool.query('SELECT * FROM file_records WHERE id = $1 AND is_deleted = false', [id]);
    if (result.rows.length === 0) return res.json(error(-2, '文件不存在'));
    var r = result.rows[0];
    res.json(success({
      id: r.id, filename: r.filename, originalName: r.original_name,
      fileType: r.file_type, size: r.size, sizeFormatted: formatSize(r.size),
      mimetype: r.mimetype, module: r.module, uploadedBy: r.uploaded_by,
      uploadDate: r.created_at, filepath: r.filepath
    }, '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// POST /api/file-records/upload — 上传文件
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.json(error(-1, '请选择要上传的文件'));

    var file = req.file;
    var body = req.body || {};

    // 修复中文文件名编码
    var originalname = fixFilenameEncoding(file.originalname);

    var fileType = detectFileType(file.mimetype);

    var result = await pool.query(
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
        file.path
      ]
    );

    var row = result.rows[0];
    res.json(success({
      id: row.id,
      filename: file.filename,
      originalName: originalname,
      fileType: fileType,
      size: file.size,
      sizeFormatted: formatSize(file.size),
      mimetype: file.mimetype,
      module: body.module || 'general',
      uploadedBy: body.uploadedBy || '',
      uploadDate: row.created_at
    }, '上传成功'));
  } catch (err) {
    console.error('[FileRecords] 上传失败:', err.message);
    res.json(error(-2, '上传失败: ' + err.message));
  }
});

// GET /api/file-records/download/:id — 下载文件
router.get('/download/:id', async (req, res) => {
  try {
    var id = parseInt(req.params.id);
    if (isNaN(id)) return res.json(error(-1, '无效的文件ID'));

    var result = await pool.query('SELECT * FROM file_records WHERE id = $1 AND is_deleted = false', [id]);
    if (result.rows.length === 0) return res.json(error(-2, '文件不存在'));

    var record = result.rows[0];
    var filePath = record.filepath;

    if (!filePath || !fs.existsSync(filePath)) {
      return res.json(error(-3, '文件已被删除或不存在'));
    }

    res.download(filePath, record.original_name);
  } catch (err) {
    res.json(error(-4, err.message));
  }
});

// DELETE /api/file-records/:id — 软删除
router.delete('/:id', async (req, res) => {
  try {
    var id = parseInt(req.params.id);
    if (isNaN(id)) return res.json(error(-1, '无效的文件ID'));

    var result = await pool.query(
      'UPDATE file_records SET is_deleted = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND is_deleted = false',
      [id]
    );

    if (result.rowCount === 0) return res.json(error(-2, '文件不存在或已删除'));
    res.json(success(null, '删除成功'));
  } catch (err) {
    res.json(error(-3, err.message));
  }
});

module.exports = router;
