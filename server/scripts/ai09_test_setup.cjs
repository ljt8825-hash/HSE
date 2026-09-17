/**
 * AI-09 测试环境准备（开发库最小测试，只读业务数据不触碰）：
 *  1) 临时 safety_manager 用户（username 前缀 ai09_test_，测试后删除）
 *  2) hazards 临时截断测试数据 2100 条（2025-01 区间、hazard_source='AI09_TEST'、description 带标记，测试后删除）
 * 数据边界：仅操作开发库 safety_dashboard；不触碰 safety_dashboard_dev；
 *          不修改既有用户/业务记录；所有临时对象均可按标记完整清理。
 */
const crypto = require('crypto');
const { pool } = require('../config/db');

const TEST_USERNAME = 'ai09_test_sm';
const HAZ_SOURCE = 'AI09_TEST';
const HAZ_PREFIX = '[AI09截断测试]';
const TOTAL = 2100;

function hashPassword(pw) {
  return crypto.createHash('sha256').update(pw).digest('hex');
}

async function main() {
  // 1) 临时 safety_manager 用户（幂等：已存在则跳过）
  const u = await pool.query('SELECT id FROM users WHERE username = $1', [TEST_USERNAME]);
  if (u.rows.length === 0) {
    const r = await pool.query(
      `INSERT INTO users (username, password_hash, role, real_name, department, is_active)
       VALUES ($1, $2, 'safety_manager', 'AI09测试安全主管', '测试部', true)
       RETURNING id`,
      [TEST_USERNAME, hashPassword('Ai09Test!2026')]
    );
    console.log(`SM_USER_CREATED: id=${r.rows[0].id}`);
  } else {
    console.log(`SM_USER_EXISTS: id=${u.rows[0].id}`);
  }

  // 2) 临时 hazards 截断测试数据 2100 条（幂等重建：先清旧 AI09_TEST 数据再插入）
  //    2025-01-01 ~ 2025-01-20 共 2000 条（=2000 场景）；2025-02-01 ~ 2025-02-05 共 100 条（>2000 场景）
  await pool.query('DELETE FROM hazards WHERE hazard_source = $1', [HAZ_SOURCE]);
  {
    const rows = [];
    let n = 0;
    // 2025-01-01 ~ 2025-01-20：每天 100 条 → 2000 条
    for (let d = 1; d <= 20 && n < 2000; d++) {
      const date = `2025-01-${String(d).padStart(2, '0')}`;
      for (let k = 0; k < 100 && n < 2000; k++) {
        const idx = n + 1;
        rows.push([
          idx,
          date,
          '测试镇',
          '安全设施',
          '一般',
          `${HAZ_PREFIX}记录${idx}`,
          '测试区A',
          '立即整改',
          date,
          'AI09测试员',
          '测试科',
          k % 2 === 0 ? '已完成' : '未完成',
          k % 2 === 0 ? date : null,
          'AI09测试备注',
          HAZ_SOURCE,
        ]);
        n++;
      }
    }
    // 2025-02-01 ~ 2025-02-05：每天 20 条 → 100 条
    for (let d = 1; d <= 5 && n < 2100; d++) {
      const date = `2025-02-${String(d).padStart(2, '0')}`;
      for (let k = 0; k < 20 && n < 2100; k++) {
        const idx = n + 1;
        rows.push([
          idx,
          date,
          '测试镇',
          '安全设施',
          '一般',
          `${HAZ_PREFIX}记录${idx}`,
          '测试区A',
          '立即整改',
          date,
          'AI09测试员',
          '测试科',
          k % 2 === 0 ? '已完成' : '未完成',
          k % 2 === 0 ? date : null,
          'AI09测试备注',
          HAZ_SOURCE,
        ]);
        n++;
      }
    }
    // 批量插入（VALUES 拼接，4000 参数上限内：15 列 × 2100 = 31500 > 65535? 单语句参数上限 65535，可一次）
    const placeholders = rows.map((_, i) => {
      const base = i * 15;
      return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11},$${base + 12},$${base + 13},$${base + 14},$${base + 15})`;
    }).join(',');
    const vals = rows.flat();
    await pool.query(
      `INSERT INTO hazards
         (no, hazard_date, township, category, level, description, location, measure, deadline, checker, responsible_dept, status, fix_date, remark, hazard_source)
       VALUES ${placeholders}`,
      vals
    );
    console.log(`HAZ_INSERTED: ${rows.length}`);
  }
}

main()
  .then(() => pool.end())
  .catch(async (e) => {
    console.error('SETUP_ERR:', e.message);
    await pool.end();
    process.exitCode = 1;
  });
