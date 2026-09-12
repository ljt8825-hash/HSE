/**
 * 迁移：hse_assessment_category_limit 新增 rule_items 列
 * 目的：在「类别扣分上限」的「规则名称」中按行存储每行规则（考核内容/扣分/状态），
 *       支持图片式表单数组的编辑与持久化（避免刷新后扣分/启停状态回退）。
 * 执行：node migrate-category-rule-items.js
 */
require('dotenv').config({ path: 'g:/hse-dashboard/server/.env' });
const { pool } = require('g:/hse-dashboard/server/config/db');
(async () => {
  await pool.query(
    `ALTER TABLE hse_assessment_category_limit ADD COLUMN IF NOT EXISTS rule_items JSONB`
  );
  const c = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'hse_assessment_category_limit' AND column_name = 'rule_items'`
  );
  console.log('rule_items 列: ' + (c.rows.length ? '已存在' : '缺失'));
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });