/**
 * 风险管控路由 - PostgreSQL + 内存降级双模式
 * DB 在线时使用 PG 查询，离线时自动降级到内存存储
 *
 * 端点:
 *   GET    /                  列表查询（含 expiryStatus 时效状态）
 *   GET    /stats/all         全部统计
 *   GET    /stats/level       按等级统计
 *   GET    /stats/type        按类型统计
 *   GET    /export            导出 CSV（风险清单）
 *   GET    /:id               单条详情（含 expiryStatus）
 *   POST   /                  创建（自动记录版本履历）
 *   PUT    /:id               更新（自动记录版本履历）
 *   DELETE /:id               软删除
 *   POST   /import            批量导入
 *   GET    /:id/attachments   附件列表
 *   POST   /:id/attachments   上传附件
 *   DELETE /:id/attachments/:aid  删除附件
 *   GET    /:id/versions      历史版本履历
 *   PUT    /:id/assess        风险评估（LEC / LS，写 level + 版本履历 + 等级变更通知）
 *   GET    /rules/assessment-scales  评估量表（因子选项 + 等级阈值 + 复评周期）
 */

const express = require('express');
const router = express.Router();
const { pool, isConnected } = require('../config/db');
const { success, error } = require('../middleware/response');
const { sendNotFound, sendValidationError, buildMemoryRecord, camelKeys, pickField } = require('../utils/commonResponse');
const { uploadDocument, getFileUrl, fixFilenameEncoding } = require('../middleware/upload');
const { createNotification } = require('../services/notificationService');
const { requireRole } = require('../middleware/auth');
const hseRules = require('../config/hseRules');

// ============================================================
// 风险评估规则常量（LEC / LS 矩阵法）
// ------------------------------------------------------------
// 规范要求：禁止硬编码业务计算规则。此处集中定义为后端权威常量，
// 并通过 GET /rules/assessment-scales 下发给前端，前端不得自行硬编码
// 因子取值、中文标签或等级阈值。
//
// LEC 阈值口径依据提示词-206 §3.1（企业内控口径，非经典 320 分制）：
//   D >= 160 → 一级 / 70~159 → 二级 / 20~69 → 三级 / < 20 → 四级
// LS 阈值依据提示词-206 §3.2：
//   L×S >= 20 → 一级 / 15~19 → 二级 / 10~14 → 三级 / < 10 → 四级
// ============================================================
const ASSESSMENT_SCALES = {
  LEC: {
    method: 'LEC',
    label: 'LEC 作业条件危险性评价法',
    formula: 'D = L × E × C',
    factors: [
      {
        code: 'l',
        symbol: 'L',
        label: '事故发生的可能性',
        options: [
          { value: 10, label: '完全可以预料' },
          { value: 6, label: '相当可能' },
          { value: 3, label: '可能，但不经常' },
          { value: 1, label: '可能性小，完全意外' },
          { value: 0.5, label: '很不可能，可以设想' },
          { value: 0.2, label: '极不可能' },
          { value: 0.1, label: '实际不可能' },
        ],
      },
      {
        code: 'e',
        symbol: 'E',
        label: '暴露于危险环境的频繁程度',
        options: [
          { value: 10, label: '连续暴露' },
          { value: 6, label: '每天工作时间内暴露' },
          { value: 3, label: '每周一次或偶然暴露' },
          { value: 2, label: '每月一次暴露' },
          { value: 1, label: '每年几次暴露' },
          { value: 0.5, label: '非常罕见地暴露' },
        ],
      },
      {
        code: 'c',
        symbol: 'C',
        label: '发生事故产生的后果',
        options: [
          { value: 100, label: '大灾难，许多人死亡' },
          { value: 40, label: '灾难，数人死亡' },
          { value: 15, label: '非常严重，一人死亡' },
          { value: 7, label: '严重，重伤' },
          { value: 3, label: '重大，致残' },
          { value: 1, label: '引人注目，需要救护' },
        ],
      },
    ],
    // 阈值按 min 降序排列，取首个 score >= min 的等级
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
      {
        code: 'l',
        symbol: 'L',
        label: '事故发生的可能性',
        options: [
          { value: 5, label: '很可能（经常发生）' },
          { value: 4, label: '较可能（可能发生）' },
          { value: 3, label: '可能（偶尔发生）' },
          { value: 2, label: '不太可能（很少发生）' },
          { value: 1, label: '极不可能（几乎不发生）' },
        ],
      },
      {
        code: 's',
        symbol: 'S',
        label: '后果的严重性',
        options: [
          { value: 5, label: '特别严重（多人死亡）' },
          { value: 4, label: '严重（一人死亡或多人重伤）' },
          { value: 3, label: '较大（重伤或职业病）' },
          { value: 2, label: '一般（轻伤，需就医）' },
          { value: 1, label: '轻微（无伤或轻微不适）' },
        ],
      },
    ],
    thresholds: [
      { min: 20, level: '一级', color: 'red', alias: '重大风险', desc: '不可容许，必须立即停止作业' },
      { min: 15, level: '二级', color: 'orange', alias: '较大风险', desc: '重大风险，需制定管控方案' },
      { min: 10, level: '三级', color: 'gold', alias: '一般风险', desc: '中等风险，需要管控' },
      { min: 0, level: '四级', color: 'green', alias: '低风险', desc: '可接受，保持现有措施' },
    ],
  },
};

// 复评周期候选（月），0 表示长期有效
const REVIEW_CYCLE_OPTIONS = [
  { value: 3, label: '3 个月' },
  { value: 6, label: '6 个月' },
  { value: 12, label: '12 个月' },
  { value: 24, label: '24 个月' },
  { value: 0, label: '长期有效' },
];

/**
 * 依据评估方法与得分判定风险等级（后端权威判定，不信任前端传入）
 * @param {'LEC'|'LS'} method
 * @param {number} score
 * @returns {{ level: string, color: string, alias: string, desc: string }|null}
 */
function judgeAssessmentLevel(method, score) {
  const scale = ASSESSMENT_SCALES[method];
  if (!scale || !Number.isFinite(score)) return null;
  return scale.thresholds.find((t) => score >= t.min) || scale.thresholds[scale.thresholds.length - 1];
}

/**
 * 校验因子取值是否落在规则允许的候选集合内，并计算得分。
 * @param {'LEC'|'LS'} method
 * @param {Record<string, any>} body
 * @returns {{ ok: true, score: number, factors: Record<string, number> } | { ok: false, msg: string }}
 */
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
      return {
        ok: false,
        msg: `评估因子 ${f.symbol} 取值非法：${raw}，允许值 [${f.options.map((o) => o.value).join(', ')}]`,
      };
    }
    factors[f.code] = hit.value;
    score *= hit.value;
  }
  // LEC 因子含小数（0.1/0.2/0.5），浮点乘法需归一到 2 位小数
  return { ok: true, score: Math.round(score * 100) / 100, factors };
}

/** 归一化复评周期：允许 0（长期有效），非法值回落到 12 */
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
    // 1. 附件表
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

    // 2. 版本履历表
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

    // 3. 风险源表补充字段（评估日期/复评周期，向后兼容）
    try {
      await pool.query(`ALTER TABLE risk_sources ADD COLUMN IF NOT EXISTS assessment_date DATE`);
      await pool.query(`ALTER TABLE risk_sources ADD COLUMN IF NOT EXISTS review_cycle INT DEFAULT 12`);
      // 联动字段：最近隐患检查日期 / 关联隐患数
      await pool.query(`ALTER TABLE risk_sources ADD COLUMN IF NOT EXISTS last_hazard_check_date DATE`);
      await pool.query(`ALTER TABLE risk_sources ADD COLUMN IF NOT EXISTS hazard_count INT DEFAULT 0`);
      // 业务补充字段：责任部门、责任人、所属作业、岗位、管控措施分类、评价方法
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
    } catch (_e) {
      // 字段已存在或表不存在，忽略
    }

    // 4. 风险-隐患关联表（多对多，支持 link_type 区分主动生成/手动关联/临期自动生成）
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
    } catch (_e) {
      // 关联表已存在或 hazards 表不存在，忽略
    }

    // 5. hazards 表联动字段（幂等迁移）
    try {
      await pool.query(`ALTER TABLE hazards ADD COLUMN IF NOT EXISTS related_risk_id BIGINT`);
      await pool.query(`ALTER TABLE hazards ADD COLUMN IF NOT EXISTS risk_level VARCHAR(32)`);
    } catch (_e) {
      // 字段已存在或表不存在，忽略
    }

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

// ========== 时效状态计算（临期/过期/正常） ==========
// 规则：基于 assessment_date + review_cycle(月) 计算复评到期日
// - 过期：当前日期 > 到期日
// - 临期：距到期日 ≤ 30 天（含已过期）
// - 正常：距到期日 > 30 天 或 长期有效（review_cycle 为空）
function calcExpiryStatus(assessmentDate, reviewCycle) {
  if (!assessmentDate || !reviewCycle || reviewCycle <= 0) {
    return 'permanent'; // 长期有效
  }
  const eff = new Date(assessmentDate);
  if (isNaN(eff.getTime())) return 'unknown';
  const expiry = new Date(eff);
  expiry.setMonth(expiry.getMonth() + parseInt(reviewCycle));
  const now = new Date();
  const diffDays = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'expired';   // 已过期
  if (diffDays <= 30) return 'expiring'; // 临期（30天内）
  return 'normal';
}

// ========== 辅助：将 DB 行转为前端期望的字段格式（统一 camelCase 输出）==========
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

// ========== 内存降级：风险-隐患关联存储 ==========
let memoryRiskHazardLinks = [];
let memoryLinkIdCounter = 1;

// ========== 风险临期/过期 → 通知中心推送 ==========
// 复用 notificationService.createNotification，仅在状态变化时推送，避免重复
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
      userId: null, // 系统级广播，由 notifications 路由分发
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

