/**
 * 保险管理路由 - PostgreSQL + 内存降级双模式
 * 三个子路由:
 *   /vehicle   → vehicles 表
 *   /personnel → personnel_insurance 表
 *   /overage   → over_age_personnel 表
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
// 结构化日志（winston：error 级同时写 error/combined 文件，避免孤儿进程 stdout 断开时错误无处可查）
const logger = require('../utils/logger');
const { pool, isConnected } = require('../config/db');
const { success, error } = require('../middleware/response');
const { paginateMemory, buildListResponse, sendNotFound, buildMemoryRecord, camelKeys } = require('../utils/commonResponse');
const { validateBody } = require('../middleware/validate');
const { uploadDocument, uploadInsurance, getFileUrl, fixFilenameEncoding, validateUploadedFile } = require('../middleware/upload');
const {
  createVehicleSchema, updateVehicleSchema,
  createPersonnelSchema, updatePersonnelSchema,
  createOverageSchema, updateOverageSchema,
  batchDeleteSchema, personnelImportSchema, personnelImportRowSchema,
  batchRenewalSchema
} = require('../schemas/insurance');
// 任务4（提示词08）：险种字典规范化（唯一生产字典）
const { normalizeInsuranceType, isSupportedInsuranceType } = require('../services/insuranceTypeDict');
// 任务3（提示词08）：Asia/Shanghai 业务日（可注入；DB/Node 同一日期语义）
const { getBusinessDayStr, BUSINESS_TIMEZONE } = require('../services/businessDay');
// 任务9：当前有效保单冲突服务（全部写入口复用，禁止复制查重 SQL）
const { findActivePolicyConflict, findActivePolicyConflictInMemory, isPolicyActiveOnBusinessDay } = require('../services/personnelInsurancePolicyService');

// F1（提示词-131）：over_age_personnel.id_card 为 varchar(32)，而密文长度 68，物理上无法存储；
// 且存量 1300 行全部为明文（历史由导入脚本绕过中间件写入）。在"禁止修改表结构"红线下，
// 统一策略为：写入不加密（两条路由一致），读取仍挂 decryptMiddleware（对明文为 no-op，
// 兼容未来扩列后的密文混合态）。PII 防护由前端展示脱敏 + 导出脱敏承担。
const { decryptMiddleware, decryptResult } = require('../middleware/encryption');

// F6（提示词-132）：超龄相关端点补齐路由层鉴权，与前端路由 authority:['admin'] 对齐。
// 此前仅依赖全局 authMiddleware（只校验登录），任何已登录用户均可调用超龄 API。
const { requireRole } = require('../middleware/auth');

// R2（提示词-132）：导出 CSV 中身份证号脱敏（保留前4后4），与子系统A auto-export 口径一致。
// 对明文/密文均安全：decryptMiddleware 对明文为 no-op，此处始终拿到明文再脱敏。
function maskIdCard(v) {
  const s = String(v || '');
  if (!s) return '';
  if (s.length < 8) return '****';
  return `${s.slice(0, 4)}**********${s.slice(-4)}`;
}

// ========== 时效状态计算（保险到期/人员超龄） ==========
// 规则：基于 expire_date 计算
// - 过期：当前日期 > 到期日期
// - 临期：距到期日期 ≤ 30 天
// - 正常：距到期日期 > 30 天
// - 未知：无到期日期
// 任务13（车辆收敛）：使用 Asia/Shanghai 业务日，与人员保险 isPolicyActiveOnBusinessDay 口径一致
function calcExpiryStatus(expireDate, businessDay) {
  if (!expireDate) return 'unknown';
  const ed = new Date(expireDate);
  if (isNaN(ed.getTime())) return 'unknown';
  const todayStr = businessDay || getBusinessDayStr();
  const today = new Date(todayStr + 'T00:00:00+08:00');
  const edMidnight = new Date(ed.getFullYear() + '-' + String(ed.getMonth()+1).padStart(2,'0') + '-' + String(ed.getDate()).padStart(2,'0') + 'T00:00:00+08:00');
  const diffDays = Math.ceil((edMidnight - today) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'expired';
  if (diffDays <= 30) return 'expiring';
  return 'normal';
}

// ========== 附件/版本表初始化 ==========
let tablesInitialized = false;
async function ensureAttachmentTables() {
  if (tablesInitialized) return;
  if (!isConnected()) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS insurance_attachments (
        id            BIGSERIAL PRIMARY KEY,
        biz_type      VARCHAR(32) NOT NULL,
        biz_id        BIGINT NOT NULL,
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
    await pool.query('CREATE INDEX IF NOT EXISTS idx_insurance_attachments_biz ON insurance_attachments(biz_type, biz_id)');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS insurance_versions (
        id             BIGSERIAL PRIMARY KEY,
        biz_type       VARCHAR(32) NOT NULL,
        biz_id         BIGINT NOT NULL,
        version        VARCHAR(32) NOT NULL,
        change_type    VARCHAR(32) NOT NULL DEFAULT 'update',
        change_summary TEXT,
        changed_by     VARCHAR(64),
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_insurance_versions_biz ON insurance_versions(biz_type, biz_id)');

    const vehicleColumns = [
      { name: 'policy_holder', type: 'VARCHAR(200)', default: "''" },
      { name: 'registered_owner', type: 'VARCHAR(200)', default: "''" },
      { name: 'compulsory_start', type: 'DATE', default: 'NULL' },
      { name: 'compulsory_end', type: 'DATE', default: 'NULL' },
      { name: 'commercial_start', type: 'DATE', default: 'NULL' },
      { name: 'commercial_end', type: 'DATE', default: 'NULL' },
      { name: 'vehicle_damage_amount', type: 'DECIMAL(12,2)', default: '0' },
      { name: 'vehicle_damage_premium', type: 'DECIMAL(12,2)', default: '0' },
      { name: 'third_party_amount', type: 'VARCHAR(50)', default: "''" },
      { name: 'third_party_premium', type: 'DECIMAL(12,2)', default: '0' },
      { name: 'passenger_amount', type: 'VARCHAR(50)', default: "''" },
      { name: 'passenger_premium', type: 'DECIMAL(12,2)', default: '0' },
      { name: 'commercial_total', type: 'DECIMAL(12,2)', default: '0' },
      { name: 'compulsory_premium', type: 'DECIMAL(12,2)', default: '0' },
      { name: 'vehicle_tax', type: 'DECIMAL(12,2)', default: '0' },
      { name: 'total_premium', type: 'DECIMAL(12,2)', default: '0' },
    ];

    for (const col of vehicleColumns) {
      try {
        await pool.query(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS ${col.name} ${col.type} DEFAULT ${col.default}`);
      } catch (e) {
        logger.info(`[Insurance] vehicles.${col.name} skip:`, { message: e.message.substring(0, 60), stack: e.stack });
      }
    }

    tablesInitialized = true;
    logger.info('[Insurance] 附件/版本表已就绪，车辆保险字段已扩展');
  } catch (err) {
    logger.warn('[Insurance] 附件/版本表初始化失败:', { message: err.message, stack: err.stack });
  }
}

// ========== 内存降级存储 ==========
const memoryStores = {
  vehicle: [],
  personnel: [],
  overage: [],
  other: [],
  budget: [],
  pendingInsurance: [],
  policies: []
};
const memoryCounters = { vehicle: 1, personnel: 1, overage: 1, other: 1, budget: 1, pendingInsurance: 1, policies: 1 };
// 附件/版本内存存储
const memoryAttachments = [];
let memoryAttachmentIdCounter = 1;
const memoryVersions = [];
let memoryVersionIdCounter = 1;

function initMemoryData() {
  // 种子数据已移除，内存模式仅用于 API 兼容性（空数据）
}

// ================================================================
//  /vehicle — 车辆保险
// ================================================================

// vehicles 表的 7 个日期列均为 PG `date` 类型，node-pg 会反序列化为 JS Date 对象。
// 直接 String(dateObj).slice(0,10) 会得到 "Fri Feb 26" 这类无效字符串，
// 既导致前端 formatDate 显示异常，也让 calcExpiryStatus 误判为「过期」。
// 统一走 toDateStr 按本地时区输出 YYYY-MM-DD，兼容 Date / 字符串两种来源。
function toDateStr(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(v).slice(0, 10);
}

// 厂牌车型清洗：去掉关键字（吸污车 / 车厢可卸式垃圾车 / 自装卸式垃圾车 / 载货汽车）前方的
// 文字、字母及数字，仅保留关键字及其之后内容；无匹配关键字时原样返回。
function cleanModel(raw) {
  if (!raw || typeof raw !== 'string') return raw;
  const keywords = ['吸污车', '车厢可卸式垃圾车', '自装卸式垃圾车', '载货汽车'];
  let cut = -1;
  for (const kw of keywords) {
    const i = raw.indexOf(kw);
    if (i >= 0 && (cut === -1 || i < cut)) cut = i;
  }
  return cut >= 0 ? raw.slice(cut) : raw;
}

// 商业险合计兜底：源表无「商业险合计」列时，按商业险子项（三者/车损/司乘保费）汇总；已有有效值则用原值
function calcCommercialTotal(row) {
  const stored = parseFloat(row.commercial_total);
  if (stored > 0) return stored;
  return (parseFloat(row.third_party_premium) || 0)
       + (parseFloat(row.vehicle_damage_premium) || 0)
       + (parseFloat(row.passenger_premium) || 0);
}

// 保费合计兜底：库中 total_premium 常仅含交强险+车船税（漏加商业险）；按 交强险+商业险合计+车船税 重算
function calcTotalPremium(row) {
  const stored = parseFloat(row.total_premium);
  const expected = (parseFloat(row.compulsory_premium) || 0)
                + calcCommercialTotal(row)
                + (parseFloat(row.vehicle_tax) || 0);
  if (stored && Math.abs(stored - expected) <= 0.01) return stored;
  return expected;
}

function formatVehicle(row, businessDay) {
  const insuranceEnd = toDateStr(row.insurance_end);
  const commercialEnd = toDateStr(row.commercial_end);
  const compulsoryEnd = toDateStr(row.compulsory_end);
  // 取「最早到期」的非空险种日期（交强险先于商业险到期时按交强险判定），与统计/列表口径一致
  const endCandidates = [commercialEnd, compulsoryEnd, insuranceEnd].filter(Boolean);
  const effEnd = endCandidates.length ? endCandidates.sort()[0] : null;
  return {
    id: row.id,
    plate: row.plate || '',
    vin: row.vin || '',
    engine_no: row.engine_no || '',
    reg_date: toDateStr(row.reg_date),
    model: cleanModel(row.model || ''),
    owner: row.owner || '',
    insurance_type: row.insurance_type || '',
    insurance_start: toDateStr(row.insurance_start),
    insurance_end: insuranceEnd,
    premium: parseFloat(row.premium) || 0,
    vehicle_type: row.vehicle_type || '',
    status: row.status || '在用',
    expiryStatus: calcExpiryStatus(effEnd, businessDay),
    remark: row.remark || '',
    policy_holder: row.policy_holder || '',
    registered_owner: row.registered_owner || '',
    compulsory_start: toDateStr(row.compulsory_start),
    compulsory_end: compulsoryEnd,
    commercial_start: toDateStr(row.commercial_start),
    commercial_end: commercialEnd,
    vehicle_damage_amount: row.vehicle_damage_amount ? parseFloat(row.vehicle_damage_amount) : 0,
    vehicle_damage_premium: parseFloat(row.vehicle_damage_premium) || 0,
    third_party_amount: row.third_party_amount || '',
    third_party_premium: parseFloat(row.third_party_premium) || 0,
    passenger_amount: row.passenger_amount || '',
    passenger_premium: parseFloat(row.passenger_premium) || 0,
    commercial_total: calcCommercialTotal(row),
    compulsory_premium: parseFloat(row.compulsory_premium) || 0,
    vehicle_tax: parseFloat(row.vehicle_tax) || 0,
    total_premium: calcTotalPremium(row),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

router.get('/vehicle', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    const businessDay = getBusinessDayStr();

    if (!isConnected()) {
      initMemoryData();
      let data = memoryStores.vehicle.filter(r => !r.is_deleted);
      const { page = 1, pageSize = 20, keyword, insuranceStatus, model } = req.query;
      if (keyword) {
        const kw = keyword.toLowerCase();
        data = data.filter(r => (r.plate && r.plate.toLowerCase().includes(kw)) || (r.owner && r.owner.toLowerCase().includes(kw)));
      }
      if (model) {
        data = data.filter(r => cleanModel(r.model) === model);
      }
      if (insuranceStatus) {
        const today = new Date(businessDay + 'T00:00:00+08:00');
        const plus30 = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
        data = data.filter(r => {
          const endStr = r.commercial_end || r.compulsory_end || r.insurance_end;
          const end = endStr ? new Date(endStr) : null;
          if (!end) return false;
          const endMidnight = new Date(end.getFullYear() + '-' + String(end.getMonth()+1).padStart(2,'0') + '-' + String(end.getDate()).padStart(2,'0') + 'T00:00:00+08:00');
          if (insuranceStatus === 'active') return endMidnight >= today;
          if (insuranceStatus === 'expired') return endMidnight < today;
          if (insuranceStatus === 'expiring') return endMidnight >= today && endMidnight <= plus30;
          if (insuranceStatus === 'normal') return endMidnight > plus30;
          return true;
        });
      }
      const { list, total } = paginateMemory(data, page, pageSize);
      return buildListResponse(res, list.map(r => formatVehicle(r, businessDay)), total, page, pageSize, '查询成功(内存模式)');
    }

    let whereSql = ' WHERE is_deleted = false';
    const params = [];
    let paramIdx = 0;
    const { page = 1, pageSize = 20, keyword, insuranceStatus, model } = req.query;
    if (keyword) {
      paramIdx++;
      whereSql += ` AND (plate ILIKE $${paramIdx} OR owner ILIKE $${paramIdx} OR model ILIKE $${paramIdx})`;
      params.push(`%${keyword}%`);
    }
    if (model) {
      paramIdx++;
      whereSql += ` AND model LIKE '%' || $${paramIdx}`;
      params.push(model);
    }
    // 任务13（车辆收敛）：使用参数化业务日替代裸 CURRENT_DATE，与人员保险口径一致
    // effEnd 取「最早到期」的非空险种日期（LEAST + 非空兜底为远未来），确保交强险先于商业险到期时按交强险判定
    const effEnd = "LEAST(COALESCE(commercial_end,'9999-12-31'), COALESCE(compulsory_end,'9999-12-31'), COALESCE(insurance_end,'9999-12-31'))";
    // 仅在传了 insuranceStatus 时才注入业务日参数，避免 params 与 SQL 占位符数量不匹配
    let bizDateParam = null;
    if (insuranceStatus) {
      paramIdx++;
      bizDateParam = paramIdx;
      params.push(businessDay);
      if (insuranceStatus === 'active') {
        whereSql += ` AND ${effEnd} >= $${bizDateParam}::date`;
      } else if (insuranceStatus === 'expired') {
        whereSql += ` AND ${effEnd} < $${bizDateParam}::date`;
      } else if (insuranceStatus === 'expiring') {
        whereSql += ` AND ${effEnd} >= $${bizDateParam}::date AND ${effEnd} <= $${bizDateParam}::date + INTERVAL '30 days'`;
      } else if (insuranceStatus === 'normal') {
        whereSql += ` AND ${effEnd} >= $${bizDateParam}::date + INTERVAL '30 days'`;
      }
    }

    const countR = await pool.query(`SELECT COUNT(*)::int AS total FROM vehicles${whereSql}`, params);
    const total = countR.rows[0].total;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    paramIdx++;
    const lp = paramIdx; params.push(parseInt(pageSize));
    paramIdx++;
    const op = paramIdx; params.push(offset);

    const result = await pool.query(`SELECT * FROM vehicles${whereSql} ORDER BY id ASC LIMIT $${lp} OFFSET $${op}`, params);
    res.json(success({ list: result.rows.map(r => formatVehicle(r, businessDay)), total, page: parseInt(page), pageSize: parseInt(pageSize) }, '查询成功'));
  } catch (err) {
    // 任务13：安全错误处理，不向前端泄漏 SQL/内部错误文本
    logger.error('[Vehicle] GET /vehicle 失败:', { message: err.message, stack: err.stack });
    res.json(error(-1, '查询失败，请稍后重试'));
  }
});

// GET /vehicle/stats — 车辆保险统计（必须在 /:id 之前注册）
router.get('/vehicle/stats', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    const businessDay = getBusinessDayStr();
    const stats = { total: 0, active: 0, expired: 0, expiring: 0, totalPremium: 0 };
    let vehicle_types = [];
    let insurance_companies = [];

    if (isConnected()) {
      const r1 = await pool.query("SELECT COUNT(*)::int AS v FROM vehicles WHERE is_deleted = false");
      stats.total = r1.rows[0].v;
      // 任务13（车辆收敛）：使用参数化业务日替代裸 CURRENT_DATE
      // effEnd 取「最早到期」的非空险种日期（LEAST + 非空兜底为远未来），确保交强险先于商业险到期时按交强险判定
      const effEnd = "LEAST(COALESCE(commercial_end,'9999-12-31'), COALESCE(compulsory_end,'9999-12-31'), COALESCE(insurance_end,'9999-12-31'))";
      const r2 = await pool.query(`SELECT COUNT(*)::int AS v FROM vehicles WHERE is_deleted = false AND ${effEnd} >= $1::date`, [businessDay]);
      stats.active = r2.rows[0].v;
      const r3 = await pool.query(`SELECT COUNT(*)::int AS v FROM vehicles WHERE is_deleted = false AND ${effEnd} < $1::date`, [businessDay]);
      stats.expired = r3.rows[0].v;
      const r4 = await pool.query(`SELECT COUNT(*)::int AS v FROM vehicles WHERE is_deleted = false AND ${effEnd} >= $1::date AND ${effEnd} <= $1::date + INTERVAL '30 days'`, [businessDay]);
      stats.expiring = r4.rows[0].v;
      const r5 = await pool.query("SELECT COALESCE(SUM(premium), 0)::float AS v FROM vehicles WHERE is_deleted = false");
      stats.totalPremium = r5.rows[0].v;
      const r6 = await pool.query("SELECT DISTINCT model FROM vehicles WHERE is_deleted = false AND model IS NOT NULL AND model != '' ORDER BY model");
      vehicle_types = [...new Set(r6.rows.map(r => cleanModel(r.model)).filter(Boolean))];
      const r7 = await pool.query("SELECT DISTINCT insurance_type FROM vehicles WHERE is_deleted = false AND insurance_type IS NOT NULL AND insurance_type != '' ORDER BY insurance_type");
      insurance_companies = r7.rows.map(r => r.insurance_type);
    } else {
      const today = new Date(businessDay + 'T00:00:00+08:00');
      const plus30 = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
      const effEnd = (r) => {
        const dates = [r.commercial_end, r.compulsory_end, r.insurance_end].filter(Boolean).map(d => new Date(d).getTime());
        return dates.length ? new Date(Math.min(...dates)).toISOString().slice(0, 10) : null;
      };
      const toMidnight = (d) => { const dt = new Date(d); return new Date(dt.getFullYear() + '-' + String(dt.getMonth()+1).padStart(2,'0') + '-' + String(dt.getDate()).padStart(2,'0') + 'T00:00:00+08:00'); };
      const active = memoryStores.vehicle.filter(r => { const e = effEnd(r); return !r.is_deleted && e && toMidnight(e) >= today; });
      const expired = memoryStores.vehicle.filter(r => { const e = effEnd(r); return !r.is_deleted && e && toMidnight(e) < today; });
      const expiring = memoryStores.vehicle.filter(r => { const e = effEnd(r); return !r.is_deleted && e && (() => { const d = toMidnight(e); return d >= today && d <= plus30; })(); });
      stats.total = memoryStores.vehicle.filter(r => !r.is_deleted).length;
      stats.active = active.length;
      stats.expired = expired.length;
      stats.expiring = expiring.length;
      stats.totalPremium = memoryStores.vehicle.filter(r => !r.is_deleted).reduce((s, r) => s + (parseFloat(r.premium) || 0), 0);
      vehicle_types = [...new Set(memoryStores.vehicle.filter(r => !r.is_deleted).map(r => cleanModel(r.model)).filter(Boolean))];
      insurance_companies = [...new Set(memoryStores.vehicle.filter(r => !r.is_deleted).map(r => r.insurance_type).filter(Boolean))];
    }

    res.json(success({ stats, vehicle_types, insurance_companies }, '查询成功'));
  } catch (err) {
    logger.error('[Vehicle] GET /vehicle/stats 失败:', { message: err.message, stack: err.stack });
    res.json(error(-1, '查询统计失败，请稍后重试'));
  }
});

// POST /vehicle/import — 批量导入车辆保险数据
// 任务13（车辆收敛）：补齐角色校验、事务、查重、安全错误、outcome 语义
router.post('/vehicle/import', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    const { records } = req.body;
    if (!Array.isArray(records) || records.length === 0) {
      return res.json(error(-1, '导入数据不能为空'));
    }

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    const errors = [];
    const businessDay = getBusinessDayStr();

    if (isConnected()) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        for (let i = 0; i < records.length; i++) {
          try {
            const r = records[i];
            const plate = (r.plate || '').trim().toUpperCase();
            if (!plate) {
              skipped++;
              errors.push(`第${i + 1}行: 车牌号为空`);
              continue;
            }

            // 查重：按plate查找现有车辆
            const existResult = await client.query(
              'SELECT id FROM vehicles WHERE plate = $1 AND is_deleted = false',
              [plate]
            );

            const values = [
              plate,
              (r.vin || '').trim() || null,
              (r.engine_no || '').trim() || null,
              r.reg_date || null,
              (r.model || '').trim() || null,
              (r.owner || '').trim() || null,
              (r.insurance_type || '').trim() || null,
              r.insurance_start || null,
              r.insurance_end || null,
              r.premium || 0,
              (r.vehicle_type || '').trim() || null,
              r.status || '在用',
              (r.remark || '').trim() || null,
              (r.policy_holder || r.policyHolder || '').trim() || null,
              (r.registered_owner || r.registeredOwner || '').trim() || null,
              r.compulsory_start || r.compulsoryStart || null,
              r.compulsory_end || r.compulsoryEnd || null,
              r.commercial_start || r.commercialStart || null,
              r.commercial_end || r.commercialEnd || null,
              r.vehicle_damage_amount || r.vehicleDamageAmount || 0,
              r.vehicle_damage_premium || r.vehicleDamagePremium || 0,
              r.third_party_amount || r.thirdPartyAmount || '',
              r.third_party_premium || r.thirdPartyPremium || 0,
              r.passenger_amount || r.passengerAmount || '',
              r.passenger_premium || r.passengerPremium || 0,
              r.commercial_total || r.commercialTotal || 0,
              r.compulsory_premium || r.compulsoryPremium || 0,
              r.vehicle_tax || r.vehicleTax || 0,
              r.total_premium || r.totalPremium || 0,
            ];

            if (existResult.rows.length > 0) {
              // 已有记录：更新（upsert）
              const vehicleId = existResult.rows[0].id;
              await client.query(`
                UPDATE vehicles SET
                  plate=$1, vin=$2, engine_no=$3, reg_date=$4, model=$5, owner=$6,
                  insurance_type=$7, insurance_start=$8, insurance_end=$9, premium=$10,
                  vehicle_type=$11, status=$12, remark=$13,
                  policy_holder=$14, registered_owner=$15,
                  compulsory_start=$16, compulsory_end=$17,
                  commercial_start=$18, commercial_end=$19,
                  vehicle_damage_amount=$20, vehicle_damage_premium=$21,
                  third_party_amount=$22, third_party_premium=$23,
                  passenger_amount=$24, passenger_premium=$25,
                  commercial_total=$26, compulsory_premium=$27, vehicle_tax=$28, total_premium=$29,
                  updated_at=CURRENT_TIMESTAMP
                WHERE id=$30
              `, [...values, vehicleId]);
              updated++;
            } else {
              // 新记录：插入
              await client.query(`
                INSERT INTO vehicles (
                  plate, vin, engine_no, reg_date, model, owner, insurance_type,
                  insurance_start, insurance_end, premium, vehicle_type, status, remark,
                  policy_holder, registered_owner,
                  compulsory_start, compulsory_end,
                  commercial_start, commercial_end,
                  vehicle_damage_amount, vehicle_damage_premium,
                  third_party_amount, third_party_premium,
                  passenger_amount, passenger_premium,
                  commercial_total, compulsory_premium, vehicle_tax, total_premium
                ) VALUES (
                  $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
                  $14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29
                )
              `, values);
              imported++;
            }
          } catch (e) {
            skipped++;
            // 安全错误：不向客户端泄漏原始 SQL 错误文本
            logger.error(`[Vehicle] 导入第${i + 1}行失败:`, { message: e.message, stack: e.stack });
            errors.push(`第${i + 1}行: 数据校验或写入失败`);
          }
        }

        await client.query('COMMIT');
      } catch (txErr) {
        await client.query('ROLLBACK');
        logger.error('[Vehicle] 批量导入事务失败:', { message: txErr.message, stack: txErr.stack });
        return res.json(error(-2, '导入事务失败，请稍后重试'));
      } finally {
        client.release();
      }
    } else {
      // 内存降级模式：按plate查重
      for (let i = 0; i < records.length; i++) {
        try {
          const r = records[i];
          const plate = (r.plate || '').trim().toUpperCase();
          if (!plate) { skipped++; errors.push(`第${i + 1}行: 车牌号为空`); continue; }
          const existIdx = memoryStores.vehicle.findIndex(v => v.plate === plate && !v.is_deleted);
          if (existIdx >= 0) {
            Object.assign(memoryStores.vehicle[existIdx], r, { plate, updated_at: new Date().toISOString() });
            updated++;
          } else {
            memoryStores.vehicle.push({ id: memoryCounters.vehicle++, ...r, plate, is_deleted: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
            imported++;
          }
        } catch (e) {
          skipped++;
          errors.push(`第${i + 1}行: 数据处理失败`);
        }
      }
    }

    const wroteCount = imported + updated;
    const hasErrors = skipped > 0;
    const outcome = (!hasErrors && wroteCount > 0) ? 'imported' : (wroteCount > 0 ? 'partial' : 'failed');

    auditLog({
      userId: req.user?.id || null,
      username: req.user?.username || 'system',
      action: 'import',
      module: 'vehicle_insurance',
      description: `批量导入车辆: 新增${imported}/更新${updated}/跳过${skipped}`,
      ip: req.ip,
    }).catch(() => {});

    res.json(success({
      total: records.length,
      imported,
      updated,
      skipped,
      errors,
      outcome,
    }, '导入完成'));
  } catch (err) {
    logger.error('[Vehicle] POST /vehicle/import 失败:', { message: err.message, stack: err.stack });
    res.json(error(-1, '导入失败，请稍后重试'));
  }
});

// GET /vehicle/export — 导出车辆保险台账（CSV，UTF-8 BOM）
// R1（提示词-132）：此块原注册在 `/vehicle/:id` 之后，Express 会用 `:id` 捕获字面量 `export`，
// 导致本端点永久不可达（返回 {"code":-2,"message":"记录不存在"}）。已整体前移至 `:id` 之前。
// 约定：任何 `/xxx/export` 静态路径都必须注册在同前缀的 `/xxx/:id` 参数路由之前。
router.get('/vehicle/export', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    const businessDay = getBusinessDayStr();
    let data = [];
    if (isConnected()) {
      const r = await pool.query('SELECT * FROM vehicles WHERE is_deleted = false ORDER BY id ASC');
      data = r.rows.map(row => formatVehicle(row, businessDay));
    } else {
      data = memoryStores.vehicle.filter(r => !r.is_deleted).map(r => formatVehicle(r, businessDay));
    }
    const headers = ['ID', '车牌号', 'VIN码', '发动机号', '注册日期', '车型', '车主', '保险类型', '保险起期', '保险止期', '保费', '车辆类型', '状态', '时效状态', '备注'];
    const expiryMap = { normal: '正常', expiring: '临期', expired: '过期', unknown: '未知' };
    const rows = data.map(r => [
      r.id || '',
      (r.plate || '').replace(/"/g, '""'),
      (r.vin || '').replace(/"/g, '""'),
      (r.engine_no || '').replace(/"/g, '""'),
      r.reg_date || '',
      (r.model || '').replace(/"/g, '""'),
      (r.owner || '').replace(/"/g, '""'),
      (r.insurance_type || '').replace(/"/g, '""'),
      r.insurance_start || '',
      r.insurance_end || '',
      r.premium || 0,
      (r.vehicle_type || '').replace(/"/g, '""'),
      r.status || '',
      expiryMap[r.expiryStatus] || r.expiryStatus || '',
      (r.remark || '').replace(/"/g, '""'),
    ].map(v => `"${v}"`).join(','));
    const csv = '\uFEFF' + headers.map(h => `"${h}"`).join(',') + '\n' + rows.join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="vehicle_insurance_${new Date().toISOString().slice(0, 10)}.csv"`);
    return res.send(csv);
  } catch (err) {
    logger.error('[Vehicle] GET /vehicle/export 失败:', { message: err.message, stack: err.stack });
    res.json(error(-1, '导出失败，请稍后重试'));
  }
});

router.get('/vehicle/:id', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    const businessDay = getBusinessDayStr();
    if (!isConnected()) {
      const r = memoryStores.vehicle.find(r => r.id === parseInt(req.params.id) && !r.is_deleted);
      if (!r) return sendNotFound(res);
      return res.json(success(formatVehicle(r, businessDay), '查询成功'));
    }
    const result = await pool.query('SELECT * FROM vehicles WHERE id = $1 AND is_deleted = false', [req.params.id]);
    if (result.rows.length === 0) return res.json(error(-2, '记录不存在'));
    res.json(success(formatVehicle(result.rows[0], businessDay), '查询成功'));
  } catch (err) {
    logger.error('[Vehicle] GET /vehicle/:id 失败:', { message: err.message, stack: err.stack });
    res.json(error(-1, '查询失败，请稍后重试'));
  }
});

// 任务13（车辆收敛）：POST /vehicle 补齐角色校验、plate查重、安全错误
router.post('/vehicle', requireRole('admin', 'safety_manager'), validateBody(createVehicleSchema), async (req, res) => {
  try {
    const businessDay = getBusinessDayStr();
    const b = req.body;
    const plate = (b.plate || '').trim().toUpperCase();
    if (!plate) return res.json(error(-1, '车牌号不能为空'));

    if (!isConnected()) {
      // 内存模式查重
      if (memoryStores.vehicle.some(v => v.plate === plate && !v.is_deleted)) {
        return res.json(error(-2, '该车牌号已存在'));
      }
      const record = buildMemoryRecord(memoryCounters.vehicle++, { ...b, plate });
      memoryStores.vehicle.push(record);
      auditLog({ userId: req.user?.id, username: req.user?.username, action: 'create', module: 'vehicle_insurance', description: `新增车辆(内存): ${plate}`, ip: req.ip }).catch(() => {});
      return res.json(success(formatVehicle(record, businessDay), '创建成功(内存模式)'));
    }

    // DB模式：先查重
    const dupResult = await pool.query('SELECT id FROM vehicles WHERE plate = $1 AND is_deleted = false', [plate]);
    if (dupResult.rows.length > 0) {
      return res.json(error(-2, '该车牌号已存在'));
    }

    const result = await pool.query(`
      INSERT INTO vehicles (
        plate, vin, engine_no, reg_date, model, owner, insurance_type,
        insurance_start, insurance_end, premium, vehicle_type, status, remark,
        policy_holder, registered_owner,
        compulsory_start, compulsory_end,
        commercial_start, commercial_end,
        vehicle_damage_amount, vehicle_damage_premium,
        third_party_amount, third_party_premium,
        passenger_amount, passenger_premium,
        commercial_total, compulsory_premium, vehicle_tax, total_premium
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
        $14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29
      ) RETURNING *
    `, [
      plate, (b.vin || '').trim() || null, (b.engine_no || '').trim() || null, b.reg_date || null,
      (b.model || '').trim() || null, (b.owner || '').trim() || null, (b.insurance_type || '').trim() || null,
      b.insurance_start || null, b.insurance_end || null,
      b.premium || 0, (b.vehicle_type || '').trim() || null, b.status || '在用', (b.remark || '').trim() || null,
      (b.policy_holder || '').trim() || null, (b.registered_owner || '').trim() || null,
      b.compulsory_start || null, b.compulsory_end || null,
      b.commercial_start || null, b.commercial_end || null,
      b.vehicle_damage_amount || 0, b.vehicle_damage_premium || 0,
      b.third_party_amount || '', b.third_party_premium || 0,
      b.passenger_amount || '', b.passenger_premium || 0,
      b.commercial_total || 0, b.compulsory_premium || 0,
      b.vehicle_tax || 0, b.total_premium || 0
    ]);
    auditLog({ userId: req.user?.id, username: req.user?.username, action: 'create', module: 'vehicle_insurance', description: `新增车辆: ${plate}`, ip: req.ip }).catch(() => {});
    res.json(success(formatVehicle(result.rows[0], businessDay), '创建成功'));
  } catch (err) {
    logger.error('[Vehicle] POST /vehicle 失败:', { message: err.message, stack: err.stack });
    res.json(error(-1, '创建失败，请稍后重试'));
  }
});

// 任务13（车辆收敛）：PUT /vehicle/:id 补齐角色校验、plate变更查重、安全错误
router.put('/vehicle/:id', requireRole('admin', 'safety_manager'), validateBody(updateVehicleSchema), async (req, res) => {
  try {
    const businessDay = getBusinessDayStr();
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.json(error(-1, '参数错误：ID必须为数字'));
    const b = req.body;

    if (!isConnected()) {
      const idx = memoryStores.vehicle.findIndex(r => r.id === id && !r.is_deleted);
      if (idx === -1) return res.json(error(-2, '记录不存在'));
      // 内存模式：plate变更查重
      if (b.plate) {
        const newPlate = b.plate.trim().toUpperCase();
        if (memoryStores.vehicle.some(v => v.plate === newPlate && v.id !== id && !v.is_deleted)) {
          return res.json(error(-3, '该车牌号已存在'));
        }
        b.plate = newPlate;
      }
      Object.assign(memoryStores.vehicle[idx], b, { updated_at: new Date().toISOString() });
      auditLog({ userId: req.user?.id, username: req.user?.username, action: 'update', module: 'vehicle_insurance', description: `更新车辆(内存) ID=${id}`, ip: req.ip }).catch(() => {});
      return res.json(success(formatVehicle(memoryStores.vehicle[idx], businessDay), '更新成功(内存模式)'));
    }

    // DB模式：检查记录存在性
    const existResult = await pool.query('SELECT id, plate FROM vehicles WHERE id = $1 AND is_deleted = false', [id]);
    if (existResult.rows.length === 0) return res.json(error(-2, '记录不存在'));

    // plate变更查重
    if (b.plate) {
      const newPlate = b.plate.trim().toUpperCase();
      if (newPlate !== existResult.rows[0].plate) {
        const dupResult = await pool.query('SELECT id FROM vehicles WHERE plate = $1 AND id != $2 AND is_deleted = false', [newPlate, id]);
        if (dupResult.rows.length > 0) {
          return res.json(error(-3, '该车牌号已存在'));
        }
      }
    }

    const result = await pool.query(`
      UPDATE vehicles SET
        plate=COALESCE($1,plate), vin=COALESCE($2,vin),
        engine_no=COALESCE($3,engine_no), reg_date=COALESCE($4,reg_date),
        model=COALESCE($5,model), owner=COALESCE($6,owner),
        insurance_type=COALESCE($7,insurance_type),
        insurance_start=COALESCE($8,insurance_start),
        insurance_end=COALESCE($9,insurance_end),
        premium=COALESCE($10,premium), vehicle_type=COALESCE($11,vehicle_type),
        status=COALESCE($12,status), remark=COALESCE($13,remark),
        policy_holder=COALESCE($14,policy_holder),
        registered_owner=COALESCE($15,registered_owner),
        compulsory_start=COALESCE($16,compulsory_start),
        compulsory_end=COALESCE($17,compulsory_end),
        commercial_start=COALESCE($18,commercial_start),
        commercial_end=COALESCE($19,commercial_end),
        vehicle_damage_amount=COALESCE($20,vehicle_damage_amount),
        vehicle_damage_premium=COALESCE($21,vehicle_damage_premium),
        third_party_amount=COALESCE($22,third_party_amount),
        third_party_premium=COALESCE($23,third_party_premium),
        passenger_amount=COALESCE($24,passenger_amount),
        passenger_premium=COALESCE($25,passenger_premium),
        commercial_total=COALESCE($26,commercial_total),
        compulsory_premium=COALESCE($27,compulsory_premium),
        vehicle_tax=COALESCE($28,vehicle_tax),
        total_premium=COALESCE($29,total_premium),
        updated_at=CURRENT_TIMESTAMP
      WHERE id=$30 AND is_deleted=false RETURNING *
    `, [
      b.plate ? b.plate.trim().toUpperCase() : null,
      b.vin ? b.vin.trim() : null,
      b.engine_no ? b.engine_no.trim() : null,
      b.reg_date || null,
      b.model ? b.model.trim() : null,
      b.owner ? b.owner.trim() : null,
      b.insurance_type ? b.insurance_type.trim() : null,
      b.insurance_start || null,
      b.insurance_end || null,
      b.premium !== undefined ? b.premium : null,
      b.vehicle_type ? b.vehicle_type.trim() : null,
      b.status || null,
      b.remark ? b.remark.trim() : null,
      b.policy_holder ? b.policy_holder.trim() : null,
      b.registered_owner ? b.registered_owner.trim() : null,
      b.compulsory_start || null,
      b.compulsory_end || null,
      b.commercial_start || null,
      b.commercial_end || null,
      b.vehicle_damage_amount !== undefined ? b.vehicle_damage_amount : null,
      b.vehicle_damage_premium !== undefined ? b.vehicle_damage_premium : null,
      b.third_party_amount || null,
      b.third_party_premium !== undefined ? b.third_party_premium : null,
      b.passenger_amount || null,
      b.passenger_premium !== undefined ? b.passenger_premium : null,
      b.commercial_total !== undefined ? b.commercial_total : null,
      b.compulsory_premium !== undefined ? b.compulsory_premium : null,
      b.vehicle_tax !== undefined ? b.vehicle_tax : null,
      b.total_premium !== undefined ? b.total_premium : null,
      id
    ]);
    if (result.rows.length === 0) return res.json(error(-2, '记录不存在'));
    auditLog({ userId: req.user?.id, username: req.user?.username, action: 'update', module: 'vehicle_insurance', description: `更新车辆 ID=${id}`, ip: req.ip }).catch(() => {});
    res.json(success(formatVehicle(result.rows[0], businessDay), '更新成功'));
  } catch (err) {
    logger.error('[Vehicle] PUT /vehicle/:id 失败:', { message: err.message, stack: err.stack });
    res.json(error(-1, '更新失败，请稍后重试'));
  }
});

// 任务13（车辆收敛）：DELETE /vehicle/:id 补齐角色校验、同步软删insurance_history、安全错误
router.delete('/vehicle/:id', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.json(error(-1, '参数错误：ID必须为数字'));

    if (!isConnected()) {
      const r = memoryStores.vehicle.find(r => r.id === id && !r.is_deleted);
      if (!r) return res.json(error(-2, '记录不存在'));
      r.is_deleted = true;
      auditLog({ userId: req.user?.id, username: req.user?.username, action: 'delete', module: 'vehicle_insurance', description: `删除车辆(内存) ID=${id}`, ip: req.ip }).catch(() => {});
      return res.json(success(null, '删除成功(内存模式)'));
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // P1-1(事故联动)：车辆删除前检查是否存在关联事故（RESTRICT 语义，最安全策略，不做级联软删/置空）
      const accCheck = await client.query(
        'SELECT COUNT(*)::int AS cnt FROM accidents WHERE vehicle_id = $1 AND is_deleted = false',
        [id]
      );
      if (parseInt(accCheck.rows[0].cnt) > 0) {
        await client.query('ROLLBACK');
        return res.json(error(-3, '该车辆存在关联事故记录，无法删除。请先处理相关事故后再试。'));
      }
      const result = await client.query('UPDATE vehicles SET is_deleted=true, updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND is_deleted=false RETURNING id', [id]);
      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.json(error(-2, '记录不存在'));
      }
      // 同步软删关联的保险历史（遗留接口使用，保持一致性）
      await client.query('UPDATE insurance_history SET is_deleted=true WHERE vehicle_id = $1', [id]);
      await client.query('COMMIT');
      auditLog({ userId: req.user?.id, username: req.user?.username, action: 'delete', module: 'vehicle_insurance', description: `删除车辆 ID=${id}`, ip: req.ip }).catch(() => {});
      res.json(success(null, '删除成功'));
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error('[Vehicle] DELETE /vehicle/:id 失败:', { message: err.message, stack: err.stack });
    res.json(error(-1, '删除失败，请稍后重试'));
  }
});

// ================================================================
//  /personnel — 人员保险
// ================================================================

/**
 * 按 employeeId / employeeCode（工号）唯一解析人员主数据（任务4）。
 * 姓名仅作附加校验，不单独自动匹配；零候选/多候选返回原因。
 * @returns {{ employee?: Object, reason?: string }} reason:
 *   missing_employee_id | employee_not_found | employee_multiple_candidates
 */
/**
 * 共享人员解析（任务2，提示词08）：统一调用 server/services/employeeResolver 生产模块。
 * 单条创建、直接导入、通用导入复用同一解析器（禁止复制查询逻辑）。
 * 返回 { employee } 或 { reason }（见 services/employeeResolver.js 的稳定 reason 表）。
 */
const { resolveEmployee, isNameConsistent } = require('../services/employeeResolver');

function formatPersonnelIns(row, emp) {
  // 任务7：统一状态口径（与 calcInsuranceStatus 一致：is_current + 起期/止期 + 30天边界），
  // 不再保留仅按到期日的旧实现
  const insuranceStatus = calcInsuranceStatus({
    isCurrent: row.is_current,
    startDate: row.start_date,
    expireDate: row.expire_date,
  });
  const policyEndDate = row.expire_date ? toDateStr(row.expire_date) : null;

  // C1/C3（提示词-143）：姓名/部门/岗位优先取花名册最新值；emp 为 v_employee_current 关联结果（可能为 null）
  const name = (emp && emp.name != null) ? emp.name : (row.person_name || '');
  const department = (emp && emp.department != null) ? emp.department : (row.department || row.dept || '');
  const position = (emp && emp.position != null) ? emp.position : (row.position || row.post || '');

  // C3 syncStatus 判定：以快照值(p.*) 与花名册当前值(emp.*) 比对
  let syncStatus = 'missing';
  if (emp && emp.id != null) {
    const nameMatch = (emp.name || '') === (row.person_name || '');
    const deptMatch = (emp.department || '') === (row.department || row.dept || '');
    const posMatch = (emp.position || '') === (row.position || row.post || '');
    syncStatus = (nameMatch && deptMatch && posMatch) ? 'synced' : 'unsynced';
  }

  return {
    id: row.id,
    employeeId: row.employee_id ?? null,
    personnelId: row.personnel_id || null,
    name,
    idCard: row.id_card || row.idcard || '',
    phone: row.phone || '',
    department,
    position,
    workType: row.work_type || row.workType || '',
    isHighRisk: row.is_high_risk === true || row.isHighRisk === true,
    highRiskCategory: row.high_risk_category || row.highRiskCategory || undefined,
    employeeType: row.employee_type || row.employeeType || '',
    entryDate: row.entry_date ? toDateStr(row.entry_date) : null,
    insuranceStatus,
    // 任务7：不再用 calcExpiryStatus 仅按到期日判读；由统一 insuranceStatus 映射（兼容旧字段名）
    expiryStatus: insuranceStatus === 'insured' ? 'normal'
      : insuranceStatus === 'expiring' ? 'expiring'
      : insuranceStatus === 'expired' ? 'expired' : 'unknown',
    insuranceType: row.insurance_type || '',
    policyNumber: row.policy_no || row.policyNumber || '',
    policyStartDate: row.start_date ? toDateStr(row.start_date) : null,
    policyEndDate,
    premium: parseFloat(row.premium) || 0,
    remark: row.remark || '',
    syncStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** 把 Date/字符串统一为 YYYY-MM-DD 业务日字符串（任务8：Asia/Shanghai，禁止 UTC toISOString 代表中国业务日） */
function toBusinessDayStr(input) {
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}/.test(input)) return input.slice(0, 10);
  if (input == null) return getBusinessDayStr();
  return getBusinessDayStr(input);
}

/**
 * 计算单个险种状态（任务7：统一口径，集中为可单测纯函数）。
 * “当前有效”必须同时满足：未删除（调用方保证）、is_current=true、
 * start_date 与 expire_date 均有效（非空、start_date <= expire_date）、
 * start_date <= 业务日 <= expire_date。
 * - is_current 缺失/false、起期缺失、止期缺失、起期晚于止期 → uninsured
 * - 当前有效且止期距业务日 0–30 自然日（含 0/30）→ expiring；>30 日 → insured
 * - 只有历史保单（止期早于业务日）→ expired
 * - 只有未来、停用、日期不完整或根本无有效事实 → uninsured
 * @param {{ isCurrent?: boolean, startDate?: string|null, expireDate?: string|null }} rec
 * @param {Date|string} [today] 固定业务日（测试注入，默认当天）
 */
