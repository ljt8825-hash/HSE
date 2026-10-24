/**
 * 隐患排查治理（/api/hazards）—— service 层
 * 原 routes/hazards.js 的业务逻辑全部下沉至此：
 *   - DB 表初始化 / 索引
 *   - 时效状态计算、隐患状态流转、位置自动提取
 *   - 内存降级存储
 *   - 通知中心联动（过期/临期）、风险点反向联动、hse_events 同步、审计日志
 *   - CSV 导出
 *
 * 契约：每个对外函数返回统一描述符
 *   - 成功 JSON：{ __t:'json', payload, message }（等价原 res.json(success(...))）
 *   - 业务错误：{ __t:'json', error:{code,message} }（等价原 res.json(error(...))）
 *     code 语义沿用原值：-1 通用失败 / -2 记录不存在 / -3 参数校验（review）
 *   - CSV：{ __t:'csv', csv }（等价原 sendHazardCsvExport 的 res 写逻辑）
 *
 * 双执行约定：
 *   - 原 catch 为 res.json(error(-1, e.message)) 的端点：业务函数遇 DB 异常应抛错，
 *     由 controller 的 run() 归一为 error(-1)（HTTP 200），与原文一致。
 *   - 原 catch 为 next(err) 的端点：业务函数遇 DB 异常应抛错，由 controller 的
 *     runNext() 委托 next(err)，与原文一致。
 * 业务内的校验失败 / 未找到等「预期分支」均返回描述符（不抛错），保持 HTTP 200 原语义。
 */

const { pool, isConnected } = require('../config/db');
const { success, error } = require('../middleware/response');
const { paginateMemory, buildMemoryRecord, camelKeys } = require('../utils/commonResponse');
const { getFileUrl, fixFilenameEncoding } = require('../middleware/upload');
const { auditLog } = require('../routes/audit');
const hseEventSync = require('../services/hseEventSyncService');
const { createNotification } = require('../services/notificationService');
const hseRules = require('../config/hseRules');

const ok = (payload, message) => ({ __t: 'json', payload, message });
const err = (code, message) => ({ __t: 'json', error: { code, message } });
const notFound = (msg) => err(-2, msg);

// ========== 数据库表初始化（IF NOT EXISTS，可重复执行） ==========
let tablesInitialized = false;

