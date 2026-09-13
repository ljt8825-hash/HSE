/**
 * 培训管理路由 - PostgreSQL + 内存降级双模式
 * 文件: src/routes/training.ts
 * 支持 /records, /taihang, /new-employees, /stats 四个端点
 */

import { Router, Request, Response, NextFunction } from 'express';
import { pool, isConnected } from '../config/db';
import { success, error } from '../middleware/response';

const router = Router();

// ========== 内存降级存储 ==========
const memoryStores: {
  records: any[];
  taihang: any[];
  newEmployees: any[];
} = {
  records: [],
  taihang: [],
  newEmployees: []
};
const memoryIdCounters = { records: 1, taihang: 1, newEmployees: 1 };

function initMemoryData() {
  // 内存模式种子数据为空，前端有完整 MOCK 数据
}

// ========== 辅助：从 training_records 表查询并转换为前端格式 ==========
async function queryTrainingRecords(reqQuery: any, extraWhere = '', extraParams: any[] = []) {
  const { page = 1, pageSize = 20, keyword = '', month = '', township = '' } = reqQuery;

  let whereSql = ' WHERE is_deleted = false' + extraWhere;
  const params = [...extraParams];
  let paramIdx = params.length;

  if (keyword) {
    paramIdx++;
    whereSql += ` AND (name ILIKE $${paramIdx} OR dept ILIKE $${paramIdx} OR content ILIKE $${paramIdx})`;
    params.push(`%${keyword}%`);
  }
  if (month) {
    paramIdx++;
    whereSql += ` AND TO_CHAR(training_date, 'YYYY-MM') = $${paramIdx}`;
    params.push(month);
  }
  if (township) {
    paramIdx++;
    whereSql += ` AND dept ILIKE $${paramIdx}`;
    params.push(`%${township}%`);
  }

  const countResult = await pool.query(`SELECT COUNT(*) as total FROM training_records ${whereSql}`, params);
  const total = parseInt(countResult.rows[0].total);

  const offset = (page - 1) * pageSize;
  paramIdx++;
  params.push(parseInt(pageSize));
  paramIdx++;
  params.push(offset);

  const listResult = await pool.query(`
    SELECT id, personnel_id, name, id_card, dept, position, grid_level,
           frequency, training_type, training_date, duration_minutes,
           content, result, score, trainer, remark, created_at, updated_at
    FROM training_records
    ${whereSql}
    ORDER BY id DESC
    LIMIT $${paramIdx - 1} OFFSET $${paramIdx}
  `, params);

  return { list: listResult.rows, total, page: parseInt(page), pageSize: parseInt(pageSize) };
}

// ========== GET /records — 培训记录列表 ==========
router.get('/records', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    if (!isConnected()) {
      initMemoryData();
      let data = memoryStores.records;
      const { page = 1, pageSize = 20, keyword = '' } = req.query as any;
      if (keyword) {
        const kw = keyword.toLowerCase();
        data = data.filter(r =>
          (r.name && r.name.toLowerCase().includes(kw)) ||
          (r.dept && r.dept.toLowerCase().includes(kw))
        );
      }
      const total = data.length;
      const offset = (page - 1) * pageSize;
      const list = data.slice(offset, offset + parseInt(pageSize));
      res.json(success({ list, total, page: parseInt(page), pageSize: parseInt(pageSize) }, '查询成功(内存模式)'));
      return;
    }

    const result = await queryTrainingRecords(req.query as any);
    res.json(success(result, '查询成功'));
  } catch (err: any) {
    next(err);
  }
});

// ========== GET /taihang — 太行培训记录 ==========
router.get('/taihang', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    if (!isConnected()) {
      initMemoryData();
      const data = memoryStores.taihang;
      res.json(success({ list: data, total: data.length, page: 1, pageSize: 20 }, '查询成功(内存模式)'));
      return;
    }

    // 太行培训：从 training_records 中筛选 training_type = '太行' 的记录
    const result = await queryTrainingRecords(req.query as any, " AND training_type = $1", ['太行']);
    res.json(success(result, '查询成功'));
  } catch (err: any) {
    next(err);
  }
});

