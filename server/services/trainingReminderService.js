/**
 * 培训模块（/api/training）· 到期 / 新员工提醒 + 分析增强 —— service
 * 端点点簇：GET /reminders/expiry、GET /reminders/new-employee、GET /analysis/enhanced。
 * 保留 PostgreSQL + 内存降级；controller 仅解释描述符。
 */
const shared = require('./trainingShared');
const {
  pool, isConnected, ensureTables, camelKeys,
} = shared;

// ========== GET /reminders/expiry — 培训到期检查 ==========
async function getExpiryReminders(days) {
  const daysAhead = parseInt(days);

  if (!isConnected()) {
    return {
      __t: 'json',
      payload: { expiring: [], expired: [], note: '内存模式无员工数据' },
      message: '查询成功(内存模式)',
    };
  }

  await ensureTables();

  const result = await pool.query(`
    WITH latest_training AS (
      SELECT DISTINCT ON (ev.employee_id)
        ev.employee_id,
        ev.name,
        ev.employee_code,
        ev.position_name,
        ev.org_name,
        ev.is_driver,
        t.training_date,
        t.training_type,
        t.result,
        CASE
          WHEN t.training_date IS NULL THEN NULL
          ELSE (t.training_date::timestamp + INTERVAL '12 months')::date
        END AS expiry_date,
        CASE
          WHEN t.training_date IS NULL THEN 'missing'
          WHEN (t.training_date::timestamp + INTERVAL '12 months')::date < CURRENT_DATE THEN 'expired'
          WHEN (t.training_date::timestamp + INTERVAL '12 months')::date <= CURRENT_DATE + ($1 || ' days')::interval THEN 'expiring'
          ELSE 'normal'
        END AS expiry_status
      FROM v_employee_current ev
      LEFT JOIN training_records t ON t.employee_id = ev.employee_id AND t.is_deleted = false AND t.result = '合格'
      WHERE ev.assignment_status = 'active'
      ORDER BY ev.employee_id, t.training_date DESC NULLS LAST
    )
    SELECT * FROM latest_training
    WHERE expiry_status IN ('expired', 'expiring', 'missing')
    ORDER BY expiry_status, expiry_date NULLS LAST
  `, [String(daysAhead)]);

  const expiring = [];
  const expired = [];
  const missing = [];

  result.rows.forEach(row => {
    const item = {
      employeeId: row.employee_id,
      name: row.name,
      employeeCode: row.employee_code,
      positionName: row.position_name,
      orgName: row.org_name,
      isDriver: row.is_driver,
      trainingDate: row.training_date ? new Date(row.training_date).toISOString().slice(0, 10) : '',
      expiryDate: row.expiry_date ? new Date(row.expiry_date).toISOString().slice(0, 10) : '',
      trainingType: row.training_type,
      expiryStatus: row.expiry_status,
    };
    if (row.expiry_status === 'expiring') expiring.push(item);
    else if (row.expiry_status === 'expired') expired.push(item);
    else if (row.expiry_status === 'missing') missing.push(item);
  });

  return {
    __t: 'json',
    payload: {
      expiring,
      expired,
      missing,
      summary: {
        expiringCount: expiring.length,
        expiredCount: expired.length,
        missingCount: missing.length,
        total: expiring.length + expired.length + missing.length,
      },
      note: '接口能力已完成，定时调度 Sprint6 实现',
    },
    message: '查询成功',
  };
}

// ========== GET /reminders/new-employee — 新员工培训自动识别 ==========
async function getNewEmployeeReminders() {
  if (!isConnected()) {
    return {
      __t: 'json',
      payload: { incomplete: [], summary: { totalCount: 0, incompleteCount: 0 } },
      message: '查询成功(内存模式)',
    };
  }

  await ensureTables();

  // 1. 查询新员工培训要求（基于培训名称包含"新员工"或 plan_type='new_employee'）
  const requirementsResult = await pool.query(`
    SELECT id, position_id, position_name, training_name, duration_minutes
    FROM training_requirements
    WHERE is_deleted = false AND (training_name ILIKE '%新员工%' OR training_name ILIKE '%入职%')
  `);

  // 2. 查询所有新员工（入职日期在近90天内且 assignment_status='active'）
  let newEmployees = [];
  try {
    const empResult = await pool.query(`
      SELECT ev.employee_id, ev.name, ev.employee_code, ev.position_name, ev.org_name,
             ev.start_date AS hire_date, ev.assignment_status
      FROM v_employee_current ev
      WHERE ev.assignment_status = 'active'
        AND ev.start_date IS NOT NULL
        AND ev.start_date >= CURRENT_DATE - INTERVAL '90 days'
      ORDER BY ev.start_date DESC
    `);
    newEmployees = empResult.rows;
  } catch (e) {
    // 降级: 无视图时返回空
    newEmployees = [];
  }

  // 3. 对每个新员工，检查是否有对应的培训记录
  const incomplete = [];
  for (const emp of newEmployees) {
    const recordResult = await pool.query(`
      SELECT id, training_type, result, training_date
      FROM training_records
      WHERE employee_id = $1 AND is_deleted = false
        AND (training_type ILIKE '%新员工%' OR training_type = '新员工')
      ORDER BY training_date DESC LIMIT 1
    `, [emp.employee_id]);

    if (recordResult.rows.length === 0 || recordResult.rows[0].result !== '合格') {
      incomplete.push({
        employeeId: emp.employee_id,
        name: emp.name,
        employeeCode: emp.employee_code,
        positionName: emp.position_name,
        orgName: emp.org_name,
        hireDate: emp.hire_date ? new Date(emp.hire_date).toISOString().slice(0, 10) : '',
        daysSinceHire: emp.hire_date
          ? Math.floor((new Date() - new Date(emp.hire_date)) / (1000 * 60 * 60 * 24))
          : 0,
        lastTrainingDate: recordResult.rows.length > 0 && recordResult.rows[0].training_date
          ? new Date(recordResult.rows[0].training_date).toISOString().slice(0, 10)
          : '',
        lastTrainingResult: recordResult.rows.length > 0 ? recordResult.rows[0].result : '',
        status: recordResult.rows.length === 0 ? '未培训' : '未合格',
      });
    }
  }

  return {
    __t: 'json',
    payload: {
      incomplete,
      requirements: requirementsResult.rows.map(camelKeys),
      summary: {
        totalCount: newEmployees.length,
        incompleteCount: incomplete.length,
        completedCount: newEmployees.length - incomplete.length,
      },
    },
    message: '查询成功',
  };
}

