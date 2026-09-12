/**
 * 迁移：为三个新适配器在 hse_assessment_rule 创建规则行
 *   - training_ledger  TRAINING001 (HSE教育培训 · 扣培训人本人)
 *   - driver_monthly   DRIVER001   (现场管理-驾驶员管理 · 传导到乡镇作业中心经理)
 *   - transfer_check   TRANSFER001 (现场管理-转运站管理 · 传导到乡镇作业中心经理)
 * 分值默认 1（每项/每人/每份），页面「扣分规则库」可改 deduct_score 即生效（不写死）。
 * 已存在则更新 adapter_key/deduct_score，绝不重复插。
 * 执行：node migrate-rule-new-sources.js
 */
require('dotenv').config({ path: 'g:/hse-dashboard/server/.env' });
const { pool } = require('g:/hse-dashboard/server/config/db');

const RULES = [
  {
    ruleCode: 'TRAINING001', adapterKey: 'training_ledger', deductType: 'cumulative',
    name: '培训台账缺训（缺少/资料不完整）', category: 'HSE教育培训',
    sourceTable: 'hse_training_ledger_monthly', formula: '（缺少人数+资料不完整份数）×单份分值，扣培训人本人',
  },
  {
    ruleCode: 'DRIVER001', adapterKey: 'driver_monthly', deductType: 'cumulative',
    name: '驾驶月度问题（三检/灯牌/灯具/监控/消防）', category: '现场管理-驾驶员管理',
    sourceTable: 'driver_monthly', formula: '各问题项次数×单次分值，传导到所属乡镇作业中心经理',
  },
  {
    ruleCode: 'TRANSFER001', adapterKey: 'transfer_check', deductType: 'cumulative',
    name: '转运站月度问题（台账/标识/用电/消防/物品）', category: '现场管理-转运站管理',
    sourceTable: 'transfer_station_check', formula: '各问题项次数×单次分值，传导到所属乡镇作业中心经理',
  },
];

(async () => {
  for (const r of RULES) {
    // 取既有行保持 id，否则插入
    const ex = await pool.query(
      `UPDATE hse_assessment_rule
          SET rule_name = $2, category = $3, adapter_key = $4, deduct_type = $5,
              source_table = $6, deduct_score = 1, indicator_name = $7,
              status = 'enabled', is_deleted = FALSE
        WHERE rule_code = $1 RETURNING id`,
      [r.ruleCode, r.name, r.category, r.adapterKey, r.deductType, r.sourceTable, r.formula]
    );
    if (!ex.rows.length) {
      await pool.query(
        `INSERT INTO hse_assessment_rule
           (rule_code, rule_name, category, adapter_key, deduct_type, deduct_score,
            source_table, indicator_name, trigger_type, status)
         VALUES ($1,$2,$3,$4,$5,1,$6,$7,'scheduled','enabled')`,
        [r.ruleCode, r.name, r.category, r.adapterKey, r.deductType, r.sourceTable, r.formula]
      );
    }
    console.log('规则就绪:', r.ruleCode, r.adapterKey);
  }
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });