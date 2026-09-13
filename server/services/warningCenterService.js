/**
 * 智能预警与整改闭环中心（/api/hse/warning-center）—— 业务层
 * 原 routes/hse-warning-center.js（2138 行）全部业务 + SQL + 扫描/升级看护 + cron 定时收敛于此。
 * 每个 HTTP 端点对应一个 service 函数，返回统一描述符（__t:'json'），由 controllers/warningCenterController.js 的 respond() 统一
 * 解释为对外 JSON 契约，行为与原路由逐字节一致。
 *
 * 描述符语义：
 *  - 成功：{ __t:'json', payload, message }
 *  - 业务错误：{ __t:'json', error:{code,message} }（code<0 为业务码，200 JSON）
 *  - 连接失败/内部异常：{ __t:'json', error:{code,message}, httpStatus }（httpStatus 存在时 controller 设对应 HTTP 状态码，
 *    原实现 catch 分支为 res.status(500).json(error(-1, e.message))，故此处异常统一带 httpStatus:500）
 *
 * 本层还承载三个「非 HTTP」的定时看护职责（与原文件一致，模块加载即注册 timer，测试 NODE_ENV=test 不启动）：
 *  - scanByRule / createWarningRecord：预警扫描与去重落库
 *  - scanWarningsScheduled：每日 2:00 全量扫描
 *  - checkEscalationScheduled + sendEscalationNotificationChain：每小时升级检查 + Sprint7-C 多级通知链
 *
 * 约束：禁止修改风险模型/考核模型 v1.1/岗位权重；所有规则版本化管理。
 */

const cron = require('node-cron');
const { pool, isConnected } = require('../config/db');
const { createNotification } = require('./notificationService');

// ============================================================
// 常量映射（原文件顶层常量，逐字保留）
// ============================================================

const WARNING_LEVEL_MAP = {
  'critical': { label: '重大', color: 'red', priority: 'urgent' },
  'major': { label: '较大', color: 'orange', priority: 'high' },
  'minor': { label: '一般', color: 'gold', priority: 'normal' },
  'info': { label: '提示', color: 'blue', priority: 'low' },
};

const SOURCE_TYPE_MAP = {
  'employee_risk': '员工风险',
  'driver_risk': '驾驶风险',
  'accident': '事故中心',
  'assessment': '考核中心',
  'management': '管理履职',
};

const TASK_STATUS_MAP = {
  'pending': { label: '待下发', color: 'default' },
  'dispatched': { label: '已下发', color: 'blue' },
  'processing': { label: '处理中', color: 'processing' },
  'pending_review': { label: '待复核', color: 'warning' },
  'closed': { label: '已关闭', color: 'success' },
  'rejected': { label: '已驳回', color: 'error' },
};

/** v1.1 预警升级机制：重大(critical) 24h 未处理→升级提醒；较大(major) 48h 未处理→升级为重大 */
const ESCALATION_RULES = {
  'critical': { hours: 24, escalateTo: 'critical' },
  'major': { hours: 48, escalateTo: 'critical' },
};

// ============================================================
// 描述符快捷构造
// ============================================================
const ok = (payload, message) => ({ __t: 'json', payload, message });
const err = (code, message, httpStatus) => ({ __t: 'json', error: { code, message }, ...(httpStatus ? { httpStatus } : {}) });
const dbDown = () => err(-1, '数据库未连接');

/** 统一包裹：异常 → {error:{code:-1,message:e.message}, httpStatus:500}（等价原 catch 的 res.status(500).json(error(-1,e.message))） */
async function W(fn) {
  try {
    return await fn();
  } catch (e) {
    return err(-1, e.message, 500);
  }
}

// ============================================================
// 辅助函数（原文件顶层，模块私有）
// ============================================================

function generateCode(prefix) {
  const d = new Date();
  const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const random = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  return `${prefix}-${dateStr}-${random}`;
}

