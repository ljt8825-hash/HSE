/**
 * 培训模块（/api/training）· 培训统计 —— service
 * 端点点簇：GET /stats、GET /stats/enhanced。
 * 保留 PostgreSQL + 内存降级；controller 仅解释描述符。
 */
const shared = require('./trainingShared');
const {
  pool, isConnected, ensureTables, initMemoryData, memoryPlans, memoryRecords,
  camelKeys,
} = shared;

// ========== GET /stats — 培训统计 ==========
async function getStats() {
  if (!isConnected()) {
    initMemoryData();
    const plans = memoryPlans.filter(r => !r.is_deleted);
    const records = memoryRecords.filter(r => !r.is_deleted);
    const passed = records.filter(r => r.result === '合格').length;
    const totalScored = records.filter(r => r.score !== null && r.score !== undefined).length;
    return {
      __t: 'json',
      payload: {
        totalPlans: plans.length,
        ongoing: plans.filter(p => p.status === 'ongoing').length,
        completed: plans.filter(p => p.status === 'completed').length,
        totalAttendees: records.length,
        passRate: totalScored > 0 ? Math.round((passed / totalScored) * 1000) / 10 : 0,
        byType: {},
      },
      message: '统计成功(内存模式)',
    };
  }

  const [planResult, recordResult, typeResult] = await Promise.all([
    pool.query('SELECT COUNT(*)::int AS total FROM training_records WHERE is_deleted = false'),
    pool.query("SELECT result, COUNT(*)::int AS count FROM training_records WHERE is_deleted = false GROUP BY result"),
    pool.query("SELECT training_type, COUNT(*)::int AS count FROM training_records WHERE is_deleted = false GROUP BY training_type"),
  ]);

  const byResult = {};
  recordResult.rows.forEach(r => { byResult[r.result] = parseInt(r.count); });
  const byType = {};
  typeResult.rows.forEach(r => { byType[r.training_type] = parseInt(r.count); });

  const passed = byResult['合格'] || 0;
  const failed = byResult['不合格'] || 0;
  const totalScored = passed + failed;

  return {
    __t: 'json',
    payload: {
      totalPlans: parseInt(planResult.rows[0].total),
      ongoing: 0,
      completed: passed,
      totalAttendees: parseInt(planResult.rows[0].total),
      passRate: totalScored > 0 ? Math.round((passed / totalScored) * 1000) / 10 : 0,
      byType,
    },
    message: '统计成功',
  };
}

// ========== GET /stats/enhanced — 培训统计增强 ==========
async function getStatsEnhanced() {
  if (!isConnected()) {
    return {
      __t: 'json',
      payload: {
        byPosition: {},
        byEmployee: {},
        overdueEmployees: [],
        positionCompletionRate: {},
        employeeCompletionRate: {},
      },
      message: '统计成功(内存模式)',
    };
  }

  await ensureTables();

  const [positionResult, employeeResult] = await Promise.all([
    pool.query(`
      SELECT r.position_name, COUNT(*) as required_count,
             COUNT(t.employee_id) as completed_count
      FROM training_requirements r
      LEFT JOIN training_records t ON t.position = r.position_name AND t.result = '合格'
      WHERE r.is_deleted = false AND t.is_deleted = false
      GROUP BY r.position_name
    `),
    pool.query(`
      SELECT ev.name, ev.position_name, ev.employee_code,
             COUNT(t.employee_id) as training_count
      FROM v_employee_current ev
      LEFT JOIN training_records t ON t.employee_id = ev.employee_id AND t.result = '合格'
      WHERE ev.assignment_status = 'active' AND (t.is_deleted = false OR t.id IS NULL)
      GROUP BY ev.name, ev.position_name, ev.employee_code
    `),
  ]);

  const byPosition = {};
  const positionCompletionRate = {};
  positionResult.rows.forEach(row => {
    const required = parseInt(row.required_count) || 0;
    const completed = parseInt(row.completed_count) || 0;
    byPosition[row.position_name] = { required, completed };
    positionCompletionRate[row.position_name] = required > 0 ? Math.round((completed / required) * 1000) / 10 : 0;
  });

  const byEmployee = {};
  const employeeCompletionRate = {};
  employeeResult.rows.forEach(row => {
    const key = `${row.name}(${row.employee_code})`;
    byEmployee[key] = parseInt(row.training_count) || 0;
    employeeCompletionRate[key] = {};
  });

  const overdueResult = await pool.query(`
    SELECT ev.name, ev.employee_code, ev.position_name, ev.org_name,
           t.training_date, t.training_type, t.expiry_status
    FROM v_employee_current ev
    JOIN training_records t ON t.employee_id = ev.employee_id
    WHERE ev.assignment_status = 'active' AND t.is_deleted = false AND t.expiry_status = 'expired'
    ORDER BY t.training_date DESC
  `);

  const overdueEmployees = overdueResult.rows.map(row => camelKeys({
    name: row.name,
    employeeCode: row.employee_code,
    positionName: row.position_name,
    orgName: row.org_name,
    trainingDate: row.training_date ? new Date(row.training_date).toISOString().slice(0, 10) : '',
    trainingType: row.training_type,
    expiryStatus: row.expiry_status,
  }));

  return {
    __t: 'json',
    payload: {
      byPosition,
      byEmployee,
      overdueEmployees,
      positionCompletionRate,
      employeeCompletionRate,
    },
    message: '统计成功',
  };
}

module.exports = {
  getStats,
  getStatsEnhanced,
};