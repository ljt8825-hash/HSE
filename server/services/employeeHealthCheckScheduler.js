/**
 * 员工模型健康巡检定时任务调度器
 *
 * 来源: Sprint-C-v1.0/02_SQL/Employee_Model_Check.sql
 * 部署: TRAE Step 9
 *
 * 调度策略:
 *   - cron: '0 2 * * *'（每日凌晨 02:00 执行）
 *   - 时区: Asia/Shanghai
 *   - 首次全量执行: Sprint B 数据迁移完成后的首个 02:00
 *
 * ⚠️ 当前状态: DISABLED — 等 Sprint B B-2 迁移完成后将 ENABLED 改为 true
 *
 * 巡检内容（8 项 + 2 项汇总）:
 *   1. ORPHAN_EMPLOYEE      — 孤儿员工（有 assignment 但无 employee 主记录）
 *   2. ORPHAN_POSITION      — 孤儿岗位（assignment 引用的 position 不存在）
 *   3. ORPHAN_ORG_UNIT      — 孤儿组织（assignment 引用的 org_unit 不存在）
 *   4. DUPLICATE_CURRENT    — 重复当前关系（同一员工多条 is_current=true）
 *   5. INVALID_STATUS       — 非法状态值
 *   6. ORPHAN_SUPERVISOR    — 孤儿主管（supervisor_id 指向不存在的员工）
 *   7. INVALID_DATE_RANGE   — 日期逻辑异常（end_date < start_date）
 *   8. LEAVED_BUT_CURRENT   — 已离职但仍标记为当前
 *   9. TOTAL_ASSIGNMENTS    — 总 assignment 记录数（汇总）
 *  10. ACTIVE_EMPLOYEE_COUNT — 当前在职员工数（汇总）
 *
 * 告警阈值: 任意巡检项 issue_count > 0 时输出 WARN 日志
 *
 * 依赖数据库对象（已在 Step 9 创建）:
 *   - VIEW: v_employee_assignment_health
 *   - FUNCTION: fn_run_assignment_health_check()
 */

const cron = require('node-cron');
const { pool, isConnected } = require('../config/db');

// ============================================================
// 配置
// ============================================================

/**
 * 巡检调度开关
 * false = 仅注册任务但不执行巡检（等待 Sprint B 迁移完成）
 * true  = 正式启用每日巡检
 * v1.2: Sprint B 迁移已完成、全项目 TS 已清零（提示词-55），故启用
 */
const HEALTH_CHECK_ENABLED = true; // v1.2：Sprint B 迁移已完成，TS 清零已完成

/**
 * cron 表达式: 每日凌晨 02:00
 */
const CRON_EXPRESSION = '0 2 * * *';

/**
 * 时区
 */
const CRON_TIMEZONE = 'Asia/Shanghai';

// ============================================================
// 巡检执行函数
// ============================================================

/**
 * 执行一次全量巡检
 * @returns {Promise<Array>} 巡检结果数组
 */
async function runHealthCheck() {
  if (!isConnected()) {
    console.error('[health-check] 数据库未连接，跳过巡检');
    return [];
  }

  const client = await pool.connect();
  try {
    console.log('[health-check] 开始执行员工模型健康巡检...');

    const result = await client.query('SELECT * FROM fn_run_assignment_health_check()');

    let hasIssues = false;
    for (const row of result.rows) {
      const issueCount = parseInt(row.issue_count);
      if (issueCount > 0) {
        hasIssues = true;
        console.warn(`[health-check] ⚠️ ${row.check_type}: ${issueCount} 条异常 — ${row.description}`);
      } else {
        console.log(`[health-check] ✅ ${row.check_type}: 0 条异常`);
      }
    }

    if (hasIssues) {
      console.warn('[health-check] ⚠️ 巡检发现异常，请排查！');
    } else {
      console.log('[health-check] ✅ 巡检通过，无异常');
    }

    return result.rows;
  } catch (err) {
    console.error('[health-check] 巡检执行失败:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

// ============================================================
// 调度注册
// ============================================================

let scheduledTask = null;

/**
 * 注册定时巡检任务
 * 仅当 HEALTH_CHECK_ENABLED = true 时实际启用
 */
function initHealthCheckScheduler() {
  if (!HEALTH_CHECK_ENABLED) {
    console.log('[health-check] 巡检调度已配置但未启用 (HEALTH_CHECK_ENABLED=false)');
    console.log('[health-check] ⏳ 等 Sprint B 数据迁移完成后将 ENABLED 改为 true');
    console.log(`[health-check] 计划调度: ${CRON_EXPRESSION} (${CRON_TIMEZONE})`);
    return;
  }

  scheduledTask = cron.schedule(CRON_EXPRESSION, async () => {
    console.log('[health-check] Cron 触发: 执行每日员工模型健康巡检');
    try {
      await runHealthCheck();
    } catch (err) {
      console.error('[health-check] 定时巡检异常:', err.message);
    }
  }, {
    scheduled: true,
    timezone: CRON_TIMEZONE
  });

  console.log(`[health-check] ✅ 定时巡检已启用: ${CRON_EXPRESSION} (${CRON_TIMEZONE})`);
}

/**
 * 手动触发一次巡检（供 API 调用）
 */
async function triggerManualCheck() {
  return await runHealthCheck();
}

/**
 * 停止定时巡检
 */
function stopHealthCheckScheduler() {
  if (scheduledTask) {
    scheduledTask.stop();
    console.log('[health-check] 定时巡检已停止');
  }
}

module.exports = {
  HEALTH_CHECK_ENABLED,
  CRON_EXPRESSION,
  CRON_TIMEZONE,
  initHealthCheckScheduler,
  triggerManualCheck,
  stopHealthCheckScheduler,
  runHealthCheck
};