function camelKeys(obj) {
  if (!obj) return obj;
  const result = {};
  for (const key of Object.keys(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    result[camelKey] = obj[key];
  }
  return result;
}

// ============================================================
// 预警扫描与创建（共享业务，供端点与定时任务复用）
// ============================================================

async function scanByRule(rule) {
  let count = 0;

  switch (rule.source_type) {
    case 'employee_risk': {
      if (rule.rule_code === 'WR-EMP-001') {
        const rows = await pool.query(`
          SELECT s.employee_id, e.name as employee_name, e.department_id,
                 d.name as dept_name, s.total_score, s.risk_level, s.risk_level_code,
                 p.name as position_name
          FROM hse_employee_risk_snapshot s
          JOIN employee e ON s.employee_id = e.id AND e.is_deleted = false
          LEFT JOIN department d ON e.department_id = d.id
          LEFT JOIN employee_assignment ea ON ea.employee_id = e.id AND ea.is_deleted = false AND ea.end_date IS NULL
          LEFT JOIN position p ON ea.position_id = p.id
          WHERE s.is_deleted = false
            AND s.snapshot_date = (SELECT MAX(snapshot_date) FROM hse_employee_risk_snapshot WHERE employee_id = s.employee_id AND is_deleted = false)
            AND (s.risk_level IN ('重大', 'critical') OR s.risk_level_code IN ('critical', 'major'))
          LIMIT 50
        `);
        for (const row of rows.rows) {
          count += await createWarningRecord(rule, {
            targetType: 'employee', targetId: row.employee_id, targetName: row.employee_name,
            orgId: row.department_id, orgName: row.dept_name,
            riskReason: `员工风险等级为重大，风险分：${row.total_score}`,
            riskData: { score: row.total_score, riskLevel: row.risk_level, position: row.position_name },
          });
        }
      } else if (rule.rule_code === 'WR-EMP-002') {
        const rows = await pool.query(`
          SELECT s1.employee_id, e.name as employee_name, e.department_id,
                 d.name as dept_name, s1.total_score as current_score, s2.total_score as prev_score
          FROM hse_employee_risk_snapshot s1
          JOIN hse_employee_risk_snapshot s2 ON s1.employee_id = s2.employee_id AND s2.is_deleted = false
          JOIN employee e ON s1.employee_id = e.id AND e.is_deleted = false
          LEFT JOIN department d ON e.department_id = d.id
          WHERE s1.is_deleted = false
            AND s1.snapshot_date = (SELECT MAX(snapshot_date) FROM hse_employee_risk_snapshot WHERE is_deleted = false)
            AND s2.snapshot_date = (SELECT MAX(snapshot_date) FROM hse_employee_risk_snapshot WHERE snapshot_date < s1.snapshot_date AND is_deleted = false)
            AND (s1.total_score - s2.total_score) >= 10
          LIMIT 50
        `);
        for (const row of rows.rows) {
          count += await createWarningRecord(rule, {
            targetType: 'employee', targetId: row.employee_id, targetName: row.employee_name,
            orgId: row.department_id, orgName: row.dept_name,
            riskReason: `风险分持续上升，上月${row.prev_score}→本月${row.current_score}，上升${row.current_score - row.prev_score}分`,
            riskData: { currentScore: row.current_score, prevScore: row.prev_score, delta: row.current_score - row.prev_score },
          });
        }
      }
      break;
    }

    case 'driver_risk': {
      if (rule.rule_code === 'WR-DRV-001') {
        const rows = await pool.query(`
          SELECT ldr.employee_id, ldr.employee_name, e.department_id, d.name as dept_name,
                 SUM(ldr.demerit_points) as total_points
          FROM license_demerit_records ldr
          JOIN employee e ON ldr.employee_id = e.id AND e.is_deleted = false
          LEFT JOIN department d ON e.department_id = d.id
          WHERE ldr.is_deleted = false
            AND ldr.demerit_date >= NOW() - INTERVAL '5 years'
          GROUP BY ldr.employee_id, ldr.employee_name, e.department_id, d.name
          HAVING SUM(ldr.demerit_points) >= 6
          LIMIT 50
        `);
        for (const row of rows.rows) {
          count += await createWarningRecord(rule, {
            targetType: 'employee', targetId: row.employee_id, targetName: row.employee_name,
            orgId: row.department_id, orgName: row.dept_name,
            riskReason: `近5年驾驶证累计扣分${row.total_points}分，超过6分阈值（v1.1修订）`,
            riskData: { totalPoints: parseInt(row.total_points), period: '5years' },
          });
        }
      } else if (rule.rule_code === 'WR-DRV-002') {
        const rows = await pool.query(`
          SELECT a.personnel_id as employee_id, e.name as employee_name,
                 e.department_id, d.name as dept_name,
                 a.title, a.level, a.accident_date
          FROM accidents a
          JOIN employee e ON a.personnel_id = e.id AND e.is_deleted = false
          LEFT JOIN department d ON e.department_id = d.id
          WHERE a.is_deleted = false
            AND a.accident_date >= NOW() - INTERVAL '6 months'
            AND a.personnel_id IS NOT NULL
          LIMIT 50
        `);
        for (const row of rows.rows) {
          count += await createWarningRecord(rule, {
            targetType: 'employee', targetId: row.employee_id, targetName: row.employee_name,
            orgId: row.department_id, orgName: row.dept_name,
            riskReason: `发生交通事故（${row.title}），等级：${row.level}，日期：${row.accident_date}`,
            riskData: { accidentTitle: row.title, accidentLevel: row.level, accidentDate: row.accident_date },
          });
        }
      }
      break;
    }

    case 'accident': {
      if (rule.rule_code === 'WR-ACC-001') {
        const rows = await pool.query(`
          SELECT a.id, a.title, a.level, a.accident_date, a.personnel_id,
                 e.name as personnel_name, e.department_id, d.name as dept_name
          FROM accidents a
          LEFT JOIN employee e ON a.personnel_id = e.id
          LEFT JOIN department d ON e.department_id = d.id
          WHERE a.is_deleted = false
            AND a.level IN ('重大', '特别重大')
            AND a.accident_date >= NOW() - INTERVAL '6 months'
          LIMIT 50
        `);
        for (const row of rows.rows) {
          count += await createWarningRecord(rule, {
            targetType: 'organization', targetId: row.department_id, targetName: row.dept_name || '未知组织',
            orgId: row.department_id, orgName: row.dept_name || '未知组织',
            riskReason: `发生${row.level}事故：${row.title}，日期：${row.accident_date}`,
            riskData: { accidentId: row.id, accidentTitle: row.title, accidentLevel: row.level, accidentDate: row.accident_date },
          });
        }
      } else if (rule.rule_code === 'WR-ACC-002') {
        const rows = await pool.query(`
          SELECT e.department_id, d.name as dept_name,
                 COUNT(*) as accident_count,
                 array_agg(a.title) as accident_titles,
                 array_agg(a.accident_date) as accident_dates
          FROM accidents a
          JOIN employee e ON a.personnel_id = e.id AND e.is_deleted = false
          LEFT JOIN department d ON e.department_id = d.id
          WHERE a.is_deleted = false
            AND a.accident_date >= NOW() - INTERVAL '6 months'
          GROUP BY e.department_id, d.name
          HAVING COUNT(*) >= 2
          LIMIT 50
        `);
        for (const row of rows.rows) {
          count += await createWarningRecord(rule, {
            targetType: 'organization', targetId: row.department_id, targetName: row.dept_name || '未知组织',
            orgId: row.department_id, orgName: row.dept_name || '未知组织',
            riskReason: `6个月内发生${row.accident_count}次事故，存在重复事故风险`,
            riskData: { accidentCount: parseInt(row.accident_count), titles: row.accident_titles, dates: row.accident_dates },
          });
        }
      }
      break;
    }

    case 'assessment': {
      if (rule.rule_code === 'WR-ASM-001') {
        const rows = await pool.query(`
          WITH org_stats AS (
            SELECT
              o.id as org_id, o.org_name, o.org_type,
              (SELECT COUNT(*) FROM accidents a
               JOIN employee e ON a.personnel_id::bigint = e.id
               JOIN employee_assignment ea ON ea.employee_id = e.id AND ea.is_current = true AND ea.is_deleted = false
               WHERE ea.org_unit_id = o.id AND a.is_deleted = false
                 AND a.accident_date >= NOW() - INTERVAL '6 months') as accident_count,
              (SELECT COUNT(*) FROM violation_records vr
               JOIN employee e ON vr.violator_id = e.id
               JOIN employee_assignment ea ON ea.employee_id = e.id AND ea.is_current = true AND ea.is_deleted = false
               WHERE ea.org_unit_id = o.id AND vr.is_deleted = false
                 AND vr.violation_date >= NOW() - INTERVAL '6 months') as violation_count,
              (SELECT 
                 CASE WHEN COUNT(*) = 0 THEN 100
                      ELSE ROUND(COUNT(*) FILTER (WHERE rt.status IN ('completed', 'closed'))::numeric / COUNT(*) * 100, 1)
                 END
               FROM rectification_task rt
               JOIN employee e ON rt.assignee_id = e.id
               JOIN employee_assignment ea ON ea.employee_id = e.id AND ea.is_current = true AND ea.is_deleted = false
               WHERE ea.org_unit_id = o.id AND rt.is_deleted = false
                 AND rt.created_at >= NOW() - INTERVAL '6 months') as rectification_rate,
              (SELECT COUNT(*) FROM hse_employee_risk_snapshot hrs
               JOIN employee_assignment ea ON ea.employee_id = hrs.employee_id AND ea.is_current = true AND ea.is_deleted = false
               WHERE ea.org_unit_id = o.id AND hrs.is_deleted = false
                 AND hrs.snapshot_date = (SELECT MAX(snapshot_date) FROM hse_employee_risk_snapshot WHERE is_deleted = false)
                 AND (hrs.risk_level IN ('重大', 'critical') OR hrs.risk_level_code IN ('critical', 'major'))) as high_risk_count
            FROM hse_org_unit o
            WHERE o.is_deleted = false AND o.org_type IN ('department', 'center', 'township')
          )
          SELECT
            org_id, org_name, org_type,
            accident_count, violation_count, rectification_rate, high_risk_count,
            ROUND(
              100
              - (LEAST(accident_count * 15, 30))
              - (LEAST(violation_count * 2, 20))
              - ((100 - rectification_rate) * 0.3)
              - (LEAST(high_risk_count * 5, 20)),
              1
            ) as current_score
          FROM org_stats
          LIMIT 50
        `);
        for (const row of rows.rows) {
          const currentScore = parseFloat(row.current_score) || 0;
          if (currentScore < 70) {
            count += await createWarningRecord(rule, {
              targetType: 'organization', targetId: row.org_id, targetName: row.org_name,
              orgId: row.org_id, orgName: row.org_name,
              riskReason: `组织综合安全评分${currentScore}分，低于70分预警线，存在安全管理下滑风险`,
              riskData: {
                currentScore,
                accidentCount: parseInt(row.accident_count),
                violationCount: parseInt(row.violation_count),
                rectificationRate: parseFloat(row.rectification_rate),
                highRiskCount: parseInt(row.high_risk_count),
              },
            });
          }
        }
      } else if (rule.rule_code === 'WR-ASM-002') {
        const rows = await pool.query(`
          SELECT ou.id as org_id, ou.org_name, ou.org_type,
                 (SELECT COUNT(*) FROM accidents a
                  JOIN employee e ON a.personnel_id = e.id
                  WHERE e.department_id = ou.id AND a.is_deleted = false
                    AND a.level IN ('重大', '特别重大')
                    AND a.accident_date >= NOW() - INTERVAL '12 months') as major_accidents
          FROM hse_org_unit ou
          WHERE ou.is_deleted = false AND ou.org_type IN ('department', 'center', 'township')
          LIMIT 50
        `);
        for (const row of rows.rows) {
          const majorAcc = parseInt(row.major_accidents) || 0;
          if (majorAcc > 0) {
            count += await createWarningRecord(rule, {
              targetType: 'organization', targetId: row.org_id, targetName: row.org_name,
              orgId: row.org_id, orgName: row.org_name,
              riskReason: `组织有重大事故${majorAcc}起，安全状态为红区`,
              riskData: { majorAccidents: majorAcc, orgType: row.org_type },
            });
          }
        }
      }
      break;
    }

    case 'management': {
      if (rule.rule_code === 'WR-MGT-001') {
        const rows = await pool.query(`
          SELECT
            r.employee_id, e.name as employee_name,
            r.grid_level, r.grid_role, r.responsible_area,
            r.inspection_frequency,
            r.responsible_org_id, o.org_name,
            COUNT(h.id) as actual_inspection_count
          FROM hse_responsibility r
          JOIN employee e ON r.employee_id = e.id AND e.is_deleted = false
          LEFT JOIN hse_org_unit o ON r.responsible_org_id = o.id
          LEFT JOIN hazard_record h ON h.inspector_id = r.employee_id
            AND h.is_deleted = false
            AND h.check_date >= NOW() - INTERVAL '1 month'
          WHERE r.is_deleted = false
            AND r.status = 'active'
            AND r.grid_role LIKE '%网格长%'
          GROUP BY r.employee_id, e.name, r.grid_level, r.grid_role,
                   r.responsible_area, r.inspection_frequency,
                   r.responsible_org_id, o.org_name
          HAVING COUNT(h.id) < COALESCE(NULLIF(r.inspection_frequency, ''), '4')::int
          LIMIT 50
        `);
        for (const row of rows.rows) {
          const required = parseInt(row.inspection_frequency) || 4;
          const actual = parseInt(row.actual_inspection_count) || 0;
          count += await createWarningRecord(rule, {
            targetType: 'organization', targetId: row.responsible_org_id, targetName: row.org_name || '未知组织',
            orgId: row.responsible_org_id, orgName: row.org_name || '未知组织',
            riskReason: `网格长${row.employee_name}巡查不足：本月实际${actual}次，要求${required}次，完成率${Math.round(actual / required * 100)}%`,
            riskData: {
              employeeId: row.employee_id,
              employeeName: row.employee_name,
              gridLevel: row.grid_level,
              gridRole: row.grid_role,
              responsibleArea: row.responsible_area,
              requiredCount: required,
              actualCount: actual,
              completionRate: Math.round(actual / required * 100),
            },
          });
        }
      } else if (rule.rule_code === 'WR-MGT-002') {
        const rows = await pool.query(`
          SELECT rt.id, rt.task_title, rt.responsible_id,
                 e.name as responsible_name, e.department_id, d.name as dept_name,
                 rt.deadline_date, rt.status, rt.priority
          FROM rectification_task rt
          LEFT JOIN employee e ON rt.responsible_id = e.id
          LEFT JOIN department d ON e.department_id = d.id
          WHERE rt.is_deleted = false
            AND rt.status NOT IN ('completed', 'cancelled')
            AND rt.deadline_date < CURRENT_DATE
          LIMIT 50
        `);
        for (const row of rows.rows) {
          count += await createWarningRecord(rule, {
            targetType: 'organization', targetId: row.department_id, targetName: row.dept_name || '未知组织',
            orgId: row.department_id, orgName: row.dept_name || '未知组织',
            riskReason: `整改任务逾期：${row.task_title}，截止日期：${row.deadline_date}`,
            riskData: { taskId: row.id, taskTitle: row.task_title, deadlineDate: row.deadline_date, priority: row.priority },
          });
        }
      }
      break;
    }
  }

  return count;
}

async function createWarningRecord(rule, data) {
  try {
    const existing = await pool.query(
      `SELECT id FROM hse_warning_record
       WHERE rule_id = $1 AND target_id = $2 AND target_type = $3
         AND created_at >= NOW() - INTERVAL '24 hours' AND is_deleted = false
       LIMIT 1`,
      [rule.id, data.targetId, data.targetType]
    );
    if (existing.rows.length > 0) return 0;

    const warningCode = generateCode('WN');
    const result = await pool.query(
      `INSERT INTO hse_warning_record
        (warning_code, rule_id, rule_name, rule_version, source_type, warning_level,
         target_type, target_id, target_name, org_id, org_name, risk_reason, risk_data, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'pending')
       RETURNING id`,
      [warningCode, rule.id, rule.rule_name, rule.version, rule.source_type, rule.warning_level,
       data.targetType, data.targetId, data.targetName, data.orgId, data.orgName,
       data.riskReason, JSON.stringify(data.riskData || {})]
    );

    const warningId = result.rows[0].id;

    const actionConfig = typeof rule.action_config === 'string' ? JSON.parse(rule.action_config) : (rule.action_config || {});
    if (actionConfig.auto_dispatch) {
      const deadlineDays = actionConfig.deadline_days || 7;
      const taskCode = generateCode('WT');
      const deadlineDate = new Date();
      deadlineDate.setDate(deadlineDate.getDate() + deadlineDays);

      const taskResult = await pool.query(
        `INSERT INTO hse_warning_task
          (task_code, warning_id, warning_code, task_title, description,
           responsible_id, org_id, org_name, deadline_date, status, priority)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'dispatched', $10)
         RETURNING id`,
        [taskCode, warningId, warningCode,
         `${rule.rule_name} - ${data.targetName || ''}`,
         data.riskReason,
         data.targetType === 'employee' ? data.targetId : null,
         data.orgId, data.orgName, deadlineDate.toISOString().slice(0, 10),
         WARNING_LEVEL_MAP[rule.warning_level]?.priority || 'normal']
      );

      await pool.query(
        `UPDATE hse_warning_record SET rectification_task_id = $1, status = 'processing', updated_at = NOW() WHERE id = $2`,
        [taskResult.rows[0].id, warningId]
      );
    }

    return 1;
  } catch (e) {
    console.error('[warning-center] createWarningRecord error:', e);
    return 0;
  }
}

/** 每日定时预警扫描（cron 调用，非 HTTP） */
async function scanWarningsScheduled() {
  try {
    if (!isConnected()) {
      console.log('[warning-center] 数据库未连接，跳过预警扫描');
      return;
    }

    console.log('[warning-center] 开始定时预警扫描...');

    const rulesResult = await pool.query(
      `SELECT * FROM hse_warning_rule WHERE status = 'active' AND is_deleted = false ORDER BY source_type, warning_level`
    );
    const rules = rulesResult.rows;

    let totalGenerated = 0;
    for (const rule of rules) {
      const generated = await scanByRule(rule);
      totalGenerated += generated;
    }

    console.log(`[warning-center] 定时预警扫描完成，共生成 ${totalGenerated} 条预警`);
  } catch (e) {
    console.error('[warning-center] 定时预警扫描失败:', e);
  }
}

/** 每小时定时升级检查（cron 调用，非 HTTP） */
async function checkEscalationScheduled() {
  try {
    if (!isConnected()) {
      console.log('[warning-center] 数据库未连接，跳过升级检查');
      return;
    }

    console.log('[warning-center] 开始定时升级检查...');

    let totalEscalated = 0;

    for (const [level, config] of Object.entries(ESCALATION_RULES)) {
      const result = await pool.query(
        `SELECT id, warning_code, warning_level, target_name, created_at,
                EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600 as pending_hours
         FROM hse_warning_record
         WHERE is_deleted = false
           AND status IN ('pending', 'processing')
           AND warning_level = $1
           AND is_escalated = false
           AND created_at <= NOW() - INTERVAL '${config.hours} hours'`,
        [level]
      );

      for (const row of result.rows) {
        const pendingHours = Math.round(parseFloat(row.pending_hours));

        if (level === 'major') {
          await pool.query(
            `UPDATE hse_warning_record
             SET warning_level = 'critical',
                 is_escalated = true,
                 escalated_at = NOW(),
                 original_level = $1,
                 escalation_notified = true,
                 updated_at = NOW()
             WHERE id = $2`,
            [row.warning_level, row.id]
          );
        } else {
          await pool.query(
            `UPDATE hse_warning_record
             SET is_escalated = true,
                 escalated_at = NOW(),
                 original_level = $1,
                 escalation_notified = true,
                 updated_at = NOW()
             WHERE id = $2`,
            [row.warning_level, row.id]
          );
        }

        totalEscalated++;
        console.log(`[warning-center] 预警升级: ${row.warning_code} (${row.warning_level}→${config.escalateTo}), 未处理${pendingHours}小时, 对象: ${row.target_name}`);

        await sendEscalationNotificationChain(row, config, pendingHours);
      }
    }

    console.log(`[warning-center] 定时升级检查完成，共升级 ${totalEscalated} 条预警`);
  } catch (e) {
    console.error('[warning-center] 定时升级检查失败:', e);
  }
}

/** Sprint7-C: 预警升级多级通知链（责任人 → 部门经理 → 集团安全负责人） */
async function sendEscalationNotificationChain(warning, config, pendingHours) {
  const notifTitle = `预警升级通知：${warning.warning_code}`;
  const notifContent = `预警 ${warning.warning_code} 已升级（${warning.warning_level}→${config.escalateTo}），对象：${warning.target_name}，未处理${pendingHours}小时`;

  try {
    const taskResult = await pool.query(
      `SELECT responsible_id FROM hse_warning_task WHERE warning_id = $1 AND is_deleted = false LIMIT 1`,
      [warning.id]
    );
    if (taskResult.rows.length > 0 && taskResult.rows[0].responsible_id) {
      await createNotification({
        userId: taskResult.rows[0].responsible_id,
        title: notifTitle,
        content: notifContent,
        type: 'system',
        bizType: 'warning_escalation',
        bizId: String(warning.id),
      });
    }
  } catch (e) {
    console.error('[warning-center] 通知责任人失败:', e);
  }

  try {
    const orgIdResult = await pool.query(
      `SELECT org_id FROM hse_warning_record WHERE id = $1`, [warning.id]
    );
    if (orgIdResult.rows.length > 0 && orgIdResult.rows[0].org_id) {
      const managers = await pool.query(
        `SELECT u.id, u.username FROM users u
         JOIN employee_assignment ea ON u.employee_id = ea.employee_id AND ea.is_current = true AND ea.is_deleted = false
         WHERE u.role = 'department_manager' AND u.is_deleted = false AND ea.org_unit_id = $1`,
        [orgIdResult.rows[0].org_id]
      );
      for (const mgr of managers.rows) {
        await createNotification({
          userId: mgr.id,
          title: notifTitle,
          content: `【部门经理】${notifContent}`,
          type: 'system',
          bizType: 'warning_escalation',
          bizId: String(warning.id),
        });
      }
    }
  } catch (e) {
    console.error('[warning-center] 通知部门经理失败:', e);
  }

  try {
    const safetyLeads = await pool.query(
      `SELECT id, username FROM users WHERE role IN ('admin', 'safety_manager') AND is_deleted = false`
    );
    for (const lead of safetyLeads.rows) {
      await createNotification({
        userId: lead.id,
        title: notifTitle,
        content: `【集团安全负责人】${notifContent}`,
        type: 'system',
        bizType: 'warning_escalation',
        bizId: String(warning.id),
      });
    }
  } catch (e) {
    console.error('[warning-center] 通知集团安全负责人失败:', e);
  }

  console.log(`[warning-center] 升级通知链已发送: ${warning.warning_code}`);
}

// 定时任务注册（与原文件模块加载副作用一致；测试环境不启动定时器，避免 Jest open handles 泄漏）
if (process.env.NODE_ENV !== 'test') {
  cron.schedule('0 2 * * *', () => {
    console.log('[warning-center] Cron: 触发每日预警扫描任务');
    scanWarningsScheduled();
  }, {
    scheduled: true,
    timezone: 'Asia/Shanghai',
  });

  cron.schedule('0 * * * *', () => {
    console.log('[warning-center] Cron: 触发每小时升级检查任务');
    checkEscalationScheduled();
  }, {
    scheduled: true,
    timezone: 'Asia/Shanghai',
  });

  console.log('[warning-center] 定时任务已启动: 每日2点预警扫描, 每小时升级检查');
}

// ============================================================
// 模块一：风险预警中心
// ============================================================

function warnings(query) {
  return W(async () => {
    if (!isConnected()) return dbDown();

    const { source_type, warning_level, status, target_type, page = 1, pageSize = 20 } = query;
    const pageNum = Math.max(1, parseInt(page));
    const size = Math.min(100, Math.max(1, parseInt(pageSize)));
    const offset = (pageNum - 1) * size;

    const conditions = ['wr.is_deleted = false'];
    const params = [];
    let idx = 1;

    if (source_type) { conditions.push(`wr.source_type = $${idx++}`); params.push(source_type); }
    if (warning_level) { conditions.push(`wr.warning_level = $${idx++}`); params.push(warning_level); }
    if (status) { conditions.push(`wr.status = $${idx++}`); params.push(status); }
    if (target_type) { conditions.push(`wr.target_type = $${idx++}`); params.push(target_type); }

    const whereClause = conditions.join(' AND ');

    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM hse_warning_record wr WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total);

    const listResult = await pool.query(
      `SELECT wr.*,
              wt.task_code as task_code,
              wt.status as task_status
       FROM hse_warning_record wr
       LEFT JOIN hse_warning_task wt ON wr.rectification_task_id = wt.id AND wt.is_deleted = false
       WHERE ${whereClause}
       ORDER BY wr.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, size, offset]
    );

    const list = listResult.rows.map(row => {
      const item = camelKeys(row);
      item.warningLevelLabel = WARNING_LEVEL_MAP[row.warning_level]?.label || row.warning_level;
      item.warningLevelColor = WARNING_LEVEL_MAP[row.warning_level]?.color || 'default';
      item.sourceTypeLabel = SOURCE_TYPE_MAP[row.source_type] || row.source_type;
      item.statusLabel = { 'pending': '待处理', 'processing': '处理中', 'resolved': '已解决', 'closed': '已关闭', 'ignored': '已忽略' }[row.status] || row.status;
      return item;
    });

    return ok({ list, total, page: pageNum, pageSize: size });
  });
}

function warningStats() {
  return W(async () => {
    if (!isConnected()) return dbDown();

    const overallResult = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
        COUNT(*) FILTER (WHERE status = 'processing') as processing_count,
        COUNT(*) FILTER (WHERE status = 'resolved') as resolved_count,
        COUNT(*) FILTER (WHERE status = 'closed') as closed_count,
        COUNT(*) FILTER (WHERE status = 'ignored') as ignored_count,
        COUNT(*) FILTER (WHERE warning_level = 'critical') as critical_count,
        COUNT(*) FILTER (WHERE warning_level = 'major') as major_count,
        COUNT(*) FILTER (WHERE warning_level = 'minor') as minor_count,
        COUNT(*) FILTER (WHERE warning_level = 'info') as info_count,
        COUNT(*) FILTER (WHERE is_escalated = true) as escalated_count
      FROM hse_warning_record WHERE is_deleted = false
    `);

    const sourceResult = await pool.query(`
      SELECT source_type,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status IN ('pending', 'processing')) as active_count,
        COUNT(*) FILTER (WHERE status = 'closed') as closed_count
      FROM hse_warning_record WHERE is_deleted = false
      GROUP BY source_type ORDER BY total DESC
    `);

    const sourceStats = sourceResult.rows.map(row => ({
      ...camelKeys(row),
      sourceTypeLabel: SOURCE_TYPE_MAP[row.source_type] || row.source_type,
    }));

    return ok({
      overall: camelKeys(overallResult.rows[0]),
      bySource: sourceStats,
    });
  });
}

function warningDetail(id) {
  return W(async () => {
    if (!isConnected()) return dbDown();

    const result = await pool.query(
      `SELECT wr.*, wt.task_code, wt.status as task_status, wt.task_title,
              wt.responsible_name, wt.deadline_date, wt.actual_completion_date,
              wt.priority as task_priority, wt.progress as task_progress
       FROM hse_warning_record wr
       LEFT JOIN hse_warning_task wt ON wr.rectification_task_id = wt.id AND wt.is_deleted = false
       WHERE wr.id = $1 AND wr.is_deleted = false`,
      [id]
    );

    if (result.rows.length === 0) {
      return err(-2, '预警记录不存在');
    }

    const item = camelKeys(result.rows[0]);
    item.warningLevelLabel = WARNING_LEVEL_MAP[result.rows[0].warning_level]?.label || result.rows[0].warning_level;
    item.sourceTypeLabel = SOURCE_TYPE_MAP[result.rows[0].source_type] || result.rows[0].source_type;

    return ok(item);
  });
}

function warningScan() {
  return W(async () => {
    if (!isConnected()) return dbDown();

    const rulesResult = await pool.query(
      `SELECT * FROM hse_warning_rule WHERE status = 'active' AND is_deleted = false ORDER BY source_type, warning_level`
    );
    const rules = rulesResult.rows;

    let totalGenerated = 0;
    const scanDetails = [];

    for (const rule of rules) {
      const generated = await scanByRule(rule);
      totalGenerated += generated;
      scanDetails.push({ ruleCode: rule.rule_code, ruleName: rule.rule_name, generated });
    }

    return ok({ totalGenerated, rulesScanned: rules.length, details: scanDetails }, `扫描完成，共生成 ${totalGenerated} 条预警`);
  });
}