function calcInsuranceStatus({ isCurrent, startDate, expireDate } = {}, today) {
  const t = toBusinessDayStr(today);
  // is_current 缺失/false 一律不视为当前保单（严格，不再默认 true）
  if (isCurrent !== true) return 'uninsured';
  const start = startDate ? toDateStr(startDate) : null;
  const exp = expireDate ? toDateStr(expireDate) : null;
  // 起期/止期缺失 → 无有效事实
  if (!start || !exp) return 'uninsured';
  // 起期晚于止期 → 无效
  if (start > exp) return 'uninsured';
  // 尚未生效（未来保单）→ 不视为当前参保
  if (start > t) return 'uninsured';
  // 已过期（止期早于业务日）
  if (exp < t) return 'expired';
  // 当前有效：0–30 自然日（含 0/30）为临期；>30 为正常参保
  const daysLeft = Math.ceil((new Date(`${exp}T00:00:00Z`) - new Date(`${t}T00:00:00Z`)) / 86400000);
  if (daysLeft <= 30) return 'expiring';
  return 'insured';
}

// 兼容旧签名（仅依据到期日；新代码请使用 calcInsuranceStatus）
function calcInsTypeStatus(expireDate) {
  return calcInsuranceStatus({ expireDate });
}

/** 记录排名（SQL ROW_NUMBER ORDER BY CASE 完全等价，任务9）：
 *  当前有效(0) > 当前标记的未来 is_current=true 且日期完整合法(1) >
 *  当前标记的历史 is_current=true 且日期完整合法(2) > 停用/日期不完整/非法(3)。
 *  与 SQL policyStateSql 一致：rank 1/2 必须同时要求 is_current=true、起止日期都存在、
 *  start_date <= expire_date；缺止期的未来、缺起期的历史或起期晚于止期一律 rank 3。 */
function insuranceRecordRank(rec, t) {
  const st = calcInsuranceStatus({ isCurrent: rec.is_current, startDate: rec.start_date, expireDate: rec.expire_date }, t);
  if (st === 'insured' || st === 'expiring') return 0; // 当前有效（隐含 is_current=true + 完整合法日期）
  // 统一业务日字符串（Asia/Shanghai），避免 Date 与字符串比较产生 NaN
  const dayStr = toBusinessDayStr(t);
  if (rec.is_current === true) {
    const start = rec.start_date ? toDateStr(rec.start_date) : null;
    const exp = rec.expire_date ? toDateStr(rec.expire_date) : null;
    // 与 policyStateSql.hasValidDates 等价：起止都存在且 start <= exp
    const hasValidDates = start != null && exp != null && start <= exp;
    if (hasValidDates) {
      if (start > dayStr) return 1; // 当前标记的未来（is_current=true + 完整合法日期）
      if (exp < dayStr) return 2;   // 当前标记的历史（is_current=true + 完整合法日期）
    }
  }
  return 3; // 停用/日期不完整/非法
}

/**
 * 内存模式确定性选单比较器（与 DB ROW_NUMBER ORDER BY 完全等价）：
 * 当前有效 > 未来 > 历史 > 停用/不完整；同 rank 内 is_current DESC、
 * expire_date DESC NULLS LAST、start_date DESC NULLS LAST、id DESC。
 * 返回 a 是否排在 b 之前（a 更优先）。
 */
function compareInsuranceRecords(a, b, today) {
  const t = toBusinessDayStr(today);
  const ra = insuranceRecordRank(a, t);
  const rb = insuranceRecordRank(b, t);
  if (ra !== rb) return ra - rb;
  const ac = a.is_current === true ? 1 : 0;
  const bc = b.is_current === true ? 1 : 0;
  if (ac !== bc) return bc - ac;
  const ae = a.expire_date ? toDateStr(a.expire_date) : null;
  const be = b.expire_date ? toDateStr(b.expire_date) : null;
  if ((ae == null) !== (be == null)) return ae == null ? 1 : -1;
  if (ae !== be) return ae > be ? -1 : 1;
  const as = a.start_date ? toDateStr(a.start_date) : null;
  const bs = b.start_date ? toDateStr(b.start_date) : null;
  if ((as == null) !== (bs == null)) return as == null ? 1 : -1;
  if (as !== bs) return as > bs ? -1 : 1;
  return (b.id || 0) - (a.id || 0);
}

/** 从同 employee_id + 险种的多条记录中确定性选择一条用于展示（返回整行，禁止跨记录拼接） */
function pickBestInsuranceRecord(records, today) {
  if (!Array.isArray(records) || records.length === 0) return null;
  let best = records[0];
  for (let i = 1; i < records.length; i++) {
    if (compareInsuranceRecords(records[i], best, today) < 0) best = records[i];
  }
  return best;
}

/**
 * 生成确定性选单 SQL 子查询（DB 主列表/COUNT/stats 复用，与 compareInsuranceRecords
 * 内存比较器等价）：当前有效(0) > 未来(1) > 历史(2) > 停用/不完整(3)，
 * 同 rank 内 is_current DESC、expire_date DESC NULLS LAST、start_date DESC NULLS LAST、id DESC。
 */
/**
 * SQL 业务日（任务9）：统一从 services/businessDay 导入唯一带括号表达式
 * (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date（不各自复制文字常量）。
 */
const { BUSINESS_DAY_SQL } = require('../services/businessDay');

/**
 * 单险种状态 SQL 共享构造（任务9，提示词09，唯一真值表）。
 * 与 JS calcInsuranceStatus 完全对应：
 *   active    is_current=true 且 起止日期都存在且 start<=expire 且 start<=业务日<=expire
 *   future    is_current=true 且 起止日期都存在且 start<=expire 且 start>业务日
 *   expired   is_current=true 且 起止日期都存在且 start<=expire 且 expire<业务日
 *   inactive_or_invalid  is_current=false/NULL、任一日期缺失、起期晚于止期或其他非法
 * 返回 { active, future, expired, expiring }（expiring = active 且 expire<=业务日+30 天）。
 */
function policyStateSql(alias) {
  const a = alias;
  const BD = BUSINESS_DAY_SQL;
  const hasValidDates = `${a}.start_date IS NOT NULL AND ${a}.expire_date IS NOT NULL AND ${a}.start_date <= ${a}.expire_date`;
  const active = `${a}.is_current = true AND ${hasValidDates} AND ${a}.start_date <= ${BD} AND ${a}.expire_date >= ${BD}`;
  const future = `${a}.is_current = true AND ${hasValidDates} AND ${a}.start_date > ${BD}`;
  const expired = `${a}.is_current = true AND ${hasValidDates} AND ${a}.expire_date < ${BD}`;
  const expiring = `${a}.is_current = true AND ${hasValidDates} AND ${a}.start_date <= ${BD} AND ${a}.expire_date >= ${BD} AND ${a}.expire_date <= ${BD} + INTERVAL '30 days'`;
  return { active, future, expired, expiring, hasValidDates };
}

function policyPivotSql(insuranceType) {
  const a = 'p';
  const st = policyStateSql(a);
  return `
      SELECT ${a}.* FROM (
        SELECT ${a}.*, ROW_NUMBER() OVER (
          PARTITION BY ${a}.employee_id
          ORDER BY
            CASE WHEN ${st.active} THEN 0
                 WHEN ${st.future} THEN 1
                 WHEN ${st.expired} THEN 2
                 ELSE 3
            END ASC,
            ${a}.is_current DESC, ${a}.expire_date DESC NULLS LAST,
            ${a}.start_date DESC NULLS LAST, ${a}.id DESC
        ) AS rn
        FROM personnel_insurance ${a}
        WHERE ${a}.insurance_type = '${insuranceType}' AND ${a}.is_deleted = false
      ) ${a} WHERE ${a}.rn = 1`;
}

/** SQL 当前有效表达式（= policyStateSql(alias).active，与 calcInsuranceStatus 一致） */
function activePolicySql(alias) {
  return policyStateSql(alias).active;
}

/** SQL 快照不一致表达式（被选记录快照 vs 花名册当前值） */
function snapshotMismatchSql(alias, ev) {
  return `(${alias}.id IS NOT NULL AND (COALESCE(${alias}.person_name,'') <> COALESCE(${ev}.name,'') OR COALESCE(${alias}.department,'') <> COALESCE(${ev}.org_name,'') OR COALESCE(${alias}.position,'') <> COALESCE(${ev}.position_name,'')))`;
}

/**
 * 人员级互斥四态 SQL 构造（任务9，提示词09）。
 * 优先级：expiring > insured > expired > uninsured。
 *   - expiring   任一受支持险种存在当前有效且 0–30 天到期的被选保单
 *   - insured    不属 expiring 且至少一个险种当前有效
 *   - expired    无任何当前有效且至少一个险种的被选记录是真正历史过期（policyStateSql.expired）
 *   - uninsured  以上均不满足（无记录/只有未来、停用、日期不完整/非法）
 * hasExpired 必须用"真正 expired"（is_current=true + 完整日期 + start<=expire + expire<业务日），
 * 不得用 NOT active AND expire_date < 业务日（那会把 is_current=false/缺起期/非法日期误判 expired）。
 * DB list/COUNT、stats 复用同一组表达式；与 JS calcPersonStatus 完全一致。
 */
function personLevelSql(aliasEmp, aliasInj) {
  const BD = BUSINESS_DAY_SQL;
  const empState = policyStateSql(aliasEmp);
  const injState = policyStateSql(aliasInj);
  const expiring = `((${aliasEmp}.id IS NOT NULL AND ${empState.expiring}) OR (${aliasInj}.id IS NOT NULL AND ${injState.expiring}))`;
  // 两分支各自加括号，避免 AND/OR 优先级歧义（NOT(covered) 语义必须明确）
  const covered = `((${empState.active}) OR (${injState.active}))`;
  const hasExpired = `((${aliasEmp}.id IS NOT NULL AND ${empState.expired}) OR (${aliasInj}.id IS NOT NULL AND ${injState.expired}))`;
  return { expiring, covered, hasExpired };
}

// 花名册在职口径：人员保险以「在职人员」（用工关系状态=正式员工）为主数据源。
// 与员工列表「在职人员」卡片口径一致；v_employee_current 视图未含 employment_relation，
// 故所有以 v_employee_current 为主的花名册查询（列表/统计/部门下拉）统一 JOIN employee 过滤，
// 禁止在视图中硬编码该口径（视图被事故/隐患等多模块复用）。
const ACTIVE_ROSTER_JOIN = `JOIN employee emp_rel
  ON emp_rel.id = ev.employee_id
  AND emp_rel.is_deleted = false
  AND emp_rel.employment_relation = '正式员工'`;

/**
 * 人员保险人数口径 pivot SQL（任务9，提示词09）：
 * /personnel/stats 与 /stats/overview.personnel 共用同一查询构造，禁止复制第二套长 SQL。
 * 以当前花名册在职人员为主；确定性双险透视（policyPivotSql）+ 人员级互斥四态（personLevelSql）。
 * 返回列：total / covered(=insured+expiring) / expired / pending(=uninsured) / expiring(⊆covered)，
 * 满足恒等式 total = covered + expired + pending。
 */
function buildPersonnelStatsPivotSql() {
  const ps = personLevelSql('emp_piv', 'inj_piv');
  // 合规口径（雇主险10万/80万档 + 工伤险按记录存在）：noncompliant = 花名册中"保险状态"不合规人数
  const cs = complianceStatusSql('emp_piv', 'inj_piv');
  return `
        WITH emp_piv AS (${policyPivotSql('雇主责任险')}),
        inj_piv AS (${policyPivotSql('工伤保险')})
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE ${ps.covered})::int AS covered,
          COUNT(*) FILTER (WHERE NOT (${ps.covered}) AND (${ps.hasExpired}))::int AS expired,
          COUNT(*) FILTER (WHERE NOT (${ps.covered}) AND NOT (${ps.hasExpired}))::int AS pending,
          COUNT(*) FILTER (WHERE ${ps.expiring})::int AS expiring,
          COUNT(*) FILTER (WHERE NOT ${cs})::int AS noncompliant
        FROM v_employee_current ev
        ${ACTIVE_ROSTER_JOIN}
        LEFT JOIN emp_piv ON emp_piv.employee_id = ev.employee_id
        LEFT JOIN inj_piv ON inj_piv.employee_id = ev.employee_id
        WHERE ev.employee_deleted = false`;
}

/**
 * 人员级互斥四态 JS 纯函数（与 personLevelSql 一致，供内存模式/格式化使用）。
 * @param {string} empStatus 雇主险子状态（insured/expiring/expired/uninsured）
 * @param {string} injStatus 工伤险子状态
 */
function calcPersonStatus(empStatus, injStatus) {
  const eExp = empStatus === 'expiring';
  const iExp = injStatus === 'expiring';
  const eAct = empStatus === 'insured' || eExp;
  const iAct = injStatus === 'insured' || iExp;
  if (eExp || iExp) return 'expiring';
  if (eAct || iAct) return 'insured';
  if (empStatus === 'expired' || injStatus === 'expired') return 'expired';
  return 'uninsured';
}

/**
 * 合规判定（人员保险"保险状态"列口径）：
 *   - 当前有效雇主险且保额 >= 80万 → 合规（80万档单独即合规）
 *   - 当前有效雇主险且保额 >= 10万 且有工伤险记录 → 合规（10万档需工伤险补充）
 *   - 有工伤险记录且无当前有效雇主险 → 合规（纯工伤险）
 *   - 其它 → 不合规
 * 雇主险仍要求"当前有效"（insured/expiring）；工伤险按月缴纳、无日期概念：
 *   只要该员工存在工伤保险记录（身份证已匹配花名册，recordExists）即视为已缴纳，
 *   不看 start_date/expire_date（可为 NULL / 已过期 / 未来）。
 * 与 DB complianceStatusSql / 内存筛选 calcComplianceStatus 同一口径。
 */
function calcComplianceStatus({ employerStatus, injuryExists, empCoverage } = {}) {
  const empActive = employerStatus === 'insured' || employerStatus === 'expiring';
  const hasInj = injuryExists === true;
  const coverage = Number(empCoverage) || 0;
  if (empActive && coverage >= 800000) return 'compliant';
  if (empActive && coverage >= 100000 && hasInj) return 'compliant';
  if (hasInj && !empActive) return 'compliant';
  return 'noncompliant';
}

/** 合规判定 SQL 表达式（emp=雇主险别名, inj=工伤险别名；工伤险按记录存在判定，不看日期） */
function complianceStatusSql(aliasEmp, aliasInj) {
  const empAct = activePolicySql(aliasEmp);
  const hasInj = `${aliasInj}.id IS NOT NULL`;
  return `((${empAct} AND COALESCE(${aliasEmp}.coverage_amount, 0) >= 800000) OR (${empAct} AND COALESCE(${aliasEmp}.coverage_amount, 0) >= 100000 AND ${hasInj}) OR (${hasInj} AND NOT (${empAct})))`;
}

// 人员保险透视格式化：一行=一人，含雇主险+工伤险两列
function formatPersonnelInsPivoted(row, emp) {
  // 任务6：状态基于完整业务事实（is_current + start_date + expire_date）
  const employerStatus = calcInsuranceStatus({
    isCurrent: row.emp_is_current,
    startDate: row.emp_start_date,
    expireDate: row.emp_expire_date,
  });
  const injuryStatus = calcInsuranceStatus({
    isCurrent: row.inj_is_current,
    startDate: row.inj_start_date,
    expireDate: row.inj_expire_date,
  });

  // 花名册为主（DB 模式）：row 直接是 v_employee_current 行（name/gender/age/org_name/position_name）
  // 兼容保险侧为底（内存模式）：走 emp 参数或 person_name 快照回退
  const name       = row.name || ((emp && emp.name != null)       ? emp.name       : (row.person_name || ''));
  const department = row.org_name || ((emp && emp.department != null) ? emp.department : (row.department || ''));
  const position   = row.position_name || ((emp && emp.position != null)   ? emp.position   : (row.position || ''));
  const gender     = row.gender || '';
  const age        = (row.age != null && row.age !== '') ? parseInt(row.age, 10) : null;

  // id_card 优先取保险侧明文（保险数据为明文身份证号），回退花名册值（加密 ENC: 前缀）
  const idCard = row.id_card || '';

  // 任务6：syncStatus 真实比较被选保险记录的快照（person_name/department/position）与当前花名册。
  // 无任何关联保险 → missing；全部相关快照一致 → synced；任一不一致 → unsynced。
  const hasAnyInsurance = row.emp_id != null || row.inj_id != null;
  let syncStatus = 'missing';
  if (hasAnyInsurance) {
    const snapshots = [];
    if (row.emp_id != null) snapshots.push({ name: row.emp_person_name, dept: row.emp_department, pos: row.emp_position });
    if (row.inj_id != null) snapshots.push({ name: row.inj_person_name, dept: row.inj_department, pos: row.inj_position });
    const allMatch = snapshots.every((s) =>
      (s.name || '') === (name || '') &&
      (s.dept || '') === (department || '') &&
      (s.pos || '') === (position || '')
    );
    syncStatus = allMatch ? 'synced' : 'unsynced';
  }

  // 合规判定（人员保险口径：雇主险10万/80万档 + 工伤险按记录存在，见 calcComplianceStatus）
  // 工伤险按月缴纳、无日期概念：有工伤保险记录（recordExists）即视为已缴纳
  const complianceStatus = calcComplianceStatus({ employerStatus, injuryExists: row.inj_id != null, empCoverage: row.emp_coverage });

  return {
    rowKey: `employee:${row.employee_id ?? row.employeeId ?? ''}`,
    employeeId: row.employee_id ?? row.employeeId ?? null,
    personName: name,
    idCard,
    department,
    position,
    // 入职日期：取花名册当前主岗位 start_date（入库时由导入「入职日期」回填，全员在职均有值）
    entryDate: row.entry_date ? toDateStr(row.entry_date) : null,
    gender,
    age,
    // deprecated 兼容：旧字段语义含混（personnel_id 曾写入 employee.id），
    // 新契约统一使用 employeeId；移除条件：前端/依赖方停止读取 personnelId 后。
    personnelId: row.personnel_id || row.employee_id || null,
    // 雇主险：id 保留业务记录供编辑历史；hasInsurance=当前有效参保（与 status 同源），
    // isCurrent 为记录真实值（编辑回显用，禁止由 hasInsurance 反推）
    employer: {
      id: row.emp_id || null,
      recordExists: row.emp_id != null,
      hasInsurance: employerStatus === 'insured' || employerStatus === 'expiring',
      isCurrent: row.emp_is_current === true,
      policyNo: row.emp_policy_no || '',
      startDate:  row.emp_start_date  ? toDateStr(row.emp_start_date) : null,
      expireDate: row.emp_expire_date ? toDateStr(row.emp_expire_date) : null,
      premium:  parseFloat(row.emp_premium)  || 0,
      coverage: parseFloat(row.emp_coverage) || 0,
      status: employerStatus,
    },
    // 工伤险（按月缴纳、无日期概念）：hasInsurance/recordExists 均以"存在工伤保险记录"判定，
    // 不看 start_date/expire_date（可为 NULL/过期）；status 保留供详情页展示
    injury: {
      id: row.inj_id || null,
      recordExists: row.inj_id != null,
      hasInsurance: row.inj_id != null,
      isCurrent: row.inj_is_current === true,
      policyNo: row.inj_policy_no || '',
      startDate:  row.inj_start_date  ? toDateStr(row.inj_start_date) : null,
      expireDate: row.inj_expire_date ? toDateStr(row.inj_expire_date) : null,
      premium:  parseFloat(row.inj_premium)  || 0,
      coverage: parseFloat(row.inj_coverage) || 0,
      status: injuryStatus,
    },
    // 任务8：人员级互斥四态（expiring > insured > expired > uninsured，与 DB personLevelSql 一致）
    personStatus: calcPersonStatus(employerStatus, injuryStatus),
    complianceStatus,
    syncStatus,
  };
}

router.get('/personnel', async (req, res) => {
  try {
    const { page = 1, pageSize = 20, keyword, department, insuranceStatus, isHighRisk, highRiskCategory, syncStatus, complianceStatus } = req.query;

    if (!isConnected()) {
      // 内存模式（任务7）：主列表只接受稳定 employee_id（缺稳定 ID 的旧记录不进入主列表，
      // 只出现在 /personnel/unmatched）。每员工每险种用 pickBestInsuranceRecord 确定性选单，
      // 与 DB ROW_NUMBER 完全等价；返回完整状态/isCurrent/快照字段（禁止跨记录拼接）。
      // 降级语义：内存模式无花名册数据源（v_employee_current 是 DB 视图，无法回退员工名单），
      // 未导入任何雇主险/工伤险时 byEmp 为空 → 返回空列表且不报错属预期；
      // DB 模式下由 v_employee_current 为主 + LEFT JOIN 保险透视自动回退花名册全量。
      const byEmp = new Map();
      memoryStores.personnel.filter(r => !r.is_deleted && r.employee_id != null).forEach(r => {
        if (!byEmp.has(r.employee_id)) byEmp.set(r.employee_id, { emp: [], inj: [], info: r });
        const bucket = byEmp.get(r.employee_id);
        if (r.insurance_type === '雇主责任险') bucket.emp.push(r);
        else if (r.insurance_type === '工伤保险') bucket.inj.push(r);
      });
      let list = [];
      byEmp.forEach((bucket, employeeId) => {
        const emp = pickBestInsuranceRecord(bucket.emp, new Date());
        const inj = pickBestInsuranceRecord(bucket.inj, new Date());
        const base = bucket.info;
        const row = {
          name: base.person_name,
          employee_id: employeeId,
          id_card: base.id_card || base.idcard || '',
          org_name: base.department || base.dept || '',
          position_name: base.position || base.post || '',
          gender: base.gender || '',
          age: base.age != null ? base.age : null,
          personnel_id: base.personnel_id != null ? base.personnel_id : employeeId,
          emp_id: emp ? emp.id : null,
          emp_policy_no: emp ? emp.policy_no : null,
          emp_start_date: emp ? emp.start_date : null,
          emp_expire_date: emp ? emp.expire_date : null,
          emp_is_current: emp ? (emp.is_current === true) : null,
          emp_premium: emp ? emp.premium : null,
          emp_coverage: emp ? emp.coverage_amount : null,
          emp_department: emp ? emp.department : null,
          emp_position: emp ? emp.position : null,
          emp_person_name: emp ? emp.person_name : null,
          inj_id: inj ? inj.id : null,
          inj_policy_no: inj ? inj.policy_no : null,
          inj_start_date: inj ? inj.start_date : null,
          inj_expire_date: inj ? inj.expire_date : null,
          inj_is_current: inj ? (inj.is_current === true) : null,
          inj_premium: inj ? inj.premium : null,
          inj_coverage: inj ? inj.coverage_amount : null,
          inj_department: inj ? inj.department : null,
          inj_position: inj ? inj.position : null,
          inj_person_name: inj ? inj.person_name : null,
        };
        list.push(row);
      });
      if (keyword) {
        const kw = keyword.toLowerCase();
        list = list.filter(r => (r.name && r.name.toLowerCase().includes(kw)));
      }
      if (department) {
        list = list.filter(r => r.org_name === department);
      }
      if (isHighRisk === 'true' || isHighRisk === true) {
        list = list.filter(r => memoryStores.personnel.some(p => !p.is_deleted && p.employee_id === r.employee_id && p.is_high_risk === true));
      }
      if (highRiskCategory) {
        list = list.filter(r => memoryStores.personnel.some(p => !p.is_deleted && p.employee_id === r.employee_id && p.high_risk_category === highRiskCategory));
      }
      // 保险状态筛选（任务8：与 DB personLevelSql 同一人员级互斥四态：
      // expiring > insured > expired > uninsured；第30天仅属 expiring，与 expired/uninsured 互斥）
      if (insuranceStatus) {
        list = list.filter(r => {
          const es = calcInsuranceStatus({ isCurrent: r.emp_is_current, startDate: r.emp_start_date, expireDate: r.emp_expire_date }, new Date());
          const is = calcInsuranceStatus({ isCurrent: r.inj_is_current, startDate: r.inj_start_date, expireDate: r.inj_expire_date }, new Date());
          const personState = calcPersonStatus(es, is);
          if (insuranceStatus === 'insured')   return personState === 'insured';
          if (insuranceStatus === 'expiring')  return personState === 'expiring';
          if (insuranceStatus === 'expired')   return personState === 'expired';
          if (insuranceStatus === 'uninsured') return personState === 'uninsured';
          return true;
        });
      }
      // 合规筛选（人员保险口径：与 calcComplianceStatus 一致，不再依赖年龄/性别）
      if (complianceStatus) {
        list = list.filter(r => {
          const es = calcInsuranceStatus({ isCurrent: r.emp_is_current, startDate: r.emp_start_date, expireDate: r.emp_expire_date }, new Date());
          const is = calcInsuranceStatus({ isCurrent: r.inj_is_current, startDate: r.inj_start_date, expireDate: r.inj_expire_date }, new Date());
          const st = calcComplianceStatus({ employerStatus: es, injuryExists: r.inj_id != null, empCoverage: r.emp_coverage });
          if (complianceStatus === 'compliant') return st === 'compliant';
          if (complianceStatus === 'noncompliant') return st !== 'compliant';
          return true;
        });
      }
      // syncStatus 三态筛选（与 formatPersonnelInsPivoted 一致，COUNT=list 前过滤再分页）
      if (syncStatus) {
        list = list.filter(r => {
          const hasAny = r.emp_id != null || r.inj_id != null;
          if (syncStatus === 'missing') return !hasAny;
          if (!hasAny) return false;
          const snapshots = [];
          if (r.emp_id != null) snapshots.push({ name: r.emp_person_name, dept: r.emp_department, pos: r.emp_position });
          if (r.inj_id != null) snapshots.push({ name: r.inj_person_name, dept: r.inj_department, pos: r.inj_position });
          const allMatch = snapshots.every((s) =>
            (s.name || '') === (r.name || '') &&
            (s.dept || '') === (r.org_name || '') &&
            (s.pos || '') === (r.position_name || '')
          );
          if (syncStatus === 'synced') return allMatch;
          if (syncStatus === 'unsynced') return !allMatch;
          return true;
        });
      }
      const total = list.length;
      const off = (parseInt(page) - 1) * parseInt(pageSize);
      list = list.slice(off, off + parseInt(pageSize));
      return buildListResponse(res, list.map(r => formatPersonnelInsPivoted(r, null)), total, page, pageSize, '查询成功(内存透视模式)');
    }

    // DB 模式：以花名册 v_employee_current 为主数据源（在职员工全量），
    // LEFT JOIN 保险透视（按 employee_id 关联，任务3）。
    // 每个 employee_id + 险种用 ROW_NUMBER 确定性选择一条用于当前展示：
    //   当前有效 > 未来 > 历史 > 停用/不完整；同 rank 内 is_current > 到期日 > 起期 > 记录 ID
    // 字段全部来自同一条被选记录，杜绝多个 MAX(CASE) 跨记录拼接。
    const empPivot = policyPivotSql('雇主责任险');
    const injPivot = policyPivotSql('工伤保险');

    let whereSql = ' WHERE ev.employee_deleted = false';
    const params = [];
    let paramIdx = 0;
    if (keyword) { paramIdx++; whereSql += ` AND ev.name ILIKE $${paramIdx}`; params.push(`%${keyword}%`); }
    // 部门筛选：以花名册实际部门为准
    if (department) { paramIdx++; whereSql += ` AND ev.org_name = $${paramIdx}`; params.push(department); }
    if (isHighRisk === 'true' || isHighRisk === true) {
      // 高危：over_age_personnel 关联（花名册为主，按姓名快照；高危名单无稳定 ID 契约前保留）
      whereSql += ` AND ev.name IN (SELECT name FROM over_age_personnel WHERE is_deleted = false AND control_type LIKE '%高危%')`;
    }
    // 保险状态筛选（任务8：人员级互斥四态 expiring > insured > expired > uninsured；
    // 与 stats、内存筛选、calcPersonStatus 同一规则；第 30 天仅属 expiring，第 31 天起 insured；
    // uninsured 含未来/停用/日期不完整保单人员且与 expired 互斥）
    const personState = personLevelSql('emp', 'inj');
    if (insuranceStatus === 'insured') {
      whereSql += ` AND NOT (${personState.expiring}) AND (${personState.covered})`;
    } else if (insuranceStatus === 'expiring') {
      whereSql += ` AND (${personState.expiring})`;
    } else if (insuranceStatus === 'expired') {
      whereSql += ` AND NOT (${personState.covered}) AND (${personState.hasExpired})`;
    } else if (insuranceStatus === 'uninsured') {
      whereSql += ` AND NOT (${personState.covered}) AND NOT (${personState.hasExpired})`;
    }
    // 人员状态（合规/不合规）筛选：与 calcComplianceStatus 判定保持一致（雇主险10万/80万档 + 工伤险组合，
    // 不再依赖年龄/性别）；COUNT 与 list 复用同一表达式，杜绝先分页后过滤页数错位
    const complianceExpr = complianceStatusSql('emp', 'inj');
    if (complianceStatus === 'compliant') {
      whereSql += ` AND ${complianceExpr}`;
    } else if (complianceStatus === 'noncompliant') {
      whereSql += ` AND NOT ${complianceExpr}`;
    }
    // syncStatus 三态筛选（任务7）：missing=无关联记录；synced=有记录且快照全一致；
    // unsynced=任一被选记录快照不一致。COUNT 与 list 复用同一 whereSql，杜绝先分页后过滤页数错位。
    if (syncStatus === 'missing') {
      whereSql += ` AND emp.id IS NULL AND inj.id IS NULL`;
    } else if (syncStatus === 'synced') {
      whereSql += ` AND (emp.id IS NOT NULL OR inj.id IS NOT NULL) AND NOT (${snapshotMismatchSql('emp', 'ev')} OR ${snapshotMismatchSql('inj', 'ev')})`;
    } else if (syncStatus === 'unsynced') {
      whereSql += ` AND (${snapshotMismatchSql('emp', 'ev')} OR ${snapshotMismatchSql('inj', 'ev')})`;
    }

    const countR = await pool.query(`SELECT COUNT(*)::int AS total FROM v_employee_current ev ${ACTIVE_ROSTER_JOIN} LEFT JOIN (${empPivot}) emp ON emp.employee_id = ev.employee_id LEFT JOIN (${injPivot}) inj ON inj.employee_id = ev.employee_id${whereSql}`, params);
    const total = countR.rows[0].total;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    paramIdx++; const lp = paramIdx; params.push(parseInt(pageSize));
    paramIdx++; const op = paramIdx; params.push(offset);

    const querySql = `
      SELECT
        ev.name, ev.gender, ev.age, ev.employee_id,
        COALESCE(emp.id_card, inj.id_card, ev.id_card) AS id_card,
        ev.org_name AS department, ev.position_name AS position,
        ev.start_date AS entry_date,
        COALESCE(emp.personnel_id, inj.personnel_id) AS personnel_id,
        emp.id AS emp_id, emp.policy_no AS emp_policy_no,
        emp.start_date AS emp_start_date, emp.expire_date AS emp_expire_date,
        emp.is_current AS emp_is_current,
        emp.premium AS emp_premium, emp.coverage_amount AS emp_coverage,
        emp.department AS emp_department, emp.position AS emp_position, emp.person_name AS emp_person_name,
        inj.id AS inj_id, inj.policy_no AS inj_policy_no,
        inj.start_date AS inj_start_date, inj.expire_date AS inj_expire_date,
        inj.is_current AS inj_is_current,
        inj.premium AS inj_premium, inj.coverage_amount AS inj_coverage,
        inj.department AS inj_department, inj.position AS inj_position, inj.person_name AS inj_person_name
      FROM v_employee_current ev
      ${ACTIVE_ROSTER_JOIN}
      LEFT JOIN (${empPivot}) emp ON emp.employee_id = ev.employee_id
      LEFT JOIN (${injPivot}) inj ON inj.employee_id = ev.employee_id
      ${whereSql}
      ORDER BY CASE WHEN ${complianceExpr} THEN 1 ELSE 0 END ASC, ev.name
      LIMIT $${lp} OFFSET $${op}`;
    const result = await pool.query(querySql, params);
    const list = result.rows.map(r => formatPersonnelInsPivoted(r, null));
    res.json(success({ list, total, page: parseInt(page), pageSize: parseInt(pageSize) }, '查询成功'));
  } catch (err) {
    // 空保险表回退花名册依赖 v_employee_current 为主 + LEFT JOIN 保险透视；
    // 查询异常不得向客户端泄漏内部 SQL/连接细节（安全错误模式统一收敛）
    logger.error('[Insurance] 人员列表查询失败:', { message: err.message, stack: err.stack });
    res.json(error(-1, '查询失败，请稍后重试'));
  }
});

// GET /personnel/stats — 人员保险统计（必须在 /:id 之前注册）
router.get('/personnel/stats', async (req, res) => {
  try {
    const stats = { total: 0, covered: 0, expired: 0, pending: 0, highRisk: 0, expiring30d: 0 };
    let byType = {};
    let byDepartment = {};

    if (isConnected()) {
      // 以花名册在职员工为主统计（人员保险统计口径：人，而非保险记录条数）
      // 确定性选择同主列表（policyPivotSql）；人员级互斥四态（personLevelSql）：
      //   covered = insured + expiring（任一当前有效）
      //   expired = 无当前有效且至少一险种被选记录历史过期
      //   pending = uninsured（无当前有效且无历史过期：未来/停用/日期不完整/无记录）
      //   恒等式 total = covered + expired + pending；expiring30d ⊆ covered
      //   任务9：与 /stats/overview.personnel 共用同一 pivot 构造
      const pivotStats = buildPersonnelStatsPivotSql();
      const r1 = await pool.query(pivotStats);
      stats.total = r1.rows[0].total;
      stats.covered = r1.rows[0].covered;
      stats.expired = r1.rows[0].expired;
      stats.pending = r1.rows[0].pending;
      stats.expiring30d = r1.rows[0].expiring;
      stats.noncompliant = r1.rows[0].noncompliant || 0;
      // 高危人员统计：从 over_age_personnel（control_type 含"高危"）统计
      const r5 = await pool.query("SELECT COUNT(*)::int AS v FROM over_age_personnel WHERE is_deleted = false AND control_type LIKE '%高危%'");
      stats.highRisk = r5.rows[0].v;
      // 险种覆盖人数（按人，仅当前有效）：花名册中分别有当前有效雇主险/工伤险的人数
      const r7 = await pool.query(`
        WITH emp_piv AS (
          SELECT p.* FROM (${policyPivotSql('雇主责任险')}) p
        ),
        inj_piv AS (
          SELECT p.* FROM (${policyPivotSql('工伤保险')}) p
        )
        SELECT
          COUNT(*) FILTER (WHERE emp_piv.id IS NOT NULL AND ${activePolicySql('emp_piv')})::int AS emp_cnt,
          COUNT(*) FILTER (WHERE inj_piv.id IS NOT NULL AND ${activePolicySql('inj_piv')})::int AS inj_cnt
        FROM v_employee_current ev
        ${ACTIVE_ROSTER_JOIN}
        LEFT JOIN emp_piv ON emp_piv.employee_id = ev.employee_id
        LEFT JOIN inj_piv ON inj_piv.employee_id = ev.employee_id
        WHERE ev.employee_deleted = false`);
      byType = { '雇主责任险': r7.rows[0].emp_cnt, '工伤保险': r7.rows[0].inj_cnt };
      // 部门分布：以花名册实际部门为准
      const r8 = await pool.query(`
        SELECT COALESCE(ev.org_name, '未分配') AS dept, COUNT(*)::int AS cnt
        FROM v_employee_current ev
        ${ACTIVE_ROSTER_JOIN}
        WHERE ev.employee_deleted = false
        GROUP BY dept
      `);
      r8.rows.forEach(r => { byDepartment[r.dept] = r.cnt; });
    } else {
      // 内存模式（任务8）：按稳定 employee_id 去重员工维度统计（同一人多张历史保单只计一人）。
      // 未匹配记录（无 employee_id）不进入当前花名册人数与参保统计。
      // 每员工每险种用 pickBestInsuranceRecord 确定性选单，再以 calcPersonStatus 判定人员级
      // 互斥四态（与 DB personLevelSql 一致），满足恒等式 total = covered + expired + pending。
      const byEmp = new Map();
      memoryStores.personnel.filter(r => !r.is_deleted).forEach(r => {
        if (r.employee_id == null) return; // 未匹配记录不进入统计
        if (!byEmp.has(r.employee_id)) byEmp.set(r.employee_id, { emp: [], inj: [] });
        const bucket = byEmp.get(r.employee_id);
        if (r.insurance_type === '雇主责任险') bucket.emp.push(r);
        else if (r.insurance_type === '工伤保险') bucket.inj.push(r);
      });
      const today = new Date();
      let empActive = 0;
      let injActive = 0;
      let expiring30dCnt = 0;
      let noncompliantCnt = 0;
      byEmp.forEach((bucket) => {
        const emp = pickBestInsuranceRecord(bucket.emp, today);
        const inj = pickBestInsuranceRecord(bucket.inj, today);
        const es = emp ? calcInsuranceStatus({ isCurrent: emp.is_current, startDate: emp.start_date, expireDate: emp.expire_date }, today) : 'uninsured';
        const is2 = inj ? calcInsuranceStatus({ isCurrent: inj.is_current, startDate: inj.start_date, expireDate: inj.expire_date }, today) : 'uninsured';
        if (es === 'insured' || es === 'expiring') empActive++;
        if (is2 === 'insured' || is2 === 'expiring') injActive++;
        if (es === 'expiring' || is2 === 'expiring') expiring30dCnt++;
        const personState = calcPersonStatus(es, is2);
        if (personState === 'insured' || personState === 'expiring') stats.covered++;
        else if (personState === 'expired') stats.expired++;
        else stats.pending++;
        // 合规口径（与 calcComplianceStatus 一致）：工伤险按月缴纳、有记录即参保（不看日期）
        if (calcComplianceStatus({ employerStatus: es, injuryExists: bucket.inj.length > 0, empCoverage: emp ? emp.coverage_amount : null }) !== 'compliant') {
          noncompliantCnt++;
        }
      });
      stats.total = byEmp.size;
      stats.expiring30d = expiring30dCnt;
      stats.noncompliant = noncompliantCnt;
      stats.highRisk = memoryStores.personnel.filter(r => !r.is_deleted && r.is_high_risk === true).length;
      byType = { '雇主责任险': empActive, '工伤保险': injActive };
      // 部门分布：以花名册快照为准（每员工去重计一次）
      const seenEmpDept = new Set();
      memoryStores.personnel
        .filter(r => !r.is_deleted && r.employee_id != null)
        .forEach(r => {
          if (seenEmpDept.has(r.employee_id)) return;
          seenEmpDept.add(r.employee_id);
          const d = r.department || r.dept || '未分配';
          byDepartment[d] = (byDepartment[d] || 0) + 1;
        });
    }

    res.json(success({ stats, byType, byDepartment }, '查询成功'));
  } catch (err) {
    // 空保险表时统计应保持"全员未投保"口径（total=花名册在职数, pending=total）；
    // 查询异常收敛为安全文案，不泄漏内部错误
    logger.error('[Insurance] 人员统计查询失败:', { message: err.message, stack: err.stack });
    res.json(error(-1, '查询失败，请稍后重试'));
  }
});

// GET /personnel/departments — 花名册（在职）部门列表（去重、非空、排序）
// 用于前端部门筛选器动态化（U6）；以花名册在职人员为准
router.get('/personnel/departments', async (req, res) => {
  try {
    let departments = [];
    if (isConnected()) {
      const r = await pool.query(`
        SELECT DISTINCT ev.org_name AS dept
        FROM v_employee_current ev
        ${ACTIVE_ROSTER_JOIN}
        WHERE ev.employee_deleted = false
          AND ev.org_name IS NOT NULL
          AND ev.org_name <> ''
        ORDER BY dept ASC
      `);
      departments = r.rows.map((row) => row.dept);
    } else {
      departments = [...new Set(
        memoryStores.personnel
          .filter((p) => !p.is_deleted && p.department)
          .map((p) => p.department),
      )].sort();
    }
    res.json(success({ departments }));
  } catch (err) {
    res.json(error(-1, { message: err.message, stack: err.stack }));
  }
});

// POST /personnel/sync-from-roster — 按人员主数据 ID 回写花名册快照（任务4 第5条）
// 请求体字段：employeeIds（人员主数据 ID，来自 v_employee_current.employee_id）。
// 关联键为 personnel_insurance.employee_id，不再按姓名或保险记录 ID。
router.post('/personnel/sync-from-roster', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    const { employeeIds } = req.body || {};
    if (!Array.isArray(employeeIds) || employeeIds.length === 0) {
      return res.json(error(-1, '请选择要同步的人员'));
    }
    let synced = 0;
    const failed = [];
    const errors = [];
    if (isConnected()) {
      for (const employeeId of employeeIds) {
        try {
          const r = await pool.query(`
            UPDATE personnel_insurance p
            SET person_name = e.name,
                department = e.org_name,
                position = e.position_name,
                updated_at = CURRENT_TIMESTAMP
            FROM v_employee_current e
            WHERE p.employee_id = $1
              AND p.is_deleted = false
              AND e.employee_id = $1
              AND e.employee_deleted = false
            RETURNING p.id
          `, [employeeId]);
          if (r.rows.length > 0) synced++;
          else { failed.push(employeeId); errors.push(`员工${employeeId}: 未找到可同步的保险记录或员工不存在`); }
        } catch (e2) {
          failed.push(employeeId);
          errors.push(`员工${employeeId}: ${e2.message}`);
        }
      }
    } else {
      employeeIds.forEach(id => { failed.push(id); });
      errors.push('内存模式不支持同步');
    }
    res.json(success({ synced, failed, errors }, `成功同步${synced}人，失败${failed.length}人`));
  } catch (err) { res.json(error(-1, { message: err.message, stack: err.stack })); }
});

// GET /personnel/job-type-stats — 按工种分组统计
router.get('/personnel/job-type-stats', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    let result = [];
    if (isConnected()) {
      const r = await pool.query(`
        SELECT COALESCE(NULLIF(insurance_type, ''), '未分类') AS job_type, COUNT(*)::int AS count
        FROM personnel_insurance
        WHERE is_deleted = false
        GROUP BY insurance_type
        ORDER BY count DESC
      `);
      result = r.rows.map(row => ({ jobType: row.job_type, count: row.count }));
    } else {
      const map = new Map();
      for (const p of memoryStores.personnel.filter(r => !r.is_deleted)) {
        const t = p.insurance_type || '未分类';
        map.set(t, (map.get(t) || 0) + 1);
      }
      result = Array.from(map.entries()).map(([jobType, count]) => ({ jobType, count }));
    }
    res.json(success(result, '查询成功'));
  } catch (err) { res.json(error(-1, { message: err.message, stack: err.stack })); }
});

// GET /personnel/expiring-soon — 即将到期人员（任务7：仅当前有效保单，参数化 days 防注入）
router.get('/personnel/expiring-soon', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    const rawDays = parseInt(req.query.days, 10);
    const days = (Number.isFinite(rawDays) && rawDays > 0 && rawDays <= 365) ? rawDays : 30;
    let list = [];
    if (isConnected()) {
      // 当前有效：is_current=true 且 起期<=今天<=止期；止期落在 [today, today+days]
      const r = await pool.query(`
        SELECT p.* FROM personnel_insurance p
        WHERE p.is_deleted = false
          AND p.is_current = true
          AND p.start_date IS NOT NULL AND p.expire_date IS NOT NULL
          AND p.start_date <= ${BUSINESS_DAY_SQL}
          AND p.expire_date >= ${BUSINESS_DAY_SQL}
          AND p.expire_date <= ${BUSINESS_DAY_SQL} + ($1::int * INTERVAL '1 day')
        ORDER BY p.expire_date ASC
      `, [days]);
      list = r.rows.map(formatPersonnelIns);
    } else {
      const today = new Date();
      const todayStr = toBusinessDayStr(today);
      list = memoryStores.personnel
        .filter(r => !r.is_deleted && r.is_current === true && r.start_date && r.expire_date)
        .filter(r => {
          const st = calcInsuranceStatus({ isCurrent: r.is_current, startDate: r.start_date, expireDate: r.expire_date }, todayStr);
          if (st !== 'insured' && st !== 'expiring') return false; // 必须当前有效
          const daysLeft = Math.ceil((new Date(`${toDateStr(r.expire_date)}T00:00:00Z`) - new Date(`${todayStr}T00:00:00Z`)) / 86400000);
          return daysLeft >= 0 && daysLeft <= days;
        })
        .sort((a, b) => toDateStr(a.expire_date) < toDateStr(b.expire_date) ? -1 : 1);
    }
    res.json(success(list, '查询成功'));
  } catch (err) { res.json(error(-1, { message: err.message, stack: err.stack })); }
});

// PUT /personnel/batch-renewal — 批量续保（任务3，提示词10）
// 受约束的真实写入口：
//  - 严格 Zod schema（ids 去重上限、policyEndDate 必填、拒绝未知字段）
//  - DB/内存都先读取每个目标现有完整事实，合并续保后的起止/保费/备注
//  - 对每个合并后的最终事实用唯一 active 判定（isPolicyActiveOnBusinessDay）：
//    active 才查外部冲突（excludeId=自身）+ 批内同 key active 冲突
//  - 原子语义：先完成全部校验（存在性/日期顺序/冲突），全部通过后再一次性写入；
//    DB 用事务（任一失败 ROLLBACK，不留部分续保）；内存先计划后应用
//  - 内部 SQL/连接错误仅服务端日志，响应不含 e.message
router.put('/personnel/batch-renewal', requireRole('admin', 'safety_manager'), validateBody(batchRenewalSchema), async (req, res) => {
  try {
    const { ids, policyStartDate, policyEndDate, premium, remark } = req.body;
    const requested = ids.length;
    const businessDay = toBusinessDayStr();
    const rowErrors = [];
    const failRow = (row, reason, message) => rowErrors.push({ row, reason, message });

    // ---------- 内存模式：先计划全部校验，全部通过后再一次性应用 ----------
    if (!isConnected()) {
      const plans = [];
      for (const id of ids) {
        const target = memoryStores.personnel.find((x) => x.id === id && !x.is_deleted);
        if (!target) { failRow(id, 'target_not_found', `记录 ${id} 不存在`); continue; }
        const merged = { ...target };
        if (policyStartDate) merged.start_date = policyStartDate;
        merged.expire_date = policyEndDate;
        if (premium !== undefined && premium !== null) merged.premium = premium;
        if (remark !== undefined && remark !== null) merged.remark = remark;
        if (merged.start_date && String(merged.start_date) > String(merged.expire_date)) {
          failRow(id, 'date_order_invalid', `记录 ${id} 续保后起期晚于止期`);
          continue;
        }
        plans.push({ id, merged });
      }
      if (rowErrors.length === 0) {
        // 批内冲突（计划间同 key active）+ 外部存量冲突（excludeId=自身）
        const batchKeys = new Map(); // `${employee_id}|${insurance_type}` -> id
        for (const p of plans) {
          const m = p.merged;
          if (!isPolicyActiveOnBusinessDay({ isCurrent: m.is_current, startDate: m.start_date, expireDate: m.expire_date })) continue;
          const key = `${m.employee_id}|${m.insurance_type}`;
          if (batchKeys.has(key)) {
            failRow(p.id, 'duplicate_active_policy_in_batch', `记录 ${p.id} 续保后与记录 ${batchKeys.get(key)} 形成同一员工同险种并行当前有效保单`);
            continue;
          }
          batchKeys.set(key, p.id);
          const conflict = findActivePolicyConflictInMemory(
            { employeeId: m.employee_id, insuranceType: m.insurance_type, excludeId: p.id },
            { records: memoryStores.personnel, businessDay }
          );
          if (conflict.error) { failRow(p.id, 'duplicate_check_failed', '重复保单检查失败，请稍后重试'); continue; }
          if (conflict.conflict) { failRow(p.id, 'duplicate_active_policy', `记录 ${p.id} 续保后撞上该员工当前有效${m.insurance_type}（保单ID ${conflict.conflict.id}）`); continue; }
        }
      }
      if (rowErrors.length > 0) {
        return res.json(success({ requested, renewed: 0, failed: rowErrors.length, rowErrors }, '续保校验未通过，未执行任何变更（内存模式）'));
      }
      // 全部通过 → 一次性应用
      for (const p of plans) {
        Object.assign(p.merged, { updated_at: new Date().toISOString() });
        const target = memoryStores.personnel.find((x) => x.id === p.id && !x.is_deleted);
        Object.assign(target, p.merged);
      }
      return res.json(success({ requested, renewed: plans.length, failed: 0, rowErrors }, `成功续保${plans.length}条记录(内存模式)`));
    }

    // ---------- DB 模式：事务 + 先读后合并 + 全校验后写入 ----------
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // 1) 读取全部目标现有完整事实（FOR UPDATE 锁定，确保合并依据在本事务中稳定）
      const selR = await client.query('SELECT * FROM personnel_insurance WHERE id = ANY($1::bigint[]) AND is_deleted = false FOR UPDATE', [ids]);
      const byId = new Map(selR.rows.map((r) => [Number(r.id), r]));
      const plans = [];
      for (const id of ids) {
        const existing = byId.get(Number(id));
        if (!existing) { failRow(id, 'target_not_found', `记录 ${id} 不存在`); continue; }
        const merged = { ...existing };
        if (policyStartDate) merged.start_date = policyStartDate;
        merged.expire_date = policyEndDate;
        if (premium !== undefined && premium !== null) merged.premium = premium;
        if (remark !== undefined && remark !== null) merged.remark = remark;
        if (merged.start_date && String(merged.start_date) > String(merged.expire_date)) {
          failRow(id, 'date_order_invalid', `记录 ${id} 续保后起期晚于止期`);
          continue;
        }
        plans.push({ id: Number(id), merged });
      }
      // 2) 批内 + 外部冲突（全部校验通过前不写任何行）
      if (rowErrors.length === 0) {
        const batchKeys = new Map();
        for (const p of plans) {
          const m = p.merged;
          if (!isPolicyActiveOnBusinessDay({ isCurrent: m.is_current, startDate: m.start_date, expireDate: m.expire_date })) continue;
          const key = `${m.employee_id}|${m.insurance_type}`;
          if (batchKeys.has(key)) {
            failRow(p.id, 'duplicate_active_policy_in_batch', `记录 ${p.id} 续保后与记录 ${batchKeys.get(key)} 形成同一员工同险种并行当前有效保单`);
            continue;
          }
          batchKeys.set(key, p.id);
          const conflict = await findActivePolicyConflict(
            { employeeId: m.employee_id, insuranceType: m.insurance_type, excludeId: p.id },
            { db: client }
          );
          if (conflict.error) { failRow(p.id, 'duplicate_check_failed', '重复保单检查失败，请稍后重试'); continue; }
          if (conflict.conflict) { failRow(p.id, 'duplicate_active_policy', `记录 ${p.id} 续保后撞上该员工当前有效${m.insurance_type}（保单ID ${conflict.conflict.id}）`); continue; }
        }
      }
      if (rowErrors.length > 0) {
        await client.query('ROLLBACK');
        return res.json(success({ requested, renewed: 0, failed: rowErrors.length, rowErrors }, '续保校验未通过，未执行任何变更'));
      }
      // 3) 全部通过 → 事务内写入；每条 UPDATE 必须 rowCount===1（任务3，提示词11）：
      //    目标 0 行/异常 → 抛入统一 catch → ROLLBACK + 安全失败响应，不得 COMMIT 或虚报成功
      for (const p of plans) {
        const upd = await client.query(
          `UPDATE personnel_insurance SET start_date=$2, expire_date=$3, premium=$4, remark=$5, updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND is_deleted=false`,
          [p.id, p.merged.start_date || null, p.merged.expire_date, p.merged.premium != null ? p.merged.premium : 0, p.merged.remark != null ? p.merged.remark : '']
        );
        if (!upd || upd.rowCount !== 1) {
          const err = new Error(`批量续保目标 ${p.id} 更新 0 行（记录可能已被删除或变更），事务回滚`);
          err.code = 'RENEWAL_ROWCOUNT_ZERO';
          throw err;
        }
      }
      await client.query('COMMIT');
      // 只有全部 UPDATE 明确成功且 COMMIT 成功后 renewed 才等于实际成功条数
      res.json(success({ requested, renewed: plans.length, failed: 0, rowErrors }, `成功续保${plans.length}条记录`));
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch (e2) { /* 回滚失败仅日志 */ }
      // 内部错误不泄漏 e.message
      logger.error('[Insurance] 批量续保失败（内部错误不向前端泄漏）:', { message: e && e.message, stack: e && e.stack });
      res.json(error(-1, '续保失败，请稍后重试'));
    } finally {
      client.release();
    }
  } catch (err) { res.json(error(-1, '续保失败，请稍后重试')); }
});

// POST /personnel/batch-delete — 批量删除
router.post('/personnel/batch-delete', requireRole('admin', 'safety_manager'), validateBody(batchDeleteSchema), async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.json(error(-1, '请选择要删除的记录'));
    }
    let deletedCount = 0;
    if (isConnected()) {
      const r = await pool.query(
        'UPDATE personnel_insurance SET is_deleted=true, updated_at=CURRENT_TIMESTAMP WHERE id = ANY($1::bigint[]) AND is_deleted=false RETURNING id',
        [ids]
      );
      deletedCount = r.rows.length;
    } else {
      for (const id of ids) {
        const r = memoryStores.personnel.find(r => r.id === parseInt(id) && !r.is_deleted);
        if (r) { r.is_deleted = true; deletedCount++; }
      }
    }
    res.json(success({ deleted: deletedCount }, `成功删除${deletedCount}条记录`));
  } catch (err) { res.json(error(-1, { message: err.message, stack: err.stack })); }
});

// POST /personnel/import — 人员保险直接导入（任务5，提示词08）
// 顶层校验保留（body 对象、records 非空数组、最大行数）；逐行 personnelImportRowSchema.safeParse，
// 结构错误转该行 rowErrors（不整批 400），合法行继续处理。共享 employeeResolver 解析 employee.id；
// 险种经字典规范化（工伤险->工伤保险；意外伤害险/五险/未知 -> unsupported 拒绝）；
// 重复当前保单检查与保单号无关且查询异常 fail-closed；内部错误不向前端泄漏 e.message。
router.post('/personnel/import', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    const body = req.body || {};
    if (typeof body !== 'object' || Array.isArray(body) || !Array.isArray(body.records) || body.records.length === 0) {
      return res.json(error(-1, '导入数据不能为空'));
    }
    const records = body.records;
    const MAX_ROWS = 5000;
    if (records.length > MAX_ROWS) {
      return res.json(error(-1, `单次导入行数超过上限 ${MAX_ROWS}`));
    }
    let successCount = 0;
    let failCount = 0;
    const errors = [];
    const rowErrors = [];

    for (let i = 0; i < records.length; i++) {
      const rowNo = i + 1;
      const raw = records[i];
      const fail = (reason, message, extra = {}) => {
        failCount++;
        errors.push(`第${rowNo}行: ${message}`);
        rowErrors.push({
          row: rowNo, reason, message,
          employeeId: (raw && raw.employeeId != null) ? raw.employeeId : null,
          employeeCode: (raw && raw.employeeCode) ? raw.employeeCode : null,
          ...extra,
        });
      };
      // 逐行结构校验：结构错误只影响该行，不整批 400
      const parsed = personnelImportRowSchema.safeParse(raw);
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        const reason = (first && first.path && first.path[0] === 'employeeId' && /缺少人员ID或工号/.test(first.message))
          ? 'missing_employee_id' : 'invalid_row_schema';
        fail(reason, (first && first.message) || '行数据校验失败', { schemaError: true });
        continue;
      }
      const r = parsed.data;
      // 日期起止顺序：start > expire → 无效
      if (r.startDate && r.expireDate && String(r.startDate) > String(r.expireDate)) {
        fail('date_order_invalid', '起期不能晚于止期');
        continue;
      }
      // 险种规范化（任务4）：工伤险->工伤保险；意外伤害险/五险/未知 -> unsupported（阻止写库）
      const canonicalType = normalizeInsuranceType(r.insuranceType);
      if (!canonicalType) {
        fail('unsupported_insurance_type', `不支持的险种: ${r.insuranceType}（人员保险仅支持 雇主责任险/工伤保险）`);
        continue;
      }
      if (isConnected()) {
        // 共享人员解析（任务2）：单条创建/直接导入/通用导入复用同一生产解析器
        const resolved = await resolveEmployee({ employeeId: r.employeeId, employeeCode: r.employeeCode });
        if (!resolved.employee) {
          const reason = resolved.reason || 'employee_not_found';
          const msg = reason === 'missing_employee_id' ? '缺少人员ID或工号'
            : reason === 'employee_multiple_candidates' ? '工号对应多个人员，无法唯一匹配'
            : reason === 'id_code_conflict' ? '员工ID与工号指向不同人员，拒绝导入'
            : reason === 'lookup_failed' ? '人员查询失败，请稍后重试'
            : '人员不存在或已离职';
          fail(reason, msg);
          continue;
        }
        const emp = resolved.employee;
        // 姓名附加一致性校验：客户端提供姓名且与主数据不一致 → 失败（姓名不能单独命中/猜测）
        if (r.personName && emp.name && String(r.personName).trim() !== String(emp.name).trim()) {
          fail('name_mismatch', `姓名与人员主数据不一致（${r.personName} vs ${emp.name}）`);
          continue;
        }
        // 任务9：直接导入复用共享当前有效冲突服务（与单条创建/更新/通用导入/规则生成同一规则）
        // 任务1（提示词10）：仅当最终事实在业务日 active 时才查冲突（未来保单不被已有 active 误拦）
        if (isPolicyActiveOnBusinessDay({ isCurrent: r.isCurrent, startDate: r.startDate, expireDate: r.expireDate })) {
          const conflict = await findActivePolicyConflict({ employeeId: emp.employee_id, insuranceType: canonicalType });
          if (conflict.error) {
            fail('duplicate_check_failed', '重复保单检查失败，请稍后重试');
            continue;
          }
          if (conflict.conflict) {
            fail('duplicate_active_policy', `该员工已存在当前有效${canonicalType}（保单ID ${conflict.conflict.id}）`);
            continue;
          }
        }
        try {
          await pool.query(`
            INSERT INTO personnel_insurance (employee_id, personnel_id, person_name, department, position, insurance_type, coverage_amount, premium, start_date, expire_date, is_current, policy_no, remark)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
          `, [emp.employee_id, emp.employee_id, emp.name, emp.org_name || '', emp.position_name || '', canonicalType, r.coverageAmount || 0, r.premium || 0, r.startDate || null, r.expireDate || null, r.isCurrent, r.policyNo || '', r.remark || '']);
        } catch (e) {
          // 任务8：内部数据库错误不得把 e.message 返回前端；仅服务端日志 + 稳定 reason
          logger.error('[Insurance] 直接导入 INSERT 失败（内部错误不向前端泄漏）:', { message: e && e.message, stack: e && e.stack });
          fail('internal_error', '写入失败，请稍后重试');
          continue;
        }
      } else {
        // 内存模式：employeeId 必须存在（无主数据时不按姓名猜测）
        if (r.employeeId == null) {
          fail('missing_employee_id', '内存模式缺少 employeeId');
          continue;
        }
        // 任务2（提示词10）：内存分支复用规范险种 + 统一 active 判定 + findActivePolicyConflictInMemory。
        // 每行 active 写入后立即 push，后续同 employee/type 的 active 行会被内存检查发现（批内可见）。
        // 未来保单不被既有 active 误拦（active 判定由唯一纯函数负责）。
        if (isPolicyActiveOnBusinessDay({ isCurrent: r.isCurrent, startDate: r.startDate, expireDate: r.expireDate })) {
          const conflict = findActivePolicyConflictInMemory(
            { employeeId: r.employeeId, insuranceType: canonicalType },
            { records: memoryStores.personnel, businessDay: toBusinessDayStr() }
          );
          if (conflict.error) {
            fail('duplicate_check_failed', '重复保单检查失败，请稍后重试');
            continue;
          }
          if (conflict.conflict) {
            fail('duplicate_active_policy', `该员工已存在当前有效${canonicalType}（保单ID ${conflict.conflict.id}）`);
            continue;
          }
        }
        memoryStores.personnel.push({ id: memoryCounters.personnel++, employee_id: r.employeeId, personnel_id: r.employeeId, person_name: r.personName || '', insurance_type: canonicalType, coverage_amount: r.coverageAmount || 0, premium: r.premium || 0, start_date: r.startDate || null, expire_date: r.expireDate || null, is_current: r.isCurrent, policy_no: r.policyNo || '', remark: r.remark || '', is_deleted: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      }
      successCount++;
    }
    res.json(success({ total: records.length, success: successCount, failed: failCount, errors, rowErrors }, '导入完成'));
  } catch (err) { res.json(error(-1, { message: err.message, stack: err.stack })); }
});

