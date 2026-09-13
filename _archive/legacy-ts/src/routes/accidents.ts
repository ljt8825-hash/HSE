/**
 * 事故管理路由 - PostgreSQL + 内存降级双模式
 * 表: accidents
 * 端点: GET / GET /:id POST / PUT /:id DELETE /:id
 *       GET /stats/all GET /stats/yearly GET /unsettled
 */

import { Router, Request, Response, NextFunction } from 'express';
import { pool, isConnected } from '../config/db';
import { success, error } from '../middleware/response';

const router = Router();

// ========== 内存降级存储 ==========
let memoryRecords: any[] = [];
let memoryIdCounter = 1;

function initMemoryData(): void {
  // 前端有完整 MOCK 数据，内存模式种子为空
}

// ========== 格式化行 ==========
function formatRow(row: any) {
  return {
    id: row.id,
    no: row.no || null,
    accident_date: row.accident_date ? (row.accident_date instanceof Date ? row.accident_date.toISOString().slice(0, 10) : String(row.accident_date).slice(0, 10)) : null,
    year: row.year || null,
    month: row.month || null,
    township: row.township || '',
    location: row.location || '',
    involved_vehicle: row.involved_vehicle || '',
    vehicle_id: row.vehicle_id || null,
    involved_person: row.involved_person || '',
    personnel_id: row.personnel_id || null,
    accident_type: row.accident_type || '',
    responsibility: row.responsibility || '',
    responsibility_level: row.responsibility_level || '',
    level: row.level || '一般',
    description: row.description || '',
    cause_analysis: row.cause_analysis || '',
    loss_amount: parseFloat(row.loss_amount) || 0,
    compensation: parseFloat(row.compensation) || 0,
    status: row.status || '处理中',
    handler: row.handler || '',
    close_date: row.close_date ? (row.close_date instanceof Date ? row.close_date.toISOString().slice(0, 10) : String(row.close_date).slice(0, 10)) : null,
    remark: row.remark || '',
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

// ========== GET / — 列表（分页 + 筛选） ==========
router.get('/', async (req: Request, res: Response): Promise<any> => {
  try {
    if (!isConnected()) {
      initMemoryData();
      let data = memoryRecords.filter(r => !r.is_deleted);
      const { page = 1, pageSize = 20, keyword, year, month, township, status, level, accident_type } = req.query as any;
      if (keyword) {
        const kw = keyword.toLowerCase();
        data = data.filter(r =>
          (r.description && r.description.toLowerCase().includes(kw)) ||
          (r.location && r.location.toLowerCase().includes(kw)) ||
          (r.involved_person && r.involved_person.toLowerCase().includes(kw))
        );
      }
      if (year) data = data.filter(r => String(r.year) === String(year));
      if (month) data = data.filter(r => String(r.month) === String(month));
      if (township) data = data.filter(r => r.township === township);
      if (status) data = data.filter(r => r.status === status);
      if (level) data = data.filter(r => r.level === level);
      if (accident_type) data = data.filter(r => r.accident_type === accident_type);
      const total = data.length;
      const offset = (page - 1) * pageSize;
      const list = data.slice(offset, offset + parseInt(pageSize));
      return res.json(success({ list, total, page: parseInt(page), pageSize: parseInt(pageSize) }, '查询成功(内存模式)'));
    }

    let whereSql = ' WHERE is_deleted = false';
    const params: any[] = [];
    let paramIdx = 0;

    const { page = 1, pageSize = 20, keyword, year, month, township, status, level, accident_type } = req.query as any;

    if (keyword) {
      paramIdx++;
      whereSql += ` AND (description ILIKE $${paramIdx} OR location ILIKE $${paramIdx} OR involved_person ILIKE $${paramIdx} OR involved_vehicle ILIKE $${paramIdx})`;
      params.push(`%${keyword}%`);
    }
    if (year) { paramIdx++; whereSql += ` AND year = $${paramIdx}`; params.push(parseInt(year)); }
    if (month) { paramIdx++; whereSql += ` AND month = $${paramIdx}`; params.push(parseInt(month)); }
    if (township) { paramIdx++; whereSql += ` AND township = $${paramIdx}`; params.push(township); }
    if (status) { paramIdx++; whereSql += ` AND status = $${paramIdx}`; params.push(status); }
    if (level) { paramIdx++; whereSql += ` AND level = $${paramIdx}`; params.push(level); }
    if (accident_type) { paramIdx++; whereSql += ` AND accident_type = $${paramIdx}`; params.push(accident_type); }

    const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM accidents${whereSql}`, params);
    const total = countResult.rows[0].total;

    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    paramIdx++;
    const limitParam = paramIdx;
    params.push(parseInt(pageSize));
    paramIdx++;
    const offsetParam = paramIdx;
    params.push(offset);

    const listSql = `SELECT * FROM accidents${whereSql} ORDER BY accident_date DESC, id DESC LIMIT $${limitParam} OFFSET $${offsetParam}`;
    const result = await pool.query(listSql, params);

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

// ========== GET /stats/all — 全部统计 ==========
router.get('/stats/all', async (req: Request, res: Response): Promise<any> => {
  try {
    if (!isConnected()) {
      initMemoryData();
      return res.json(success({ total: 0, byType: {}, byLevel: {}, byYear: {} }, '统计成功(内存模式)'));
    }

    const [totalR, typeR, levelR, yearR, statusR] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS total FROM accidents WHERE is_deleted = false'),
      pool.query("SELECT accident_type, COUNT(*)::int AS count FROM accidents WHERE is_deleted = false GROUP BY accident_type"),
      pool.query("SELECT level, COUNT(*)::int AS count FROM accidents WHERE is_deleted = false GROUP BY level"),
      pool.query("SELECT year, COUNT(*)::int AS count FROM accidents WHERE is_deleted = false GROUP BY year ORDER BY year"),
      pool.query("SELECT status, COUNT(*)::int AS count FROM accidents WHERE is_deleted = false GROUP BY status")
    ]);

    const byType: any = {}, byLevel: any = {}, byYear: any = {}, byStatus: any = {};
    typeR.rows.forEach((r: any) => { byType[r.accident_type || '未知'] = r.count; });
    levelR.rows.forEach((r: any) => { byLevel[r.level || '未知'] = r.count; });
    yearR.rows.forEach((r: any) => { byYear[String(r.year)] = r.count; });
    statusR.rows.forEach((r: any) => { byStatus[r.status || '未知'] = r.count; });

    res.json(success({
      total: totalR.rows[0].total,
      byType, byLevel, byYear, byStatus
    }, '统计成功'));
  } catch (err: any) {
    res.json(error(-1, err.message));
  }
});

// ========== GET /stats/yearly?year= — 年度统计 ==========
router.get('/stats/yearly', async (req: Request, res: Response): Promise<any> => {
  try {
    if (!isConnected()) {
      initMemoryData();
      return res.json(success({ year: new Date().getFullYear(), total: 0, byMonth: {}, byType: {} }, '统计成功(内存模式)'));
    }

    const year = parseInt((req.query as any).year) || new Date().getFullYear();

    const [totalR, monthR, typeR] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS total FROM accidents WHERE is_deleted = false AND year = $1', [year]),
      pool.query('SELECT month, COUNT(*)::int AS count FROM accidents WHERE is_deleted = false AND year = $1 GROUP BY month ORDER BY month', [year]),
      pool.query('SELECT accident_type, COUNT(*)::int AS count FROM accidents WHERE is_deleted = false AND year = $1 GROUP BY accident_type', [year])
    ]);

    const byMonth: any = {};
    monthR.rows.forEach((r: any) => { byMonth[String(r.month)] = r.count; });
    const byType: any = {};
    typeR.rows.forEach((r: any) => { byType[r.accident_type || '未知'] = r.count; });

    res.json(success({ year, total: totalR.rows[0].total, byMonth, byType }, '统计成功'));
  } catch (err: any) {
    res.json(error(-1, err.message));
  }
});

// ========== GET /unsettled — 未结案事故（格式匹配前端 UNSETTLED_DATA） ==========
router.get('/unsettled', async (req: Request, res: Response): Promise<any> => {
  try {
    if (!isConnected()) {
      initMemoryData();
      const data = memoryRecords.filter(r => !r.is_deleted && r.status !== '已结案');
      // 按年份分组
      const years: any = {};
      data.forEach(r => {
        const yr = String(r.year || new Date(r.accident_date).getFullYear() || '');
        if (!years[yr]) years[yr] = { count: 0, list: [] };
        years[yr].list.push({
          date: r.accident_date || '',
          level: r.level || '',
          type: r.accident_type || '',
          person: r.involved_person || '',
          desc: r.description || '',
          status: r.status || '处理中'
        });
        years[yr].count = years[yr].list.length;
      });
      return res.json(success({ total: data.length, years }, '查询成功(内存模式)'));
    }

    const result = await pool.query(
      "SELECT * FROM accidents WHERE is_deleted = false AND status != '已结案' ORDER BY accident_date DESC"
    );
    const rows = result.rows.map(formatRow);
    const years: any = {};
    rows.forEach(r => {
      const yr = String(r.year || (r.accident_date ? new Date(r.accident_date).getFullYear() : ''));
      if (!years[yr]) years[yr] = { count: 0, list: [] };
      years[yr].list.push({
        date: r.accident_date || '',
        level: r.level || '',
        type: r.accident_type || '',
        person: r.involved_person || '',
        desc: r.description || '',
        status: r.status || '处理中'
      });
      years[yr].count = years[yr].list.length;
    });
    res.json(success({ total: rows.length, years }, '查询成功'));
  } catch (err: any) {
    res.json(error(-1, err.message));
  }
});

// ========== GET /stats — 通用统计（_createCrudApi 默认调用） ==========
router.get('/stats', async (req: Request, res: Response): Promise<any> => {
  try {
    if (!isConnected()) {
      return res.json(success({ total: 0 }, '统计成功(内存模式)'));
    }
    const result = await pool.query('SELECT COUNT(*)::int AS total FROM accidents WHERE is_deleted = false');
    res.json(success({ total: result.rows[0].total }, '统计成功'));
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
      return res.json(success(record, '查询成功'));
    }

    const result = await pool.query('SELECT * FROM accidents WHERE id = $1 AND is_deleted = false', [req.params.id]);
    if (result.rows.length === 0) return res.json(error(-2, '记录不存在'));
    res.json(success(formatRow(result.rows[0]), '查询成功'));
  } catch (err: any) {
    res.json(error(-1, err.message));
  }
});

// ========== POST / — 创建 ==========
router.post('/', async (req: Request, res: Response): Promise<any> => {
  try {
    if (!isConnected()) {
      initMemoryData();
      const record = { id: memoryIdCounter++, ...req.body, is_deleted: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      if (!record.year && record.accident_date) record.year = new Date(record.accident_date).getFullYear();
      if (!record.month && record.accident_date) record.month = new Date(record.accident_date).getMonth() + 1;
      memoryRecords.push(record);
      return res.json(success(record, '创建成功(内存模式)'));
    }

    const b = req.body;
    const year = b.year || (b.accident_date ? new Date(b.accident_date).getFullYear() : new Date().getFullYear());
    const month = b.month || (b.accident_date ? new Date(b.accident_date).getMonth() + 1 : new Date().getMonth() + 1);

    const result = await pool.query(`
      INSERT INTO accidents (no, accident_date, year, month, township, location, involved_vehicle, vehicle_id,
        involved_person, personnel_id, accident_type, responsibility, responsibility_level, level,
        description, cause_analysis, loss_amount, compensation, status, handler, close_date, remark)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
      RETURNING *
    `, [
      b.no || null, b.accident_date || null, year, month, b.township || '', b.location || '',
      b.involved_vehicle || '', b.vehicle_id || null, b.involved_person || '', b.personnel_id || null,
      b.accident_type || '', b.responsibility || '', b.responsibility_level || '', b.level || '一般',
      b.description || '', b.cause_analysis || '', b.loss_amount || 0, b.compensation || 0,
      b.status || '处理中', b.handler || '', b.close_date || null, b.remark || ''
    ]);

    res.json(success(formatRow(result.rows[0]), '创建成功'));
  } catch (err: any) {
    res.json(error(-1, err.message));
  }
});

// ========== PUT /:id — 更新 ==========
router.put('/:id', async (req: Request, res: Response): Promise<any> => {
  try {
    if (!isConnected()) {
      initMemoryData();
      const idx = memoryRecords.findIndex(r => r.id === parseInt(req.params.id) && !r.is_deleted);
      if (idx === -1) return res.json(error(-2, '记录不存在'));
      Object.assign(memoryRecords[idx], req.body, { updated_at: new Date().toISOString() });
      return res.json(success(memoryRecords[idx], '更新成功(内存模式)'));
    }

    const b = req.body;
    const result = await pool.query(`
      UPDATE accidents SET
        no = COALESCE($1, no), accident_date = COALESCE($2, accident_date),
        year = COALESCE($3, year), month = COALESCE($4, month),
        township = COALESCE($5, township), location = COALESCE($6, location),
        involved_vehicle = COALESCE($7, involved_vehicle), vehicle_id = COALESCE($8, vehicle_id),
        involved_person = COALESCE($9, involved_person), personnel_id = COALESCE($10, personnel_id),
        accident_type = COALESCE($11, accident_type), responsibility = COALESCE($12, responsibility),
        responsibility_level = COALESCE($13, responsibility_level), level = COALESCE($14, level),
        description = COALESCE($15, description), cause_analysis = COALESCE($16, cause_analysis),
        loss_amount = COALESCE($17, loss_amount), compensation = COALESCE($18, compensation),
        status = COALESCE($19, status), handler = COALESCE($20, handler),
        close_date = COALESCE($21, close_date), remark = COALESCE($22, remark),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $23 AND is_deleted = false
      RETURNING *
    `, [
      b.no, b.accident_date, b.year, b.month, b.township, b.location,
      b.involved_vehicle, b.vehicle_id, b.involved_person, b.personnel_id,
      b.accident_type, b.responsibility, b.responsibility_level, b.level,
      b.description, b.cause_analysis, b.loss_amount, b.compensation,
      b.status, b.handler, b.close_date, b.remark, req.params.id
    ]);

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
      'UPDATE accidents SET is_deleted = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND is_deleted = false RETURNING id',
      [req.params.id]
    );
    if (result.rows.length === 0) return res.json(error(-2, '记录不存在'));
    res.json(success(null, '删除成功'));
  } catch (err: any) {
    res.json(error(-1, err.message));
  }
});

export default router;