function warningEscalate() {
  return W(async () => {
    if (!isConnected()) return dbDown();

    let totalEscalated = 0;
    let criticalEscalated = 0;
    let majorEscalated = 0;
    const details = [];

    for (const [level, config] of Object.entries(ESCALATION_RULES)) {
      const result = await pool.query(
        `SELECT id, warning_code, warning_level, target_name, created_at,
                EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600 as pending_hours
         FROM hse_warning_record
         WHERE is_deleted = false
           AND status IN ('pending', 'processing')
           AND warning_level = $1
           AND is_escalated = false
           AND created_at <= NOW() - INTERVAL '${config.hours} hours'`,
        [level]
      );

      for (const row of result.rows) {
        const pendingHours = Math.round(parseFloat(row.pending_hours));

        if (level === 'major') {
          await pool.query(
            `UPDATE hse_warning_record
             SET warning_level = 'critical',
                 is_escalated = true,
                 escalated_at = NOW(),
                 original_level = $1,
                 escalation_notified = true,
                 updated_at = NOW()
             WHERE id = $2`,
            [row.warning_level, row.id]
          );
          majorEscalated++;
        } else {
          await pool.query(
            `UPDATE hse_warning_record
             SET is_escalated = true,
                 escalated_at = NOW(),
                 original_level = $1,
                 escalation_notified = true,
                 updated_at = NOW()
             WHERE id = $2`,
            [row.warning_level, row.id]
          );
          criticalEscalated++;
        }

        totalEscalated++;
        details.push({
          warningId: row.id,
          warningCode: row.warning_code,
          originalLevel: row.warning_level,
          escalatedLevel: config.escalateTo,
          pendingHours,
          targetName: row.target_name,
        });

        console.log(`[warning-center] 预警升级: ${row.warning_code} (${row.warning_level}→${config.escalateTo}), 未处理${pendingHours}小时, 对象: ${row.target_name}`);
      }
    }

    return ok({
      totalEscalated,
      criticalEscalated,
      majorEscalated,
      details,
    }, `升级检查完成，共升级 ${totalEscalated} 条预警`);
  });
}

// ============================================================
// 模块二：整改任务中心
// ============================================================