// GET /personnel/export — 导出人员保险数据（CSV，UTF-8 BOM）
// R2（提示词-140/P0-2）：补齐鉴权并脱敏身份证号，与 overage/export 一致
router.get('/personnel/export', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    let data = [];
    if (isConnected()) {
      const r = await pool.query('SELECT * FROM personnel_insurance WHERE is_deleted = false ORDER BY id ASC');
      data = r.rows.map(formatPersonnelIns);
    } else {
      data = memoryStores.personnel.filter(r => !r.is_deleted).map(formatPersonnelIns);
    }
    const headers = ['ID', '姓名', '身份证号', '部门', '岗位', '保险类型', '保单号', '生效日期', '到期日期', '保费', '保险状态', '时效状态', '备注'];
    const statusMap = { insured: '已参保', expired: '已过期', expiring: '即将到期', uninsured: '未参保' };
    const expiryMap = { normal: '正常', expiring: '临期', expired: '过期', unknown: '未知' };
    const rows = data.map(r => [
      r.id || '',
      (r.name || '').replace(/"/g, '""'),
      maskIdCard(r.idCard).replace(/"/g, '""'),
      (r.department || '').replace(/"/g, '""'),
      (r.position || '').replace(/"/g, '""'),
      (r.insuranceType || '').replace(/"/g, '""'),
      (r.policyNumber || '').replace(/"/g, '""'),
      r.policyStartDate || '',
      r.policyEndDate || '',
      r.premium || 0,
      statusMap[r.insuranceStatus] || r.insuranceStatus || '',
      expiryMap[r.expiryStatus] || r.expiryStatus || '',
      (r.remark || '').replace(/"/g, '""'),
    ].map(v => `"${v}"`).join(','));
    const csv = '\uFEFF' + headers.map(h => `"${h}"`).join(',') + '\n' + rows.join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="personnel_insurance_${new Date().toISOString().slice(0, 10)}.csv"`);
    return res.send(csv);
  } catch (err) { res.json(error(-1, { message: err.message, stack: err.stack })); }
});

// GET /personnel/unmatched — 未匹配保险记录（任务5，只读；注册于 /personnel/:id 之前）
// 返回分页明细 + 按原因统计。不返回身份证号/文件路径/内部异常。
// 原因枚举：missing_employee_id（employee_id 为空）| employee_not_found（指向不存在/非当前人员）
router.get('/personnel/unmatched', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    const { page = 1, pageSize = 20 } = req.query;
    const off = (parseInt(page) - 1) * parseInt(pageSize);
    const limit = Math.min(Math.max(parseInt(pageSize) || 20, 1), 200);

    if (!isConnected()) {
      // 内存模式：employee_id 缺失的记录进入未匹配（有 employee_id 视为有效，无法校验存在性）
      const all = memoryStores.personnel.filter((r) => !r.is_deleted && (r.employee_id == null || r.employee_id === ''));
      const list = all
        .slice(off, off + limit)
        .map((r) => ({ id: r.id, employeeId: null, personName: r.person_name || '', insuranceType: r.insurance_type || '', policyNo: r.policy_no || '', reason: 'missing_employee_id' }));
      const byReason = { missing_employee_id: all.length, employee_not_found: 0 };
      return res.json(success({ list, total: all.length, page: parseInt(page), pageSize: limit, byReason }, '查询成功(内存模式)'));
    }

    const baseFrom = `
      FROM personnel_insurance p
      LEFT JOIN v_employee_current ev ON ev.employee_id = p.employee_id
      WHERE p.is_deleted = false
        AND (p.employee_id IS NULL OR ev.employee_id IS NULL)`;
    const countR = await pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE p.employee_id IS NULL)::int AS missing_cnt,
              COUNT(*) FILTER (WHERE p.employee_id IS NOT NULL)::int AS not_found_cnt
       ${baseFrom}`
    );
    const total = countR.rows[0].total;
    const result = await pool.query(
      `SELECT p.id, p.employee_id, p.person_name, p.insurance_type, p.policy_no,
              CASE WHEN p.employee_id IS NULL THEN 'missing_employee_id' ELSE 'employee_not_found' END AS reason
       ${baseFrom}
       ORDER BY p.id ASC
       LIMIT $1 OFFSET $2`,
      [limit, off]
    );
    const list = result.rows.map((r) => ({
      id: r.id,
      employeeId: r.employee_id ?? null,
      personName: r.person_name || '',
      insuranceType: r.insurance_type || '',
      policyNo: r.policy_no || '',
      reason: r.reason,
    }));
    res.json(success({
      list,
      total,
      page: parseInt(page),
      pageSize: limit,
      byReason: { missing_employee_id: countR.rows[0].missing_cnt, employee_not_found: countR.rows[0].not_found_cnt },
    }, '查询成功'));
  } catch (err) { res.json(error(-1, { message: err.message, stack: err.stack })); }
});

const _insuranceRule = require('../config/hseRules/insurance-rule.json');
function _calcAge(birthDate) {
  if (!birthDate) return 0;
  const bd = new Date(birthDate);
  const now = new Date();
  let age = now.getFullYear() - bd.getFullYear();
  const m = now.getMonth() - bd.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < bd.getDate())) age--;
  return age;
}
function _matchInsuranceRule(person) {
  const age = person.age || _calcAge(person.birth_date);
  const gender = person.gender || '';
  const thresholds = _insuranceRule.overAgeThresholds;
  const isOverAge = (gender === '男' && age >= thresholds.male) || (gender === '女' && age >= thresholds.female);
  const rules = _insuranceRule.personnelInsurance.rules;
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const cond = rule.conditions;
    if (cond.ageGender === 'overAge' && isOverAge) return { matched: true, rule, isOverAge, age, recommendedPlan: rule.insurancePlan };
    if (cond.ageGender === 'adult' && !isOverAge) {
      if (cond.hasFiveIns === true && person.has_five_ins === true) return { matched: true, rule, isOverAge, age, recommendedPlan: rule.insurancePlan };
      if (cond.hasFiveIns === false && person.has_five_ins !== true) return { matched: true, rule, isOverAge, age, recommendedPlan: rule.insurancePlan };
    }
  }
  return { matched: false, isOverAge, age };
}

router.get('/personnel/rules/match', async (req, res) => {
  try {
    const { personnelId } = req.query;
    if (!personnelId) return res.json(error(-1, '请提供人员ID'));
    if (isConnected()) {
      try {
        // 数据源：花名册当前视图（稳定 employee_id），不再使用不存在的 employees 表
        const r = await pool.query('SELECT * FROM v_employee_current WHERE employee_id = $1', [personnelId]);
        if (r.rows.length === 0) return res.json(error(-2, '人员不存在'));
        return res.json(success(_matchInsuranceRule(r.rows[0]), '规则匹配完成'));
      } catch (e) { return res.json(success({ matched: false, note: '花名册视图暂不可用' }, '规则匹配完成')); }
    }
    return res.json(error(-1, '内存模式暂不支持'));
  } catch (err) { res.json(error(-1, { message: err.message, stack: err.stack })); }
});

router.get('/personnel/pending-list', async (req, res) => {
  try {
    const { page = 1, pageSize = 50, department, isOverAge } = req.query;
    let allPersons = [];
    if (isConnected()) {
      try {
        // C8（提示词-143）：排除已在人员保险中生成的在职工（按 employee_id 关联，不再按姓名）
        // 数据源：花名册当前视图 v_employee_current
        const empR = await pool.query(`
          SELECT e.employee_id AS id, e.employee_code, e.name, e.gender, e.birth_date,
                 e.org_name AS department, e.position_name AS position, e.phone, e.person_category
          FROM v_employee_current e
          WHERE e.employee_deleted = false
            AND e.name IS NOT NULL AND e.name <> ''
            AND NOT EXISTS (
              SELECT 1 FROM personnel_insurance p
              WHERE p.employee_id = e.employee_id AND p.is_deleted = false
            )
          ORDER BY e.employee_id ASC
        `);
        allPersons = empR.rows.map(p => { const m = _matchInsuranceRule(p); return { ...p, age: m.age, isOverAge: m.isOverAge, matchedRule: m.rule ? m.rule.name : '未匹配', recommendedPlan: m.recommendedPlan }; });
      } catch (e) { allPersons = []; }
    }
    let list = allPersons;
    if (department) list = list.filter(p => p.department === department);
    if (isOverAge === 'true') list = list.filter(p => p.isOverAge);
    if (isOverAge === 'false') list = list.filter(p => !p.isOverAge);
    const total = list.length;
    const start = (parseInt(page) - 1) * parseInt(pageSize);
    const summary = { total: allPersons.length, overAgeCount: allPersons.filter(p => p.isOverAge).length, fiveInsCount: allPersons.filter(p => p.has_five_ins === true).length, employerInsCount: allPersons.filter(p => !p.isOverAge && p.has_five_ins !== true).length };
    res.json(success({ list: list.slice(start, start + parseInt(pageSize)), total, page: parseInt(page), pageSize: parseInt(pageSize), summary }, '查询成功'));
  } catch (err) { res.json(error(-1, { message: err.message, stack: err.stack })); }
});

router.post('/personnel/generate-from-pending', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    const { ids, defaultStartDate, defaultExpireDate } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.json(error(-1, '请选择要生成的人员'));
    let processed = 0;
    let generated = 0; // 实际成功写入的保单记录数（不是人员数）
    const failed = [];
    const rowErrors = [];
    for (const id of ids) {
      try {
        if (!isConnected()) {
          failed.push({ row: id, reason: 'memory_mode_unsupported', message: '规则生成不支持内存模式' });
          continue;
        }
        processed++;
        // 数据源由 employees 改为花名册当前视图 v_employee_current（personnel_id 非 employee 外键）
        const empR = await pool.query('SELECT * FROM v_employee_current WHERE employee_id = $1', [id]);
        if (empR.rows.length === 0) { failed.push({ row: id, reason: 'employee_not_found', message: '人员不存在' }); continue; }
        const person = empR.rows[0];
        const match = _matchInsuranceRule(person);
        if (!match.matched) { failed.push({ row: id, reason: 'rule_not_matched', message: `人员${person.name}: 未匹配到规则` }); continue; }
        for (const rawType of (match.recommendedPlan.types || [])) {
          // 任务4/9：规则输出必须经险种字典规范化（五险→工伤保险；无法规范化拒绝写库）
          const insType = normalizeInsuranceType(rawType);
          if (!insType) { failed.push({ row: id, reason: 'unsupported_insurance_type', message: `人员${person.name}: 规则输出不支持的险种 ${rawType}，已跳过` }); continue; }
          // 任务9：复用共享当前有效冲突服务（同一员工+规范险种唯一）
          // 任务1（提示词10）：仅当生成的最终事实在业务日 active 时才查冲突（未来保单不被已有 active 误拦）
          if (isPolicyActiveOnBusinessDay({ isCurrent: true, startDate: defaultStartDate, expireDate: defaultExpireDate })) {
            const conflict = await findActivePolicyConflict({ employeeId: person.employee_id, insuranceType: insType });
            if (conflict.error) { failed.push({ row: id, reason: 'duplicate_check_failed', message: `人员${person.name}: 重复保单检查失败，请稍后重试` }); continue; }
            if (conflict.conflict) { failed.push({ row: id, reason: 'duplicate_active_policy', message: `人员${person.name}: ${insType}已存在当前保单（ID ${conflict.conflict.id}）` }); continue; }
          }
          // 写入 employee_id（代码来源即 v_employee_current.employee_id）；personnel_id 兼容保留（deprecated）
          await pool.query(`INSERT INTO personnel_insurance (employee_id, personnel_id, person_name, insurance_type, coverage_amount, start_date, expire_date, is_current, remark) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [person.employee_id, person.employee_id, person.name, insType, insType === '雇主责任险' ? (match.recommendedPlan.employerLiabilityAmount || 0) : 0, defaultStartDate || null, defaultExpireDate || null, true, `规则匹配: ${match.rule.name}`]);
          generated++; // 按实际写入的保单记录数递增
        }
      } catch (e) {
        // 任务9：内部错误不向前端泄漏 e.message；仅服务端日志 + 稳定 reason
        logger.error('[Insurance] generate-from-pending 写入失败（内部错误不泄漏）:', { message: e && e.message, stack: e && e.stack });
        failed.push({ row: id, reason: 'internal_error', message: `人员ID${id}: 写入失败，请稍后重试` });
      }
    }
    rowErrors.push(...failed);
    res.json(success({ processed, generated, failed, rowErrors }, `生成完成，成功${generated}条保单`));
  } catch (err) { res.json(error(-1, { message: err.message, stack: err.stack })); }
});

router.get('/personnel/:id', async (req, res) => {
  try {
    if (!isConnected()) {
      const r = memoryStores.personnel.find(r => r.id === parseInt(req.params.id) && !r.is_deleted);
      if (!r) return sendNotFound(res);
      return res.json(success(r, '查询成功'));
    }
    const result = await pool.query('SELECT * FROM personnel_insurance WHERE id = $1 AND is_deleted = false', [req.params.id]);
    if (result.rows.length === 0) return res.json(error(-2, '记录不存在'));
    res.json(success(formatPersonnelIns(result.rows[0]), '查询成功'));
  } catch (err) { res.json(error(-1, { message: err.message, stack: err.stack })); }
});

router.post('/personnel', requireRole('admin', 'safety_manager'), validateBody(createPersonnelSchema), async (req, res) => {
  try {
    const b = req.body;
    // 任务9：险种规范化必须先于内存/DB 分支（工伤险最终只能保存为工伤保险）
    const canonicalType = normalizeInsuranceType(b.insuranceType);
    if (!canonicalType) {
      return res.json(error(-1, `不支持的险种: ${b.insuranceType}（人员保险仅支持 雇主责任险/工伤保险）`));
    }
    if (!isConnected()) {
      // 内存模式：同一 DTO 与关联规则（employeeId 必填）；快照字段无主数据来源时留空。
      // 内存创建也复用共享冲突服务（内存等价检查），不能绕过"同员工同险种唯一当前有效"。
      // 任务1（提示词10）：仅当合并后最终事实在业务日 active 时才查 active 冲突；
      // 未来/历史/is_current=false/日期不完整的事实不被已有 active 误拦。
      if (isPolicyActiveOnBusinessDay({ isCurrent: b.isCurrent, startDate: b.startDate, expireDate: b.expireDate })) {
        const conflict = findActivePolicyConflictInMemory(
          { employeeId: b.employeeId, insuranceType: canonicalType },
          { records: memoryStores.personnel, businessDay: toBusinessDayStr() }
        );
        if (conflict.error) {
          return res.json(error(-1, '重复保单检查失败，请稍后重试'));
        }
        if (conflict.conflict) {
          return res.json(error(-1, `该员工已存在当前有效${canonicalType}`));
        }
      }
      const record = buildMemoryRecord(memoryCounters.personnel++, {
        employee_id: b.employeeId,
        personnel_id: b.employeeId,
        person_name: '',
        insurance_type: canonicalType,
        coverage_amount: b.coverageAmount || 0,
        premium: b.premium || 0,
        start_date: b.startDate || null,
        expire_date: b.expireDate || null,
        is_current: b.isCurrent, // createPersonnelSchema default(true) 保证规范 boolean
        policy_no: b.policyNo || '',
        remark: b.remark || '',
      });
      memoryStores.personnel.push(record);
      return res.json(success(record, '创建成功(内存模式)'));
    }
    // 任务1/3：employeeId 必填（schema 已保证），服务端从人员主数据解析快照；
    // 客户端不得通过姓名决定关联（旧字段已被 strict schema 拒绝）。
    const employeeId = b.employeeId;
    const resolved = await resolveEmployee({ employeeId });
    if (!resolved.employee) {
      return res.json(error(-2, resolved.reason === 'missing_employee_id' ? '缺少人员ID' : '人员不存在或已离职'));
    }
    const emp = resolved.employee;
    // 任务9：单条创建复用共享冲突服务（同员工+规范险种当前有效唯一）
    // 任务1（提示词10）：仅当最终事实在业务日 active 时才查冲突（未来保单不被已有 active 误拦）
    if (isPolicyActiveOnBusinessDay({ isCurrent: b.isCurrent, startDate: b.startDate, expireDate: b.expireDate })) {
      const conflict = await findActivePolicyConflict({ employeeId, insuranceType: canonicalType });
      if (conflict.error) {
        return res.json(error(-1, '重复保单检查失败，请稍后重试'));
      }
      if (conflict.conflict) {
        return res.json(error(-1, `该员工已存在当前有效${canonicalType}（保单ID ${conflict.conflict.id}）`));
      }
    }
    const result = await pool.query(`
      INSERT INTO personnel_insurance (employee_id, personnel_id, person_name, department, position, insurance_type, coverage_amount, premium, start_date, expire_date, is_current, policy_no, remark)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *
    `, [employeeId, employeeId, emp.name, emp.org_name || '', emp.position_name || '', canonicalType, b.coverageAmount ?? 0, b.premium ?? 0, b.startDate || null, b.expireDate || null, b.isCurrent, b.policyNo || '', b.remark || '']);
    res.json(success(formatPersonnelIns(result.rows[0]), '创建成功'));
  } catch (err) { res.json(error(-1, { message: err.message, stack: err.stack })); }
});

router.put('/personnel/:id', requireRole('admin', 'safety_manager'), validateBody(updatePersonnelSchema), async (req, res) => {
  try {
    const b = req.body;
    // 险种规范化（任务9：先于内存/DB 分支）
    let canonicalType = null;
    if (b.insuranceType !== undefined) {
      canonicalType = normalizeInsuranceType(b.insuranceType);
      if (!canonicalType) return res.json(error(-1, `不支持的险种: ${b.insuranceType}`));
    }
    if (!isConnected()) {
      const idx = memoryStores.personnel.findIndex(r => r.id === parseInt(req.params.id) && !r.is_deleted);
      if (idx === -1) return res.json(error(-2, '记录不存在'));
      const cur = memoryStores.personnel[idx];
      // 任务9：内存更新复用共享冲突服务——先合并"更新后完整事实"再检查（excludeId=自身）
      const merged = { ...cur };
      if (b.employeeId != null) { merged.employee_id = b.employeeId; merged.personnel_id = b.employeeId; }
      if (canonicalType !== null) merged.insurance_type = canonicalType;
      if (b.coverageAmount !== undefined) merged.coverage_amount = b.coverageAmount;
      if (b.premium !== undefined) merged.premium = b.premium;
      if (b.startDate !== undefined) merged.start_date = b.startDate;
      if (b.expireDate !== undefined) merged.expire_date = b.expireDate;
      if (b.isCurrent !== undefined) merged.is_current = b.isCurrent;
      if (b.policyNo !== undefined) merged.policy_no = b.policyNo;
      if (b.remark !== undefined) merged.remark = b.remark;
      // 任务1（提示词10）：统一 active 语义——仅当合并后完整事实在业务日 active 时才查冲突
      if (isPolicyActiveOnBusinessDay(merged)) {
        const conflict = findActivePolicyConflictInMemory(
          { employeeId: merged.employee_id, insuranceType: merged.insurance_type, excludeId: cur.id },
          { records: memoryStores.personnel, businessDay: toBusinessDayStr() }
        );
        if (conflict.error) return res.json(error(-1, '重复保单检查失败，请稍后重试'));
        if (conflict.conflict) return res.json(error(-1, `该员工已存在当前有效${merged.insurance_type}（保单ID ${conflict.conflict.id}）`));
      }
      Object.assign(cur, merged, { updated_at: new Date().toISOString() });
      return res.json(success(cur, '更新成功(内存模式)'));
    }
    // 任务1/3：camelCase → snake_case；默认不修改关联键与快照；
    // 显式合法 employeeId 才允许换人，且 person_name/department/position
    // 全部来自同一员工主数据行（修复姓名被写成员工数字 ID 的问题）。
    // 任务9：先读取现有行 → 合并"更新后完整事实" → 用 excludeId=当前ID 检查冲突（禁止仅检查请求局部字段）。
    const existingR = await pool.query('SELECT * FROM personnel_insurance WHERE id = $1 AND is_deleted = false', [req.params.id]);
    if (existingR.rows.length === 0) return res.json(error(-2, '记录不存在'));
    const existing = existingR.rows[0];
    let employeeId = existing.employee_id != null ? existing.employee_id : null;
    if (b.employeeId != null) {
      const resolved = await resolveEmployee({ employeeId: b.employeeId });
      if (!resolved.employee) {
        return res.json(error(-2, '关联人员不存在或已离职'));
      }
      employeeId = b.employeeId;
    }
    const mergedType = canonicalType !== null ? canonicalType : existing.insurance_type;
    const mergedStart = b.startDate || existing.start_date;
    const mergedExpire = b.expireDate || existing.expire_date;
    const mergedIsCurrent = b.isCurrent !== undefined ? b.isCurrent : existing.is_current;
    // 任务1（提示词10）：统一 active 判定——由唯一生产纯函数决定是否查冲突（excludeId=自身），
    // 不再手写 wouldBeActive；未来/历史/is_current=false/日期不完整不被已有 active 误拦。
    if (isPolicyActiveOnBusinessDay({ isCurrent: mergedIsCurrent, startDate: mergedStart, expireDate: mergedExpire }) && employeeId != null && mergedType) {
      const conflict = await findActivePolicyConflict({ employeeId, insuranceType: mergedType, excludeId: req.params.id });
      if (conflict.error) return res.json(error(-1, '重复保单检查失败，请稍后重试'));
      if (conflict.conflict) return res.json(error(-1, `该员工已存在当前有效${mergedType}（保单ID ${conflict.conflict.id}）`));
    }
    let setSql = `
      insurance_type=COALESCE($2,insurance_type), coverage_amount=COALESCE($3,coverage_amount),
      premium=COALESCE($4,premium), start_date=COALESCE($5,start_date), expire_date=COALESCE($6,expire_date),
      is_current=COALESCE($7,is_current), policy_no=COALESCE($8,policy_no),
      remark=COALESCE($9,remark), updated_at=CURRENT_TIMESTAMP`;
    let params = [req.params.id, canonicalType !== null ? canonicalType : null, b.coverageAmount, b.premium, b.startDate || null, b.expireDate || null, b.isCurrent, b.policyNo || '', b.remark || ''];

    if (b.employeeId != null) {
      const resolved = await resolveEmployee({ employeeId: b.employeeId });
      const emp = resolved.employee;
      setSql = `employee_id=$10, personnel_id=$10, person_name=$11, department=$12, position=$13, ` + setSql;
      params = [...params, b.employeeId, emp.name, emp.org_name || '', emp.position_name || ''];
    }

    const result = await pool.query(
      `UPDATE personnel_insurance SET ${setSql} WHERE id=$1 AND is_deleted=false RETURNING *`,
      params
    );
    if (result.rows.length === 0) return res.json(error(-2, '记录不存在'));
    res.json(success(formatPersonnelIns(result.rows[0]), '更新成功'));
  } catch (err) { res.json(error(-1, { message: err.message, stack: err.stack })); }
});

router.delete('/personnel/:id', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) {
      const r = memoryStores.personnel.find(r => r.id === parseInt(req.params.id) && !r.is_deleted);
      if (!r) return res.json(error(-2, '记录不存在'));
      r.is_deleted = true;
      return res.json(success(null, '删除成功(内存模式)'));
    }
    const result = await pool.query('UPDATE personnel_insurance SET is_deleted=true, updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND is_deleted=false RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.json(error(-2, '记录不存在'));
    res.json(success(null, '删除成功'));
  } catch (err) { res.json(error(-1, { message: err.message, stack: err.stack })); }
});

// ================================================================
//  /overage — 超龄人员
// ================================================================

function formatOverage(row) {
  const expireDate = row.expire_date ? toDateStr(row.expire_date) : null;
  return {
    id: row.id,
    personnel_id: row.personnel_id || null,
    name: row.name || '',
    id_card: row.id_card || '',
    gender: row.gender || '',
    birth_date: row.birth_date ? toDateStr(row.birth_date) : null,
    age: row.age || 0,
    dept: row.dept || '',
    position: row.position || '',
    hire_date: row.hire_date ? toDateStr(row.hire_date) : null,
    person_type: row.person_type || '',
    control_type: row.control_type || '',
    is_to_optimize: row.is_to_optimize || false,
    actual_insurance: row.actual_insurance || '',
    has_injury: row.has_injury || false,
    has_employer: row.has_employer || false,
    compliance: row.compliance || '',
    expire_date: expireDate,
    expiryStatus: calcExpiryStatus(expireDate),
    optimize_status: row.optimize_status || '待处理',
    optimize_date: row.optimize_date ? toDateStr(row.optimize_date) : null,
    optimize_remark: row.optimize_remark || '',
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

router.get('/overage', requireRole('admin', 'safety_manager'), decryptMiddleware('id_card'), async (req, res) => {
  try {
    if (!isConnected()) {
      let data = memoryStores.overage.filter(r => !r.is_deleted);
      const { page = 1, pageSize = 20, keyword } = req.query;
      if (keyword) {
        const kw = keyword.toLowerCase();
        data = data.filter(r => (r.name && r.name.toLowerCase().includes(kw)));
      }
      const { list, total } = paginateMemory(data, page, pageSize);
      return buildListResponse(res, list, total, page, pageSize, '查询成功(内存模式)');
    }

    let whereSql = ' WHERE is_deleted = false';
    const params = [];
    let paramIdx = 0;
    const { page = 1, pageSize = 20, keyword } = req.query;
    if (keyword) {
      paramIdx++;
      whereSql += ` AND (name ILIKE $${paramIdx} OR id_card ILIKE $${paramIdx})`;
      params.push(`%${keyword}%`);
    }

    const countR = await pool.query(`SELECT COUNT(*)::int AS total FROM over_age_personnel${whereSql}`, params);
    const total = countR.rows[0].total;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    paramIdx++;
    const lp = paramIdx; params.push(parseInt(pageSize));
    paramIdx++;
    const op = paramIdx; params.push(offset);

    const result = await pool.query(`SELECT * FROM over_age_personnel${whereSql} ORDER BY id ASC LIMIT $${lp} OFFSET $${op}`, params);
    res.json(success({ list: result.rows.map(formatOverage), total, page: parseInt(page), pageSize: parseInt(pageSize) }, '查询成功'));
  } catch (err) { res.json(error(-1, { message: err.message, stack: err.stack })); }
});

// GET /overage/export — 导出超龄人员清单（CSV，UTF-8 BOM）
// 注意: 必须注册在 /overage/:id 之前，否则 :id 会遮蔽 export 路径
router.get('/overage/export', requireRole('admin', 'safety_manager'), decryptMiddleware('id_card'), async (req, res) => {
  try {
    let data = [];
    if (isConnected()) {
      const r = await pool.query('SELECT * FROM over_age_personnel WHERE is_deleted = false ORDER BY id ASC');
      // id_card 在库中可能为密文，手动解密（res.send 绕过 res.json 拦截器）
      data = decryptResult(r.rows, ['id_card']).map(formatOverage);
    } else {
      data = memoryStores.overage.filter(r => !r.is_deleted).map(formatOverage);
    }
    const headers = ['ID', '姓名', '身份证号', '性别', '出生日期', '年龄', '部门', '岗位', '入职日期', '人员类型', '管控类型', '实际保险', '工伤险', '雇主险', '合规情况', '到期日期', '时效状态', '优化状态', '优化日期', '优化备注'];
    const expiryMap = { normal: '正常', expiring: '临期', expired: '过期', unknown: '未知' };
    const rows = data.map(r => [
      r.id || '',
      (r.name || '').replace(/"/g, '""'),
      // R2（提示词-132）：身份证号脱敏，保留前4后4
      maskIdCard(r.id_card).replace(/"/g, '""'),
      r.gender || '',
      r.birth_date || '',
      r.age || 0,
      (r.dept || '').replace(/"/g, '""'),
      (r.position || '').replace(/"/g, '""'),
      r.hire_date || '',
      r.person_type || '',
      (r.control_type || '').replace(/"/g, '""'),
      (r.actual_insurance || '').replace(/"/g, '""'),
      r.has_injury ? '有' : '无',
      r.has_employer ? '有' : '无',
      (r.compliance || '').replace(/"/g, '""'),
      r.expire_date || '',
      expiryMap[r.expiryStatus] || r.expiryStatus || '',
      r.optimize_status || '',
      r.optimize_date || '',
      (r.optimize_remark || '').replace(/"/g, '""'),
    ].map(v => `"${v}"`).join(','));
    const csv = '\uFEFF' + headers.map(h => `"${h}"`).join(',') + '\n' + rows.join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="over_age_personnel_${new Date().toISOString().slice(0, 10)}.csv"`);
    return res.send(csv);
  } catch (err) { res.json(error(-1, { message: err.message, stack: err.stack })); }
});

router.get('/overage/:id', requireRole('admin', 'safety_manager'), decryptMiddleware('id_card'), async (req, res) => {
  try {
    if (!isConnected()) {
      const r = memoryStores.overage.find(r => r.id === parseInt(req.params.id) && !r.is_deleted);
      if (!r) return sendNotFound(res);
      return res.json(success(r, '查询成功'));
    }
    const result = await pool.query('SELECT * FROM over_age_personnel WHERE id = $1 AND is_deleted = false', [req.params.id]);
    if (result.rows.length === 0) return res.json(error(-2, '记录不存在'));
    res.json(success(formatOverage(result.rows[0]), '查询成功'));
  } catch (err) { res.json(error(-1, { message: err.message, stack: err.stack })); }
});

router.post('/overage', requireRole('admin', 'safety_manager'), validateBody(createOverageSchema), async (req, res) => {
  try {
    if (!isConnected()) {
      const record = buildMemoryRecord(memoryCounters.overage++, req.body);
      memoryStores.overage.push(record);
      return res.json(success(record, '创建成功(内存模式)'));
    }
    const b = req.body;
    const result = await pool.query(`
      INSERT INTO over_age_personnel (personnel_id, name, id_card, gender, birth_date, age, dept, position, hire_date, person_type, control_type, is_to_optimize, actual_insurance, has_injury, has_employer, compliance, expire_date, optimize_status, optimize_date, optimize_remark)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *
    `, [b.personnel_id || null, b.name || '', b.id_card || '', b.gender || '', b.birth_date || null, b.age || 0, b.dept || '', b.position || '', b.hire_date || null, b.person_type || '', b.control_type || '', b.is_to_optimize || false, b.actual_insurance || '', b.has_injury || false, b.has_employer || false, b.compliance || '', b.expire_date || null, b.optimize_status || '待处理', b.optimize_date || null, b.optimize_remark || '']);
    res.json(success(formatOverage(result.rows[0]), '创建成功'));
  } catch (err) { res.json(error(-1, { message: err.message, stack: err.stack })); }
});

router.put('/overage/:id', requireRole('admin', 'safety_manager'), validateBody(updateOverageSchema), async (req, res) => {
  try {
    if (!isConnected()) {
      const idx = memoryStores.overage.findIndex(r => r.id === parseInt(req.params.id) && !r.is_deleted);
      if (idx === -1) return res.json(error(-2, '记录不存在'));
      Object.assign(memoryStores.overage[idx], req.body, { updated_at: new Date().toISOString() });
      return res.json(success(memoryStores.overage[idx], '更新成功(内存模式)'));
    }
    const b = req.body;
    const result = await pool.query(`
      UPDATE over_age_personnel SET personnel_id=COALESCE($1,personnel_id), name=COALESCE($2,name),
        id_card=COALESCE($3,id_card), gender=COALESCE($4,gender), birth_date=COALESCE($5,birth_date),
        age=COALESCE($6,age), dept=COALESCE($7,dept), position=COALESCE($8,position),
        hire_date=COALESCE($9,hire_date), person_type=COALESCE($10,person_type),
        control_type=COALESCE($11,control_type), is_to_optimize=COALESCE($12,is_to_optimize),
        actual_insurance=COALESCE($13,actual_insurance), has_injury=COALESCE($14,has_injury),
        has_employer=COALESCE($15,has_employer), compliance=COALESCE($16,compliance),
        expire_date=COALESCE($17,expire_date), optimize_status=COALESCE($18,optimize_status),
        optimize_date=COALESCE($19,optimize_date), optimize_remark=COALESCE($20,optimize_remark),
        updated_at=CURRENT_TIMESTAMP
      WHERE id=$21 AND is_deleted=false RETURNING *
    `, [b.personnel_id, b.name, b.id_card, b.gender, b.birth_date, b.age, b.dept, b.position, b.hire_date, b.person_type, b.control_type, b.is_to_optimize, b.actual_insurance, b.has_injury, b.has_employer, b.compliance, b.expire_date, b.optimize_status, b.optimize_date, b.optimize_remark, req.params.id]);
    if (result.rows.length === 0) return res.json(error(-2, '记录不存在'));
    res.json(success(formatOverage(result.rows[0]), '更新成功'));
  } catch (err) { res.json(error(-1, { message: err.message, stack: err.stack })); }
});

router.delete('/overage/:id', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) {
      const r = memoryStores.overage.find(r => r.id === parseInt(req.params.id) && !r.is_deleted);
      if (!r) return res.json(error(-2, '记录不存在'));
      r.is_deleted = true;
      return res.json(success(null, '删除成功(内存模式)'));
    }
    const result = await pool.query('UPDATE over_age_personnel SET is_deleted=true, updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND is_deleted=false RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.json(error(-2, '记录不存在'));
    res.json(success(null, '删除成功'));
  } catch (err) { res.json(error(-1, { message: err.message, stack: err.stack })); }
});

// ================================================================
//  通用附件管理（vehicle/personnel/overage 共用）
//  路由: /:bizType/:id/attachments, /:bizType/:id/versions
// ============================================================
const VALID_BIZ_TYPES = ['vehicle', 'personnel', 'overage', 'other'];

// GET /:bizType/:id/attachments — 附件列表
router.get('/:bizType/:id/attachments', async (req, res, next) => {
  try {
    const { bizType, id } = req.params;
    if (!VALID_BIZ_TYPES.includes(bizType)) return res.json(error(-1, '无效的业务类型'));

    if (!isConnected()) {
      let data = memoryAttachments.filter(a => a.biz_type === bizType && a.biz_id === parseInt(id) && !a.is_deleted);
      return res.json(success(data.map(camelKeys), '查询成功(内存模式)'));
    }

    await ensureAttachmentTables();
    const result = await pool.query(
      'SELECT * FROM insurance_attachments WHERE biz_type = $1 AND biz_id = $2 AND is_deleted = FALSE ORDER BY is_latest DESC, created_at DESC',
      [bizType, id]
    );
    res.json(success(result.rows.map(camelKeys), '查询成功'));
  } catch (err) { next(err); }
});

// POST /:bizType/:id/attachments — 上传附件
router.post('/:bizType/:id/attachments', uploadDocument.single('file'), async (req, res, next) => {
  try {
    const { bizType, id } = req.params;
    if (!VALID_BIZ_TYPES.includes(bizType)) return res.json(error(-1, '无效的业务类型'));
    if (!req.file) return res.json(error(-1, '请上传文件'));

    const { version = '1.0', uploaded_by = 'admin' } = req.body;
    const fileUrl = getFileUrl(req, req.file.filename, 'documents');
    const originalName = fixFilenameEncoding(req.file.originalname);

    if (!isConnected()) {
      memoryAttachments.forEach(a => {
        if (a.biz_type === bizType && a.biz_id === parseInt(id) && a.is_latest) a.is_latest = false;
      });
      const record = buildMemoryRecord(memoryAttachmentIdCounter++, {
        biz_type: bizType,
        biz_id: parseInt(id),
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
      memoryVersions.push(buildMemoryRecord(memoryVersionIdCounter++, {
        biz_type: bizType,
        biz_id: parseInt(id),
        version,
        change_type: 'create',
        change_summary: `上传附件 ${originalName}`,
        changed_by: uploaded_by,
      }));
      return res.json(success(camelKeys(record), '上传成功(内存模式)'));
    }

    await ensureAttachmentTables();
    await pool.query(
      'UPDATE insurance_attachments SET is_latest = FALSE WHERE biz_type = $1 AND biz_id = $2 AND is_latest = TRUE',
      [bizType, id]
    );
    const result = await pool.query(`
      INSERT INTO insurance_attachments (biz_type, biz_id, filename, original_name, file_type, file_size, file_url, version, uploaded_by, is_latest)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE) RETURNING *
    `, [bizType, id, req.file.filename, originalName, 'document', req.file.size, fileUrl, version, uploaded_by]);

    await pool.query(`
      INSERT INTO insurance_versions (biz_type, biz_id, version, change_type, change_summary, changed_by)
      VALUES ($1, $2, $3, 'create', $4, $5)
    `, [bizType, id, version, `上传附件 ${originalName}`, uploaded_by]);

    res.json(success(camelKeys(result.rows[0]), '上传成功'));
  } catch (err) { next(err); }
});

// DELETE /:bizType/:id/attachments/:aid — 删除附件
router.delete('/:bizType/:id/attachments/:aid', async (req, res, next) => {
  try {
    const { bizType, id, aid } = req.params;
    if (!VALID_BIZ_TYPES.includes(bizType)) return res.json(error(-1, '无效的业务类型'));

    if (!isConnected()) {
      const att = memoryAttachments.find(a => a.id === parseInt(aid) && a.biz_type === bizType && a.biz_id === parseInt(id) && !a.is_deleted);
      if (!att) return sendNotFound(res, '附件不存在');
      att.is_deleted = true;
      memoryVersions.push(buildMemoryRecord(memoryVersionIdCounter++, {
        biz_type: bizType,
        biz_id: parseInt(id),
        version: att.version,
        change_type: 'delete',
        change_summary: `删除附件 ${att.original_name}`,
        changed_by: 'admin',
      }));
      return res.json(success(null, '删除成功(内存模式)'));
    }

    await ensureAttachmentTables();
    const attResult = await pool.query(
      'SELECT * FROM insurance_attachments WHERE id = $1 AND biz_type = $2 AND biz_id = $3',
      [aid, bizType, id]
    );
    if (attResult.rows.length === 0) return sendNotFound(res, '附件不存在');

    await pool.query(
      'UPDATE insurance_attachments SET is_deleted = TRUE WHERE id = $1 AND biz_type = $2 AND biz_id = $3',
      [aid, bizType, id]
    );

    await pool.query(`
      INSERT INTO insurance_versions (biz_type, biz_id, version, change_type, change_summary, changed_by)
      VALUES ($1, $2, $3, 'delete', $4, $5)
    `, [bizType, id, attResult.rows[0].version, `删除附件 ${attResult.rows[0].original_name}`, 'admin']);

    res.json(success(null, '删除成功'));
  } catch (err) { next(err); }
});

// GET /:bizType/:id/versions — 历史版本履历
router.get('/:bizType/:id/versions', async (req, res, next) => {
  try {
    const { bizType, id } = req.params;
    if (!VALID_BIZ_TYPES.includes(bizType)) return res.json(error(-1, '无效的业务类型'));

    if (!isConnected()) {
      const data = memoryVersions.filter(v => v.biz_type === bizType && v.biz_id === parseInt(id));
      return res.json(success(data.map(camelKeys), '查询成功(内存模式)'));
    }

    await ensureAttachmentTables();
    const result = await pool.query(
      'SELECT * FROM insurance_versions WHERE biz_type = $1 AND biz_id = $2 ORDER BY created_at DESC',
      [bizType, id]
    );
    res.json(success(result.rows.map(camelKeys), '查询成功'));
  } catch (err) { next(err); }
});

// ================================================================
//  /other — 其他保险（公众责任险、财产一切险）
// ================================================================

/**
 * 从 PDF 文本中提取其他保险关键字段
 * 支持保单号、保险起期、保险止期、保险公司识别
 */
function extractOtherInsuranceFields(text) {
  if (!text || typeof text !== 'string') {
    return { policyNo: null, startDate: null, expireDate: null, insuranceCompany: null };
  }
  const t = text.replace(/\s+/g, ' ').trim();

  // 保单号：支持 保单号/保单号码/保险单号 后跟字母数字组合
  let policyNo = null;
  const policyPatterns = [
    /保险单号[：:\s]+([A-Za-z0-9\-]{5,50})/,
    /保单号码[：:\s]+([A-Za-z0-9\-]{5,50})/,
    /保单号[：:\s]+([A-Za-z0-9\-]{5,50})/,
    /Policy\s*No\.?[：:\s]+([A-Za-z0-9\-]{5,50})/i,
  ];
  for (const re of policyPatterns) {
    const m = t.match(re);
    if (m && m[1]) {
      policyNo = m[1].trim();
      break;
    }
  }

  // 日期归一化：将中文/斜杠/点分隔日期统一为 YYYY-MM-DD
  function normalizeDate(s) {
    if (!s) return null;
    const cleaned = s
      .replace(/[年月]/g, '-')
      .replace(/[日]/g, '')
      .replace(/\//g, '-')
      .replace(/\./g, '-')
      .replace(/\s+/g, '');
    const parts = cleaned.split('-');
    if (parts.length < 3) return null;
    const [y, m, d] = parts;
    if (!/^\d{4}$/.test(y) || !/^\d{1,2}$/.test(m) || !/^\d{1,2}$/.test(d)) return null;
    const mm = m.padStart(2, '0');
    const dd = d.padStart(2, '0');
    const date = new Date(`${y}-${mm}-${dd}`);
    if (isNaN(date.getTime())) return null;
    return `${y}-${mm}-${dd}`;
  }

  let startDate = null;
  let expireDate = null;

  // 优先匹配「保险期间 自 XXXX年XX月XX日 至 XXXX年XX月XX日」
  const periodPatterns = [
    /保险期间[：:\s]*自\s*(\d{4}[年/-]\d{1,2}[月/-]\d{1,2}[日]?)[\s起]*[至到~]\s*(\d{4}[年/-]\d{1,2}[月/-]\d{1,2}[日]?)/,
    /保险期限[：:\s]*自\s*(\d{4}[年/-]\d{1,2}[月/-]\d{1,2}[日]?)[\s起]*[至到~]\s*(\d{4}[年/-]\d{1,2}[月/-]\d{1,2}[日]?)/,
    /保险期间[：:\s]*(\d{4}[年/-]\d{1,2}[月/-]\d{1,2}[日]?)[\s起]*[至到~]\s*(\d{4}[年/-]\d{1,2}[月/-]\d{1,2}[日]?)/,
    /自\s*(\d{4}[年/-]\d{1,2}[月/-]\d{1,2}[日]?)\s*[零]?时起[\s\S]{0,30}?[至到~]\s*(\d{4}[年/-]\d{1,2}[月/-]\d{1,2}[日]?)/,
  ];
  for (const re of periodPatterns) {
    const m = t.match(re);
    if (m && m[1] && m[2]) {
      startDate = normalizeDate(m[1]);
      expireDate = normalizeDate(m[2]);
      break;
    }
  }

  // 兜底：分别匹配「起期/生效日期」与「止期/到期日期」
  if (!startDate) {
    const startPatterns = [
      /(?:保险)?起期[：:\s]+(\d{4}[年/-]\d{1,2}[月/-]\d{1,2}[日]?)/,
      /生效日期[：:\s]+(\d{4}[年/-]\d{1,2}[月/-]\d{1,2}[日]?)/,
      /起始日期[：:\s]+(\d{4}[年/-]\d{1,2}[月/-]\d{1,2}[日]?)/,
      /开始日期[：:\s]+(\d{4}[年/-]\d{1,2}[月/-]\d{1,2}[日]?)/,
    ];
    for (const re of startPatterns) {
      const m = t.match(re);
      if (m && m[1]) { startDate = normalizeDate(m[1]); break; }
    }
  }
  if (!expireDate) {
    const endPatterns = [
      /(?:保险)?止期[：:\s]+(\d{4}[年/-]\d{1,2}[月/-]\d{1,2}[日]?)/,
      /到期日期[：:\s]+(\d{4}[年/-]\d{1,2}[月/-]\d{1,2}[日]?)/,
      /终止日期[：:\s]+(\d{4}[年/-]\d{1,2}[月/-]\d{1,2}[日]?)/,
      /结束日期[：:\s]+(\d{4}[年/-]\d{1,2}[月/-]\d{1,2}[日]?)/,
      /保险届满[：:\s]+(\d{4}[年/-]\d{1,2}[月/-]\d{1,2}[日]?)/,
    ];
    for (const re of endPatterns) {
      const m = t.match(re);
      if (m && m[1]) { expireDate = normalizeDate(m[1]); break; }
    }
  }

  // 保险公司：优先「保险人/承保公司/保险公司」等前缀 + 中文公司名
  let insuranceCompany = null;
  const companyPatterns = [
    /保险人[：:\s]+([\u4e00-\u9fa5]{2,20}(?:财产|责任|意外|健康)?保险(?:股份)?(?:有限)?公司)/,
    /承保公司[：:\s]+([\u4e00-\u9fa5]{2,20}(?:财产|责任|意外|健康)?保险(?:股份)?(?:有限)?公司)/,
    /保险公司[：:\s]+([\u4e00-\u9fa5]{2,20}(?:财产|责任|意外|健康)?保险(?:股份)?(?:有限)?公司)/,
    /承保人[：:\s]+([\u4e00-\u9fa5]{2,20}(?:财产|责任|意外|健康)?保险(?:股份)?(?:有限)?公司)/,
    /保险人名称[：:\s]+([\u4e00-\u9fa5]{2,20}(?:财产|责任|意外|健康)?保险(?:股份)?(?:有限)?公司)/,
  ];
  for (const re of companyPatterns) {
    const m = t.match(re);
    if (m && m[1]) {
      insuranceCompany = m[1].trim().replace(/\s+/g, '');
      break;
    }
  }
  // 若未命中，尝试从文本中反推「某某财产保险股份有限公司」「某某保险股份有限公司」
  if (!insuranceCompany) {
    const fallback = t.match(/([\u4e00-\u9fa5]{2,20}(?:财产|责任|意外|健康)?保险(?:股份)?(?:有限)?公司)/);
    if (fallback && fallback[1]) insuranceCompany = fallback[1].trim();
  }

  return { policyNo, startDate, expireDate, insuranceCompany };
}

async function ensureOtherInsuranceTable() {
  if (!isConnected()) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS other_insurance (
        id              BIGSERIAL PRIMARY KEY,
        insurance_type  VARCHAR(64) NOT NULL,
        policy_no       VARCHAR(128),
        insured_subject VARCHAR(255),
        coverage_amount NUMERIC(15,2) DEFAULT 0,
        premium         NUMERIC(15,2) DEFAULT 0,
        start_date      DATE,
        expire_date     DATE,
        insurance_company VARCHAR(255),
        department      VARCHAR(128),
        contact_person  VARCHAR(64),
        contact_phone   VARCHAR(32),
        status          VARCHAR(32) DEFAULT '有效',
        remark          TEXT,
        is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_other_insurance_type ON other_insurance(insurance_type)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_other_insurance_expire ON other_insurance(expire_date)');
    // 导入的 PDF 保单文件引用（uploads/insurance/ 下的持久文件名）
    await pool.query('ALTER TABLE other_insurance ADD COLUMN IF NOT EXISTS pdf_file VARCHAR(255)').catch(() => {});
  } catch (err) {
    logger.warn('[Insurance] other_insurance表初始化失败:', { message: err.message, stack: err.stack });
  }
}

function toDateString(v) {
  if (!v) return null;
  if (v instanceof Date) {
    // pg DATE 返回的是 UTC 零点对应本地日期的 Date，用本地时区格式化才能得到正确日期
    return v.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-');
  }
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function formatOtherInsurance(row) {
  const startDate = toDateString(row.start_date);
  const expireDate = toDateString(row.expire_date);
  return {
    id: row.id,
    insuranceType: row.insurance_type || '',
    policyNo: row.policy_no || '',
    insuredSubject: row.insured_subject || '',
    coverageAmount: parseFloat(row.coverage_amount) || 0,
    premium: parseFloat(row.premium) || 0,
    startDate,
    expireDate,
    insuranceCompany: row.insurance_company || '',
    department: row.department || '',
    pdfFile: row.pdf_file || '',
    contactPerson: row.contact_person || '',
    contactPhone: row.contact_phone || '',
    status: row.status || '有效',
    expiryStatus: calcExpiryStatus(expireDate),
    remark: row.remark || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

router.get('/other', async (req, res) => {
  try {
    await ensureOtherInsuranceTable();
    const { page = 1, pageSize = 20, keyword, insuranceType, expiryStatus } = req.query;

    if (!isConnected()) {
      let data = memoryStores.other.filter(r => !r.is_deleted);
      if (keyword) {
        const kw = keyword.toLowerCase();
        data = data.filter(r => (r.insured_subject && r.insured_subject.toLowerCase().includes(kw)) || (r.policy_no && r.policy_no.toLowerCase().includes(kw)));
      }
      if (insuranceType) data = data.filter(r => r.insurance_type === insuranceType);
      if (expiryStatus) {
        data = data.filter(r => calcExpiryStatus(r.expire_date) === expiryStatus);
      }
      const { list, total } = paginateMemory(data, page, pageSize);
      return buildListResponse(res, list.map(formatOtherInsurance), total, page, pageSize, '查询成功(内存模式)');
    }

    let whereSql = ' WHERE is_deleted = false';
    const params = [];
    let paramIdx = 0;
    if (keyword) {
      paramIdx++;
      whereSql += ` AND (insured_subject ILIKE $${paramIdx} OR policy_no ILIKE $${paramIdx})`;
      params.push(`%${keyword}%`);
    }
    if (insuranceType) {
      paramIdx++;
      whereSql += ` AND insurance_type = $${paramIdx}`;
      params.push(insuranceType);
    }

    const countR = await pool.query(`SELECT COUNT(*)::int AS total FROM other_insurance${whereSql}`, params);
    const total = countR.rows[0].total;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    paramIdx++; params.push(parseInt(pageSize));
    paramIdx++; params.push(offset);

    const result = await pool.query(
      `SELECT * FROM other_insurance${whereSql} ORDER BY id ASC LIMIT $${paramIdx - 1} OFFSET $${paramIdx}`,
      params
    );
    let list = result.rows.map(formatOtherInsurance);
    if (expiryStatus) list = list.filter(r => r.expiryStatus === expiryStatus);

    res.json(success({ list, total, page: parseInt(page), pageSize: parseInt(pageSize) }, '查询成功'));
  } catch (err) { res.json(error(-1, { message: err.message, stack: err.stack })); }
});

router.get('/other/stats', async (req, res) => {
  try {
    await ensureOtherInsuranceTable();
    const stats = { total: 0, normal: 0, expiring: 0, expired: 0, totalPremium: 0, totalCoverage: 0 };
    let byType = {};

    if (isConnected()) {
      const r1 = await pool.query("SELECT COUNT(*)::int AS v FROM other_insurance WHERE is_deleted = false");
      stats.total = r1.rows[0].v;
      const r2 = await pool.query("SELECT COUNT(*)::int AS v FROM other_insurance WHERE is_deleted = false AND expire_date > CURRENT_DATE + INTERVAL '30 days'");
      stats.normal = r2.rows[0].v;
      const r3 = await pool.query("SELECT COUNT(*)::int AS v FROM other_insurance WHERE is_deleted = false AND expire_date >= CURRENT_DATE AND expire_date <= CURRENT_DATE + INTERVAL '30 days'");
      stats.expiring = r3.rows[0].v;
      const r4 = await pool.query("SELECT COUNT(*)::int AS v FROM other_insurance WHERE is_deleted = false AND expire_date < CURRENT_DATE");
      stats.expired = r4.rows[0].v;
      const r5 = await pool.query("SELECT COALESCE(SUM(premium),0)::float AS p, COALESCE(SUM(coverage_amount),0)::float AS c FROM other_insurance WHERE is_deleted = false");
      stats.totalPremium = r5.rows[0].p;
      stats.totalCoverage = r5.rows[0].c;
      const r6 = await pool.query("SELECT insurance_type, COUNT(*)::int AS cnt FROM other_insurance WHERE is_deleted = false GROUP BY insurance_type");
      r6.rows.forEach(r => { byType[r.insurance_type] = r.cnt; });
    } else {
      const all = memoryStores.other.filter(r => !r.is_deleted);
      stats.total = all.length;
      all.forEach(r => {
        const s = calcExpiryStatus(r.expire_date);
        if (s === 'normal') stats.normal++;
        else if (s === 'expiring') stats.expiring++;
        else if (s === 'expired') stats.expired++;
        stats.totalPremium += parseFloat(r.premium) || 0;
        stats.totalCoverage += parseFloat(r.coverage_amount) || 0;
        byType[r.insurance_type] = (byType[r.insurance_type] || 0) + 1;
      });
    }
    res.json(success({ stats, byType }, '查询成功'));
  } catch (err) { res.json(error(-1, { message: err.message, stack: err.stack })); }
});

router.post('/other', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    await ensureOtherInsuranceTable();
    const b = req.body;
    if (!isConnected()) {
      const record = buildMemoryRecord(memoryCounters.other++, b);
      memoryStores.other.push(record);
      return res.json(success(record, '创建成功(内存模式)'));
    }
    const result = await pool.query(`
      INSERT INTO other_insurance (insurance_type, policy_no, insured_subject, coverage_amount, premium, start_date, expire_date, insurance_company, department, contact_person, contact_phone, status, remark, pdf_file)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *
    `, [b.insuranceType || '', b.policyNo || '', b.insuredSubject || '', b.coverageAmount || 0, b.premium || 0, b.startDate || null, b.expireDate || null, b.insuranceCompany || '', b.department || '', b.contactPerson || '', b.contactPhone || '', b.status || '有效', b.remark || '', b.pdfFile || '']);
    res.json(success(formatOtherInsurance(result.rows[0]), '创建成功'));
  } catch (err) { res.json(error(-1, { message: err.message, stack: err.stack })); }
});

router.put('/other/:id', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    await ensureOtherInsuranceTable();
    const b = req.body;
    if (!isConnected()) {
      const idx = memoryStores.other.findIndex(r => r.id === parseInt(req.params.id) && !r.is_deleted);
      if (idx === -1) return res.json(error(-2, '记录不存在'));
      Object.assign(memoryStores.other[idx], b, { updated_at: new Date().toISOString() });
      return res.json(success(memoryStores.other[idx], '更新成功(内存模式)'));
    }
    const result = await pool.query(`
      UPDATE other_insurance SET insurance_type=COALESCE($1,insurance_type), policy_no=COALESCE($2,policy_no),
        insured_subject=COALESCE($3,insured_subject), coverage_amount=COALESCE($4,coverage_amount),
        premium=COALESCE($5,premium), start_date=COALESCE($6,start_date), expire_date=COALESCE($7,expire_date),
        insurance_company=COALESCE($8,insurance_company), department=COALESCE($9,department),
        contact_person=COALESCE($10,contact_person), contact_phone=COALESCE($11,contact_phone),
        status=COALESCE($12,status), remark=COALESCE($13,remark), pdf_file=COALESCE($15,pdf_file), updated_at=CURRENT_TIMESTAMP
      WHERE id=$14 AND is_deleted=false RETURNING *
    `, [b.insuranceType, b.policyNo, b.insuredSubject, b.coverageAmount, b.premium, b.startDate, b.expireDate, b.insuranceCompany, b.department, b.contactPerson, b.contactPhone, b.status, b.remark, req.params.id, b.pdfFile || null]);
    if (result.rows.length === 0) return res.json(error(-2, '记录不存在'));
    res.json(success(formatOtherInsurance(result.rows[0]), '更新成功'));
  } catch (err) { res.json(error(-1, { message: err.message, stack: err.stack })); }
});

router.delete('/other/:id', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    await ensureOtherInsuranceTable();
    if (!isConnected()) {
      const r = memoryStores.other.find(r => r.id === parseInt(req.params.id) && !r.is_deleted);
      if (!r) return res.json(error(-2, '记录不存在'));
      r.is_deleted = true;
      return res.json(success(null, '删除成功(内存模式)'));
    }
    const result = await pool.query('UPDATE other_insurance SET is_deleted=true, updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND is_deleted=false RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.json(error(-2, '记录不存在'));
    res.json(success(null, '删除成功'));
  } catch (err) { res.json(error(-1, { message: err.message, stack: err.stack })); }
});

// ================================================================
//  /other/import-pdf — 其他保险 PDF 保单导入识别
// ================================================================

router.post('/other/import-pdf', requireRole('admin', 'safety_manager'), uploadInsurance.single('file'), async (req, res) => {
  let parser = null;
  try {
    if (!req.file) {
      return res.json(error(-1, '请上传 PDF 保单文件'));
    }

    const validation = validateUploadedFile(req.file, 'pdf');
    if (!validation.valid) {
      return res.json(error(-1, validation.error));
    }

    const dataBuffer = fs.readFileSync(req.file.path);
    const { PDFParse } = require('pdf-parse');
    parser = new PDFParse({ data: dataBuffer });
    const textResult = await parser.getText({ first: 5 });
    const text = (textResult.text || '').trim();

    const extracted = extractOtherInsuranceFields(text);
    const totalPages = textResult.total || 0;
    const pagesRead = Math.min(totalPages, 5);

    // 可信度：按已识别字段数简单计算
    const fields = [extracted.policyNo, extracted.startDate, extracted.expireDate, extracted.insuranceCompany];
    const confidence = Math.round((fields.filter(Boolean).length / fields.length) * 100);

    // 保留识别失败的临时文件以便人工核对，但限制大小
    const keepFile = req.file.size <= 10 * 1024 * 1024;
    if (!keepFile) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }

    res.json(success({
      fileName: req.file.originalname,
      storedName: req.file.filename,
      fileSize: req.file.size,
      totalPages,
      pagesRead,
      textPreview: text.slice(0, 800),
      extracted,
      confidence,
      tempPath: keepFile ? req.file.path : undefined,
    }, 'PDF 识别完成'));
  } catch (err) {
    // 清理失败时上传的临时文件
    if (req.file && req.file.path) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
    logger.error('[Insurance] PDF 导入识别失败:', { error: err, stack: err && err.stack });
    res.json(error(-1, `PDF 识别失败: ${err.message}`));
  } finally {
    if (parser && typeof parser.destroy === 'function') {
      try { await parser.destroy(); } catch (e) {}
    }
  }
});

