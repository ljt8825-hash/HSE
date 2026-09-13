/**
 * 培训模块（/api/training）· 签到表导入 / 补录 / 批量删除 —— service
 * 端点点簇：POST /ledger/signin/recognize、POST /ledger/signin/confirm、
 *           POST /ledger/personnel-summary/batch-create、batch-delete。
 * 含签到表花名册反查/未培训判定/生成培训记录等业务；controller 仅解释描述符。
 */
const shared = require('./trainingShared');
const {
  pool, isConnected, cleanRowText, computeMonthRange, ensureTables,
  resolveTrainingPersonName,
} = shared;

/**
 * 签到表导入：按姓名在花名册（v_employee_org_full）定位在职员工。
 * 在职(relation_status='active') 返回其上级(培训人员)与所属班组/作业中心；
 * 花名册查无此人 → 视为已离职（departed）。
 * @param {string} name 姓名（OCR/签到表文本）
 * @returns {Promise<{matched:boolean, inpost?:boolean, departed?:boolean, employeeId?:number, name?:string,
 *   orgName?:string, orgType?:string, orgPath?:string, positionName?:string,
 *   supervisorId?:number|null, supervisorName?:string|null}>}
 */
async function resolveRosterPerson(name) {
  const nm = name ? String(name).trim() : '';
  if (!nm) return { matched: false, departed: true, name: '' };
  try {
    const r = await pool.query(
      `SELECT employee_id AS "employeeId", name, org_name AS "orgName", org_type AS "orgType",
              org_path AS "orgPath", position_name AS "positionName",
              supervisor_id AS "supervisorId", supervisor_name AS "supervisorName"
         FROM v_employee_org_full
        WHERE name = $1 AND is_deleted = false AND is_current = true AND relation_status = 'active'
        LIMIT 1`,
      [nm],
    );
    if (r.rows.length > 0) return { matched: true, inpost: true, departed: false, ...r.rows[0] };
    return { matched: false, inpost: false, departed: true, name: nm };
  } catch (e) {
    // 视图异常时保守视为已离职，但标记 error 供上层记录
    return { matched: false, inpost: false, departed: true, name: nm, error: e.message };
  }
}

/**
 * 签到表导入：为「已离职」未培训人员定位所属组织（班组/作业中心）的负责人（培训人员）。
 * 已离职者不在花名册，无法经 employee_assignment.supervisor_id 找上级，
 * 故按签到表「部门」字段反查该组织下担任经理/管理员的负责人作为培训人员。
 * @param {string} deptName 签到表「部门」字段
 * @returns {Promise<{trainerId:number, trainerName:string}|null>}
 */
async function resolveOrgTrainer(deptName) {
  const nm = (deptName ? String(deptName) : '').trim();
  if (!nm) return null;
  try {
    const r = await pool.query(
      `SELECT employee_id AS "trainerId", name AS "trainerName"
         FROM v_employee_org_full
        WHERE is_deleted = false AND is_current = true AND relation_status = 'active'
          AND org_name = $1
          AND position_name IN ('乡镇作业中心经理','管理员','环卫作业中心片区长','网格长')
        LIMIT 1`,
      [nm],
    );
    return r.rows.length > 0 ? { trainerId: r.rows[0].trainerId, trainerName: r.rows[0].trainerName } : null;
  } catch (e) {
    return null;
  }
}

/**
 * 签到表导入：按「部门」字段反查该组织下的在职应培训名单（姓名列表）。
 * 用于“未培训 = 应到 − 已签到”的差分判定（实际签到表仅列出已到场人员）。
 * @param {string} deptName 签到表「部门」字段
 * @returns {Promise<string[]|null>} 匹配到组织时返回在职姓名列表，否则 null
 */
async function resolveDeptExpectedNames(deptName) {
  const nm = cleanRowText(deptName);
  if (!nm) return null;
  try {
    const r = await pool.query(
      `SELECT DISTINCT name FROM v_employee_org_full
        WHERE is_deleted = false AND is_current = true AND relation_status = 'active'
          AND (org_name = $1 OR org_path = $1 OR org_path LIKE $1 || '/%'
               OR org_path LIKE '%/' || $1 || '/%')
        ORDER BY name`,
      [nm],
    );
    return r.rows.map((x) => x.name);
  } catch (e) {
    return null;
  }
}

// 按「签到者姓名」反查其所在部门，再取这些部门的应到（在职）名单。
// 规则4口径：一张签到表可能覆盖多个部门（部门字段仅代表其中一页），
// 未培训 = 反查到的各部门应到 − 本表已签到。不依赖 PDF 表头「部门」字段。
async function resolveExpectedByAttendeeNames(attendeeNames) {
  const names = (attendeeNames || [])
    .map((n) => cleanRowText(n)).filter(Boolean);
  if (!names.length) return null;
  try {
    // 1) 反查签到姓名命中部门的 org_path（取签到者所在的部门/作业中心 OID）
    const org = await pool.query(
      `SELECT DISTINCT org_path FROM v_employee_org_full
        WHERE is_deleted = false AND is_current = true AND relation_status = 'active'
          AND name = ANY($1)
          AND (org_type = 'organization' OR org_path <> '')`,
      [names],
    );
    const paths = org.rows.map((r) => r.org_path).filter(Boolean);
    if (!paths.length) return [];
    // 2) 取这些部门下（含其子部门）应到名单
    const r = await pool.query(
      `SELECT DISTINCT name FROM v_employee_org_full
        WHERE is_deleted = false AND is_current = true AND relation_status = 'active'
          AND (org_path = ANY($1)
               OR EXISTS (
                 SELECT 1 FROM unnest($1::text[]) AS p
                 WHERE v_employee_org_full.org_path LIKE p || '/%'
                    OR v_employee_org_full.org_path LIKE '%/' || p || '/%'
               ))
        ORDER BY name`,
      [paths],
    );
    return r.rows.map((x) => x.name);
  } catch (e) {
    return null;
  }
}

// 未培训：单人落定（规则3/4）。在岗→上级+班组/作业中心；查无此人→已离职（按部门反查负责人）
async function classifyUntrained(name, deptName) {
  const nm = cleanRowText(name);
  if (!nm) return null;
  const hit = await resolveRosterPerson(nm);
  if (hit.inpost && hit.employeeId) {
    return {
      name: hit.name || nm, status: 'inpost', employeeId: hit.employeeId,
      orgName: hit.orgName || '', orgType: hit.orgType || '',
      trainerId: hit.supervisorId != null ? hit.supervisorId : null,
      trainerName: hit.supervisorName || '', deptName: hit.orgName || deptName || '',
    };
  }
  const orgTrainer = await resolveOrgTrainer(deptName);
  return {
    name: nm, status: 'departed', employeeId: null,
    orgName: deptName || '', orgType: '',
    trainerId: orgTrainer ? orgTrainer.trainerId : null,
    trainerName: orgTrainer ? orgTrainer.trainerName : '',
    deptName: deptName || '', orgUnassigned: !orgTrainer,
  };
}

