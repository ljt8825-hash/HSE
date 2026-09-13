/**
 * 培训模块（/api/training）· 培训台账 —— service
 * 端点点簇：/ledger/export、/ledger/months、/ledger/personnel-summary(+export/records/untrained)、
 *           /ledger/monthly-import、/ledger/plan-content-options、/ledger/training-type-options。
 * 保留 PostgreSQL + 内存降级；controller 仅解释描述符。
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const XLSX = require('xlsx');
const shared = require('./trainingShared');
const {
  pool, isConnected, ensureTables, computeMonthRange, calcExpiryStatus,
  camelKeys, formatRecordRow, buildTrainingCsvExport,
} = shared;

// ========== GET /ledger/export — 导出培训台账（CSV） ==========
async function exportLedger() {
  if (!isConnected()) {
    shared.initMemoryData();
    const data = shared.memoryRecords.filter(r => !r.is_deleted);
    return { __t: 'csv', ...buildTrainingCsvExport(data) };
  }

  const result = await pool.query(`
    SELECT id, name, dept, position, training_type, training_date, duration_minutes,
           content, result, score, trainer, remark, personnel_type, validity, created_at
    FROM training_records WHERE is_deleted = FALSE ORDER BY training_date DESC NULLS LAST, id DESC
  `);
  return { __t: 'csv', ...buildTrainingCsvExport(result.rows) };
}

// ========== GET /ledger/months — 有月度培训台账数据的月份（倒序） ==========
async function getLedgerMonths() {
  const r = await pool.query(
    `SELECT DISTINCT month FROM hse_training_ledger_monthly ORDER BY month DESC`,
  );
  return { __t: 'json', payload: { months: r.rows.map((x) => x.month) }, message: '查询成功' };
}

// 人员月度汇总查询（列表 / 导出共用）
async function loadPersonnelSummary(month) {
  await ensureTables();
  const { startDate, endDate, monthLabel } = computeMonthRange(month);
  const rows = await pool.query(
    `WITH monthly AS (
        SELECT trainer_id, trainer_name, expected_count, actual_count, missing_count, incomplete_count
        FROM hse_training_ledger_monthly
        WHERE month = $1
     ), untrained AS (
        SELECT trainer_id,
               COUNT(*) FILTER (WHERE status = 'inpost')::int AS untrained_inpost,
               COUNT(*) FILTER (WHERE status = 'departed')::int AS untrained_departed,
               string_agg(DISTINCT CASE WHEN status = 'inpost' THEN name END, '、') AS inpost_names,
               string_agg(DISTINCT CASE WHEN status = 'departed' THEN name END, '、') AS departed_names
        FROM hse_untrained_log
        WHERE month = $1
        GROUP BY trainer_id
     )
     SELECT COALESCE(m.trainer_id, 0) AS "employeeId",
            COALESCE(e.name, m.trainer_name) AS name,
            COALESCE(e.org_name, '') AS "department",
            COALESCE(e.position_name, '') AS "position",
            COALESCE(e.org_type, '') AS "orgType",
            m.expected_count AS "expectedCount",
            m.actual_count AS "actualCount",
            m.missing_count AS "monthlyMissing",
            COALESCE(m.incomplete_count, 0) AS "incompleteCount",
            COALESCE(u.untrained_inpost, 0) AS "untrainedInpost",
            COALESCE(u.untrained_departed, 0) AS "untrainedDeparted",
            COALESCE(u.inpost_names, '') AS "inpostNames",
            COALESCE(u.departed_names, '') AS "departedNames"
     FROM monthly m
       LEFT JOIN v_employee_org_full e ON e.employee_id = m.trainer_id
       LEFT JOIN untrained u ON u.trainer_id = m.trainer_id
     ORDER BY "department", name`,
    [monthLabel],
  );
  return rows.rows.map((r) => {
    const { expectedCount, actualCount, untrainedInpost, untrainedDeparted, monthlyMissing } = r;
    const importedTotal = (untrainedInpost || 0) + (untrainedDeparted || 0);
    const missingCount = monthlyMissing != null
      ? monthlyMissing
      : (importedTotal > 0
          ? importedTotal
          : ((expectedCount || 0) - (actualCount || 0)));
    return { ...r, month: monthLabel, missingCount, expectedCount, actualCount };
  });
}

// ========== GET /ledger/personnel-summary — 培训人员月度汇总 ==========
async function getPersonnelSummary(month) {
  await ensureTables();
  const { monthLabel } = computeMonthRange(month);
  const list = await loadPersonnelSummary(month);
  return { __t: 'json', payload: { list, total: list.length, month: monthLabel }, message: '查询成功' };
}

// ========== GET /ledger/personnel-summary/export — 人员月度汇总导出 ==========
async function exportPersonnelSummary(month) {
  if (!isConnected()) return { __t: 'error', code: -2, message: '内存模式下不支持导出，请连接数据库' };
  const list = await loadPersonnelSummary(month);
  const headers = ['姓名', '部门', '岗位', '培训日期', '应培训人数', '实际培训人数', '缺少人数', '资料不完整', '在岗未培训人员', '离职未培训人员'];
  const rows = list.map((r) => [
    r.name || '',
    r.department || '',
    r.position || '',
    r.month || '',
    r.expectedCount != null ? r.expectedCount : '',
    r.actualCount != null ? r.actualCount : '',
    r.missingCount != null ? r.missingCount : '',
    r.incompleteCount != null ? r.incompleteCount : '',
    (r.inpostNames || ''),
    (r.departedNames || ''),
  ].map((v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`).join(','));
  const csv = '\uFEFF' + headers.map((h) => `"${h}"`).join(',') + '\n' + rows.join('\n');
  return { __t: 'csv', contentDisposition: `attachment; filename="personnel_summary_${new Date().toISOString().slice(0, 10)}.csv"`, csv };
}

// ========== POST /ledger/monthly-import — 月度培训台账 Excel 导入 ==========
// 口径：培训人数→应培训、未培训人数→实际、缺少签字人数→缺少、资料不完整→资料不完整
// 按培训人姓名聚合；导入前清空该月 hse_training_ledger_monthly 数据（覆盖式导入）
async function importMonthlyLedger(file, monthBody) {
  if (!isConnected()) return { __t: 'error', code: -2, message: '内存模式下不支持导入，请连接数据库' };
  if (!file) return { __t: 'error', code: -2, message: '请上传 Excel 文件' };
  await ensureTables();
  const month = monthBody && /^\d{4}-\d{2}$/.test(String(monthBody))
    ? String(monthBody)
    : computeMonthRange(null).monthLabel;

  const wb = XLSX.readFile(file.path);
  const sheetName = wb.SheetNames.find((n) => String(n).includes('月度培训台账')) || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });

  // 定位表头行（需含「培训人」列；人数列兼容新旧两种表头）
  // 新版：培训人数/未培训人数/缺少签字人数/资料不完整
  // 旧版：应到人数/实到人数/缺少签字人数（无资料不完整）
  let headerRowIdx = -1;
  let headerMap = {};
  for (let i = 0; i < Math.min(raw.length, 10); i++) {
    const row = raw[i] || [];
    const idx = {};
    row.forEach((v, c) => {
      const t = String(v == null ? '' : v).replace(/\s+/g, '');
      if (t) idx[t] = c;
    });
    if (idx['培训人'] != null && (idx['培训人数'] != null || idx['应到人数'] != null)) {
      headerRowIdx = i;
      headerMap = idx;
      break;
    }
  }
  if (headerRowIdx < 0) {
    return { __t: 'error', code: -2, message: `未在「${sheetName}」工作表中找到表头（需含「培训人」及「培训人数/应到人数」列）` };
  }

  const colTrainer = headerMap['培训人'];
  const colExpected = headerMap['培训人数'] != null ? headerMap['培训人数'] : headerMap['应到人数'];
  const colActual = headerMap['未培训人数'] != null ? headerMap['未培训人数'] : headerMap['实到人数'];
  const colMissing = headerMap['缺少签字人数'];
  // 兼容两种表头写法：旧「资料不完整」/ Excel 常用「表头内容缺失」
  const colIncomplete = headerMap['资料不完整'] != null
    ? headerMap['资料不完整']
    : (headerMap['表头内容缺失'] != null ? headerMap['表头内容缺失'] : null);

  const toInt = (v) => {
    if (v == null || v === '') return 0;
    const n = parseInt(String(v).replace(/[^\d.-]/g, ''), 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };

  // 按培训人姓名聚合（同一培训人多场次求和）
  const agg = new Map();
  for (let i = headerRowIdx + 1; i < raw.length; i++) {
    const row = raw[i] || [];
    let name = String(row[colTrainer] == null ? '' : row[colTrainer]).trim();
    // 培训人列含顿号时取第一个名字（如「刘金涛、张玉祯」→「刘金涛」）
    if (name.includes('、')) name = name.split('、')[0].trim();
    if (!name) continue;
    const cur = agg.get(name) || { name, expected: 0, actual: 0, missing: 0, incomplete: 0 };
    cur.expected += toInt(row[colExpected]);
    cur.actual += toInt(row[colActual]);
    cur.missing += toInt(row[colMissing]);
    cur.incomplete += toInt(row[colIncomplete]);
    agg.set(name, cur);
  }
  if (agg.size === 0) return { __t: 'error', code: -2, message: '未解析到任何培训人数据' };

  // 培训人姓名 → employee_id（v_employee_org_full 在职在册）
  const names = [...agg.keys()];
  const empRes = await pool.query(
    `SELECT employee_id, name FROM v_employee_org_full
      WHERE is_deleted = false AND is_current = true AND name = ANY($1)`,
    [names],
  );
  const nameToId = new Map();
  empRes.rows.forEach((r) => {
    if (!nameToId.has(r.name)) nameToId.set(r.name, r.employee_id);
  });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM hse_training_ledger_monthly WHERE month = $1', [month]);
    for (const item of agg.values()) {
      await client.query(
        `INSERT INTO hse_training_ledger_monthly
           (trainer_id, trainer_name, month, expected_count, actual_count, missing_count, incomplete_count, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'excel-import')
         ON CONFLICT (trainer_id, month) DO UPDATE SET
           trainer_name = EXCLUDED.trainer_name,
           expected_count = EXCLUDED.expected_count,
           actual_count = EXCLUDED.actual_count,
           missing_count = EXCLUDED.missing_count,
           incomplete_count = EXCLUDED.incomplete_count,
           updated_at = CURRENT_TIMESTAMP`,
        [nameToId.get(item.name) || null, item.name, month, item.expected, item.actual, item.missing, item.incomplete],
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  const unmatched = names.filter((n) => !nameToId.has(n));
  try { fs.unlinkSync(file.path); } catch (e) { /* 忽略 */ }
  const values = [...agg.values()];
  return {
    __t: 'json',
    payload: {
      month,
      sheet: sheetName,
      trainers: agg.size,
      unmatched,
      expectedTotal: values.reduce((s, x) => s + x.expected, 0),
      actualTotal: values.reduce((s, x) => s + x.actual, 0),
      missingTotal: values.reduce((s, x) => s + x.missing, 0),
      incompleteTotal: values.reduce((s, x) => s + x.incomplete, 0),
    },
    message: '月度培训台账导入成功',
  };
}

// ========== GET /ledger/personnel-summary/:employeeId/records — 培训人员当月培训明细 ==========
async function getPersonnelRecords(employeeId, month, page, pageSize) {
  const { startDate, endDate } = computeMonthRange(month);
  const empId = parseInt(employeeId);
  if (!empId) return { __t: 'error', code: -2, message: '参数错误' };
  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM training_records tr
      WHERE tr.is_deleted = false AND tr.trainer_id = $1
        AND tr.training_date >= $2 AND tr.training_date < $3`,
    [empId, startDate, endDate],
  );
  const total = countResult.rows[0].total;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  const resultList = await pool.query(
    `SELECT tr.*, sup.id AS supervisor_id, sup.name AS supervisor_name
       FROM training_records tr
       LEFT JOIN employee_assignment ea
         ON tr.employee_id = ea.employee_id AND ea.is_primary = true
        AND ea.is_current = true AND ea.is_deleted = false
       LEFT JOIN employee sup ON ea.supervisor_id = sup.id AND sup.is_deleted = false
      WHERE tr.is_deleted = false AND tr.trainer_id = $1
        AND tr.training_date >= $2 AND tr.training_date < $3
      ORDER BY tr.training_date DESC NULLS LAST, tr.id DESC
      LIMIT $4 OFFSET $5`,
    [empId, startDate, endDate, parseInt(pageSize), offset],
  );
  return { __t: 'list', list: resultList.rows.map(formatRecordRow), total, page: parseInt(page), pageSize: parseInt(pageSize), message: '查询成功' };
}

// ========== GET /ledger/plan-content-options — 培训计划内容下拉 ==========
async function getPlanContentOptions(query) {
  if (!isConnected()) {
    const list = shared.memoryTrainingPlans.filter((r) => !r.is_deleted).map((r) => ({
      id: r.id,
      label: `${(r.title || '').trim() || (r.content || '').trim() || `计划#${r.id}`}`,
      content: r.content || '',
      trainingType: r.training_type || 'HSE',
      startDate: r.start_date ? String(r.start_date).slice(0, 10) : null,
      status: r.status || 'draft',
    }));
    return { __t: 'json', payload: { list }, message: '查询成功(内存模式)' };
  }
  await ensureTables();
  // 计划表是否已有 month 列（结构未定，做向下兼容：有 month 列且传了月份才按月过滤）
  const month =
    query.month && /^\d{4}-\d{2}$/.test(String(query.month))
      ? String(query.month)
      : null;
  let hasMonth = false;
  try {
    const cc = await pool.query(
      `SELECT COUNT(*)::int AS c FROM information_schema.columns
         WHERE table_name = 'training_plans' AND column_name = 'month'`,
    );
    hasMonth = (cc.rows[0]?.c ?? 0) > 0;
  } catch { hasMonth = false; }
  const sqlParams = [];
  let whereMonth = '';
  if (hasMonth && month) {
    sqlParams.push(month);
    whereMonth = ` AND (month IS NULL OR month = $${sqlParams.length})`;
  }
  const result = await pool.query(
    `SELECT id, title, content, training_type, start_date, status
       FROM training_plans WHERE is_deleted = false${whereMonth}
      ORDER BY (start_date IS NULL) ASC, start_date DESC`,
    sqlParams,
  );
  const list = result.rows.map((r) => ({
    id: r.id,
    label: `${(r.title || '').trim() || (r.content || '').trim() || `计划#${r.id}`}`,
    content: r.content || '',
    trainingType: r.training_type || 'HSE',
    startDate: r.start_date ? String(r.start_date).slice(0, 10) : null,
    status: r.status || 'draft',
  }));
  return { __t: 'json', payload: { list }, message: '查询成功' };
}

// ========== GET /ledger/training-type-options — 培训类型动态选项 ==========
async function getTrainingTypeOptions() {
  const list = [];
  if (isConnected()) {
    await ensureTables();
    const r = await pool.query(
      `SELECT DISTINCT trim(training_type) AS t FROM training_records
        WHERE training_type IS NOT NULL AND trim(training_type) <> ''
        ORDER BY t`,
    );
    r.rows.forEach((x) => { const v = String(x.t); if (v && !list.includes(v)) list.push(v); });
  }
  return { __t: 'json', payload: { list }, message: '查询成功' };
}

// ========== GET /ledger/personnel-summary/:employeeId/untrained — 某培训人员当月未培训名单 ==========
async function getUntrained(employeeId, month) {
  const monthLabel = computeMonthRange(month).monthLabel;
  const trainerId = parseInt(employeeId);
  if (!trainerId) return { __t: 'error', code: -2, message: '参数错误' };
  const r = await pool.query(
    `SELECT id, name, dept_name AS "deptName", status, employee_id AS "employeeId",
            trainer_name AS "trainerName",
            to_char(created_at, 'YYYY-MM-DD HH24:MI') AS "createdAt"
       FROM hse_untrained_log
      WHERE trainer_id = $1 AND month = $2
      ORDER BY status, created_at DESC, id`,
    [trainerId, monthLabel],
  );
  return { __t: 'json', payload: { list: r.rows, month: monthLabel, total: r.rows.length }, message: '查询成功' };
}

module.exports = {
  exportLedger,
  getLedgerMonths,
  getPersonnelSummary,
  exportPersonnelSummary,
  importMonthlyLedger,
  getPersonnelRecords,
  getPlanContentOptions,
  getTrainingTypeOptions,
  getUntrained,
};