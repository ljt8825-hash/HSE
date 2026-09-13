/**
 * 告警管理路由 - PostgreSQL + 内存降级双模式
 * 端点: GET / GET /stats GET /:id PUT /:id/resolve PUT /batch-resolve GET /export
 * 对应前端: api/hse/alerts.ts → store/alerts.ts
 */

import { Router, Request, Response } from 'express';
import { pool, isConnected } from '../config/db';
import { success, error } from '../middleware/response';

const router = Router();

// ========== 内存降级存储 ==========
let memoryRecords: any[] = [];
let memoryIdCounter = 1;
let pgTableChecked = false;
let pgTableExists = false;

async function usePg(): Promise<boolean> {
  if (!isConnected()) return false;
  if (!pgTableChecked) {
    try {
      await pool.query("SELECT 1 FROM alerts LIMIT 0");
      pgTableExists = true;
    } catch { pgTableExists = false; }
    pgTableChecked = true;
  }
  return pgTableExists;
}

function initMemoryData(): void {
  if (memoryRecords.length > 0) return;
  const levels: string[] = ['critical', 'high', 'medium', 'low', 'info'];
  const statuses: string[] = ['new', 'processing', 'resolved'];
  const titles = [
    '消防器材压力不足', '作业人员未佩戴安全帽', '车辆刹车系统异常',
    '转运站异味超标', '用电线路老化', '高空作业未系安全带',
    '有限空间作业未通风', '道路作业警示标志缺失',
  ];
  const locations = ['宁津县城区', '开发区转运站', '柴胡店镇', '时集镇'];
  for (let i = 0; i < 50; i++) {
    memoryRecords.push({
      id: ++memoryIdCounter,
      title: titles[i % titles.length],
      description: '这是一条模拟告警数据，用于演示告警中心功能。',
      level: levels[i % levels.length],
      status: statuses[i % statuses.length],
      source: '系统自动检测',
      sourceId: String(100 + i),
      location: locations[i % locations.length],
      occurredAt: new Date(Date.now() - i * 3600000 * 2).toISOString(),
      resolvedAt: statuses[i % statuses.length] === 'resolved'
        ? new Date(Date.now() - i * 3600000).toISOString()
        : undefined,
      handler: i % 3 === 0 ? '张三' : undefined,
      remark: '',
      is_deleted: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }
}

// ========== GET / — 列表 ==========
router.get('/', async (req: Request, res: Response): Promise<any> => {
  try {
    if (!(await usePg())) {
      initMemoryData();
      let data = memoryRecords.filter((r) => !r.is_deleted);
      const { page = 1, pageSize = 10, keyword, level, status } = req.query as any;
      if (keyword) { const kw = String(keyword).toLowerCase(); data = data.filter(r => (r.title && r.title.toLowerCase().includes(kw)) || (r.location && r.location.toLowerCase().includes(kw))); }
      if (level) data = data.filter((r) => r.level === level);
      if (status) data = data.filter((r) => r.status === status);
      const total = data.length;
      const offset = (Number(page) - 1) * Number(pageSize);
      return res.json(success({ list: data.slice(offset, offset + Number(pageSize)), total }, '查询成功(内存模式)'));
    }

    let whereSql = ' WHERE is_deleted = false';
    const params: any[] = [];
    let paramIdx = 0;
    const { page = 1, pageSize = 10, keyword, level, status } = req.query as any;

    if (keyword) { paramIdx++; whereSql += ` AND (title ILIKE $${paramIdx} OR location ILIKE $${paramIdx})`; params.push(`%{keyword}%`); }
    if (level) { paramIdx++; whereSql += ` AND level = $${paramIdx}`; params.push(level); }
    if (status) { paramIdx++; whereSql += ` AND status = $${paramIdx}`; params.push(status); }

    const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM alerts${whereSql}`, params);
    const total = countResult.rows[0].total;
    const offset = (Number(page) - 1) * Number(pageSize);
    paramIdx++; params.push(Number(pageSize));
    paramIdx++; params.push(offset);

    const result = await pool.query(
      `SELECT * FROM alerts${whereSql} ORDER BY occurred_at DESC, id DESC LIMIT $${paramIdx - 1} OFFSET $${paramIdx}`,
      params
    );
    res.json(success({ list: result.rows.map(formatRow), total }, '查询成功'));
  } catch (err: any) {
    res.json(error(-1, err.message));
  }
});

// ========== GET /stats — 统计 ==========
router.get('/stats', async (req: Request, res: Response): Promise<any> => {
  try {
    if (!(await usePg())) {
      initMemoryData();
      const data = memoryRecords.filter((r) => !r.is_deleted);
      return res.json(success({
        total: data.length,
        critical: data.filter((r) => r.level === 'critical').length,
        high: data.filter((r) => r.level === 'high').length,
        medium: data.filter((r) => r.level === 'medium').length,
        low: data.filter((r) => r.level === 'low').length,
        newCount: data.filter((r) => r.status === 'new').length,
        processingCount: data.filter((r) => r.status === 'processing').length,
        resolvedCount: data.filter((r) => r.status === 'resolved').length,
      }, '统计成功(内存模式)'));
    }

    const [totalR, levelR, statusR] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS total FROM alerts WHERE is_deleted = false'),
      pool.query("SELECT level, COUNT(*)::int AS count FROM alerts WHERE is_deleted = false GROUP BY level"),
      pool.query("SELECT status, COUNT(*)::int AS count FROM alerts WHERE is_deleted = false GROUP BY status"),
    ]);
    const byLevel: Record<string, number> = {};
    levelR.rows.forEach((r: any) => { byLevel[r.level || 'unknown'] = r.count; });
    const byStatus: Record<string, number> = {};
    statusR.rows.forEach((r: any) => { byStatus[r.status || 'unknown'] = r.count; });

    res.json(success({
      total: totalR.rows[0].total,
      critical: byLevel['critical'] || 0,
      high: byLevel['high'] || 0,
      medium: byLevel['medium'] || 0,
      low: byLevel['low'] || 0,
      newCount: byStatus['new'] || 0,
      processingCount: byStatus['processing'] || 0,
      resolvedCount: byStatus['resolved'] || 0,
    }, '统计成功'));
  } catch (err: any) {
    res.json(error(-1, err.message));
  }
});

// ========== GET /:id — 单条 ==========
router.get('/:id', async (req: Request, res: Response): Promise<any> => {
  try {
    if (!(await usePg())) {
      initMemoryData();
      const record = memoryRecords.find((r) => r.id === Number(req.params.id) && !r.is_deleted);
      if (!record) return res.json(error(-2, '记录不存在'));
      return res.json(success(record, '查询成功'));
    }
    const result = await pool.query('SELECT * FROM alerts WHERE id = $1 AND is_deleted = false', [req.params.id]);
    if (result.rows.length === 0) return res.json(error(-2, '记录不存在'));
    res.json(success(formatRow(result.rows[0]), '查询成功'));
  } catch (err: any) {
    res.json(error(-1, err.message));
  }
});

// ========== PUT /:id/resolve — 处理告警 ==========
router.put('/:id/resolve', async (req: Request, res: Response): Promise<any> => {
  try {
    const { remark, handler } = req.body as any;
    if (!(await usePg())) {
      initMemoryData();
      const record = memoryRecords.find((r) => r.id === Number(req.params.id) && !r.is_deleted);
      if (!record) return res.json(error(-2, '记录不存在'));
      record.status = 'resolved'; record.handler = handler || record.handler;
      record.remark = remark || ''; record.resolvedAt = new Date().toISOString();
      return res.json(success(record, '处理成功(内存模式)'));
    }
    const result = await pool.query(
      "UPDATE alerts SET status='resolved', handler=COALESCE($2,handler), remark=COALESCE($3,remark), resolved_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND is_deleted=false RETURNING *",
      [req.params.id, handler, remark]
    );
    if (result.rows.length === 0) return res.json(error(-2, '记录不存在'));
    res.json(success(formatRow(result.rows[0]), '处理成功'));
  } catch (err: any) {
    res.json(error(-1, err.message));
  }
});

// ========== PUT /batch-resolve — 批量处理 ==========
router.put('/batch-resolve', async (req: Request, res: Response): Promise<any> => {
  try {
    const { ids, remark, handler }: { ids: number[]; remark?: string; handler?: string } = req.body;
    if (!ids || !Array.isArray(ids)) return res.json(error(-3, '参数错误: ids 必须为数组'));

    if (!(await usePg())) {
      initMemoryData();
      const records = memoryRecords.filter((r) => ids.includes(r.id) && !r.is_deleted);
      records.forEach((r) => { r.status = 'resolved'; r.handler = handler || r.handler; r.remark = remark || ''; r.resolvedAt = new Date().toISOString(); });
      return res.json(success({ updated: records.length }, `批量处理成功(${records.length}条)`));
    }

    const result = await pool.query(
      "UPDATE alerts SET status='resolved', handler=COALESCE($2,handler), remark=COALESCE($3,remark), resolved_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=ANY($1::int[]) AND is_deleted=false RETURNING id",
      [ids, handler, remark]
    );
    res.json(success({ updated: result.rowCount }, `批量处理成功(${result.rowCount}条)`));
  } catch (err: any) {
    res.json(error(-1, err.message));
  }
});

function formatRow(row: any) {
  return {
    id: row.id, title: row.title || '', description: row.description || '',
    level: row.level || 'info', status: row.status || 'new', source: row.source || '',
    sourceId: row.source_id || String(row.id),
    location: row.location || null,
    occurredAt: row.occurred_at ? new Date(row.occurred_at).toISOString() : undefined,
    resolvedAt: row.resolved_at ? new Date(row.resolved_at).toISOString() : undefined,
    handler: row.handler || undefined, remark: row.remark || undefined,
  };
}

export default router;
