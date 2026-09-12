/**
 * 考核方案配置路由（待办事项 > 考核计划）
 * GET    /api/hse/todos/plans            - 方案列表（含 items 与模块 meta），支持 ?moduleCode=
 * POST   /api/hse/todos/plans            - 新建方案（保存为草稿，校验权重总和=100）
 * PUT    /api/hse/todos/plans/:id        - 更新草稿方案
 * POST   /api/hse/todos/plans/:id/activate - 切换生效（同模块旧 active 自动归档 expired）
 * DELETE /api/hse/todos/plans/:id        - 删除草稿方案
 * 权限：admin / safety_manager（安环科统一配置）
 */
const express = require('express');
const router = express.Router();
const { success, error } = require('../middleware/response');
const { pool, isConnected } = require('../config/db');
const { requireRole } = require('../middleware/auth');

// 模块清单（与前端 Segmented 一致；后续可抽配置表）
const MODULES = [
  { code: 'risk-control', name: '风险管控' },
  { code: 'hazards', name: '隐患排查' },
  { code: 'emergency', name: '应急管理' },
  { code: 'training', name: '培训管理' },
  { code: 'insurance', name: '保险管理' },
  { code: 'objectives', name: '目标职责' },
  { code: 'grid', name: '网格管理' },
  { code: 'violations', name: '三违管理' },
];

const FREQ_ALLOW = ['half-month', 'month', 'quarter'];

const PLAN_SELECT = `
  SELECT p.id, p.module_code, p.version_no, p.name,
         to_char(p.period_start, 'YYYY-MM-DD') AS period_start,
         to_char(p.period_end, 'YYYY-MM-DD') AS period_end,
         p.freq_type, p.stat_day, p.status,
         to_char(p.updated_at, 'YYYY-MM-DD HH24:MI:SS') AS updated_at
  FROM hse_assessment_plan p`;

function rowToPlan(row, items) {
  return {
    id: row.id,
    moduleCode: row.module_code,
    versionNo: row.version_no,
    name: row.name,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    freqType: row.freq_type,
    statDay: row.stat_day,
    status: row.status,
    updatedAt: row.updated_at,
    items: (items || []).map((i) => ({ id: i.id, itemName: i.item_name, weight: Number(i.weight) })),
  };
}

async function getPlanWithItems(planId) {
  const p = await pool.query(`${PLAN_SELECT} WHERE p.id = $1`, [planId]);
  if (!p.rows.length) return null;
  const it = await pool.query(
    `SELECT id, item_name, weight FROM hse_assessment_plan_item WHERE plan_id = $1 ORDER BY sort_order`,
    [planId],
  );
  return rowToPlan(p.rows[0], it.rows);
}

function validatePayload(body) {
  const b = body || {};
  const moduleCode = String(b.moduleCode || '').trim();
  if (!MODULES.some((m) => m.code === moduleCode)) return { ok: false, msg: '无效的模块编码' };
  const name = String(b.name || '').trim();
  if (!name) return { ok: false, msg: '方案名称不能为空' };
  const periodStart = String(b.periodStart || '');
  const periodEnd = String(b.periodEnd || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) {
    return { ok: false, msg: '生效周期格式错误（YYYY-MM-DD）' };
  }
  if (periodStart > periodEnd) return { ok: false, msg: '开始日期不能晚于结束日期' };
  const freqType = String(b.freqType || '');
  if (!FREQ_ALLOW.includes(freqType)) return { ok: false, msg: '无效的统计频率' };
  const statDay = String(b.statDay || '').trim();
  if (!statDay) return { ok: false, msg: '统计日不能为空' };
  const items = Array.isArray(b.items) ? b.items : [];
  const clean = [];
  for (const it of items) {
    const itemName = String(it?.itemName || '').trim();
    const weight = Number(it?.weight);
    if (!itemName || !(weight > 0) || weight > 100) return { ok: false, msg: '考核项名称或权重不合法' };
    clean.push({ itemName, weight });
  }
  if (!clean.length) return { ok: false, msg: '请至少添加一项考核指标' };
  const total = clean.reduce((s, i) => s + i.weight, 0);
  if (Math.abs(total - 100) > 0.05) {
    return { ok: false, msg: `考核项权重总和须等于 100%（当前 ${total}%）` };
  }
  return {
    ok: true,
    data: {
      moduleCode,
      name,
      periodStart,
      periodEnd,
      freqType,
      statDay,
      items: clean,
      versionNo: periodStart.slice(0, 7),
    },
  };
}

// ============================================================
// GET / - 方案列表（含 items 与模块 meta）
// ============================================================
router.get('/', async (req, res) => {
  try {
    if (!isConnected()) {
      return res.json(success({ list: [], meta: { modules: MODULES } }, '查询成功(内存模式)'));
    }
    const { moduleCode } = req.query;
    let sql = `${PLAN_SELECT} WHERE 1=1`;
    const params = [];
    if (moduleCode) {
      params.push(moduleCode);
      sql += ` AND p.module_code = $${params.length}`;
    }
    sql += ' ORDER BY p.module_code, p.period_start DESC';
    const planRes = await pool.query(sql, params);
    const ids = planRes.rows.map((r) => r.id);
    const byPlan = {};
    if (ids.length) {
      const itRes = await pool.query(
        `SELECT id, plan_id, item_name, weight FROM hse_assessment_plan_item WHERE plan_id = ANY($1) ORDER BY plan_id, sort_order`,
        [ids],
      );
      for (const it of itRes.rows) {
        (byPlan[it.plan_id] = byPlan[it.plan_id] || []).push(it);
      }
    }
    const list = planRes.rows.map((r) => rowToPlan(r, byPlan[r.id] || []));
    res.json(success({ list, meta: { modules: MODULES } }, '查询成功'));
  } catch (e) {
    console.error('[todo-plans] GET / 异常:', e.message);
    res.json(error(-1, e.message));
  }
});

// ============================================================
// GET /nodes - 按各模块生效方案推算下一个统计节点（供"我的待办"消费）
// ============================================================
function calcNextNode(freqType, today) {
  const y = today.getFullYear();
  const m = today.getMonth();
  if (freqType === 'half-month') {
    const candidates = [new Date(y, m, 1), new Date(y, m, 16), new Date(y, m + 1, 1)];
    return candidates.find((c) => c.getTime() >= today.getTime()) || new Date(y, m + 1, 16);
  }
  if (freqType === 'month') {
    return new Date(y, m + 1, 0); // 本月最后一天
  }
  return new Date(y, (Math.floor(m / 3) + 1) * 3, 0); // 本季度末
}

function nodeLabel(freqType, nodeDate) {
  const md = `${nodeDate.getMonth() + 1}月${nodeDate.getDate()}日`;
  if (freqType === 'half-month') return `${md}统计`;
  if (freqType === 'month') return `${nodeDate.getMonth() + 1}月末统计`;
  return `Q${Math.floor(nodeDate.getMonth() / 3) + 1}末统计`;
}

function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

router.get('/nodes', async (req, res) => {
  try {
    if (!isConnected()) {
      return res.json(success({ list: [], summary: { total: 0, due: 0 } }, '查询成功(内存模式)'));
    }
    const r = await pool.query(
      `SELECT id, module_code, name, freq_type, stat_day FROM hse_assessment_plan WHERE status = 'active' ORDER BY module_code`,
    );
    const today = new Date();
    const list = r.rows.map((row) => {
      const nodeDate = calcNextNode(row.freq_type, today);
      const daysLeft = Math.ceil((nodeDate.getTime() - today.getTime()) / 86400000);
      const moduleName = (MODULES.find((m) => m.code === row.module_code) || {}).name || row.module_code;
      return {
        planId: row.id,
        moduleCode: row.module_code,
        moduleName,
        planName: row.name,
        freqType: row.freq_type,
        statDay: row.stat_day,
        nodeDate: fmtDate(nodeDate),
        dueLabel: nodeLabel(row.freq_type, nodeDate),
        daysLeft,
        status: daysLeft <= 3 ? 'due' : 'pending',
      };
    });
    const due = list.filter((n) => n.status === 'due').length;
    res.json(success({ list, summary: { total: list.length, due } }, '查询成功'));
  } catch (e) {
    console.error('[todo-plans] GET /nodes 异常:', e.message);
    res.json(error(-1, e.message));
  }
});

// ============================================================
// POST / - 新建方案（始终保存为草稿）
// ============================================================
router.post('/', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const v = validatePayload(req.body);
    if (!v.ok) return res.json(error(-1, v.msg));
    const d = v.data;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const ins = await client.query(
        `INSERT INTO hse_assessment_plan
           (module_code, version_no, name, period_start, period_end, freq_type, stat_day, status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', $8) RETURNING id`,
        [d.moduleCode, d.versionNo, d.name, d.periodStart, d.periodEnd, d.freqType, d.statDay, req.user?.id ?? null],
      );
      const planId = ins.rows[0].id;
      for (let i = 0; i < d.items.length; i++) {
        await client.query(
          `INSERT INTO hse_assessment_plan_item (plan_id, item_name, weight, sort_order) VALUES ($1, $2, $3, $4)`,
          [planId, d.items[i].itemName, d.items[i].weight, i + 1],
        );
      }
      await client.query('COMMIT');
      res.json(success(await getPlanWithItems(planId), '方案已保存为草稿'));
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    console.error('[todo-plans] POST / 异常:', e.message);
    res.json(error(-1, e.message));
  }
});

// ============================================================
// PUT /:id - 更新草稿方案（生效/已过期方案禁止直接改）
// ============================================================
router.put('/:id', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.json(error(-1, '非法方案 ID'));
    const cur = await pool.query('SELECT status FROM hse_assessment_plan WHERE id = $1', [id]);
    if (!cur.rows.length) return res.json(error(-1, '方案不存在'));
    if (cur.rows[0].status !== 'draft') {
      return res.json(error(-1, '仅草稿方案可编辑；生效中方案请通过「编辑生成新版本」'));
    }
    const v = validatePayload(req.body);
    if (!v.ok) return res.json(error(-1, v.msg));
    const d = v.data;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE hse_assessment_plan
         SET version_no = $1, name = $2, period_start = $3, period_end = $4,
             freq_type = $5, stat_day = $6, updated_at = NOW()
         WHERE id = $7`,
        [d.versionNo, d.name, d.periodStart, d.periodEnd, d.freqType, d.statDay, id],
      );
      await client.query('DELETE FROM hse_assessment_plan_item WHERE plan_id = $1', [id]);
      for (let i = 0; i < d.items.length; i++) {
        await client.query(
          `INSERT INTO hse_assessment_plan_item (plan_id, item_name, weight, sort_order) VALUES ($1, $2, $3, $4)`,
          [id, d.items[i].itemName, d.items[i].weight, i + 1],
        );
      }
      await client.query('COMMIT');
      res.json(success(await getPlanWithItems(id), '草稿方案已更新'));
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    console.error('[todo-plans] PUT /:id 异常:', e.message);
    res.json(error(-1, e.message));
  }
});

// ============================================================
// POST /:id/activate - 切换生效（事务内归档同模块旧 active）
// ============================================================
router.post('/:id/activate', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.json(error(-1, '非法方案 ID'));
    const cur = await pool.query(
      'SELECT id, module_code, status, name FROM hse_assessment_plan WHERE id = $1',
      [id],
    );
    if (!cur.rows.length) return res.json(error(-1, '方案不存在'));
    const p = cur.rows[0];
    if (p.status === 'active') return res.json(error(-1, '该方案已是生效状态'));
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE hse_assessment_plan SET status = 'expired', updated_at = NOW()
         WHERE module_code = $1 AND status = 'active'`,
        [p.module_code],
      );
      await client.query(
        `UPDATE hse_assessment_plan SET status = 'active', updated_at = NOW() WHERE id = $1`,
        [id],
      );
      await client.query('COMMIT');
      res.json(success({ id }, `「${p.name}」已切换生效`));
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    console.error('[todo-plans] activate 异常:', e.message);
    res.json(error(-1, e.message));
  }
});

// ============================================================
// DELETE /:id - 删除草稿方案（级联删考核项）
// ============================================================
router.delete('/:id', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.json(error(-1, '非法方案 ID'));
    const cur = await pool.query('SELECT status FROM hse_assessment_plan WHERE id = $1', [id]);
    if (!cur.rows.length) return res.json(error(-1, '方案不存在'));
    if (cur.rows[0].status !== 'draft') return res.json(error(-1, '仅草稿方案可删除'));
    await pool.query('DELETE FROM hse_assessment_plan WHERE id = $1', [id]);
    res.json(success(null, '草稿方案已删除'));
  } catch (e) {
    console.error('[todo-plans] DELETE /:id 异常:', e.message);
    res.json(error(-1, e.message));
  }
});

module.exports = router;
