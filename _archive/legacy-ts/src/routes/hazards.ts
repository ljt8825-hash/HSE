/**
 * 隐患排查治理路由 - PostgreSQL + 内存降级双模式
 * 表: hazards
 * 端点: GET / GET /:id POST / PUT /:id DELETE /:id GET /stats
 * 字段映射（Excel表头 → DB字段 → 前端字段）:
 *   序号        → no          → no
 *   隐患描述    → description → description
 *   整改措施    → measure     → measure
 *   检查时间    → hazard_date → checkDate
 *   检查人员    → checker     → checker
 *   整改人员    → fixer       → fixer
 *   整改时间    → fix_date    → fixDate
 *   是否整改完成→ status      → isResolved (是→已完成, 否→未完成)
 */

import { Router, Request, Response } from 'express';
import { pool, isConnected } from '../config/db';
import { success, error } from '../middleware/response';

const router = Router();

// ========== 内存降级存储 ==========
let memoryRecords: any[] = [];
let memoryIdCounter = 1;

function initMemoryData(): void {}

// ========== 是否整改完成 转换 ==========
function statusToIsResolved(status: string): '是' | '否' {
  if (!status) return '否';
  if (status === '已完成' || status === 'completed') return '是';
  return '否';
}
function isResolvedToStatus(isResolved: string): string {
  return isResolved === '是' ? '已完成' : '未完成';
}

