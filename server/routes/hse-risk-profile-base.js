/**
 * Sprint6.1-A 员工风险画像基础框架 API
 *
 * 路由前缀: /api/hse/risk-profile/employee
 *
 * 接口：
 *   GET /:employeeId  - 查询员工基础画像
 *
 * 返回结构：
 *   {
 *     employee: { id, employee_code, name, gender, phone },
 *     organization: { id, org_name, org_type, org_code, org_path },
 *     operationUnit: { id, unit_name, unit_type, unit_code },
 *     position: { id, name, alias },
 *     responsibility: { responsibility_type, grid_level, grid_role, inspection_frequency }
 *   }
 *
 * 说明：
 *   1. 本接口仅返回员工基础画像和责任信息，不包含风险评分计算
 *   2. 责任展示规则：
 *      - grid_leader: 显示 grid_level, grid_role, inspection_frequency
 *      - production_manager: 只显示 responsibility_type = 'production_manager'，不显示 grid_level
 *      - none: 返回 null
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');

// ============================================================
// GET /api/hse/risk-profile/employee/:employeeId
// ============================================================
router.get('/:employeeId', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const id = parseInt(employeeId, 10);

    if (!Number.isFinite(id)) {
      return res.status(400).json({ code: 1, message: 'employeeId 参数错误' });
    }

    // 1. 查询员工基础信息
    const employeeResult = await pool.query(
      `SELECT id, employee_code, name, gender, phone, id_card, birth_date, person_type
       FROM employee
       WHERE id = $1 AND is_deleted = false`,
      [id]
    );

    if (employeeResult.rows.length === 0) {
      return res.status(404).json({ code: 1, message: '员工不存在' });
    }

    const employee = employeeResult.rows[0];

    // 2. 查询当前组织、作业单元、岗位关系
    const relationResult = await pool.query(
      `SELECT er.id, er.org_unit_id, er.operation_unit_id, er.position_id,
              o.org_name, o.org_type, o.org_code, o.org_path, o.status as org_status,
              ou.unit_name, ou.unit_type, ou.unit_code,
              p.name as position_name,
              pa.alias_name as position_alias
       FROM employee_assignment er
       LEFT JOIN hse_org_unit o ON o.id = er.org_unit_id AND o.is_deleted = false
       LEFT JOIN hse_operation_unit ou ON ou.id = er.operation_unit_id AND ou.is_deleted = false
       LEFT JOIN position p ON p.id = er.position_id AND p.is_deleted = false
       LEFT JOIN hse_position_alias pa ON pa.position_id = p.id AND pa.is_deleted = false AND pa.status = 'active'
       WHERE er.employee_id = $1
         AND er.is_current = true
         AND er.is_deleted = false
       ORDER BY er.is_primary DESC, er.id DESC
       LIMIT 1`,
      [id]
    );

    const relation = relationResult.rows[0] || null;

    // 3. 查询责任信息
    const responsibilityResult = await pool.query(
      `SELECT responsibility_type, grid_level, grid_role, inspection_frequency,
              standard_position, position_alias, responsible_org, start_date
       FROM hse_responsibility
       WHERE employee_id = $1 AND is_deleted = false AND status = 'active'
       ORDER BY created_at DESC
       LIMIT 1`,
      [id]
    );

    const resp = responsibilityResult.rows[0] || null;

    // 4. 构造责任展示对象
    let responsibility = null;
    if (resp) {
      if (resp.responsibility_type === 'grid_leader') {
        responsibility = {
          responsibility_type: resp.responsibility_type,
          grid_level: resp.grid_level,
          grid_role: resp.grid_role,
          inspection_frequency: resp.inspection_frequency
        };
      } else if (resp.responsibility_type === 'production_manager') {
        responsibility = {
          responsibility_type: resp.responsibility_type
          // 明确不返回 grid_level / grid_role / inspection_frequency
        };
      }
      // responsibility_type === 'none' 时返回 null
    }

    // 5. 组装响应
    const data = {
      employee: {
        id: employee.id,
        employee_code: employee.employee_code,
        name: employee.name,
        gender: employee.gender,
        phone: employee.phone,
        id_card: employee.id_card,
        birth_date: employee.birth_date,
        person_type: employee.person_type
      },
      organization: relation ? {
        id: relation.org_unit_id,
        org_name: relation.org_name,
        org_type: relation.org_type,
        org_code: relation.org_code,
        org_path: relation.org_path,
        status: relation.org_status
      } : null,
      operationUnit: relation ? {
        id: relation.operation_unit_id,
        unit_name: relation.unit_name,
        unit_type: relation.unit_type,
        unit_code: relation.unit_code
      } : null,
      position: relation ? {
        id: relation.position_id,
        name: relation.position_name,
        alias: relation.position_alias
      } : null,
      responsibility
    };

    res.json({ code: 0, data });
  } catch (e) {
    console.error('Risk profile base error:', e);
    res.status(500).json({ code: 1, message: e.message });
  }
});

// ============================================================
// GET /api/hse/risk-profile/employee/:employeeId/risks
// 风险事实数据接口（Sprint6.1-C）
// 返回：violationRisk, incidentRisk, trainingRisk
// ============================================================
router.get('/:employeeId/risks', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const id = parseInt(employeeId, 10);

    if (!Number.isFinite(id)) {
      return res.status(400).json({ code: 1, message: 'employeeId 参数错误' });
    }

    const employeeResult = await pool.query(
      'SELECT id, name FROM employee WHERE id = $1 AND is_deleted = false',
      [id]
    );

    if (employeeResult.rows.length === 0) {
      return res.status(404).json({ code: 1, message: '员工不存在' });
    }

    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    const twelveMonthsAgoStr = twelveMonthsAgo.toISOString().split('T')[0];

    // 1. 三违风险数据（统一使用employee_id关联，violation_records.violator_id = employee.id）
    const violationResult = await pool.query(
      `SELECT id, violation_type, violation_level, risk_level,
              description, violation_date, status, punishment_type, punishment_amount
       FROM violation_records
       WHERE violator_id = $1
         AND is_deleted = false
         AND violation_date >= $2
       ORDER BY violation_date DESC`,
      [id, twelveMonthsAgoStr]
    );

    const violations = violationResult.rows.map(row => ({
      id: row.id,
      violationType: row.violation_type,
      violationLevel: row.violation_level,
      riskLevel: row.risk_level,
      description: row.description,
      violationDate: row.violation_date,
      status: row.status,
      punishmentType: row.punishment_type,
      punishmentAmount: row.punishment_amount
    }));

    // 三违类型统计
    const violationTypeStats = {};
    violations.forEach(v => {
      violationTypeStats[v.violationType] = (violationTypeStats[v.violationType] || 0) + 1;
    });

    const violationRisk = {
      hasRecords: violations.length > 0,
      count12m: violations.length,
      types: violationTypeStats,
      records: violations.slice(0, 20),
      latestDate: violations.length > 0 ? violations[0].violationDate : null,
      pendingCount: violations.filter(v => v.status === '待处理' || v.status === '整改中').length
    };

    // 2. 事故风险数据（统一使用hse_incident_records表，employee_id关联）
    const incidentResult = await pool.query(
      `SELECT id, accident_type, level, description,
              accident_date, status, responsibility, responsibility_level,
              involved_person, location, loss_amount, casualties, injuries
       FROM hse_incident_records
       WHERE employee_id = $1
         AND is_deleted = false
       ORDER BY accident_date DESC`,
      [id]
    );

    const incidents = incidentResult.rows.map(row => ({
      id: row.id,
      accidentType: row.accident_type,
      level: row.level,
      description: row.description,
      accidentDate: row.accident_date,
      status: row.status,
      responsibility: row.responsibility,
      responsibilityLevel: row.responsibility_level,
      involvedPerson: row.involved_person,
      location: row.location,
      lossAmount: row.loss_amount,
      casualties: row.casualties,
      injuries: row.injuries
    }));

    const incidentTypeStats = {};
    incidents.forEach(i => {
      incidentTypeStats[i.accidentType] = (incidentTypeStats[i.accidentType] || 0) + 1;
    });

    const responsibilityCount = incidents.filter(i => i.responsibility && i.responsibility !== '').length;

    const incidentRisk = {
      hasRecords: incidents.length > 0,
      totalCount: incidents.length,
      responsibilityCount,
      types: incidentTypeStats,
      records: incidents.slice(0, 20),
      latestDate: incidents.length > 0 ? incidents[0].accidentDate : null
    };

    // 3. 培训合规风险数据（统一使用employee_id关联，training_records.personnel_id = employee.id）
    const trainingResult = await pool.query(
      `SELECT id, training_type, training_date, duration_minutes,
              content, result, score, trainer, remark, name, dept, position
       FROM training_records
       WHERE personnel_id = $1
         AND is_deleted = false
       ORDER BY training_date DESC`,
      [id]
    );

    const trainings = trainingResult.rows.map(row => ({
      id: row.id,
      trainingType: row.training_type,
      trainingDate: row.training_date,
      durationMinutes: row.duration_minutes,
      content: row.content,
      result: row.result,
      score: row.score,
      trainer: row.trainer,
      remark: row.remark,
      employeeName: row.name,
      dept: row.dept,
      position: row.position
    }));

    const completedCount = trainings.filter(t => t.result === '合格').length;
    const pendingCount = trainings.filter(t => t.result !== '合格' && t.result !== '').length;
    const expiredCount = 0;

    const trainingComplianceRisk = {
      hasRecords: trainings.length > 0,
      totalCount: trainings.length,
      completedCount,
      pendingCount,
      expiredCount,
      records: trainings.slice(0, 20),
      latestDate: trainings.length > 0 ? trainings[0].trainingDate : null
    };

    const data = {
      violationRisk,
      incidentRisk,
      trainingComplianceRisk
    };

    res.json({ code: 0, data });
  } catch (e) {
    console.error('Risk profile risks error:', e);
    res.status(500).json({ code: 1, message: e.message });
  }
});

module.exports = router;
