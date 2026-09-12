/**
 * 人员保险当前有效保单冲突服务（任务3，提示词09）。
 *
 * 业务不变量："同 employee_id + 规范险种不能存在并行当前有效保单"。
 * 所有写入口必须复用本服务，禁止在路由中复制不同查重 SQL：
 *   - 单条创建 POST /personnel
 *   - 单条更新 PUT /personnel/:id
 *   - 直接导入 POST /personnel/import
 *   - 通用导入 /api/import/confirm（personnel 模块）
 *   - 规则生成 POST /personnel/generate-from-pending
 *   - 内存模式创建/更新（等价纯函数检查，不能绕过）
 *
 * 语义：
 *   findActivePolicyConflict({ employeeId, insuranceType, excludeId })
 *   - excludeId 用于更新现有记录时排除自身（更新自身不视为冲突）
 *   - 返回 { conflict: null } 或 { conflict: { id } }
 *   - 查询异常返回 { error: 'duplicate_check_failed' }（fail-closed，调用方不得写库）
 *
 * 业务日使用唯一带括号 SQL 常量 (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date。
 */
const { pool } = require('../config/db');
const { BUSINESS_DAY_SQL, getBusinessDayStr } = require('./businessDay');

/**
 * 唯一的"传入最终事实是否在业务日 active"判定（任务1，提示词10；任务2，提示词11 严格布尔）。
 *
 * 与第 09/10 轮状态真值表完全一致：只有 is_current=true 才 active（false/NULL/undefined 均
 * inactive）；起止日期都存在 + start<=expire + start<=businessDay<=expire。
 *
 * 字段兼容优先级（任务2，提示词11）：若对象显式拥有 camelCase `isCurrent` 字段，使用该值
 * （显式 false 不得被同对象的旧 `is_current=true` 覆盖）；否则读取 snake_case `is_current`。
 * 禁止用逻辑 OR 把显式 false 提升为 true。
 *
 * 默认业务日必须来自 getBusinessDayStr()（Asia/Shanghai），禁止 UTC toISOString().slice(0,10)。
 *
 * @param {{ isCurrent?: boolean, is_current?: boolean, startDate?: string|null, start_date?: string|null, expireDate?: string|null, expire_date?: string|null }} fact 合并后的最终事实
 * @param {string} [businessDay] 业务日 YYYY-MM-DD（默认上海业务日）
 * @returns {boolean}
 */
function isPolicyActiveOnBusinessDay(fact = {}, businessDay) {
  // camelCase 显式字段优先；仅当其未提供（undefined）时才回退 snake_case。
  // 显式 false/null 直接判 inactive，不得被 is_current=true 覆盖。
  let isCurrent;
  if (fact.isCurrent !== undefined) {
    isCurrent = fact.isCurrent;
  } else {
    isCurrent = fact.is_current;
  }
  if (isCurrent !== true) return false; // true 才 active；false/null/undefined 均 inactive
  const start = fact.startDate != null ? String(fact.startDate).slice(0, 10) : (fact.start_date != null ? String(fact.start_date).slice(0, 10) : null);
  const exp = fact.expireDate != null ? String(fact.expireDate).slice(0, 10) : (fact.expire_date != null ? String(fact.expire_date).slice(0, 10) : null);
  if (!start || !exp || start > exp) return false; // 缺起期/缺止期/起期晚于止期 → 非 active
  const day = businessDay || getBusinessDayStr();
  return start <= day && exp >= day;
}

/**
 * 查询指定员工+规范险种的当前有效保单冲突。
 * @param {{ employeeId: number|string, insuranceType: string, excludeId?: number|string }} params
 * @param {{ db?: object }} [opts] 可注入 db（测试/内存模式）；默认使用全局 pool
 * @returns {{ conflict: null | { id: number|string } } | { error: 'duplicate_check_failed' }}
 */
async function findActivePolicyConflict({ employeeId, insuranceType, excludeId } = {}, opts = {}) {
  const db = (opts && opts.db) || pool;
  const id = employeeId != null ? parseInt(employeeId, 10) : null;
  if (!Number.isInteger(id) || id <= 0) {
    return { error: 'duplicate_check_failed' };
  }
  if (!insuranceType || typeof insuranceType !== 'string') {
    return { error: 'duplicate_check_failed' };
  }
  try {
    let sql = `
      SELECT p.id FROM personnel_insurance p
      WHERE p.employee_id = $1 AND p.insurance_type = $2
        AND p.is_deleted = false AND p.is_current = true
        AND p.start_date IS NOT NULL AND p.expire_date IS NOT NULL
        AND p.start_date <= ${BUSINESS_DAY_SQL} AND p.expire_date >= ${BUSINESS_DAY_SQL}
    `;
    const params = [id, insuranceType];
    if (excludeId != null && excludeId !== '') {
      const exId = parseInt(excludeId, 10);
      if (Number.isInteger(exId) && exId > 0) {
        sql += ` AND p.id <> $${params.length + 1}`;
        params.push(exId);
      }
    }
    sql += ' LIMIT 1';
    const r = await db.query(sql, params);
    if (r && r.rows && r.rows.length > 0) {
      return { conflict: { id: r.rows[0].id } };
    }
    return { conflict: null };
  } catch (e) {
    // fail-closed：查询异常不得放行写库；详细异常仅服务端日志
    console.error('[personnelInsurancePolicyService] 当前有效冲突查询失败（fail-closed）:', e && e.message);
    return { error: 'duplicate_check_failed' };
  }
}

/**
 * 内存模式等价冲突检查（无 DB；对内存记录数组按同规则扫描）。
 * @param {{ employeeId: number, insuranceType: string, excludeId?: number }} params
 * @param {{ records: object[], businessDay?: string }} opts 内存记录数组（含 is_deleted/is_current/start_date/expire_date/id）
 */
function findActivePolicyConflictInMemory({ employeeId, insuranceType, excludeId } = {}, opts = {}) {
  const records = (opts && opts.records) || [];
  // 任务1（提示词10）：默认业务日必须走上海业务日服务，禁止 UTC toISOString().slice(0,10)
  const businessDay = (opts && opts.businessDay) || getBusinessDayStr();
  const id = employeeId != null ? parseInt(employeeId, 10) : null;
  if (!Number.isInteger(id) || id <= 0 || !insuranceType) {
    return { error: 'duplicate_check_failed' };
  }
  const conflict = records.find((r) => {
    if (!r || r.is_deleted === true) return false;
    // 任务2（提示词11）：只允许有效正整数 employee_id 且严格等于目标员工的记录参与冲突；
    // null/undefined/非法/其他员工全部排除（不回退按姓名或旧 personnel_id 猜测关联）
    const recEmpId = r.employee_id != null ? parseInt(r.employee_id, 10) : null;
    if (!Number.isInteger(recEmpId) || recEmpId <= 0 || recEmpId !== id) return false;
    if (r.insurance_type !== insuranceType) return false;
    if (r.is_current !== true) return false;
    if (excludeId != null && r.id != null && parseInt(r.id, 10) === parseInt(excludeId, 10)) return false;
    const start = r.start_date ? String(r.start_date).slice(0, 10) : null;
    const exp = r.expire_date ? String(r.expire_date).slice(0, 10) : null;
    if (!start || !exp || start > exp) return false;
    return start <= businessDay && exp >= businessDay;
  });
  return conflict ? { conflict: { id: conflict.id } } : { conflict: null };
}

module.exports = {
  findActivePolicyConflict,
  findActivePolicyConflictInMemory,
  isPolicyActiveOnBusinessDay,
};