function taskList(query) {
  return W(async () => {
    if (!isConnected()) return dbDown();

    const { status, priority, responsible_id, org_id, warning_id, page = 1, pageSize = 20 } = query;
    const pageNum = Math.max(1, parseInt(page));
    const size = Math.min(100, Math.max(1, parseInt(pageSize)));
    const offset = (pageNum - 1) * size;

    const conditions = ['t.is_deleted = false'];
    const params = [];
    let idx = 1;

    if (status) { conditions.push(`t.status = $${idx++}`); params.push(status); }
    if (priority) { conditions.push(`t.priority = $${idx++}`); params.push(priority); }
    if (responsible_id) { conditions.push(`t.responsible_id = $${idx++}`); params.push(responsible_id); }
    if (org_id) { conditions.push(`t.org_id = $${idx++}`); params.push(org_id); }
    if (warning_id) { conditions.push(`t.warning_id = $${idx++}`); params.push(warning_id); }

    const whereClause = conditions.join(' AND ');

    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM hse_warning_task t WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total);

    const listResult = await pool.query(
      `SELECT t.*, wr.warning_level, wr.source_type, wr.warning_code as wr_code
       FROM hse_warning_task t
       LEFT JOIN hse_warning_record wr ON t.warning_id = wr.id AND wr.is_deleted = false
       WHERE ${whereClause}
       ORDER BY
         CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
         t.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, size, offset]
    );

    const list = listResult.rows.map(row => {
      const item = camelKeys(row);
      item.statusLabel = TASK_STATUS_MAP[row.status]?.label || row.status;
      item.statusColor = TASK_STATUS_MAP[row.status]?.color || 'default';
      item.priorityLabel = { 'urgent': '紧急', 'high': '高', 'normal': '正常', 'low': '低' }[row.priority] || row.priority;
      item.warningLevelLabel = WARNING_LEVEL_MAP[row.warning_level]?.label || row.warning_level;
      item.sourceTypeLabel = SOURCE_TYPE_MAP[row.source_type] || row.source_type;

      if (row.deadline_date && row.status !== 'closed') {
        const dd = new Date(row.deadline_date);
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        dd.setHours(0, 0, 0, 0);
        const diff = Math.ceil((dd - now) / (1000 * 60 * 60 * 24));
        item.overdueStatus = diff < 0 ? 'overdue' : diff <= 3 ? 'expiring' : 'normal';
        item.daysRemaining = diff;
      } else {
        item.overdueStatus = 'normal';
        item.daysRemaining = null;
      }

      return item;
    });

    return ok({ list, total, page: pageNum, pageSize: size });
  });
}

function taskDetail(id) {
  return W(async () => {
    if (!isConnected()) return dbDown();

    const result = await pool.query(
      `SELECT t.*, wr.warning_level, wr.source_type, wr.warning_code as wr_code,
              wr.rule_name, wr.risk_reason, wr.target_name, wr.risk_data
       FROM hse_warning_task t
       LEFT JOIN hse_warning_record wr ON t.warning_id = wr.id AND wr.is_deleted = false
       WHERE t.id = $1 AND t.is_deleted = false`,
      [id]
    );

    if (result.rows.length === 0) {
      return err(-2, '任务不存在');
    }

    const item = camelKeys(result.rows[0]);
    item.statusLabel = TASK_STATUS_MAP[result.rows[0].status]?.label || result.rows[0].status;
    item.priorityLabel = { 'urgent': '紧急', 'high': '高', 'normal': '正常', 'low': '低' }[result.rows[0].priority] || result.rows[0].priority;

    return ok(item);
  });
}

function taskCreate(body, user) {
  return W(async () => {
    if (!isConnected()) return dbDown();

    const { warning_id, task_title, description, responsible_id, responsible_name,
            org_id, org_name, deadline_date, priority = 'normal' } = body;

    if (!task_title) return err(-3, '任务标题不能为空');
    if (!responsible_id) return err(-3, '责任人不能为空');
    if (!deadline_date) return err(-3, '整改期限不能为空');

    const taskCode = generateCode('WT');
    const result = await pool.query(
      `INSERT INTO hse_warning_task
        (task_code, warning_id, warning_code, task_title, description,
         responsible_id, responsible_name, org_id, org_name, deadline_date, status, priority, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', $11, $12)
       RETURNING *`,
      [taskCode, warning_id || null, null, task_title, description || null,
       responsible_id, responsible_name || null, org_id || null, org_name || null,
       deadline_date, priority, user?.userId || null]
    );

    if (warning_id) {
      await pool.query(
        `UPDATE hse_warning_record SET rectification_task_id = $1, status = 'processing', updated_at = NOW() WHERE id = $2`,
        [result.rows[0].id, warning_id]
      );
    }

    try {
      await createNotification({
        userId: responsible_id,
        title: `新整改任务：${task_title}`,
        content: `您有一项新的整改任务需要处理，期限：${deadline_date}`,
        type: 'system',
        bizType: 'warning_task',
      });
    } catch (notifErr) {
      console.error('[warning-center] notification error:', notifErr);
    }

    return ok(camelKeys(result.rows[0]), '任务创建成功');
  });
}

function taskDispatch(id) {
  return W(async () => {
    if (!isConnected()) return dbDown();

    const result = await pool.query(
      `UPDATE hse_warning_task SET status = 'dispatched', updated_at = NOW()
       WHERE id = $1 AND is_deleted = false AND status = 'pending' RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return err(-2, '任务不存在或状态不允许下发');
    }

    try {
      const task = result.rows[0];
      if (task.responsible_id) {
        await createNotification({
          userId: task.responsible_id,
          title: `整改任务已下发：${task.task_title}`,
          content: `请尽快处理，整改期限：${task.deadline_date}`,
          type: 'system',
          bizType: 'warning_task',
        });
      }
    } catch (notifErr) {
      console.error('[warning-center] dispatch notification error:', notifErr);
    }

    return ok(camelKeys(result.rows[0]), '任务已下发');
  });
}

