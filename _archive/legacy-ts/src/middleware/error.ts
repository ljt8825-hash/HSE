/**
 * 错误处理中间件
 * 文件: src/middleware/error.ts
 */

import type { Request, Response, NextFunction } from 'express';
import { error } from './response';

interface AppError extends Error {
  statusCode?: number;
  code?: string;
  name: string;
}

const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  console.error('[ERROR]', err.message, err.stack);

  const statusCode = err.statusCode || 500;

  if (err.code === '42P01') {
    res.status(500).json(error(-1, '数据库表不存在，请检查数据库初始化', null));
  } else if (err.code === '28P01') {
    res.status(401).json(error(-2, '数据库连接权限不足（密码错误或用户不存在）', null));
  } else if (err.code === '53300') {
    res.status(500).json(error(-3, '数据库连接数超限', null));
  } else if (err.code === '3D000') {
    res.status(500).json(error(-6, '数据库不存在，请先创建', null));
  } else if (err.code === 'LIMIT_FILE_SIZE') {
    res.status(400).json(error(-4, '文件大小超过限制', null));
  } else if (err.name === 'ValidationError') {
    res.status(400).json(error(-5, err.message, null));
  } else {
    res.status(statusCode).json(error(-1, err.message || '服务器内部错误', null));
  }
};

const notFound = (req: Request, res: Response, next: NextFunction): void => {
  res.status(404).json(error(-100, `API路径不存在: ${req.originalUrl}`, null));
};

export { errorHandler, notFound };
