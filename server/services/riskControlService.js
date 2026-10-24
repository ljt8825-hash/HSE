/**
 * 风险管控（/api/risk-control）—— 业务层
 * 原 routes/risk-control.js（约 1800 行）全部业务 + SQL + 内存降级 + 通知 + 规则字典收敛于此。
 * 每个端点对应一个 service 函数，返回统一描述符（__t:'json' / __t:'csv'），由 controllers/riskControlController.js 的 respond()
 * 统一解释为对外 JSON / CSV 契约，行为与原路由逐字节一致（挂载点 /api/risk-control 不变）。
 *
 * 描述符语义：
 *  - 成功：{ __t:'json', payload, message }（HTTP 200）
 *  - 业务错误：{ __t:'json', error:{code,message} }，code<0 为业务码（-1/-2），HTTP 200（等价原 res.json(error(-1/-2,...))）
 *  - 内部异常（200 系端点）：{ __t:'json', error:{code:-1,message} }（HTTP 200，等价原 catch 的 res.json(error(-1, e.message))）
 *  - CSV：{ __t:'csv', csv }，controller 负责 setHeader + send（等价原 sendCsvExport 的 res 写逻辑）
 *
 * 双重响应体系说明：
 *  - 原文件同时用 middleware/response 的 success/error（{code,success,message,data} shape）
 *    和 utils/commonResponse 的 sendNotFound（code:-2）/sendValidationError（code:-1）/buildMemoryRecord/camelKeys/pickField。
 *  - 逐端点核对：本模块所有响应均经 res.json(...) 返回 HTTP 200（CSV 经 res.send 亦 200），
 *    没有 res.status() 调用——即不存在 400/404/500 的 HTTP 状态码，区分只体现在 JSON body 的 code 字段。
 *  - 部分端点（附件/版本/联动）catch 走 next(err) 委托全局错误处理器；其余端点 catch 走 error(-1)（200）。
 *
 * 生产边界：POST /（创建）、POST /import、POST /:id/attachments、POST /:id/generate-hazard 为真实写端点，
 * 仅作代码迁移，不在冒烟中触发。
 */

const { pool, isConnected } = require('../config/db');
const { sendNotFound, sendValidationError, buildMemoryRecord, camelKeys, pickField } = require('../utils/commonResponse');
const { getFileUrl, fixFilenameEncoding } = require('../middleware/upload');
const { createNotification } = require('./notificationService');
const hseRules = require('../config/hseRules');

// ============================================================
// 风险评估规则常量（LEC / LS 矩阵法）
// ============================================================
const ASSESSMENT_SCALES = {
  LEC: {
    method: 'LEC',
    label: 'LEC 作业条件危险性评价法',
    formula: 'D = L × E × C',
    factors: [
      { code: 'l', symbol: 'L', label: '事故发生的可能性', options: [
        { value: 10, label: '完全可以预料' }, { value: 6, label: '相当可能' }, { value: 3, label: '可能，但不经常' },
        { value: 1, label: '可能性小，完全意外' }, { value: 0.5, label: '很不可能，可以设想' },
        { value: 0.2, label: '极不可能' }, { value: 0.1, label: '实际不可能' },
      ] },
      { code: 'e', symbol: 'E', label: '暴露于危险环境的频繁程度', options: [
        { value: 10, label: '连续暴露' }, { value: 6, label: '每天工作时间内暴露' }, { value: 3, label: '每周一次或偶然暴露' },
        { value: 2, label: '每月一次暴露' }, { value: 1, label: '每年几次暴露' }, { value: 0.5, label: '非常罕见地暴露' },
      ] },
      { code: 'c', symbol: 'C', label: '发生事故产生的后果', options: [
        { value: 100, label: '大灾难，许多人死亡' }, { value: 40, label: '灾难，数人死亡' },
        { value: 15, label: '非常严重，一人死亡' }, { value: 7, label: '严重，重伤' },
        { value: 3, label: '重大，致残' }, { value: 1, label: '引人注目，需要救护' },
      ] },
    ],
    thresholds: [
      { min: 160, level: '一级', color: 'red', alias: '重大风险', desc: '极其危险，不能继续作业' },
      { min: 70, level: '二级', color: 'orange', alias: '较大风险', desc: '高度危险，需立即整改' },
      { min: 20, level: '三级', color: 'gold', alias: '一般风险', desc: '显著危险，需要整改' },
      { min: 0, level: '四级', color: 'green', alias: '低风险', desc: '稍有危险，需要注意' },
    ],
  },
  LS: {
    method: 'LS',
    label: 'LS 风险矩阵评价法',
    formula: 'R = L × S',
    factors: [
      { code: 'l', symbol: 'L', label: '事故发生的可能性', options: [
        { value: 5, label: '很可能（经常发生）' }, { value: 4, label: '较可能（可能发生）' },
        { value: 3, label: '可能（偶尔发生）' }, { value: 2, label: '不太可能（很少发生）' },
        { value: 1, label: '极不可能（几乎不发生）' },
      ] },
      { code: 's', symbol: 'S', label: '后果的严重性', options: [
        { value: 5, label: '特别严重（多人死亡）' }, { value: 4, label: '严重（一人死亡或多人重伤）' },
        { value: 3, label: '较大（重伤或职业病）' }, { value: 2, label: '一般（轻伤，需就医）' },
        { value: 1, label: '轻微（无伤或轻微不适）' },
      ] },
    ],
    thresholds: [
      { min: 20, level: '一级', color: 'red', alias: '重大风险', desc: '不可容许，必须立即停止作业' },
      { min: 15, level: '二级', color: 'orange', alias: '较大风险', desc: '重大风险，需制定管控方案' },
      { min: 10, level: '三级', color: 'gold', alias: '一般风险', desc: '中等风险，需要管控' },
      { min: 0, level: '四级', color: 'green', alias: '低风险', desc: '可接受，保持现有措施' },
    ],
  },
};

const REVIEW_CYCLE_OPTIONS = [
  { value: 3, label: '3 个月' },
  { value: 6, label: '6 个月' },
  { value: 12, label: '12 个月' },
  { value: 24, label: '24 个月' },
  { value: 0, label: '长期有效' },
];

// ============================================================
// 描述符快捷构造
// ============================================================
const ok = (payload, message) => ({ __t: 'json', payload, message });
const err = (code, message, httpStatus) => ({ __t: 'json', error: { code, message }, ...(httpStatus ? { httpStatus } : {}) });
const csvResp = (csv) => ({ __t: 'csv', csv });
const notFound = (msg) => err(-2, msg);

/** 统一包裹：异常 → {error:{code:-1,message}, }（HTTP 200，等价原 catch 的 res.json(error(-1,e.message))，绝不加 httpStatus） */
async function W(fn) {
  try {
    return await fn();
  } catch (e) {
    return err(-1, e.message);
  }
}

// ============================================================
// 风险评估辅助（原文件顶层，模块私有）
// ============================================================
function judgeAssessmentLevel(method, score) {
  const scale = ASSESSMENT_SCALES[method];
  if (!scale || !Number.isFinite(score)) return null;
  return scale.thresholds.find((t) => score >= t.min) || scale.thresholds[scale.thresholds.length - 1];
}

function calcAssessmentScore(method, body) {
  const scale = ASSESSMENT_SCALES[method];
  if (!scale) {
    return { ok: false, msg: `不支持的评估方法：${method}，仅支持 ${Object.keys(ASSESSMENT_SCALES).join(' / ')}` };
  }
  const factors = {};
  let score = 1;
  for (const f of scale.factors) {
    const raw = body[f.code];
    const val = Number(raw);
    if (raw === undefined || raw === null || raw === '' || !Number.isFinite(val)) {
      return { ok: false, msg: `缺少评估因子 ${f.symbol}（${f.label}）` };
    }
    const hit = f.options.find((o) => Math.abs(o.value - val) < 1e-9);
    if (!hit) {
      return { ok: false, msg: `评估因子 ${f.symbol} 取值非法：${raw}，允许值 [${f.options.map((o) => o.value).join(', ')}]` };
    }
    factors[f.code] = hit.value;
    score *= hit.value;
  }
  return { ok: true, score: Math.round(score * 100) / 100, factors };
}

function normalizeReviewCycle(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const val = Number(raw);
  if (!Number.isFinite(val) || val < 0) return null;
  return REVIEW_CYCLE_OPTIONS.some((o) => o.value === val) ? val : Math.trunc(val);
}

// ========== 数据库表初始化（IF NOT EXISTS，可重复执行） ==========
let tablesInitialized = false;

