/**
 * 花名册导入（/api/hse）roster-import + import-mapping-rules + import-batches —— service 层
 * 原 routes/hse-roster-import.js 的业务逻辑全部下沉至此：
 *   - Excel 上传解析/预览（STANDARD_HEADERS 表头映射、出生日期/性别从身份证推导）
 *   - 组织匹配（hse_org_unit）与岗位匹配（position + hse_position_alias 别名，含歧义）
 *   - 责任类型生成（hse_responsibility_config）
 *   - 确认导入暂存（hse_import_pending）+ 网格长同步（grid_areas 更新/新增）
 *   - 待确认列表、映射规则管理、批次列表
 *
 * 契约：每个对外函数返回统一描述符
 *   - 成功 JSON：{ __t:'json', payload, message }（等价原 res.json(success(...))）
 *   - 业务错误：{ __t:'json', error:{code,message} }（等价原 res.json(error(...))）
 *     code 语义：原文件一律 error('...')（默认 -1）；0-row / 参数分支见各函数。
 *
 * 异常约定：本域各端点错误 message 前缀各不相同（「解析失败:」「确认失败:」
 *   「获取待确认列表失败:」…），且逐一 console.error 原日志。故每个对外函数在
 *   service 层内保留原 try/catch 并返回对应前缀的错误描述符；controller 的 run()
 *   仅作兜底（service 实际不会抛出，路由/上传中间件异常除外）。
 */
const XLSX = require('xlsx');
const { pool } = require('../config/db');
const { fixFilenameEncoding, deleteFile } = require('../middleware/upload');

// ============================================================
// 常量
// ============================================================
/** Excel标准表头映射 */
const STANDARD_HEADERS = {
  '员工编号': 'employee_code',
  '姓名': 'name',
  '身份证号': 'id_card',
  '性别': 'gender',
  '出生日期': 'birth_date',
  '所属部门': 'raw_dept',
  '班组': 'raw_team',
  '职位': 'raw_position',
  '入职日期': 'hire_date',
  '联系电话': 'phone',
  '是否驾驶员': 'is_driver',
  '驾驶证类型': 'license_type'
};

const VALID_GENDERS = ['男', '女'];

// ============================================================
// 统一描述符
// ============================================================
const ok = (payload, message) => ({ __t: 'json', payload, message });
const errF = (message) => ({ __t: 'json', error: { code: -1, message } }); // error('...')，默认 -1

// ============================================================
// 辅助函数
// ============================================================
function normalizeDate(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') {
    const d = XLSX.SSF.parse_date_code(value);
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  const s = String(value).trim();
  const m = s.match(/^(\d{4})[.\/\-](\d{1,2})[.\/\-](\d{1,2})$/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  return s;
}

function generateBatchNo() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `IMPORT-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}-${String(Math.random()).slice(2, 6)}`;
}

function parseRow(rawRow, rowIndex) {
  const result = { row_index: rowIndex };
  for (const [cnHeader, dbField] of Object.entries(STANDARD_HEADERS)) {
    if (rawRow[cnHeader] !== undefined && rawRow[cnHeader] !== '') {
      result[dbField] = rawRow[cnHeader];
    }
  }
  if (result.birth_date) result.birth_date = normalizeDate(result.birth_date);
  if (result.hire_date) result.hire_date = normalizeDate(result.hire_date);
  if (result.phone !== undefined) result.phone = String(result.phone).trim();
  if (result.employee_code !== undefined) result.employee_code = String(result.employee_code).trim();
  if (result.name) result.name = String(result.name).trim();
  if (result.id_card) result.id_card = String(result.id_card).trim();
  if (result.gender) result.gender = String(result.gender).trim();
  if (result.raw_dept) result.raw_dept = String(result.raw_dept).trim();
  if (result.raw_team) result.raw_team = String(result.raw_team).trim();
  if (result.raw_position) result.raw_position = String(result.raw_position).trim();
  if (result.is_driver !== undefined) {
    const v = String(result.is_driver).trim().toLowerCase();
    result.is_driver = ['是', 'true', '1', 'yes', 'y'].includes(v);
  }
  if (result.id_card && /^\d{17}[\dXx]$/.test(result.id_card)) {
    if (!result.birth_date) {
      result.birth_date = `${result.id_card.substring(6, 10)}-${result.id_card.substring(10, 12)}-${result.id_card.substring(12, 14)}`;
    }
    if (!result.gender) {
      const sexCode = parseInt(result.id_card.substring(16, 17));
      result.gender = sexCode % 2 === 0 ? '女' : '男';
    }
  }
  return result;
}