async function ensureTables() {
  if (tablesInitialized) return;
  if (!isConnected()) return;
  try {
    // 1. 隐患附件表
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hazard_attachments (
        id            BIGSERIAL PRIMARY KEY,
        hazard_id     BIGINT NOT NULL,
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
    await pool.query('CREATE INDEX IF NOT EXISTS idx_hazard_attachments_hazard ON hazard_attachments(hazard_id)');

    // 2. 隐患版本履历表
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hazard_versions (
        id             BIGSERIAL PRIMARY KEY,
        hazard_id      BIGINT NOT NULL,
        version        VARCHAR(32) NOT NULL,
        change_type    VARCHAR(32) NOT NULL DEFAULT 'update',
        change_summary TEXT,
        changed_by     VARCHAR(64),
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_hazard_versions_hazard ON hazard_versions(hazard_id)');

    // 3. 隐患联动字段（Phase 14：与风险管控模块联动）
    try {
      await pool.query(`ALTER TABLE hazards ADD COLUMN IF NOT EXISTS related_risk_id BIGINT`);
      await pool.query(`ALTER TABLE hazards ADD COLUMN IF NOT EXISTS risk_level VARCHAR(32)`);
    } catch (_e) {
      // 字段已存在或表不存在，忽略
    }

    // 4. Sprint5.9: 添加人员关联字段
    await pool.query(`ALTER TABLE IF EXISTS hazards ADD COLUMN IF NOT EXISTS finder_id BIGINT`);
    await pool.query(`ALTER TABLE IF EXISTS hazards ADD COLUMN IF NOT EXISTS responsible_id BIGINT`);
    await pool.query(`ALTER TABLE IF EXISTS hazards ADD COLUMN IF NOT EXISTS corrector_id BIGINT`);

    // 5. Sprint5.13: 完善隐患模型 - 新增字段
    await pool.query(`ALTER TABLE IF EXISTS hazards ADD COLUMN IF NOT EXISTS hazard_type VARCHAR(64)`);
    await pool.query(`ALTER TABLE IF EXISTS hazards ADD COLUMN IF NOT EXISTS location VARCHAR(255)`);
    await pool.query(`ALTER TABLE IF EXISTS hazards ADD COLUMN IF NOT EXISTS grid_id BIGINT`);
    await pool.query(`ALTER TABLE IF EXISTS hazards ADD COLUMN IF NOT EXISTS rectification TEXT`);
    await pool.query(`ALTER TABLE IF EXISTS hazards ADD COLUMN IF NOT EXISTS reviewer_id BIGINT`);
    await pool.query(`ALTER TABLE IF EXISTS hazards ADD COLUMN IF NOT EXISTS rectify_date DATE`);
    await pool.query(`ALTER TABLE IF EXISTS hazards ADD COLUMN IF NOT EXISTS review_date DATE`);
    await pool.query(`ALTER TABLE IF EXISTS hazards ADD COLUMN IF NOT EXISTS review_result VARCHAR(32)`);
    await pool.query(`ALTER TABLE IF EXISTS hazards ADD COLUMN IF NOT EXISTS deadline_days INT DEFAULT 30`);

    // 6. Sprint5.13: 添加索引
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_hazards_hazard_type ON hazards(hazard_type)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_hazards_responsible_id ON hazards(responsible_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_hazards_grid_id ON hazards(grid_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_hazards_status ON hazards(status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_hazards_risk_level ON hazards(risk_level)`);

    tablesInitialized = true;
    console.log('[Hazards] 数据库表 attachments/versions/related_risk/finder/responsible/corrector/hazard_type/location/grid/rectification/reviewer 已就绪');
  } catch (err) {
    console.warn('[Hazards] 数据库表初始化失败:', err.message);
  }
}

// ========== 时效状态计算（隐患整改期限，默认30天） ==========
// 规则：基于 hazard_date + deadline_days(默认30天) 计算整改期限
// - 过期：当前日期 > 整改期限 且 未整改完成
// - 临期：距整改期限 ≤ 7 天 且 未整改完成
// - 正常：距整改期限 > 7 天 且 未整改完成
// - 已完成：已整改完成
function calcExpiryStatus(hazardDate, isResolved, deadlineDays) {
  if (isResolved === '是' || isResolved === '已完成' || isResolved === 'completed') return 'resolved';
  const dd = deadlineDays || 30;
  if (!hazardDate) return 'unknown';
  const hd = new Date(hazardDate);
  if (isNaN(hd.getTime())) return 'unknown';
  const deadline = new Date(hd);
  deadline.setDate(deadline.getDate() + parseInt(dd));
  const now = new Date();
  const diffDays = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'expired';
  if (diffDays <= 7) return 'expiring';
  return 'normal';
}

// ========== Sprint5.13 / P3-04-00: 隐患生命周期状态（唯一 canonical 事实源） ==========
// 只有以下 4 个值可以写入 hazards.status；任何其它值只能“识别”，不能“写回”。
const HAZARD_STATUS = {
  DISCOVERED: 'discovered',
  PROCESSING: 'processing',
  PENDING_REVIEW: 'pending_review',
  CLOSED: 'closed',
};

const HAZARD_STATUS_VALUES = Object.values(HAZARD_STATUS);
const HAZARD_STATUS_SET = new Set(HAZARD_STATUS_VALUES);

// 旧数据词汇 → canonical：仅用于“读取识别”（历史 110 行 status=未完成/已完成）。
// 不得用于写入：写入端只允许 HAZARD_STATUS 四个值。
const STATUS_MAP = {
  '发现': HAZARD_STATUS.DISCOVERED,
  '整改中': HAZARD_STATUS.PROCESSING,
  '待复查': HAZARD_STATUS.PENDING_REVIEW,
  '关闭': HAZARD_STATUS.CLOSED,
  '未完成': HAZARD_STATUS.DISCOVERED,
  '已完成': HAZARD_STATUS.CLOSED,
};

// 告警/看板历史中文词：语义与生命周期“相近但不等价”，单独归类为
// non_lifecycle（可识别展示，绝不参与状态机写入与统计口径）。
const NON_LIFECYCLE_STATUS = {
  '待处理': HAZARD_STATUS.DISCOVERED,
  '处理中': HAZARD_STATUS.PROCESSING,
  '已关闭': HAZARD_STATUS.CLOSED,
  '已整改': HAZARD_STATUS.CLOSED,
  '已验收': HAZARD_STATUS.CLOSED,
};

// canonical → 中文展示
const STATUS_LABEL = {
  [HAZARD_STATUS.DISCOVERED]: '发现',
  [HAZARD_STATUS.PROCESSING]: '整改中',
  [HAZARD_STATUS.PENDING_REVIEW]: '待复查',
  [HAZARD_STATUS.CLOSED]: '关闭',
};

/**
 * 状态四分类（P3-04-00 §6/§7）：
 *  - canonical    : 4 个生命周期标准值
 *  - legacy       : 历史数据词汇（未完成/已完成/发现/整改中/待复查/关闭）
 *  - non_lifecycle: 告警/看板用过的中文词（待处理/处理中/已关闭/已整改/已验收）
 *  - unknown      : 无法识别的值（含 NULL / 任意字符串）→ fail-closed
 */
function classifyStatus(raw) {
  if (raw === null || raw === undefined || raw === '') {
    return { status: null, category: 'unknown' };
  }
  if (HAZARD_STATUS_SET.has(raw)) {
    return { status: raw, category: 'canonical' };
  }
  if (Object.prototype.hasOwnProperty.call(STATUS_MAP, raw)) {
    return { status: STATUS_MAP[raw], category: 'legacy' };
  }
  if (Object.prototype.hasOwnProperty.call(NON_LIFECYCLE_STATUS, raw)) {
    return { status: NON_LIFECYCLE_STATUS[raw], category: 'non_lifecycle' };
  }
  return { status: null, category: 'unknown' };
}

function isCanonicalStatus(raw) {
  return HAZARD_STATUS_SET.has(raw);
}

// 展示标签：canonical + 历史/告警词汇均可读，未知值原样返回（fail-closed，不猜测）
function getStatusLabel(status) {
  if (STATUS_LABEL[status]) return STATUS_LABEL[status];
  if (status === '未完成' || status === '待处理') return '待整改';
  if (status === '已完成' || status === '已关闭' || status === '已整改' || status === '已验收') return '已关闭';
  if (status === '处理中') return '整改中';
  return status;
}

// ========== P3-04-00.2 (F-04)：SQL 侧“已闭环 / 未闭环”判定的唯一来源 ==========
// 背景：sealed 之后 lifecycle 只写 canonical，但 SQL 里仍残留 `status != '已完成'` 这类旧词汇判断。
// 该类判断有两个叠加缺陷：
//   1) 词汇错位——迁移后写入的是 'closed'，`!= '已完成'` 会把已闭环隐患判为未闭环；
//   2) NULL 陷阱——status 为 NULL 时 `NULL != '已完成'` 求值为 NULL（非 TRUE），
//      导致历史 50 条 NULL 隐患被排除在“未闭环”之外（实测 risk_sources.hazard_count 恒 0）。
// 统一收敛为下面这一处：
//   - 已闭环 = canonical 'closed' + 迁移前历史值 '已完成'（与 STATUS_MAP / statusToIsResolved 同源，
//     仅作读取兼容；P3-04-01 迁移完成后由该轮删除 '已完成'）
//   - 未闭环 = 取反，且 NULL 视为未闭环（fail-open 到“待整改”，不把未知状态当成已闭环）
const SQL_CLOSED_STATUS_LIST = `('${HAZARD_STATUS.CLOSED}', '已完成')`;

/** 已闭环判定 SQL（alias 传 'h.' 形式的表别名前缀，可为 ''） */
function sqlStatusClosed(alias = '') {
  return `${alias}status IN ${SQL_CLOSED_STATUS_LIST}`;
}

/** 未闭环判定 SQL：NULL 也计入未闭环 */
function sqlStatusOpen(alias = '') {
  return `(${alias}status IS NULL OR ${alias}status NOT IN ${SQL_CLOSED_STATUS_LIST})`;
}

// ========== 内存降级存储 ==========
let memoryRecords = [];
let memoryHazardAttachments = [];
let memoryHazardVersions = [];
let memoryIdCounter = 1;
let memoryInitialized = false;
let memoryAttachmentIdCounter = 1;
let memoryVersionIdCounter = 1;

function initMemoryData() {
  if (memoryInitialized) return;
  memoryInitialized = true;
  memoryRecords = [];
  memoryIdCounter = 1;
}

// ========== 是否整改完成 转换 ==========
// DB status 存储（sealed 后）: canonical discovered/processing/pending_review/closed
// 历史行仍可能是 '已完成' / NULL（P3-04-01 迁移前），读取侧一律按 canonical 语义归一
// 前端 isResolved: '是' / '否'
function statusToIsResolved(status) {
  if (!status) return '否';
  // P3-04-00: canonical closed 必须视为已解决（此前仅识别旧中文，导致 closed 行被误判为未解决）
  if (status === HAZARD_STATUS.CLOSED || status === '已完成' || status === 'completed') return '是';
  return '否';
}
// P3-04-00.2 (F-04c)：原来的 isResolvedToStatus() 把 '是/否' 翻成 '已完成/未完成' 再做 `status = $n` 等值匹配，
// 造成两侧都错：`否` 恒 0 行（无任何行是 '未完成'）；`是` 只命中历史行，迁移后 closed 行全部查不到。
// 现改为集合判定（见 sqlStatusClosed / sqlStatusOpen），不再由 isResolved 反推单一状态值。

// ========== 格式化行 ==========
function formatDate(date) {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ========== 隐患位置自动提取 ==========
// 规则：description 中如包含「环卫作业中心」或「市政绿化作业中心」下属单位的核心地名（去后缀「作业中心/公园/镇/乡/街道/园区」），
// 则把完整单位名作为隐患位置（如「长官转运站顶层...」→ 核心词「长官」→ 完整名「长官镇」）。
// 优先使用 DB 已有 location，DB 为空时回退到自动提取。
let orgTownNamesCache = null;
let orgTownNamesCacheAt = 0;
async function getOrgTownNames(client) {
  const now = Date.now();
  if (orgTownNamesCache && now - orgTownNamesCacheAt < 5 * 60 * 1000) return orgTownNamesCache;
  try {
    const r = await client.query(
      `SELECT o.org_name
       FROM hse_org_unit o
       JOIN hse_org_unit p ON p.id = o.parent_id
       WHERE p.org_type = 'center' AND p.org_name IN ('环卫作业中心', '市政绿化作业中心')
         AND o.is_deleted IS NOT TRUE`
    );
    // 每条组织名生成 { full, core }：full 为完整单位名（用于显示），core 为去掉行政区划后缀的核心词（用于模糊匹配）
    orgTownNamesCache = r.rows.map((row) => {
      const full = String(row.org_name).replace(/作业中心$/, '').replace(/公园$/, '').trim();
      const core = full.replace(/镇$|乡$|街道$|园区$/, '').trim();
      return { full, core };
    }).filter((t) => t.core);
    orgTownNamesCacheAt = now;
    return orgTownNamesCache;
  } catch (e) {
    console.warn('[Hazards] 加载组织乡镇名称失败:', e.message);
    return orgTownNamesCache || [];
  }
}
function extractLocationFromDescription(description, townNames) {
  if (!description || !townNames || !townNames.length) return '';
  for (const t of townNames) {
    if (description.includes(t.core)) return t.full;
  }
  return '';
}

function formatRow(row, townNames) {
  const checkDate = row.hazard_date ? (row.hazard_date instanceof Date ? row.hazard_date : new Date(row.hazard_date)) : null;
  const fixDate = row.fix_date ? (row.fix_date instanceof Date ? row.fix_date : new Date(row.fix_date)) : null;
  const rectifyDate = row.rectify_date ? (row.rectify_date instanceof Date ? row.rectify_date : new Date(row.rectify_date)) : null;
  const reviewDate = row.review_date ? (row.review_date instanceof Date ? row.review_date : new Date(row.review_date)) : null;
  const isResolved = statusToIsResolved(row.status);
  const checkDateStr = checkDate ? formatDate(checkDate) : null;
  const expiryStatus = calcExpiryStatus(checkDateStr, isResolved, row.deadline_days);

  // 隐患位置：DB 已存则用 DB 值，否则从 description 自动匹配环卫/市政绿化作业中心下属乡镇/公园
  const dbLocation = row.location || '';
  const location = dbLocation || extractLocationFromDescription(row.description || '', townNames);

  return camelKeys({
    id: row.id,
    no: row.no || null,
    description: row.description || '',
    measure: row.measure || '',
    checkDate: checkDateStr,
    checker: row.checker || '',
    fixer: row.fixer || '',
    fixDate: fixDate ? formatDate(fixDate) : null,
    isResolved,
    expiryStatus,
    remark: row.remark || '',
    relatedRiskId: row.related_risk_id || null,
    riskLevel: row.risk_level || null,
    finderId: row.finder_id || null,
    responsibleId: row.responsible_id || null,
    correctorId: row.corrector_id || null,
    // P0-3: 检查/整改人员关联员工ID（花名册为基石）
    checkerId: row.checker_id || null,
    fixerId: row.fixer_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    hazardType: row.hazard_type || null,
    location,
    gridId: row.grid_id || null,
    rectification: row.rectification || '',
    reviewerId: row.reviewer_id || null,
    rectifyDate: rectifyDate ? formatDate(rectifyDate) : null,
    reviewDate: reviewDate ? formatDate(reviewDate) : null,
    reviewResult: row.review_result || null,
    deadlineDays: row.deadline_days || 30,
  });
}

// ========== 隐患过期 → 通知中心推送（urgent 级别）==========
async function notifyHazardExpiry(hazard, status) {
  try {
    if (!hazard) return;
    const title = status === 'expired'
      ? `隐患整改已过期：${hazard.description || '#'+hazard.id}`
      : `隐患整改临期提醒：${hazard.description || '#'+hazard.id}`;
    const content = status === 'expired'
      ? `隐患「${hazard.description || ''}」（检查日期 ${hazard.hazard_date || hazard.checkDate || '-'}）已超过整改期限，请立即处置。`
      : `隐患「${hazard.description || ''}」（检查日期 ${hazard.hazard_date || hazard.checkDate || '-'}）将在 7 天内到期整改，请尽快处置。`;
    await createNotification({
      userId: null, // 系统级广播
      title,
      content,
      type: 'alert', // urgent → alert 级别
      bizType: 'hazard_expired',
      bizId: String(hazard.id),
      pushWs: true,
    });
  } catch (err) {
    console.warn('[Hazards] 通知推送失败:', err.message);
  }
}

// ========== 反向联动：隐患整改完成 → 更新关联风险点 ==========
// 更新 risk_sources.last_hazard_check_date = 隐患整改完成日期（fix_date 或今天）
// 更新 risk_sources.hazard_count = 该风险点关联的未完成隐患数（递减逻辑通过重新统计实现）
async function syncRiskOnHazardResolve(riskId, fixDate, client) {
  if (!riskId) return;
  try {
    const today = fixDate || new Date().toISOString().slice(0, 10);
    if (isConnected()) {
      const sql = `
        UPDATE risk_sources
        SET last_hazard_check_date = $1,
            hazard_count = (
              SELECT COUNT(*)::int FROM hazards h
              WHERE h.related_risk_id = $2
                AND h.is_deleted = FALSE
                AND ${sqlStatusOpen('h.')}
            ),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `;
      if (client) {
        await client.query(sql, [today, riskId]);
      } else {
        await pool.query(sql, [today, riskId]);
      }
    }
    // 内存降级模式无 risk_sources 数据，这里不做处理
  } catch (err) {
    console.warn('[Hazards] 反向联动更新风险点失败:', err.message);
  }
}

// ========== GET / — 列表 ==========
async function list(query) {
  let townNames = [];
  try {
    const client = await pool.connect();
    try {
      townNames = await getOrgTownNames(client);
    } finally {
      client.release();
    }
  } catch (e) {
    console.warn('[Hazards] 预加载组织乡镇名称失败:', e.message);
  }

  if (!isConnected()) {
    initMemoryData();
    let data = memoryRecords.filter(r => !r.is_deleted);
    const { page = 1, pageSize = 20, keyword, isResolved, startDate, endDate, status, hazardType, riskLevel } = query;
    if (keyword) {
      const kw = keyword.toLowerCase();
      data = data.filter(r =>
        (r.description && r.description.toLowerCase().includes(kw)) ||
        (r.checker && r.checker.toLowerCase().includes(kw)) ||
        (r.fixer && r.fixer.toLowerCase().includes(kw))
      );
    }
    if (isResolved) {
      data = data.filter(r => statusToIsResolved(r.status) === isResolved);
    }
    if (status) {
      data = data.filter(r => r.status === status);
    }
    if (hazardType) {
      data = data.filter(r => r.hazard_type === hazardType);
    }
    if (riskLevel) {
      data = data.filter(r => r.risk_level === riskLevel);
    }
    if (startDate) {
      data = data.filter(r => {
        const d = r.hazard_date ? new Date(r.hazard_date) : null;
        return d && d >= new Date(startDate);
      });
    }
    if (endDate) {
      data = data.filter(r => {
        const d = r.hazard_date ? new Date(r.hazard_date) : null;
        return d && d <= new Date(endDate);
      });
    }
    const { list: mList, total } = paginateMemory(data, page, pageSize);
    return ok({ list: mList.map((r) => formatRow(r, townNames)), total, page: parseInt(page), pageSize: parseInt(pageSize) }, '查询成功(内存模式)');
  }

  let whereSql = ' WHERE is_deleted = false';
  const params = [];
  let paramIdx = 0;

  const { page = 1, pageSize = 20, keyword, isResolved, startDate, endDate, status, hazardType, riskLevel } = query;

  if (keyword) {
    paramIdx++;
    whereSql += ` AND (description ILIKE $${paramIdx} OR checker ILIKE $${paramIdx} OR fixer ILIKE $${paramIdx})`;
    params.push(`%${keyword}%`);
  }
  if (isResolved) {
    // P3-04-00.2 (F-04c)：canonical 集合判定，替代原先 `status = '已完成'/'未完成'` 的等值匹配
    whereSql += ` AND ${isResolved === '是' ? sqlStatusClosed() : sqlStatusOpen()}`;
  }
  if (status) {
    paramIdx++;
    whereSql += ` AND status = $${paramIdx}`;
    params.push(status);
  }
  if (hazardType) {
    paramIdx++;
    whereSql += ` AND hazard_type = $${paramIdx}`;
    params.push(hazardType);
  }
  if (riskLevel) {
    paramIdx++;
    whereSql += ` AND risk_level = $${paramIdx}`;
    params.push(riskLevel);
  }
  if (startDate) {
    paramIdx++;
    whereSql += ` AND hazard_date >= $${paramIdx}`;
    params.push(startDate);
  }
  if (endDate) {
    paramIdx++;
    whereSql += ` AND hazard_date <= $${paramIdx}`;
    params.push(endDate);
  }

  const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM hazards${whereSql}`, params);
  const total = countResult.rows[0].total;

  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  paramIdx++;
  const limitP = paramIdx;
  params.push(parseInt(pageSize));
  paramIdx++;
  const offsetP = paramIdx;
  params.push(offset);

  const result = await pool.query(
    `SELECT * FROM hazards${whereSql} ORDER BY hazard_date DESC, id DESC LIMIT $${limitP} OFFSET $${offsetP}`,
    params
  );

  return ok({
    list: result.rows.map((r) => formatRow(r, townNames)),
    total,
    page: parseInt(page),
    pageSize: parseInt(pageSize)
  }, '查询成功');
}

// ========== GET /stats — 统计 ==========
async function stats() {
  if (!isConnected()) {
    const total = memoryRecords.filter(r => !r.is_deleted).length;
    const resolved = memoryRecords.filter(r => !r.is_deleted && statusToIsResolved(r.status) === '是').length;
    return ok({
      total,
      resolved,
      unresolved: total - resolved,
      discovered: memoryRecords.filter(r => !r.is_deleted && r.status === HAZARD_STATUS.DISCOVERED).length,
      processing: memoryRecords.filter(r => !r.is_deleted && r.status === HAZARD_STATUS.PROCESSING).length,
      pendingReview: memoryRecords.filter(r => !r.is_deleted && r.status === HAZARD_STATUS.PENDING_REVIEW).length,
      closed: memoryRecords.filter(r => !r.is_deleted && r.status === HAZARD_STATUS.CLOSED).length,
      byDepartment: [],
      byPosition: [],
      byRegion: [],
      repeatedHazards: [],
    }, '统计成功(内存模式)');
  }

  const [totalR, discoveredR, processingR, pendingReviewR, closedR] = await Promise.all([
    pool.query('SELECT COUNT(*)::int AS total FROM hazards WHERE is_deleted = false'),
    pool.query(`SELECT COUNT(*)::int AS total FROM hazards WHERE is_deleted = false AND status = '${HAZARD_STATUS.DISCOVERED}'`),
    pool.query(`SELECT COUNT(*)::int AS total FROM hazards WHERE is_deleted = false AND status = '${HAZARD_STATUS.PROCESSING}'`),
    pool.query(`SELECT COUNT(*)::int AS total FROM hazards WHERE is_deleted = false AND status = '${HAZARD_STATUS.PENDING_REVIEW}'`),
    pool.query(`SELECT COUNT(*)::int AS total FROM hazards WHERE is_deleted = false AND status = '${HAZARD_STATUS.CLOSED}'`),
  ]);

  const total = totalR.rows[0].total;
  const discovered = discoveredR.rows[0].total;
  const processing = processingR.rows[0].total;
  const pendingReview = pendingReviewR.rows[0].total;
  const closed = closedR.rows[0].total;

  const departmentStats = await pool.query(`
    SELECT ou.org_name AS department_name, COUNT(*)::int AS total
    FROM hazards h
    LEFT JOIN hse_org_unit ou ON h.responsible_id = (
      SELECT ear.org_unit_id FROM employee_assignment ear
      WHERE ear.employee_id = h.responsible_id AND ear.is_current = true LIMIT 1
    )
    WHERE h.is_deleted = false AND h.responsible_id IS NOT NULL
    GROUP BY ou.org_name
    ORDER BY total DESC
    LIMIT 20
  `);

  const positionStats = await pool.query(`
    SELECT pos.name AS position_name, COUNT(*)::int AS total
    FROM hazards h
    LEFT JOIN employee_assignment ear ON ear.employee_id = h.responsible_id AND ear.is_current = true
    LEFT JOIN position pos ON pos.id = ear.position_id
    WHERE h.is_deleted = false AND h.responsible_id IS NOT NULL
    GROUP BY pos.name
    ORDER BY total DESC
    LIMIT 20
  `);

  const regionStats = await pool.query(`
    SELECT h.location AS region, COUNT(*)::int AS total
    FROM hazards h
    WHERE h.is_deleted = false AND h.location IS NOT NULL AND h.location != ''
    GROUP BY h.location
    ORDER BY total DESC
    LIMIT 20
  `);

  const repeatedStats = await pool.query(`
    SELECT h.description, COUNT(*)::int AS repeat_count, 
           MIN(h.hazard_date)::text AS first_discovered,
           MAX(h.hazard_date)::text AS last_discovered
    FROM hazards h
    WHERE h.is_deleted = false
    GROUP BY h.description
    HAVING COUNT(*) > 1
    ORDER BY repeat_count DESC
    LIMIT 20
  `);

  const highRiskStats = await pool.query(`
    SELECT COUNT(*)::int AS total FROM hazards WHERE is_deleted = false AND risk_level IN ('重大', '一级', 'high')
  `);

  const overdueStats = await pool.query(`
    SELECT COUNT(*)::int AS total FROM hazards h
    WHERE h.is_deleted = false 
      AND h.status != '${HAZARD_STATUS.CLOSED}'
      AND h.hazard_date IS NOT NULL
      AND h.hazard_date + (h.deadline_days || ' days')::interval < CURRENT_DATE
  `);

  return ok({
    total,
    discovered,
    processing,
    pendingReview,
    closed,
    highRiskCount: highRiskStats.rows[0].total,
    overdueCount: overdueStats.rows[0].total,
    byDepartment: departmentStats.rows.map(camelKeys),
    byPosition: positionStats.rows.map(camelKeys),
    byRegion: regionStats.rows.map(camelKeys),
    repeatedHazards: repeatedStats.rows.map(camelKeys),
  }, '统计成功');
}

// ========== GET /:id/related-risk — 获取隐患关联的风险点信息 ==========
async function relatedRisk(params) {
  const { id } = params;

  if (!isConnected()) {
    initMemoryData();
    const record = memoryRecords.find((r) => r.id === parseInt(id) && !r.is_deleted);
    if (!record) return notFound('隐患不存在');
    const rid = record.related_risk_id;
    if (!rid) return ok(null, '无关联风险点(内存模式)');
    // 内存降级模式无 risk_sources 数据，仅返回关联 id
    return ok({ id: rid, riskLevel: record.risk_level || null }, '查询成功(内存模式)');
  }

  await ensureTables();

  // 通过 hazards.related_risk_id 直接关联 risk_sources
  const result = await pool.query(`
    SELECT rs.id, rs.name, rs.level, rs.type, rs.location, rs.area, rs.status,
           rs.measures, rs.assessment_date, rs.review_cycle,
           rs.last_hazard_check_date, rs.hazard_count
    FROM hazards h
    JOIN risk_sources rs ON rs.id = h.related_risk_id AND rs.is_deleted = FALSE
    WHERE h.id = $1 AND h.is_deleted = FALSE
  `, [id]);

  if (result.rows.length === 0) {
    return ok(null, '无关联风险点');
  }

  return ok(camelKeys(result.rows[0]), '查询成功');
}

// ========== CSV 导出辅助 ==========
function buildHazardCsv(data) {
  const headers = ['ID', '序号', '隐患描述', '整改措施', '检查时间', '检查人员', '整改人员', '整改时间', '整改状态', '时效状态', '备注', '创建时间'];
  const rows = data.map(r => [
    r.id || '',
    r.no !== null && r.no !== undefined ? r.no : '',
    (r.description || '').replace(/"/g, '""'),
    (r.measure || '').replace(/"/g, '""'),
    r.hazard_date ? new Date(r.hazard_date).toISOString().slice(0, 10) : '',
    r.checker || '',
    r.fixer || '',
    r.fix_date ? new Date(r.fix_date).toISOString().slice(0, 10) : '',
    r.status || r.isResolved || '',
    r.expiry_status || r.expiryStatus || '',
    (r.remark || '').replace(/"/g, '""'),
    r.created_at ? new Date(r.created_at).toISOString().slice(0, 10) : '',
  ].map(v => `"${v}"`).join(','));
  return '\uFEFF' + headers.map(h => `"${h}"`).join(',') + '\n' + rows.join('\n');
}

// ========== GET /export — 导出隐患清单（CSV） ==========
async function exportCsv() {
  if (!isConnected()) {
    initMemoryData();
    const data = memoryRecords.filter(r => !r.is_deleted).map(r => ({
      ...r,
      expiry_status: calcExpiryStatus(r.hazard_date, statusToIsResolved(r.status)),
    }));
    return { __t: 'csv', csv: buildHazardCsv(data) };
  }

  const result = await pool.query(`
    SELECT id, no, hazard_date, description, measure, checker, fixer, fix_date, status, remark, created_at
    FROM hazards WHERE is_deleted = FALSE ORDER BY hazard_date DESC NULLS LAST, id DESC
  `);
  const list = result.rows.map(r => ({
    ...r,
    expiry_status: calcExpiryStatus(r.hazard_date, statusToIsResolved(r.status)),
  }));
  return { __t: 'csv', csv: buildHazardCsv(list) };
}

// ========== GET /:id — 单条 ==========
async function detail(params) {
  if (!isConnected()) {
    initMemoryData();
    const record = memoryRecords.find(r => r.id === parseInt(params.id) && !r.is_deleted);
    if (!record) return notFound();
    return ok(formatRow(record), '查询成功');
  }

  const result = await pool.query('SELECT * FROM hazards WHERE id = $1 AND is_deleted = false', [params.id]);
  if (result.rows.length === 0) return err(-2, '记录不存在');
  return ok(formatRow(result.rows[0]), '查询成功');
}

// ========== POST / — 创建 ==========
async function create(body, req) {
  const b = body;
  const description = b.description || '';
  const measure = b.measure || '';
  const hazardDate = b.checkDate || b.hazard_date || null;
  const checker = b.checker || '';
  const fixer = b.fixer || '';
  const fixDate = b.fixDate || b.fix_date || null;
  const relatedRiskId = b.relatedRiskId || b.related_risk_id || null;
  const riskLevel = b.riskLevel || b.risk_level || null;
  const finderId = b.finderId || b.finder_id || null;
  const responsibleId = b.responsibleId || b.responsible_id || null;
  const correctorId = b.correctorId || b.corrector_id || null;
  // P0-3: 检查/整改人员关联员工ID（花名册为基石）
  const checkerId = b.checkerId || b.checker_id || null;
  const fixerId = b.fixerId || b.fixer_id || null;
  const hazardType = b.hazardType || b.hazard_type || null;
  const location = b.location || '';
  const gridId = b.gridId || b.grid_id || null;
  const deadlineDays = b.deadlineDays || b.deadline_days || 30;

  // P3-04-00 (W1): 生命周期初始状态由服务端决定。
  // 忽略客户端传入的 status / isResolved，防止伪造 closed / processing 绕过状态机。
  const status = HAZARD_STATUS.DISCOVERED;

  if (!isConnected()) {
    initMemoryData();
    const record = buildMemoryRecord(memoryIdCounter++, {
      no: b.no || null,
      hazard_date: hazardDate,
      description,
      measure,
      checker,
      fixer,
      fix_date: fixDate,
      status,
      remark: b.remark || '',
      related_risk_id: relatedRiskId,
      risk_level: riskLevel,
      finder_id: finderId,
      responsible_id: responsibleId,
      corrector_id: correctorId,
      checker_id: checkerId,
      fixer_id: fixerId,
      hazard_type: hazardType,
      location,
      grid_id: gridId,
      deadline_days: deadlineDays,
    });
    memoryRecords.push(record);
    return ok(formatRow(record), '创建成功(内存模式)');
  }

  await ensureTables();

  const result = await pool.query(`
    INSERT INTO hazards (no, hazard_date, description, measure, checker, fixer, fix_date, status, remark, related_risk_id, risk_level, finder_id, responsible_id, corrector_id, checker_id, fixer_id, hazard_type, location, grid_id, deadline_days)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
    RETURNING *
  `, [
    b.no || null, hazardDate, description, measure,
    checker, fixer, fixDate, status, b.remark || '',
    relatedRiskId, riskLevel, finderId, responsibleId, correctorId,
    checkerId, fixerId,
    hazardType, location, gridId, deadlineDays
  ]);

  const newHazard = result.rows[0];

  hseEventSync.syncHazard(newHazard.id, newHazard).catch(err => {
    console.error('Failed to sync hazard to hse_events:', err.message);
  });

  if (riskLevel && ['重大', '一级', 'high', 'critical'].includes(riskLevel)) {
    notifyHazardExpiry(newHazard, 'expiring').catch(() => {});
  }

  auditLog({ userId: req?.user?.id, username: req?.user?.username, action: 'create', module: 'hazards', description: `创建隐患记录`, ip: req?.ip }).catch(() => {});
  return ok(formatRow(newHazard), '创建成功');
}

// ========== PUT /:id — 更新 ==========
async function update(params, body, req) {
  const b = body;
  const setClauses = [];
  const ps = [];
  let i = 1;

  if (b.no !== undefined) { setClauses.push(`no = $${i++}`); ps.push(b.no); }
  if (b.description !== undefined) { setClauses.push(`description = $${i++}`); ps.push(b.description); }
  if (b.measure !== undefined) { setClauses.push(`measure = $${i++}`); ps.push(b.measure); }
  if (b.checkDate !== undefined) { setClauses.push(`hazard_date = $${i++}`); ps.push(b.checkDate); }
  if (b.checker !== undefined) { setClauses.push(`checker = $${i++}`); ps.push(b.checker); }
  if (b.fixer !== undefined) { setClauses.push(`fixer = $${i++}`); ps.push(b.fixer); }
  if (b.fixDate !== undefined) { setClauses.push(`fix_date = $${i++}`); ps.push(b.fixDate); }
  if (b.remark !== undefined) { setClauses.push(`remark = $${i++}`); ps.push(b.remark); }
  if (b.relatedRiskId !== undefined) { setClauses.push(`related_risk_id = $${i++}`); ps.push(b.relatedRiskId || null); }
  if (b.riskLevel !== undefined) { setClauses.push(`risk_level = $${i++}`); ps.push(b.riskLevel || null); }
  if (b.finderId !== undefined) { setClauses.push(`finder_id = $${i++}`); ps.push(b.finderId || null); }
  if (b.responsibleId !== undefined) { setClauses.push(`responsible_id = $${i++}`); ps.push(b.responsibleId || null); }
  if (b.correctorId !== undefined) { setClauses.push(`corrector_id = $${i++}`); ps.push(b.correctorId || null); }
  // P0-3: 检查/整改人员关联员工ID
  if (b.checkerId !== undefined || b.checker_id !== undefined) { setClauses.push(`checker_id = $${i++}`); ps.push(b.checkerId || b.checker_id || null); }
  if (b.fixerId !== undefined || b.fixer_id !== undefined) { setClauses.push(`fixer_id = $${i++}`); ps.push(b.fixerId || b.fixer_id || null); }

  if (b.hazardType !== undefined) { setClauses.push(`hazard_type = $${i++}`); ps.push(b.hazardType || null); }
  if (b.location !== undefined) { setClauses.push(`location = $${i++}`); ps.push(b.location); }
  if (b.gridId !== undefined) { setClauses.push(`grid_id = $${i++}`); ps.push(b.gridId || null); }
  if (b.rectification !== undefined) { setClauses.push(`rectification = $${i++}`); ps.push(b.rectification); }
  if (b.reviewerId !== undefined) { setClauses.push(`reviewer_id = $${i++}`); ps.push(b.reviewerId || null); }
  if (b.rectifyDate !== undefined) { setClauses.push(`rectify_date = $${i++}`); ps.push(b.rectifyDate || null); }
  if (b.reviewDate !== undefined) { setClauses.push(`review_date = $${i++}`); ps.push(b.reviewDate || null); }
  if (b.reviewResult !== undefined) { setClauses.push(`review_result = $${i++}`); ps.push(b.reviewResult || null); }
  if (b.deadlineDays !== undefined) { setClauses.push(`deadline_days = $${i++}`); ps.push(b.deadlineDays); }

  // P3-04-00 (W2): 普通更新禁止修改生命周期 status（含 isResolved 派生入口）。
  // 即使客户端传 status / isResolved 也被忽略，不进入 SQL；状态只能经
  // rectify / submitReview / review / close 业务动作变更。

  setClauses.push('updated_at = CURRENT_TIMESTAMP');
  ps.push(params.id);

  if (!isConnected()) {
    initMemoryData();
    const idx = memoryRecords.findIndex(r => r.id === parseInt(params.id) && !r.is_deleted);
    if (idx === -1) return err(-2, '记录不存在');
    if (b.no !== undefined) memoryRecords[idx].no = b.no;
    if (b.description !== undefined) memoryRecords[idx].description = b.description;
    if (b.measure !== undefined) memoryRecords[idx].measure = b.measure;
    if (b.checkDate !== undefined) memoryRecords[idx].hazard_date = b.checkDate;
    if (b.checker !== undefined) memoryRecords[idx].checker = b.checker;
    if (b.fixer !== undefined) memoryRecords[idx].fixer = b.fixer;
    if (b.fixDate !== undefined) memoryRecords[idx].fix_date = b.fixDate;
    if (b.remark !== undefined) memoryRecords[idx].remark = b.remark;
    if (b.relatedRiskId !== undefined) memoryRecords[idx].related_risk_id = b.relatedRiskId || null;
    if (b.riskLevel !== undefined) memoryRecords[idx].risk_level = b.riskLevel || null;
    if (b.finderId !== undefined) memoryRecords[idx].finder_id = b.finderId || null;
    if (b.responsibleId !== undefined) memoryRecords[idx].responsible_id = b.responsibleId || null;
    if (b.correctorId !== undefined) memoryRecords[idx].corrector_id = b.correctorId || null;

    if (b.hazardType !== undefined) memoryRecords[idx].hazard_type = b.hazardType || null;
    if (b.location !== undefined) memoryRecords[idx].location = b.location;
    if (b.gridId !== undefined) memoryRecords[idx].grid_id = b.gridId || null;
    if (b.rectification !== undefined) memoryRecords[idx].rectification = b.rectification;
    if (b.reviewerId !== undefined) memoryRecords[idx].reviewer_id = b.reviewerId || null;
    if (b.rectifyDate !== undefined) memoryRecords[idx].rectify_date = b.rectifyDate || null;
    if (b.reviewDate !== undefined) memoryRecords[idx].review_date = b.reviewDate || null;
    if (b.reviewResult !== undefined) memoryRecords[idx].review_result = b.reviewResult || null;
    if (b.deadlineDays !== undefined) memoryRecords[idx].deadline_days = b.deadlineDays;

    // P3-04-00 (W2): 内存镜像同样忽略客户端 status/isResolved，生命周期状态不变。
    memoryRecords[idx].updated_at = new Date().toISOString();

    return ok(formatRow(memoryRecords[idx]), '更新成功(内存模式)');
  }

  const result = await pool.query(
    `UPDATE hazards SET ${setClauses.join(', ')} WHERE id = $${i} AND is_deleted = false RETURNING *`,
    ps
  );

  if (result.rows.length === 0) return err(-2, '记录不存在');

  const updated = result.rows[0];

  // P3-04-00 (W2): update 不再改变 status，因此不再在此处触发“隐患关闭→风险联动”。
  // 风险联动只由 review(pass) / close 等真实关闭动作触发。

  try {
    const isResolvedNow = statusToIsResolved(updated.status);
    const newExpiry = calcExpiryStatus(updated.hazard_date, isResolvedNow, updated.deadline_days);
    // 只有未关闭的隐患才提醒（以 DB 真实 status 为准，不再依赖客户端参数）
    if (newExpiry === 'expired' && updated.status !== HAZARD_STATUS.CLOSED) {
      await notifyHazardExpiry(updated, 'expired');
    } else if (newExpiry === 'expiring' && updated.status !== HAZARD_STATUS.CLOSED) {
      await notifyHazardExpiry(updated, 'expiring');
    }
  } catch (_e) {
  }

  auditLog({ userId: req?.user?.id, username: req?.user?.username, action: 'update', module: 'hazards', description: `更新隐患 ID=${params.id}`, ip: req?.ip }).catch(() => {});
  return ok(formatRow(updated), '更新成功');
}

// ========== DELETE /:id — 软删除 ==========
async function remove(params, req) {
  if (!isConnected()) {
    initMemoryData();
    const record = memoryRecords.find(r => r.id === parseInt(params.id) && !r.is_deleted);
    if (!record) return err(-2, '记录不存在');
    record.is_deleted = true;
    return ok(null, '删除成功(内存模式)');
  }

  const result = await pool.query(
    'UPDATE hazards SET is_deleted = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND is_deleted = false RETURNING id',
    [params.id]
  );
  if (result.rows.length === 0) return err(-2, '记录不存在');
  auditLog({ userId: req?.user?.id, username: req?.user?.username, action: 'delete', module: 'hazards', description: `删除隐患 ID=${params.id}`, ip: req?.ip }).catch(() => {});
  return ok(null, '删除成功');
}

// ========== PUT /:id/rectify — 整改提交 ==========
// 状态: discovered → processing
async function rectify(params, body, req) {
  if (!isConnected()) {
    initMemoryData();
    const idx = memoryRecords.findIndex(r => r.id === parseInt(params.id) && !r.is_deleted);
    if (idx === -1) return err(-2, '记录不存在');
    const b = body;
    memoryRecords[idx].status = HAZARD_STATUS.PROCESSING;
    memoryRecords[idx].corrector_id = b.correctorId || b.corrector_id || memoryRecords[idx].corrector_id;
    memoryRecords[idx].rectification = b.rectification || memoryRecords[idx].rectification;
    memoryRecords[idx].rectify_date = b.rectifyDate || b.rectify_date || new Date().toISOString().slice(0, 10);
    memoryRecords[idx].updated_at = new Date().toISOString();
    return ok(formatRow(memoryRecords[idx]), '整改提交成功(内存模式)');
  }

  const { correctorId, rectification, rectifyDate } = body;

  const result = await pool.query(`
    UPDATE hazards 
    SET status = '${HAZARD_STATUS.PROCESSING}',
        corrector_id = COALESCE($1, corrector_id),
        rectification = COALESCE($2, rectification),
        rectify_date = COALESCE($3, CURRENT_DATE),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $4 AND is_deleted = false AND status = '${HAZARD_STATUS.DISCOVERED}'
    RETURNING *
  `, [correctorId || null, rectification || null, rectifyDate || null, params.id]);

  if (result.rows.length === 0) {
    return err(-2, '隐患不存在或状态不允许整改');
  }

  auditLog({ userId: req?.user?.id, username: req?.user?.username, action: 'rectify', module: 'hazards', description: `隐患整改提交 ID=${params.id}`, ip: req?.ip }).catch(() => {});
  return ok(formatRow(result.rows[0]), '整改提交成功');
}

// ========== PUT /:id/submit-review — 提交复查 ==========
// 状态: processing → pending_review
async function submitReview(params, req) {
  if (!isConnected()) {
    initMemoryData();
    const idx = memoryRecords.findIndex(r => r.id === parseInt(params.id) && !r.is_deleted);
    if (idx === -1) return err(-2, '记录不存在');
    memoryRecords[idx].status = HAZARD_STATUS.PENDING_REVIEW;
    memoryRecords[idx].updated_at = new Date().toISOString();
    return ok(formatRow(memoryRecords[idx]), '提交复查成功(内存模式)');
  }

  const result = await pool.query(`
    UPDATE hazards 
    SET status = '${HAZARD_STATUS.PENDING_REVIEW}',
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND is_deleted = false AND status = '${HAZARD_STATUS.PROCESSING}'
    RETURNING *
  `, [params.id]);

  if (result.rows.length === 0) {
    return err(-2, '隐患不存在或状态不允许提交复查');
  }

  auditLog({ userId: req?.user?.id, username: req?.user?.username, action: 'submit_review', module: 'hazards', description: `提交隐患复查 ID=${params.id}`, ip: req?.ip }).catch(() => {});
  return ok(formatRow(result.rows[0]), '提交复查成功');
}

// ========== PUT /:id/review — 复查确认 ==========
// 状态: pending_review → closed(合格) 或 processing(不合格)
async function review(params, body, req) {
  const { reviewerId, reviewResult, reviewNote, reviewDate } = body;
  if (!reviewResult || !['pass', 'fail'].includes(reviewResult)) {
    return err(-3, '复查结果必须是 pass(合格) 或 fail(不合格)');
  }

  if (!isConnected()) {
    initMemoryData();
    const idx = memoryRecords.findIndex(r => r.id === parseInt(params.id) && !r.is_deleted);
    if (idx === -1) return err(-2, '记录不存在');
    memoryRecords[idx].status = reviewResult === 'pass' ? HAZARD_STATUS.CLOSED : HAZARD_STATUS.PROCESSING;
    memoryRecords[idx].reviewer_id = reviewerId || null;
    memoryRecords[idx].review_result = reviewResult;
    memoryRecords[idx].rectification = reviewNote || memoryRecords[idx].rectification;
    memoryRecords[idx].review_date = reviewDate || new Date().toISOString().slice(0, 10);
    memoryRecords[idx].updated_at = new Date().toISOString();
    return ok(formatRow(memoryRecords[idx]), `复查${reviewResult === 'pass' ? '合格' : '不合格'}(内存模式)`);
  }

  const newStatus = reviewResult === 'pass' ? HAZARD_STATUS.CLOSED : HAZARD_STATUS.PROCESSING;

  const result = await pool.query(`
    UPDATE hazards 
    SET status = '${newStatus}',
        reviewer_id = COALESCE($1, reviewer_id),
        review_result = $2,
        rectification = COALESCE($3, rectification),
        review_date = COALESCE($4, CURRENT_DATE),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $5 AND is_deleted = false AND status = '${HAZARD_STATUS.PENDING_REVIEW}'
    RETURNING *
  `, [reviewerId || null, reviewResult, reviewNote || null, reviewDate || null, params.id]);

  if (result.rows.length === 0) {
    return err(-2, '隐患不存在或状态不允许复查');
  }

  const updated = result.rows[0];
  if (reviewResult === 'pass') {
    await syncRiskOnHazardResolve(updated.related_risk_id, updated.review_date);
  }

  auditLog({ userId: req?.user?.id, username: req?.user?.username, action: 'review', module: 'hazards', description: `隐患复查${reviewResult === 'pass' ? '合格' : '不合格'} ID=${params.id}`, ip: req?.ip }).catch(() => {});
  return ok(formatRow(updated), `复查${reviewResult === 'pass' ? '合格，已关闭' : '不合格，重新整改'}`);
}

// ========== PUT /:id/close — 关闭（P3-04-00 加源状态守卫） ==========
// 唯一合法源状态：pending_review。禁止 discovered / processing 直接关闭，
// 从而不能绕过 rectify → submitReview → review(pass) 状态机。
async function close(params, body, req) {
  if (!isConnected()) {
    initMemoryData();
    const idx = memoryRecords.findIndex(r => r.id === parseInt(params.id) && !r.is_deleted);
    if (idx === -1) return err(-2, '记录不存在');
    if (memoryRecords[idx].status !== HAZARD_STATUS.PENDING_REVIEW) {
      return err(-2, '隐患状态不允许关闭（仅待复查可关闭）');
    }
    memoryRecords[idx].status = HAZARD_STATUS.CLOSED;
    memoryRecords[idx].updated_at = new Date().toISOString();
    return ok(formatRow(memoryRecords[idx]), '隐患关闭成功(内存模式)');
  }

  const { closeNote } = body;

  const result = await pool.query(`
    UPDATE hazards 
    SET status = '${HAZARD_STATUS.CLOSED}',
        rectification = COALESCE($1, rectification),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $2 AND is_deleted = false AND status = '${HAZARD_STATUS.PENDING_REVIEW}'
    RETURNING *
  `, [closeNote || null, params.id]);

  if (result.rows.length === 0) {
    // 区分“不存在”与“状态不允许”，便于测试与前端提示
    const exists = await pool.query(
      'SELECT id FROM hazards WHERE id = $1 AND is_deleted = false',
      [params.id]
    );
    if (exists.rows.length === 0) return err(-2, '隐患不存在');
    return err(-2, '隐患状态不允许关闭（仅待复查可关闭）');
  }

  const updated = result.rows[0];
  await syncRiskOnHazardResolve(updated.related_risk_id, updated.review_date);

  auditLog({ userId: req?.user?.id, username: req?.user?.username, action: 'close', module: 'hazards', description: `关闭隐患 ID=${params.id}`, ip: req?.ip }).catch(() => {});
  return ok(formatRow(updated), '隐患关闭成功');
}

// ========== GET /reminders/high-risk — 重大隐患提醒 ==========
async function remindersHighRisk() {
  if (!isConnected()) {
    return ok({ list: [], total: 0 }, '数据库未连接');
  }

  const result = await pool.query(`
    SELECT h.*, e.name AS responsible_name
    FROM hazards h
    LEFT JOIN v_employee_current e ON h.responsible_id = e.employee_id
    WHERE h.is_deleted = false 
      AND h.status != '${HAZARD_STATUS.CLOSED}'
      AND h.risk_level IN ('重大', '一级', 'high', 'critical')
    ORDER BY h.hazard_date DESC
  `);

  return ok({
    list: result.rows.map(r => ({ ...camelKeys(r), statusLabel: getStatusLabel(r.status) })),
    total: result.rows.length,
  }, '查询成功');
}

// ========== GET /reminders/overdue — 超期隐患统计 ==========
async function remindersOverdue() {
  if (!isConnected()) {
    return ok({ list: [], total: 0 }, '数据库未连接');
  }

  const result = await pool.query(`
    SELECT h.*, e.name AS responsible_name,
           ROUND(EXTRACT(DAY FROM AGE(CURRENT_DATE, h.hazard_date + (h.deadline_days || ' days')::interval)))::int AS overdue_days
    FROM hazards h
    LEFT JOIN v_employee_current e ON h.responsible_id = e.employee_id
    WHERE h.is_deleted = false 
      AND h.status != '${HAZARD_STATUS.CLOSED}'
      AND h.hazard_date IS NOT NULL
      AND h.hazard_date + (h.deadline_days || ' days')::interval < CURRENT_DATE
    ORDER BY overdue_days DESC
  `);

  return ok({
    list: result.rows.map(r => ({ ...camelKeys(r), statusLabel: getStatusLabel(r.status) })),
    total: result.rows.length,
  }, '查询成功');
}

// ========== GET /analysis/repeated — 重复隐患分析 ==========
async function analysisRepeated() {
  if (!isConnected()) {
    return ok({ list: [], total: 0 }, '数据库未连接');
  }

  const result = await pool.query(`
    SELECT h.description, h.hazard_type, h.risk_level, h.location,
           COUNT(*)::int AS repeat_count,
           MIN(h.hazard_date)::text AS first_discovered,
           MAX(h.hazard_date)::text AS last_discovered,
           SUM(CASE WHEN h.status = '${HAZARD_STATUS.CLOSED}' THEN 1 ELSE 0 END)::int AS closed_count
    FROM hazards h
    WHERE h.is_deleted = false
    GROUP BY h.description, h.hazard_type, h.risk_level, h.location
    HAVING COUNT(*) > 1
    ORDER BY repeat_count DESC
    LIMIT 50
  `);

  return ok({
    list: result.rows.map(camelKeys),
    total: result.rows.length,
  }, '查询成功');
}

// ========== GET /analysis/responsible-overdue — 责任人超期统计 ==========
async function analysisResponsibleOverdue() {
  if (!isConnected()) {
    return ok({ list: [], total: 0 }, '数据库未连接');
  }

  const result = await pool.query(`
    SELECT e.employee_id AS responsible_id, e.name AS responsible_name, e.org_name AS department, e.position_name AS position,
           COUNT(*)::int AS total_hazards,
           SUM(CASE WHEN h.status = '${HAZARD_STATUS.CLOSED}' THEN 1 ELSE 0 END)::int AS closed_hazards,
           SUM(CASE WHEN h.status != '${HAZARD_STATUS.CLOSED}' AND h.hazard_date + (h.deadline_days || ' days')::interval < CURRENT_DATE THEN 1 ELSE 0 END)::int AS overdue_hazards
    FROM hazards h
    LEFT JOIN v_employee_current e ON h.responsible_id = e.employee_id
    WHERE h.is_deleted = false AND h.responsible_id IS NOT NULL
    GROUP BY e.employee_id, e.name, e.org_name, e.position_name
    ORDER BY overdue_hazards DESC, total_hazards DESC
    LIMIT 30
  `);

  return ok({
    list: result.rows.map(camelKeys),
    total: result.rows.length,
  }, '查询成功');
}

// ========== GET /:id/attachments — 附件列表 ==========
async function attachments(params, query) {
  const { id } = params;
  const { version = '' } = query;

  if (!isConnected()) {
    initMemoryData();
    let data = memoryHazardAttachments.filter(a => a.hazard_id === parseInt(id) && !a.is_deleted);
    if (version) data = data.filter(a => a.version === version);
    return ok(data.map(camelKeys), '查询成功(内存模式)');
  }

  await ensureTables();

  let sql = 'SELECT * FROM hazard_attachments WHERE hazard_id = $1 AND is_deleted = FALSE';
  const paramsArr = [id];
  let paramIdx = 1;
  if (version) {
    paramIdx++;
    sql += ` AND version = $${paramIdx}`;
    paramsArr.push(version);
  }
  sql += ' ORDER BY is_latest DESC, created_at DESC';

  const result = await pool.query(sql, paramsArr);
  return ok(result.rows.map(camelKeys), '查询成功');
}

// ========== POST /:id/attachments — 上传附件 ==========
async function uploadAttachment(req, params) {
  const { id } = params;
  if (!req.file) return err(-1, '请上传文件');

  const { version = '1.0', uploaded_by = 'admin' } = req.body;
  const fileUrl = getFileUrl(req, req.file.filename, 'documents');
  const originalName = fixFilenameEncoding(req.file.originalname);

  if (!isConnected()) {
    initMemoryData();
    memoryHazardAttachments.forEach(a => {
      if (a.hazard_id === parseInt(id) && a.is_latest) a.is_latest = false;
    });
    const record = buildMemoryRecord(memoryAttachmentIdCounter++, {
      hazard_id: parseInt(id),
      filename: req.file.filename,
      original_name: originalName,
      file_type: 'document',
      file_size: req.file.size,
      file_url: fileUrl,
      version,
      uploaded_by,
      is_latest: true,
    });
    memoryHazardAttachments.push(record);
    // 同步记录版本履历
    memoryHazardVersions.push(buildMemoryRecord(memoryVersionIdCounter++, {
      hazard_id: parseInt(id),
      version,
      change_type: 'create',
      change_summary: `上传附件 ${originalName}`,
      changed_by: uploaded_by,
    }));
    return ok(camelKeys(record), '上传成功(内存模式)');
  }

  await ensureTables();

  await pool.query(
    'UPDATE hazard_attachments SET is_latest = FALSE WHERE hazard_id = $1 AND is_latest = TRUE',
    [id]
  );

  const result = await pool.query(`
    INSERT INTO hazard_attachments (hazard_id, filename, original_name, file_type, file_size, file_url, version, uploaded_by, is_latest)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
    RETURNING *
  `, [id, req.file.filename, originalName, 'document', req.file.size, fileUrl, version, uploaded_by]);

  // 同步记录版本履历
  await pool.query(`
    INSERT INTO hazard_versions (hazard_id, version, change_type, change_summary, changed_by)
    VALUES ($1, $2, 'create', $3, $4)
  `, [id, version, `上传附件 ${originalName}`, uploaded_by]);

  return ok(camelKeys(result.rows[0]), '上传成功');
}

// ========== DELETE /:id/attachments/:aid — 删除附件 ==========
async function deleteAttachment(params) {
  const { id, aid } = params;

  if (!isConnected()) {
    initMemoryData();
    const att = memoryHazardAttachments.find(a => a.id === parseInt(aid) && a.hazard_id === parseInt(id) && !a.is_deleted);
    if (!att) return notFound('附件不存在');
    att.is_deleted = true;
    // 记录删除履历
    memoryHazardVersions.push(buildMemoryRecord(memoryVersionIdCounter++, {
      hazard_id: parseInt(id),
      version: att.version,
      change_type: 'delete',
      change_summary: `删除附件 ${att.original_name}`,
      changed_by: 'admin',
    }));
    return ok(null, '删除成功(内存模式)');
  }

  await ensureTables();

  // 获取附件信息用于版本记录
  const attResult = await pool.query(
    'SELECT * FROM hazard_attachments WHERE id = $1 AND hazard_id = $2',
    [aid, id]
  );
  if (attResult.rows.length === 0) return notFound('附件不存在');

  const result = await pool.query(
    'UPDATE hazard_attachments SET is_deleted = TRUE WHERE id = $1 AND hazard_id = $2 RETURNING id',
    [aid, id]
  );
  if (result.rows.length === 0) return notFound('附件不存在');

  // 同步记录版本履历
  await pool.query(`
    INSERT INTO hazard_versions (hazard_id, version, change_type, change_summary, changed_by)
    VALUES ($1, $2, 'delete', $3, $4)
  `, [id, attResult.rows[0].version, `删除附件 ${attResult.rows[0].original_name}`, 'admin']);

  return ok(null, '删除成功');
}

// ========== GET /:id/versions — 历史版本履历 ==========
async function versions(params) {
  const { id } = params;

  if (!isConnected()) {
    initMemoryData();
    const data = memoryHazardVersions.filter(v => v.hazard_id === parseInt(id));
    return ok(data.map(camelKeys), '查询成功(内存模式)');
  }

  await ensureTables();

  const result = await pool.query(
    'SELECT * FROM hazard_versions WHERE hazard_id = $1 ORDER BY created_at DESC',
    [id]
  );
  return ok(result.rows.map(camelKeys), '查询成功');
}

// ========== 规则 API ==========
const rulesLevels = () => ok(hseRules.getHazardLevels(), '获取隐患等级规则成功');
const rulesStatusFlow = () => ok(hseRules.getHazardStatusFlow(), '获取隐患状态流转规则成功');
const rulesSources = () => ok(hseRules.getHazardSources(), '获取隐患来源分类成功');
const rulesCategories = () => ok(hseRules.getHazardCategories(), '获取隐患类别成功');
const rulesExpiry = () => ok(hseRules.getHazardExpiryRules(), '获取隐患时效规则成功');
const rulesResponsibilityMatrix = () => ok(hseRules.getHazardResponsibilityMatrix(), '获取隐患责任矩阵成功');
const rulesAll = () => ok({
  hazardLevels: hseRules.getHazardLevels(),
  statusFlow: hseRules.getHazardStatusFlow(),
  hazardSources: hseRules.getHazardSources(),
  hazardCategories: hseRules.getHazardCategories(),
  expiryRules: hseRules.getHazardExpiryRules(),
  responsibilityMatrix: hseRules.getHazardResponsibilityMatrix(),
}, '获取隐患治理全部规则成功');

module.exports = {
  // P3-04-00: 状态常量与分类工具（供 alerts/dashboard 复用，避免第二套常量）
  HAZARD_STATUS,
  STATUS_MAP,
  NON_LIFECYCLE_STATUS,
  classifyStatus,
  // P3-04-00.2 (F-04): SQL 侧已闭环/未闭环判定（供 overview 等路由复用，禁止另写 '已完成' 字面量）
  sqlStatusClosed,
  sqlStatusOpen,
  SQL_CLOSED_STATUS_LIST,
  isCanonicalStatus,
  list,
  stats,
  relatedRisk,
  exportCsv,
  detail,
  create,
  update,
  remove,
  rectify,
  submitReview,
  review,
  close,
  remindersHighRisk,
  remindersOverdue,
  analysisRepeated,
  analysisResponsibleOverdue,
  attachments,
  uploadAttachment,
  deleteAttachment,
  versions,
  rulesLevels,
  rulesStatusFlow,
  rulesSources,
  rulesCategories,
  rulesExpiry,
  rulesResponsibilityMatrix,
  rulesAll,
};