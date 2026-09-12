/**
 * 迁移：安全文化建设「专项活动台帐」—— 主管版
 *  1) 建表 hse_safety_culture_monthly（月度安全文化建设台账）
 *  2) 建/更新 auto 规则 SAFE_AUTO -> adapter_key=safety_culture, category='安全文化建设'
 *  3) 类别扣分上限「安全文化建设」若无则补建（上限 20，仅主管维度）
 * 分值：专项活动未开展 10 分/项/次（页面「扣分规则库」可改 deduct_score）
 * 幂等：IF NOT EXISTS / ON CONFLICT，可重复执行
 * 执行：node migrate-safety-culture.js
 */
require('dotenv').config({ path: 'g:/hse-dashboard/server/.env' });
const { pool } = require('g:/hse-dashboard/server/config/db');

const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS hse_safety_culture_monthly (
  id                  SERIAL PRIMARY KEY,
  month               VARCHAR(7)        NOT NULL,             -- 'YYYY-MM'
  level               VARCHAR(32)       NOT NULL DEFAULT '乡镇主管', -- 乡镇主管|管理员
  dept                VARCHAR(100)      NOT NULL,             -- 所属乡镇/作业中心
  name                VARCHAR(64)       NOT NULL,             -- 被考核对象姓名
  employee_id         INT                        NULL,        -- 回填的考核对象员工id
  act_three_violation SMALLINT          NOT NULL DEFAULT 0,   -- "三违"专项活动 是否开展(1=√)
  act_duty_safety     SMALLINT          NOT NULL DEFAULT 0,   -- 轮值安全员 是否开展(1=√)
  act_traffic_risk    SMALLINT          NOT NULL DEFAULT 0,   -- 交通安全危险因素识别清单 是否开展(1=√)
  manual_deduct       NUMERIC(8,2)      NOT NULL DEFAULT 0,   -- 表格「扣分」列(>0 优先采用)
  is_deleted          BOOLEAN           NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMP         DEFAULT NOW(),
  UNIQUE (month, level, name)
);`;

const RULE = {
  code: 'SAFE_AUTO',
  name: '安全文化建设专项活动未开展',
  category: '安全文化建设',
  adapterKey: 'safety_culture',
  deductType: 'fixed',
  source: 'hse_safety_culture_monthly',
  formula: '专项活动（三违/轮值安全员/交通安全识别）未开展项×10，扣考核对象本人',
};

(async () => {
  await pool.query(CREATE_TABLE);
  console.log('表就绪: hse_safety_culture_monthly');

  // 规则：已存在则更新，否则插入
  const ex = await pool.query(
    `UPDATE hse_assessment_rule
        SET rule_name=$2, category=$3, adapter_key=$4, deduct_type=$5,
            source_table=$6, deduct_score=10, indicator_name=$7,
            status='enabled', is_deleted=FALSE
      WHERE rule_code=$1 RETURNING id`,
    [RULE.code, RULE.name, RULE.category, RULE.adapterKey, RULE.deductType, RULE.source, RULE.formula]
  );
  if (!ex.rows.length) {
    await pool.query(
      `INSERT INTO hse_assessment_rule
         (rule_code, rule_name, category, adapter_key, deduct_type, deduct_score,
          source_table, indicator_name, trigger_type, status)
       VALUES ($1,$2,$3,$4,'fixed',10,$5,$6,'scheduled','enabled')`,
      [RULE.code, RULE.name, RULE.category, RULE.adapterKey, RULE.source, RULE.formula]
    );
  }
  console.log('规则就绪:', RULE.code, RULE.adapterKey);

  // 类别上限补建（安全文化建设=20，管理元/经理统一 20）
  await pool.query(
    `INSERT INTO hse_assessment_category_limit
        (category, max_deduct)
     VALUES ('安全文化建设', 20)
     ON CONFLICT (category) DO NOTHING`
  ).catch(() => console.log('类别上限已存在或无需补建'));
  console.log('类别上限兜底: 安全文化建设=20');
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });