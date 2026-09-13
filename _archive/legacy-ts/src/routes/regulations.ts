/**
 * 规章制度路由 - PostgreSQL + 内存降级双模式
 * DB 在线时使用 PG 查询，离线时自动降级到内存存储
 * 文件: src/routes/regulations.ts
 */

import { Router, Request, Response, NextFunction } from 'express';
import { pool, isConnected } from '../config/db';
import { success, error } from '../middleware/response';

const router = Router();

// ========== 内存降级存储 ==========
let memoryRecords: any[] = [];
let memoryIdCounter = 1;

function initMemoryData(): void {
  if (memoryRecords.length > 0) return;
  memoryRecords = [];
  memoryIdCounter = 1;
}

// ========== GET / — 列表（支持分页、搜索、过滤） ==========
router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    if (!isConnected()) {
      initMemoryData();
      let data = memoryRecords.filter((r: any) => !r.is_deleted);
      const { page = 1, pageSize = 20, keyword = '', status = '' } = req.query as any;

      if (keyword) {
        const kw = keyword.toLowerCase();
        data = data.filter((r: any) =>
          (r.name && r.name.toLowerCase().includes(kw)) ||
          (r.category && r.category.toLowerCase().includes(kw))
        );
      }
      if (status) data = data.filter((r: any) => r.status === status);

      const total = data.length;
      const offset = (page - 1) * pageSize;
      const list = data.slice(offset, offset + parseInt(pageSize));

      res.json(success({ list, total, page: parseInt(page), pageSize: parseInt(pageSize) }, '查询成功(内存模式)'));
      return;
    }

    const { page = 1, pageSize = 20, keyword = '', status = '' } = req.query as any;

    let whereSql = ' WHERE is_deleted = false';
    const params: any[] = [];
    let paramIdx = 0;

    if (keyword) {
      paramIdx++;
      whereSql += ` AND (name ILIKE $${paramIdx} OR category ILIKE $${paramIdx})`;
      params.push(`%${keyword}%`);
    }
    if (status) {
      paramIdx++;
      whereSql += ` AND status = $${paramIdx}`;
      params.push(status);
    }

    const countSql = `SELECT COUNT(*) as total FROM regulations ${whereSql}`;
    const countResult = await pool.query(countSql, params);
    const total = parseInt(countResult.rows[0].total);

    const offset = (page - 1) * pageSize;
    paramIdx++;
    params.push(parseInt(pageSize));
    paramIdx++;
    params.push(offset);

    const listSql = `
      SELECT id, name, category, version, status, effective_date,
             department, remark, created_at, updated_at
      FROM regulations
      ${whereSql}
      ORDER BY id DESC
      LIMIT $${paramIdx - 1} OFFSET $${paramIdx}
    `;
    const result = await pool.query(listSql, params);

    res.json(success({ list: result.rows, total, page: parseInt(page), pageSize: parseInt(pageSize) }, '查询成功'));
  } catch (err) {
    next(err);
  }
});

// ========== GET /stats — 统计 ==========
router.get('/stats', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    if (!isConnected()) {
      initMemoryData();
      const data = memoryRecords.filter((r: any) => !r.is_deleted);
      res.json(success({
        total: data.length,
        byStatus: {},
        byCategory: {}
      }, '统计成功(内存模式)'));
      return;
    }

    const [totalResult, statusResult, categoryResult] = await Promise.all([
      pool.query('SELECT COUNT(*) AS total FROM regulations WHERE is_deleted = false'),
      pool.query(`SELECT status, COUNT(*) AS count FROM regulations WHERE is_deleted = false GROUP BY status`),
      pool.query(`SELECT category, COUNT(*) AS count FROM regulations WHERE is_deleted = false GROUP BY category`)
    ]);

    const byStatus: Record<string, number> = {};
    statusResult.rows.forEach((r: any) => { byStatus[r.status] = parseInt(r.count); });

    const byCategory: Record<string, number> = {};
    categoryResult.rows.forEach((r: any) => { byCategory[r.category] = parseInt(r.count); });

    res.json(success({
      total: parseInt(totalResult.rows[0].total),
      byStatus,
      byCategory
    }, '统计成功'));
  } catch (err) {
    next(err);
  }
});

