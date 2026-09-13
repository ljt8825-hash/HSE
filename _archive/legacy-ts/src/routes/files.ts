/**
 * 文件上传路由
 * 文件: src/routes/files.ts
 */

import { Router, Request, Response, NextFunction } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { success, error } from '../middleware/response';
import {
  createUploader,
  uploadImage,
  uploadDocument,
  uploadInsurance,
  uploadHazard,
  getFileUrl,
  getFilePath,
  deleteFile as deleteFileUtil,
  validateUploadedFile,
} from '../middleware/upload';
import type { UploadedFile, ValidateResult } from '../types';

const router = Router();

// ========= 上传后校验中间件 =========
const validateAfterUpload = (expectedType: string) =>
  (req: Request, res: Response, next: NextFunction): void => {
    if (!req.file && !req.files) {
      next();
      return;
    }

    const files: any[] = (req.files || [req.file]) as any[];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (!f) continue;
      const result: ValidateResult = validateUploadedFile(f, expectedType);
      if (!result.valid) {
        try { if (f.path) fs.unlinkSync(f.path); } catch (e) { /* ignore */ }
        res.json(error(-1, result.error));
        return;
      }
    }
    next();
  };

router.post('/upload/image',
  uploadImage.single('file'),
  validateAfterUpload('image'),
  (req: Request, res: Response): void => {
    try {
      if (!req.file) {
        res.json(error(-1, '请上传图片文件'));
        return;
      }

      const fileUrl = getFileUrl(req, req.file.filename, 'images');

      res.json(success({
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
        url: fileUrl,
        path: req.file.path,
      }, '上传成功'));
    } catch (err: any) {
      res.json(error(-2, err.message));
    }
  }
);

router.post('/upload/document',
  uploadDocument.single('file'),
  validateAfterUpload('word'),
  (req: Request, res: Response): void => {
    try {
      if (!req.file) {
        res.json(error(-1, '请上传文档文件'));
        return;
      }

      const fileUrl = getFileUrl(req, req.file.filename, 'documents');

      res.json(success({
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
        url: fileUrl,
        path: req.file.path,
      }, '上传成功'));
    } catch (err: any) {
      res.json(error(-2, err.message));
    }
  }
);

router.post('/upload/insurance',
  uploadInsurance.single('file'),
  validateAfterUpload('insurance'),
  (req: Request, res: Response): void => {
    try {
      if (!req.file) {
        res.json(error(-1, '请上传保险单文件'));
        return;
      }

      const fileUrl = getFileUrl(req, req.file.filename, 'insurance');

      res.json(success({
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
        url: fileUrl,
        path: req.file.path,
      }, '上传成功'));
    } catch (err: any) {
      res.json(error(-2, err.message));
    }
  }
);

router.post('/upload/hazard',
  uploadHazard.single('file'),
  validateAfterUpload('image'),
  (req: Request, res: Response): void => {
    try {
      if (!req.file) {
        res.json(error(-1, '请上传隐患照片'));
        return;
      }

      const fileUrl = getFileUrl(req, req.file.filename, 'hazards');

      res.json(success({
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
        url: fileUrl,
        path: req.file.path,
      }, '上传成功'));
    } catch (err: any) {
      res.json(error(-2, err.message));
    }
  }
);

router.post('/upload/multi', (req: Request, res: Response): void => {
  const type = (req.body.type || 'image') as any;
  const maxCount = parseInt(req.body.maxCount || '5', 10) || 5;

  const uploader = createUploader({
    type,
    subDir: type,
    maxCount,
  });

  uploader.array('files', maxCount)(req, res, (err: any) => {
    if (err) {
      res.json(error(-1, err.message));
      return;
    }

    if (!req.files || req.files.length === 0) {
      res.json(error(-2, '请上传文件'));
      return;
    }

    const files = (req.files as UploadedFile[]).map(file => ({
      filename: file.filename,
      originalName: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
      url: getFileUrl(req, file.filename, type),
      path: file.path,
    }));

    res.json(success({
      count: files.length,
      files,
    }, '上传成功'));
  });
});

router.post('/delete', async (req: Request, res: Response): Promise<void> => {
  try {
    const { filename, type = 'default' } = req.body;

    if (!filename) {
      res.json(error(-1, '请提供文件名'));
      return;
    }

    const filePath = getFilePath(filename, type);
    const deleted = await deleteFileUtil(filePath);

    if (deleted) {
      res.json(success(null, '删除成功'));
    } else {
      res.json(error(-2, '文件不存在或删除失败'));
    }
  } catch (err: any) {
    res.json(error(-3, err.message));
  }
});

router.get('/download/:type/:filename', (req: Request, res: Response): void => {
  try {
    const { type, filename } = req.params;

    const allowedTypes = ['images', 'documents', 'insurance', 'hazards', 'excel', 'default'];
    if (!allowedTypes.includes(type)) {
      res.json(error(-1, '无效的文件类型'));
      return;
    }

    const filePath = getFilePath(filename, type);

    if (!fs.existsSync(filePath)) {
      res.json(error(-2, '文件不存在'));
      return;
    }

    const originalName = (req.query.name as string) || filename;
    res.download(filePath, originalName);
  } catch (err: any) {
    res.json(error(-3, err.message));
  }
});

export default router;