function taskProcess(id) {
  return W(async () => {
    if (!isConnected()) return dbDown();

    const result = await pool.query(
      `UPDATE hse_warning_task SET status = 'processing', updated_at = NOW()
       WHERE id = $1 AND is_deleted = false AND status IN ('dispatched', 'rejected') RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return err(-2, '任务不存在或状态不允许开始处理');
    }

    return ok(camelKeys(result.rows[0]), '任务已开始处理');
  });
}

function taskSubmitProof(id, body) {
  return W(async () => {
    if (!isConnected()) return dbDown();

    const { process_note, process_attachment, progress = 100 } = body;

    const result = await pool.query(
      `UPDATE hse_warning_task
       SET status = 'pending_review', process_note = $1, process_attachment = $2,
           progress = $3, processed_at = NOW(), updated_at = NOW()
       WHERE id = $4 AND is_deleted = false AND status IN ('dispatched', 'processing', 'rejected') RETURNING *`,
      [process_note || null, JSON.stringify(process_attachment || []), progress, id]
    );

    if (result.rows.length === 0) {
      return err(-2, '任务不存在或状态不允许提交证明');
    }

    return ok(camelKeys(result.rows[0]), '整改证明已提交，等待复核');
  });
}

function taskReview(id, body, user) {
  return W(async () => {
    if (!isConnected()) return dbDown();

    const { review_result, review_note, review_attachment } = body;

    if (!review_result || !['approved', 'rejected'].includes(review_result)) {
      return err(-3, '复核结果必须为 approved 或 rejected');
    }

    const newStatus = review_result === 'approved' ? 'closed' : 'rejected';
    const now = new Date();

    const result = await pool.query(
      `UPDATE hse_warning_task
       SET status = $1, review_result = $2, review_note = $3, review_attachment = $4,
           review_by = $5, reviewed_at = $6,
           ${review_result === 'approved' ? 'closed_at = $6, closed_by = $5, actual_completion_date = CURRENT_DATE,' : ''}
           updated_at = $6
       WHERE id = $7 AND is_deleted = false AND status = 'pending_review' RETURNING *`,
      [newStatus, review_result, review_note || null, JSON.stringify(review_attachment || []),
       user?.userId || null, now, id]
    );

    if (result.rows.length === 0) {
      return err(-2, '任务不存在或状态不允许复核');
    }

    if (review_result === 'approved' && result.rows[0].warning_id) {
      await pool.query(
        `UPDATE hse_warning_record SET status = 'closed', closed_by = $1, closed_at = $2, close_remark = $3, updated_at = $2 WHERE id = $4`,
        [user?.userId || null, now, review_note || null, result.rows[0].warning_id]
      );
    }

    return ok(camelKeys(result.rows[0]), review_result === 'approved' ? '复核通过，任务已关闭' : '复核驳回，退回处理');
  });
}

function taskClose(id, body, user) {
  return W(async () => {
    if (!isConnected()) return dbDown();

    const { close_note } = body;
    const now = new Date();

    const result = await pool.query(
      `UPDATE hse_warning_task
       SET status = 'closed', closed_at = $1, closed_by = $2, close_note = $3,
           actual_completion_date = CURRENT_DATE, updated_at = $1
       WHERE id = $4 AND is_deleted = false AND status NOT IN ('closed') RETURNING *`,
      [now, user?.userId || null, close_note || null, id]
    );

    if (result.rows.length === 0) {
      return err(-2, '任务不存在或已关闭');
    }

    if (result.rows[0].warning_id) {
      await pool.query(
        `UPDATE hse_warning_record SET status = 'closed', closed_by = $1, closed_at = $2, close_remark = $3, updated_at = $2 WHERE id = $4`,
        [user?.userId || null, now, close_note || null, result.rows[0].warning_id]
      );
    }

    return ok(camelKeys(result.rows[0]), '任务已关闭');
  });
}

// ============================================================
// 模块三：整改闭环分析
// ============================================================

function analysis(query) {
  return W(async () => {
    if (!isConnected()) return dbDown();

    const { year } = query;
    const targetYear = year ? parseInt(year) : new Date().getFullYear();
    const yearStart = `${targetYear}-01-01`;
    const yearEnd = `${targetYear}-12-31`;

    const overallResult = await pool.query(`
      SELECT
        COUNT(*) as total_tasks,
        COUNT(*) FILTER (WHERE status = 'closed') as closed_tasks,
        COUNT(*) FILTER (WHERE status NOT IN ('closed', 'cancelled') AND deadline_date < CURRENT_DATE) as overdue_tasks,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_tasks,
        COUNT(*) FILTER (WHERE status = 'dispatched') as dispatched_tasks,
        COUNT(*) FILTER (WHERE status = 'processing') as processing_tasks,
        COUNT(*) FILTER (WHERE status = 'pending_review') as review_tasks,
        COUNT(*) FILTER (WHERE status = 'rejected') as rejected_tasks,
        AVG(CASE WHEN status = 'closed' AND created_at IS NOT NULL AND closed_at IS NOT NULL
            THEN EXTRACT(EPOCH FROM (closed_at - created_at)) / 86400 END) as avg_close_days
      FROM hse_warning_task
      WHERE is_deleted = false AND created_at >= $1 AND created_at <= $2
    `, [yearStart, yearEnd]);

    const overall = camelKeys(overallResult.rows[0]);
    const totalTasks = parseInt(overall.totalTasks) || 0;
    const closedTasks = parseInt(overall.closedTasks) || 0;
    const overdueTasks = parseInt(overall.overdueTasks) || 0;

    overall.rectificationRate = totalTasks > 0 ? Math.round((closedTasks / totalTasks) * 100) : 0;
    overall.overdueRate = totalTasks > 0 ? Math.round((overdueTasks / totalTasks) * 100) : 0;
    overall.avgCloseDays = overall.avgCloseDays ? Math.round(parseFloat(overall.avgCloseDays) * 10) / 10 : 0;

    const sourceResult = await pool.query(`
      SELECT wr.source_type,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE t.status = 'closed') as closed_count,
        COUNT(*) FILTER (WHERE t.status NOT IN ('closed', 'cancelled') AND t.deadline_date < CURRENT_DATE) as overdue_count
      FROM hse_warning_task t
      LEFT JOIN hse_warning_record wr ON t.warning_id = wr.id AND wr.is_deleted = false
      WHERE t.is_deleted = false AND t.created_at >= $1 AND t.created_at <= $2
      GROUP BY wr.source_type ORDER BY total DESC
    `, [yearStart, yearEnd]);

    const bySource = sourceResult.rows.map(row => {
      const total = parseInt(row.total) || 0;
      const closed = parseInt(row.closed_count) || 0;
      const overdue = parseInt(row.overdue_count) || 0;
      return {
        sourceType: row.source_type,
        sourceTypeLabel: SOURCE_TYPE_MAP[row.source_type] || row.source_type,
        total, closed, overdue,
        rectificationRate: total > 0 ? Math.round((closed / total) * 100) : 0,
        overdueRate: total > 0 ? Math.round((overdue / total) * 100) : 0,
      };
    });

    const monthlyResult = await pool.query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', t.created_at), 'YYYY-MM') as month,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE t.status = 'closed') as closed_count,
        COUNT(*) FILTER (WHERE t.status NOT IN ('closed', 'cancelled') AND t.deadline_date < CURRENT_DATE) as overdue_count
      FROM hse_warning_task t
      WHERE t.is_deleted = false AND t.created_at >= $1 AND t.created_at <= $2
      GROUP BY DATE_TRUNC('month', t.created_at)
      ORDER BY month
    `, [yearStart, yearEnd]);

    const monthlyTrend = monthlyResult.rows.map(row => {
      const total = parseInt(row.total) || 0;
      const closed = parseInt(row.closed_count) || 0;
      return {
        month: row.month,
        total,
        closed,
        overdue: parseInt(row.overdue_count) || 0,
        rate: total > 0 ? Math.round((closed / total) * 100) : 0,
      };
    });

    const repeatResult = await pool.query(`
      WITH repeat_targets AS (
        SELECT target_id, target_type, COUNT(*) as warn_count
        FROM hse_warning_record
        WHERE is_deleted = false AND created_at >= $1 AND created_at <= $2
        GROUP BY target_id, target_type
        HAVING COUNT(*) > 1
      )
      SELECT
        (SELECT COUNT(DISTINCT (target_id, target_type)) FROM hse_warning_record WHERE is_deleted = false AND created_at >= $1 AND created_at <= $2) as total_targets,
        COUNT(*) as repeat_targets_count
      FROM repeat_targets
    `, [yearStart, yearEnd]);

    const totalTargets = parseInt(repeatResult.rows[0]?.total_targets) || 0;
    const repeatTargets = parseInt(repeatResult.rows[0]?.repeat_targets_count) || 0;
    const repeatRiskRate = totalTargets > 0 ? Math.round((repeatTargets / totalTargets) * 100) : 0;

    const levelResult = await pool.query(`
      SELECT wr.warning_level,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE t.status = 'closed') as closed_count
      FROM hse_warning_task t
      LEFT JOIN hse_warning_record wr ON t.warning_id = wr.id AND wr.is_deleted = false
      WHERE t.is_deleted = false AND t.created_at >= $1 AND t.created_at <= $2
      GROUP BY wr.warning_level
    `, [yearStart, yearEnd]);

    const byLevel = levelResult.rows.map(row => ({
      level: row.warning_level,
      levelLabel: WARNING_LEVEL_MAP[row.warning_level]?.label || row.warning_level,
      total: parseInt(row.total) || 0,
      closed: parseInt(row.closed_count) || 0,
      rate: parseInt(row.total) > 0 ? Math.round((parseInt(row.closed_count) / parseInt(row.total)) * 100) : 0,
    }));

    return ok({
      currentYear: targetYear,
      overall,
      bySource,
      byLevel,
      monthlyTrend,
      repeatRiskRate,
      repeatTargets,
      totalTargets,
    });
  });
}

// ============================================================
// 模块四：预警规则管理
// ============================================================

function ruleList(query) {
  return W(async () => {
    if (!isConnected()) return dbDown();

    const { source_type, status, page = 1, pageSize = 50 } = query;
    const pageNum = Math.max(1, parseInt(page));
    const size = Math.min(100, Math.max(1, parseInt(pageSize)));
    const offset = (pageNum - 1) * size;

    const conditions = ['is_deleted = false'];
    const params = [];
    let idx = 1;

    if (source_type) { conditions.push(`source_type = $${idx++}`); params.push(source_type); }
    if (status) { conditions.push(`status = $${idx++}`); params.push(status); }

    const whereClause = conditions.join(' AND ');

    const countResult = await pool.query(`SELECT COUNT(*) as total FROM hse_warning_rule WHERE ${whereClause}`, params);
    const total = parseInt(countResult.rows[0].total);

    const listResult = await pool.query(
      `SELECT * FROM hse_warning_rule WHERE ${whereClause} ORDER BY source_type, warning_level, created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, size, offset]
    );

    const list = listResult.rows.map(row => {
      const item = camelKeys(row);
      item.warningLevelLabel = WARNING_LEVEL_MAP[row.warning_level]?.label || row.warning_level;
      item.sourceTypeLabel = SOURCE_TYPE_MAP[row.source_type] || row.source_type;
      return item;
    });

    return ok({ list, total, page: pageNum, pageSize: size });
  });
}

function ruleDetail(id) {
  return W(async () => {
    if (!isConnected()) return dbDown();

    const result = await pool.query(`SELECT * FROM hse_warning_rule WHERE id = $1 AND is_deleted = false`, [id]);

    if (result.rows.length === 0) {
      return err(-2, '规则不存在');
    }

    const versions = await pool.query(
      `SELECT * FROM hse_warning_rule_version WHERE rule_id = $1 AND is_deleted = false ORDER BY created_at DESC`,
      [id]
    );

    const item = camelKeys(result.rows[0]);
    item.warningLevelLabel = WARNING_LEVEL_MAP[result.rows[0].warning_level]?.label || result.rows[0].warning_level;
    item.sourceTypeLabel = SOURCE_TYPE_MAP[result.rows[0].source_type] || result.rows[0].source_type;
    item.versions = versions.rows.map(camelKeys);

    return ok(item);
  });
}

function ruleCreate(body, user) {
  return W(async () => {
    if (!isConnected()) return dbDown();

    const { rule_name, source_type, warning_level, target_type = 'employee',
            condition_config = {}, action_config = {}, description, status = 'active' } = body;

    if (!rule_name) return err(-3, '规则名称不能为空');
    if (!source_type) return err(-3, '预警来源不能为空');
    if (!warning_level) return err(-3, '预警等级不能为空');

    const ruleCode = generateCode('WR');
    const result = await pool.query(
      `INSERT INTO hse_warning_rule
        (rule_code, rule_name, source_type, warning_level, target_type,
         condition_config, action_config, description, status, version, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'v1.0', $10) RETURNING *`,
      [ruleCode, rule_name, source_type, warning_level, target_type,
       JSON.stringify(condition_config), JSON.stringify(action_config),
       description || null, status, user?.userId || null]
    );

    await pool.query(
      `INSERT INTO hse_warning_rule_version (rule_id, version, snapshot, change_log, status, created_by)
       VALUES ($1, 'v1.0', $2, '初始版本', 'active', $3)`,
      [result.rows[0].id, JSON.stringify(camelKeys(result.rows[0])), user?.userId || null]
    );

    return ok(camelKeys(result.rows[0]), '规则创建成功');
  });
}

function ruleUpdate(id, body, user) {
  return W(async () => {
    if (!isConnected()) return dbDown();

    const { rule_name, source_type, warning_level, target_type,
            condition_config, action_config, description, change_log } = body;

    const oldRule = await pool.query(`SELECT * FROM hse_warning_rule WHERE id = $1 AND is_deleted = false`, [id]);
    if (oldRule.rows.length === 0) {
      return err(-2, '规则不存在');
    }

    const oldVersion = oldRule.rows[0].version || 'v1.0';
    const versionNum = parseFloat(oldVersion.replace('v', ''));
    const newVersion = `v${(versionNum + 0.1).toFixed(1)}`;

    const updates = [];
    const params = [];
    let idx = 1;

    if (rule_name) { updates.push(`rule_name = $${idx++}`); params.push(rule_name); }
    if (source_type) { updates.push(`source_type = $${idx++}`); params.push(source_type); }
    if (warning_level) { updates.push(`warning_level = $${idx++}`); params.push(warning_level); }
    if (target_type) { updates.push(`target_type = $${idx++}`); params.push(target_type); }
    if (condition_config) { updates.push(`condition_config = $${idx++}`); params.push(JSON.stringify(condition_config)); }
    if (action_config) { updates.push(`action_config = $${idx++}`); params.push(JSON.stringify(action_config)); }
    if (description !== undefined) { updates.push(`description = $${idx++}`); params.push(description); }

    updates.push(`version = $${idx++}`);
    params.push(newVersion);
    updates.push(`updated_at = NOW()`);
    params.push(id);

    const result = await pool.query(
      `UPDATE hse_warning_rule SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );

    await pool.query(`UPDATE hse_warning_rule_version SET status = 'expired' WHERE rule_id = $1 AND status = 'active'`, [id]);
    await pool.query(
      `INSERT INTO hse_warning_rule_version (rule_id, version, snapshot, change_log, status, created_by)
       VALUES ($1, $2, $3, $4, 'active', $5)`,
      [id, newVersion, JSON.stringify(camelKeys(result.rows[0])), change_log || '规则更新', user?.userId || null]
    );

    return ok({ ...camelKeys(result.rows[0]), newVersion }, `规则已更新至 ${newVersion}`);
  });
}