// ========== GET /analysis/enhanced — 培训分析增强 ==========
async function getAnalysisEnhanced() {
  if (!isConnected()) {
    return {
      __t: 'json',
      payload: {
        highRiskPosition: { total: 0, completed: 0, rate: 0 },
        driver: { total: 0, completed: 0, rate: 0 },
        newEmployee: { total: 0, completed: 0, rate: 0 },
      },
      message: '查询成功(内存模式)',
    };
  }

  await ensureTables();

  // 高风险岗位定义: 岗位名称包含以下关键词
  const highRiskKeywords = ['司机', '电工', '焊工', '锅炉', '起重', '叉车', '特种', '危化'];
  // 构建SQL LIKE 条件
  const highRiskCondition = highRiskKeywords.map((_, i) => `position_name ILIKE $${i + 1}`).join(' OR ');
  const highRiskParams = highRiskKeywords.map(k => `%${k}%`);

  // 1. 高风险岗位培训完成率
  let highRiskPosition = { total: 0, completed: 0, rate: 0 };
  try {
    const hrResult = await pool.query(`
      WITH hr_employees AS (
        SELECT DISTINCT employee_id, name, position_name
        FROM v_employee_current
        WHERE assignment_status = 'active' AND (${highRiskCondition})
      ),
      hr_trained AS (
        SELECT DISTINCT h.employee_id
        FROM hr_employees h
        JOIN training_records t ON t.employee_id = h.employee_id
          AND t.is_deleted = false AND t.result = '合格'
      )
      SELECT
        (SELECT COUNT(*) FROM hr_employees)::int AS total,
        (SELECT COUNT(*) FROM hr_trained)::int AS completed
    `, highRiskParams);
    if (hrResult.rows.length > 0) {
      const total = parseInt(hrResult.rows[0].total) || 0;
      const completed = parseInt(hrResult.rows[0].completed) || 0;
      highRiskPosition = { total, completed, rate: total > 0 ? Math.round((completed / total) * 1000) / 10 : 0 };
    }
  } catch (e) { /* 视图不存在时降级 */ }

  // 2. 驾驶员培训完成率
  let driver = { total: 0, completed: 0, rate: 0 };
  try {
    const driverResult = await pool.query(`
      WITH driver_employees AS (
        SELECT DISTINCT employee_id, name
        FROM v_employee_current
        WHERE assignment_status = 'active' AND is_driver = true
      ),
      driver_trained AS (
        SELECT DISTINCT d.employee_id
        FROM driver_employees d
        JOIN training_records t ON t.employee_id = d.employee_id
          AND t.is_deleted = false AND t.result = '合格'
          AND (t.training_type ILIKE '%驾驶员%' OR t.training_type ILIKE '%驾驶%')
      )
      SELECT
        (SELECT COUNT(*) FROM driver_employees)::int AS total,
        (SELECT COUNT(*) FROM driver_trained)::int AS completed
    `);
    if (driverResult.rows.length > 0) {
      const total = parseInt(driverResult.rows[0].total) || 0;
      const completed = parseInt(driverResult.rows[0].completed) || 0;
      driver = { total, completed, rate: total > 0 ? Math.round((completed / total) * 1000) / 10 : 0 };
    }
  } catch (e) { /* 降级 */ }

  // 3. 新员工培训完成率（入职90天内的新员工）
  let newEmployee = { total: 0, completed: 0, rate: 0 };
  try {
    const newEmpResult = await pool.query(`
      WITH new_employees AS (
        SELECT DISTINCT employee_id, name, start_date AS hire_date
        FROM v_employee_current
        WHERE assignment_status = 'active'
          AND start_date IS NOT NULL
          AND start_date >= CURRENT_DATE - INTERVAL '90 days'
      ),
      new_trained AS (
        SELECT DISTINCT n.employee_id
        FROM new_employees n
        JOIN training_records t ON t.employee_id = n.employee_id
          AND t.is_deleted = false AND t.result = '合格'
          AND (t.training_type ILIKE '%新员工%' OR t.training_type = '新员工')
      )
      SELECT
        (SELECT COUNT(*) FROM new_employees)::int AS total,
        (SELECT COUNT(*) FROM new_trained)::int AS completed
    `);
    if (newEmpResult.rows.length > 0) {
      const total = parseInt(newEmpResult.rows[0].total) || 0;
      const completed = parseInt(newEmpResult.rows[0].completed) || 0;
      newEmployee = { total, completed, rate: total > 0 ? Math.round((completed / total) * 1000) / 10 : 0 };
    }
  } catch (e) { /* 降级 */ }

  return {
    __t: 'json',
    payload: {
      highRiskPosition,
      driver,
      newEmployee,
      summary: {
        overallRate: (highRiskPosition.total + driver.total + newEmployee.total) > 0
          ? Math.round(
              ((highRiskPosition.completed + driver.completed + newEmployee.completed) /
               (highRiskPosition.total + driver.total + newEmployee.total)) * 1000
            ) / 10
          : 0,
      },
    },
    message: '查询成功',
  };
}

module.exports = {
  getExpiryReminders,
  getNewEmployeeReminders,
  getAnalysisEnhanced,
};