// ========== GET /new-employees — 新员工培训记录 ==========
router.get('/new-employees', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    if (!isConnected()) {
      initMemoryData();
      const data = memoryStores.newEmployees;
      res.json(success({ list: data, total: data.length, page: 1, pageSize: 20 }, '查询成功(内存模式)'));
      return;
    }

    // 新员工培训：从 training_records 中筛选 training_type = '新员工' 的记录
    const result = await queryTrainingRecords(req.query as any, " AND training_type = $1", ['新员工']);
    res.json(success(result, '查询成功'));
  } catch (err: any) {
    next(err);
  }
});

// ========== GET /stats — 培训统计 ==========
router.get('/stats', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    if (!isConnected()) {
      initMemoryData();
      res.json(success({
        total: memoryStores.records.length,
        passed: 0,
        failed: 0,
        byMonth: {},
        byType: {}
      }, '统计成功(内存模式)'));
      return;
    }

    const [totalResult, resultResult, typeResult] = await Promise.all([
      pool.query('SELECT COUNT(*) AS total FROM training_records WHERE is_deleted = false'),
      pool.query(`SELECT result, COUNT(*) AS count FROM training_records WHERE is_deleted = false GROUP BY result`),
      pool.query(`SELECT training_type, COUNT(*) AS count FROM training_records WHERE is_deleted = false GROUP BY training_type`)
    ]);

    const byResult: Record<string, number> = {};
    resultResult.rows.forEach((r: any) => { byResult[r.result] = parseInt(r.count); });

    const byType: Record<string, number> = {};
    typeResult.rows.forEach((r: any) => { byType[r.training_type] = parseInt(r.count); });

    res.json(success({
      total: parseInt(totalResult.rows[0].total),
      passed: byResult['合格'] || 0,
      failed: byResult['不合格'] || 0,
      absent: byResult['缺勤'] || 0,
      byType
    }, '统计成功'));
  } catch (err: any) {
    next(err);
  }
});

// ========== POST /records — 创建培训记录 ==========
router.post('/records', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    if (!isConnected()) {
      initMemoryData();
      const record = { id: memoryIdCounters.records++, ...req.body, is_deleted: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      memoryStores.records.push(record);
      res.json(success(record, '创建成功(内存模式)'));
      return;
    }

    const { name, personnel_id, id_card, dept, position, grid_level, frequency, training_type, training_date, duration_minutes, content, result, score, trainer, remark } = req.body;
    if (!name) { res.json(error(-1, '参训人姓名不能为空')); return; }

    const insertResult = await pool.query(`
      INSERT INTO training_records (personnel_id, name, id_card, dept, position, grid_level, frequency, training_type, training_date, duration_minutes, content, result, score, trainer, remark)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      RETURNING *
    `, [personnel_id || null, name.trim(), id_card || '', dept || '', position || '', grid_level || '', frequency || '', training_type || 'HSE', training_date || null, duration_minutes || 0, content || '', result || '合格', score || null, trainer || '', remark || '']);

    res.json(success(insertResult.rows[0], '创建成功'));
  } catch (err: any) {
    next(err);
  }
});

