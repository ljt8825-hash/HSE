const { error } = require('./response');

const errorHandler = (err, req, res, next) => {
  // 记录完整错误到服务端日志
  console.error('[ERROR]', err.message, err.stack);

  const isProduction = process.env.NODE_ENV === 'production';

  // PostgreSQL 错误码特殊处理
  if (err.code === '42P01') {
    return res.status(500).json(error(-1, '数据库表不存在，请检查数据库初始化', null));
  } else if (err.code === '28P01') {
    return res.status(401).json(error(-2, '数据库连接权限不足（密码错误或用户不存在）', null));
  } else if (err.code === '53300') {
    return res.status(500).json(error(-3, '数据库连接数超限', null));
  } else if (err.code === '3D000') {
    return res.status(500).json(error(-6, '数据库不存在，请先创建', null));
  } else if (err.code === 'LIMIT_FILE_SIZE' || err.code === 'UNSUPPORTED_FILE_TYPE') {
    return res.status(400).json(error(-4, err.message || '文件上传失败', null));
  } else if (err.name === 'ValidationError') {
    return res.status(400).json(error(-5, err.message, null));
  } else {
    const statusCode = err.statusCode || 500;
    // 生产环境隐藏内部错误详情
    const message = isProduction
      ? '服务器内部错误'
      : (err.message || '服务器内部错误');
    res.status(statusCode).json(error(-1, message, isProduction ? null : { stack: err.stack }));
  }
};

const notFound = (req, res, next) => {
  res.status(404).json(error(-100, `API路径不存在: ${req.originalUrl}`, null));
};

module.exports = {
  errorHandler,
  notFound
};