// 将已识别未培训去重（name + status）
function dedupeUntrained(list) {
  const seen = new Set();
  const out = [];
  for (const u of list) {
    if (!u || !u.name) continue;
    const key = `${u.name}|${u.status}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(u);
  }
  return out;
}

// 签到表「培训日期」归一化为 YYYY-MM-DD；无法解析时回退当月 1 号
function normalizeSigninDate(raw, fallbackMonth) {
  const text = String(raw || '').trim();
  const fallback = fallbackMonth && /^\d{4}-\d{2}$/.test(fallbackMonth)
    ? `${fallbackMonth}-01` : null;
  if (!text) return fallback;
  const full = text.match(/(\d{4})[年\-/. ]*(\d{1,2})[月\-/. ]*(\d{1,2})/);
  if (full) {
    return `${full[1]}-${String(full[2]).padStart(2, '0')}-${String(full[3]).padStart(2, '0')}`;
  }
  const short = text.match(/(\d{1,2})[月\-/. ]+(\d{1,2})/);
  if (short) {
    const y = fallbackMonth ? fallbackMonth.slice(0, 4) : String(new Date().getFullYear());
    return `${y}-${String(short[1]).padStart(2, '0')}-${String(short[2]).padStart(2, '0')}`;
  }
  return fallback;
}

// 方案A：为签到表「已签到人员」批量生成实际培训记录（training_records）。
// 归属：每个已签到者取花名册上级(supervisor)作为培训人员(trainer_id)，
// 使「按培训人员月度汇总」的实际培训人数 = 该培训人员下已签到人数。
// 幂等：同 培训人员+姓名+内容+日期 的有效记录已存在则跳过，避免重复导入堆叠。
async function generateSigninRecords(names, rawHeaders, monthLabel, sessionRef) {
  if (!isConnected()) return { created: 0, attributed: 0, skipped: 0 };
  const seen = new Set();
  const cleanNames = [];
  for (const n of Array.isArray(names) ? names : []) {
    const t = cleanRowText(n);
    if (t && !seen.has(t)) { seen.add(t); cleanNames.push(t); }
  }
  if (!cleanNames.length) return { created: 0, attributed: 0, skipped: 0 };

  const headers = rawHeaders && typeof rawHeaders === 'object' ? rawHeaders : {};
  const cleanH = (k, alt, ocr) =>
    cleanRowText(headers[k] || headers[alt] || headers[ocr]).replace(/^[：:\s]+/, '');
  const content = cleanH('培训内容', '内容', 'content') || '安全培训';
  const trainingDate = normalizeSigninDate(cleanH('培训日期', '日期', 'training_date'), monthLabel);
  if (!trainingDate) return { created: 0, attributed: 0, skipped: 0 };

  // 1) 批量反查花名册归属（姓名 → 上级/培训人员），与单条 resolveRosterPerson 口径一致
  const roster = await pool.query(
    `SELECT DISTINCT ON (name) name, employee_id AS "employeeId", org_name AS "orgName",
            position_name AS "positionName", supervisor_id AS "supervisorId",
            supervisor_name AS "supervisorName"
       FROM v_employee_org_full
      WHERE name = ANY($1) AND is_deleted = false AND is_current = true
        AND relation_status = 'active'
      ORDER BY name, employee_id`,
    [cleanNames],
  );
  const byName = new Map(roster.rows.map((r) => [r.name, r]));

  const candidates = [];
  for (const nm of cleanNames) {
    const hit = byName.get(nm);
    if (!hit || hit.supervisorId == null) continue; // 查无此人/无上级 → 跳过归属
    candidates.push({
      trainerId: Number(hit.supervisorId),
      employeeId: hit.employeeId != null ? Number(hit.employeeId) : null,
      name: hit.name || nm,
      dept: hit.orgName || '',
      position: hit.positionName || '',
      trainer: hit.supervisorName || '',
    });
  }
  if (!candidates.length) return { created: 0, attributed: 0, skipped: cleanNames.length };

  // 2) 一次查询已存在的（内容+日期都相同），按 trainer_id|name 幂等去重
  const trainerIds = [...new Set(candidates.map((c) => c.trainerId))];
  const cNames = [...new Set(candidates.map((c) => c.name))];
  const exists = await pool.query(
    `SELECT DISTINCT trainer_id, name FROM training_records
      WHERE is_deleted = false AND training_date = $1 AND content = $2
        AND trainer_id = ANY($3) AND name = ANY($4)`,
    [trainingDate, content, trainerIds, cNames],
  );
  const existsKey = new Set(exists.rows.map((r) => `${r.trainer_id}|${String(r.name).trim()}`));

  let created = 0;
  for (const c of candidates) {
    const key = `${c.trainerId}|${c.name}`;
    if (existsKey.has(key)) continue; // 已存在，跳过
    await pool.query(
      `INSERT INTO training_records
         (personnel_id, name, dept, position, training_type, training_date,
          duration_minutes, content, result, score, trainer, remark, employee_id, trainer_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [null, c.name, c.dept, c.position, '安全培训', trainingDate, null, content,
       '合格', null, c.trainer, `签到表导入(${monthLabel})`, c.employeeId, c.trainerId],
    );
    created++;
  }
  return { created, attributed: candidates.length, skipped: cleanNames.length - candidates.length };
}

// ========== POST /ledger/signin/recognize — 识别校验 + 未培训预览（不落库） ==========
async function recognize(body) {
  if (!isConnected()) return { __t: 'error', code: -3, message: '当前为内存模式，不支持签到表登记' };
  const viewerMonth = computeMonthRange(body.month).monthLabel;
  const headers = (body.headers && typeof body.headers === 'object') ? body.headers : {};
  const participants = Array.isArray(body.participants) ? body.participants : [];
  const attendees = Array.isArray(body.attendees) ? body.attendees : [];
  // [DEBUG-TEMP] 定位应到0：记录收到的人数
  try { console.log('[signin-debug] body keys=', Object.keys(body).join(','), 'attendees=', attendees.length, 'participants=', participants.length); } catch(e) {}

  const cleanHeader = (k, alt, ocrKey) =>
    cleanRowText(headers[k] || headers[alt] || headers[ocrKey]).replace(/^[：:\s]+/, '');
  const h = {
    trainingDate: cleanHeader('培训日期', '日期', 'training_date'),
    location: cleanHeader('培训地点', '地点', 'location'),
    host: cleanHeader('主持人', undefined, 'host'),
    recorder: cleanHeader('记录人', undefined, 'recorder'),
    dept: cleanHeader('部门', '单位', 'dept'),
    attendee: cleanHeader('参加人数', '参加人员', 'attendee'),
    content: cleanHeader('培训内容', '内容', 'content'),
  };

  // 规则1：必填表头字段
  const headerIssues = [];
  if (!h.trainingDate) headerIssues.push('培训日期');
  if (!h.location) headerIssues.push('培训地点');
  if (!h.host) headerIssues.push('主持人');
  if (!h.recorder) headerIssues.push('记录人');
  if (!h.dept) headerIssues.push('部门');
  if (!h.attendee) headerIssues.push('参加人数');
  const infoIncomplete = headerIssues.length > 0;

  // 规则2：培训内容
  const contentMissing = !h.content;

  // 已签到集合：由 attendees（签到表姓名列）与 participants(attended=true) 构成
  const signed = new Set();
  attendees.forEach((n) => { const t = cleanRowText(n); if (t) signed.add(t); });
  participants.forEach((p) => {
    if (p.attended === true || p.attended === 'true' || p.attended === 1) {
      const t = cleanRowText(p && p.name);
      if (t) signed.add(t);
    }
  });

  const untrained = [];
  const unassigned = [];

  // 路径A（规则3·预印版签到表）：姓名在册但右侧为空 → 直接判定未培训
  for (const p of participants) {
    const isExplicitUntrained =
      (p.attended === false || p.attended === 'false' || p.attended === 0)
      && cleanRowText(p.name);
    if (!isExplicitUntrained) continue;
    const u = await classifyUntrained(p.name, h.dept);
    untrained.push(u);
    if (u && u.status === 'departed' && u.orgUnassigned) unassigned.push(u.name);
  }

  // 路径B（实际签到表）：未培训 = 反查签到者所属部门的应到(在职) − 本表已签到
  // 规则4口径：以「姓名反查花名册的部门」为准，不依赖 PDF 表头「部门」字段
  // （表头部门仅代表其中一页，PDF 多页时逐页部门不同，直接差分会取空）。
  const expectedNames = await resolveExpectedByAttendeeNames([...attendees, ...participants.map((p) => p.name)]);
  if (expectedNames && expectedNames.length > 0 && signed.size > 0) {
    for (const nm of expectedNames) {
      if (signed.has(nm)) continue;
      const u = await classifyUntrained(nm, h.dept);
      untrained.push(u);
      if (u && u.status === 'departed' && u.orgUnassigned) unassigned.push(u.name);
    }
  }

  const deduped = dedupeUntrained(untrained);
  return {
    __t: 'json',
    payload: {
      month: viewerMonth,
      header: h,
      infoIncomplete,
      headerIssues,
      contentMissing,
      expectedCount: expectedNames ? expectedNames.length : null,
      signedCount: signed.size,
      untrained: deduped,
      unassigned,
      counts: {
        inpost: deduped.filter((u) => u.status === 'inpost').length,
        departed: deduped.filter((u) => u.status === 'departed').length,
      },
    },
    message: infoIncomplete || contentMissing ? '签到表存在信息缺失，请核对' : '识别完成',
  };
}