async function ensureTables() {
  if (tablesInitialized) return;
  if (!isConnected()) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS risk_attachments (
        id            BIGSERIAL PRIMARY KEY,
        risk_id       BIGINT NOT NULL,
        filename      VARCHAR(255) NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        file_type     VARCHAR(64) NOT NULL DEFAULT 'document',
        file_size     BIGINT NOT NULL DEFAULT 0,
        file_url      VARCHAR(512) NOT NULL,
        version       VARCHAR(32) NOT NULL DEFAULT '1.0',
        uploaded_by   VARCHAR(64),
        is_latest     BOOLEAN NOT NULL DEFAULT TRUE,
        is_deleted    BOOLEAN NOT NULL DEFAULT FALSE,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_risk_attachments_risk ON risk_attachments(risk_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_risk_attachments_latest ON risk_attachments(risk_id, is_latest) WHERE is_deleted = FALSE');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS risk_versions (
        id             BIGSERIAL PRIMARY KEY,
        risk_id        BIGINT NOT NULL,
        version        VARCHAR(32) NOT NULL,
        change_type    VARCHAR(32) NOT NULL DEFAULT 'update',
        change_summary TEXT,
        changed_by     VARCHAR(64),
        snapshot       JSONB,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_risk_versions_risk ON risk_versions(risk_id)');

    try {
      await pool.query(`ALTER TABLE risk_sources ADD COLUMN IF NOT EXISTS assessment_date DATE`);
      await pool.query(`ALTER TABLE risk_sources ADD COLUMN IF NOT EXISTS review_cycle INT DEFAULT 12`);
      await pool.query(`ALTER TABLE risk_sources ADD COLUMN IF NOT EXISTS last_hazard_check_date DATE`);
      await pool.query(`ALTER TABLE risk_sources ADD COLUMN IF NOT EXISTS hazard_count INT DEFAULT 0`);
      await pool.query(`ALTER TABLE risk_sources ADD COLUMN IF NOT EXISTS responsible_dept VARCHAR(128)`);
      await pool.query(`ALTER TABLE risk_sources ADD COLUMN IF NOT EXISTS responsible_person VARCHAR(64)`);
      await pool.query(`ALTER TABLE risk_sources ADD COLUMN IF NOT EXISTS responsible_person_id BIGINT`);
      await pool.query(`ALTER TABLE risk_sources ADD COLUMN IF NOT EXISTS job_name VARCHAR(128)`);
      await pool.query(`ALTER TABLE risk_sources ADD COLUMN IF NOT EXISTS job_type VARCHAR(64)`);
      await pool.query(`ALTER TABLE risk_sources ADD COLUMN IF NOT EXISTS post_name VARCHAR(128)`);
      await pool.query(`ALTER TABLE risk_sources ADD COLUMN IF NOT EXISTS assessment_method VARCHAR(64)`);
      await pool.query(`ALTER TABLE risk_sources ADD COLUMN IF NOT EXISTS assessment_score NUMERIC(10,2)`);
      await pool.query(`ALTER TABLE risk_sources ADD COLUMN IF NOT EXISTS control_measures JSONB DEFAULT '{}'::jsonb`);
      await pool.query(`ALTER TABLE risk_sources ADD COLUMN IF NOT EXISTS responsible_dept_id BIGINT`);
    } catch (_e) {}

    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS risk_hazard_links (
          id          BIGSERIAL PRIMARY KEY,
          risk_id     BIGINT NOT NULL,
          hazard_id   BIGINT NOT NULL,
          link_type   VARCHAR(32) NOT NULL DEFAULT 'manual',
          created_by  VARCHAR(64),
          created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query('CREATE INDEX IF NOT EXISTS idx_rhl_risk ON risk_hazard_links(risk_id)');
      await pool.query('CREATE INDEX IF NOT EXISTS idx_rhl_hazard ON risk_hazard_links(hazard_id)');
      await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_rhl_uniq ON risk_hazard_links(risk_id, hazard_id)');
    } catch (_e) {}

    try {
      await pool.query(`ALTER TABLE hazards ADD COLUMN IF NOT EXISTS related_risk_id BIGINT`);
      await pool.query(`ALTER TABLE hazards ADD COLUMN IF NOT EXISTS risk_level VARCHAR(32)`);
    } catch (_e) {}

    tablesInitialized = true;
    console.log('[RiskControl] 数据库表 attachments/versions/links 已就绪');
  } catch (err) {
    console.warn('[RiskControl] 数据库表初始化失败:', err.message);
  }
}

// ========== 内存降级存储 ==========
let memoryRecords = [];
let memoryIdCounter = 1;
let memoryAttachments = [];
let memoryAttachmentIdCounter = 1;
let memoryVersions = [];
let memoryVersionIdCounter = 1;

function initMemoryData() {
  if (memoryRecords.length > 0) return;
  memoryRecords = [];
  memoryIdCounter = 1;
  memoryAttachments = [];
  memoryAttachmentIdCounter = 1;
  memoryVersions = [];
  memoryVersionIdCounter = 1;
}

// ========== 时效状态计算 ==========
function calcExpiryStatus(assessmentDate, reviewCycle) {
  if (!assessmentDate || !reviewCycle || reviewCycle <= 0) {
    return 'permanent';
  }
  const eff = new Date(assessmentDate);
  if (isNaN(eff.getTime())) return 'unknown';
  const expiry = new Date(eff);
  expiry.setMonth(expiry.getMonth() + parseInt(reviewCycle));
  const now = new Date();
  const diffDays = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'expired';
  if (diffDays <= 30) return 'expiring';
  return 'normal';
}

// ========== 辅助：DB 行 → 前端期望格式（统一 camelCase）==========
function formatRow(row) {
  if (!row) return null;
  return camelKeys({
    id: row.id,
    source_id: row.source_id || null,
    name: row.name || '',
    type: row.type || '',
    category: row.category || '',
    location: row.location || '',
    accident_type: row.accident_type || '',
    level: row.level || '四级',
    measures: row.measures || '',
    emergency: row.emergency || '',
    lat: row.lat || null,
    lng: row.lng || null,
    area: row.area || '',
    sheet: row.sheet || '',
    polygon: row.polygon || [],
    status: row.status || '正常',
    assessment_date: row.assessment_date || null,
    review_cycle: row.review_cycle || null,
    last_hazard_check_date: row.last_hazard_check_date || null,
    hazard_count: row.hazard_count || 0,
    responsible_dept: row.responsible_dept || '',
    responsible_dept_id: row.responsible_dept_id || null,
    responsible_person: row.responsible_person || '',
    responsible_person_id: row.responsible_person_id || null,
    job_name: row.job_name || '',
    job_type: row.job_type || '',
    post_name: row.post_name || '',
    assessment_method: row.assessment_method || '',
    assessment_score: row.assessment_score || null,
    control_measures: row.control_measures || {},
    data_period: row.data_period || null,
    source_file_id: row.source_file_id || null,
    import_job_id: row.import_job_id || null,
    row_hash: row.row_hash || null,
    expiry_status: calcExpiryStatus(row.assessment_date, row.review_cycle),
    created_at: row.created_at,
    updated_at: row.updated_at
  });
}

// ========== 内部：写入版本履历 ==========
async function recordVersion(riskId, version, changeType, changeSummary, changedBy, snapshot, client) {
  if (isConnected()) {
    const sql = `INSERT INTO risk_versions (risk_id, version, change_type, change_summary, changed_by, snapshot)
                 VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`;
    const params = [riskId, version, changeType, changeSummary, changedBy, JSON.stringify(snapshot || {})];
    if (client) {
      return (await client.query(sql, params)).rows[0];
    }
    return (await pool.query(sql, params)).rows[0];
  } else {
    const rec = buildMemoryRecord(memoryVersionIdCounter++, {
      risk_id: riskId,
      version,
      change_type: changeType,
      change_summary: changeSummary,
      changed_by: changedBy,
      snapshot: snapshot || {},
    });
    memoryVersions.push(rec);
    return rec;
  }
}

let memoryRiskHazardLinks = [];
let memoryLinkIdCounter = 1;

// ========== 风险临期/过期 → 通知 ==========
async function notifyRiskExpiry(risk, status) {
  try {
    if (!risk) return;
    const title = status === 'expired'
      ? `风险点已过期：${risk.name}`
      : `风险点临期提醒：${risk.name}`;
    const content = status === 'expired'
      ? `风险点「${risk.name}」（${risk.level}）评估日期 ${risk.assessment_date || '-'} 已超过复评周期，请尽快复评或生成隐患排查。`
      : `风险点「${risk.name}」（${risk.level}）将在 30 天内到期复评，评估日期 ${risk.assessment_date || '-'}。`;
    await createNotification({
      userId: null,
      title,
      content,
      type: status === 'expired' ? 'alert' : 'system',
      bizType: 'risk_expiry',
      bizId: String(risk.id),
      pushWs: true,
    });
  } catch (err) {
    console.warn('[RiskControl] 通知推送失败:', err.message);
  }
}

// ========== 风险等级变更 → 通知 ==========
async function notifyRiskLevelChange(risk, oldLevel, newLevel, method, score) {
  try {
    if (!risk) return;
    const order = { 一级: 1, 二级: 2, 三级: 3, 四级: 4 };
    const isUpgrade = (order[newLevel] || 99) < (order[oldLevel] || 99);
    const title = isUpgrade ? `风险等级升级：${risk.name}` : `风险等级调整：${risk.name}`;
    const content =
      `风险点「${risk.name}」经 ${method} 评估，风险值 ${score}，` +
      `等级由「${oldLevel || '未评估'}」变更为「${newLevel}」。` +
      (isUpgrade ? '请立即复核管控措施并落实责任人。' : '请同步更新管控台账。');
    await createNotification({
      userId: null,
      title,
      content,
      type: isUpgrade ? 'alert' : 'system',
      bizType: 'risk_level_change',
      bizId: String(risk.id),
      pushWs: true,
    });
  } catch (err) {
    console.warn('[RiskControl] 等级变更通知推送失败:', err.message);
  }
}

// ========== 内部：创建风险-隐患关联记录（幂等）==========
async function linkRiskHazard(riskId, hazardId, linkType, createdBy, client) {
  if (isConnected()) {
    const sql = `
      INSERT INTO risk_hazard_links (risk_id, hazard_id, link_type, created_by)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (risk_id, hazard_id) DO NOTHING
      RETURNING *
    `;
    const params = [riskId, hazardId, linkType || 'manual', createdBy || 'system'];
    if (client) {
      return (await client.query(sql, params)).rows[0];
    }
    return (await pool.query(sql, params)).rows[0];
  } else {
    const exist = memoryRiskHazardLinks.find((l) => l.risk_id === riskId && l.hazard_id === hazardId);
    if (exist) return exist;
    const rec = buildMemoryRecord(memoryLinkIdCounter++, {
      risk_id: riskId,
      hazard_id: hazardId,
      link_type: linkType || 'manual',
      created_by: createdBy || 'system',
    });
    memoryRiskHazardLinks.push(rec);
    return rec;
  }
}

// ========== 内部：构建 CSV（等价原 sendCsvExport 的行拼接逻辑）==========
function buildCsvData(data) {
  const headers = ['ID', '风险点名称', '风险等级', '风险类型', '风险位置', '所属区域', '状态', '事故类型', '管控措施', '应急措施', '评估日期', '复评周期(月)', '时效状态', '创建时间'];
  const rows = data.map(r => [
    r.id || '',
    (r.name || '').replace(/"/g, '""'),
    r.level || '',
    r.type || '',
    (r.location || '').replace(/"/g, '""'),
    r.area || '',
    r.status || '',
    r.accident_type || r.accidentType || '',
    (r.measures || '').replace(/"/g, '""'),
    (r.emergency || '').replace(/"/g, '""'),
    r.assessment_date ? new Date(r.assessment_date).toISOString().slice(0, 10) : '',
    r.review_cycle || r.reviewCycle || '',
    r.expiry_status || r.expiryStatus || '',
    r.created_at ? new Date(r.created_at).toISOString().slice(0, 19) : ''
  ].map(v => `"${v}"`).join(','));
  return '\uFEFF' + headers.map(h => `"${h}"`).join(',') + '\n' + rows.join('\n');
}

// ========== 内部：hazards 详情格式化（原 handler 内联，轻量避免循环依赖）==========
function formatHazardRow(row) {
  if (!row) return null;
  const checkDate = row.hazard_date ? new Date(row.hazard_date) : null;
  const fixDate = row.fix_date ? new Date(row.fix_date) : null;
  const fmt = (d) => d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null;
  // P3-04-00.3 (F-04b)：hazards.status 的“已闭环”判定必须与 hazardService.SQL_CLOSED_STATUS_LIST 同源。
  // 原实现只认旧中文 '已完成'，迁移后 60 条 canonical 'closed' 会被判成“未解决”；
  // 'completed' 为更早的历史值，一并读取兼容。此处内联而非 require，避免与 hazardService 循环依赖。
  const isResolved = (row.status === 'closed' || row.status === '已完成' || row.status === 'completed') ? '是' : '否';
  return camelKeys({
    id: row.id,
    no: row.no || null,
    description: row.description || '',
    measure: row.measure || '',
    checkDate: checkDate ? fmt(checkDate) : null,
    checker: row.checker || '',
    fixer: row.fixer || '',
    fixDate: fixDate ? fmt(fixDate) : null,
    isResolved,
    remark: row.remark || '',
    linkType: row.link_type || 'manual',
    linkedAt: row.linked_at,
    riskLevel: row.risk_level || null,
  });
}

// ============================================================
// 端点业务
// ============================================================

// 1. GET /stats/all
const statsAll = () => W(async () => {
  if (!isConnected()) {
    initMemoryData();
    const data = memoryRecords.filter(r => !r.is_deleted);
    const stats = { total: data.length, byLevel: { '一级': 0, '二级': 0, '三级': 0, '四级': 0 }, byType: {}, byArea: {}, expiring: 0, expired: 0 };
    data.forEach(r => {
      if (r.level && stats.byLevel.hasOwnProperty(r.level)) stats.byLevel[r.level]++;
      if (r.type) stats.byType[r.type] = (stats.byType[r.type] || 0) + 1;
      if (r.area) stats.byArea[r.area] = (stats.byArea[r.area] || 0) + 1;
      const es = calcExpiryStatus(r.assessment_date, r.review_cycle);
      if (es === 'expiring') stats.expiring++;
      if (es === 'expired') stats.expired++;
    });
    return ok(stats, '统计成功(内存模式)');
  }

  const client = await pool.connect();
  try {
    const totalRes = await client.query('SELECT COUNT(*)::int AS cnt FROM risk_sources WHERE is_deleted = false');
    const levelRes = await client.query(`SELECT level, COUNT(*)::int AS cnt FROM risk_sources WHERE is_deleted = false GROUP BY level`);
    const typeRes = await client.query(`SELECT type, COUNT(*)::int AS cnt FROM risk_sources WHERE is_deleted = false AND type IS NOT NULL AND type != '' GROUP BY type`);
    const areaRes = await client.query(`SELECT area, COUNT(*)::int AS cnt FROM risk_sources WHERE is_deleted = false AND area IS NOT NULL AND area != '' GROUP BY area`);

    const byLevel = { '一级': 0, '二级': 0, '三级': 0, '四级': 0 };
    levelRes.rows.forEach(r => { if (byLevel.hasOwnProperty(r.level)) byLevel[r.level] = r.cnt; });
    const byType = {};
    typeRes.rows.forEach(r => { byType[r.type] = r.cnt; });
    const byArea = {};
    areaRes.rows.forEach(r => { byArea[r.area] = r.cnt; });

    const allRes = await client.query('SELECT assessment_date, review_cycle FROM risk_sources WHERE is_deleted = false');
    let expiring = 0, expired = 0;
    allRes.rows.forEach(r => {
      const es = calcExpiryStatus(r.assessment_date, r.review_cycle);
      if (es === 'expiring') expiring++;
      if (es === 'expired') expired++;
    });

    let linkedHazardCount = 0;
    let riskWithHazardCount = 0;
    try {
      const linkRes = await client.query('SELECT COUNT(DISTINCT risk_id)::int AS cnt FROM risk_hazard_links');
      riskWithHazardCount = linkRes.rows[0]?.cnt || 0;
      const totalLinkRes = await client.query('SELECT COUNT(*)::int AS cnt FROM risk_hazard_links');
      linkedHazardCount = totalLinkRes.rows[0]?.cnt || 0;
    } catch (_e) {}

    return ok({
      total: totalRes.rows[0].cnt,
      byLevel, byType, byArea,
      expiring, expired,
      linkedHazards: linkedHazardCount,
      riskWithHazards: riskWithHazardCount,
    }, '统计成功');
  } finally {
    client.release();
  }
});

// 2. GET /stats/level
const statsLevel = () => W(async () => {
  if (!isConnected()) {
    initMemoryData();
    const data = memoryRecords.filter(r => !r.is_deleted);
    const byLevel = { '一级': 0, '二级': 0, '三级': 0, '四级': 0 };
    data.forEach(r => { if (r.level && byLevel.hasOwnProperty(r.level)) byLevel[r.level]++; });
    return ok(byLevel, '统计成功(内存模式)');
  }

  const result = await pool.query(`SELECT level, COUNT(*)::int AS cnt FROM risk_sources WHERE is_deleted = false GROUP BY level`);
  const byLevel = { '一级': 0, '二级': 0, '三级': 0, '四级': 0 };
  result.rows.forEach(r => { if (byLevel.hasOwnProperty(r.level)) byLevel[r.level] = r.cnt; });
  return ok(byLevel, '统计成功');
});

// 3. GET /stats/type
const statsType = () => W(async () => {
  if (!isConnected()) {
    initMemoryData();
    const data = memoryRecords.filter(r => !r.is_deleted);
    const byType = {};
    data.forEach(r => { if (r.type) byType[r.type] = (byType[r.type] || 0) + 1; });
    return ok(byType, '统计成功(内存模式)');
  }

  const result = await pool.query(`SELECT type, COUNT(*)::int AS cnt FROM risk_sources WHERE is_deleted = false AND type IS NOT NULL AND type != '' GROUP BY type`);
  const byType = {};
  result.rows.forEach(r => { byType[r.type] = r.cnt; });
  return ok(byType, '统计成功');
});

// 4. GET /export — CSV
const riskExport = () => W(async () => {
  if (!isConnected()) {
    initMemoryData();
    const data = memoryRecords.filter(r => !r.is_deleted).map(r => ({ ...r, expiry_status: calcExpiryStatus(r.assessment_date, r.review_cycle) }));
    return csvResp(buildCsvData(data));
  }

  await ensureTables();
  const result = await pool.query(`SELECT * FROM risk_sources WHERE is_deleted = FALSE ORDER BY id ASC`);
  const list = result.rows.map(r => ({ ...r, expiry_status: calcExpiryStatus(r.assessment_date, r.review_cycle) }));
  return csvResp(buildCsvData(list));
});

// 5. GET / — 列表查询（分页 + 筛选）
const list = (query) => W(async () => {
  if (!isConnected()) {
    initMemoryData();
    let data = memoryRecords.filter(r => !r.is_deleted);
    const { level, type, area, keyword, expiryStatus } = query;

    if (level) data = data.filter(r => r.level === level);
    if (type) data = data.filter(r => r.type === type);
    if (area) data = data.filter(r => r.area === area);
    if (keyword) {
      const kw = keyword.toLowerCase();
      data = data.filter(r =>
        (r.name && r.name.toLowerCase().includes(kw)) ||
        (r.location && r.location.toLowerCase().includes(kw)) ||
        (r.source_id && r.source_id.toLowerCase().includes(kw)) ||
        (r.accident_type && r.accident_type.toLowerCase().includes(kw))
      );
    }
    if (expiryStatus) {
      data = data.filter(r => calcExpiryStatus(r.assessment_date, r.review_cycle) === expiryStatus);
    }

    return ok({ list: data.map(formatRow), total: data.length }, '查询成功(内存模式)');
  }

  let whereSql = ' WHERE is_deleted = false';
  const params = [];
  let paramIdx = 0;

  const { level, type, area, keyword, expiryStatus, page = 1, pageSize = 100 } = query;

  if (level) { paramIdx++; whereSql += ` AND level = $${paramIdx}`; params.push(level); }
  if (type) { paramIdx++; whereSql += ` AND type = $${paramIdx}`; params.push(type); }
  if (area) { paramIdx++; whereSql += ` AND area = $${paramIdx}`; params.push(area); }
  if (keyword) {
    paramIdx++;
    whereSql += ` AND (name ILIKE $${paramIdx} OR location ILIKE $${paramIdx} OR source_id ILIKE $${paramIdx} OR accident_type ILIKE $${paramIdx})`;
    params.push(`%${keyword}%`);
  }

  const countSql = `SELECT COUNT(*)::int AS total FROM risk_sources${whereSql}`;
  const countResult = await pool.query(countSql, params);
  const total = countResult.rows[0].total;

  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  paramIdx++;
  const limitP = paramIdx;
  params.push(parseInt(pageSize));
  paramIdx++;
  const offsetP = paramIdx;
  params.push(offset);

  const listSql = `SELECT * FROM risk_sources ${whereSql} ORDER BY id ASC LIMIT $${limitP} OFFSET $${offsetP}`;
  const result = await pool.query(listSql, params);

  let rows = result.rows.map(formatRow);
  if (expiryStatus) {
    rows = rows.filter(r => r.expiryStatus === expiryStatus);
  }

  return ok({ list: rows, total: expiryStatus ? rows.length : total, page: parseInt(page), pageSize: parseInt(pageSize) }, '查询成功');
});

// 6. GET /:id
const detail = (params) => W(async () => {
  if (!isConnected()) {
    initMemoryData();
    const { id } = params;
    const record = memoryRecords.find(r => String(r.id) === String(id) && !r.is_deleted);
    if (!record) return notFound('记录不存在');
    return ok(formatRow(record), '查询成功(内存模式)');
  }

  const { id } = params;
  const result = await pool.query('SELECT * FROM risk_sources WHERE id = $1 AND is_deleted = false', [id]);
  if (result.rows.length === 0) return notFound('记录不存在');
  return ok(formatRow(result.rows[0]), '查询成功');
});

// 7. POST / — 创建（真实写端点，仅代码迁移，冒烟不触发）
const create = (body) => W(async () => {
  if (!isConnected()) {
    initMemoryData();
    const newRecord = buildMemoryRecord(memoryIdCounter++, {
      source_id: pickField(body, 'sourceId') || null,
      name: body.name || '',
      type: body.type || '',
      category: body.category || '',
      location: body.location || '',
      accident_type: pickField(body, 'accidentType') || '',
      level: body.level || '四级',
      measures: body.measures || '',
      emergency: body.emergency || '',
      lat: body.lat || null,
      lng: body.lng || null,
      area: body.area || '',
      sheet: body.sheet || '',
      polygon: body.polygon || [],
      status: body.status || '正常',
      assessment_date: pickField(body, 'assessmentDate') || null,
      review_cycle: pickField(body, 'reviewCycle') || null,
      data_period: pickField(body, 'dataPeriod') || null,
      source_file_id: pickField(body, 'sourceFileId') || null,
      import_job_id: pickField(body, 'importJobId') || null,
      row_hash: pickField(body, 'rowHash') || null
    });
    memoryRecords.push(newRecord);
    await recordVersion(newRecord.id, '1.0', 'create', '创建风险点', body.changedBy || 'admin', newRecord);
    return ok(formatRow(newRecord), '创建成功(内存模式)');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const insertSql = `
      INSERT INTO risk_sources
      (source_id, name, type, category, location, accident_type, level,
       measures, emergency, lat, lng, area, sheet, polygon, status,
       assessment_date, review_cycle, data_period, source_file_id, import_job_id, row_hash)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
      RETURNING *
    `;
    const result = await client.query(insertSql, [
      pickField(body, 'sourceId') || null,
      body.name || '',
      body.type || '',
      body.category || '',
      body.location || '',
      pickField(body, 'accidentType') || '',
      body.level || '四级',
      body.measures || '',
      body.emergency || '',
      body.lat || null,
      body.lng || null,
      body.area || '',
      body.sheet || '',
      JSON.stringify(body.polygon || []),
      body.status || '正常',
      pickField(body, 'assessmentDate') || null,
      pickField(body, 'reviewCycle') || null,
      pickField(body, 'dataPeriod') || null,
      pickField(body, 'sourceFileId') || null,
      pickField(body, 'importJobId') || null,
      pickField(body, 'rowHash') || null
    ]);
    const newRecord = result.rows[0];
    await recordVersion(newRecord.id, '1.0', 'create', '创建风险点', body.changedBy || 'admin', newRecord, client);
    await client.query('COMMIT');
    return ok(formatRow(newRecord), '创建成功');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// 8. PUT /:id
const update = (params, body) => W(async () => {
  if (!isConnected()) {
    initMemoryData();
    const { id } = params;
    const idx = memoryRecords.findIndex(r => String(r.id) === String(id) && !r.is_deleted);
    if (idx === -1) return notFound('记录不存在');

    const record = memoryRecords[idx];
    const columnToCamel = {
      source_id: 'sourceId', accident_type: 'accidentType', assessment_date: 'assessmentDate',
      review_cycle: 'reviewCycle', data_period: 'dataPeriod', source_file_id: 'sourceFileId',
      import_job_id: 'importJobId', row_hash: 'rowHash',
    };
    const updatableFields = [
      'source_id', 'name', 'type', 'category', 'location', 'accident_type', 'level', 'measures',
      'emergency', 'lat', 'lng', 'area', 'sheet', 'polygon', 'status', 'assessment_date',
      'review_cycle', 'data_period', 'source_file_id', 'import_job_id', 'row_hash'
    ];

    const snapshotBefore = { ...record };
    updatableFields.forEach(field => {
      const camelKey = columnToCamel[field] || field;
      const val = pickField(body, camelKey);
      if (val !== undefined) record[field] = val;
    });
    record.updated_at = new Date().toISOString();

    await recordVersion(record.id, body.version || '1.0', 'update', body.changeSummary || body.change_summary || '更新风险点', body.changedBy || 'admin', { before: snapshotBefore, after: record });

    try {
      const newExpiry = calcExpiryStatus(record.assessment_date, record.review_cycle);
      const oldExpiry = calcExpiryStatus(snapshotBefore.assessment_date, snapshotBefore.review_cycle);
      if (newExpiry !== oldExpiry && (newExpiry === 'expiring' || newExpiry === 'expired')) {
        await notifyRiskExpiry(formatRow(record), newExpiry);
      }
    } catch (_e) {}

    return ok(formatRow(record), '更新成功(内存模式)');
  }

  const { id } = params;
  const existResult = await pool.query('SELECT * FROM risk_sources WHERE id = $1 AND is_deleted = false', [id]);
  if (existResult.rows.length === 0) return notFound('记录不存在');
  const beforeSnapshot = existResult.rows[0];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const updateFields = [];
    const updateValues = [];
    let paramIdx = 0;

    const columnToCamel = {
      source_id: 'sourceId', accident_type: 'accidentType', assessment_date: 'assessmentDate',
      review_cycle: 'reviewCycle', data_period: 'dataPeriod', source_file_id: 'sourceFileId',
      import_job_id: 'importJobId', row_hash: 'rowHash',
    };
    const updatableColumns = [
      'source_id', 'name', 'type', 'category', 'location', 'accident_type', 'level', 'measures',
      'emergency', 'lat', 'lng', 'area', 'sheet', 'polygon', 'status', 'assessment_date',
      'review_cycle', 'data_period', 'source_file_id', 'import_job_id', 'row_hash'
    ];

    updatableColumns.forEach(col => {
      const camelKey = columnToCamel[col] || col;
      const val = pickField(body, camelKey);
      if (val !== undefined) {
        paramIdx++;
        updateFields.push(`${col} = $${paramIdx}`);
        updateValues.push(col === 'polygon' ? JSON.stringify(val) : val);
      }
    });

    if (updateFields.length === 0) {
      await client.query('ROLLBACK');
      return err(-1, '没有需要更新的字段');
    }

    paramIdx++;
    updateFields.push(`updated_at = $${paramIdx}`);
    updateValues.push(new Date());

    paramIdx++;
    updateValues.push(id);

    const updateSql = `UPDATE risk_sources SET ${updateFields.join(', ')} WHERE id = $${paramIdx} AND is_deleted = false RETURNING *`;
    const result = await client.query(updateSql, updateValues);
    const updated = result.rows[0];

    await recordVersion(updated.id, body.version || '1.0', 'update', body.changeSummary || body.change_summary || '更新风险点', body.changedBy || 'admin', { before: beforeSnapshot, after: updated }, client);
    await client.query('COMMIT');

    try {
      const newExpiry = calcExpiryStatus(updated.assessment_date, updated.review_cycle);
      const oldExpiry = calcExpiryStatus(beforeSnapshot.assessment_date, beforeSnapshot.review_cycle);
      if (newExpiry !== oldExpiry && (newExpiry === 'expiring' || newExpiry === 'expired')) {
        await notifyRiskExpiry(formatRow(updated), newExpiry);
      }
    } catch (_e) {}

    return ok(formatRow(updated), '更新成功');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// 9. DELETE /:id — 软删除
const remove = (params) => W(async () => {
  if (!isConnected()) {
    initMemoryData();
    const { id } = params;
    const idx = memoryRecords.findIndex(r => String(r.id) === String(id) && !r.is_deleted);
    if (idx === -1) return notFound('记录不存在');
    memoryRecords[idx].is_deleted = true;
    return ok(null, '删除成功(内存模式)');
  }

  const { id } = params;
  const existResult = await pool.query('SELECT id FROM risk_sources WHERE id = $1 AND is_deleted = false', [id]);
  if (existResult.rows.length === 0) return notFound('记录不存在');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE risk_sources SET is_deleted = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [id]);
    await client.query('COMMIT');
    return ok(null, '删除成功');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// 10. POST /import — 批量导入（真实写端点，仅代码迁移，冒烟不触发）
const importRecords = (body) => W(async () => {
  if (!isConnected()) {
    initMemoryData();
    const { records } = body;
    if (!Array.isArray(records)) return err(-1, 'records 必须是数组');

    const imported = records.map(r => ({
      id: memoryIdCounter++,
      source_id: pickField(r, 'sourceId') || null,
      name: r.name || '',
      type: r.type || '',
      category: r.category || '',
      location: r.location || '',
      accident_type: pickField(r, 'accidentType') || '',
      level: r.level || '四级',
      measures: r.measures || '',
      emergency: r.emergency || '',
      lat: r.lat || null,
      lng: r.lng || null,
      area: r.area || '',
      sheet: r.sheet || '',
      polygon: r.polygon || [],
      status: r.status || '正常',
      assessment_date: pickField(r, 'assessmentDate') || null,
      review_cycle: pickField(r, 'reviewCycle') || null,
      data_period: pickField(r, 'dataPeriod') || null,
      source_file_id: pickField(r, 'sourceFileId') || null,
      import_job_id: pickField(r, 'importJobId') || null,
      row_hash: pickField(r, 'rowHash') || null,
      is_deleted: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));

    memoryRecords.push(...imported);
    return ok({ imported: imported.length, total: memoryRecords.filter(r => !r.is_deleted).length }, '导入成功(内存模式)');
  }

  const { records } = body;
  if (!Array.isArray(records)) return err(-1, 'records 必须是数组');

  const client = await pool.connect();
  let importedCount = 0;
  try {
    await client.query('BEGIN');
    const insertSql = `
      INSERT INTO risk_sources
      (source_id, name, type, category, location, accident_type, level,
       measures, emergency, lat, lng, area, sheet, polygon, status,
       assessment_date, review_cycle, data_period, source_file_id, import_job_id, row_hash)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
      ON CONFLICT (source_id) DO UPDATE SET
        name = EXCLUDED.name, type = EXCLUDED.type, category = EXCLUDED.category,
        location = EXCLUDED.location, accident_type = EXCLUDED.accident_type,
        level = EXCLUDED.level, measures = EXCLUDED.measures, emergency = EXCLUDED.emergency,
        lat = EXCLUDED.lat, lng = EXCLUDED.lng, area = EXCLUDED.area, sheet = EXCLUDED.sheet,
        polygon = EXCLUDED.polygon, status = EXCLUDED.status,
        assessment_date = EXCLUDED.assessment_date, review_cycle = EXCLUDED.review_cycle,
        data_period = EXCLUDED.data_period, source_file_id = EXCLUDED.source_file_id,
        import_job_id = EXCLUDED.import_job_id, row_hash = EXCLUDED.row_hash,
        updated_at = CURRENT_TIMESTAMP
    `;
    for (const r of records) {
      await client.query(insertSql, [
        pickField(r, 'sourceId') || null,
        r.name || '', r.type || '', r.category || '', r.location || '',
        pickField(r, 'accidentType') || '', r.level || '四级', r.measures || '',
        r.emergency || '', r.lat || null, r.lng || null, r.area || '', r.sheet || '',
        JSON.stringify(r.polygon || []), r.status || '正常',
        pickField(r, 'assessmentDate') || null, pickField(r, 'reviewCycle') || null,
        pickField(r, 'dataPeriod') || null, pickField(r, 'sourceFileId') || null,
        pickField(r, 'importJobId') || null, pickField(r, 'rowHash') || null
      ]);
      importedCount++;
    }
    await client.query('COMMIT');
    const totalRes = await pool.query('SELECT COUNT(*)::int AS cnt FROM risk_sources WHERE is_deleted = false');
    return ok({ imported: importedCount, total: totalRes.rows[0].cnt }, '导入成功');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// 11. GET /:id/attachments — 附件列表（catch 走 next(err)）
const attachments = async (params) => {
  const { id } = params;
  if (!isConnected()) {
    initMemoryData();
    const data = memoryAttachments.filter(a => a.risk_id === parseInt(id) && !a.is_deleted);
    return ok(data.map(camelKeys), '查询成功(内存模式)');
  }
  await ensureTables();
  const result = await pool.query(
    'SELECT * FROM risk_attachments WHERE risk_id = $1 AND is_deleted = FALSE ORDER BY is_latest DESC, created_at DESC',
    [id]
  );
  return ok(result.rows.map(camelKeys), '查询成功');
};

// 12. POST /:id/attachments — 上传附件（真实写端点，仅代码迁移，冒烟不触发；catch 走 next(err)）
const uploadAttachment = async (req, params) => {
  const { id } = params;
  if (!req.file) return err(-1, '请上传文件');

  const { version = '1.0', uploaded_by = 'admin' } = req.body;
  const fileUrl = getFileUrl(req, req.file.filename, 'documents');
  const originalName = fixFilenameEncoding(req.file.originalname);

  if (!isConnected()) {
    initMemoryData();
    memoryAttachments.forEach(a => {
      if (a.risk_id === parseInt(id) && a.is_latest) a.is_latest = false;
    });
    const record = buildMemoryRecord(memoryAttachmentIdCounter++, {
      risk_id: parseInt(id),
      filename: req.file.filename,
      original_name: originalName,
      file_type: 'document',
      file_size: req.file.size,
      file_url: fileUrl,
      version,
      uploaded_by,
      is_latest: true,
    });
    memoryAttachments.push(record);
    return ok(camelKeys(record), '上传成功(内存模式)');
  }

  await ensureTables();
  await pool.query('UPDATE risk_attachments SET is_latest = FALSE WHERE risk_id = $1 AND is_latest = TRUE', [id]);

  const result = await pool.query(
    `INSERT INTO risk_attachments (risk_id, filename, original_name, file_type, file_size, file_url, version, uploaded_by, is_latest)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE) RETURNING *`,
    [id, req.file.filename, originalName, 'document', req.file.size, fileUrl, version, uploaded_by]
  );
  return ok(camelKeys(result.rows[0]), '上传成功');
};

// 13. DELETE /:id/attachments/:aid — 删除附件（catch 走 next(err)）
const deleteAttachment = async (params) => {
  const { id, aid } = params;
  if (!isConnected()) {
    initMemoryData();
    const att = memoryAttachments.find(a => a.id === parseInt(aid) && a.risk_id === parseInt(id) && !a.is_deleted);
    if (!att) return notFound('附件不存在');
    att.is_deleted = true;
    return ok(null, '删除成功(内存模式)');
  }
  await ensureTables();
  const result = await pool.query('UPDATE risk_attachments SET is_deleted = TRUE WHERE id = $1 AND risk_id = $2 RETURNING id', [aid, id]);
  if (result.rows.length === 0) return notFound('附件不存在');
  return ok(null, '删除成功');
};

// 14. GET /:id/versions — 历史版本履历（catch 走 next(err)）
const versions = async (params) => {
  const { id } = params;
  if (!isConnected()) {
    initMemoryData();
    const data = memoryVersions.filter(v => v.risk_id === parseInt(id));
    return ok(data.map(camelKeys), '查询成功(内存模式)');
  }
  await ensureTables();
  const result = await pool.query('SELECT * FROM risk_versions WHERE risk_id = $1 ORDER BY created_at DESC', [id]);
  return ok(result.rows.map(camelKeys), '查询成功');
};

// 15. PUT /:id/assess — LEC / LS 风险评估（requireRole 在绑定层；真实写端点，冒烟仅测未登录 401）
const assess = (params, body, user) => W(async () => {
  const { id } = params;
  body = body || {};
  const method = String(body.method || 'LEC').toUpperCase();
  const changedBy = body.changedBy || user?.username || 'admin';

  const calc = calcAssessmentScore(method, body);
  if (!calc.ok) return err(-1, calc.msg);
  const judged = judgeAssessmentLevel(method, calc.score);
  if (!judged) return err(-1, `无法判定风险等级（method=${method}, score=${calc.score}）`);

  const scale = ASSESSMENT_SCALES[method];
  const factorText = scale.factors.map((f) => `${f.symbol}=${calc.factors[f.code]}`).join(' × ');

  const assessmentDate = typeof body.assessmentDate === 'string' && body.assessmentDate
    ? body.assessmentDate.slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const reviewCycle = normalizeReviewCycle(body.reviewCycle === undefined ? body.review_cycle : body.reviewCycle);

  if (!isConnected()) {
    initMemoryData();
    const idx = memoryRecords.findIndex((r) => String(r.id) === String(id) && !r.is_deleted);
    if (idx === -1) return notFound('记录不存在');
    const record = memoryRecords[idx];
    const beforeSnapshot = { ...record };

    record.assessment_method = method;
    record.assessment_score = calc.score;
    record.level = judged.level;
    record.assessment_date = assessmentDate;
    if (reviewCycle !== null) record.review_cycle = reviewCycle;
    record.updated_at = new Date().toISOString();

    const summary = `${method} 评估：${factorText} = ${calc.score} → ${judged.level}` +
      (beforeSnapshot.level && beforeSnapshot.level !== judged.level ? `（原 ${beforeSnapshot.level}）` : '');
    await recordVersion(record.id, body.version || '1.0', 'assess', summary, changedBy, {
      before: beforeSnapshot, after: record, method, factors: calc.factors, score: calc.score, level: judged.level,
    });

    if (beforeSnapshot.level !== judged.level) {
      await notifyRiskLevelChange(record, beforeSnapshot.level, judged.level, method, calc.score);
    }

    return ok({ ...formatRow(record), assessment: { method, factors: calc.factors, score: calc.score, ...judged } }, '评估保存成功(内存模式)');
  }

  await ensureTables();
  const existResult = await pool.query('SELECT * FROM risk_sources WHERE id = $1 AND is_deleted = false', [id]);
  if (existResult.rows.length === 0) return notFound('记录不存在');
  const beforeSnapshot = existResult.rows[0];

  const client = await pool.connect();
  let updated = null;
  try {
    await client.query('BEGIN');
    const updateResult = await client.query(
      `UPDATE risk_sources
       SET assessment_method = $1, assessment_score = $2, level = $3, assessment_date = $4,
           review_cycle = COALESCE($5, review_cycle), updated_at = CURRENT_TIMESTAMP
       WHERE id = $6 AND is_deleted = false RETURNING *`,
      [method, calc.score, judged.level, assessmentDate, reviewCycle, id]
    );
    updated = updateResult.rows[0];

    const summary = `${method} 评估：${factorText} = ${calc.score} → ${judged.level}` +
      (beforeSnapshot.level && beforeSnapshot.level !== judged.level ? `（原 ${beforeSnapshot.level}）` : '');
    await recordVersion(updated.id, body.version || '1.0', 'assess', body.remark ? `${summary}；备注：${body.remark}` : summary, changedBy, {
      before: beforeSnapshot, after: updated, method, factors: calc.factors, score: calc.score, level: judged.level,
    }, client);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  try {
    if (beforeSnapshot.level !== updated.level) {
      await notifyRiskLevelChange(updated, beforeSnapshot.level, updated.level, method, calc.score);
    }
    const newExpiry = calcExpiryStatus(updated.assessment_date, updated.review_cycle);
    const oldExpiry = calcExpiryStatus(beforeSnapshot.assessment_date, beforeSnapshot.review_cycle);
    if (newExpiry !== oldExpiry && (newExpiry === 'expiring' || newExpiry === 'expired')) {
      await notifyRiskExpiry(formatRow(updated), newExpiry);
    }
  } catch (_e) {}

  return ok({ ...formatRow(updated), assessment: { method, factors: calc.factors, score: calc.score, ...judged } }, '评估保存成功');
});

// 16. GET /:id/related-hazards — 关联隐患列表（catch 走 next(err)）
const relatedHazards = async (params) => {
  const { id } = params;
  if (!isConnected()) {
    initMemoryData();
    const relatedIds = memoryRiskHazardLinks.filter((l) => String(l.risk_id) === String(id)).map((l) => l.hazard_id);
    return ok({ hazardIds: relatedIds, total: relatedIds.length }, '查询成功(内存模式)');
  }
  await ensureTables();
  const result = await pool.query(`
    SELECT h.*, rhl.link_type, rhl.created_at AS linked_at
    FROM risk_hazard_links rhl
    JOIN hazards h ON h.id = rhl.hazard_id
    WHERE rhl.risk_id = $1 AND h.is_deleted = FALSE
    ORDER BY rhl.created_at DESC
  `, [id]);
  return ok({ list: result.rows.map(formatHazardRow), total: result.rows.length }, '查询成功');
};

// 17. POST /:id/generate-hazard — 从风险点生成隐患（真实写端点，仅代码迁移，冒烟不触发；catch 走 next(err)）
const generateHazard = async (params, body, user) => {
  const { id } = params;
  body = body || {};
  const createdBy = body.changedBy || body.createdBy || user?.username || 'system';
  const linkType = body.linkType || 'manual';

  let riskRow = null;
  if (isConnected()) {
    await ensureTables();
    const riskResult = await pool.query('SELECT * FROM risk_sources WHERE id = $1 AND is_deleted = false', [id]);
    if (riskResult.rows.length === 0) return err(-2, '风险点不存在');
    riskRow = riskResult.rows[0];
  } else {
    initMemoryData();
    riskRow = memoryRecords.find((r) => String(r.id) === String(id) && !r.is_deleted);
    if (!riskRow) return err(-2, '风险点不存在(内存模式)');
  }

  const today = new Date().toISOString().slice(0, 10);
  const description = body.description || `风险点「${riskRow.name}」衍生隐患排查`;
  const measure = body.measure || riskRow.measures || '';
  const checker = body.checker || createdBy;
  const fixer = body.fixer || '';
  // P3-04-00 (W11): 统一 canonical 初始状态，禁止再写历史中文 '未完成'。
  // 本路径由“风险点生成隐患”触发，状态由服务端固定为 discovered，不接受客户端指定。
  const status = 'discovered';
  const riskLevel = riskRow.level || '四级';

  let newHazard = null;

  if (isConnected()) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const insertHazardSql = `
        INSERT INTO hazards (no, hazard_date, description, measure, checker, fixer, fix_date, status, remark, related_risk_id, risk_level)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *
      `;
      const hazardResult = await client.query(insertHazardSql, [
        body.no || null, today, description, measure, checker, fixer,
        body.fixDate || null, status, body.remark || `由风险点「${riskRow.name}」生成`, parseInt(id), riskLevel,
      ]);
      newHazard = hazardResult.rows[0];
      await linkRiskHazard(parseInt(id), newHazard.id, linkType, createdBy, client);
      await client.query('UPDATE risk_sources SET hazard_count = hazard_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [id]);
      await recordVersion(parseInt(id), body.version || '1.0', 'link', `生成关联隐患 #${newHazard.id}`, createdBy, { riskId: id, hazardId: newHazard.id }, client);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } else {
    const fakeHazardId = Date.now();
    await linkRiskHazard(parseInt(id), fakeHazardId, linkType, createdBy);
    newHazard = {
      id: fakeHazardId,
      no: body.no || null,
      hazard_date: today,
      description,
      measure,
      checker,
      fixer,
      fix_date: body.fixDate || null,
      status,
      remark: body.remark || `由风险点「${riskRow.name}」生成`,
      related_risk_id: parseInt(id),
      risk_level: riskLevel,
    };
    riskRow.hazard_count = (riskRow.hazard_count || 0) + 1;
    riskRow.updated_at = new Date().toISOString();
  }

  return ok(camelKeys(newHazard), '隐患记录已生成');
};

// 18-24. rules/*
const ruleLevels = () => W(async () => ok(hseRules.getRiskLevels(), '获取风险等级规则成功'));
const ruleAssessmentMethods = () => W(async () => ok(hseRules.getAssessmentMethods(), '获取评价方法成功'));
const ruleControlMeasures = () => W(async () => ok(hseRules.getControlMeasureTypes(), '获取管控措施分类成功'));
const ruleCategories = () => W(async () => ok(hseRules.getRiskCategories(), '获取风险类别成功'));
const ruleResponsibilityMatrix = () => W(async () => ok(hseRules.getResponsibilityMatrix(), '获取责任矩阵成功'));
const ruleAssessmentScales = () => W(async () => ok({ scales: ASSESSMENT_SCALES, reviewCycleOptions: REVIEW_CYCLE_OPTIONS }, '获取风险评估量表成功'));
const ruleAll = () => W(async () => ok({
  riskLevels: hseRules.getRiskLevels(),
  assessmentMethods: hseRules.getAssessmentMethods(),
  controlMeasureTypes: hseRules.getControlMeasureTypes(),
  riskCategories: hseRules.getRiskCategories(),
  responsibilityMatrix: hseRules.getResponsibilityMatrix(),
  assessmentScales: ASSESSMENT_SCALES,
  reviewCycleOptions: REVIEW_CYCLE_OPTIONS,
}, '获取风险管控全部规则成功'));

module.exports = {
  statsAll,
  statsLevel,
  statsType,
  riskExport,
  list,
  detail,
  create,
  update,
  remove,
  importRecords,
  attachments,
  uploadAttachment,
  deleteAttachment,
  versions,
  assess,
  relatedHazards,
  generateHazard,
  ruleLevels,
  ruleAssessmentMethods,
  ruleControlMeasures,
  ruleCategories,
  ruleResponsibilityMatrix,
  ruleAssessmentScales,
  ruleAll,
};