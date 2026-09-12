/**
 * 迁移：为「否决项」适配器在 hse_assessment_rule 创建规则行 + 确保指标 HSE-KPI-NEG-004
 *   - accident_veto  ACCIDENT_VETO  (否决项 · 一票否决100分，扣当事人直接上级 + 乡镇作业中心经理)
 * 已存在则更新 adapter_key/category/metric_code，绝不重复插。
 * 执行：node migrate-rule-veto.js
 */
require('dotenv').config({ path: 'g:/hse-dashboard/server/.env' });
const { pool } = require('g:/hse-dashboard/server/config/db');

const RULE = {
  ruleCode: 'ACCIDENT_VETO', adapterKey: 'accident_veto', deductType: 'fixed',
  name: '事故否决（交通/生产安全责任）', category: '否决项',
  metricCode: 'HSE-KPI-NEG-004', sourceTable: 'accidents',
  formula: '交通非无责/待认定 或 生产安全责任：一票否决100分，扣当事人直接上级及乡镇作业中心经理',
};

(async () => {
  const r = RULE;
  // 指标
  const metricEx = await pool.query(
    `SELECT id FROM hse_assessment_metric WHERE metric_code = $1`,
    [r.metricCode]
  );
  if (!metricEx.rows.length) {
    await pool.query(
      `INSERT INTO hse_assessment_metric
         (metric_code, metric_name, category, target_post, base_score, metric_type,
          data_source, calc_formula, sort_order, status, remark)
       VALUES ($1,'事故否决（交通/生产安全责任）','SAFETY','all',0,'auto','accidents',
               '交通非无责/待认定或生产安全责任：一票否决100分，扣直接上级及乡镇作业中心经理',10,'active',
               '自动考核：事故否决项')`,
      [r.metricCode]
    );
    console.log('指标已建:', r.metricCode);
  } else {
    console.log('指标已存在:', r.metricCode);
  }

  // 规则
  const ex = await pool.query(
    `UPDATE hse_assessment_rule
        SET rule_name = $2, category = $3, adapter_key = $4, deduct_type = $5,
            metric_code = $6, source_table = $7, deduct_score = 100, max_deduct = 100,
            indicator_name = $8, status = 'enabled', is_deleted = FALSE,
            integration_status = 'connected'
      WHERE rule_code = $1 RETURNING id`,
    [r.ruleCode, r.name, r.category, r.adapterKey, r.deductType, r.metricCode, r.sourceTable, r.formula]
  );
  if (!ex.rows.length) {
    await pool.query(
      `INSERT INTO hse_assessment_rule
         (rule_code, rule_name, category, adapter_key, deduct_type, deduct_score, max_deduct,
          metric_code, source_table, indicator_name, trigger_type, status, integration_status)
       VALUES ($1,$2,$3,$4,$5,100,100,$6,$7,$8,'scheduled','enabled','connected')`,
      [r.ruleCode, r.name, r.category, r.adapterKey, r.deductType, r.metricCode, r.sourceTable, r.formula]
    );
    console.log('规则已建:', r.ruleCode);
  } else {
    console.log('规则已更新:', r.ruleCode);
  }
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });