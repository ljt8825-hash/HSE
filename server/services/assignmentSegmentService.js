/**
 * M1-01-A · 统一任职段写入服务（assignmentSegmentService）
 *
 * 职责：把「关旧段 / 建新段 / 当前段数量保护」收敛到唯一一处，
 *       供 assignEmployee / rehireEmployee / terminateEmployee 三个核心入口在
 *       【已持有事务 client】的前提下调用。
 *
 * 硬约束（违反即违反任务书 M1-01-A，亦违反本仓库红线）：
 *   1. 必须接收调用方传入的事务 client；内部【禁止】pool.connect / BEGIN / COMMIT / ROLLBACK / 自建事务 / 独立连接；
 *   2. 不修改 employee.employment_relation；不修改身份 / 组织主数据 / 考核数据；
 *   3. 不反向锁 employee（调用方已锁，本函数只按 id 关闭、按 params 新建）；
 *   4. 当前段数量保护：A=0 放行 / B=1 关闭并校验 rowCount / C=>1 拒绝；
 *   5. 保留调用方的权限校验、资格判断、终态规则、业务事件、员工历史、审计与提交顺序（本函数不负责这些）。
 *
 * 设计要点：
 *   - V1/V2/terminate 历史关闭谓词不同，本服务【不强行统一成一条 SQL】，
 *     而是按 scenario 选择关闭谓词（ASSIGN 仅按 id 关闭；TERMINATE 带 status + 幂等谓词）；
 *   - 关闭与新建都【不重新 SELECT 当前段】，currentSegments 由调用方传入，
 *     以保留各入口既有的事务顺序与精确 SQL 断言（见各入口单测）。
 */

const {
  normalizeStatusOrDefault,
  isWritableStatus,
} = require('./employeeStatusDict');

// ============================================================
// 错误类型
// ============================================================

/** C 场景（多条当前段）→ 数据异常，必须由调用方转化为业务冲突返回，不得抛 500 */
class SegmentConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SegmentConflictError';
    this.code = 'SEGMENT_CONFLICT';
  }
}

/** B 场景关闭段 rowCount !== 1（记录可能已被并发修改）→ 由调用方整体回滚 */
class SegmentCloseFailedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SegmentCloseFailedError';
    this.code = 'SEGMENT_CLOSE_FAILED';
  }
}

// ============================================================
// 关闭谓词（按场景收敛，不强行统一）
// ============================================================

/**
 * 返回关闭单条当前段的 SQL 与参数构造器。
 * @param {'ASSIGN'|'REHIRE'|'TERMINATE'} scenario
 * @returns {{text: string, buildParams: (seg: Object, opts: {endDate: string, closeStatus: string}) => Array}}
 */
function buildCloseStatement(scenario) {
  switch (scenario) {
    case 'TERMINATE':
      // 终态关闭：写入 status=inactive + is_current=false + end_date，并带 is_current/is_deleted 幂等谓词
      return {
        text:
          `UPDATE employee_assignment
             SET status = $2, is_current = false, end_date = $3, updated_at = NOW()
           WHERE id = $1 AND is_current = true AND is_deleted = false`,
        buildParams: (seg, { endDate, closeStatus }) => [seg.id, closeStatus, endDate],
      };
    case 'ASSIGN':
    case 'REHIRE':
    default:
      // ASSIGN（含 REHIRE 兜底）：沿用 assignEmployee 历史谓词，仅按 id 关闭
      // （REHIRE 场景实际不会到达关闭分支，因入口已拒绝「存在当前段」）
      return {
        text:
          `UPDATE employee_assignment
             SET is_current = false, end_date = $2, updated_at = NOW()
           WHERE id = $1`,
        buildParams: (seg, { endDate }) => [seg.id, endDate],
      };
  }
}

// ============================================================
// 核心：writeSegment
// ============================================================

