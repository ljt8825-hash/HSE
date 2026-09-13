/**
 * 现场管理路由 - PostgreSQL + 内存降级双模式
 * 文件: src/routes/site-mgmt.ts
 * 子路由:
 *   /hazardous-work  → 危险作业（内存模式，无对应表）
 *   /violations      → 三违管理（内存模式，无对应表）
 *   /fire-equipment  → 消防设备（内存模式，无对应表）
 *   /grid-areas      → 网格管理（grid_areas 表）
 *   /summary         → 汇总统计
 */

import { Router, Request, Response } from 'express';
import { pool, isConnected } from '../config/db';
import { success, error } from '../middleware/response';

const router = Router();

// ========== 内存降级存储 ==========
const memoryStores: {
  hazardousWork: any[];
  violations: any[];
  fireEquipment: any[];
} = {
  hazardousWork: [],
  violations: [],
  fireEquipment: []
};
const memoryCounters = { hazardousWork: 1, violations: 1, fireEquipment: 1 };

function initMemoryData() {}

// ========== 通用内存 CRUD 工厂 ==========
function createMemoryCrud(storeName: string, basePath: string) {
  // GET /
  router.get(`/${basePath}`, async (req: Request, res: Response): Promise<any> => {
    try {
      initMemoryData();
      let data = memoryStores[storeName as keyof typeof memoryStores].filter(r => !r.is_deleted);
      const { page = 1, pageSize = 20, keyword } = req.query as any;
      if (keyword) {
        const kw = keyword.toLowerCase();
        data = data.filter(r => JSON.stringify(r).toLowerCase().includes(kw));
      }
      const total = data.length;
      const offset = (page - 1) * pageSize;
      const list = data.slice(offset, offset + parseInt(pageSize));
      res.json(success({ list, total, page: parseInt(page), pageSize: parseInt(pageSize) }, '查询成功(内存模式)'));
    } catch (err: any) { res.json(error(-1, err.message)); }
  });

  // GET /:id
  router.get(`/${basePath}/:id`, async (req: Request, res: Response): Promise<any> => {
    try {
      const r = memoryStores[storeName as keyof typeof memoryStores].find(r => r.id === parseInt(req.params.id) && !r.is_deleted);
      if (!r) { res.json(error(-2, '记录不存在')); return; }
      res.json(success(r, '查询成功'));
    } catch (err: any) { res.json(error(-1, err.message)); }
  });

  // POST /
  router.post(`/${basePath}`, async (req: Request, res: Response): Promise<any> => {
    try {
      const record = { id: memoryCounters[storeName as keyof typeof memoryCounters]++, ...req.body, is_deleted: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      memoryStores[storeName as keyof typeof memoryStores].push(record);
      res.json(success(record, '创建成功(内存模式)'));
    } catch (err: any) { res.json(error(-1, err.message)); }
  });

  // PUT /:id
  router.put(`/${basePath}/:id`, async (req: Request, res: Response): Promise<any> => {
    try {
      const idx = memoryStores[storeName as keyof typeof memoryStores].findIndex(r => r.id === parseInt(req.params.id) && !r.is_deleted);
      if (idx === -1) { res.json(error(-2, '记录不存在')); return; }
      Object.assign(memoryStores[storeName as keyof typeof memoryStores][idx], req.body, { updated_at: new Date().toISOString() });
      res.json(success(memoryStores[storeName as keyof typeof memoryStores][idx], '更新成功(内存模式)'));
    } catch (err: any) { res.json(error(-1, err.message)); }
  });

  // DELETE /:id
  router.delete(`/${basePath}/:id`, async (req: Request, res: Response): Promise<any> => {
    try {
      const r = memoryStores[storeName as keyof typeof memoryStores].find(r => r.id === parseInt(req.params.id) && !r.is_deleted);
      if (!r) { res.json(error(-2, '记录不存在')); return; }
      r.is_deleted = true;
      res.json(success(null, '删除成功(内存模式)'));
    } catch (err: any) { res.json(error(-1, err.message)); }
  });
}

// 创建三个内存子路由
createMemoryCrud('hazardousWork', 'hazardous-work');
createMemoryCrud('violations', 'violations');
createMemoryCrud('fireEquipment', 'fire-equipment');

// ================================================================
//  /grid-areas — 网格管理（PostgreSQL grid_areas 表）
// ================================================================

function formatGrid(row: any) {
  return {
    id: row.id,
    grid_code: row.grid_code || '',
    grid_level: row.grid_level || '',
    name: row.name || '',
    personnel_id: row.personnel_id || null,
    position: row.position || '',
    area: row.area || '',
    township: row.township || '',
    patrol_frequency: row.patrol_frequency || '',
    phone: row.phone || '',
    completion_rate: parseFloat(row.completion_rate) || 100,
    risk_level: row.risk_level || '一般',
    remarks: row.remarks || '',
    status: row.status || '在岗',
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

router.get('/grid-areas', async (req: Request, res: Response): Promise<any> => {
  try {
    if (!isConnected()) {
      let data: any[] = [];
      const { page = 1, pageSize = 20, keyword, grid_level, township, status } = req.query as any;
      if (keyword) {
        const kw = keyword.toLowerCase();
        data = data.filter(r => (r.name && r.name.toLowerCase().includes(kw)) || (r.area && r.area.toLowerCase().includes(kw)));
      }
      if (grid_level) data = data.filter(r => r.grid_level === grid_level);
      if (township) data = data.filter(r => r.township === township);
      if (status) data = data.filter(r => r.status === status);
      const total = data.length;
      const offset = (page - 1) * pageSize;
      res.json(success({ list: data.slice(offset, offset + parseInt(pageSize)), total, page: parseInt(page), pageSize: parseInt(pageSize) }, '查询成功(内存模式)'));
      return;
    }

    let whereSql = ' WHERE is_deleted = false';
    const params: any[] = [];
    let paramIdx = 0;
    const { page = 1, pageSize = 20, keyword, grid_level, township, status } = req.query as any;

    if (keyword) {
      paramIdx++;
      whereSql += ` AND (name ILIKE $${paramIdx} OR area ILIKE $${paramIdx} OR grid_code ILIKE $${paramIdx})`;
      params.push(`%${keyword}%`);
    }
    if (grid_level) { paramIdx++; whereSql += ` AND grid_level = $${paramIdx}`; params.push(grid_level); }
    if (township) { paramIdx++; whereSql += ` AND township = $${paramIdx}`; params.push(township); }
    if (status) { paramIdx++; whereSql += ` AND status = $${paramIdx}`; params.push(status); }

    const countR = await pool.query(`SELECT COUNT(*)::int AS total FROM grid_areas${whereSql}`, params);
    const total = countR.rows[0].total;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    paramIdx++;
    const lp = paramIdx; params.push(parseInt(pageSize));
    paramIdx++;
    const op = paramIdx; params.push(offset);

    const result = await pool.query(`SELECT * FROM grid_areas${whereSql} ORDER BY id ASC LIMIT $${lp} OFFSET $${op}`, params);
    res.json(success({ list: result.rows.map(formatGrid), total, page: parseInt(page), pageSize: parseInt(pageSize) }, '查询成功'));
  } catch (err: any) { res.json(error(-1, err.message)); }
});

router.get('/grid-areas/:id', async (req: Request, res: Response): Promise<any> => {
  try {
    if (!isConnected()) {
      res.json(error(-2, '记录不存在(内存模式)'));
      return;
    }
    const result = await pool.query('SELECT * FROM grid_areas WHERE id = $1 AND is_deleted = false', [req.params.id]);
    if (result.rows.length === 0) { res.json(error(-2, '记录不存在')); return; }
    res.json(success(formatGrid(result.rows[0]), '查询成功'));
  } catch (err: any) { res.json(error(-1, err.message)); }
});

router.post('/grid-areas', async (req: Request, res: Response): Promise<any> => {
  try {
    if (!isConnected()) {
      res.json(error(-1, '数据库未连接，无法创建网格记录'));
      return;
    }
    const b = req.body;
    const result = await pool.query(`
      INSERT INTO grid_areas (grid_code, grid_level, name, personnel_id, position, area, township, patrol_frequency, phone, completion_rate, risk_level, remarks, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *
    `, [b.grid_code || '', b.grid_level || '', b.name || '', b.personnel_id || null, b.position || '', b.area || '', b.township || '', b.patrol_frequency || '', b.phone || '', b.completion_rate || 100, b.risk_level || '一般', b.remarks || '', b.status || '在岗']);
    res.json(success(formatGrid(result.rows[0]), '创建成功'));
  } catch (err: any) { res.json(error(-1, err.message)); }
});

router.put('/grid-areas/:id', async (req: Request, res: Response): Promise<any> => {
  try {
    if (!isConnected()) {
      res.json(error(-1, '数据库未连接'));
      return;
    }
    const b = req.body;
    const result = await pool.query(`
      UPDATE grid_areas SET grid_code=COALESCE($1,grid_code), grid_level=COALESCE($2,grid_level),
        name=COALESCE($3,name), personnel_id=COALESCE($4,personnel_id),
        position=COALESCE($5,position), area=COALESCE($6,area), township=COALESCE($7,township),
        patrol_frequency=COALESCE($8,patrol_frequency), phone=COALESCE($9,phone),
        completion_rate=COALESCE($10,completion_rate), risk_level=COALESCE($11,risk_level),
        remarks=COALESCE($12,remarks), status=COALESCE($13,status), updated_at=CURRENT_TIMESTAMP
      WHERE id=$14 AND is_deleted=false RETURNING *
    `, [b.grid_code, b.grid_level, b.name, b.personnel_id, b.position, b.area, b.township, b.patrol_frequency, b.phone, b.completion_rate, b.risk_level, b.remarks, b.status, req.params.id]);
    if (result.rows.length === 0) { res.json(error(-2, '记录不存在')); return; }
    res.json(success(formatGrid(result.rows[0]), '更新成功'));
  } catch (err: any) { res.json(error(-1, err.message)); }
});

router.delete('/grid-areas/:id', async (req: Request, res: Response): Promise<any> => {
  try {
    if (!isConnected()) {
      res.json(error(-1, '数据库未连接'));
      return;
    }
    const result = await pool.query('UPDATE grid_areas SET is_deleted=true, updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND is_deleted=false RETURNING id', [req.params.id]);
    if (result.rows.length === 0) { res.json(error(-2, '记录不存在')); return; }
    res.json(success(null, '删除成功'));
  } catch (err: any) { res.json(error(-1, err.message)); }
});

// ================================================================
//  /summary — 汇总统计
// ================================================================

router.get('/summary', async (req: Request, res: Response): Promise<any> => {
  try {
    const hwCount = memoryStores.hazardousWork.filter(r => !r.is_deleted).length;
    const vCount = memoryStores.violations.filter(r => !r.is_deleted).length;
    const feCount = memoryStores.fireEquipment.filter(r => !r.is_deleted).length;

    let gridCount = 0;
    if (isConnected()) {
      try {
        const gridR = await pool.query('SELECT COUNT(*)::int AS total FROM grid_areas WHERE is_deleted = false');
        gridCount = gridR.rows[0].total;
      } catch (e) { /* ignore */ }
    }

    res.json(success({
      hazardousWork: hwCount,
      violations: vCount,
      fireEquipment: feCount,
      gridAreas: gridCount
    }, '统计成功'));
  } catch (err: any) {
    res.json(error(-1, err.message));
  }
});

export default router;
