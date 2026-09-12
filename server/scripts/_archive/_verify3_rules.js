/* 查规则库里三违管理所有规则名 + 类别映射命中测试 */
const { testConnection, pool } = require('../config/db');
const cat = require('../services/assessmentRuleCategoryService');
(async () => {
  await testConnection();
  const r = await pool.query(
    `SELECT id, rule_name, category, status FROM hse_assessment_rule WHERE is_deleted=FALSE ORDER BY category, id`
  );
  console.log('=== 规则库全部规则 ===');
  r.rows.forEach((x) => console.log(`${x.id} | ${x.rule_name} | ${x.category} | ${x.status}`));
  const map = await cat.getRuleCategoryMap();
  console.log('=== 命中测试 ===');
  for (const n of ['公司人员查处', '信息不完整', '检查未反馈', '自身三违行为', '未检查']) {
    console.log(`${n} -> ${JSON.stringify(map[n] || null)}`);
  }
  await pool.end();
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