// ========== GET /:id — 详情 ==========
router.get('/:id', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    if (!isConnected()) {
      initMemoryData();
      const { id } = req.params;
      const record = memoryRecords.find((r: any) => r.id === parseInt(id) && !r.is_deleted);
      if (!record) {
        res.json(error(-2, '记录不存在'));
        return;
      }
      res.json(success(record, '查询成功(内存模式)'));
      return;
    }

    const { id } = req.params;
    const result = await pool.query(
      'SELECT * FROM regulations WHERE id = $1 AND is_deleted = false', [id]
    );
    if (result.rows.length === 0) {
      res.json(error(-2, '记录不存在'));
      return;
    }
    res.json(success(result.rows[0], '查询成功'));
  } catch (err) {
    next(err);
  }
});

// ========== POST / — 创建 ==========
router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    if (!isConnected()) {
      initMemoryData();
      const { name, category, version, status, effective_date, department, remark } = req.body;
      if (!name) {
        res.json(error(-1, '制度名称不能为空'));
        return;
      }
      const record = {
        id: memoryIdCounter++,
        name: name.trim(),
        category: category || '',
        version: version || '',
        status: status || '有效',
        effective_date: effective_date || null,
        department: department || '',
        remark: remark || '',
        is_deleted: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      memoryRecords.push(record);
      res.json(success(record, '创建成功(内存模式)'));
      return;
    }

    const { name, category, version, status, effective_date, department, remark } = req.body;
    if (!name) {
      res.json(error(-1, '制度名称不能为空'));
      return;
    }

    const result = await pool.query(`
      INSERT INTO regulations (name, category, version, status, effective_date, department, remark)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [name.trim(), category || '', version || '', status || '有效', effective_date || null, department || '', remark || '']);

    res.json(success(result.rows[0], '创建成功'));
  } catch (err) {
    next(err);
  }
});

// ========== PUT /:id — 更新 ==========
router.put('/:id', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    if (!isConnected()) {
      initMemoryData();
      const { id } = req.params;
      const idx = memoryRecords.findIndex((r: any) => r.id === parseInt(id) && !r.is_deleted);
      if (idx === -1) {
        res.json(error(-2, '记录不存在'));
        return;
      }
      Object.assign(memoryRecords[idx], req.body, { updated_at: new Date().toISOString() });
      res.json(success(memoryRecords[idx], '更新成功(内存模式)'));
      return;
    }

    const { id } = req.params;
    const { name, category, version, status, effective_date, department, remark } = req.body;
    const result = await pool.query(`
      UPDATE regulations SET
        name = COALESCE($1, name),
        category = COALESCE($2, category),
        version = COALESCE($3, version),
        status = COALESCE($4, status),
        effective_date = COALESCE($5, effective_date),
        department = COALESCE($6, department),
        remark = COALESCE($7, remark),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $8 AND is_deleted = false
      RETURNING *
    `, [name, category, version, status, effective_date, department, remark, id]);

    if (result.rows.length === 0) {
      res.json(error(-2, '记录不存在'));
      return;
    }
    res.json(success(result.rows[0], '更新成功'));
  } catch (err) {
    next(err);
  }
});

// ========== DELETE /:id — 软删除 ==========
router.delete('/:id', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    if (!isConnected()) {
      initMemoryData();
      const { id } = req.params;
      const record = memoryRecords.find((r: any) => r.id === parseInt(id) && !r.is_deleted);
      if (!record) {
        res.json(error(-2, '记录不存在'));
        return;
      }
      record.is_deleted = true;
      res.json(success(null, '删除成功(内存模式)'));
      return;
    }

    const { id } = req.params;
    const result = await pool.query(
      'UPDATE regulations SET is_deleted = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND is_deleted = false RETURNING id',
      [id]
    );
    if (result.rows.length === 0) {
      res.json(error(-2, '记录不存在'));
      return;
    }
    res.json(success(null, '删除成功'));
  } catch (err) {
    next(err);
  }
});

export default router;