function validateBasic(row) {
  const errors = [];
  if (!row.name) errors.push('姓名不能为空');
  if (row.id_card && !/^\d{17}[\dXx]$/.test(row.id_card)) errors.push('身份证号格式错误');
  if (row.phone && !/^1\d{10}$/.test(row.phone)) errors.push('手机号格式错误');
  if (row.gender && !VALID_GENDERS.includes(row.gender)) errors.push('性别必须是男或女');
  return errors;
}

// ============================================================
// 组织匹配
// ============================================================
async function matchOrg(client, rawDept, rawTeam, mappingRules) {
  if (!rawDept && !rawTeam) {
    return { matched: false, org_unit_id: null, org_name: null, reason: '无部门信息' };
  }
  const key = `${rawDept || ''}::${rawTeam || ''}`;
  const rule = mappingRules.orgMap[key];
  if (rule) {
    return { matched: true, org_unit_id: rule.org_unit_id, org_name: rule.org_name, via: 'mapping_rule' };
  }
  const searchName = rawTeam || rawDept;
  const result = await client.query(
    `SELECT id, org_name FROM hse_org_unit WHERE org_name = $1 AND is_deleted = false AND status = 'active' LIMIT 1`,
    [searchName]
  );
  if (result.rows.length > 0) {
    return { matched: true, org_unit_id: result.rows[0].id, org_name: result.rows[0].org_name, via: 'name_match' };
  }
  return { matched: false, org_unit_id: null, org_name: null, reason: `找不到匹配的组织: ${searchName}` };
}

// ============================================================
// 岗位匹配（含别名转换）
// ============================================================
async function matchPosition(client, rawPosition, mappingRules) {
  if (!rawPosition) {
    return { matched: false, position_id: null, position_name: null, reason: '无岗位信息' };
  }
  const rule = mappingRules.positionMap[rawPosition];
  if (rule) {
    return { matched: true, position_id: rule.position_id, position_name: rule.position_name, via: 'mapping_rule' };
  }
  const aliasResult = await client.query(
    `SELECT pa.position_id, p.name as position_name
     FROM hse_position_alias pa
     JOIN position p ON p.id = pa.position_id
     WHERE pa.alias_name = $1 AND pa.is_deleted = false AND pa.status = 'active'
       AND p.is_deleted = false AND p.status = 'active'
     LIMIT 2`,
    [rawPosition]
  );
  if (aliasResult.rows.length === 1) {
    return { matched: true, position_id: aliasResult.rows[0].position_id, position_name: aliasResult.rows[0].position_name, via: 'alias_match' };
  }
  if (aliasResult.rows.length > 1) {
    return { matched: false, position_id: null, position_name: null, reason: '岗位别名歧义，多个岗位匹配', ambiguous: true };
  }
  const posResult = await client.query(
    `SELECT id, name FROM position WHERE name = $1 AND is_deleted = false AND status = 'active' LIMIT 1`,
    [rawPosition]
  );
  if (posResult.rows.length > 0) {
    return { matched: true, position_id: posResult.rows[0].id, position_name: posResult.rows[0].name, via: 'name_match' };
  }
  return { matched: false, position_id: null, position_name: null, reason: `找不到匹配的岗位: ${rawPosition}`, is_new: true };
}

// ============================================================
// 责任类型生成
// ============================================================
async function generateResponsibility(client, positionId) {
  if (!positionId) return null;
  const result = await client.query(
    `SELECT default_responsibility_type, default_grid_level, default_grid_role, default_inspection_frequency
     FROM hse_responsibility_config
     WHERE position_id = $1 AND is_deleted = false AND status = 'active'
     LIMIT 1`,
    [positionId]
  );
  if (result.rows.length === 0) return null;
  const cfg = result.rows[0];
  return {
    responsibility_type: cfg.default_responsibility_type,
    grid_level: cfg.default_grid_level,
    grid_role: cfg.default_grid_role,
    inspection_frequency: cfg.default_inspection_frequency
  };
}

// ============================================================
// 加载映射规则
// ============================================================
async function loadMappingRules(client) {
  const orgMap = {};
  const positionMap = {};
  const orgRules = await client.query(
    `SELECT raw_value, org_unit_id, org_name
     FROM hse_import_mapping_rule
     WHERE mapping_type = 'org' AND is_deleted = false AND status = 'active'`
  );
  orgRules.rows.forEach(r => { orgMap[r.raw_value] = r; });
  const posRules = await client.query(
    `SELECT raw_value, position_id, position_name
     FROM hse_import_mapping_rule
     WHERE mapping_type = 'position' AND is_deleted = false AND status = 'active'`
  );
  posRules.rows.forEach(r => { positionMap[r.raw_value] = r; });
  return { orgMap, positionMap };
}

// ============================================================
// 网格长同步
// ============================================================
function deriveGridAreaFields(row) {
  const org = String(row.org_name || '').trim();
  let township = '';
  if (org) township = org.replace(/(作业中心|作业区|乡镇作业中心|中心)$/, '').trim();
  const area = String(row.raw_team || row.area || org || '').trim();
  return { township, area };
}

async function nextGridCode(client) {
  const r = await client.query(
    `SELECT grid_code FROM grid_areas
     WHERE grid_code ~ '^G\\d+$'
     ORDER BY (substring(grid_code FROM 2))::int DESC LIMIT 1`
  );
  const last = r.rows[0] && r.rows[0].grid_code;
  let n = 1;
  if (last) n = (parseInt(String(last).replace(/^G/i, ''), 10) || 0) + 1;
  return 'G' + String(n).padStart(3, '0');
}

