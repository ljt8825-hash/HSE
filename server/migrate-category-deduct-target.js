/**
 * 迁移：hse_assessment_category_limit 新增 deduct_target 列（扣分对象）
 * 目的：支持「一张总表」的「扣分对象（扣谁）」配置：
 *          self    = 扣本人（二级/三级网格长）
 *          manager = 传导到所属乡镇作业中心经理
 *          其它    = 自定义扣分对象
 * 运行时路由已通过 ensureSchema() 幂等自愈，本脚本供生产/初始化独立执行一次。
 * 执行：node migrate-category-deduct-target.js
 */
require('dotenv').config({ path: 'g:/hse-dashboard/server/.env' });
const { pool } = require('g:/hse-dashboard/server/config/db');
(async () => {
  await pool.query(
    `ALTER TABLE hse_assessment_category_limit ADD COLUMN IF NOT EXISTS deduct_target VARCHAR(64) DEFAULT 'self'`
  );
  const c = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'hse_assessment_category_limit' AND column_name = 'deduct_target'`
  );
  console.log('deduct_target 列: ' + (c.rows.length ? '已存在' : '缺失'));
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });