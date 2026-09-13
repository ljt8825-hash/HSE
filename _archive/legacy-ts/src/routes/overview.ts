/**
 * 总览汇总路由 - 聚合各模块统计数据
 * DB 在线时从 PostgreSQL 查询，离线时返回空结构（前端回退到 MOCK 数据）
 * 文件: src/routes/overview.ts
 */

import { Router, Request, Response, NextFunction } from 'express';
import { pool, isConnected } from '../config/db';
import { success, error } from '../middleware/response';

const router = Router();

// GET /api/overview/summary — 全量汇总
router.get('/summary', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    if (!isConnected()) {
      res.json(success({
        hazard: { total: 0, fixed: 0 },
        training: { total: 0, completed: 0 },
        site_mgmt: { fire_equipment_total: 0, fire_equipment_abnormal: 0 },
        risk: {},
        accident: {},
        alerts: [],
        emergency: {}
      }, '查询成功(内存模式)'));
      return;
    }

    // 并行查询各模块统计
    const [hazardResult, trainingResult, fireResult, accidentResult] = await Promise.all([
      pool.query(`
        SELECT COUNT(*) AS total,
               COUNT(*) FILTER (WHERE status = '已完成') AS fixed
        FROM hazards WHERE is_deleted = false
      `),
      pool.query(`
        SELECT COUNT(*) AS total,
               COUNT(*) FILTER (WHERE result = '合格') AS completed
        FROM training_records WHERE is_deleted = false
      `),
      pool.query(`
        SELECT COUNT(*) AS total,
               COUNT(*) FILTER (WHERE status IS NOT NULL AND status != '完好' AND status != '正常') AS abnormal
        FROM "t_08_现场管理_消防器材管理台账_无照片"
      `).catch(() => ({ rows: [{ total: '0', abnormal: '0' }] })),
      pool.query(`
        SELECT COUNT(*) AS total,
               COUNT(*) FILTER (WHERE "处理状态" IS NOT NULL AND "处理状态" NOT IN ('已结案','已关闭','已完成')) AS unsettled
        FROM "t_05_事故管理_历史未完成案件"
      `).catch(() => ({ rows: [{ total: '0', unsettled: '0' }] }))
    ]);

    const hazard = hazardResult.rows[0];
    const training = trainingResult.rows[0];
    const fire = fireResult.rows[0];
    const accident = accidentResult.rows[0];

    // 生成预警列表
    const alerts: any[] = [];

    // 保险到期预警（从车辆表）
    try {
      const vehicleAlerts = await pool.query(`
        SELECT plate, model, owner, insurance_end,
               (insurance_end::date - CURRENT_DATE) AS days_left
        FROM vehicles
        WHERE is_deleted = false
          AND insurance_end IS NOT NULL
          AND (insurance_end::date - CURRENT_DATE) <= 30
        ORDER BY insurance_end ASC
        LIMIT 10
      `);
      vehicleAlerts.rows.forEach((r: any) => {
        alerts.push({
          type: '保险到期',
          level: r.days_left < 0 ? 'danger' : 'warning',
          owner: r.owner || r.plate,
          detail: `${r.plate} ${r.model}`,
          days_left: r.days_left,
          overdue: r.days_left < 0
        });
      });
    } catch (e) { /* vehicles 表可能不存在 */ }

    // 隐患超期预警
    try {
      const hazardAlerts = await pool.query(`
        SELECT no, description, responsible_dept, deadline,
               (deadline::date - CURRENT_DATE) AS days_left
        FROM hazards
        WHERE is_deleted = false
          AND status != '已完成'
          AND deadline IS NOT NULL
          AND (deadline::date - CURRENT_DATE) <= 7
        ORDER BY deadline ASC
        LIMIT 10
      `);
      hazardAlerts.rows.forEach((r: any) => {
        alerts.push({
          type: '隐患超期',
          level: r.days_left < 0 ? 'danger' : 'warning',
          owner: r.responsible_dept || '未指定',
          detail: `#${r.no} ${r.description ? r.description.substring(0, 30) : ''}`,
          days_left: r.days_left,
          overdue: r.days_left < 0
        });
      });
    } catch (e) { /* hazards 表可能不存在 */ }

    res.json(success({
      hazard: {
        total: parseInt(hazard.total) || 0,
        fixed: parseInt(hazard.fixed) || 0
      },
      training: {
        total: parseInt(training.total) || 0,
        completed: parseInt(training.completed) || 0
      },
      site_mgmt: {
        fire_equipment_total: parseInt(fire.total) || 0,
        fire_equipment_abnormal: parseInt(fire.abnormal) || 0
      },
      risk: {},
      accident: {
        total: parseInt(accident.total) || 0,
        unsettled: parseInt(accident.unsettled) || 0
      },
      alerts,
      emergency: {}
    }, '查询成功'));
  } catch (err) {
    next(err);
  }
});

// GET /api/overview/stats/:module — 单模块统计（兼容前端多接口调用）
router.get('/stats/:module', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const { module } = req.params;
    // 统一走 summary 接口，前端按需取子字段
    res.json(success({ module, note: '请使用 /api/overview/summary 获取全量数据' }, '查询成功'));
  } catch (err) {
    next(err);
  }
});

// GET /api/overview/alerts?limit=10 — 最近预警列表（前端 Dashboard 调用）
// 直接复用 summary 的 alerts 字段，避免重复实现
router.get('/alerts', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit ?? '10'), 10) || 10));
    // summary 已包含 alerts 数组，复用之；DB 不通时返回空数组
    let alerts: any[] = [];
    if (isConnected()) {
      try {
        const r = await pool.query("SELECT id, title, level, created_at AS time FROM alerts ORDER BY created_at DESC LIMIT $1", [limit]);
        alerts = r.rows.map((row: any) => ({
          id: row.id,
          title: row.title,
          level: row.level,
          time: row.time,
        }));
      } catch {
        /* alerts 表可能不存在，回退到 summary 的字段 */
      }
    }
    res.json(success(alerts, '查询成功'));
  } catch (err) {
    next(err);
  }
});

export default router;
