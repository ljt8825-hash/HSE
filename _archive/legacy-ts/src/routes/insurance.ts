/**
 * 保险管理路由 - PostgreSQL + 内存降级双模式
 * 文件: src/routes/insurance.ts
 * 三个子路由:
 *   /vehicle   → vehicles 表
 *   /personnel → personnel_insurance 表
 *   /overage   → over_age_personnel 表
 */

import { Router, Request, Response } from 'express';
import { pool, isConnected } from '../config/db';
import { success, error } from '../middleware/response';

const router = Router();

// ========== 内存降级存储 ==========
const memoryStores: {
  vehicle: any[];
  personnel: any[];
  overage: any[];
} = {
  vehicle: [],
  personnel: [],
  overage: []
};
const memoryCounters = { vehicle: 1, personnel: 1, overage: 1 };

function initMemoryData() {}

// ================================================================
//  /vehicle — 车辆保险
//
//  ⚠️ 路由顺序重要！所有具体路径必须在 :id 参数路径之前注册，
//     否则 GET /vehicle/list 等 URL 会被 :id 误捕获（id="list" → NaN）
// ================================================================

function formatVehicle(row: any) {
  return {
    id: row.id,
    plate: row.plate || '',
    vin: row.vin || '',
    engine_no: row.engine_no || '',
    reg_date: row.reg_date ? String(row.reg_date).slice(0, 10) : null,
    model: row.model || '',
    owner: row.owner || '',
    insurance_type: row.insurance_type || '',
    insurance_start: row.insurance_start ? String(row.insurance_start).slice(0, 10) : null,
    insurance_end: row.insurance_end ? String(row.insurance_end).slice(0, 10) : null,
    premium: parseFloat(row.premium) || 0,
    vehicle_type: row.vehicle_type || '',
    status: row.status || '在用',
    remark: row.remark || '',
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

router.get('/vehicle', async (req: Request, res: Response): Promise<any> => {
  try {
    if (!isConnected()) {
      initMemoryData();
      let data = memoryStores.vehicle.filter(r => !r.is_deleted);
      const { page = 1, pageSize = 20, keyword } = req.query as any;
      if (keyword) {
        const kw = keyword.toLowerCase();
        data = data.filter(r => (r.plate && r.plate.toLowerCase().includes(kw)) || (r.owner && r.owner.toLowerCase().includes(kw)));
      }
      const total = data.length;
      const offset = (page - 1) * pageSize;
      res.json(success({ list: data.slice(offset, offset + parseInt(pageSize)), total, page: parseInt(page), pageSize: parseInt(pageSize) }, '查询成功(内存模式)'));
      return;
    }

    let whereSql = ' WHERE is_deleted = false';
    const params: any[] = [];
    let paramIdx = 0;
    const { page = 1, pageSize = 20, keyword } = req.query as any;
    if (keyword) {
      paramIdx++;
      whereSql += ` AND (plate ILIKE $${paramIdx} OR owner ILIKE $${paramIdx} OR model ILIKE $${paramIdx})`;
      params.push(`%${keyword}%`);
    }

    const countR = await pool.query(`SELECT COUNT(*)::int AS total FROM vehicles${whereSql}`, params);
    const total = countR.rows[0].total;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    paramIdx++;
    const lp = paramIdx; params.push(parseInt(pageSize));
    paramIdx++;
    const op = paramIdx; params.push(offset);

    const result = await pool.query(`SELECT * FROM vehicles${whereSql} ORDER BY id ASC LIMIT $${lp} OFFSET $${op}`, params);
    res.json(success({ list: result.rows.map(formatVehicle), total, page: parseInt(page), pageSize: parseInt(pageSize) }, '查询成功'));
  } catch (err: any) {
    res.json(error(-1, err.message));
  }
});

// GET /vehicle/stats — 车辆保险统计（必须在 /:id 之前注册）
router.get('/vehicle/stats', async (_req: Request, res: Response): Promise<any> => {
  try {
    const stats = { total: 0, active: 0, expired: 0, totalPremium: 0 };
    let vehicle_types: string[] = [];
    let insurance_companies: string[] = [];

    if (isConnected()) {
      const r1 = await pool.query("SELECT COUNT(*)::int AS v FROM vehicles WHERE is_deleted = false");
      stats.total = r1.rows[0].v;
      const r2 = await pool.query("SELECT COUNT(*)::int AS v FROM vehicles WHERE is_deleted = false AND insurance_end >= CURRENT_DATE");
      stats.active = r2.rows[0].v;
      const r3 = await pool.query("SELECT COUNT(*)::int AS v FROM vehicles WHERE is_deleted = false AND insurance_end < CURRENT_DATE");
      stats.expired = r3.rows[0].v;
      const r4 = await pool.query("SELECT COALESCE(SUM(premium), 0)::float AS v FROM vehicles WHERE is_deleted = false");
      stats.totalPremium = r4.rows[0].v;
      const r5 = await pool.query("SELECT DISTINCT vehicle_type FROM vehicles WHERE is_deleted = false AND vehicle_type IS NOT NULL AND vehicle_type != '' ORDER BY vehicle_type");
      vehicle_types = r5.rows.map((r: any) => r.vehicle_type);
      const r6 = await pool.query("SELECT DISTINCT insurance_type FROM vehicles WHERE is_deleted = false AND insurance_type IS NOT NULL AND insurance_type != '' ORDER BY insurance_type");
      insurance_companies = r6.rows.map((r: any) => r.insurance_type);
    } else {
      const all = memoryStores.vehicle.filter(r => !r.is_deleted);
      stats.total = all.length;
      stats.active = all.filter(r => r.insurance_end && new Date(r.insurance_end) >= new Date()).length;
      stats.expired = all.filter(r => r.insurance_end && new Date(r.insurance_end) < new Date()).length;
      stats.totalPremium = all.reduce((s, r) => s + (parseFloat(r.premium) || 0), 0);
      vehicle_types = [...new Set(all.map(r => r.vehicle_type).filter(Boolean))];
      insurance_companies = [...new Set(all.map(r => r.insurance_type).filter(Boolean))];
    }

    res.json(success({ stats, vehicle_types, insurance_companies }, '查询成功'));
  } catch (err: any) { res.json(error(-1, err.message)); }
});

// POST /vehicle/import — 批量导入车辆保险数据
router.post('/vehicle/import', async (req: Request, res: Response): Promise<any> => {
  try {
    const { records } = req.body;
    if (!Array.isArray(records) || records.length === 0) {
      return res.json(error(-1, '导入数据不能为空'));
    }
    let successCount = 0;
    let failCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < records.length; i++) {
      try {
        const r = records[i];
        if (isConnected()) {
          await pool.query(`
            INSERT INTO vehicles (plate, vin, engine_no, reg_date, model, owner, insurance_type, insurance_start, insurance_end, premium, vehicle_type, status, remark)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
          `, [r.plate || '', r.vin || '', r.engine_no || '', r.reg_date || null, r.model || '', r.owner || '', r.insurance_type || '', r.insurance_start || null, r.insurance_end || null, r.premium || 0, r.vehicle_type || '', r.status || '在用', r.remark || '']);
        } else {
          memoryStores.vehicle.push({ id: memoryCounters.vehicle++, ...r, is_deleted: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
        }
        successCount++;
      } catch (e: any) {
        failCount++;
        errors.push(`第${i + 1}行: ${e.message}`);
      }
    }
    res.json(success({ total: records.length, success: successCount, failed: failCount, errors }, '导入完成'));
  } catch (err: any) { res.json(error(-1, err.message)); }
});

// ── /vehicle 具体路径结束，以下为参数化路径（必须在最后）───────────

router.get('/vehicle/:id', async (req: Request, res: Response): Promise<any> => {
  try {
    if (!isConnected()) {
      const r = memoryStores.vehicle.find(r => r.id === parseInt(req.params.id) && !r.is_deleted);
      if (!r) { res.json(error(-2, '记录不存在')); return; }
      res.json(success(r, '查询成功'));
      return;
    }
    const result = await pool.query('SELECT * FROM vehicles WHERE id = $1 AND is_deleted = false', [req.params.id]);
    if (result.rows.length === 0) { res.json(error(-2, '记录不存在')); return; }
    res.json(success(formatVehicle(result.rows[0]), '查询成功'));
  } catch (err: any) { res.json(error(-1, err.message)); }
});

router.post('/vehicle', async (req: Request, res: Response): Promise<any> => {
  try {
    if (!isConnected()) {
      const record = { id: memoryCounters.vehicle++, ...req.body, is_deleted: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      memoryStores.vehicle.push(record);
      res.json(success(record, '创建成功(内存模式)'));
      return;
    }
    const b = req.body;
    const result = await pool.query(`
      INSERT INTO vehicles (plate, vin, engine_no, reg_date, model, owner, insurance_type, insurance_start, insurance_end, premium, vehicle_type, status, remark)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *
    `, [b.plate || '', b.vin || '', b.engine_no || '', b.reg_date || null, b.model || '', b.owner || '', b.insurance_type || '', b.insurance_start || null, b.insurance_end || null, b.premium || 0, b.vehicle_type || '', b.status || '在用', b.remark || '']);
    res.json(success(formatVehicle(result.rows[0]), '创建成功'));
  } catch (err: any) { res.json(error(-1, err.message)); }
});

router.put('/vehicle/:id', async (req: Request, res: Response): Promise<any> => {
  try {
    if (!isConnected()) {
      const idx = memoryStores.vehicle.findIndex(r => r.id === parseInt(req.params.id) && !r.is_deleted);
      if (idx === -1) { res.json(error(-2, '记录不存在')); return; }
      Object.assign(memoryStores.vehicle[idx], req.body, { updated_at: new Date().toISOString() });
      res.json(success(memoryStores.vehicle[idx], '更新成功(内存模式)'));
      return;
    }
    const b = req.body;
    const result = await pool.query(`
      UPDATE vehicles SET plate=COALESCE($1,plate), vin=COALESCE($2,vin), engine_no=COALESCE($3,engine_no),
        reg_date=COALESCE($4,reg_date), model=COALESCE($5,model), owner=COALESCE($6,owner),
        insurance_type=COALESCE($7,insurance_type), insurance_start=COALESCE($8,insurance_start),
        insurance_end=COALESCE($9,insurance_end), premium=COALESCE($10,premium),
        vehicle_type=COALESCE($11,vehicle_type), status=COALESCE($12,status),
        remark=COALESCE($13,remark), updated_at=CURRENT_TIMESTAMP
      WHERE id=$14 AND is_deleted=false RETURNING *
    `, [b.plate, b.vin, b.engine_no, b.reg_date, b.model, b.owner, b.insurance_type, b.insurance_start, b.insurance_end, b.premium, b.vehicle_type, b.status, b.remark, req.params.id]);
    if (result.rows.length === 0) { res.json(error(-2, '记录不存在')); return; }
    res.json(success(formatVehicle(result.rows[0]), '更新成功'));
  } catch (err: any) { res.json(error(-1, err.message)); }
});

router.delete('/vehicle/:id', async (req: Request, res: Response): Promise<any> => {
  try {
    if (!isConnected()) {
      const r = memoryStores.vehicle.find(r => r.id === parseInt(req.params.id) && !r.is_deleted);
      if (!r) { res.json(error(-2, '记录不存在')); return; }
      r.is_deleted = true;
      res.json(success(null, '删除成功(内存模式)'));
      return;
    }
    const result = await pool.query('UPDATE vehicles SET is_deleted=true, updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND is_deleted=false RETURNING id', [req.params.id]);
    if (result.rows.length === 0) { res.json(error(-2, '记录不存在')); return; }
    res.json(success(null, '删除成功'));
  } catch (err: any) { res.json(error(-1, err.message)); }
});

// ================================================================
//  /personnel — 人员保险
// ================================================================

function formatPersonnelIns(row: any) {
  return {
    id: row.id,
    personnel_id: row.personnel_id || null,
    person_name: row.person_name || '',
    insurance_type: row.insurance_type || '',
    coverage_amount: parseFloat(row.coverage_amount) || 0,
    premium: parseFloat(row.premium) || 0,
    start_date: row.start_date ? String(row.start_date).slice(0, 10) : null,
    expire_date: row.expire_date ? String(row.expire_date).slice(0, 10) : null,
    is_current: row.is_current !== false,
    policy_no: row.policy_no || '',
    remark: row.remark || '',
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

router.get('/personnel', async (req: Request, res: Response): Promise<any> => {
  try {
    if (!isConnected()) {
      let data = memoryStores.personnel.filter(r => !r.is_deleted);
      const { page = 1, pageSize = 20, keyword } = req.query as any;
      if (keyword) {
        const kw = keyword.toLowerCase();
        data = data.filter(r => (r.person_name && r.person_name.toLowerCase().includes(kw)));
      }
      const total = data.length;
      const offset = (page - 1) * pageSize;
      res.json(success({ list: data.slice(offset, offset + parseInt(pageSize)), total, page: parseInt(page), pageSize: parseInt(pageSize) }, '查询成功(内存模式)'));
      return;
    }

    let whereSql = ' WHERE is_deleted = false';
    const params: any[] = [];
    let paramIdx = 0;
    const { page = 1, pageSize = 20, keyword } = req.query as any;
    if (keyword) {
      paramIdx++;
      whereSql += ` AND person_name ILIKE $${paramIdx}`;
      params.push(`%${keyword}%`);
    }

    const countR = await pool.query(`SELECT COUNT(*)::int AS total FROM personnel_insurance${whereSql}`, params);
    const total = countR.rows[0].total;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    paramIdx++;
    const lp = paramIdx; params.push(parseInt(pageSize));
    paramIdx++;
    const op = paramIdx; params.push(offset);

    const result = await pool.query(`SELECT * FROM personnel_insurance${whereSql} ORDER BY id ASC LIMIT $${lp} OFFSET $${op}`, params);
    res.json(success({ list: result.rows.map(formatPersonnelIns), total, page: parseInt(page), pageSize: parseInt(pageSize) }, '查询成功'));
  } catch (err: any) { res.json(error(-1, err.message)); }
});

// GET /personnel/stats — 人员保险统计（必须在 /:id 之前注册）
router.get('/personnel/stats', async (_req: Request, res: Response): Promise<any> => {
  try {
    const stats = { total: 0, covered: 0, expired: 0, pending: 0, highRisk: 0 };
    let insurance_types: string[] = [];
    let townships: string[] = [];

    if (isConnected()) {
      const r1 = await pool.query("SELECT COUNT(*)::int AS v FROM personnel_insurance WHERE is_deleted = false");
      stats.total = r1.rows[0].v;
      const r2 = await pool.query("SELECT COUNT(*)::int AS v FROM personnel_insurance WHERE is_deleted = false AND expire_date >= CURRENT_DATE");
      stats.covered = r2.rows[0].v;
      const r3 = await pool.query("SELECT COUNT(*)::int AS v FROM personnel_insurance WHERE is_deleted = false AND expire_date < CURRENT_DATE");
      stats.expired = r3.rows[0].v;
      const r4 = await pool.query("SELECT COUNT(*)::int AS v FROM personnel_insurance WHERE is_deleted = false AND (start_date IS NULL OR start_date > CURRENT_DATE)");
      stats.pending = r4.rows[0].v;
      const r5 = await pool.query("SELECT COUNT(*)::int AS v FROM over_age_personnel WHERE is_deleted = false AND control_type LIKE '%高危%'");
      stats.highRisk = r5.rows[0].v;
      const r6 = await pool.query("SELECT DISTINCT insurance_type FROM personnel_insurance WHERE is_deleted = false AND insurance_type IS NOT NULL AND insurance_type != '' ORDER BY insurance_type");
      insurance_types = r6.rows.map((r: any) => r.insurance_type);
    } else {
      const all = memoryStores.personnel.filter(r => !r.is_deleted);
      stats.total = all.length;
      stats.covered = all.filter(r => r.expire_date && new Date(r.expire_date) >= new Date()).length;
      stats.expired = all.filter(r => r.expire_date && new Date(r.expire_date) < new Date()).length;
      stats.pending = all.filter(r => !r.start_date || new Date(r.start_date) > new Date()).length;
      insurance_types = [...new Set(all.map(r => r.insurance_type).filter(Boolean))];
    }

    res.json(success({ stats, insurance_types, townships }, '查询成功'));
  } catch (err: any) { res.json(error(-1, err.message)); }
});

// GET /personnel/job-type-stats — 按工种分组统计
router.get('/personnel/job-type-stats', async (_req: Request, res: Response): Promise<any> => {
  try {
    let result: Array<{ jobType: string; count: number }> = [];
    if (isConnected()) {
      const r = await pool.query(`
        SELECT COALESCE(NULLIF(insurance_type, ''), '未分类') AS job_type, COUNT(*)::int AS count
        FROM personnel_insurance
        WHERE is_deleted = false
        GROUP BY insurance_type
        ORDER BY count DESC
      `);
      result = r.rows.map((row: any) => ({ jobType: row.job_type, count: row.count }));
    } else {
      const map = new Map<string, number>();
      for (const p of memoryStores.personnel.filter(r => !r.is_deleted)) {
        const t = p.insurance_type || '未分类';
        map.set(t, (map.get(t) || 0) + 1);
      }
      result = Array.from(map.entries()).map(([jobType, count]) => ({ jobType, count }));
    }
    res.json(success(result, '查询成功'));
  } catch (err: any) { res.json(error(-1, err.message)); }
});

// GET /personnel/expiring-soon — 即将到期人员
router.get('/personnel/expiring-soon', async (req: Request, res: Response): Promise<any> => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    let list: any[] = [];
    if (isConnected()) {
      const r = await pool.query(`
        SELECT * FROM personnel_insurance
        WHERE is_deleted = false
          AND expire_date IS NOT NULL
          AND expire_date >= CURRENT_DATE
          AND expire_date <= CURRENT_DATE + INTERVAL '${days} days'
        ORDER BY expire_date ASC
      `);
      list = r.rows.map(formatPersonnelIns);
    } else {
      const now = new Date();
      const future = new Date(now.getTime() + days * 86400000);
      list = memoryStores.personnel
        .filter(r => !r.is_deleted && r.expire_date && new Date(r.expire_date) >= now && new Date(r.expire_date) <= future)
        .sort((a, b) => new Date(a.expire_date).getTime() - new Date(b.expire_date).getTime());
    }
    res.json(success(list, '查询成功'));
  } catch (err: any) { res.json(error(-1, err.message)); }
});

// POST /personnel/batch-delete — 批量删除
router.post('/personnel/batch-delete', async (req: Request, res: Response): Promise<any> => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.json(error(-1, '请选择要删除的记录'));
    }
    let deletedCount = 0;
    if (isConnected()) {
      const r = await pool.query(
        'UPDATE personnel_insurance SET is_deleted=true, updated_at=CURRENT_TIMESTAMP WHERE id = ANY($1::bigint[]) AND is_deleted=false RETURNING id',
        [ids]
      );
      deletedCount = r.rows.length;
    } else {
      for (const id of ids) {
        const r = memoryStores.personnel.find(r => r.id === parseInt(id) && !r.is_deleted);
        if (r) { r.is_deleted = true; deletedCount++; }
      }
    }
    res.json(success({ deleted: deletedCount }, `成功删除${deletedCount}条记录`));
  } catch (err: any) { res.json(error(-1, err.message)); }
});

// POST /personnel/import — 导入人员保险数据
router.post('/personnel/import', async (req: Request, res: Response): Promise<any> => {
  try {
    const { records } = req.body;
    if (!Array.isArray(records) || records.length === 0) {
      return res.json(error(-1, '导入数据不能为空'));
    }
    let successCount = 0;
    let failCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < records.length; i++) {
      try {
        const r = records[i];
        if (isConnected()) {
          await pool.query(`
            INSERT INTO personnel_insurance (personnel_id, person_name, insurance_type, coverage_amount, premium, start_date, expire_date, is_current, policy_no, remark)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
          `, [r.personnel_id || null, r.person_name || '', r.insurance_type || '', r.coverage_amount || 0, r.premium || 0, r.start_date || null, r.expire_date || null, r.is_current !== false, r.policy_no || '', r.remark || '']);
        } else {
          memoryStores.personnel.push({ id: memoryCounters.personnel++, ...r, is_deleted: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
        }
        successCount++;
      } catch (e: any) {
        failCount++;
        errors.push(`第${i + 1}行: ${e.message}`);
      }
    }
    res.json(success({ total: records.length, success: successCount, failed: failCount, errors }, '导入完成'));
  } catch (err: any) { res.json(error(-1, err.message)); }
});

// GET /personnel/export — 导出人员保险数据
router.get('/personnel/export', async (_req: Request, res: Response): Promise<any> => {
  try {
    let data: any[] = [];
    if (isConnected()) {
      const r = await pool.query('SELECT * FROM personnel_insurance WHERE is_deleted = false ORDER BY id ASC');
      data = r.rows.map(formatPersonnelIns);
    } else {
      data = memoryStores.personnel.filter(r => !r.is_deleted);
    }
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="personnel_insurance_export.json"');
    res.json(success({ list: data, total: data.length }, '导出成功'));
  } catch (err: any) { res.json(error(-1, err.message)); }
});

router.get('/personnel/:id', async (req: Request, res: Response): Promise<any> => {
  try {
    if (!isConnected()) {
      const r = memoryStores.personnel.find(r => r.id === parseInt(req.params.id) && !r.is_deleted);
      if (!r) { res.json(error(-2, '记录不存在')); return; }
      res.json(success(r, '查询成功'));
      return;
    }
    const result = await pool.query('SELECT * FROM personnel_insurance WHERE id = $1 AND is_deleted = false', [req.params.id]);
    if (result.rows.length === 0) { res.json(error(-2, '记录不存在')); return; }
    res.json(success(formatPersonnelIns(result.rows[0]), '查询成功'));
  } catch (err: any) { res.json(error(-1, err.message)); }
});

router.post('/personnel', async (req: Request, res: Response): Promise<any> => {
  try {
    if (!isConnected()) {
      const record = { id: memoryCounters.personnel++, ...req.body, is_deleted: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      memoryStores.personnel.push(record);
      res.json(success(record, '创建成功(内存模式)'));
      return;
    }
    const b = req.body;
    const result = await pool.query(`
      INSERT INTO personnel_insurance (personnel_id, person_name, insurance_type, coverage_amount, premium, start_date, expire_date, is_current, policy_no, remark)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *
    `, [b.personnel_id || null, b.person_name || '', b.insurance_type || '', b.coverage_amount || 0, b.premium || 0, b.start_date || null, b.expire_date || null, b.is_current !== false, b.policy_no || '', b.remark || '']);
    res.json(success(formatPersonnelIns(result.rows[0]), '创建成功'));
  } catch (err: any) { res.json(error(-1, err.message)); }
});

router.put('/personnel/:id', async (req: Request, res: Response): Promise<any> => {
  try {
    if (!isConnected()) {
      const idx = memoryStores.personnel.findIndex(r => r.id === parseInt(req.params.id) && !r.is_deleted);
      if (idx === -1) { res.json(error(-2, '记录不存在')); return; }
      Object.assign(memoryStores.personnel[idx], req.body, { updated_at: new Date().toISOString() });
      res.json(success(memoryStores.personnel[idx], '更新成功(内存模式)'));
      return;
    }
    const b = req.body;
    const result = await pool.query(`
      UPDATE personnel_insurance SET personnel_id=COALESCE($1,personnel_id), person_name=COALESCE($2,person_name),
        insurance_type=COALESCE($3,insurance_type), coverage_amount=COALESCE($4,coverage_amount),
        premium=COALESCE($5,premium), start_date=COALESCE($6,start_date), expire_date=COALESCE($7,expire_date),
        is_current=COALESCE($8,is_current), policy_no=COALESCE($9,policy_no),
        remark=COALESCE($10,remark), updated_at=CURRENT_TIMESTAMP
      WHERE id=$11 AND is_deleted=false RETURNING *
    `, [b.personnel_id, b.person_name, b.insurance_type, b.coverage_amount, b.premium, b.start_date, b.expire_date, b.is_current, b.policy_no, b.remark, req.params.id]);
    if (result.rows.length === 0) { res.json(error(-2, '记录不存在')); return; }
    res.json(success(formatPersonnelIns(result.rows[0]), '更新成功'));
  } catch (err: any) { res.json(error(-1, err.message)); }
});

router.delete('/personnel/:id', async (req: Request, res: Response): Promise<any> => {
  try {
    if (!isConnected()) {
      const r = memoryStores.personnel.find(r => r.id === parseInt(req.params.id) && !r.is_deleted);
      if (!r) { res.json(error(-2, '记录不存在')); return; }
      r.is_deleted = true;
      res.json(success(null, '删除成功(内存模式)'));
      return;
    }
    const result = await pool.query('UPDATE personnel_insurance SET is_deleted=true, updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND is_deleted=false RETURNING id', [req.params.id]);
    if (result.rows.length === 0) { res.json(error(-2, '记录不存在')); return; }
    res.json(success(null, '删除成功'));
  } catch (err: any) { res.json(error(-1, err.message)); }
});

// ================================================================
//  /overage — 超龄人员
// ================================================================

function formatOverage(row: any) {
  return {
    id: row.id,
    personnel_id: row.personnel_id || null,
    name: row.name || '',
    id_card: row.id_card || '',
    gender: row.gender || '',
    birth_date: row.birth_date ? String(row.birth_date).slice(0, 10) : null,
    age: row.age || 0,
    dept: row.dept || '',
    position: row.position || '',
    hire_date: row.hire_date ? String(row.hire_date).slice(0, 10) : null,
    person_type: row.person_type || '',
    control_type: row.control_type || '',
    is_to_optimize: row.is_to_optimize || false,
    actual_insurance: row.actual_insurance || '',
    has_injury: row.has_injury || false,
    has_employer: row.has_employer || false,
    compliance: row.compliance || '',
    expire_date: row.expire_date ? String(row.expire_date).slice(0, 10) : null,
    optimize_status: row.optimize_status || '待处理',
    optimize_date: row.optimize_date ? String(row.optimize_date).slice(0, 10) : null,
    optimize_remark: row.optimize_remark || '',
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

router.get('/overage', async (req: Request, res: Response): Promise<any> => {
  try {
    if (!isConnected()) {
      let data = memoryStores.overage.filter(r => !r.is_deleted);
      const { page = 1, pageSize = 20, keyword } = req.query as any;
      if (keyword) {
        const kw = keyword.toLowerCase();
        data = data.filter(r => (r.name && r.name.toLowerCase().includes(kw)));
      }
      const total = data.length;
      const offset = (page - 1) * pageSize;
      res.json(success({ list: data.slice(offset, offset + parseInt(pageSize)), total, page: parseInt(page), pageSize: parseInt(pageSize) }, '查询成功(内存模式)'));
      return;
    }

    let whereSql = ' WHERE is_deleted = false';
    const params: any[] = [];
    let paramIdx = 0;
    const { page = 1, pageSize = 20, keyword } = req.query as any;
    if (keyword) {
      paramIdx++;
      whereSql += ` AND (name ILIKE $${paramIdx} OR id_card ILIKE $${paramIdx})`;
      params.push(`%${keyword}%`);
    }

    const countR = await pool.query(`SELECT COUNT(*)::int AS total FROM over_age_personnel${whereSql}`, params);
    const total = countR.rows[0].total;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    paramIdx++;
    const lp = paramIdx; params.push(parseInt(pageSize));
    paramIdx++;
    const op = paramIdx; params.push(offset);

    const result = await pool.query(`SELECT * FROM over_age_personnel${whereSql} ORDER BY id ASC LIMIT $${lp} OFFSET $${op}`, params);
    res.json(success({ list: result.rows.map(formatOverage), total, page: parseInt(page), pageSize: parseInt(pageSize) }, '查询成功'));
  } catch (err: any) { res.json(error(-1, err.message)); }
});

router.get('/overage/:id', async (req: Request, res: Response): Promise<any> => {
  try {
    if (!isConnected()) {
      const r = memoryStores.overage.find(r => r.id === parseInt(req.params.id) && !r.is_deleted);
      if (!r) { res.json(error(-2, '记录不存在')); return; }
      res.json(success(r, '查询成功'));
      return;
    }
    const result = await pool.query('SELECT * FROM over_age_personnel WHERE id = $1 AND is_deleted = false', [req.params.id]);
    if (result.rows.length === 0) { res.json(error(-2, '记录不存在')); return; }
    res.json(success(formatOverage(result.rows[0]), '查询成功'));
  } catch (err: any) { res.json(error(-1, err.message)); }
});

router.post('/overage', async (req: Request, res: Response): Promise<any> => {
  try {
    if (!isConnected()) {
      const record = { id: memoryCounters.overage++, ...req.body, is_deleted: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      memoryStores.overage.push(record);
      res.json(success(record, '创建成功(内存模式)'));
      return;
    }
    const b = req.body;
    const result = await pool.query(`
      INSERT INTO over_age_personnel (personnel_id, name, id_card, gender, birth_date, age, dept, position, hire_date, person_type, control_type, is_to_optimize, actual_insurance, has_injury, has_employer, compliance, expire_date, optimize_status, optimize_date, optimize_remark)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *
    `, [b.personnel_id || null, b.name || '', b.id_card || '', b.gender || '', b.birth_date || null, b.age || 0, b.dept || '', b.position || '', b.hire_date || null, b.person_type || '', b.control_type || '', b.is_to_optimize || false, b.actual_insurance || '', b.has_injury || false, b.has_employer || false, b.compliance || '', b.expire_date || null, b.optimize_status || '待处理', b.optimize_date || null, b.optimize_remark || '']);
    res.json(success(formatOverage(result.rows[0]), '创建成功'));
  } catch (err: any) { res.json(error(-1, err.message)); }
});

router.put('/overage/:id', async (req: Request, res: Response): Promise<any> => {
  try {
    if (!isConnected()) {
      const idx = memoryStores.overage.findIndex(r => r.id === parseInt(req.params.id) && !r.is_deleted);
      if (idx === -1) { res.json(error(-2, '记录不存在')); return; }
      Object.assign(memoryStores.overage[idx], req.body, { updated_at: new Date().toISOString() });
      res.json(success(memoryStores.overage[idx], '更新成功(内存模式)'));
      return;
    }
    const b = req.body;
    const result = await pool.query(`
      UPDATE over_age_personnel SET personnel_id=COALESCE($1,personnel_id), name=COALESCE($2,name),
        id_card=COALESCE($3,id_card), gender=COALESCE($4,gender), birth_date=COALESCE($5,birth_date),
        age=COALESCE($6,age), dept=COALESCE($7,dept), position=COALESCE($8,position),
        hire_date=COALESCE($9,hire_date), person_type=COALESCE($10,person_type),
        control_type=COALESCE($11,control_type), is_to_optimize=COALESCE($12,is_to_optimize),
        actual_insurance=COALESCE($13,actual_insurance), has_injury=COALESCE($14,has_injury),
        has_employer=COALESCE($15,has_employer), compliance=COALESCE($16,compliance),
        expire_date=COALESCE($17,expire_date), optimize_status=COALESCE($18,optimize_status),
        optimize_date=COALESCE($19,optimize_date), optimize_remark=COALESCE($20,optimize_remark),
        updated_at=CURRENT_TIMESTAMP
      WHERE id=$21 AND is_deleted=false RETURNING *
    `, [b.personnel_id, b.name, b.id_card, b.gender, b.birth_date, b.age, b.dept, b.position, b.hire_date, b.person_type, b.control_type, b.is_to_optimize, b.actual_insurance, b.has_injury, b.has_employer, b.compliance, b.expire_date, b.optimize_status, b.optimize_date, b.optimize_remark, req.params.id]);
    if (result.rows.length === 0) { res.json(error(-2, '记录不存在')); return; }
    res.json(success(formatOverage(result.rows[0]), '更新成功'));
  } catch (err: any) { res.json(error(-1, err.message)); }
});

router.delete('/overage/:id', async (req: Request, res: Response): Promise<any> => {
  try {
    if (!isConnected()) {
      const r = memoryStores.overage.find(r => r.id === parseInt(req.params.id) && !r.is_deleted);
      if (!r) { res.json(error(-2, '记录不存在')); return; }
      r.is_deleted = true;
      res.json(success(null, '删除成功(内存模式)'));
      return;
    }
    const result = await pool.query('UPDATE over_age_personnel SET is_deleted=true, updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND is_deleted=false RETURNING id', [req.params.id]);
    if (result.rows.length === 0) { res.json(error(-2, '记录不存在')); return; }
    res.json(success(null, '删除成功'));
  } catch (err: any) { res.json(error(-1, err.message)); }
});

export default router;