/**
 * 统一任职段写入。
 *
 * @param {Object} client - 调用方持有并发起的事务连接（必须已 BEGIN）
 * @param {Object} params
 * @param {number|string} params.employeeId - 员工 ID（仅用于错误文案，不参与写入）
 * @param {'ASSIGN'|'REHIRE'|'TERMINATE'} params.scenario - 调用场景，决定关闭谓词
 * @param {Array} [params.currentSegments] - 调用方已锁定的「当前有效任职段」读取结果
 *                                          （必须来自调用方既有 SELECT，**本函数不再 SELECT**）
 * @param {Object} [params.newSegment] - 待建新段；TERMINATE 场景不传（仅关闭）
 * @param {string} [params.closeStatus] - 关闭时写入的段状态（TERMINATE 用 inactive；ASSIGN 不写 status）
 * @param {string} [params.endDate] - 关闭段时写入的 end_date（ASSIGN=新段生效日-1；TERMINATE=业务事件日）
 * @returns {Promise<{closed: (Object|null), inserted: (Object|null)}>}
 *          closed = 被关闭的段记录（B 场景）或 null；inserted = 新建段 RETURNING 行 或 null
 */
async function writeSegment(client, params) {
  if (!client || typeof client.query !== 'function') {
    throw new Error('writeSegment: 必须传入已开启事务的 client（禁止内部 pool.connect）');
  }
  const {
    employeeId,
    scenario,
    currentSegments = [],
    newSegment,
    closeStatus,
    endDate,
  } = params || {};

  if (!['ASSIGN', 'REHIRE', 'TERMINATE'].includes(scenario)) {
    throw new Error(`writeSegment: 未知 scenario「${scenario}」`);
  }

  const segments = Array.isArray(currentSegments) ? currentSegments : [];
  const n = segments.length;

  let closed = null;
  let inserted = null;

  // ── A/B/C 当前段数量保护 ──────────────────────────────────
  if (n === 0) {
    // A：无当前段。是否建新段由 newSegment 决定（REHIRE / ASSIGN 正常入职路径）。
  } else if (n === 1) {
    // B：恰好一条当前段 → 按 id 关闭，并强校验 rowCount。
    const seg = segments[0];
    const { text, buildParams } = buildCloseStatement(scenario);
    const closeRes = await client.query(text, buildParams(seg, { endDate, closeStatus }));
    if (!closeRes || closeRes.rowCount !== 1) {
      throw new SegmentCloseFailedError(
        `writeSegment[${scenario}]：关闭当前任职段(ID=${seg.id})影响行数=`
          + `${closeRes ? closeRes.rowCount : 'null'}，期望=1；`
          + '记录可能已被并发修改，整体事务应由调用方回滚。'
      );
    }
    closed = seg;
  } else {
    // C：多条当前段 → 数据异常，writeSegment 不猜测应关闭哪一条。
    throw new SegmentConflictError(
      `员工(ID=${employeeId})存在 ${n} 条 is_current=true 的任职段，属数据异常；`
      + 'writeSegment 不猜测应关闭哪一条，请先人工核实后再操作。'
    );
  }

  // ── 新建段（仅当调用方传入 newSegment；TERMINATE 仅关闭、不新建）──
  if (newSegment) {
    const normalizedStatus = normalizeStatusOrDefault(newSegment.status, 'active');
    if (!normalizedStatus || !isWritableStatus(normalizedStatus)) {
      throw new Error(
        `writeSegment: 无法识别的任职状态「${newSegment.status}」，可选: 在职/待岗/借调/停薪留职/离职/辞职/死亡/退休/返聘`
      );
    }
    const insertRes = await client.query(
      `INSERT INTO employee_assignment (
        employee_id, org_unit_id, position_id, supervisor_id,
        status, is_current, is_primary, start_date, remark, created_by
      ) VALUES ($1, $2, $3, $4, $5, true, true, $6, $7, $8)
      RETURNING *`,
      [
        newSegment.employee_id,
        newSegment.org_unit_id || null,
        newSegment.position_id || null,
        newSegment.supervisor_id || null,
        normalizedStatus,
        newSegment.start_date,
        newSegment.remark || null,
        newSegment.created_by || null,
      ]
    );
    if (!insertRes || !insertRes.rows || insertRes.rows.length === 0) {
      throw new Error('writeSegment: 新任职段未能创建（INSERT 返回空结果）');
    }
    inserted = insertRes.rows[0];
  }

  return { closed, inserted };
}

module.exports = {
  writeSegment,
  SegmentConflictError,
  SegmentCloseFailedError,
};
