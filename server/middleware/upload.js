const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ========= 文件名编码修复 =========
// multer 在 Windows 环境下对非 ASCII 文件名可能返回 Latin-1 编码的字节串，需转为 UTF-8
function fixFilenameEncoding(name) {
  if (!name) return name;
  if (typeof name !== 'string') return name;
  try {
    if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(name)) return name;
    const hasLatin1Extended = /[\u00c0-\u00ff]/.test(name);
    if (hasLatin1Extended) {
      const buf = Buffer.from(name, 'latin1');
      const utf8 = buf.toString('utf8');
      if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(utf8)) return utf8;
      if (/[\u00c0-\u00ff]{2,}/.test(name)) return utf8;
    }
  } catch(e) {}
  return name;
}

// ========= 上传后文件名编码修复中间件 =========
// 在 multer 处理完成后，自动修复 req.file / req.files 中的 originalname
const fixUploadFilenames = (req, res, next) => {
  try {
    if (req.file && req.file.originalname) {
      req.file.originalname = fixFilenameEncoding(req.file.originalname);
    }
    if (req.files) {
      if (Array.isArray(req.files)) {
        req.files.forEach(f => {
          if (f.originalname) f.originalname = fixFilenameEncoding(f.originalname);
        });
      } else if (typeof req.files === 'object') {
        Object.values(req.files).forEach(arr => {
          if (Array.isArray(arr)) {
            arr.forEach(f => {
              if (f.originalname) f.originalname = fixFilenameEncoding(f.originalname);
            });
          }
        });
      }
    }
  } catch(e) {
    console.warn('[Upload] 文件名编码修复失败:', e.message);
  }
  next();
};

// ========= 文件魔术字节签名（防伪造文件类型）=========
const FILE_SIGNATURES = {
  image: [
    { ext: '.jpg', offset: 0, signature: [0xFF, 0xD8, 0xFF] },
    { ext: '.jpeg', offset: 0, signature: [0xFF, 0xD8, 0xFF] },
    { ext: '.png', offset: 0, signature: [0x89, 0x50, 0x4E, 0x47] },
    { ext: '.gif', offset: 0, signature: [0x47, 0x49, 0x46, 0x38] },
    { ext: '.webp', offset: 8, signature: [0x57, 0x45, 0x42, 0x50] },
    { ext: '.bmp', offset: 0, signature: [0x42, 0x4D] }
  ],
  pdf: [
    { ext: '.pdf', offset: 0, signature: [0x25, 0x50, 0x44, 0x46] } // %PDF
  ],
  excel: [
    { ext: '.xlsx', offset: 0, signature: [0x50, 0x4B, 0x03, 0x04] }, // ZIP format (Office Open XML)
    { ext: '.xls', offset: 0, signature: [0xD0, 0xCF, 0x11, 0xE0] }  // OLE2
  ],
  word: [
    { ext: '.docx', offset: 0, signature: [0x50, 0x4B, 0x03, 0x04] },
    { ext: '.doc', offset: 0, signature: [0xD0, 0xCF, 0x11, 0xE0] }
  ]
};

// 验证文件魔术字节
const validateFileSignature = (filePath, expectedType) => {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(16);
    fs.readSync(fd, buffer, 0, 16, 0);
    fs.closeSync(fd);

    const signatures = FILE_SIGNATURES[expectedType] || [];
    if (signatures.length === 0) return true; // 无签名定义时放行

    const ext = path.extname(filePath).toLowerCase();
    const matchedSig = signatures.find(s => s.ext === ext);
    if (!matchedSig) {
      // 扩展名无对应签名，尝试匹配任意同类型签名
      return signatures.some(s => {
        const sig = s.signature;
        for (let i = 0; i < sig.length; i++) {
          if (buffer[matchedSig.offset + i] !== sig[i]) return false;
        }
        return true;
      });
    }

    const sig = matchedSig.signature;
    for (let i = 0; i < sig.length; i++) {
      if (buffer[matchedSig.offset + i] !== sig[i]) {
        return false;
      }
    }
    return true;
  } catch (err) {
    console.warn('[Upload] 魔术字节校验失败:', err.message);
    return false; // 校验失败时拒绝文件
  }
};