// ================================================================
//  /policies — 保单管理（人员保险：雇主责任险 / 工伤保险 主保单文档）
//  与「其他保险」的 PDF 查看保持一致：文件落在 uploads/insurance/ 下，
//  前端通过 fetch /uploads/insurance/{fileName} 以 blob 形式在 iframe 中预览。
// ================================================================

async function ensurePolicyTable() {
  if (!isConnected()) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS insurance_policies (
        id             BIGSERIAL PRIMARY KEY,
        name           VARCHAR(255) NOT NULL,
        type           VARCHAR(64) NOT NULL,
        policy_no      VARCHAR(64),
        year           VARCHAR(16),
        file_name      VARCHAR(255) NOT NULL,
        original_name  VARCHAR(255) NOT NULL,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_insurance_policies_type ON insurance_policies(type)');
    // 幂等迁移：补充保单号/保险年份列（老表升级）
    await pool.query(`ALTER TABLE insurance_policies ADD COLUMN IF NOT EXISTS policy_no VARCHAR(64)`);
    await pool.query(`ALTER TABLE insurance_policies ADD COLUMN IF NOT EXISTS year VARCHAR(16)`);
  } catch (err) {
    logger.warn('[Insurance] insurance_policies表初始化失败:', { message: err.message, stack: err.stack });
  }
}

router.get('/policies', async (req, res) => {
  try {
    await ensurePolicyTable();
    const { type } = req.query;
    if (!isConnected()) {
      let data = memoryStores.policies.filter((r) => !r.is_deleted);
      if (type) data = data.filter((r) => r.type === type);
      const list = data.map((r) => ({
        id: r.id, name: r.name, type: r.type,
        fileName: r.fileName, originalName: r.originalName, createdAt: r.created_at,
      }));
      return buildListResponse(res, list, list.length, 1, list.length, '查询成功(内存模式)');
    }
    let where = '';
    const params = [];
    let idx = 0;
    if (type) {
      idx++;
      where = ` WHERE type = $${idx}`;
      params.push(type);
    }
    const countR = await pool.query(`SELECT COUNT(*)::int AS total FROM insurance_policies${where}`, params);
    const total = countR.rows[0].total;
    const result = await pool.query(
      `SELECT * FROM insurance_policies${where} ORDER BY id DESC`,
      params,
    );
    const list = result.rows.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      policyNo: r.policy_no || '',
      year: r.year || '',
      fileName: r.file_name,
      originalName: r.original_name,
      createdAt: r.created_at,
    }));
    res.json(success({ list, total }, '查询成功'));
  } catch (err) {
    res.json(error(-1, { message: err.message, stack: err.stack }));
  }
});

router.post('/policies/import-pdf', requireRole('admin', 'safety_manager'), uploadInsurance.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.json(error(-1, '请上传 PDF 保单文件'));
    }
    const validation = validateUploadedFile(req.file, 'pdf');
    if (!validation.valid) {
      return res.json(error(-1, validation.error));
    }

    const name = (req.body.name || '').trim() || req.file.originalname;
    const type = (req.body.type || '雇主责任险').trim();
    const policyNo = (req.body.policyNo || '').trim();
    const year = (req.body.year || '').trim();

    if (!isConnected()) {
      const record = {
        id: memoryCounters.policies++,
        name, type, policyNo, year,
        fileName: req.file.filename,
        originalName: req.file.originalname,
        is_deleted: false,
        created_at: new Date().toISOString(),
      };
      memoryStores.policies.push(record);
      return res.json(success(
        { id: record.id, name, type, policyNo, year, fileName: record.fileName, originalName: req.file.originalname },
        '上传成功(内存模式)',
      ));
    }

    const result = await pool.query(
      `INSERT INTO insurance_policies (name, type, policy_no, year, file_name, original_name) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name, type, policyNo, year, req.file.filename, req.file.originalname],
    );
    res.json(success(
      {
        id: result.rows[0].id,
        name,
        type,
        policyNo: result.rows[0].policy_no || '',
        year: result.rows[0].year || '',
        fileName: result.rows[0].file_name,
        originalName: result.rows[0].original_name,
      },
      '上传成功',
    ));
  } catch (err) {
    if (req.file && req.file.path) {
      try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
    }
    logger.error('[Insurance] 保单上传失败:', { error: err, stack: err && err.stack });
    res.json(error(-1, `上传失败: ${err.message}`));
  }
});

router.delete('/policies/:id', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    await ensurePolicyTable();
    if (!isConnected()) {
      const r = memoryStores.policies.find((x) => x.id === parseInt(req.params.id));
      if (r) r.is_deleted = true;
      return res.json(success(null, '删除成功(内存模式)'));
    }
    const result = await pool.query('DELETE FROM insurance_policies WHERE id=$1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.json(error(-2, '记录不存在'));
    res.json(success(null, '删除成功'));
  } catch (err) {
    res.json(error(-1, { message: err.message, stack: err.stack }));
  }
});

// PUT /policies/:id — 编辑保单信息（保单号/年份/名称/类型；不更换文件）
router.put('/policies/:id', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    await ensurePolicyTable();
    const id = parseInt(req.params.id, 10);
    if (!id) return res.json(error(-1, '无效的保单ID'));
    const { name, type, policyNo, year } = req.body || {};

    if (!isConnected()) {
      const r = memoryStores.policies.find((x) => x.id === id && !x.is_deleted);
      if (!r) return res.json(error(-2, '记录不存在'));
      if (name != null) r.name = String(name).trim();
      if (type != null) r.type = String(type).trim();
      if (policyNo != null) r.policyNo = String(policyNo).trim();
      if (year != null) r.year = String(year).trim();
      return res.json(success(
        { id: r.id, name: r.name, type: r.type, policyNo: r.policyNo, year: r.year, fileName: r.fileName, originalName: r.originalName },
        '更新成功(内存模式)',
      ));
    }

    const result = await pool.query(
      `UPDATE insurance_policies
         SET name = COALESCE(NULLIF($2,''), name),
             type = COALESCE(NULLIF($3,''), type),
             policy_no = NULLIF($4, ''),
             year = NULLIF($5, '')
       WHERE id = $1 RETURNING *`,
      [id, name != null ? String(name) : null, type != null ? String(type) : null, policyNo != null ? String(policyNo) : null, year != null ? String(year) : null],
    );
    if (result.rows.length === 0) return res.json(error(-2, '记录不存在'));
    const r = result.rows[0];
    res.json(success(
      {
        id: r.id, name: r.name, type: r.type,
        policyNo: r.policy_no || '', year: r.year || '',
        fileName: r.file_name, originalName: r.original_name, createdAt: r.created_at,
      },
      '更新成功',
    ));
  } catch (err) {
    res.json(error(-1, { message: err.message, stack: err.stack }));
  }
});

// ================================================================
//  /stats/overview — 保险模块全量统计（供安全总览调用）
// ================================================================

router.get('/stats/overview', async (req, res) => {
  try {
    const result = {
      personnel: { total: 0, covered: 0, expired: 0, expiring: 0, pending: 0 },
      vehicle: { total: 0, active: 0, expired: 0, expiring: 0, totalPremium: 0 },
      other: { total: 0, normal: 0, expiring: 0, expired: 0, totalPremium: 0, totalCoverage: 0 }
    };

    if (isConnected()) {
      // 任务9：personnel 以当前花名册人员为主，复用 /personnel/stats 的确定性双险透视与
      // 人员级互斥四态（buildPersonnelStatsPivotSql），不再按保险记录数简单统计。
      // 含义与 /personnel/stats 一致：covered=insured+expiring；expired；pending=uninsured；
      // expiring ⊆ covered；恒等式 total = covered + expired + pending。
      const pv = await pool.query(buildPersonnelStatsPivotSql());
      result.personnel.total = pv.rows[0].total;
      result.personnel.covered = pv.rows[0].covered;
      result.personnel.expired = pv.rows[0].expired;
      result.personnel.pending = pv.rows[0].pending;
      result.personnel.expiring = pv.rows[0].expiring;

      const r5 = await pool.query("SELECT COUNT(*)::int AS v FROM vehicles WHERE is_deleted = false");
      result.vehicle.total = r5.rows[0].v;
      const r6 = await pool.query("SELECT COUNT(*)::int AS v FROM vehicles WHERE is_deleted = false AND insurance_end >= CURRENT_DATE");
      result.vehicle.active = r6.rows[0].v;
      const r7 = await pool.query("SELECT COUNT(*)::int AS v FROM vehicles WHERE is_deleted = false AND insurance_end < CURRENT_DATE");
      result.vehicle.expired = r7.rows[0].v;
      const r8 = await pool.query("SELECT COUNT(*)::int AS v FROM vehicles WHERE is_deleted = false AND insurance_end >= CURRENT_DATE AND insurance_end <= CURRENT_DATE + INTERVAL '30 days'");
      result.vehicle.expiring = r8.rows[0].v;
      const r9 = await pool.query("SELECT COALESCE(SUM(premium),0)::float AS v FROM vehicles WHERE is_deleted = false");
      result.vehicle.totalPremium = r9.rows[0].v;

      await ensureOtherInsuranceTable();
      const r10 = await pool.query("SELECT COUNT(*)::int AS v FROM other_insurance WHERE is_deleted = false");
      result.other.total = r10.rows[0].v;
      const r11 = await pool.query("SELECT COUNT(*)::int AS v FROM other_insurance WHERE is_deleted = false AND expire_date > CURRENT_DATE + INTERVAL '30 days'");
      result.other.normal = r11.rows[0].v;
      const r12 = await pool.query("SELECT COUNT(*)::int AS v FROM other_insurance WHERE is_deleted = false AND expire_date >= CURRENT_DATE AND expire_date <= CURRENT_DATE + INTERVAL '30 days'");
      result.other.expiring = r12.rows[0].v;
      const r13 = await pool.query("SELECT COUNT(*)::int AS v FROM other_insurance WHERE is_deleted = false AND expire_date < CURRENT_DATE");
      result.other.expired = r13.rows[0].v;
      const r14 = await pool.query("SELECT COALESCE(SUM(premium),0)::float AS p, COALESCE(SUM(coverage_amount),0)::float AS c FROM other_insurance WHERE is_deleted = false");
      result.other.totalPremium = r14.rows[0].p;
      result.other.totalCoverage = r14.rows[0].c;
    } else {
      // 任务9：overview 内存模式 personnel 复用与 /personnel/stats 相同的人数口径
      // （稳定 employee_id 去重 + pickBestInsuranceRecord 确定性选单 + calcPersonStatus 互斥四态）
      const byEmp = new Map();
      memoryStores.personnel.filter(r => !r.is_deleted && r.employee_id != null).forEach(r => {
        if (!byEmp.has(r.employee_id)) byEmp.set(r.employee_id, { emp: [], inj: [] });
        const bucket = byEmp.get(r.employee_id);
        if (r.insurance_type === '雇主责任险') bucket.emp.push(r);
        else if (r.insurance_type === '工伤保险') bucket.inj.push(r);
      });
      const today = new Date();
      let covered = 0;
      let expired = 0;
      let pending = 0;
      let expiring = 0;
      byEmp.forEach((bucket) => {
        const emp = pickBestInsuranceRecord(bucket.emp, today);
        const inj = pickBestInsuranceRecord(bucket.inj, today);
        const es = emp ? calcInsuranceStatus({ isCurrent: emp.is_current, startDate: emp.start_date, expireDate: emp.expire_date }, today) : 'uninsured';
        const is2 = inj ? calcInsuranceStatus({ isCurrent: inj.is_current, startDate: inj.start_date, expireDate: inj.expire_date }, today) : 'uninsured';
        const personState = calcPersonStatus(es, is2);
        if (personState === 'insured' || personState === 'expiring') { covered++; if (es === 'expiring' || is2 === 'expiring') expiring++; }
        else if (personState === 'expired') expired++;
        else pending++;
      });
      result.personnel.total = byEmp.size;
      result.personnel.covered = covered;
      result.personnel.expired = expired;
      result.personnel.pending = pending;
      result.personnel.expiring = expiring;
    }

    res.json(success(result, '查询成功'));
  } catch (err) { res.json(error(-1, { message: err.message, stack: err.stack })); }
});

// ============================================================
// 受保护保单文件读取（服务端记录定位，任务0.2）
// 客户端只提交记录 ID，服务端从数据库/内存记录解析服务端文件字段，
// 禁止客户端提交物理文件名或路径；路径必须位于 server/uploads/insurance 内。
// ============================================================

/** 服务端文件流返回（文件名来自记录的服务端字段，二次白名单 + 目录前缀校验） */
function streamInsuranceFile(res, fileName, { dispositionName } = {}) {
  if (!fileName || typeof fileName !== 'string' || !/^[A-Za-z0-9._-]+$/.test(fileName)) {
    return res.status(404).json(error(404, '文件不存在'));
  }
  const insuranceDir = path.join(__dirname, '..', 'uploads', 'insurance');
  const filePath = path.join(insuranceDir, fileName);
  if (!filePath.startsWith(insuranceDir + path.sep)) {
    return res.status(400).json(error(400, '非法路径'));
  }
  if (!fs.existsSync(filePath)) {
    return res.status(404).json(error(404, '文件不存在'));
  }
  res.setHeader('Content-Type', 'application/pdf');
  // RFC 5987：ASCII filename 用服务端安全名；中文原名走 filename*（UTF-8 编码，避免非法头字符）
  const safeName = dispositionName || fileName;
  res.setHeader(
    'Content-Disposition',
    `inline; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
  );
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const stream = fs.createReadStream(filePath);
  // 流错误：若响应头未发送则返回 JSON；已发送则只终止流（避免二次写响应）
  let headersSent = false;
  res.on('finish', () => { headersSent = true; });
  stream.on('error', (err) => {
    logger.error('[Insurance] 保单文件流读取失败:', { message: err && err.message, stack: err && err.stack });
    if (!res.headersSent && !headersSent) {
      if (err && err.code === 'ENOENT') {
        return res.status(404).json(error(404, '文件不存在'));
      }
      return res.status(500).json(error(500, '文件读取失败'));
    }
    res.end();
  });
  stream.pipe(res);
}

// GET /api/insurance/policies/:id/file — 人员主保单文件（按记录 ID 定位）
router.get('/policies/:id/file', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(404).json(error(404, '记录不存在'));
    }
    if (!isConnected()) {
      // 内存模式：按记录 ID 查找未删除记录
      const rec = memoryStores.policies.find((r) => r.id === id && !r.is_deleted);
      if (!rec) return res.status(404).json(error(404, '记录不存在'));
      return streamInsuranceFile(res, rec.file_name, { dispositionName: rec.original_name || rec.file_name });
    }
    const result = await pool.query(
      'SELECT file_name, original_name FROM insurance_policies WHERE id = $1',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json(error(404, '记录不存在'));
    }
    const row = result.rows[0];
    return streamInsuranceFile(res, row.file_name, { dispositionName: row.original_name || row.file_name });
  } catch (err) {
    logger.error('[Insurance] 保单文件读取异常:', { message: err.message, stack: err.stack });
    res.status(500).json(error(500, '文件读取失败'));
  }
});

// GET /api/insurance/other/:id/file — 其他保险文件（按记录 ID 定位，未删除）
router.get('/other/:id/file', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(404).json(error(404, '记录不存在'));
    }
    if (!isConnected()) {
      const rec = memoryStores.other.find((r) => r.id === id && !r.is_deleted);
      if (!rec) return res.status(404).json(error(404, '记录不存在'));
      return streamInsuranceFile(res, rec.pdf_file);
    }
    const result = await pool.query(
      'SELECT pdf_file FROM other_insurance WHERE id = $1 AND is_deleted = false',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json(error(404, '记录不存在'));
    }
    return streamInsuranceFile(res, result.rows[0].pdf_file);
  } catch (err) {
    logger.error('[Insurance] 其他保险文件读取异常:', { message: err.message, stack: err.stack });
    res.status(500).json(error(500, '文件读取失败'));
  }
});

module.exports = router;
module.exports.memoryStores = memoryStores;
module.exports.memoryCounters = memoryCounters;
// 任务6：导出状态纯函数供固定时间单元测试
module.exports.calcInsuranceStatus = calcInsuranceStatus;
// 任务8：导出人员级状态/业务日纯函数供行为测试
module.exports.calcPersonStatus = calcPersonStatus;
// 合规口径（雇主险10万/80万档 + 工伤险组合）
module.exports.calcComplianceStatus = calcComplianceStatus;
module.exports.complianceStatusSql = complianceStatusSql;
module.exports.personLevelSql = personLevelSql;
module.exports.getBusinessDayStr = getBusinessDayStr;
module.exports.BUSINESS_DAY_SQL = BUSINESS_DAY_SQL;
// 任务9：导出单险种真值表共享构造供 SQL 契约测试
module.exports.policyStateSql = policyStateSql;
// 任务7：导出确定性选单纯函数供行为测试（DB ROW_NUMBER 与内存比较器等价验证）
module.exports.pickBestInsuranceRecord = pickBestInsuranceRecord;
module.exports.compareInsuranceRecords = compareInsuranceRecords;
// 任务9：导出单险种 rank 纯函数供真值表矩阵测试
module.exports.insuranceRecordRank = insuranceRecordRank;
module.exports.activePolicySql = activePolicySql;
module.exports.policyPivotSql = policyPivotSql;
