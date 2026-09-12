/**
 * 安全文化建设「专项活动台帐」导入（乡镇作业中心经理版）
 *   POST /api/hse/safety-culture/import
 *   json: year(年) + month(月)
 *
 * 导入核心逻辑集中在 services/safetyCultureImport.js（本路由与批量回填共用）：
 *   - 扫描服务器目录 <根>/<YYYY>年/<M>月 下的「乡镇作业中心经理月度考核」Excel
 *   - 仅解析工作簿内名称为「专项活动台帐」（或「专项活动台账」）的工作表
 *   - 每月活动表头不同 → 动态识别活动列并存入 activities JSON
 *   - 姓名单元格为空或占位符（「/」「-」等）的行跳过（剔除「津城街道 /」这类无姓名行）
 *   - 全量覆盖：目标月份先软删旧行再插入有效行（事务）
 */
const express = require('express');
const { pool } = require('../config/db');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { runImport, normMonth2, matchEmployeeId, normalizeLevel } = require('../services/safetyCultureImport');

const router = express.Router();

router.post(
  '/import',
  authMiddleware,
  requireRole('admin', 'safety_manager'),
  async (req, res) => {
    const year = Number(req.body?.year);
    const month = Number(req.body?.month);
    if (!Number.isInteger(year) || year < 2020 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
      return res.status(400).json({ success: false, code: 400, message: '参数需为 year(年) 与 month(月)' });
    }
    try {
      const result = await runImport(normMonth2(year, month));
      return res.json({ success: true, code: 0, data: result });
    } catch (e) {
      const status = e.status || 500;
      console.error('[safety-culture/import]', e.message);
      return res.status(status).json({ success: false, code: status, message: e.message });
    }
  }
);

// ===================== 台账查询（成绩列表页） =====================
// GET /api/hse/safety-culture/list?month=YYYY-MM&page=1&page_size=20&level=&dept=&keyword=
// 返回当月安全文化建设台账 + 按工商逻辑计算的扣分（与 safetyCultureAdapter 口径一致）。
// 计算口径：manual_deduct>0 优先；否则未开展√项×单位分值；生效扣分被类别上限钳制。

async function getRuleUnitAndCap() {
  // 单位分值：规则 SAFE_AUTO / adapter_key=safety_culture 的 deduct_score，默认 10
  let unit = 10;
  try {
    const r = await pool.query(
      `SELECT deduct_score FROM hse_assessment_rule
        WHERE adapter_key = 'safety_culture' AND is_deleted = FALSE
        ORDER BY id DESC LIMIT 1`
    );
    if (r.rows.length && r.rows[0].deduct_score != null) {
      unit = Number(r.rows[0].deduct_score) || 10;
    }
  } catch { /* 规则表缺失时用默认 10 */ }
  // 类别上限：安全文化建设，按岗位分套（manager=乡镇作业中心经理 / admin=管理员，各自独立上限，默认 20）
  // 台账行 level='管理员' 走 admin 套，其余（乡镇主管等）走 manager 套，与评分引擎钳制口径一致。
  const readCap = async (role) => {
    try {
      const r = await pool.query(
        `SELECT max_deduct FROM hse_assessment_category_limit
          WHERE category = '安全文化建设' AND target_role = $1 ORDER BY id DESC LIMIT 1`,
        [role]
      );
      if (r.rows.length && r.rows[0].max_deduct != null) return Number(r.rows[0].max_deduct);
    } catch { /* 默认 20 */ }
    return 20;
  };
  const caps = { manager: await readCap('manager'), admin: await readCap('admin') };
  return { unit, caps };
}

// 旧三列的展示名（仅用于 activities 为空时的回退）
const LEGACY_ACTIVITY_LABELS = [
  { label: '"三违"专项活动', col: 'act_three_violation' },
  { label: '轮值安全员', col: 'act_duty_safety' },
  { label: '交通安全危险因素识别清单', col: 'act_traffic_risk' },
];

// 组装某行的动态活动项数组 [{ name, done, group }]；activities 为空时回退旧三列
// 优先 activity_groups（有序数组，保留 Excel 列序 + 分组，用于前端渲染合并表头）；
// 旧行无该列值时回退 activities（jsonb 键序，无分组）。
function buildActivities(r) {
  if (Array.isArray(r.activity_groups) && r.activity_groups.length) {
    return r.activity_groups.map((a) => ({
      name: a.name,
      done: !!a.done,
      group: a.group || null,
    }));
  }
  const acts = r.activities;
  if (acts && typeof acts === 'object' && Object.keys(acts).length) {
    return Object.keys(acts).map((name) => ({ name, done: Number(acts[name]) > 0, group: null }));
  }
  return LEGACY_ACTIVITY_LABELS.map((a) => ({ name: a.label, done: Number(r[a.col]) > 0, group: null }));
}

router.get('/list', authMiddleware, requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    const { month = '', level = '', dept = '', keyword = '' } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(req.query.page_size, 10) || 20));

    const conds = ['is_deleted = FALSE'];
    const params = [];
    if (/^\d{4}-\d{2}$/.test(String(month).trim())) {
      params.push(String(month).trim());
      conds.push(`month = $${params.length}`);
    }
    if (String(level).trim()) {
      params.push(String(level).trim());
      conds.push(`level = $${params.length}`);
    }
    if (String(dept).trim()) {
      params.push(`%${String(dept).trim()}%`);
      conds.push(`dept LIKE $${params.length}`);
    }
    if (String(keyword).trim()) {
      const kw = `%${String(keyword).trim()}%`;
      params.push(kw);
      conds.push(`(name LIKE $${params.length} OR dept LIKE $${params.length})`);
    }
    const where = conds.join(' AND ');

    const cnt = await pool.query(
      `SELECT COUNT(*)::int AS c FROM hse_safety_culture_monthly WHERE ${where}`,
      params
    );
    const total = cnt.rows.length ? cnt.rows[0].c : 0;

    // 一次取出全部命中行（台账月度数据量小），分页在 JS 内切片；汇总基于全量，避免受分页影响
    const order = `ORDER BY month DESC, dept, level, name`;
    const q = await pool.query(
      `SELECT id, month, level, dept, name, employee_id,
              activities, activity_groups, has_manual_col,
              act_three_violation, act_duty_safety, act_traffic_risk, manual_deduct, created_at
         FROM hse_safety_culture_monthly
        WHERE ${where} ${order}`,
      params
    );

    const { unit, caps } = await getRuleUnitAndCap();
    const decorate = (r) => {
      const activities = buildActivities(r);
      const missing = activities.filter((a) => !a.done);
      const manual = Math.max(0, Number(r.manual_deduct) || 0);
      // 打分口径：该表有「扣分」列则以扣分列(manual_deduct)为准（即便为 0）；无扣分列回退未开展项×unit
      const rawScore = r.has_manual_col
        ? manual
        : Math.round(missing.length * unit * 100) / 100;
      // 岗位套：台账行 level='管理员' → admin 套，其余 → manager 套（与适配器匹配口径一致）
      const cap = caps[r.level === '管理员' ? 'admin' : 'manager'] ?? 20;
      return {
        id: r.id,
        month: r.month,
        level: r.level,
        dept: r.dept,
        name: r.name,
        employeeId: r.employee_id,
        matched: !!r.employee_id,
        activities,
        manualDeduct: manual,
        missingLabels: missing.map((a) => a.name),
        unit,
        rawScore,
        cap,
        cappedScore: Math.min(rawScore, cap),
        created_at: r.created_at,
      };
    };

    const all = (q.rows || []).map(decorate);

    // 汇总（全量）：总行数 / 有扣分行数 / 扣分合计 / 未回填考核对象行数
    const summary = all.reduce(
      (acc, row) => {
        acc.total++;
        if (row.cappedScore > 0) {
          acc.deducted++;
          acc.deductSum = Math.round((acc.deductSum + row.cappedScore) * 100) / 100;
        }
        if (!row.matched) acc.unmatched++;
        return acc;
      },
      { total: 0, deducted: 0, deductSum: 0, unmatched: 0 }
    );

    const list = all.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);

    // 指定月份查不到台账 → 视为满分（0扣分）
    const fullMarks = total === 0 && /^\d{4}-\d{2}$/.test(String(month).trim());

    res.json({
      success: true, code: 0,
      data: {
        list, total, page, page_size: pageSize, unit, cap: caps.manager, caps, summary,
        fullMarks,
        fullMarksNote: '该月无「专项活动台帐」，按满分（0扣分）处理',
      },
    });
  } catch (e) {
    console.error('[safety-culture/list]', e.message);
    res.status(500).json({ success: false, code: 500, message: e.message });
  }
});

