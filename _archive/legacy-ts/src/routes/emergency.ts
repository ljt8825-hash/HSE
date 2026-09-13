/**
 * 应急管理路由 - PostgreSQL + 内存降级双模式
 * 注意: schema 中暂无 emergency 表，使用纯内存降级模式
 * 端点: GET / GET /:id POST / PUT /:id DELETE /:id GET /stats
 */

import { Router, Request, Response, NextFunction } from 'express';
import { pool, isConnected } from '../config/db';
import { success, error } from '../middleware/response';

const router = Router();

// ========== 内存降级存储（主存储） ==========
let memoryRecords: any[] = [];
let memoryIdCounter = 1;

function initMemoryData(): void {}

// ========== GET / — 列表 ==========
router.get('/', async (req: Request, res: Response): Promise<any> => {
  try {
    initMemoryData();
    let data = memoryRecords.filter(r => !r.is_deleted);
    const { page = 1, pageSize = 20, keyword, type, level } = req.query as any;
    if (keyword) {
      const kw = keyword.toLowerCase();
      data = data.filter(r =>
        (r.name && r.name.toLowerCase().includes(kw)) ||
        (r.location && r.location.toLowerCase().includes(kw))
      );
    }
    if (type) data = data.filter(r => r.type === type);
    if (level) data = data.filter(r => r.level === level);
    const total = data.length;
    const offset = (page - 1) * pageSize;
    const list = data.slice(offset, offset + parseInt(pageSize));
    res.json(success({ list, total, page: parseInt(page), pageSize: parseInt(pageSize) }, '查询成功(内存模式)'));
  } catch (err: any) {
    res.json(error(-1, err.message));
  }
});

// ========== GET /stats — 统计 ==========
router.get('/stats', async (req: Request, res: Response): Promise<any> => {
  try {
    const data = memoryRecords.filter(r => !r.is_deleted);
    res.json(success({ total: data.length, byType: {}, byLevel: {} }, '统计成功(内存模式)'));
  } catch (err: any) {
    res.json(error(-1, err.message));
  }
});

// ========== GET /:id — 单条 ==========
router.get('/:id', async (req: Request, res: Response): Promise<any> => {
  try {
    const record = memoryRecords.find(r => r.id === parseInt(req.params.id) && !r.is_deleted);
    if (!record) return res.json(error(-2, '记录不存在'));
    res.json(success(record, '查询成功'));
  } catch (err: any) {
    res.json(error(-1, err.message));
  }
});

// ========== POST / — 创建 ==========
router.post('/', async (req: Request, res: Response): Promise<any> => {
  try {
    const record = { id: memoryIdCounter++, ...req.body, is_deleted: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    memoryRecords.push(record);
    res.json(success(record, '创建成功(内存模式)'));
  } catch (err: any) {
    res.json(error(-1, err.message));
  }
});

// ========== PUT /:id — 更新 ==========
router.put('/:id', async (req: Request, res: Response): Promise<any> => {
  try {
    const idx = memoryRecords.findIndex(r => r.id === parseInt(req.params.id) && !r.is_deleted);
    if (idx === -1) return res.json(error(-2, '记录不存在'));
    Object.assign(memoryRecords[idx], req.body, { updated_at: new Date().toISOString() });
    res.json(success(memoryRecords[idx], '更新成功(内存模式)'));
  } catch (err: any) {
    res.json(error(-1, err.message));
  }
});

// ========== DELETE /:id — 软删除 ==========
router.delete('/:id', async (req: Request, res: Response): Promise<any> => {
  try {
    const record = memoryRecords.find(r => r.id === parseInt(req.params.id) && !r.is_deleted);
    if (!record) return res.json(error(-2, '记录不存在'));
    record.is_deleted = true;
    res.json(success(null, '删除成功(内存模式)'));
  } catch (err: any) {
    res.json(error(-1, err.message));
  }
});

export default router;