// ========== 格式化行 ==========
function formatRow(row: any) {
  const checkDate = row.hazard_date
    ? (row.hazard_date instanceof Date ? row.hazard_date : new Date(row.hazard_date))
    : null;
  const fixDate = row.fix_date
    ? (row.fix_date instanceof Date ? row.fix_date : new Date(row.fix_date))
    : null;

  return {
    id: row.id,
    no: row.no || null,
    description: row.description || '',
    measure: row.measure || '',
    checkDate: checkDate ? checkDate.toISOString().slice(0, 10) : null,
    checker: row.checker || '',
    fixer: row.fixer || '',
    fixDate: fixDate ? fixDate.toISOString().slice(0, 10) : null,
    isResolved: statusToIsResolved(row.status),
    remark: row.remark || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ========== GET / — 列表 ==========
router.get('/', async (req: Request, res: Response): Promise<any> => {
  try {
    if (!isConnected()) {
      initMemoryData();
      let data = memoryRecords.filter(r => !r.is_deleted);
      const { page = 1, pageSize = 20, keyword, isResolved, startDate, endDate } = req.query as any;
      if (keyword) {
        const kw = keyword.toLowerCase();
        data = data.filter(r =>
          (r.description && r.description.toLowerCase().includes(kw)) ||
          (r.checker && r.checker.toLowerCase().includes(kw)) ||
          (r.fixer && r.fixer.toLowerCase().includes(kw))
        );
      }
      if (isResolved) {
        data = data.filter(r => statusToIsResolved(r.status) === isResolved);
      }
      if (startDate) {
        data = data.filter(r => {
          const d = r.hazard_date ? new Date(r.hazard_date) : null;
          return d && d >= new Date(startDate);
        });
      }
      if (endDate) {
        data = data.filter(r => {
          const d = r.hazard_date ? new Date(r.hazard_date) : null;
          return d && d <= new Date(endDate);
        });
      }
      const total = data.length;
      const offset = (page - 1) * pageSize;
      const list = data.slice(offset, offset + parseInt(pageSize));
      return res.json(success({ list: list.map(formatRow), total, page: parseInt(page), pageSize: parseInt(pageSize) }, '查询成功(内存模式)'));
    }

    let whereSql = ' WHERE is_deleted = false';
    const params: any[] = [];
    let paramIdx = 0;

    const { page = 1, pageSize = 20, keyword, isResolved, startDate, endDate } = req.query as any;

    if (keyword) {
      paramIdx++;
      whereSql += ` AND (description ILIKE $${paramIdx} OR checker ILIKE $${paramIdx} OR fixer ILIKE $${paramIdx})`;
      params.push(`%${keyword}%`);
    }
    if (isResolved) {
      paramIdx++;
      whereSql += ` AND status = $${paramIdx}`;
      params.push(isResolvedToStatus(isResolved));
    }
    if (startDate) {
      paramIdx++;
      whereSql += ` AND hazard_date >= $${paramIdx}`;
      params.push(startDate);
    }
    if (endDate) {
      paramIdx++;
      whereSql += ` AND hazard_date <= $${paramIdx}`;
      params.push(endDate);
    }

    const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM hazards${whereSql}`, params);
    const total = countResult.rows[0].total;

    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    paramIdx++;
    const limitP = paramIdx;
    params.push(parseInt(pageSize));
    paramIdx++;
    const offsetP = paramIdx;
    params.push(offset);

    const result = await pool.query(
      `SELECT * FROM hazards${whereSql} ORDER BY hazard_date DESC, id DESC LIMIT $${limitP} OFFSET $${offsetP}`,
      params
    );

    res.json(success({
      list: result.rows.map(formatRow),
      total,
      page: parseInt(page),
      pageSize: parseInt(pageSize)
    }, '查询成功'));
  } catch (err: any) {
    res.json(error(-1, err.message));
  }
});

// ========== GET /stats — 统计 ==========
router.get('/stats', async (req: Request, res: Response): Promise<any> => {
  try {
    if (!isConnected()) {
      const total = memoryRecords.filter(r => !r.is_deleted).length;
      const resolved = memoryRecords.filter(r => !r.is_deleted && statusToIsResolved(r.status) === '是').length;
      return res.json(success({ total, resolved, unresolved: total - resolved }, '统计成功(内存模式)'));
    }

    const [totalR, resolvedR] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS total FROM hazards WHERE is_deleted = false'),
      pool.query("SELECT COUNT(*)::int AS count FROM hazards WHERE is_deleted = false AND status = '已完成'")
    ]);

    const total = totalR.rows[0].total;
    const resolved = resolvedR.rows[0].count;

    res.json(success({ total, resolved, unresolved: total - resolved }, '统计成功'));
  } catch (err: any) {
    res.json(error(-1, err.message));
  }
});

// ========== GET /:id — 单条 ==========
router.get('/:id', async (req: Request, res: Response): Promise<any> => {
  try {
    if (!isConnected()) {
      initMemoryData();
      const record = memoryRecords.find(r => r.id === parseInt(req.params.id) && !r.is_deleted);
      if (!record) return res.json(error(-2, '记录不存在'));
      return res.json(success(formatRow(record), '查询成功'));
    }

    const result = await pool.query('SELECT * FROM hazards WHERE id = $1 AND is_deleted = false', [req.params.id]);
    if (result.rows.length === 0) return res.json(error(-2, '记录不存在'));
    res.json(success(formatRow(result.rows[0]), '查询成功'));
  } catch (err: any) {
    res.json(error(-1, err.message));
  }
});

// ========== POST / — 创建 ==========
router.post('/', async (req: Request, res: Response): Promise<any> => {
  try {
    const b = req.body;
    const description = b.description || '';
    const measure = b.measure || '';
    const hazardDate = b.checkDate || b.hazard_date || null;
    const checker = b.checker || '';
    const fixer = b.fixer || '';
    const fixDate = b.fixDate || b.fix_date || null;
    const status = isResolvedToStatus(b.isResolved);

    if (!isConnected()) {
      initMemoryData();
      const record = { id: memoryIdCounter++, no: b.no || null, hazard_date: hazardDate, description, measure, checker, fixer, fix_date: fixDate, status, remark: b.remark || '', is_deleted: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      memoryRecords.push(record);
      return res.json(success(formatRow(record), '创建成功(内存模式)'));
    }

    const result = await pool.query(`
      INSERT INTO hazards (no, hazard_date, description, measure, checker, fixer, fix_date, status, remark)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *
    `, [
      b.no || null, hazardDate, description, measure,
      checker, fixer, fixDate, status, b.remark || ''
    ]);

    res.json(success(formatRow(result.rows[0]), '创建成功'));
  } catch (err: any) {
    res.json(error(-1, err.message));
  }
});

// ========== PUT /:id — 更新 ==========
router.put('/:id', async (req: Request, res: Response): Promise<any> => {
  try {
    const b = req.body;

    if (!isConnected()) {
      initMemoryData();
      const idx = memoryRecords.findIndex(r => r.id === parseInt(req.params.id) && !r.is_deleted);
      if (idx === -1) return res.json(error(-2, '记录不存在'));
      if (b.no !== undefined) memoryRecords[idx].no = b.no;
      if (b.description !== undefined) memoryRecords[idx].description = b.description;
      if (b.measure !== undefined) memoryRecords[idx].measure = b.measure;
      if (b.checkDate !== undefined) memoryRecords[idx].hazard_date = b.checkDate;
      if (b.checker !== undefined) memoryRecords[idx].checker = b.checker;
      if (b.fixer !== undefined) memoryRecords[idx].fixer = b.fixer;
      if (b.fixDate !== undefined) memoryRecords[idx].fix_date = b.fixDate;
      if (b.isResolved !== undefined) memoryRecords[idx].status = isResolvedToStatus(b.isResolved);
      if (b.remark !== undefined) memoryRecords[idx].remark = b.remark;
      memoryRecords[idx].updated_at = new Date().toISOString();
      return res.json(success(formatRow(memoryRecords[idx]), '更新成功(内存模式)'));
    }

    const setClauses: string[] = [];
    const params: any[] = [];
    let i = 1;

    if (b.no !== undefined) { setClauses.push(`no = $${i++}`); params.push(b.no); }
    if (b.description !== undefined) { setClauses.push(`description = $${i++}`); params.push(b.description); }
    if (b.measure !== undefined) { setClauses.push(`measure = $${i++}`); params.push(b.measure); }
    if (b.checkDate !== undefined) { setClauses.push(`hazard_date = $${i++}`); params.push(b.checkDate); }
    if (b.checker !== undefined) { setClauses.push(`checker = $${i++}`); params.push(b.checker); }
    if (b.fixer !== undefined) { setClauses.push(`fixer = $${i++}`); params.push(b.fixer); }
    if (b.fixDate !== undefined) { setClauses.push(`fix_date = $${i++}`); params.push(b.fixDate); }
    if (b.isResolved !== undefined) { setClauses.push(`status = $${i++}`); params.push(isResolvedToStatus(b.isResolved)); }
    if (b.remark !== undefined) { setClauses.push(`remark = $${i++}`); params.push(b.remark); }
    setClauses.push('updated_at = CURRENT_TIMESTAMP');
    params.push(req.params.id);

    const result = await pool.query(
      `UPDATE hazards SET ${setClauses.join(', ')} WHERE id = $${i} AND is_deleted = false RETURNING *`,
      params
    );

    if (result.rows.length === 0) return res.json(error(-2, '记录不存在'));
    res.json(success(formatRow(result.rows[0]), '更新成功'));
  } catch (err: any) {
    res.json(error(-1, err.message));
  }
});

// ========== DELETE /:id — 软删除 ==========
router.delete('/:id', async (req: Request, res: Response): Promise<any> => {
  try {
    if (!isConnected()) {
      initMemoryData();
      const record = memoryRecords.find(r => r.id === parseInt(req.params.id) && !r.is_deleted);
      if (!record) return res.json(error(-2, '记录不存在'));
      record.is_deleted = true;
      return res.json(success(null, '删除成功(内存模式)'));
    }

    const result = await pool.query(
      'UPDATE hazards SET is_deleted = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND is_deleted = false RETURNING id',
      [req.params.id]
    );
    if (result.rows.length === 0) return res.json(error(-2, '记录不存在'));
    res.json(success(null, '删除成功'));
  } catch (err: any) {
    res.json(error(-1, err.message));
  }
});

export default router;