function ruleToggle(id) {
  return W(async () => {
    if (!isConnected()) return dbDown();

    const result = await pool.query(
      `UPDATE hse_warning_rule
       SET status = CASE WHEN status = 'active' THEN 'inactive' ELSE 'active' END,
           updated_at = NOW()
       WHERE id = $1 AND is_deleted = false RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return err(-2, '规则不存在');
    }

    const newStatus = result.rows[0].status;
    return ok(camelKeys(result.rows[0]), newStatus === 'active' ? '规则已启用' : '规则已停用');
  });
}

function ruleVersions(query) {
  return W(async () => {
    if (!isConnected()) return dbDown();

    const { rule_id } = query;
    if (!rule_id) return err(-3, '规则ID不能为空');

    const result = await pool.query(
      `SELECT v.*, r.rule_name, r.rule_code
       FROM hse_warning_rule_version v
       JOIN hse_warning_rule r ON v.rule_id = r.id
       WHERE v.rule_id = $1 AND v.is_deleted = false
       ORDER BY v.created_at DESC`,
      [rule_id]
    );

    return ok(result.rows.map(camelKeys));
  });
}

// ============================================================
// Sprint7-C 模块五：整改效果验证
// ============================================================

function taskEvaluate(id, body, user) {
  return W(async () => {
    if (!isConnected()) return dbDown();

    const { evaluation_note } = body;

    const taskResult = await pool.query(
      `SELECT t.*, wr.source_type, wr.target_type, wr.target_id, wr.warning_level,
              wr.risk_data, wr.created_at as warning_created_at
       FROM hse_warning_task t
       LEFT JOIN hse_warning_record wr ON t.warning_id = wr.id AND wr.is_deleted = false
       WHERE t.id = $1 AND t.is_deleted = false`,
      [id]
    );

    if (taskResult.rows.length === 0) {
      return err(-2, '任务不存在');
    }

    const task = taskResult.rows[0];

    if (task.status !== 'closed') {
      return err(-3, '任务尚未关闭，无法进行效果验证');
    }

    const existingEval = await pool.query(
      `SELECT id FROM hse_rectification_evaluation WHERE task_id = $1 AND is_deleted = false`,
      [id]
    );
    if (existingEval.rows.length > 0) {
      return err(-4, '该任务已完成效果评价');
    }

    const beforeRiskLevel = task.warning_level || 'minor';
    const beforeRiskScore = task.risk_data ? (JSON.parse(task.risk_data).score || JSON.parse(task.risk_data).currentScore || 50) : 50;

    let afterRiskLevel = beforeRiskLevel;
    let afterRiskScore = beforeRiskScore;

    if (task.target_type === 'employee' && task.target_id) {
      const latestSnapshot = await pool.query(
        `SELECT risk_level, risk_level_code, total_score
         FROM hse_employee_risk_snapshot
         WHERE employee_id = $1 AND is_deleted = false
         ORDER BY snapshot_date DESC LIMIT 1`,
        [task.target_id]
      );
      if (latestSnapshot.rows.length > 0) {
        afterRiskLevel = latestSnapshot.rows[0].risk_level_code || latestSnapshot.rows[0].risk_level || beforeRiskLevel;
        afterRiskScore = parseFloat(latestSnapshot.rows[0].total_score) || beforeRiskScore;
      }
    } else if (task.source_type === 'accident') {
      const recentAccidents = await pool.query(
        `SELECT COUNT(*) as count FROM accidents
         WHERE is_deleted = false AND accident_date >= $1`,
        [task.closed_at || new Date()]
      );
      afterRiskLevel = parseInt(recentAccidents.rows[0].count) > 0 ? beforeRiskLevel : 'minor';
      afterRiskScore = parseInt(recentAccidents.rows[0].count) > 0 ? beforeRiskScore : Math.max(0, beforeRiskScore - 30);
    } else {
      const levelOrder = ['critical', 'major', 'minor', 'info'];
      const currentIdx = levelOrder.indexOf(beforeRiskLevel);
      if (currentIdx >= 0 && currentIdx < levelOrder.length - 1) {
        afterRiskLevel = levelOrder[currentIdx + 1];
        afterRiskScore = Math.max(0, beforeRiskScore - 15);
      }
    }

    const riskDelta = parseFloat((afterRiskScore - beforeRiskScore).toFixed(2));
    const levelOrder = { 'critical': 4, 'major': 3, 'minor': 2, 'info': 1 };
    const levelImproved = (levelOrder[afterRiskLevel] || 0) < (levelOrder[beforeRiskLevel] || 0);

    let timelinessScore = 100;
    if (task.deadline_date && task.actual_completion_date) {
      const deadline = new Date(task.deadline_date);
      const completion = new Date(task.actual_completion_date);
      const diffDays = Math.ceil((completion - deadline) / (1000 * 60 * 60 * 24));
      if (diffDays > 0) {
        timelinessScore = Math.max(0, 100 - diffDays * 10);
      }
    }

    let effectivenessScore = 50;
    if (levelImproved) {
      effectivenessScore = 100;
    } else if (riskDelta < 0) {
      effectivenessScore = Math.min(100, 50 + Math.abs(riskDelta) * 2);
    } else if (riskDelta === 0) {
      effectivenessScore = 60;
    } else {
      effectivenessScore = Math.max(0, 50 - riskDelta * 2);
    }

    let repeatRate = 0;
    if (task.target_id) {
      const repeatWarnings = await pool.query(
        `SELECT COUNT(*) as count FROM hse_warning_record
         WHERE target_id = $1 AND target_type = $2 AND is_deleted = false
           AND created_at > $3 AND created_at <= NOW()`,
        [task.target_id, task.target_type || 'employee', task.warning_created_at || task.created_at]
      );
      const repeatCount = parseInt(repeatWarnings.rows[0].count);
      repeatRate = repeatCount > 0 ? parseFloat(Math.min(100, repeatCount * 20).toFixed(2)) : 0;
    }

    const repeatScore = 100 - repeatRate;
    const effectScore = parseFloat((timelinessScore * 0.4 + effectivenessScore * 0.4 + repeatScore * 0.2).toFixed(2));

    const evalResult = await pool.query(
      `INSERT INTO hse_rectification_evaluation
        (task_id, warning_id, before_risk_level, before_risk_score,
         after_risk_level, after_risk_score, risk_delta, level_improved,
         timeliness_score, effectiveness_score, repeat_rate, effect_score,
         evaluation_note, evaluator, evaluator_name, evaluation_time)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
       RETURNING *`,
      [id, task.warning_id, beforeRiskLevel, beforeRiskScore,
       afterRiskLevel, afterRiskScore, riskDelta, levelImproved,
       timelinessScore, effectivenessScore, repeatRate, effectScore,
       evaluation_note || null, user?.userId || null, user?.username || null]
    );

    const evalItem = camelKeys(evalResult.rows[0]);
    evalItem.beforeRiskLevelLabel = WARNING_LEVEL_MAP[beforeRiskLevel]?.label || beforeRiskLevel;
    evalItem.afterRiskLevelLabel = WARNING_LEVEL_MAP[afterRiskLevel]?.label || afterRiskLevel;

    return ok(evalItem, '整改效果评价完成');
  });
}

function taskEvaluation(id) {
  return W(async () => {
    if (!isConnected()) return dbDown();

    const result = await pool.query(
      `SELECT * FROM hse_rectification_evaluation WHERE task_id = $1 AND is_deleted = false`,
      [id]
    );

    if (result.rows.length === 0) {
      return ok(null, '暂无效果评价');
    }

    const item = camelKeys(result.rows[0]);
    item.beforeRiskLevelLabel = WARNING_LEVEL_MAP[result.rows[0].before_risk_level]?.label || result.rows[0].before_risk_level;
    item.afterRiskLevelLabel = WARNING_LEVEL_MAP[result.rows[0].after_risk_level]?.label || result.rows[0].after_risk_level;

    return ok(item);
  });
}

function evaluationStats(query) {
  return W(async () => {
    if (!isConnected()) return dbDown();

    const { year } = query;
    const targetYear = year ? parseInt(year) : new Date().getFullYear();
    const yearStart = `${targetYear}-01-01`;
    const yearEnd = `${targetYear}-12-31`;

    const statsResult = await pool.query(`
      SELECT
        COUNT(*) as total_evaluations,
        COUNT(*) FILTER (WHERE level_improved = true) as improved_count,
        AVG(effect_score) as avg_effect_score,
        AVG(timeliness_score) as avg_timeliness_score,
        AVG(effectiveness_score) as avg_effectiveness_score,
        AVG(repeat_rate) as avg_repeat_rate,
        AVG(risk_delta) as avg_risk_delta
      FROM hse_rectification_evaluation
      WHERE is_deleted = false AND evaluation_time >= $1 AND evaluation_time <= $2
    `, [yearStart, yearEnd]);

    const overall = camelKeys(statsResult.rows[0]);
    overall.avgEffectScore = overall.avgEffectScore ? Math.round(parseFloat(overall.avgEffectScore) * 10) / 10 : 0;
    overall.avgTimelinessScore = overall.avgTimelinessScore ? Math.round(parseFloat(overall.avgTimelinessScore) * 10) / 10 : 0;
    overall.avgEffectivenessScore = overall.avgEffectivenessScore ? Math.round(parseFloat(overall.avgEffectivenessScore) * 10) / 10 : 0;
    overall.avgRepeatRate = overall.avgRepeatRate ? Math.round(parseFloat(overall.avgRepeatRate) * 10) / 10 : 0;
    overall.avgRiskDelta = overall.avgRiskDelta ? Math.round(parseFloat(overall.avgRiskDelta) * 100) / 100 : 0;
    overall.improvementRate = parseInt(overall.totalEvaluations) > 0
      ? Math.round((parseInt(overall.improvedCount) / parseInt(overall.totalEvaluations)) * 100) : 0;

    return ok({ overall });
  });
}

// ============================================================
// Sprint7-C 模块六：预警调度管理
// ============================================================

function schedulerList(query) {
  return W(async () => {
    if (!isConnected()) return dbDown();

    const { status, scan_type, page = 1, pageSize = 50 } = query;
    const pageNum = Math.max(1, parseInt(page));
    const size = Math.min(100, Math.max(1, parseInt(pageSize)));
    const offset = (pageNum - 1) * size;

    const conditions = ['is_deleted = false'];
    const params = [];
    let idx = 1;

    if (status) { conditions.push(`status = $${idx++}`); params.push(status); }
    if (scan_type) { conditions.push(`scan_type = $${idx++}`); params.push(scan_type); }

    const whereClause = conditions.join(' AND ');

    const countResult = await pool.query(`SELECT COUNT(*) as total FROM hse_warning_scheduler WHERE ${whereClause}`, params);
    const total = parseInt(countResult.rows[0].total);

    const listResult = await pool.query(
      `SELECT * FROM hse_warning_scheduler WHERE ${whereClause} ORDER BY created_at ASC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, size, offset]
    );

    const list = listResult.rows.map(row => {
      const item = camelKeys(row);
      item.scanTypeLabel = {
        'all': '全量扫描', 'employee_risk': '员工风险', 'driver_risk': '驾驶风险',
        'accident': '事故风险', 'assessment': '考核风险', 'management': '管理履职',
      }[row.scan_type] || row.scan_type;
      return item;
    });

    return ok({ list, total, page: pageNum, pageSize: size });
  });
}