// ===================== 台账手动录入（新增/编辑/删除） =====================

function isValidMonth(s) {
  if (!/^\d{4}-\d{2}$/.test(String(s).trim())) return false;
  const [, m] = String(s).split('-').map(Number);
  return m >= 1 && m <= 12;
}

/**
 * POST /api/hse/safety-culture/ledger （upsert，幂等）
 * 新增：不传 id；编辑：传 id。键 (month, level, name) 唯一；改键撞他人唯一键 → 409。
 * body: { id?, month, level, dept, name, employeeId?, activities:[{name,done,group?}], manualDeduct?, hasManualCol? }
 */
router.post('/ledger', authMiddleware, requireRole('admin', 'safety_manager'), async (req, res) => {
  const body = req.body || {};
  const month = String(body.month ?? '').trim();
  const name = String(body.name ?? '').trim();
  if (!isValidMonth(month)) return res.status(400).json({ success: false, code: 400, message: '月份格式需为 YYYY-MM 且月为 1-12' });
  if (!name) return res.status(400).json({ success: false, code: 400, message: '姓名不能为空' });
  const level = normalizeLevel(body.level);
  if (!['乡镇主管', '管理员'].includes(level)) return res.status(400).json({ success: false, code: 400, message: '岗位需为 乡镇主管 或 管理员' });
  const dept = String(body.dept ?? '').trim();
  const rawActs = Array.isArray(body.activities) ? body.activities : [];
  if (rawActs.some((a) => !a || String(a.name ?? '').trim() === '')) {
    return res.status(400).json({ success: false, code: 400, message: '专项行动名称不能为空' });
  }
  const activities = rawActs
    .map((a) => ({ name: String(a.name ?? '').trim(), done: !!a.done, group: a.group ? String(a.group) : null }))
    .filter((a) => a.name);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 考核对象回填：前端显式提供则用之，否则按 姓名+岗位+乡镇 匹配
    let employeeId = null;
    let matched = false;
    if (body.employeeId != null && Number.isInteger(Number(body.employeeId))) {
      employeeId = Number(body.employeeId);
      matched = true;
    } else {
      employeeId = await matchEmployeeId(client, { name, level, dept });
      matched = employeeId != null;
    }

    // 活动项落库（与导入一致：activities + activity_groups + 旧三列同步写）
    const legacy = {
      act_three_violation: activities.some((a) => a.name.includes('三违') && a.done) ? 1 : 0,
      act_duty_safety: activities.some((a) => a.name.includes('轮值') && a.done) ? 1 : 0,
      act_traffic_risk: activities.some((a) => (a.name.includes('交通') || a.name.includes('危险因素')) && a.done) ? 1 : 0,
    };
    const activitiesJson = {};
    const activityGroups = activities.map((a) => {
      activitiesJson[a.name] = a.done ? 1 : 0;
      return { name: a.name, done: a.done, group: a.group || null };
    });
    const manualProvided = body.manualDeduct != null && Number.isFinite(Number(body.manualDeduct));
    const manual = manualProvided ? Math.max(0, Math.round(Number(body.manualDeduct) * 100) / 100) : 0;
    const hasManualCol = manualProvided ? true : !!body.hasManualCol;

    let rowId = body.id ? Number(body.id) : null;
    if (rowId && Number.isInteger(rowId) && rowId > 0) {
      const upd = await client.query(
        `UPDATE hse_safety_culture_monthly SET month=$1, level=$2, dept=$3, name=$4, employee_id=$5,
                activities=$6, activity_groups=$7, act_three_violation=$8, act_duty_safety=$9,
                act_traffic_risk=$10, manual_deduct=$11, has_manual_col=$12
          WHERE id=$13 AND is_deleted=FALSE RETURNING id`,
        [month, level, dept, name, employeeId, JSON.stringify(activitiesJson), JSON.stringify(activityGroups),
         legacy.act_three_violation, legacy.act_duty_safety, legacy.act_traffic_risk, manual, hasManualCol, rowId]
      );
      if (!upd.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, code: 404, message: '台账行不存在或已删除' });
      }
      rowId = upd.rows[0].id;
    } else {
      const ins = await client.query(
        `INSERT INTO hse_safety_culture_monthly
           (month, level, dept, name, employee_id, activities, activity_groups,
            act_three_violation, act_duty_safety, act_traffic_risk, manual_deduct, has_manual_col, is_deleted)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,FALSE)
         ON CONFLICT (month, level, name) DO UPDATE
            SET dept=EXCLUDED.dept, employee_id=EXCLUDED.employee_id, activities=EXCLUDED.activities,
                activity_groups=EXCLUDED.activity_groups, act_three_violation=EXCLUDED.act_three_violation,
                act_duty_safety=EXCLUDED.act_duty_safety, act_traffic_risk=EXCLUDED.act_traffic_risk,
                manual_deduct=EXCLUDED.manual_deduct, has_manual_col=EXCLUDED.has_manual_col, is_deleted=FALSE
         RETURNING id`,
        [month, level, dept, name, employeeId, JSON.stringify(activitiesJson), JSON.stringify(activityGroups),
         legacy.act_three_violation, legacy.act_duty_safety, legacy.act_traffic_risk, manual, hasManualCol]
      );
      rowId = ins.rows[0].id;
    }

    await client.query('COMMIT');
    return res.json({ success: true, code: 0, data: { id: Number(rowId), month, matched, employeeId } });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    if (e.code === '23505') {
      return res.status(409).json({ success: false, code: 409, message: '该月该岗位该姓名台账已存在' });
    }
    console.error('[safety-culture/ledger]', e.message);
    return res.status(500).json({ success: false, code: 500, message: e.message });
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/hse/safety-culture/ledger/:id （软删）
 */
router.delete('/ledger/:id', authMiddleware, requireRole('admin', 'safety_manager'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ success: false, code: 400, message: '无效的台账ID' });
  }
  try {
    const del = await pool.query(
      `UPDATE hse_safety_culture_monthly SET is_deleted = TRUE WHERE id = $1 AND is_deleted = FALSE RETURNING id`,
      [id]
    );
    if (!del.rows.length) {
      return res.status(404).json({ success: false, code: 404, message: '台账行不存在或已删除' });
    }
    return res.json({ success: true, code: 0, data: { id: Number(del.rows[0].id), deleted: true } });
  } catch (e) {
    console.error('[safety-culture/delete]', e.message);
    return res.status(500).json({ success: false, code: 500, message: e.message });
  }
});

/**
 * POST /api/hse/safety-culture/continue （空月份自动延续上月，幂等）
 * body: { month: 'YYYY-MM' }
 *
 * 业务语义：目标月份尚无台账时，以「最近一个有台账的月份」（sourceMonth < month 的最大月）为基准，
 * 原样复制其台账行（姓名/岗位/乡镇/专项活动及其勾选状态）到目标月份，作为人工修改的起点——
 * 达成「每个月自动生成延续上月的页面，人工在系统里改，而无需 Excel 导入」。
 * - 勾选完全复制：活动 activities + activity_groups（含未开展项），保持源月勾选状态
 * - 表格扣分不沿用：manual_deduct 置 0、has_manual_col=FALSE（续延月无 Excel「扣分」列，扣分按未开展项×unit 计算）
 * - 幂等：目标月已有行则只查不改不插；重复调用安全
 * - 无源月（全库尚无任何台账）→ 返回 generated=false，不写任何数据
 */
