const express = require('express');
const router = express.Router();
const { success, error } = require('../middleware/response');
const {
  createUploader,
  uploadImage,
  uploadDocument,
  uploadInsurance,
  uploadHazard,
  getFileUrl,
  getFilePath,
  deleteFile: deleteFileUtil,
  validateUploadedFile,
  fixFilenameEncoding
} = require('../middleware/upload');
const path = require('path');
const fs = require('fs');

// ========= 上传后校验中间件 =========
const validateAfterUpload = (expectedType) => (req, res, next) => {
  if (!req.file && !req.files) return next();
  
  const files = req.files || [req.file];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    if (!f) continue;
    const result = validateUploadedFile(f, expectedType);
    if (!result.valid) {
      // 删除已上传的无效文件
      try { if (f.path) fs.unlinkSync(f.path); } catch (e) {}
      return res.json(error(-1, result.error));
    }
  }
  next();
};

router.post('/upload/image', 
  uploadImage.single('file'), 
  validateAfterUpload('image'),
  (req, res) => {
  try {
    if (!req.file) {
      return res.json(error(-1, '请上传图片文件'));
    }

    const fileUrl = getFileUrl(req, req.file.filename, 'images');

    res.json(success({
      filename: req.file.filename,
      originalName: fixFilenameEncoding(req.file.originalname),
      size: req.file.size,
      mimetype: req.file.mimetype,
      url: fileUrl,
      path: req.file.path
    }, '上传成功'));
  } catch (err) {
    res.json(error(-2, err.message));
  }
});

router.post('/upload/document', 
  uploadDocument.single('file'), 
  validateAfterUpload('word'),
  (req, res) => {
  try {
    if (!req.file) {
      return res.json(error(-1, '请上传文档文件'));
    }

    const fileUrl = getFileUrl(req, req.file.filename, 'documents');

    res.json(success({
      filename: req.file.filename,
      originalName: fixFilenameEncoding(req.file.originalname),
      size: req.file.size,
      mimetype: req.file.mimetype,
      url: fileUrl,
      path: req.file.path
    }, '上传成功'));
  } catch (err) {
    res.json(error(-2, err.message));
  }
});

router.post('/upload/insurance', 
  uploadInsurance.single('file'), 
  validateAfterUpload('insurance'),
  (req, res) => {
  try {
    if (!req.file) {
      return res.json(error(-1, '请上传保险单文件'));
    }

    const fileUrl = getFileUrl(req, req.file.filename, 'insurance');

    res.json(success({
      filename: req.file.filename,
      originalName: fixFilenameEncoding(req.file.originalname),
      size: req.file.size,
      mimetype: req.file.mimetype,
      url: fileUrl,
      path: req.file.path
    }, '上传成功'));
  } catch (err) {
    res.json(error(-2, err.message));
  }
});

router.post('/upload/hazard', 
  uploadHazard.single('file'), 
  validateAfterUpload('image'),
  (req, res) => {
  try {
    if (!req.file) {
      return res.json(error(-1, '请上传隐患照片'));
    }

    const fileUrl = getFileUrl(req, req.file.filename, 'hazards');

    res.json(success({
      filename: req.file.filename,
      originalName: fixFilenameEncoding(req.file.originalname),
      size: req.file.size,
      mimetype: req.file.mimetype,
      url: fileUrl,
      path: req.file.path
    }, '上传成功'));
  } catch (err) {
    res.json(error(-2, err.message));
  }
});

router.post('/upload/multi', (req, res) => {
  const type = req.body.type || 'image';
  const maxCount = parseInt(req.body.maxCount) || 5;

  const uploader = createUploader({
    type,
    subDir: type,
    maxCount
  });

  uploader.array('files', maxCount)(req, res, (err) => {
    if (err) {
      return res.json(error(-1, err.message));
    }

    if (!req.files || req.files.length === 0) {
      return res.json(error(-2, '请上传文件'));
    }

    const files = req.files.map(file => ({
      filename: file.filename,
      originalName: fixFilenameEncoding(file.originalname),
      size: file.size,
      mimetype: file.mimetype,
      url: getFileUrl(req, file.filename, type),
      path: file.path
    }));

    res.json(success({
      count: files.length,
      files
    }, '上传成功'));
  });
});

router.post('/delete', async (req, res) => {
  try {
    const { filename, type = 'default' } = req.body;

    if (!filename) {
      return res.json(error(-1, '请提供文件名'));
    }

    const filePath = getFilePath(filename, type);
    const deleted = await deleteFileUtil(filePath);

    if (deleted) {
      res.json(success(null, '删除成功'));
    } else {
      res.json(error(-2, '文件不存在或删除失败'));
    }
  } catch (err) {
    res.json(error(-3, err.message));
  }
});

router.get('/download/:type/:filename', (req, res) => {
  try {
    const { type, filename } = req.params;

    const allowedTypes = ['images', 'documents', 'insurance', 'hazards', 'excel', 'default'];
    if (!allowedTypes.includes(type)) {
      return res.json(error(-1, '无效的文件类型'));
    }

    const filePath = getFilePath(filename, type);

    if (!fs.existsSync(filePath)) {
      return res.json(error(-2, '文件不存在'));
    }

    const originalName = req.query.name || filename;
    res.download(filePath, originalName);
  } catch (err) {
    res.json(error(-3, err.message));
  }
});

module.exports = router;