function schedulerCreate(body, user) {
  return W(async () => {
    if (!isConnected()) return dbDown();

    const { task_name, scan_type, cron_expression, description, status = 'active' } = body;

    if (!task_name) return err(-3, '任务名称不能为空');
    if (!scan_type) return err(-3, '扫描类型不能为空');
    if (!cron_expression) return err(-3, 'cron表达式不能为空');

    if (!cron.validate(cron_expression)) {
      return err(-3, 'cron表达式格式无效');
    }

    const result = await pool.query(
      `INSERT INTO hse_warning_scheduler
        (task_name, scan_type, cron_expression, description, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [task_name, scan_type, cron_expression, description || null, status, user?.userId || null]
    );

    return ok(camelKeys(result.rows[0]), '调度任务创建成功');
  });
}

function schedulerUpdate(id, body) {
  return W(async () => {
    if (!isConnected()) return dbDown();

    const { task_name, scan_type, cron_expression, description, status } = body;

    if (cron_expression && !cron.validate(cron_expression)) {
      return err(-3, 'cron表达式格式无效');
    }

    const updates = [];
    const params = [];
    let idx = 1;

    if (task_name) { updates.push(`task_name = $${idx++}`); params.push(task_name); }
    if (scan_type) { updates.push(`scan_type = $${idx++}`); params.push(scan_type); }
    if (cron_expression) { updates.push(`cron_expression = $${idx++}`); params.push(cron_expression); }
    if (description !== undefined) { updates.push(`description = $${idx++}`); params.push(description); }
    if (status) { updates.push(`status = $${idx++}`); params.push(status); }

    if (updates.length === 0) {
      return err(-3, '没有需要更新的字段');
    }

    updates.push(`updated_at = NOW()`);
    params.push(id);

    const result = await pool.query(
      `UPDATE hse_warning_scheduler SET ${updates.join(', ')} WHERE id = $${idx} AND is_deleted = false RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return err(-2, '调度任务不存在');
    }

    return ok(camelKeys(result.rows[0]), '调度任务更新成功');
  });
}

function schedulerToggle(id) {
  return W(async () => {
    if (!isConnected()) return dbDown();

    const result = await pool.query(
      `UPDATE hse_warning_scheduler
       SET status = CASE WHEN status = 'active' THEN 'inactive' ELSE 'active' END,
           updated_at = NOW()
       WHERE id = $1 AND is_deleted = false RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return err(-2, '调度任务不存在');
    }

    const newStatus = result.rows[0].status;
    return ok(camelKeys(result.rows[0]), newStatus === 'active' ? '调度任务已启用' : '调度任务已停用');
  });
}

function schedulerExecute(id) {
  return W(async () => {
    if (!isConnected()) return dbDown();

    const schedResult = await pool.query(
      `SELECT * FROM hse_warning_scheduler WHERE id = $1 AND is_deleted = false`,
      [id]
    );

    if (schedResult.rows.length === 0) {
      return err(-2, '调度任务不存在');
    }

    const scheduler = schedResult.rows[0];
    const scanType = scheduler.scan_type;

    let ruleFilter = '';
    const ruleParams = [];
    if (scanType !== 'all') {
      ruleFilter = 'AND source_type = $1';
      ruleParams.push(scanType);
    }

    const rulesResult = await pool.query(
      `SELECT * FROM hse_warning_rule WHERE status = 'active' AND is_deleted = false ${ruleFilter} ORDER BY source_type, warning_level`,
      ruleParams
    );

    let totalGenerated = 0;
    for (const rule of rulesResult.rows) {
      const generated = await scanByRule(rule);
      totalGenerated += generated;
    }

    await pool.query(
      `UPDATE hse_warning_scheduler
       SET last_execute_time = NOW(),
           last_result = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify({ totalGenerated, scannedRules: rulesResult.rows.length, executedAt: new Date().toISOString() }), id]
    );

    return ok({
      totalGenerated,
      scannedRules: rulesResult.rows.length,
      scanType,
    }, `调度任务执行完成，共生成 ${totalGenerated} 条预警`);
  });
}

module.exports = {
  warnings,
  warningStats,
  warningDetail,
  warningScan,
  warningEscalate,
  taskList,
  taskDetail,
  taskCreate,
  taskDispatch,
  taskProcess,
  taskSubmitProof,
  taskReview,
  taskClose,
  analysis,
  ruleList,
  ruleDetail,
  ruleCreate,
  ruleUpdate,
  ruleToggle,
  ruleVersions,
  taskEvaluate,
  taskEvaluation,
  evaluationStats,
  schedulerList,
  schedulerCreate,
  schedulerUpdate,
  schedulerToggle,
  schedulerExecute,
};