const UPLOAD_CONFIG = {
  baseDir: path.join(__dirname, '../uploads'),
  maxSize: 512 * 1024 * 1024,
  types: {
    excel: {
      mimes: [
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel.sheet.macroEnabled.12',
        // 允许浏览器基于 .csv 扩展名推断的 MIME 也能上传（实际文件二进制仍由 validateUploadedFile 做魔术字节校验）
        'text/csv',
        'application/csv',
        'application/octet-stream'
      ],
      exts: ['.xlsx', '.xls', '.xlsm', '.csv']
    },
    image: {
      mimes: [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'image/bmp'
      ],
      exts: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']
    },
    document: {
      mimes: [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ],
      exts: ['.pdf', '.doc', '.docx']
    },
    insurance: {
      mimes: [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      ],
      exts: ['.pdf', '.jpg', '.jpeg', '.png', '.xlsx', '.xls']
    },
    all: {
      mimes: null,
      exts: null
    }
  }
};

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
};

const createStorage = (subDir = 'default') => {
  const targetDir = path.join(UPLOAD_CONFIG.baseDir, subDir);
  ensureDir(targetDir);

  return multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, targetDir);
    },
    filename: (req, file, cb) => {
      const originalname = fixFilenameEncoding(file.originalname);
      const ext = path.extname(originalname).toLowerCase();
      const filename = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}${ext}`;
      cb(null, filename);
    }
  });
};

const createFileFilter = (type = 'all') => {
  const typeConfig = UPLOAD_CONFIG.types[type] || UPLOAD_CONFIG.types.all;

  return (req, file, cb) => {
    const originalname = fixFilenameEncoding(file.originalname);
    const ext = path.extname(originalname).toLowerCase();
    const mime = file.mimetype;

    if (typeConfig.exts && !typeConfig.exts.includes(ext)) {
      return cb(new Error(`不支持的文件类型: ${ext}，支持的类型: ${typeConfig.exts.join(', ')}`));
    }

    if (typeConfig.mimes && !typeConfig.mimes.includes(mime)) {
      return cb(new Error(`不支持的MIME类型: ${mime}`));
    }

    cb(null, true);
  };
};

// ========= 上传后魔术字节校验（路由中调用）=========
const validateUploadedFile = (file, expectedType) => {
  if (!file || !expectedType || expectedType === 'all') return { valid: true };
  
  const valid = validateFileSignature(file.path, expectedType);
  if (!valid) {
    // 删除无效文件
    try { fs.unlinkSync(file.path); } catch (e) {}
    return { valid: false, error: `文件内容校验失败：文件可能不是有效的 ${expectedType} 文件` };
  }
  return { valid: true };
};

const createUploader = (options = {}) => {
  const {
    type = 'all',
    subDir = 'default',
    maxSize = UPLOAD_CONFIG.maxSize,
    fieldName = 'file',
    multiple = false,
    maxCount = 10
  } = options;

  const storage = createStorage(subDir);
  const fileFilter = createFileFilter(type);

  const multerConfig = {
    storage,
    limits: { fileSize: maxSize },
    fileFilter
  };

  const upload = multer(multerConfig);

  const wrapWithFix = (middleware) => {
    return (req, res, next) => {
      middleware(req, res, (err) => {
        if (err) return next(err);
        fixUploadFilenames(req, res, next);
      });
    };
  };

  return {
    single: (field = fieldName) => wrapWithFix(upload.single(field)),
    array: (field = fieldName, count = maxCount) => wrapWithFix(upload.array(field, count)),
    fields: (fields) => wrapWithFix(upload.fields(fields)),
    any: () => wrapWithFix(upload.any()),
    _multer: upload
  };
};

const uploadExcel = createUploader({ type: 'excel', subDir: 'excel' });
const uploadImage = createUploader({ type: 'image', subDir: 'images' });
const uploadDocument = createUploader({ type: 'document', subDir: 'documents' });
const uploadInsurance = createUploader({ type: 'insurance', subDir: 'insurance' });
const uploadHazard = createUploader({ type: 'image', subDir: 'hazards' });

const getFileUrl = (req, filename, subDir = 'default') => {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  return `${baseUrl}/uploads/${subDir}/${filename}`;
};

const getFilePath = (filename, subDir = 'default') => {
  return path.join(UPLOAD_CONFIG.baseDir, subDir, filename);
};

const deleteFile = (filePath) => {
  return new Promise((resolve) => {
    fs.unlink(filePath, (err) => {
      resolve(!err);
    });
  });
};

module.exports = {
  UPLOAD_CONFIG,
  createUploader,
  uploadExcel,
  uploadImage,
  uploadDocument,
  uploadInsurance,
  uploadHazard,
  getFileUrl,
  getFilePath,
  deleteFile,
  validateUploadedFile,
  validateFileSignature,
  ensureDir,
  fixFilenameEncoding,
  fixUploadFilenames
};
