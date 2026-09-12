/**
 * HSE 考核扣分规则库路由（一期）
 *
 * 功能：
 *   1. 规则列表（分页 + 类别/触发方式/扣分方式/状态/关键词筛选），附子项数
 *   2. 统计（总数/启用数/各扣分方式/各类别分布）
 *   3. 规则详情（主表 + hse_rule_detail 子项 + hse_rule_condition 条件）
 *   4. 新建 / 更新（更新时整体替换子项与条件，事务）/ 删除（软删）/ 启停
 *
 * 对应表：hse_assessment_rule / hse_rule_detail / hse_rule_condition
 * 契约：camelCase 优先（前端统一 camel 提交），后端兼容。
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const XLSX = require('xlsx');
const iconv = require('iconv-lite');
const { pool, isConnected } = require('../config/db');
const { success, error } = require('../middleware/response');
const { requireRole } = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ============================================================
// 辅助
// ============================================================

function camelKeys(obj) {
  if (!obj) return obj;
  const result = {};
  for (const key of Object.keys(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    result[camelKey] = obj[key];
  }
  return result;
}

// ============================================================
// 明细导入辅助（Excel/CSV → SheetJS；文本 → 逐行拆分）
// 约定列：子项名称/考核内容/子项、扣分/分值、单位、编码（可选）
// ============================================================
const RE_NAME = /(子项名称|考核内容|子项|明细|名称|内容|项目)/;
const RE_SCORE = /(扣分|分值|分数)/;
const RE_UNIT = /(单位|计量)/;
const RE_CODE = /(编码|编号)/;

function toNum(v) {
  const s = String(v ?? '').replace(/[￥¥分元]/g, '').trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseDetailsRows(rows) {
  const result = [];
  let headerIdx = -1;
  let cols = { ni: 0, si: -1, ui: -1, ci: -1 };
  // 找表头行（含关键词）
  for (let i = 0; i < rows.length; i++) {
    const joined = rows[i].map((c) => String(c ?? '').trim().replace(/[*\s]/g, '')).join('|');
    if (RE_NAME.test(joined) || RE_SCORE.test(joined)) { headerIdx = i; break; }
  }
  if (headerIdx >= 0) {
    rows[headerIdx].forEach((cell, idx) => {
      const s = String(cell ?? '').trim();
      if (s && RE_NAME.test(s) && cols.ni < 0) cols.ni = idx;
      if (s && RE_SCORE.test(s) && cols.si < 0) cols.si = idx;
      if (s && RE_UNIT.test(s) && cols.ui < 0) cols.ui = idx;
      if (s && RE_CODE.test(s) && cols.ci < 0) cols.ci = idx;
    });
  }
  const start = headerIdx >= 0 ? headerIdx + 1 : 0;
  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const name = String(headerIdx >= 0 ? r[cols.ni] : r[0] ?? '').trim();
    if (!name) continue;
    result.push({
      detailName: name,
      deductScore: headerIdx >= 0 ? toNum(r[cols.si]) : toNum(r[1]),
      unit: String(headerIdx >= 0 ? r[cols.ui] ?? '' : r[2] ?? '').trim(),
      detailCode: String(headerIdx >= 0 ? r[cols.ci] ?? '' : r[3] ?? '').trim(),
    });
  }
  return result;
}

function parseTextLines(text) {
  const result = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^[\s\u3000]+|[\s\u3000]+$/g, '').trim();
    if (!line) continue;
    const parts = line.split(/[\t,，;；\s]+/).map((s) => s.trim()).filter(Boolean);
    if (!parts[0]) continue;
    result.push({
      detailName: parts[0],
      deductScore: toNum(parts[1]),
      unit: parts[2] || '',
      detailCode: parts[3] || '',
    });
  }
  return result;
}

// ============================================================
// 一、规则列表 + 统计
// ============================================================

// GET / — 规则列表
router.get('/', async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const { category, trigger_type, deduct_type, status, integration_status, keyword, page = 1, size = 20 } = req.query;

    const where = ['r.is_deleted = FALSE'];
    const params = [];
    let i = 1;
    if (category) { where.push(`r.category = $${i++}`); params.push(category); }
    if (trigger_type) { where.push(`r.trigger_type = $${i++}`); params.push(trigger_type); }
    if (deduct_type) { where.push(`r.deduct_type = $${i++}`); params.push(deduct_type); }
    if (status) { where.push(`r.status = $${i++}`); params.push(status); }
    // 阶段0 新增：按接入状态筛选（active/pending_data/no_table/manual）
    if (integration_status) { where.push(`r.integration_status = $${i++}`); params.push(integration_status); }
    if (keyword) {
      where.push(`(r.rule_name ILIKE $${i++} OR r.rule_code ILIKE $${i++} OR r.source_table ILIKE $${i++})`);
      const kw = `%${keyword}%`;
      params.push(kw, kw, kw);
    }

    const whereSql = where.join(' AND ');
    const offset = (page - 1) * size;
    const list = await pool.query(
      `SELECT r.*,
              (SELECT COUNT(*)::int FROM hse_rule_detail d
                WHERE d.rule_id = r.id AND d.is_deleted = FALSE) AS detail_count,
              -- 提示词-14：最近一次执行所属考核周期编码（last_run_cycle_id 为 NULL 时子查询返回 NULL）
              (SELECT c.cycle_code FROM hse_assessment_cycle c WHERE c.id = r.last_run_cycle_id) AS last_run_cycle_code
       FROM hse_assessment_rule r
       WHERE ${whereSql}
       ORDER BY r.priority DESC, r.rule_code ASC
       LIMIT $${i++} OFFSET $${i++}`,
      [...params, parseInt(size), offset]
    );
    const total = await pool.query(
      `SELECT COUNT(*) AS c FROM hse_assessment_rule r WHERE ${whereSql}`,
      params
    );

    res.json(success({
      list: list.rows.map(camelKeys),
      total: parseInt(total.rows[0].c),
      page: parseInt(page),
      size: parseInt(size),
    }, '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// GET /stats — 统计
router.get('/stats', async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const r = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE is_deleted=FALSE)::int AS total,
         COUNT(*) FILTER (WHERE status='enabled' AND is_deleted=FALSE)::int AS enabled,
         COUNT(*) FILTER (WHERE is_deleted=FALSE AND deduct_type='fixed')::int AS fixed_cnt,
         COUNT(*) FILTER (WHERE is_deleted=FALSE AND deduct_type='cumulative')::int AS cumulative_cnt,
         COUNT(*) FILTER (WHERE is_deleted=FALSE AND deduct_type='detail')::int AS detail_cnt,
         COUNT(*) FILTER (WHERE is_deleted=FALSE AND deduct_type='tiered')::int AS tiered_cnt,
         COUNT(*) FILTER (WHERE is_deleted=FALSE AND trigger_type='auto')::int AS auto_cnt,
         COUNT(*) FILTER (WHERE is_deleted=FALSE AND trigger_type='manual')::int AS manual_cnt,
         -- 阶段0 新增：各接入状态计数（active=已接入/pending_data=待数据/no_table=未接表/manual=人工）
         COUNT(*) FILTER (WHERE is_deleted=FALSE AND integration_status='active')::int AS integration_active,
         COUNT(*) FILTER (WHERE is_deleted=FALSE AND integration_status='pending_data')::int AS integration_pending_data,
         COUNT(*) FILTER (WHERE is_deleted=FALSE AND integration_status='no_table')::int AS integration_no_table,
         COUNT(*) FILTER (WHERE is_deleted=FALSE AND integration_status='manual')::int AS integration_manual,
         (SELECT COUNT(*) FROM hse_rule_detail WHERE is_deleted=FALSE)::int AS detail_rows
       FROM hse_assessment_rule r`
    );
    res.json(success(camelKeys(r.rows[0] || {}), '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// GET /categories — 类别与方式字典（前端筛选用）
router.get('/categories', async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const r = await pool.query(
      `SELECT DISTINCT category FROM hse_assessment_rule WHERE is_deleted=FALSE ORDER BY category`
    );
    res.json(success(r.rows.map((x) => x.category), '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// GET /:id — 规则详情（主表 + 子项 + 条件）
router.get('/:id', async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const id = parseInt(req.params.id);
    const rule = await pool.query(
      'SELECT * FROM hse_assessment_rule WHERE id = $1 AND is_deleted = FALSE',
      [id]
    );
    if (!rule.rows.length) return res.json(error(-1, '规则不存在'));
    const details = await pool.query(
      'SELECT * FROM hse_rule_detail WHERE rule_id = $1 AND is_deleted = FALSE ORDER BY sort_order',
      [id]
    );
    const conds = await pool.query(
      'SELECT * FROM hse_rule_condition WHERE rule_id = $1 AND is_deleted = FALSE ORDER BY sort_order',
      [id]
    );
    res.json(success({
      rule: camelKeys(rule.rows[0]),
      details: details.rows.map(camelKeys),
      conditions: conds.rows.map(camelKeys),
    }, '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// ============================================================
// 二、规则新建 / 更新 / 删除 / 启停
// ============================================================

function pickMain(body) {
  const b = body || {};
  return {
    ruleCode: b.ruleCode ?? null,
    ruleName: b.ruleName ?? '',
    category: b.category ?? '未分类',
    metricCode: b.metricCode ?? null,
    indicatorName: b.indicatorName ?? null,
    itemName: b.itemName ?? null,
    sourceTable: b.sourceTable ?? null,
    // 手动链接：手动在一级/二级/三级菜单中选中的页面路由（空则视为自动链接的来源表）
    sourceRoute: b.sourceRoute ?? null,
    triggerType: b.triggerType ?? 'auto',
    deductType: b.deductType ?? 'fixed',
    deductScore: b.deductScore ?? 0,
    maxDeduct: b.maxDeduct ?? null,
    deductConfig: b.deductConfig ?? null,
    transmissionConfig: b.transmissionConfig ?? null,
    conditionMode: b.conditionMode ?? 'simple',
    conditionExpr: b.conditionExpr ?? null,
    scopeConfig: b.scopeConfig ?? null,
    cycleType: b.cycleType ?? 'monthly',
    priority: b.priority ?? 10,
    validFrom: b.validFrom || new Date().toISOString().slice(0, 10),
    validTo: b.validTo ?? null,
    status: b.status ?? 'enabled',
    remark: b.remark ?? null,
  };
}

function pickDetails(body) {
  return Array.isArray(body?.details) ? body.details : [];
}

// 生成下一个规则编码：R + 六位序号（在调用方事务内执行，防止并发重复号）
async function nextRuleCode(client) {
  const res = await client.query(
    `SELECT COALESCE(MAX((regexp_match(rule_code, 'R([0-9]+)$'))[1]::int), 0) AS mc
     FROM hse_assessment_rule
     WHERE rule_code ~ '^R[0-9]+$' AND is_deleted = FALSE`
  );
  const n = (parseInt(res.rows[0]?.mc, 10) || 0) + 1;
  return ('R' + String(n).padStart(6, '0'));
}
function pickConditions(body) {
  return Array.isArray(body?.conditions) ? body.conditions : [];
}

// POST / — 新建规则（可选携带子项 details 与条件 conditions）
router.post('/', requireRole('admin', 'safety_manager'), async (req, res) => {
  const client = await pool.connect();
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const m = pickMain(req.body);
    if (!m.ruleName) return res.json(error(-1, '规则名称必填'));
    if (!m.deductType) return res.json(error(-1, '扣分方式必填'));

    await client.query('BEGIN');
    // 规则编码留空则自动生成（R + 六位序号）
    if (!m.ruleCode) m.ruleCode = await nextRuleCode(client);
    const ins = await client.query(
      `INSERT INTO hse_assessment_rule
         (rule_code, rule_name, category, metric_code, indicator_name, item_name,
          source_table, trigger_type, deduct_type, deduct_score, max_deduct,
          deduct_config, transmission_config, condition_mode, condition_expr,
          scope_config, cycle_type, priority, valid_from, valid_to, status, remark,
          source_route)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
       RETURNING *`,
      [m.ruleCode, m.ruleName, m.category, m.metricCode, m.indicatorName, m.itemName,
       m.sourceTable, m.triggerType, m.deductType, m.deductScore, m.maxDeduct,
       m.deductConfig ? JSON.stringify(m.deductConfig) : null,
       m.transmissionConfig ? JSON.stringify(m.transmissionConfig) : null,
       m.conditionMode, m.conditionExpr ? JSON.stringify(m.conditionExpr) : null,
       m.scopeConfig ? JSON.stringify(m.scopeConfig) : null,
       m.cycleType, m.priority, m.validFrom, m.validTo, m.status, m.remark,
       m.sourceRoute || null]
    );
    const ruleId = ins.rows[0].id;

    for (const [d, idx] of pickDetails(req.body).entries()) {
      await client.query(
        `INSERT INTO hse_rule_detail (rule_id, detail_code, detail_name, deduct_score, unit, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [ruleId, d.detailCode || null, d.detailName, d.deductScore ?? 0, d.unit || '次', idx + 1]
      );
    }
    for (const [c, idx] of pickConditions(req.body).entries()) {
      await client.query(
        `INSERT INTO hse_rule_condition (rule_id, logic, field, operator, value, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [ruleId, c.logic || 'and', c.field, c.operator || 'eq', c.value, idx + 1]
      );
    }
    await client.query('COMMIT');
    res.json(success(camelKeys(ins.rows[0]), '创建成功'));
  } catch (err) {
    await client.query('ROLLBACK');
    res.json(error(-1, err.message));
  } finally {
    client.release();
  }
});

// PUT /:id — 更新规则（整体替换子项与条件，事务）
router.put('/:id', requireRole('admin', 'safety_manager'), async (req, res) => {
  const client = await pool.connect();
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const id = parseInt(req.params.id);
    const m = pickMain(req.body);
    if (!m.ruleName) return res.json(error(-1, '规则名称必填'));

    await client.query('BEGIN');
    // 更新时若编码为空：保留已有编码；历史记录本就为空则补自动生成
    if (!m.ruleCode) {
      const curRes = await client.query(
        'SELECT rule_code FROM hse_assessment_rule WHERE id=$1',
        [id],
      );
      m.ruleCode = curRes.rows[0]?.rule_code || await nextRuleCode(client);
    }
    const upd = await client.query(
      `UPDATE hse_assessment_rule SET
         rule_code=$2, rule_name=$3, category=$4, metric_code=$5, indicator_name=$6, item_name=$7,
         source_table=$8, trigger_type=$9, deduct_type=$10, deduct_score=$11, max_deduct=$12,
         deduct_config=$13, transmission_config=$14, condition_mode=$15, condition_expr=$16,
         scope_config=$17, cycle_type=$18, priority=$19, valid_from=$20, valid_to=$21, status=$22,
         remark=$23, source_route=$24, version = version + 1
       WHERE id=$1 AND is_deleted=FALSE
       RETURNING *`,
      [id, m.ruleCode, m.ruleName, m.category, m.metricCode, m.indicatorName, m.itemName,
       m.sourceTable, m.triggerType, m.deductType, m.deductScore, m.maxDeduct,
       m.deductConfig ? JSON.stringify(m.deductConfig) : null,
       m.transmissionConfig ? JSON.stringify(m.transmissionConfig) : null,
       m.conditionMode, m.conditionExpr ? JSON.stringify(m.conditionExpr) : null,
       m.scopeConfig ? JSON.stringify(m.scopeConfig) : null,
       m.cycleType, m.priority, m.validFrom, m.validTo, m.status, m.remark, m.sourceRoute || null]
    );
    if (!upd.rows.length) {
      await client.query('ROLLBACK');
      return res.json(error(-1, '规则不存在'));
    }

    // 整体替换子项与条件（物理删除后重建，适配 UI 整体编辑）
    await client.query('DELETE FROM hse_rule_detail WHERE rule_id = $1', [id]);
    await client.query('DELETE FROM hse_rule_condition WHERE rule_id = $1', [id]);
    for (const [d, idx] of pickDetails(req.body).entries()) {
      await client.query(
        `INSERT INTO hse_rule_detail (rule_id, detail_code, detail_name, deduct_score, unit, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, d.detailCode || null, d.detailName, d.deductScore ?? 0, d.unit || '次', idx + 1]
      );
    }
    for (const [c, idx] of pickConditions(req.body).entries()) {
      await client.query(
        `INSERT INTO hse_rule_condition (rule_id, logic, field, operator, value, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, c.logic || 'and', c.field, c.operator || 'eq', c.value, idx + 1]
      );
    }
    await client.query('COMMIT');
    // 返回完整详情
    const fresh = await pool.query(
      `SELECT * FROM hse_assessment_rule WHERE id=$1`, [id]
    );
    const details = await pool.query(
      `SELECT * FROM hse_rule_detail WHERE rule_id=$1 ORDER BY sort_order`, [id]
    );
    const conds = await pool.query(
      `SELECT * FROM hse_rule_condition WHERE rule_id=$1 ORDER BY sort_order`, [id]
    );
    res.json(success({
      rule: camelKeys(fresh.rows[0]),
      details: details.rows.map(camelKeys),
      conditions: conds.rows.map(camelKeys),
    }, '更新成功'));
  } catch (err) {
    await client.query('ROLLBACK');
    res.json(error(-1, err.message));
  } finally {
    client.release();
  }
});

// PUT /:id/status — 启停规则
router.put('/:id/status', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const id = parseInt(req.params.id);
    const status = req.body && req.body.status === 'disabled' ? 'disabled' : 'enabled';
    const upd = await pool.query(
      `UPDATE hse_assessment_rule SET status=$2 WHERE id=$1 AND is_deleted=FALSE RETURNING *`,
      [id, status]
    );
    if (!upd.rows.length) return res.json(error(-1, '规则不存在'));
    res.json(success(camelKeys(upd.rows[0]), status === 'enabled' ? '已启用' : '已停用'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// DELETE /:id — 删除规则（软删）
router.delete('/:id', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    const id = parseInt(req.params.id);
    const del = await pool.query(
      `UPDATE hse_assessment_rule SET is_deleted=TRUE WHERE id=$1 AND is_deleted=FALSE RETURNING id`,
      [id]
    );
    if (!del.rows.length) return res.json(error(-1, '规则不存在'));
    res.json(success(null, '删除成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// POST /import-details — 导入扣分明细（Excel/CSV/文本），返回解析出的子项行
router.post('/import-details', requireRole('admin', 'safety_manager'), upload.single('file'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));
    if (!req.file) return res.json(error(-1, '未收到文件'));
    const name = String(req.file.originalname || '').toLowerCase();
    const ext = name.includes('.') ? name.split('.').pop().replace(/\?.*$/, '') : '';
    let result = [];
    if (['xlsx', 'xls', 'csv'].includes(ext)) {
      let wb;
      if (ext === 'csv') {
        // CSV 编码兼容：显式 UTF-8（含 BOM 则剥离）；解码出现 U+FFFD 乱码时回退 GBK（中文 Excel 默认导出）
        let text = req.file.buffer.toString('utf8');
        if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
        if (text.includes('\uFFFD')) {
          try {
            text = iconv.decode(req.file.buffer, 'gbk');
          } catch { /* 保持 utf8 结果 */ }
        }
        wb = XLSX.read(text, { type: 'string' });
      } else {
        wb = XLSX.read(req.file.buffer, { type: 'buffer' });
      }
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) return res.json(error(-1, 'Excel 中没有可解析的工作表'));
      const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '', blankrows: false });
      result = parseDetailsRows(matrix);
    } else if (ext === 'txt') {
      result = parseTextLines(req.file.buffer.toString('utf8'));
    } else {
      return res.json(error(-1, '仅支持 Excel(.xlsx/.xls/.csv) 或文本(.txt)'));
    }
    res.json(success(result, `解析到 ${result.length} 条扣分明细`));
  } catch (err) {
    res.json(error(-1, '导入解析失败：' + err.message));
  }
});

module.exports = router;