router.post('/continue', authMiddleware, requireRole('admin', 'safety_manager'), async (req, res) => {
  const month = String(req.body?.month ?? '').trim();
  if (!isValidMonth(month)) {
    return res.status(400).json({ success: false, code: 400, message: '月份格式需为 YYYY-MM 且月为 1-12' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1) 幂等：目标月份已有非删除行 → 直接返回，不重复生成
    const exist = await client.query(
      `SELECT COUNT(*)::int AS c FROM hse_safety_culture_monthly WHERE month = $1 AND is_deleted = FALSE`,
      [month]
    );
    const existing = exist.rows.length ? exist.rows[0].c : 0;
    if (existing > 0) {
      await client.query('COMMIT');
      return res.json({
        success: true, code: 0,
        data: { month, sourceMonth: null, generated: false, existing, inserted: 0 },
      });
    }

    // 2) 找最近一个有台账的源月份（< month 的最大月）
    const src = await client.query(
      `SELECT MAX(month) AS m FROM hse_safety_culture_monthly
        WHERE month < $1 AND is_deleted = FALSE`,
      [month]
    );
    const sourceMonth = src.rows.length ? src.rows[0].m : null;
    if (!sourceMonth) {
      await client.query('COMMIT');
      return res.json({
        success: true, code: 0,
        data: { month, sourceMonth: null, generated: false, existing: 0, inserted: 0 },
      });
    }

    // 3) 全量复制源月行为目标月（活动勾选原样；扣分列不沿用）
    const rows = await client.query(
      `SELECT level, dept, name, employee_id, activities, activity_groups
         FROM hse_safety_culture_monthly
        WHERE month = $1 AND is_deleted = FALSE
        ORDER BY id`,
      [sourceMonth]
    );
    const insert = `
      INSERT INTO hse_safety_culture_monthly
        (month, level, dept, name, employee_id, activities, activity_groups,
         act_three_violation, act_duty_safety, act_traffic_risk, manual_deduct, has_manual_col, is_deleted)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0,FALSE,FALSE)
      ON CONFLICT (month, level, name) DO UPDATE
        SET dept=EXCLUDED.dept, employee_id=EXCLUDED.employee_id, activities=EXCLUDED.activities,
            activity_groups=EXCLUDED.activity_groups, act_three_violation=EXCLUDED.act_three_violation,
            act_duty_safety=EXCLUDED.act_duty_safety, act_traffic_risk=EXCLUDED.act_traffic_risk,
            manual_deduct=0, has_manual_col=FALSE, is_deleted=FALSE`;
    let inserted = 0;
    for (const r of rows.rows) {
      const activities = buildActivities(r);
      const activitiesJson = {};
      const activityGroups = activities.map((a) => {
        activitiesJson[a.name] = a.done ? 1 : 0;
        return { name: a.name, done: a.done, group: a.group || null };
      });
      const legacy = {
        act_three_violation: activities.some((a) => a.name.includes('三违') && a.done) ? 1 : 0,
        act_duty_safety: activities.some((a) => a.name.includes('轮值') && a.done) ? 1 : 0,
        act_traffic_risk: activities.some((a) => (a.name.includes('交通') || a.name.includes('危险因素')) && a.done) ? 1 : 0,
      };
      await client.query(insert, [
        month, r.level, r.dept, r.name, r.employee_id,
        JSON.stringify(activitiesJson), JSON.stringify(activityGroups),
        legacy.act_three_violation, legacy.act_duty_safety, legacy.act_traffic_risk,
      ]);
      inserted++;
    }

    await client.query('COMMIT');
    return res.json({
      success: true, code: 0,
      data: { month, sourceMonth, generated: true, existing: 0, inserted },
    });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[safety-culture/continue]', e.message);
    return res.status(500).json({ success: false, code: 500, message: e.message });
  } finally {
    client.release();
  }
});

module.exports = router;