// ========== POST /ledger/signin/confirm — 将未培训固化到 hse_untrained_log（幂等 upsert） ==========
async function confirm(body) {
  if (!isConnected()) return { __t: 'error', code: -3, message: '当前为内存模式，不支持登记' };
  const viewerMonth = computeMonthRange(body.month).monthLabel;
  const untrained = Array.isArray(body.untrained) ? body.untrained : [];
  const sessionRef = cleanRowText(body.sessionRef || body.headers?.dept || '签到表导入');

  // 1) 未培训登记（幂等 upsert）——0 人也是合法签到完成，不报错
  let wrote = 0;
  let updated = 0;
  if (untrained.length) {
    for (const u of untrained) {
      const nm = cleanRowText(u.name);
      const status = u.status === 'departed' ? 'departed' : 'inpost';
      if (!nm) continue;
      const trainerId = u.trainerId != null ? Number(u.trainerId) : null;
      const employeeId = u.employeeId != null ? Number(u.employeeId) : null;
      const trainerName = cleanRowText(u.trainerName);
      const deptName = cleanRowText(u.deptName);
      if (trainerId == null) {
        // 无法归属到任何培训人员的，不落库，避免静默丢在汇总外
        continue;
      }
      const r = await pool.query(
        `INSERT INTO hse_untrained_log
           (trainer_id, trainer_name, month, employee_id, name, dept_name, status, record_type, session_ref)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (trainer_id, month, name, status)
         DO UPDATE SET employee_id = EXCLUDED.employee_id, dept_name = EXCLUDED.dept_name,
                       trainer_name = EXCLUDED.trainer_name,
                       record_type = EXCLUDED.record_type, session_ref = EXCLUDED.session_ref
         RETURNING (xmax = 0) AS inserted_new`,
        [trainerId, trainerName || null, viewerMonth, employeeId, nm,
         deptName || null, status, 'signin-import', sessionRef],
      );
      if (r.rows[0] && r.rows[0].inserted_new) wrote += 1;
      else updated += 1;
    }
  }

  // 2) 方案A：为「已签到人员」同步生成实际培训记录（training_records），幂等去重
  const attendees = Array.isArray(body.attendees) ? body.attendees : [];
  let generated = { created: 0, attributed: 0, skipped: 0 };
  try {
    generated = await generateSigninRecords(attendees, body.headers, viewerMonth, sessionRef);
  } catch (err) {
    // 生成实际培训记录失败不阻断未培训登记结果，仅透出提示
    console.error('[signin-confirm] 生成培训记录失败:', err.message);
  }

  const msg = [
    wrote + updated > 0 ? `未培训 登记 ${wrote} 条/更新 ${updated} 条` : '',
    generated.created > 0 ? `已签到记录生成培训记录 ${generated.created} 条` : '',
  ].filter(Boolean).join('；') || '本次签到未产生登记/记录（0 人出席或均已登记）';
  return {
    __t: 'json',
    payload: { wrote, updated, generated, month: viewerMonth },
    message: msg,
  };
}

// ========== POST /ledger/personnel-summary/batch-create — 批量录入培训记录 ==========
async function batchCreate(body) {
  const {
    trainerIds, name, trainingType, trainingDate,
    durationMinutes, content, score, result, trainingPlanId,
  } = body;
  const ids = Array.isArray(trainerIds)
    ? trainerIds.filter((v) => v != null).map(Number)
    : (trainerIds != null ? [Number(trainerIds)] : []);
  if (!ids.length) return { __t: 'error', code: -2, message: '请选择培训人员' };
  if (!trainingDate) return { __t: 'error', code: -2, message: '请填写培训日期' };
  await ensureTables();
  let created = 0;
  for (const trainerId of ids) {
    const trainerName = await resolveTrainingPersonName(trainerId);
    const finalName = (name && String(name).trim()) || trainerName || '培训登记';
    const insertResult = await pool.query(
      `INSERT INTO training_records
         (personnel_id, name, dept, position, training_type, training_date,
          duration_minutes, content, result, score, trainer, employee_id, trainer_id, training_plan_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [null, finalName, '', '', '安全培训', trainingDate,
        durationMinutes || 0, content || '', result || '合格', score || null,
        trainerName || '', null, trainerId, trainingPlanId || null],
    );
    if (insertResult.rows.length) created++;
  }
  return { __t: 'json', payload: { created }, message: created ? `批量录入成功，新增 ${created} 条` : '未新增任何培训记录' };
}

// ========== POST /ledger/personnel-summary/batch-delete — 批量删除培训记录 ==========
async function batchDelete(body) {
  const { trainerIds, month } = body;
  const ids = Array.isArray(trainerIds)
    ? trainerIds.filter((v) => v != null).map(Number)
    : (trainerIds != null ? [Number(trainerIds)] : []);
  if (!ids.length) return { __t: 'error', code: -2, message: '请选择培训人员' };
  await ensureTables();
  const { startDate, endDate } = computeMonthRange(month);
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
  const result = await pool.query(
    `UPDATE training_records SET is_deleted = true, updated_at = CURRENT_TIMESTAMP
       WHERE trainer_id IN (${placeholders}) AND is_deleted = false
         AND training_date >= $${ids.length + 1} AND training_date < $${ids.length + 2}
       RETURNING id`,
    [...ids, startDate, endDate],
  );
  return { __t: 'json', payload: { deleted: result.rowCount || 0 }, message: `已删除 ${result.rowCount || 0} 条培训记录` };
}

module.exports = {
  recognize,
  confirm,
  batchCreate,
  batchDelete,
  // 供其他场景按需复用（保持与各端点口径一致）
  resolveRosterPerson,
  resolveOrgTrainer,
  classifyUntrained,
  dedupeUntrained,
};