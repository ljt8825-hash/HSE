const { pool } = require('../config/db');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
(async () => {
  // 1) SQL 模拟（与后端路由一致）
  const q = await pool.query(`
    SELECT t.id, t.employee_id, t.employee_name, t.score_total
    FROM hse_assessment_target t
    WHERE t.is_deleted = FALSE AND t.cycle_id = 24
      AND t.employee_id IN (
        SELECT ga.personnel_id FROM grid_areas ga
        WHERE ga.personnel_id IS NOT NULL
          AND COALESCE(ga.is_deleted, FALSE) = FALSE
          AND ga.grid_level IN ('二级网格长','三级网格长')
      )
    ORDER BY t.score_total DESC
  `);
  console.log('SQL 命中数:', q.rows.length);
  console.log('SQL 含张忠华:', q.rows.filter(r=>String(r.employee_name).includes('张忠华')).map(r=>`${r.id}/${r.employee_id}/${r.employee_name}/${r.score_total}`).join('; ') || '无');

  // 2) API 全量拉取
  const JWT_SECRET = 'hse_prod_jwt_7f3a9c2e8b1d4f6a0e5c7d9b2a4f8e1c3d5b7a9e1f3c5d7b9a1e3f5c7d9b2';
  const token = jwt.sign({ id: 1, username: 'admin', role: 'admin', realName: '管理员', type: 'access' }, JWT_SECRET, { expiresIn: '12h', jwtid: crypto.randomUUID() });
  const url = 'http://localhost:5800/api/hse/assessment-monthly/cycles/24/targets?page=1&page_size=100&grid_level=' + encodeURIComponent('二级网格长,三级网格长') + '&sort_by=score_total&sort_order=desc';
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const j = await r.json();
  const list = (j.data && j.data.list) || [];
  console.log('API 返回数:', list.length);
  console.log('API 含张忠华:', list.filter(x=>String(x.employeeName).includes('张忠华')).map(x=>`${x.id}/${x.employeeId}/${x.employeeName}/${x.scoreTotal}`).join('; ') || '无');
  console.log('SQL 名集合:', q.rows.map(r=>r.employee_name).join(','));
  console.log('API 名集合:', list.map(x=>x.employeeName).join(','));
  await pool.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
