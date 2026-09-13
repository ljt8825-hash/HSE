/**
 * 文件上传中间件 — 类型安全版
 * 文件: src/middleware/upload.ts
 */

import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import type {
  UploadConfig,
  UploadType,
  UploadTypeConfig,
  CreateUploaderOptions,
  UploaderInstance,
  UploadedFile,
  ValidateResult,
} from '../types';

// ========= 文件魔术字节签名（防伪造文件类型）=========
interface FileSignature {
  ext: string;
  offset: number;
  signature: number[];
}

const FILE_SIGNATURES: Record<string, FileSignature[]> = {
  image: [
    { ext: '.jpg', offset: 0, signature: [0xFF, 0xD8, 0xFF] },
    { ext: '.jpeg', offset: 0, signature: [0xFF, 0xD8, 0xFF] },
    { ext: '.png', offset: 0, signature: [0x89, 0x50, 0x4E, 0x47] },
    { ext: '.gif', offset: 0, signature: [0x47, 0x49, 0x46, 0x38] },
    { ext: '.webp', offset: 8, signature: [0x57, 0x45, 0x42, 0x50] },
    { ext: '.bmp', offset: 0, signature: [0x42, 0x4D] },
  ],
  pdf: [
    { ext: '.pdf', offset: 0, signature: [0x25, 0x50, 0x44, 0x46] },
  ],
  excel: [
    { ext: '.xlsx', offset: 0, signature: [0x50, 0x4B, 0x03, 0x04] },
    { ext: '.xls', offset: 0, signature: [0xD0, 0xCF, 0x11, 0xE0] },
  ],
  word: [
    { ext: '.docx', offset: 0, signature: [0x50, 0x4B, 0x03, 0x04] },
    { ext: '.doc', offset: 0, signature: [0xD0, 0xCF, 0x11, 0xE0] },
  ],
};

// 验证文件魔术字节
const validateFileSignature = (filePath: string, expectedType: string): boolean => {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(16);
    fs.readSync(fd, buffer, 0, 16, 0);
    fs.closeSync(fd);

    const signatures = FILE_SIGNATURES[expectedType] || [];
    if (signatures.length === 0) return true;

    const ext = path.extname(filePath).toLowerCase();
    const matchedSig = signatures.find(s => s.ext === ext);
    if (!matchedSig) {
      return signatures.some(s => {
        const sig = s.signature;
        for (let i = 0; i < sig.length; i++) {
          if (buffer[s.offset + i] !== sig[i]) return false;
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
  } catch (err: any) {
    console.warn('[Upload] 魔术字节校验失败:', err.message);
    return false;
  }
};

const UPLOAD_CONFIG: UploadConfig = {
  baseDir: path.join(__dirname, '..', '..', 'uploads'),
  maxSize: 10 * 1024 * 1024,
  types: {
    excel: {
      mimes: [
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel.sheet.macroEnabled.12',
      ],
      exts: ['.xlsx', '.xls', '.xlsm'],
    },
    image: {
      mimes: [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'image/bmp',
      ],
      exts: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'],
    },
    document: {
      mimes: [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ],
      exts: ['.pdf', '.doc', '.docx'],
    },
    insurance: {
      mimes: [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ],
      exts: ['.pdf', '.jpg', '.jpeg', '.png', '.xlsx', '.xls'],
    },
    all: {
      mimes: null,
      exts: null,
    },
  },
};

const ensureDir = (dir: string): string => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
};

const createStorage = (subDir: string = 'default') => {
  const targetDir = path.join(UPLOAD_CONFIG.baseDir, subDir);
  ensureDir(targetDir);

  return multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, targetDir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const filename = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}${ext}`;
      cb(null, filename);
    },
  });
};

const createFileFilter = (type: UploadType = 'all') => {
  const typeConfig = UPLOAD_CONFIG.types[type] || UPLOAD_CONFIG.types.all;

  return (req: any, file: Express.Multer.File, cb: any) => {
    const ext = path.extname(file.originalname).toLowerCase();
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

// 上传后魔术字节校验（路由中调用）
const validateUploadedFile = (
  file: UploadedFile | undefined,
  expectedType: string
): ValidateResult => {
  if (!file || !expectedType || expectedType === 'all') return { valid: true };

  const valid = validateFileSignature(file.path, expectedType);
  if (!valid) {
    try { fs.unlinkSync(file.path); } catch (e) { /* ignore */ }
    return { valid: false, error: `文件内容校验失败：文件可能不是有效的 ${expectedType} 文件` };
  }
  return { valid: true };
};

const createUploader = (options: CreateUploaderOptions = {}): UploaderInstance => {
  const {
    type = 'all',
    subDir = 'default',
    maxSize = UPLOAD_CONFIG.maxSize,
    fieldName = 'file',
    multiple = false,
    maxCount = 10,
  } = options;

  const storage = createStorage(subDir);
  const fileFilter = createFileFilter(type);

  const multerConfig = {
    storage,
    limits: { fileSize: maxSize },
    fileFilter,
  };

  const upload = multer(multerConfig);

  return {
    single: (field: string = fieldName) => upload.single(field),
    array: (field: string = fieldName, count: number = maxCount) => upload.array(field, count),
    fields: (fields: any[]) => upload.fields(fields),
    any: () => upload.any(),
    _multer: upload,
  };
};

const uploadExcel = createUploader({ type: 'excel', subDir: 'excel' });
const uploadImage = createUploader({ type: 'image', subDir: 'images' });
const uploadDocument = createUploader({ type: 'document', subDir: 'documents' });
const uploadInsurance = createUploader({ type: 'insurance', subDir: 'insurance' });
const uploadHazard = createUploader({ type: 'image', subDir: 'hazards' });

const getFileUrl = (req: any, filename: string, subDir: string = 'default'): string => {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  return `${baseUrl}/uploads/${subDir}/${filename}`;
};

const getFilePath = (filename: string, subDir: string = 'default'): string => {
  return path.join(UPLOAD_CONFIG.baseDir, subDir, filename);
};

const deleteFile = (filePath: string): Promise<boolean> => {
  return new Promise((resolve) => {
    fs.unlink(filePath, (err) => {
      resolve(!err);
    });
  });
};

export {
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
  ensureDir,
};