// ========== 风险等级变更 → 通知中心推送（评估工作台专用）==========
// 仅在 assess 端点判定出的新等级与旧等级不一致时触发，避免噪声。
async function notifyRiskLevelChange(risk, oldLevel, newLevel, method, score) {
  try {
    if (!risk) return;
    // 等级序号越小越危险，用于判断升级/降级
    const order = { 一级: 1, 二级: 2, 三级: 3, 四级: 4 };
    const isUpgrade = (order[newLevel] || 99) < (order[oldLevel] || 99);
    const title = isUpgrade
      ? `风险等级升级：${risk.name}`
      : `风险等级调整：${risk.name}`;
    const content =
      `风险点「${risk.name}」经 ${method} 评估，风险值 ${score}，` +
      `等级由「${oldLevel || '未评估'}」变更为「${newLevel}」。` +
      (isUpgrade ? '请立即复核管控措施并落实责任人。' : '请同步更新管控台账。');
    await createNotification({
      userId: null, // 系统级广播，由 notifications 路由分发
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
    // 内存模式：去重
    const exist = memoryRiskHazardLinks.find(
      (l) => l.risk_id === riskId && l.hazard_id === hazardId
    );
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

// ========== 1. GET /stats/all — 统计：总数 + 按等级 + 按类型 + 按区域 ==========
router.get('/stats/all', async (req, res) => {
  try {
    if (!isConnected()) {
      initMemoryData();
      const data = memoryRecords.filter(r => !r.is_deleted);
      const stats = {
        total: data.length,
        byLevel: { '一级': 0, '二级': 0, '三级': 0, '四级': 0 },
        byType: {},
        byArea: {},
        expiring: 0,
        expired: 0,
      };
      data.forEach(r => {
        if (r.level && stats.byLevel.hasOwnProperty(r.level)) {
          stats.byLevel[r.level]++;
        }
        if (r.type) stats.byType[r.type] = (stats.byType[r.type] || 0) + 1;
        if (r.area) stats.byArea[r.area] = (stats.byArea[r.area] || 0) + 1;
        const es = calcExpiryStatus(r.assessment_date, r.review_cycle);
        if (es === 'expiring') stats.expiring++;
        if (es === 'expired') stats.expired++;
      });
      return res.json(success(stats, '统计成功(内存模式)'));
    }

    const client = await pool.connect();
    try {
      const totalRes = await client.query(
        'SELECT COUNT(*)::int AS cnt FROM risk_sources WHERE is_deleted = false'
      );
      const levelRes = await client.query(`
        SELECT level, COUNT(*)::int AS cnt
        FROM risk_sources
        WHERE is_deleted = false
        GROUP BY level
      `);
      const typeRes = await client.query(`
        SELECT type, COUNT(*)::int AS cnt
        FROM risk_sources
        WHERE is_deleted = false AND type IS NOT NULL AND type != ''
        GROUP BY type
      `);
      const areaRes = await client.query(`
        SELECT area, COUNT(*)::int AS cnt
        FROM risk_sources
        WHERE is_deleted = false AND area IS NOT NULL AND area != ''
        GROUP BY area
      `);

      const byLevel = { '一级': 0, '二级': 0, '三级': 0, '四级': 0 };
      levelRes.rows.forEach(r => {
        if (byLevel.hasOwnProperty(r.level)) byLevel[r.level] = r.cnt;
      });
      const byType = {};
      typeRes.rows.forEach(r => { byType[r.type] = r.cnt; });
      const byArea = {};
      areaRes.rows.forEach(r => { byArea[r.area] = r.cnt; });

      // 时效统计（内存计算，避免依赖 DB 函数）
      const allRes = await client.query(
        'SELECT assessment_date, review_cycle FROM risk_sources WHERE is_deleted = false'
      );
      let expiring = 0, expired = 0;
      allRes.rows.forEach(r => {
        const es = calcExpiryStatus(r.assessment_date, r.review_cycle);
        if (es === 'expiring') expiring++;
        if (es === 'expired') expired++;
      });

      // ========== 联动统计：关联隐患数 ==========
      let linkedHazardCount = 0;
      let riskWithHazardCount = 0;
      try {
        const linkRes = await client.query(
          'SELECT COUNT(DISTINCT risk_id)::int AS cnt FROM risk_hazard_links'
        );
        riskWithHazardCount = linkRes.rows[0]?.cnt || 0;
        const totalLinkRes = await client.query(
          'SELECT COUNT(*)::int AS cnt FROM risk_hazard_links'
        );
        linkedHazardCount = totalLinkRes.rows[0]?.cnt || 0;
      } catch (_e) {
        // risk_hazard_links 表可能尚未初始化，忽略
      }

      res.json(success({
        total: totalRes.rows[0].cnt,
        byLevel, byType, byArea,
        expiring, expired,
        linkedHazards: linkedHazardCount,
        riskWithHazards: riskWithHazardCount,
      }, '统计成功'));
    } finally {
      client.release();
    }
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// ========== 2. GET /stats/level — 按等级统计 ==========
router.get('/stats/level', async (req, res) => {
  try {
    if (!isConnected()) {
      initMemoryData();
      const data = memoryRecords.filter(r => !r.is_deleted);
      const byLevel = { '一级': 0, '二级': 0, '三级': 0, '四级': 0 };
      data.forEach(r => {
        if (r.level && byLevel.hasOwnProperty(r.level)) byLevel[r.level]++;
      });
      return res.json(success(byLevel, '统计成功(内存模式)'));
    }

    const result = await pool.query(`
      SELECT level, COUNT(*)::int AS cnt
      FROM risk_sources
      WHERE is_deleted = false
      GROUP BY level
    `);
    const byLevel = { '一级': 0, '二级': 0, '三级': 0, '四级': 0 };
    result.rows.forEach(r => {
      if (byLevel.hasOwnProperty(r.level)) byLevel[r.level] = r.cnt;
    });
    res.json(success(byLevel, '统计成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// ========== 3. GET /stats/type — 按类型统计 ==========
router.get('/stats/type', async (req, res) => {
  try {
    if (!isConnected()) {
      initMemoryData();
      const data = memoryRecords.filter(r => !r.is_deleted);
      const byType = {};
      data.forEach(r => {
        if (r.type) byType[r.type] = (byType[r.type] || 0) + 1;
      });
      return res.json(success(byType, '统计成功(内存模式)'));
    }

    const result = await pool.query(`
      SELECT type, COUNT(*)::int AS cnt
      FROM risk_sources
      WHERE is_deleted = false AND type IS NOT NULL AND type != ''
      GROUP BY type
    `);
    const byType = {};
    result.rows.forEach(r => { byType[r.type] = r.cnt; });
    res.json(success(byType, '统计成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// ========== 4. GET /export — 导出风险清单（CSV） ==========
function sendCsvExport(res, data) {
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
  const csv = '\uFEFF' + headers.map(h => `"${h}"`).join(',') + '\n' + rows.join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="risk_control_${new Date().toISOString().slice(0, 10)}.csv"`);
  return res.send(csv);
}

router.get('/export', async (req, res) => {
  try {
    if (!isConnected()) {
      initMemoryData();
      const data = memoryRecords.filter(r => !r.is_deleted).map(r => ({
        ...r,
        expiry_status: calcExpiryStatus(r.assessment_date, r.review_cycle),
      }));
      return sendCsvExport(res, data);
    }

    await ensureTables();
    const result = await pool.query(`
      SELECT * FROM risk_sources WHERE is_deleted = FALSE ORDER BY id ASC
    `);
    const list = result.rows.map(r => ({
      ...r,
      expiry_status: calcExpiryStatus(r.assessment_date, r.review_cycle),
    }));
    sendCsvExport(res, list);
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// ========== 5. GET / — 列表查询（分页 + 筛选） ==========
router.get('/', async (req, res) => {
  try {
    if (!isConnected()) {
      initMemoryData();
      let data = memoryRecords.filter(r => !r.is_deleted);
      const { level, type, area, keyword, expiryStatus } = req.query;

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

      return res.json(success({
        list: data.map(formatRow),
        total: data.length
      }, '查询成功(内存模式)'));
    }

    let whereSql = ' WHERE is_deleted = false';
    const params = [];
    let paramIdx = 0;

    const { level, type, area, keyword, expiryStatus, page = 1, pageSize = 100 } = req.query;

    if (level) {
      paramIdx++;
      whereSql += ` AND level = $${paramIdx}`;
      params.push(level);
    }
    if (type) {
      paramIdx++;
      whereSql += ` AND type = $${paramIdx}`;
      params.push(type);
    }
    if (area) {
      paramIdx++;
      whereSql += ` AND area = $${paramIdx}`;
      params.push(area);
    }
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

    const listSql = `
      SELECT * FROM risk_sources
      ${whereSql}
      ORDER BY id ASC
      LIMIT $${limitP} OFFSET $${offsetP}
    `;
    const result = await pool.query(listSql, params);

    let rows = result.rows.map(formatRow);
    if (expiryStatus) {
      rows = rows.filter(r => r.expiryStatus === expiryStatus);
    }

    res.json(success({
      list: rows,
      total: expiryStatus ? rows.length : total,
      page: parseInt(page),
      pageSize: parseInt(pageSize)
    }, '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// ========== 6. GET /:id — 获取单条记录 ==========
router.get('/:id', async (req, res) => {
  try {
    if (!isConnected()) {
      initMemoryData();
      const { id } = req.params;
      const record = memoryRecords.find(r => String(r.id) === String(id) && !r.is_deleted);
      if (!record) {
        return sendNotFound(res);
      }
      return res.json(success(formatRow(record), '查询成功(内存模式)'));
    }

    const { id } = req.params;
    const result = await pool.query(
      'SELECT * FROM risk_sources WHERE id = $1 AND is_deleted = false',
      [id]
    );

    if (result.rows.length === 0) {
      return res.json(error(-2, '记录不存在'));
    }

    res.json(success(formatRow(result.rows[0]), '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// ========== 7. POST / — 创建记录 ==========
router.post('/', async (req, res) => {
  try {
    if (!isConnected()) {
      initMemoryData();
      const body = req.body;
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
      // 记录版本履历
      await recordVersion(newRecord.id, '1.0', 'create', '创建风险点', body.changedBy || 'admin', newRecord);
      return res.json(success(formatRow(newRecord), '创建成功(内存模式)'));
    }

    const body = req.body;
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

      // 记录版本履历
      await recordVersion(newRecord.id, '1.0', 'create', '创建风险点', body.changedBy || 'admin', newRecord, client);

      await client.query('COMMIT');
      res.json(success(formatRow(newRecord), '创建成功'));
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// ========== 8. PUT /:id — 更新记录 ==========
router.put('/:id', async (req, res) => {
  try {
    if (!isConnected()) {
      initMemoryData();
      const { id } = req.params;
      const idx = memoryRecords.findIndex(r => String(r.id) === String(id) && !r.is_deleted);
      if (idx === -1) {
        return res.json(error(-2, '记录不存在'));
      }

      const record = memoryRecords[idx];
      const body = req.body;

      const columnToCamel = {
        source_id: 'sourceId',
        accident_type: 'accidentType',
        assessment_date: 'assessmentDate',
        review_cycle: 'reviewCycle',
        data_period: 'dataPeriod',
        source_file_id: 'sourceFileId',
        import_job_id: 'importJobId',
        row_hash: 'rowHash',
      };
      const updatableFields = [
        'source_id', 'name', 'type', 'category', 'location', 'accident_type',
        'level', 'measures', 'emergency', 'lat', 'lng', 'area', 'sheet',
        'polygon', 'status', 'assessment_date', 'review_cycle', 'data_period',
        'source_file_id', 'import_job_id', 'row_hash'
      ];

      const snapshotBefore = { ...record };
      updatableFields.forEach(field => {
        const camelKey = columnToCamel[field] || field;
        const val = pickField(body, camelKey);
        if (val !== undefined) {
          record[field] = val;
        }
      });
      record.updated_at = new Date().toISOString();

      // 记录版本履历
      await recordVersion(record.id, body.version || '1.0', 'update', body.changeSummary || body.change_summary || '更新风险点', body.changedBy || 'admin', { before: snapshotBefore, after: record });

      // ========== 联动通知：临期/过期时推送通知中心 ==========
      try {
        const newExpiry = calcExpiryStatus(record.assessment_date, record.review_cycle);
        const oldExpiry = calcExpiryStatus(snapshotBefore.assessment_date, snapshotBefore.review_cycle);
        if (newExpiry !== oldExpiry && (newExpiry === 'expiring' || newExpiry === 'expired')) {
          await notifyRiskExpiry(formatRow(record), newExpiry);
        }
      } catch (_e) {
        // 通知失败不影响主流程
      }

      return res.json(success(formatRow(record), '更新成功(内存模式)'));
    }

    const { id } = req.params;
    const body = req.body;

    const existResult = await pool.query(
      'SELECT * FROM risk_sources WHERE id = $1 AND is_deleted = false',
      [id]
    );
    if (existResult.rows.length === 0) {
      return res.json(error(-2, '记录不存在'));
    }
    const beforeSnapshot = existResult.rows[0];

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const updateFields = [];
      const updateValues = [];
      let paramIdx = 0;

      const columnToCamel = {
        source_id: 'sourceId',
        accident_type: 'accidentType',
        assessment_date: 'assessmentDate',
        review_cycle: 'reviewCycle',
        data_period: 'dataPeriod',
        source_file_id: 'sourceFileId',
        import_job_id: 'importJobId',
        row_hash: 'rowHash',
      };
      const updatableColumns = [
        'source_id', 'name', 'type', 'category', 'location', 'accident_type',
        'level', 'measures', 'emergency', 'lat', 'lng', 'area', 'sheet',
        'polygon', 'status', 'assessment_date', 'review_cycle', 'data_period',
        'source_file_id', 'import_job_id', 'row_hash'
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
        return res.json(error(-1, '没有需要更新的字段'));
      }

      paramIdx++;
      updateFields.push(`updated_at = $${paramIdx}`);
      updateValues.push(new Date());

      paramIdx++;
      updateValues.push(id);

      const updateSql = `
        UPDATE risk_sources
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIdx} AND is_deleted = false
        RETURNING *
      `;
      const result = await client.query(updateSql, updateValues);
      const updated = result.rows[0];

      // 记录版本履历
      await recordVersion(updated.id, body.version || '1.0', 'update', body.changeSummary || body.change_summary || '更新风险点', body.changedBy || 'admin', { before: beforeSnapshot, after: updated }, client);

      await client.query('COMMIT');

      // ========== 联动通知：临期/过期时推送通知中心 ==========
      try {
        const newExpiry = calcExpiryStatus(updated.assessment_date, updated.review_cycle);
        const oldExpiry = calcExpiryStatus(beforeSnapshot.assessment_date, beforeSnapshot.review_cycle);
        if (newExpiry !== oldExpiry && (newExpiry === 'expiring' || newExpiry === 'expired')) {
          await notifyRiskExpiry(formatRow(updated), newExpiry);
        }
      } catch (_e) {
        // 通知失败不影响主流程
      }

      res.json(success(formatRow(updated), '更新成功'));
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// ========== 9. DELETE /:id — 软删除记录 ==========
router.delete('/:id', async (req, res) => {
  try {
    if (!isConnected()) {
      initMemoryData();
      const { id } = req.params;
      const idx = memoryRecords.findIndex(r => String(r.id) === String(id) && !r.is_deleted);
      if (idx === -1) {
        return res.json(error(-2, '记录不存在'));
      }
      memoryRecords[idx].is_deleted = true;
      return res.json(success(null, '删除成功(内存模式)'));
    }

    const { id } = req.params;

    const existResult = await pool.query(
      'SELECT id FROM risk_sources WHERE id = $1 AND is_deleted = false',
      [id]
    );
    if (existResult.rows.length === 0) {
      return res.json(error(-2, '记录不存在'));
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'UPDATE risk_sources SET is_deleted = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [id]
      );
      await client.query('COMMIT');
      res.json(success(null, '删除成功'));
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// ========== 10. POST /import — 批量导入 ==========
router.post('/import', async (req, res) => {
  try {
    if (!isConnected()) {
      initMemoryData();
      const { records } = req.body;
      if (!Array.isArray(records)) {
        return res.json(error(-1, 'records 必须是数组'));
      }

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

      return res.json(success({ imported: imported.length, total: memoryRecords.filter(r => !r.is_deleted).length }, '导入成功(内存模式)'));
    }

    const { records } = req.body;
    if (!Array.isArray(records)) {
      return res.json(error(-1, 'records 必须是数组'));
    }

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
          name = EXCLUDED.name,
          type = EXCLUDED.type,
          category = EXCLUDED.category,
          location = EXCLUDED.location,
          accident_type = EXCLUDED.accident_type,
          level = EXCLUDED.level,
          measures = EXCLUDED.measures,
          emergency = EXCLUDED.emergency,
          lat = EXCLUDED.lat,
          lng = EXCLUDED.lng,
          area = EXCLUDED.area,
          sheet = EXCLUDED.sheet,
          polygon = EXCLUDED.polygon,
          status = EXCLUDED.status,
          assessment_date = EXCLUDED.assessment_date,
          review_cycle = EXCLUDED.review_cycle,
          data_period = EXCLUDED.data_period,
          source_file_id = EXCLUDED.source_file_id,
          import_job_id = EXCLUDED.import_job_id,
          row_hash = EXCLUDED.row_hash,
          updated_at = CURRENT_TIMESTAMP
      `;

      for (const r of records) {
        await client.query(insertSql, [
          pickField(r, 'sourceId') || null,
          r.name || '',
          r.type || '',
          r.category || '',
          r.location || '',
          pickField(r, 'accidentType') || '',
          r.level || '四级',
          r.measures || '',
          r.emergency || '',
          r.lat || null,
          r.lng || null,
          r.area || '',
          r.sheet || '',
          JSON.stringify(r.polygon || []),
          r.status || '正常',
          pickField(r, 'assessmentDate') || null,
          pickField(r, 'reviewCycle') || null,
          pickField(r, 'dataPeriod') || null,
          pickField(r, 'sourceFileId') || null,
          pickField(r, 'importJobId') || null,
          pickField(r, 'rowHash') || null
        ]);
        importedCount++;
      }

      await client.query('COMMIT');

      const totalRes = await pool.query(
        'SELECT COUNT(*)::int AS cnt FROM risk_sources WHERE is_deleted = false'
      );

      res.json(success({ imported: importedCount, total: totalRes.rows[0].cnt }, '导入成功'));
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// ============================================================
// 附件管理端点（复用 files.js 的 upload middleware）
// ============================================================

// ========== GET /:id/attachments — 附件列表 ==========
router.get('/:id/attachments', async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isConnected()) {
      initMemoryData();
      const data = memoryAttachments.filter(a => a.risk_id === parseInt(id) && !a.is_deleted);
      return res.json(success(data.map(camelKeys), '查询成功(内存模式)'));
    }

    await ensureTables();

    const result = await pool.query(
      'SELECT * FROM risk_attachments WHERE risk_id = $1 AND is_deleted = FALSE ORDER BY is_latest DESC, created_at DESC',
      [id]
    );
    res.json(success(result.rows.map(camelKeys), '查询成功'));
  } catch (err) {
    next(err);
  }
});

// ========== POST /:id/attachments — 上传附件 ==========
router.post('/:id/attachments', uploadDocument.single('file'), async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!req.file) return sendValidationError(res, '请上传文件');

    const { version = '1.0', uploaded_by = 'admin' } = req.body;
    const fileUrl = getFileUrl(req, req.file.filename, 'documents');
    const originalName = fixFilenameEncoding(req.file.originalname);

    if (!isConnected()) {
      initMemoryData();
      // 旧版本标记为非最新
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
      return res.json(success(camelKeys(record), '上传成功(内存模式)'));
    }

    await ensureTables();

    // 数据库模式：旧版本标记为非最新
    await pool.query(
      'UPDATE risk_attachments SET is_latest = FALSE WHERE risk_id = $1 AND is_latest = TRUE',
      [id]
    );

    const result = await pool.query(`
      INSERT INTO risk_attachments (risk_id, filename, original_name, file_type, file_size, file_url, version, uploaded_by, is_latest)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
      RETURNING *
    `, [id, req.file.filename, originalName, 'document', req.file.size, fileUrl, version, uploaded_by]);

    res.json(success(camelKeys(result.rows[0]), '上传成功'));
  } catch (err) {
    next(err);
  }
});

// ========== DELETE /:id/attachments/:aid — 删除附件 ==========
router.delete('/:id/attachments/:aid', async (req, res, next) => {
  try {
    const { id, aid } = req.params;

    if (!isConnected()) {
      initMemoryData();
      const att = memoryAttachments.find(a => a.id === parseInt(aid) && a.risk_id === parseInt(id) && !a.is_deleted);
      if (!att) return sendNotFound(res, '附件不存在');
      att.is_deleted = true;
      return res.json(success(null, '删除成功(内存模式)'));
    }

    await ensureTables();

    const result = await pool.query(
      'UPDATE risk_attachments SET is_deleted = TRUE WHERE id = $1 AND risk_id = $2 RETURNING id',
      [aid, id]
    );
    if (result.rows.length === 0) return sendNotFound(res, '附件不存在');
    res.json(success(null, '删除成功'));
  } catch (err) {
    next(err);
  }
});

// ============================================================
// 版本管理端点
// ============================================================

// ========== GET /:id/versions — 历史版本履历 ==========
router.get('/:id/versions', async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isConnected()) {
      initMemoryData();
      const data = memoryVersions.filter(v => v.risk_id === parseInt(id));
      return res.json(success(data.map(camelKeys), '查询成功(内存模式)'));
    }

    await ensureTables();

    const result = await pool.query(
      'SELECT * FROM risk_versions WHERE risk_id = $1 ORDER BY created_at DESC',
      [id]
    );
    res.json(success(result.rows.map(camelKeys), '查询成功'));
  } catch (err) {
    next(err);
  }
});

// ============================================================
// 风险评估工作台（提示词-206 §3）
// ============================================================

// ========== PUT /:id/assess — LEC / LS 风险评估 ==========
// 入参: { method: 'LEC'|'LS', l, e, c | l, s, reviewCycle?, assessmentDate?, changedBy?, remark? }
// 行为:
//   1. 后端按 ASSESSMENT_SCALES 重算 score 与 level（不信任前端传入的 score/level）
//   2. 事务内写 risk_sources.assessment_method / assessment_score / level
//      / assessment_date / review_cycle
//   3. 记录版本履历 risk_versions（change_type = 'assess'）
//   4. level 变化时推送通知中心；复评时效状态变化时复用临期通知
router.put('/:id/assess', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const method = String(body.method || 'LEC').toUpperCase();
    const changedBy = body.changedBy || req.user?.username || 'admin';

    // 1) 校验 + 后端权威计算
    const calc = calcAssessmentScore(method, body);
    if (!calc.ok) {
      return res.json(error(-1, calc.msg));
    }
    const judged = judgeAssessmentLevel(method, calc.score);
    if (!judged) {
      return res.json(error(-1, `无法判定风险等级（method=${method}, score=${calc.score}）`));
    }

    const scale = ASSESSMENT_SCALES[method];
    const factorText = scale.factors
      .map((f) => `${f.symbol}=${calc.factors[f.code]}`)
      .join(' × ');

    const assessmentDate =
      typeof body.assessmentDate === 'string' && body.assessmentDate
        ? body.assessmentDate.slice(0, 10)
        : new Date().toISOString().slice(0, 10);
    const reviewCycle = normalizeReviewCycle(
      body.reviewCycle === undefined ? body.review_cycle : body.reviewCycle,
    );

    // ---------- 内存降级模式 ----------
    if (!isConnected()) {
      initMemoryData();
      const idx = memoryRecords.findIndex((r) => String(r.id) === String(id) && !r.is_deleted);
      if (idx === -1) {
        return res.json(error(-2, '记录不存在'));
      }
      const record = memoryRecords[idx];
      const beforeSnapshot = { ...record };

      record.assessment_method = method;
      record.assessment_score = calc.score;
      record.level = judged.level;
      record.assessment_date = assessmentDate;
      if (reviewCycle !== null) record.review_cycle = reviewCycle;
      record.updated_at = new Date().toISOString();

      const summary =
        `${method} 评估：${factorText} = ${calc.score} → ${judged.level}` +
        (beforeSnapshot.level && beforeSnapshot.level !== judged.level
          ? `（原 ${beforeSnapshot.level}）`
          : '');
      await recordVersion(record.id, body.version || '1.0', 'assess', summary, changedBy, {
        before: beforeSnapshot,
        after: record,
        method,
        factors: calc.factors,
        score: calc.score,
        level: judged.level,
      });

      if (beforeSnapshot.level !== judged.level) {
        await notifyRiskLevelChange(record, beforeSnapshot.level, judged.level, method, calc.score);
      }

      return res.json(
        success(
          { ...formatRow(record), assessment: { method, factors: calc.factors, score: calc.score, ...judged } },
          '评估保存成功(内存模式)',
        ),
      );
    }

    // ---------- 数据库模式 ----------
    await ensureTables();

    const existResult = await pool.query(
      'SELECT * FROM risk_sources WHERE id = $1 AND is_deleted = false',
      [id],
    );
    if (existResult.rows.length === 0) {
      return res.json(error(-2, '记录不存在'));
    }
    const beforeSnapshot = existResult.rows[0];

    const client = await pool.connect();
    let updated = null;
    try {
      await client.query('BEGIN');

      const updateResult = await client.query(
        `UPDATE risk_sources
         SET assessment_method = $1,
             assessment_score  = $2,
             level             = $3,
             assessment_date   = $4,
             review_cycle      = COALESCE($5, review_cycle),
             updated_at        = CURRENT_TIMESTAMP
         WHERE id = $6 AND is_deleted = false
         RETURNING *`,
        [method, calc.score, judged.level, assessmentDate, reviewCycle, id],
      );
      updated = updateResult.rows[0];

      const summary =
        `${method} 评估：${factorText} = ${calc.score} → ${judged.level}` +
        (beforeSnapshot.level && beforeSnapshot.level !== judged.level
          ? `（原 ${beforeSnapshot.level}）`
          : '');
      await recordVersion(
        updated.id,
        body.version || '1.0',
        'assess',
        body.remark ? `${summary}；备注：${body.remark}` : summary,
        changedBy,
        {
          before: beforeSnapshot,
          after: updated,
          method,
          factors: calc.factors,
          score: calc.score,
          level: judged.level,
        },
        client,
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // 通知：等级变化（主）+ 复评时效状态变化（复用既有临期推送）
    try {
      if (beforeSnapshot.level !== updated.level) {
        await notifyRiskLevelChange(updated, beforeSnapshot.level, updated.level, method, calc.score);
      }
      const newExpiry = calcExpiryStatus(updated.assessment_date, updated.review_cycle);
      const oldExpiry = calcExpiryStatus(beforeSnapshot.assessment_date, beforeSnapshot.review_cycle);
      if (newExpiry !== oldExpiry && (newExpiry === 'expiring' || newExpiry === 'expired')) {
        await notifyRiskExpiry(formatRow(updated), newExpiry);
      }
    } catch (_e) {
      // 通知失败不影响主流程
    }

    res.json(
      success(
        {
          ...formatRow(updated),
          assessment: { method, factors: calc.factors, score: calc.score, ...judged },
        },
        '评估保存成功',
      ),
    );
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// ============================================================
// 风险 ↔ 隐患 联动端点（Phase 14）
// ============================================================

// ========== GET /:id/related-hazards — 风险点关联的隐患列表 ==========
router.get('/:id/related-hazards', async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isConnected()) {
      initMemoryData();
      const relatedIds = memoryRiskHazardLinks
        .filter((l) => String(l.risk_id) === String(id))
        .map((l) => l.hazard_id);
      // 内存降级模式下无 hazards 数据，仅返回关联 id 列表
      return res.json(success({ hazardIds: relatedIds, total: relatedIds.length }, '查询成功(内存模式)'));
    }

    await ensureTables();

    // 通过 risk_hazard_links 关联表查询 hazards 详情
    const result = await pool.query(`
      SELECT h.*, rhl.link_type, rhl.created_at AS linked_at
      FROM risk_hazard_links rhl
      JOIN hazards h ON h.id = rhl.hazard_id
      WHERE rhl.risk_id = $1 AND h.is_deleted = FALSE
      ORDER BY rhl.created_at DESC
    `, [id]);

    // 复用 hazards 模块的格式化逻辑（轻量内联：避免循环依赖）
    const formatHazardRow = (row) => {
      if (!row) return null;
      const checkDate = row.hazard_date ? new Date(row.hazard_date) : null;
      const fixDate = row.fix_date ? new Date(row.fix_date) : null;
      const fmt = (d) => d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null;
      const isResolved = row.status === '已完成' || row.status === 'completed' ? '是' : '否';
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
    };

    res.json(success({
      list: result.rows.map(formatHazardRow),
      total: result.rows.length,
    }, '查询成功'));
  } catch (err) {
    next(err);
  }
});

// ========== POST /:id/generate-hazard — 从风险点生成隐患记录（正向联动核心）==========
// 预填字段：description（风险名称+措施）、measure（管控措施）、checkDate（今天）、risk_level、related_risk_id
// 同时调用 linkRiskHazard 创建关联记录，并更新 risk_sources.hazard_count
router.post('/:id/generate-hazard', async (req, res, next) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const createdBy = body.changedBy || body.createdBy || req.user?.username || 'system';
    const linkType = body.linkType || 'manual';

    // 1. 查询风险点
    let riskRow = null;
    if (isConnected()) {
      await ensureTables();
      const riskResult = await pool.query(
        'SELECT * FROM risk_sources WHERE id = $1 AND is_deleted = false',
        [id]
      );
      if (riskResult.rows.length === 0) {
        return res.json(error(-2, '风险点不存在'));
      }
      riskRow = riskResult.rows[0];
    } else {
      initMemoryData();
      riskRow = memoryRecords.find((r) => String(r.id) === String(id) && !r.is_deleted);
      if (!riskRow) return res.json(error(-2, '风险点不存在(内存模式)'));
    }

    // 2. 构造隐患字段（预填）
    const today = new Date().toISOString().slice(0, 10);
    const description = body.description || `风险点「${riskRow.name}」衍生隐患排查`;
    const measure = body.measure || riskRow.measures || '';
    const checker = body.checker || createdBy;
    const fixer = body.fixer || '';
    const status = '未完成';
    const riskLevel = riskRow.level || '四级';

    let newHazard = null;

    if (isConnected()) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // 2a. 创建隐患记录（含 related_risk_id 和 risk_level）
        const insertHazardSql = `
          INSERT INTO hazards (no, hazard_date, description, measure, checker, fixer, fix_date, status, remark, related_risk_id, risk_level)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING *
        `;
        const hazardResult = await client.query(insertHazardSql, [
          body.no || null,
          today,
          description,
          measure,
          checker,
          fixer,
          body.fixDate || null,
          status,
          body.remark || `由风险点「${riskRow.name}」生成`,
          parseInt(id),
          riskLevel,
        ]);
        newHazard = hazardResult.rows[0];

        // 2b. 创建风险-隐患关联记录（幂等）
        await linkRiskHazard(parseInt(id), newHazard.id, linkType, createdBy, client);

        // 2c. 更新风险点的 hazard_count
        await client.query(
          'UPDATE risk_sources SET hazard_count = hazard_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
          [id]
        );

        // 2d. 记录风险版本履历
        await recordVersion(parseInt(id), body.version || '1.0', 'link', `生成关联隐患 #${newHazard.id}`, createdBy, { riskId: id, hazardId: newHazard.id }, client);

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } else {
      // 内存降级模式：直接构造隐患记录并写入关联
      // 注意：内存模式 hazards 数据由 hazards.js 维护，这里仅在 risk_hazard_links 中记录关联
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

    res.json(success(camelKeys(newHazard), '隐患记录已生成'));
  } catch (err) {
    next(err);
  }
});

// ========== 规则API：风险等级、评价方法、管控措施分类、风险类别 ==========
router.get('/rules/levels', async (req, res) => {
  try {
    const levels = hseRules.getRiskLevels();
    res.json(success(levels, '获取风险等级规则成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

router.get('/rules/assessment-methods', async (req, res) => {
  try {
    const methods = hseRules.getAssessmentMethods();
    res.json(success(methods, '获取评价方法成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

router.get('/rules/control-measures', async (req, res) => {
  try {
    const types = hseRules.getControlMeasureTypes();
    res.json(success(types, '获取管控措施分类成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

router.get('/rules/categories', async (req, res) => {
  try {
    const cats = hseRules.getRiskCategories();
    res.json(success(cats, '获取风险类别成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

router.get('/rules/responsibility-matrix', async (req, res) => {
  try {
    const matrix = hseRules.getResponsibilityMatrix();
    res.json(success(matrix, '获取责任矩阵成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// ========== GET /rules/assessment-scales — 评估量表（LEC / LS 因子 + 阈值 + 复评周期）==========
// 前端评估工作台的下拉选项、中文标签与等级阈值全部由本端点下发，
// 前端不得自行硬编码，保证规则单点维护。
router.get('/rules/assessment-scales', async (req, res) => {
  try {
    res.json(
      success(
        {
          scales: ASSESSMENT_SCALES,
          reviewCycleOptions: REVIEW_CYCLE_OPTIONS,
        },
        '获取风险评估量表成功',
      ),
    );
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

router.get('/rules/all', async (req, res) => {
  try {
    const all = {
      riskLevels: hseRules.getRiskLevels(),
      assessmentMethods: hseRules.getAssessmentMethods(),
      controlMeasureTypes: hseRules.getControlMeasureTypes(),
      riskCategories: hseRules.getRiskCategories(),
      responsibilityMatrix: hseRules.getResponsibilityMatrix(),
      assessmentScales: ASSESSMENT_SCALES,
      reviewCycleOptions: REVIEW_CYCLE_OPTIONS,
    };
    res.json(success(all, '获取风险管控全部规则成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

module.exports = router;