// ========== PUT /records/:id — 更新培训记录 ==========
router.put('/records/:id', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    if (!isConnected()) {
      initMemoryData();
      const { id } = req.params;
      const idx = memoryStores.records.findIndex(r => r.id === parseInt(id) && !r.is_deleted);
      if (idx === -1) { res.json(error(-2, '记录不存在')); return; }
      Object.assign(memoryStores.records[idx], req.body, { updated_at: new Date().toISOString() });
      res.json(success(memoryStores.records[idx], '更新成功(内存模式)'));
      return;
    }

    const { id } = req.params;
    const { name, personnel_id, id_card, dept, position, grid_level, frequency, training_type, training_date, duration_minutes, content, result, score, trainer, remark } = req.body;
    const updateResult = await pool.query(`
      UPDATE training_records SET
        name = COALESCE($1, name), personnel_id = COALESCE($2, personnel_id),
        id_card = COALESCE($3, id_card), dept = COALESCE($4, dept),
        position = COALESCE($5, position), grid_level = COALESCE($6, grid_level),
        frequency = COALESCE($7, frequency), training_type = COALESCE($8, training_type),
        training_date = COALESCE($9, training_date), duration_minutes = COALESCE($10, duration_minutes),
        content = COALESCE($11, content), result = COALESCE($12, result),
        score = COALESCE($13, score), trainer = COALESCE($14, trainer),
        remark = COALESCE($15, remark), updated_at = CURRENT_TIMESTAMP
      WHERE id = $16 AND is_deleted = false
      RETURNING *
    `, [name, personnel_id, id_card, dept, position, grid_level, frequency, training_type, training_date, duration_minutes, content, result, score, trainer, remark, id]);

    if (updateResult.rows.length === 0) { res.json(error(-2, '记录不存在')); return; }
    res.json(success(updateResult.rows[0], '更新成功'));
  } catch (err: any) {
    next(err);
  }
});

// ========== DELETE /records/:id — 软删除 ==========
router.delete('/records/:id', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    if (!isConnected()) {
      initMemoryData();
      const { id } = req.params;
      const record = memoryStores.records.find(r => r.id === parseInt(id) && !r.is_deleted);
      if (!record) { res.json(error(-2, '记录不存在')); return; }
      record.is_deleted = true;
      res.json(success(null, '删除成功(内存模式)'));
      return;
    }

    const { id } = req.params;
    const result = await pool.query(
      'UPDATE training_records SET is_deleted = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND is_deleted = false RETURNING id',
      [id]
    );
    if (result.rows.length === 0) { res.json(error(-2, '记录不存在')); return; }
    res.json(success(null, '删除成功'));
  } catch (err: any) {
    next(err);
  }
});

// ========== POST /taihang — 创建太行培训记录 ==========
router.post('/taihang', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    if (!isConnected()) {
      initMemoryData();
      const record = { id: memoryIdCounters.taihang++, ...req.body, training_type: '太行', is_deleted: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      memoryStores.taihang.push(record);
      res.json(success(record, '创建成功(内存模式)'));
      return;
    }

    const body = { ...req.body, training_type: '太行' };
    const insertResult = await pool.query(`
      INSERT INTO training_records (personnel_id, name, id_card, dept, position, grid_level, frequency, training_type, training_date, duration_minutes, content, result, score, trainer, remark)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      RETURNING *
    `, [body.personnel_id || null, (body.name || '').trim(), body.id_card || '', body.dept || '', body.position || '', body.grid_level || '', body.frequency || '', '太行', body.training_date || null, body.duration_minutes || 0, body.content || '', body.result || '合格', body.score || null, body.trainer || '', body.remark || '']);

    res.json(success(insertResult.rows[0], '创建成功'));
  } catch (err: any) {
    next(err);
  }
});

// ========== POST /new-employees — 创建新员工培训记录 ==========
router.post('/new-employees', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    if (!isConnected()) {
      initMemoryData();
      const record = { id: memoryIdCounters.newEmployees++, ...req.body, training_type: '新员工', is_deleted: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      memoryStores.newEmployees.push(record);
      res.json(success(record, '创建成功(内存模式)'));
      return;
    }

    const body = { ...req.body, training_type: '新员工' };
    const insertResult = await pool.query(`
      INSERT INTO training_records (personnel_id, name, id_card, dept, position, grid_level, frequency, training_type, training_date, duration_minutes, content, result, score, trainer, remark)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      RETURNING *
    `, [body.personnel_id || null, (body.name || '').trim(), body.id_card || '', body.dept || '', body.position || '', body.grid_level || '', body.frequency || '', '新员工', body.training_date || null, body.duration_minutes || 0, body.content || '', body.result || '合格', body.score || null, body.trainer || '', body.remark || '']);

    res.json(success(insertResult.rows[0], '创建成功'));
  } catch (err: any) {
    next(err);
  }
});

export default router;