async function syncGridAreasFromRoster(client, rows) {
  const leaders = (rows || []).filter(
    (r) => r && r.name && String(r.name).trim() && r.grid_level && String(r.grid_level).trim()
  );
  let created = 0;
  let updated = 0;
  for (const r of leaders) {
    const name = String(r.name).trim();
    let personnelId = null;
    const code = String(r.employee_code || '').trim();
    if (code) {
      const e = await client.query(
        'SELECT id FROM employee WHERE employee_code = $1 AND is_deleted = false ORDER BY id LIMIT 1',
        [code]
      );
      personnelId = e.rows[0] ? e.rows[0].id : null;
    }
    const level = String(r.grid_level || '').trim();
    const position = String(r.position_name || r.grid_role || '').trim();
    const freq = String(r.inspection_frequency || '1天1次').trim();
    const { township, area } = deriveGridAreaFields(r);
    const ex = await client.query(
      'SELECT id FROM grid_areas WHERE is_deleted = false AND name = $1 ORDER BY id LIMIT 1',
      [name]
    );
    if (ex.rows.length) {
      await client.query(
        `UPDATE grid_areas SET
           grid_level = $1, position = $2, patrol_frequency = $3,
           personnel_id = COALESCE($4, personnel_id),
           area = COALESCE(NULLIF($5, ''), area),
           township = COALESCE(NULLIF($6, ''), township),
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $7`,
        [level, position, freq, personnelId, area, township, ex.rows[0].id]
      );
      updated++;
    } else {
      const gridCode = await nextGridCode(client);
      await client.query(
        `INSERT INTO grid_areas
           (grid_code, grid_level, name, personnel_id, position, area, township,
            patrol_frequency, completion_rate, risk_level, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [gridCode, level, name, personnelId, position, area, township,
         freq, 100, '一般风险', '在岗']
      );
      created++;
    }
  }
  return { created, updated, total: leaders.length };
}

// ============================================================
// API：上传解析预览
// ============================================================
async function upload(req) {
  const client = await pool.connect();
  try {
    const filePath = req.file.path;
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (rawRows.length === 0) {
      return errF('Excel文件为空');
    }

    const batchNo = generateBatchNo();
    const mappingRules = await loadMappingRules(client);

    const previewData = [];
    let orgMatched = 0, orgUnmatched = 0;
    let posMatched = 0, posUnmatched = 0, posAmbiguous = 0, posNew = 0;

    for (let i = 0; i < rawRows.length; i++) {
      const row = parseRow(rawRows[i], i + 2);
      const basicErrors = validateBasic(row);
      const orgResult = await matchOrg(client, row.raw_dept, row.raw_team, mappingRules);
      const posResult = await matchPosition(client, row.raw_position, mappingRules);
      const respResult = posResult.matched ? await generateResponsibility(client, posResult.position_id) : null;

      if (orgResult.matched) orgMatched++; else orgUnmatched++;
      if (posResult.matched) posMatched++;
      else if (posResult.ambiguous) posAmbiguous++;
      else if (posResult.is_new) posNew++;
      else posUnmatched++;

      const exceptions = [];
      if (basicErrors.length > 0) exceptions.push({ type: 'basic_error', message: basicErrors.join('; ') });
      if (!orgResult.matched) exceptions.push({ type: 'org_unmatched', message: orgResult.reason });
      if (!posResult.matched) {
        if (posResult.ambiguous) exceptions.push({ type: 'position_ambiguous', message: posResult.reason });
        else if (posResult.is_new) exceptions.push({ type: 'position_new', message: posResult.reason });
        else exceptions.push({ type: 'position_unmatched', message: posResult.reason });
      }
      if (!row.raw_team && row.raw_dept) exceptions.push({ type: 'team_uncertain', message: '班组信息缺失，作业单元无法确认' });

      previewData.push({
        row_index: i + 2,
        employee_code: row.employee_code,
        name: row.name,
        id_card: row.id_card,
        gender: row.gender,
        phone: row.phone,
        raw_dept: row.raw_dept,
        raw_team: row.raw_team,
        raw_position: row.raw_position,
        hire_date: row.hire_date,
        org_unit_id: orgResult.org_unit_id,
        org_name: orgResult.org_name,
        org_match_via: orgResult.via,
        position_id: posResult.position_id,
        position_name: posResult.position_name,
        position_match_via: posResult.via,
        responsibility_type: respResult?.responsibility_type,
        grid_level: respResult?.grid_level,
        grid_role: respResult?.grid_role,
        inspection_frequency: respResult?.inspection_frequency,
        has_exception: exceptions.length > 0,
        exceptions
      });
    }

    await client.query(
      `INSERT INTO hse_import_batch (batch_no, file_name, total_count, org_matched_count, org_unmatched_count,
                                     position_matched_count, position_unmatched_count, position_ambiguous_count,
                                     position_new_count, team_uncertain_count, status, import_type, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'parsed', 'roster', $11)`,
      [batchNo, fixFilenameEncoding(req.file.originalname), rawRows.length, orgMatched, orgUnmatched,
       posMatched, posUnmatched, posAmbiguous, posNew, 0, req.user?.id || null]
    );

    return ok({
      batch_no: batchNo,
      file_name: fixFilenameEncoding(req.file.originalname),
      total: rawRows.length,
      summary: {
        org_matched: orgMatched,
        org_unmatched: orgUnmatched,
        position_matched: posMatched,
        position_unmatched: posUnmatched,
        position_ambiguous: posAmbiguous,
        position_new: posNew
      },
      preview: previewData.slice(0, 100)
    }, '解析成功，请确认后提交');
  } catch (err) {
    console.error('[Roster Import Upload] Error:', err.message);
    return errF('解析失败: ' + err.message);
  } finally {
    client.release();
    if (req.file?.path) {
      try { deleteFile(req.file.path); } catch (e) { /* ignore */ }
    }
  }
}

// ============================================================
// API：确认导入
// ============================================================
async function confirm(req) {
  const client = await pool.connect();
  try {
    const { batch_no, rows } = req.body;

    if (!batch_no || !Array.isArray(rows) || rows.length === 0) {
      return errF('参数错误');
    }

    await client.query('BEGIN');

    let pendingCount = 0;

    for (const row of rows) {
      const hasException = row.exceptions && row.exceptions.length > 0;

      await client.query(
        `INSERT INTO hse_import_pending
           (batch_no, row_index, employee_code, name, id_card, gender, birth_date, phone,
            raw_dept, raw_team, raw_position, hire_date, is_driver, license_type,
            org_unit_id, org_name, org_match_via,
            position_id, position_name, position_match_via, position_alias,
            responsibility_type, grid_level, grid_role, inspection_frequency,
            responsible_org, responsible_org_id,
            has_exception, exception_types, exception_detail,
            status, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
                 $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27,
                 $28, $29, $30, $31, $32)`,
        [batch_no, row.row_index, row.employee_code, row.name, row.id_card, row.gender, row.birth_date, row.phone,
         row.raw_dept, row.raw_team, row.raw_position, row.hire_date, row.is_driver || false, row.license_type,
         row.org_unit_id || null, row.org_name, row.org_match_via,
         row.position_id || null, row.position_name, row.position_match_via, row.raw_position,
         row.responsibility_type, row.grid_level, row.grid_role, row.inspection_frequency,
         row.org_name, row.org_unit_id,
         hasException,
         hasException ? JSON.stringify(row.exceptions.map(e => e.type)) : null,
         hasException ? JSON.stringify(row.exceptions) : null,
         hasException ? 'pending' : 'ready',
         'roster_import']
      );
      pendingCount++;
    }

    await client.query(
      `UPDATE hse_import_batch SET status = 'confirmed', pending_count = $1 WHERE batch_no = $2`,
      [pendingCount, batch_no]
    );

    const gridSync = await syncGridAreasFromRoster(client, rows);

    await client.query('COMMIT');

    console.log(`[Roster Import Confirm] 网格长同步: 新增 ${gridSync.created}, 更新 ${gridSync.updated} (命中 ${gridSync.total})`);
    return ok({
      batch_no,
      pending_count: pendingCount,
      grid_sync: gridSync
    }, '导入确认成功，待审核数据已生成');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Roster Import Confirm] Error:', err.message);
    return errF('确认失败: ' + err.message);
  } finally {
    client.release();
  }
}

// ============================================================
// 待确认列表
// ============================================================
async function pendingList(query) {
  try {
    const { batch_no, status, has_exception, keyword, page = 1, pageSize = 20 } = query;

    const pageNum = parseInt(page);
    const pageSizeNum = parseInt(pageSize);
    const offset = (pageNum - 1) * pageSizeNum;

    let countSql = `SELECT COUNT(*) as total FROM hse_import_pending WHERE is_deleted = false`;
    let listSql = `SELECT * FROM hse_import_pending WHERE is_deleted = false`;

    const params = [];
    let idx = 1;

    if (batch_no) {
      const cond = ` AND batch_no = $${idx++}`;
      countSql += cond;
      listSql += cond;
      params.push(batch_no);
    }
    if (status && status !== 'all') {
      const cond = ` AND status = $${idx++}`;
      countSql += cond;
      listSql += cond;
      params.push(status);
    }
    if (has_exception !== undefined && has_exception !== '') {
      const cond = ` AND has_exception = $${idx++}`;
      countSql += cond;
      listSql += cond;
      params.push(has_exception === 'true' || has_exception === true);
    }
    if (keyword) {
      const cond = ` AND (name ILIKE $${idx} OR employee_code ILIKE $${idx} OR raw_position ILIKE $${idx})`;
      countSql += cond;
      listSql += cond;
      params.push(`%${keyword}%`);
      idx++;
    }

    listSql += ` ORDER BY id DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(pageSizeNum, offset);

    const countResult = await pool.query(countSql, params.slice(0, params.length - 2));
    const listResult = await pool.query(listSql, params);

    return ok({
      list: listResult.rows,
      total: parseInt(countResult.rows[0].total),
      page: pageNum,
      pageSize: pageSizeNum
    }, '待确认列表获取成功');
  } catch (err) {
    console.error('[Roster Import Pending] Error:', err.message);
    return errF('获取待确认列表失败: ' + err.message);
  }
}

// ============================================================
// 映射规则管理
// ============================================================
async function mappingList(query) {
  try {
    const { mapping_type, keyword, page = 1, pageSize = 20 } = query;

    const pageNum = parseInt(page);
    const pageSizeNum = parseInt(pageSize);
    const offset = (pageNum - 1) * pageSizeNum;

    let countSql = `SELECT COUNT(*) as total FROM hse_import_mapping_rule WHERE is_deleted = false`;
    let listSql = `SELECT * FROM hse_import_mapping_rule WHERE is_deleted = false`;

    const params = [];
    let idx = 1;

    if (mapping_type) {
      const cond = ` AND mapping_type = $${idx++}`;
      countSql += cond;
      listSql += cond;
      params.push(mapping_type);
    }
    if (keyword) {
      const cond = ` AND (raw_value ILIKE $${idx})`;
      countSql += cond;
      listSql += cond;
      params.push(`%${keyword}%`);
      idx++;
    }

    listSql += ` ORDER BY id DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(pageSizeNum, offset);

    const countResult = await pool.query(countSql, params.slice(0, params.length - 2));
    const listResult = await pool.query(listSql, params);

    return ok({
      list: listResult.rows,
      total: parseInt(countResult.rows[0].total),
      page: pageNum,
      pageSize: pageSizeNum
    }, '映射规则列表获取成功');
  } catch (err) {
    console.error('[Import Mapping Rules List] Error:', err.message);
    return errF('获取映射规则失败: ' + err.message);
  }
}

async function mappingCreate(body) {
  try {
    const { mapping_type, raw_value, org_unit_id, org_name, position_id, position_name, remark } = body;

    if (!mapping_type || !raw_value) {
      return errF('映射类型、原始值不能为空');
    }
    if (mapping_type === 'org' && !org_unit_id) {
      return errF('组织映射必须指定组织');
    }
    if (mapping_type === 'position' && !position_id) {
      return errF('岗位映射必须指定岗位');
    }

    const existResult = await pool.query(
      `SELECT id FROM hse_import_mapping_rule WHERE mapping_type = $1 AND raw_value = $2 AND is_deleted = false`,
      [mapping_type, raw_value]
    );
    if (existResult.rows.length > 0) {
      return errF('该映射规则已存在');
    }

    const result = await pool.query(
      `INSERT INTO hse_import_mapping_rule (mapping_type, raw_value, org_unit_id, org_name, position_id, position_name, remark, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
       RETURNING id`,
      [mapping_type, raw_value, org_unit_id || null, org_name || null, position_id || null, position_name || null, remark || null]
    );

    return ok({ id: result.rows[0].id }, '映射规则创建成功');
  } catch (err) {
    console.error('[Import Mapping Rules Create] Error:', err.message);
    return errF('创建映射规则失败: ' + err.message);
  }
}

async function mappingDelete(params) {
  try {
    const { id } = params;
    await pool.query(
      `UPDATE hse_import_mapping_rule SET is_deleted = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [id]
    );
    return ok(null, '映射规则删除成功');
  } catch (err) {
    console.error('[Import Mapping Rules Delete] Error:', err.message);
    return errF('删除映射规则失败: ' + err.message);
  }
}

// ============================================================
// 批次管理
// ============================================================
async function batchesList(query) {
  try {
    const { import_type, status, page = 1, pageSize = 20 } = query;

    const pageNum = parseInt(page);
    const pageSizeNum = parseInt(pageSize);
    const offset = (pageNum - 1) * pageSizeNum;

    let countSql = `SELECT COUNT(*) as total FROM hse_import_batch WHERE is_deleted = false`;
    let listSql = `SELECT * FROM hse_import_batch WHERE is_deleted = false`;

    const params = [];
    let idx = 1;

    if (import_type) {
      const cond = ` AND import_type = $${idx++}`;
      countSql += cond;
      listSql += cond;
      params.push(import_type);
    }
    if (status && status !== 'all') {
      const cond = ` AND status = $${idx++}`;
      countSql += cond;
      listSql += cond;
      params.push(status);
    }

    listSql += ` ORDER BY id DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(pageSizeNum, offset);

    const countResult = await pool.query(countSql, params.slice(0, params.length - 2));
    const listResult = await pool.query(listSql, params);

    return ok({
      list: listResult.rows,
      total: parseInt(countResult.rows[0].total),
      page: pageNum,
      pageSize: pageSizeNum
    }, '批次列表获取成功');
  } catch (err) {
    console.error('[Import Batches List] Error:', err.message);
    return errF('获取批次列表失败: ' + err.message);
  }
}

module.exports = {
  upload, confirm, pendingList, mappingList, mappingCreate, mappingDelete, batchesList,
};