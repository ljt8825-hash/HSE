/**
 * 事故管理模块（/api/accidents）—— 业务层
 * 原 routes/accidents.js（2107 行）全部业务 + SQL + 内存降级 + 建表启动逻辑收敛于此。
 * 每个端点对应一个 service 函数，返回统一描述符（__t: json / list / csv / not-found / validation-error），
 * 由 controllers/accidentController.js 的 respond() 解释为对外 JSON 契约，行为与原路由逐字节一致。
 *
 * 三张表：accidents + accident_attachments + accident_versions（PostgreSQL 双内存降级）。
 * 端点：GET / stats/all stats/yearly unsettled stats export / teams personnel-search suggest-team
 *       category-nature suggest-party :id ；POST / ；PUT /:id ；DELETE /:id ；
 *       attachments（GET 列表 / POST 上传 / DELETE 删除）+ versions。
 */

const { pool, isConnected } = require('../config/db');
const { auditLog } = require('../routes/audit');
const {
  buildListResponse,
  sendNotFound,
  sendValidationError,
  buildMemoryRecord,
  camelKeys,
  pickField,
} = require('../utils/commonResponse');
const hseEventSync = require('./hseEventSyncService');
const assessmentEvent = require('./assessmentEventService'); // 月度自动考核事件

// ========== 数据库表初始化（IF NOT EXISTS，可重复执行） ==========
let tablesInitialized = false;

async function ensureTables() {
  if (tablesInitialized) return;
  if (!isConnected()) return;
  try {
    // 1. 附件表
    await pool.query(`
      CREATE TABLE IF NOT EXISTS accident_attachments (
        id            BIGSERIAL PRIMARY KEY,
        accident_id   BIGINT NOT NULL,
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
    await pool.query('CREATE INDEX IF NOT EXISTS idx_accident_attachments_accident ON accident_attachments(accident_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_accident_attachments_latest ON accident_attachments(accident_id, is_latest) WHERE is_deleted = FALSE');

    // 2. 版本履历表
    await pool.query(`
      CREATE TABLE IF NOT EXISTS accident_versions (
        id             BIGSERIAL PRIMARY KEY,
        accident_id    BIGINT NOT NULL,
        version        VARCHAR(32) NOT NULL,
        change_type    VARCHAR(32) NOT NULL DEFAULT 'update',
        change_summary TEXT,
        changed_by     VARCHAR(64),
        snapshot       JSONB,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_accident_versions_accident ON accident_versions(accident_id)');

    // 3. accidents 表补充字段（整改期限天数 + 关联隐患/预案，向后兼容）
    try {
      await pool.query(`ALTER TABLE accidents ADD COLUMN IF NOT EXISTS rectification_deadline_days INT DEFAULT 30`);
      await pool.query(`ALTER TABLE accidents ADD COLUMN IF NOT EXISTS related_hazard_id BIGINT`);
      await pool.query(`ALTER TABLE accidents ADD COLUMN IF NOT EXISTS related_emergency_id BIGINT`);
      await pool.query(`ALTER TABLE accidents ADD COLUMN IF NOT EXISTS casualties INT DEFAULT 0`);
      await pool.query(`ALTER TABLE accidents ADD COLUMN IF NOT EXISTS injuries INT DEFAULT 0`);
      // P0-3: 关联车辆（交通事故 → vehicles 主键）；幂等，服务启动时自动补列
      await pool.query(`ALTER TABLE accidents ADD COLUMN IF NOT EXISTS vehicle_id BIGINT`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_accidents_vehicle_id ON accidents(vehicle_id) WHERE is_deleted = false AND vehicle_id IS NOT NULL`);
      // 事故台账字段：编号 / 当事人角色 / 责任班组（幂等）
      // 说明：responsibility 列已被“责任认定依据”（事故认定书/调查报告/其它）占用，
      //       责任班组另起 responsibility_team / responsibility_team_id，避免语义冲突。
      await pool.query(`ALTER TABLE accidents ADD COLUMN IF NOT EXISTS accident_no VARCHAR(32)`);
      await pool.query(`ALTER TABLE accidents ADD COLUMN IF NOT EXISTS involved_person_role VARCHAR(32)`);
      await pool.query(`ALTER TABLE accidents ADD COLUMN IF NOT EXISTS responsibility_team_id BIGINT`);
      await pool.query(`ALTER TABLE accidents ADD COLUMN IF NOT EXISTS responsibility_team VARCHAR(100)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_accidents_accident_no ON accidents(accident_no) WHERE is_deleted = false AND accident_no IS NOT NULL`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_accidents_resp_team ON accidents(responsibility_team_id) WHERE is_deleted = false AND responsibility_team_id IS NOT NULL`);
      // 报表口径字段（2026-08-31 引入，2026-09-01 折叠进启动迁移，纳入部署流程）：
      //   事故类别 / 事故性质 / 事故性质(三级) + 当事人所属部门 / 上级
      // 全部 IF NOT EXISTS 幂等，随后端每次启动自动补齐，新环境/新库无需手工跑脚本
      // （历史一次性脚本 _acc_migrate_20260831_v2.cjs 已由本段取代，保留作归档）
      await pool.query(`ALTER TABLE accidents ADD COLUMN IF NOT EXISTS accident_category VARCHAR(50)`);
      await pool.query(`ALTER TABLE accidents ADD COLUMN IF NOT EXISTS accident_nature VARCHAR(100)`);
      await pool.query(`ALTER TABLE accidents ADD COLUMN IF NOT EXISTS accident_nature_level3 VARCHAR(100)`);
      await pool.query(`ALTER TABLE accidents ADD COLUMN IF NOT EXISTS party_dept VARCHAR(100)`);
      await pool.query(`ALTER TABLE accidents ADD COLUMN IF NOT EXISTS party_dept_id BIGINT`);
      await pool.query(`ALTER TABLE accidents ADD COLUMN IF NOT EXISTS party_supervisor VARCHAR(200)`);
      await pool.query(`ALTER TABLE accidents ADD COLUMN IF NOT EXISTS party_supervisor_id BIGINT`);
      await pool.query(`ALTER TABLE accidents ADD COLUMN IF NOT EXISTS report_group BOOLEAN DEFAULT false`);
    } catch (_e) {
      // 字段已存在或表不存在，忽略
    }

    tablesInitialized = true;
    console.log('[Accidents] 数据库表 attachments/versions 已就绪');
  } catch (err) {
    console.warn('[Accidents] 数据库表初始化失败:', err.message);
  }
}

// ========== 部署即迁移（启动自检） ==========
// 背景：ensureTables() 原本只在部分端点首次被访问时触发，导致新环境部署后若只打开列表页，
//       报表口径列（accident_category / accident_nature / accident_nature_level3 / party_*）不会被创建。
// 方案：模块加载后等待连接池就绪（app.js 中 testConnection() 为异步），自动执行一次幂等建表补列；
//       全部 IF NOT EXISTS，可重复执行；失败静默，后续请求仍会在各自路由内重试。
(function ensureTablesOnStartup() {
  let tries = 0;
  const timer = setInterval(async () => {
    tries += 1;
    if (isConnected()) {
      clearInterval(timer);
      try {
        await ensureTables();
      } catch (_e) {
        // 静默：请求时路由内仍会兜底重试
      }
    } else if (tries >= 30) {
      clearInterval(timer);
    }
  }, 1000);
  timer.unref?.();
})();

// ========== 内存降级存储 ==========
let memoryRecords = [];
let memoryIdCounter = 1;
let memoryAttachments = [];
let memoryAttachmentIdCounter = 1;
let memoryVersions = [];
let memoryVersionIdCounter = 1;

function initMemoryData() {
  // 种子数据已移除，内存模式仅用于 API 兼容性（空数据）
  memoryRecords = [];
  memoryIdCounter = 1;
  memoryAttachments = [];
  memoryAttachmentIdCounter = 1;
  memoryVersions = [];
  memoryVersionIdCounter = 1;
}

// ========== 状态/等级/类型转换 ==========
const STATUS_CN_TO_EN = { '已上报': 'reported', '调查中': 'investigating', '处理中': 'processing', '已结案': 'closed' };
const STATUS_EN_TO_CN = { reported: '已上报', investigating: '调查中', processing: '处理中', closed: '已结案' };

const LEVEL_CN_TO_EN = { '重大': 'major', '较大': 'serious', '一般': 'general', '轻微': 'minor', '轻伤': 'minor', '重伤': 'serious', '死亡': 'major' };
const LEVEL_EN_TO_CN = { major: '重大', serious: '较大', general: '一般', minor: '轻微' };

const TYPE_CN_TO_EN = {
  '交通': 'traffic', '交通事故': 'traffic',
  '职业伤害': 'occupational', '职业': 'occupational', '工伤': 'occupational',
  '设备': 'equipment', '设备故障': 'equipment',
  '火灾': 'fire', '火灾事故': 'fire',
  '环境': 'environmental', '环境污染': 'environmental',
  '其他': 'other', '生产安全': 'other', '突发疾病': 'other'
};
const TYPE_EN_TO_CN = {
  traffic: '交通', occupational: '职业伤害', equipment: '设备',
  fire: '火灾', environmental: '环境', other: '其他'
};

function normalizeStatus(s) {
  if (!s) return 'reported';
  return STATUS_CN_TO_EN[s] || s;
}
function normalizeLevel(l) {
  if (!l) return 'general';
  return LEVEL_CN_TO_EN[l] || l;
}
function normalizeType(t) {
  if (!t) return 'other';
  return TYPE_CN_TO_EN[t] || t;
}
function statusToCn(s) {
  return STATUS_EN_TO_CN[s] || s || '已上报';
}
function levelToCn(l) {
  return LEVEL_EN_TO_CN[l] || l || '一般';
}
function typeToCn(t) {
  return TYPE_EN_TO_CN[t] || t || '其他';
}

// ========== 时效状态计算（事故整改/结案期限） ==========
// 规则：基于 accident_date + rectification_deadline_days(天) 计算到期日
// - 已结案 → closed（不计入时效）
// - 长期有效（无 deadline 或 deadline <= 0）→ permanent
// - 已过期 → expired（当前日期 > 到期日）
// - 临期 → expiring（距到期日 ≤ 7 天）
// - 正常 → normal
function calcExpiryStatus(accidentDate, deadlineDays, status) {
  // 已结案事故不再显示时效提醒
  if (status === 'closed' || status === '已结案') return 'closed';
  if (!accidentDate || !deadlineDays || deadlineDays <= 0) {
    return 'permanent';
  }
  const occ = new Date(accidentDate);
  if (isNaN(occ.getTime())) return 'unknown';
  const expiry = new Date(occ);
  expiry.setDate(expiry.getDate() + parseInt(deadlineDays));
  const now = new Date();
  const diffDays = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'expired';
  if (diffDays <= 7) return 'expiring';
  return 'normal';
}

// ========== 内部：写入版本履历 ==========
async function recordVersion(accidentId, version, changeType, changeSummary, changedBy, snapshot, client) {
  if (isConnected()) {
    const sql = `INSERT INTO accident_versions (accident_id, version, change_type, change_summary, changed_by, snapshot)
                 VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`;
    const params = [accidentId, version, changeType, changeSummary, changedBy, JSON.stringify(snapshot || {})];
    if (client) {
      return (await client.query(sql, params)).rows[0];
    }
    return (await pool.query(sql, params)).rows[0];
  } else {
    const rec = buildMemoryRecord(memoryVersionIdCounter++, {
      accident_id: accidentId,
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

// ========== 事故地点自动提取 ==========
// 规则：description 中如包含「环卫作业中心」或「市政绿化作业中心」下属单位的核心地名（去后缀「作业中心/公园/镇/乡/街道/园区」），
// 则把完整单位名作为事故地点（如「相衙镇驾驶员李春东在...」→ 核心词「相衙」→ 完整名「相衙镇」）。
// 优先使用 DB 已有 location/township，为空时回退到自动提取。
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
    orgTownNamesCache = r.rows.map((row) => {
      const full = String(row.org_name).replace(/作业中心$/, '').replace(/公园$/, '').trim();
      const core = full.replace(/镇$|乡$|街道$|园区$/, '').trim();
      return { full, core };
    }).filter((t) => t.core);
    orgTownNamesCacheAt = now;
    return orgTownNamesCache;
  } catch (e) {
    console.warn('[Accidents] 加载组织乡镇名称失败:', e.message);
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

// ========== 当事人角色推断 ==========
// involved_person_role 未标注时的降级展示口径：
//   交通事故 → 肇事者；生产安全 / 意外伤害 → 伤者；突发疾病 → 患者；其余 → 当事人
// 中文 accident_type 优先（"生产安全"映射为 other，单看英文枚举无法区分）
function inferPersonRole(typeEn, accidentTypeCn) {
  const cn = String(accidentTypeCn || '').trim();
  if (cn.includes('交通')) return '肇事者';
  if (cn.includes('生产安全')) return '伤者';
  if (cn.includes('意外伤害') || cn.includes('意外')) return '伤者';
  if (cn.includes('突发疾病') || cn.includes('疾病')) return '患者';
  if (typeEn === 'traffic') return '肇事者';
  if (typeEn === 'occupational') return '伤者';
  return '当事人';
}

// 当事人角色枚举（新增/编辑写入时校验）
const PERSON_ROLES = ['肇事者', '伤者', '患者', '当事人', '其他'];

// ========== 责任班组自动推断（当事人 → 责任班组） ==========
// 规则：
//   1) 当事人在花名册且为驾驶员（垃圾收运车驾驶员 / 垃圾转运车驾驶员）→ 该人所属乡镇的“xx镇作业中心”
//   2) 当事人在花名册且有作业单元（operation_unit_id）→ 取其真实班组
//   3) 当事人在花名册但无作业单元 / 花名册无此人（已离职或外部人员）
//      → 按事故地点推断乡镇，落入“xx镇作业中心”
// 说明：hse_operation_unit 中并无“作业中心”类单元，作业人员中心统一以自由文本
// responsibility_team 存储（responsibility_team_id 留空），班组下拉仍可手工改选真实单元。
const TOWN_PREFIXES = [
  '宁城街道', '津城街道', '保店镇', '柴胡店镇', '大曹镇', '大柳镇',
  '杜集镇', '刘营伍乡', '时集镇', '相衙镇', '张大庄镇', '长官镇',
];
const TOWN_ALIASES = { 杜集: '杜集镇' };

function isDriverPosition(positionName) {
  return !!positionName && String(positionName).includes('驾驶员');
}

// 归属「作业中心」的岗位（不归属 xx镇xx班）：
//   驾驶员（垃圾收运车驾驶员 / 垃圾转运车驾驶员）
//   转运站操作员（业务口径的"中转站管理员"）
//   收运辅助工（业务口径的"垃圾收运辅助工"）
// 花名册实际岗位名以此为据（v_employee_current.position_name）
const CENTER_POSITION_KEYWORDS = ['驾驶员', '转运站操作员', '收运辅助工'];
function isCenterPosition(positionName) {
  if (!positionName) return false;
  const p = String(positionName);
  return CENTER_POSITION_KEYWORDS.some((k) => p.includes(k));
}

// 从地点文本提取乡镇（含别名归一）
function extractTown(text) {
  if (!text) return null;
  const t = String(text).trim();
  if (TOWN_ALIASES[t]) return TOWN_ALIASES[t];
  for (const town of TOWN_PREFIXES) {
    if (t.includes(town)) return town;
  }
  return null;
}

// 从作业单元名称提取所属乡镇（单元名形如“柴胡店镇三班”“相衙镇收运车组”）
function unitTown(unitName) {
  if (!unitName) return null;
  for (const town of TOWN_PREFIXES) {
    if (String(unitName).includes(town)) return town;
  }
  return null;
}

// 查找“xx镇作业中心”真实单元（已建为 hse_operation_unit，unit_type=operation_center）
// 返回 { id, name } 或 null（尚未建单元时回落到自由文本）
async function findOperationCenterUnit(town) {
  if (!town) return null;
  const r = await pool.query(
    `SELECT id, unit_name FROM hse_operation_unit WHERE unit_name = $1 AND is_deleted = false LIMIT 1`,
    [`${town}作业中心`],
  );
  if (r.rows.length === 0) return null;
  return { id: Number(r.rows[0].id), name: r.rows[0].unit_name };
}

// 按名称查真实作业单元（匹配"xx镇xx班"等 cleaning_team 单元）
// 花名册 employee_assignment.dept_name 即"所属部门"，保洁员值为"宁城街道一班"这类班名，
// 与 hse_operation_unit.unit_name 精确同名（1176/1176 保洁员全部命中）
async function findUnitByName(unitName) {
  if (!unitName) return null;
  const r = await pool.query(
    `SELECT id, unit_name FROM hse_operation_unit WHERE unit_name = $1 AND is_deleted = false LIMIT 1`,
    [String(unitName).trim()],
  );
  if (r.rows.length === 0) return null;
  return { id: Number(r.rows[0].id), name: r.rows[0].unit_name };
}

// 在花名册（v_employee_current）中按员工 ID 或姓名查当前在职人员
async function findRosterPerson({ personnelId, name }) {
  if (!personnelId && !name) return null;
  let sql;
  let params;
  // 注意：computePartyInfo / computeResponsibilityTeam 依赖 org_unit_id/org_name/supervisor_id/dept_name 等列，
  // 此处必须一并 SELECT，否则返回行缺字段会导致所属部门/上级链/责任班组推断失效。
  // dept_name（所属部门，班名）不在 v_employee_current，需 JOIN employee_assignment 取。
  const SELECT_COLS = `v.employee_id, v.name, v.operation_unit_id, v.unit_name, v.position_name,
       v.org_unit_id, v.org_name, v.supervisor_id, v.supervisor_name,
       ea.dept_name`;
  const FROM_JOIN = `FROM v_employee_current v
           LEFT JOIN employee_assignment ea ON ea.id = v.assignment_id`;
  if (personnelId) {
    sql = `SELECT ${SELECT_COLS}
           ${FROM_JOIN}
           WHERE v.employee_id = $1 AND v.is_current = true AND (v.employee_deleted = false OR v.employee_deleted IS NULL)
           LIMIT 1`;
    params = [personnelId];
  } else {
    sql = `SELECT ${SELECT_COLS}
           ${FROM_JOIN}
           WHERE v.name = $1 AND v.is_current = true AND (v.employee_deleted = false OR v.employee_deleted IS NULL)
           LIMIT 1`;
    params = [name];
  }
  const r = await pool.query(sql, params);
  return r.rows[0] || null;
}

// 根据当事人（姓名/工号）+ 地点 推断责任班组；返回 { responsibilityTeamId, responsibilityTeam }
// 责任班组优先关联真实 hse_operation_unit；仅当对应"xx镇作业中心"单元尚未建成时，才回落为自由文本
async function computeResponsibilityTeam({ personnelId, name, location }) {
  const fallbackCenter = async (town) => {
    if (!town) return { responsibilityTeamId: null, responsibilityTeam: '' };
    const center = await findOperationCenterUnit(town);
    return center
      ? { responsibilityTeamId: center.id, responsibilityTeam: center.name }
      : { responsibilityTeamId: null, responsibilityTeam: `${town}作业中心` };
  };
  // 按乡镇匹配"xx镇作业中心"：乡镇来源优先级 所属部门(dept_name) → 组织(org_name) → 作业单元(unit_name) → 地点
  const centerByPerson = (person) => {
    const town =
      extractTown(person.dept_name) ||
      extractTown(person.org_name) ||
      unitTown(person.unit_name) ||
      extractTown(location);
    return fallbackCenter(town);
  };
  const person = await findRosterPerson({ personnelId, name });
  if (person) {
    // 驾驶员 / 转运站操作员 / 收运辅助工 → 归属所属作业中心
    if (isCenterPosition(person.position_name)) {
      return centerByPerson(person);
    }
    // 其余在册人员（保洁员等）→ 归属真实"xx镇xx班"单元（按所属部门 dept_name 精确匹配）
    const team = await findUnitByName(person.dept_name);
    if (team) {
      return { responsibilityTeamId: team.id, responsibilityTeam: team.name };
    }
    if (person.operation_unit_id) {
      return {
        responsibilityTeamId: Number(person.operation_unit_id),
        responsibilityTeam: person.unit_name || '',
      };
    }
    return centerByPerson(person);
  }
  // 花名册无此人（已离职 / 外部人员）：按地点推断乡镇作业中心
  return fallbackCenter(extractTown(location));
}

// ========== 事故类别 ↔ 性质 级联映射 ==========
// 数据源：宁津项目-北控城市资源集团事故统计报表（2026版）"一二级"sheet 第 0 行（类别）+ 各类别下列出的性质
// 故意忽略"一二级"sheet 中混入的二级（交通全部责任/人员伤亡/财产损失）——它们是三三级的细化，不在类别/性质一级映射内
const ACCIDENT_CATEGORIES = ['交通', '生产安全', '意外', '公众', '突发疾病', '职业病', '其它'];
const CATEGORY_NATURE_MAP = {
  交通:     ['全部责任', '主要责任', '同等责任', '次要责任', '无责任', '待认定'],
  生产安全: ['责任', '非责任'],
  意外:     ['意外'],
  公众:     ['责任', '非责任'],
  突发疾病: ['岗位发病', '非岗位发病'],
  职业病:   ['中暑', '热射病', '其它', '尘肺病', '职业性传染病', '职业性化学中毒', '职业性眼病', '职业性皮肤病', '其他呼吸系统疾病', '职业性肿瘤'],
  其它:     ['刑事', '治安'],
};
function getNatureOptions(category) {
  return CATEGORY_NATURE_MAP[category] || [];
}

// ========== 三级联动映射（类别 → 性质 → 三级） ==========
// 数据源：宁津项目-北控城市资源集团事故统计报表（2026版）"一二级"sheet
//   第 1 行 = 类别（一级）；第 2~11 行 = 各类别下的性质（二级）；
//   第 13 行 = "类别+性质"合并标签（二级列头）；第 14~29 行 = 该二级下的三级值
// 键为第 13 行的二级标签（"交通全部责任"…）；注意"意外"类别的性质本身就是"意外"，
// 故其二级标签为单个"意外"而非"意外意外"
const CATEGORY_NATURE_L3 = {
  交通全部责任: ['人员伤亡', '人员伤亡及财产损失', '财产损失'],
  交通主要责任: ['人员伤亡', '人员伤亡及财产损失', '财产损失'],
  交通同等责任: ['人员伤亡', '人员伤亡及财产损失', '财产损失'],
  交通次要责任: ['人员伤亡', '人员伤亡及财产损失', '财产损失'],
  交通无责任: ['人员伤亡', '人员伤亡及财产损失', '财产损失'],
  交通待认定: ['人员伤亡', '人员伤亡及财产损失', '财产损失'],
  生产安全责任: ['物体打击', '机械伤害', '车辆伤害', '高处坠落', '触电', '火灾', '灼烫', '坍塌', '淹溺', '起重伤害', '中毒', '窒息', '爆炸-容器', '爆炸-锅炉', '爆炸-其它', '其它'],
  生产安全非责任: ['物体打击', '机械伤害', '车辆伤害', '高处坠落', '触电', '火灾', '灼烫', '坍塌', '淹溺', '起重伤害', '中毒', '窒息', '爆炸-容器', '爆炸-锅炉', '爆炸-其它', '其它'],
  意外: ['滑倒', '绊倒', '踩空', '动物咬', '蜂虫叮', '划/割伤', '其它'],
  公众责任: ['人员伤亡', '人员伤亡及财产损失', '财产损失'],
  公众非责任: ['人员伤亡', '人员伤亡及财产损失', '财产损失'],
  突发疾病岗位发病: ['48h内死亡', '48h外死亡', '未死亡'],
  突发疾病非岗位发病: ['死亡', '未死亡'],
  职业病中暑: ['工时损失', '死亡'],
  职业病热射病: ['工时损失', '死亡'],
  职业病其它: ['工时损失', '死亡'],
  其它刑事: ['人员伤亡', '人员伤亡及财产损失', '财产损失'],
  其它治安: ['人员伤亡', '人员伤亡及财产损失', '财产损失'],
};
// 类别级兜底：报表未给该性质单独建列的（如职业病"尘肺病"等 7 个性质），按类别默认三级
const CATEGORY_L3_FALLBACK = {
  交通: ['人员伤亡', '人员伤亡及财产损失', '财产损失'],
  公众: ['人员伤亡', '人员伤亡及财产损失', '财产损失'],
  其它: ['人员伤亡', '人员伤亡及财产损失', '财产损失'],
  生产安全: CATEGORY_NATURE_L3['生产安全责任'],
  职业病: ['工时损失', '死亡'],
  意外: CATEGORY_NATURE_L3['意外'],
  突发疾病: [],
};
function getNatureL3Options(category, nature) {
  if (!category || !nature) return [];
  if (category === '意外') return CATEGORY_NATURE_L3['意外'] || [];
  return (
    CATEGORY_NATURE_L3[`${category}${nature}`] || CATEGORY_L3_FALLBACK[category] || []
  );
}

// ========== 当事人所属部门 + 上级 推断 ==========
// 输入：personnelId / name / location
// 输出：{ partyDept, partyDeptId, partySupervisor, partySupervisorId }
// 规则：
//   - 非花名册人员：返回空字段，由用户填责任班组（req6：花名册没有的需自己填责任班组）
//   - 所属部门（2026-09-01 修正，按用户指出的"班组在花名册所属部门列"）：
//     · 班组在 employee_assignment.dept_name（花名册"所属部门"列），不在 v_employee_current 里，需 JOIN 取
//     · 保洁员 → dept_name 即"xx镇xx班"（如"宁城街道一班"），与 hse_operation_unit.unit_name 同名，
//       1176/1176 保洁员全部精确命中真实 cleaning_team 单元
//     · 驾驶员 / 转运站操作员 / 收运辅助工 → 所属作业中心（org_name 或按乡镇查 operation_center 真实单元）
//     · 其余人员 → dept_name 优先，回落 org_name
//   - 上级：按 supervisor_id 向上追溯 1-2 级；实测保洁员链为"管理员 → 乡镇作业中心经理"，
//          驾驶员链为"乡镇作业中心经理 → 环卫作业中心副经理"，与业务口径一致
//          姓名拼接（不含岗位）成 "张三 / 李四"（2026-09-01：上级只留姓名）
//   - party_supervisor_id 取最高一级（链尾）的 employee_id，无链时为 null
async function computePartyInfo({ personnelId, name, location }) {
  const person = await findRosterPerson({ personnelId, name });
  if (!person) {
    return { partyDept: '', partyDeptId: null, partySupervisor: '', partySupervisorId: null };
  }
  // ---- 所属部门 ----
  let partyDept = '';
  let partyDeptId = null;
  if (isCenterPosition(person.position_name)) {
    // 驾驶员 / 转运站操作员 / 收运辅助工 → 所属作业中心
    const town = extractTown(person.org_name) || extractTown(person.dept_name) || extractTown(location);
    const center = town ? await findOperationCenterUnit(town) : null;
    if (center) {
      partyDept = center.name;
      partyDeptId = center.id;
    } else {
      partyDept = person.org_name || '';
      partyDeptId = person.org_unit_id != null ? Number(person.org_unit_id) : null;
    }
  } else {
    // 保洁员等 → 所属部门 dept_name（"xx镇xx班"），并关联真实单元 id
    const team = person.dept_name ? await findUnitByName(person.dept_name) : null;
    if (team) {
      partyDept = team.name;
      partyDeptId = team.id;
    } else if (person.dept_name) {
      partyDept = person.dept_name;
      partyDeptId = person.org_unit_id != null ? Number(person.org_unit_id) : null;
    } else if (person.org_name) {
      partyDept = person.org_name;
      partyDeptId = person.org_unit_id != null ? Number(person.org_unit_id) : null;
    }
  }
  // ---- 上级链（最多 2 级，防自环） ----
  const chain = [];
  let curId = person.supervisor_id != null ? Number(person.supervisor_id) : null;
  let guard = 0;
  while (curId && guard < 2) {
    const sup = await findRosterPerson({ personnelId: curId });
    if (!sup) break;
    if (sup.employee_id && Number(sup.employee_id) === Number(person.employee_id)) break; // 自环保护
    chain.push({
      id: Number(sup.employee_id),
      label: sup.name,
    });
    curId = sup.supervisor_id != null ? Number(sup.supervisor_id) : null;
    guard++;
  }
  const partySupervisor = chain.map((c) => c.label).join(' / ');
  const partySupervisorId = chain.length ? chain[chain.length - 1].id : null;
  return { partyDept, partyDeptId, partySupervisor, partySupervisorId };
}

// ========== 责任班组 → 当事人所属部门 + 上级 反推 ==========
// 适用场景：当事人不在花名册、用户手填了责任班组（responsibility_team_id / responsibility_team）。
// 反推规则：
//   - 当事人所属部门 = 责任班组本身（其 hse_operation_unit.unit_name 即「xx镇xx班」或「xx镇作业中心」）
//   - 当事人上级 = 责任班组的组长/负责人链（与管理员→乡镇作业中心经理口径一致）
//       · 优先用 hse_operation_unit.supervisor_id（组长/负责人ID，迁移脚本预留字段）
//       · 该字段普遍为空时，回落到「班组的父中心 org_unit_id → 花名册管理员/乡镇作业中心经理」推导
// 仅当 teamId / teamName 能命中 hse_operation_unit 时生效；自由文本班组（无对应单元）返回空。

// 沿 supervisor_id 向上追溯 1~2 级，返回 [{id,label}] 链（与 computePartyInfo 同口径）
async function followSupervisorChain(startId) {
  const chain = [];
  let curId = startId != null ? Number(startId) : null;
  let guard = 0;
  while (curId && guard < 2) {
    const sup = await findRosterPerson({ personnelId: curId });
    if (!sup) break;
    if (sup.employee_id && chain.length && Number(sup.employee_id) === Number(chain[chain.length - 1].id)) break;
    chain.push({
      id: Number(sup.employee_id),
      label: sup.name,
    });
    curId = sup.supervisor_id != null ? Number(sup.supervisor_id) : null;
    guard++;
  }
  return chain;
}

// 班组的父中心（org_unit_id）下找管理岗（管理员优先，其次乡镇作业中心经理等），从其 supervisor_id 起追链
// 回落：operation_center 单元自身 org 是顶层 umbrella（org_unit_id=1），管理岗在其下属乡镇中心 org，
//       故按单元名提取乡镇，再匹配该乡镇管理岗的 org_name/unit_name。
async function findCenterManagerChain(orgUnitId, unitName) {
  if (orgUnitId) {
    const r = await pool.query(
      `SELECT v.employee_id
       FROM v_employee_current v
       WHERE v.is_current = true AND (v.employee_deleted = false OR v.employee_deleted IS NULL)
         AND v.org_unit_id = $1
         AND v.position_name IN ('管理员', '乡镇作业中心经理', '环卫作业中心副经理（人工）', '部门经理')
       ORDER BY (CASE v.position_name
         WHEN '管理员' THEN 1
         WHEN '乡镇作业中心经理' THEN 2
         WHEN '环卫作业中心副经理（人工）' THEN 3
         WHEN '部门经理' THEN 4 ELSE 5 END)
       LIMIT 1`,
      [Number(orgUnitId)],
    );
    if (r.rows.length) return followSupervisorChain(Number(r.rows[0].employee_id));
  }
  const town = unitName ? extractTown(unitName) : null;
  if (town) {
    const r = await pool.query(
      `SELECT v.employee_id
       FROM v_employee_current v
       WHERE v.is_current = true AND (v.employee_deleted = false OR v.employee_deleted IS NULL)
         AND v.position_name IN ('管理员', '乡镇作业中心经理', '环卫作业中心副经理（人工）', '部门经理')
         AND (v.org_name LIKE '%' || $1 || '%' OR v.unit_name LIKE '%' || $1 || '%')
       ORDER BY (CASE v.position_name
         WHEN '管理员' THEN 1
         WHEN '乡镇作业中心经理' THEN 2
         WHEN '环卫作业中心副经理（人工）' THEN 3
         WHEN '部门经理' THEN 4 ELSE 5 END)
       LIMIT 1`,
      [town],
    );
    if (r.rows.length) return followSupervisorChain(Number(r.rows[0].employee_id));
  }
  return [];
}

async function computePartyFromTeam(teamId, teamName) {
  if (!teamId && !teamName) {
    return { partyDept: '', partyDeptId: null, partySupervisor: '', partySupervisorId: null };
  }
  let unit = null;
  if (teamId) {
    const r = await pool.query(
      `SELECT id, unit_name, supervisor_id, org_unit_id FROM hse_operation_unit WHERE id = $1 AND is_deleted = false LIMIT 1`,
      [Number(teamId)],
    );
    if (r.rows.length) unit = r.rows[0];
  }
  if (!unit && teamName) {
    const r = await pool.query(
      `SELECT id, unit_name, supervisor_id, org_unit_id FROM hse_operation_unit WHERE unit_name = $1 AND is_deleted = false LIMIT 1`,
      [String(teamName).trim()],
    );
    if (r.rows.length) unit = r.rows[0];
  }
  if (!unit) {
    return { partyDept: '', partyDeptId: null, partySupervisor: '', partySupervisorId: null };
  }
  const partyDept = unit.unit_name || '';
  const partyDeptId = unit.id != null ? Number(unit.id) : null;
  // 上级：优先单元 supervisor_id；否则用父中心管理岗反推
  let chain = [];
  if (unit.supervisor_id != null) {
    chain = await followSupervisorChain(Number(unit.supervisor_id));
  } else if (unit.org_unit_id != null) {
    chain = await findCenterManagerChain(Number(unit.org_unit_id), unit.unit_name);
  }
  const partySupervisor = chain.map((c) => c.label).join(' / ');
  const partySupervisorId = chain.length ? chain[chain.length - 1].id : null;
  return { partyDept, partyDeptId, partySupervisor, partySupervisorId };
}

// ========== 读时回填：列出/详情接口在 formatRow 后，对缺失字段实时推断 ==========
// 目的：历史事故记录（party_dept / party_supervisor / responsibility_team 为 null）也能在
//       前端立即看到花名册推断结果，而不需要等用户保存。
// 仅覆盖"空"字段；DB 中已有人工填的值不被覆盖。
// 注意：这里只读—不动 DB；DB 由用户在弹窗/单元格保存时自然落盘；
//       也可由 _acc_backfill_party.cjs 一次性补写。
async function ensureAutoFilled(row) {
  if (!row || !isConnected()) return row;
  const needParty =
    !row.partyDept ||
    !row.partySupervisor ||
    !row.responsibilityTeam;
  if (!needParty) return row;
  try {
    const party = await computePartyInfo({
      personnelId: row.personnelId || undefined,
      name: row.involvedPerson || undefined,
      location: row.location || undefined,
    });
    if (!row.partyDept && party.partyDept) row.partyDept = party.partyDept;
    if (row.partyDeptId == null && party.partyDeptId != null) row.partyDeptId = party.partyDeptId;
    if (!row.partySupervisor && party.partySupervisor) row.partySupervisor = party.partySupervisor;
    if (row.partySupervisorId == null && party.partySupervisorId != null) row.partySupervisorId = party.partySupervisorId;
    const team = await computeResponsibilityTeam({
      personnelId: row.personnelId || undefined,
      name: row.involvedPerson || undefined,
      location: row.location || undefined,
    });
    if (!row.responsibilityTeam && team.responsibilityTeam) {
      row.responsibilityTeam = team.responsibilityTeam;
    }
    if (row.responsibilityTeamId == null && team.responsibilityTeamId != null) {
      row.responsibilityTeamId = team.responsibilityTeamId;
    }
    // 反向派生：当事人部门/上级 也可从责任班组反推（当事人不在花名册、仅手填责任班组场景）
    if ((!row.partyDept || !row.partySupervisor) && (row.responsibilityTeamId || row.responsibilityTeam)) {
      const teamParty = await computePartyFromTeam(
        row.responsibilityTeamId != null ? Number(row.responsibilityTeamId) : null,
        row.responsibilityTeam ? String(row.responsibilityTeam) : null,
      );
      if (!row.partyDept && teamParty.partyDept) row.partyDept = teamParty.partyDept;
      if (row.partyDeptId == null && teamParty.partyDeptId != null) row.partyDeptId = teamParty.partyDeptId;
      if (!row.partySupervisor && teamParty.partySupervisor) row.partySupervisor = teamParty.partySupervisor;
      if (row.partySupervisorId == null && teamParty.partySupervisorId != null) row.partySupervisorId = teamParty.partySupervisorId;
    }
  } catch (_e) {
    // 推断失败不阻断 — 历史记录花名册查不到时仍展示原值
  }
  return row;
}

async function generateAccidentNo(client, accidentDate) {
  const year = accidentDate ? new Date(accidentDate).getFullYear() : new Date().getFullYear();
  const prefix = `SG-${year}-`;
  const r = await client.query(
    `SELECT accident_no FROM accidents WHERE accident_no LIKE $1 AND is_deleted = false`,
    [`${prefix}%`],
  );
  let max = 0;
  r.rows.forEach((row) => {
    const matched = String(row.accident_no || '').match(/-(\d+)$/);
    if (matched) max = Math.max(max, parseInt(matched[1], 10));
  });
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

// ========== 责任班组解析 ==========
// 传 teamId 时校验班组存在，并回填 unit_name 作为名称快照；
// 仅传名称（无 ID）时按文本存，兼容外部人员/临时班组
async function resolveResponsibilityTeam(client, teamId, teamName) {
  if (teamId === undefined || teamId === null || teamId === '') {
    return { teamId: null, teamName: teamName || '' };
  }
  const id = parseInt(teamId);
  if (Number.isNaN(id)) return { error: '责任班组 ID 必须为数字' };
  const r = await client.query(
    `SELECT id, unit_name FROM hse_operation_unit WHERE id = $1 AND is_deleted = false`,
    [id],
  );
  if (r.rows.length === 0) return { error: '责任班组不存在或已删除' };
  return { teamId: r.rows[0].id, teamName: teamName || r.rows[0].unit_name };
}

// ========== 车牌号自动提取 ==========
// 规则：[省份简称][A-Z][A-Z0-9]{5,7}；如「鲁N821KT」「鲁ND4459」「京A12345」
// _scan_plate.js 实证：48 条历史事故中提取 20 条、0 误识
// 仅当用户未显式填写 involved_vehicle 时生效；返回首个最显眼的候选
function extractPlateFromDescription(description) {
  if (!description || typeof description !== 'string') return '';
  const PROVINCES = '京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼';
  const PLATE_RE = new RegExp(`[${PROVINCES}][A-Z][A-Z0-9]{5,7}`, 'g');
  const candidates = [...new Set([...description.matchAll(PLATE_RE)].map((m) => m[0]))];
  return candidates[0] || '';
}

// ========== 格式化行 ==========
function formatRow(row, townNames) {
  const statusEn = normalizeStatus(row.status);
  const levelEn = normalizeLevel(row.level);
  const typeEn = normalizeType(row.accident_type);
  const accidentDate = row.accident_date
    ? (row.accident_date instanceof Date ? row.accident_date : new Date(row.accident_date))
    : null;
  const closeDate = row.close_date
    ? (row.close_date instanceof Date ? row.close_date : new Date(row.close_date))
    : null;
  const year = accidentDate ? accidentDate.getFullYear() : (row.year || null);
  const month = accidentDate ? accidentDate.getMonth() + 1 : (row.month || null);
  const lossAmount = parseFloat(row.loss_amount) || 0;
  const compensation = parseFloat(row.compensation) || 0;
  const deadlineDays = parseInt(row.rectification_deadline_days) || 30;
  const casualties = parseInt(row.casualties) || 0;
  const injuries = parseInt(row.injuries) || 0;

  return camelKeys({
    id: row.id,
    no: row.no || null,
    // 前端兼容字段
    title: row.description || '事故记录',
    description: row.description || '',
    level: levelEn,
    levelCn: levelToCn(levelEn),
    type: typeEn,
    typeCn: typeToCn(typeEn),
    status: statusEn,
    statusCn: statusToCn(statusEn),
    // 地点：DB 已存则用 DB 值，否则从 description 自动匹配环卫/市政绿化作业中心下属乡镇/公园
    location: (row.location || row.township || '') || extractLocationFromDescription(row.description || '', townNames),
    township: row.township || '',
    involvedVehicle: row.involved_vehicle || '',
    vehicleId: row.vehicle_id || null,
    involvedPerson: row.involved_person || '',
    // 当事人角色（肇事者/伤者/受害者/其他）；未标注时按事故类型推断，保证历史数据也有合理展示
    involvedPersonRole: row.involved_person_role || inferPersonRole(typeEn, row.accident_type || ''),
    // 当事人关联员工 ID（花名册；外部/离职人员为 null）
    personnelId: row.personnel_id != null ? Number(row.personnel_id) : null,
    accidentType: row.accident_type || '',
    // 责任认定依据（事故认定书/调查报告/其它）—— 注意：不是责任班组
    responsibility: row.responsibility || '',
    responsibilityLevel: row.responsibility_level || '',
    // 责任班组：ID 关联 hse_operation_unit，名称做快照（班组改名/撤销后历史记录不失真）
    // responsibility_team_id 为 bigint，node-pg 默认返回字符串，转数字避免前端回传被 zod 拒绝
    responsibilityTeamId: row.responsibility_team_id != null ? Number(row.responsibility_team_id) : null,
    responsibilityTeam: row.responsibility_team || '',
    accidentNo: row.accident_no || '',
    causeAnalysis: row.cause_analysis || '',
    lossAmount: lossAmount,
    compensation: compensation,
    // 前端期望字段
    economicLoss: lossAmount + compensation,
    casualties: casualties,
    injuries: injuries,
    reporter: row.reporter || row.handler || '',
    handler: row.handler || '',
    // P0-3: 处理人员关联员工ID（花名册为基石）
    handlerId: row.handler_id || null,
    // R1-Phase2: 报告人员工ID（花名册为基石；reporter 文本列不存在时回落 handler）
    reporterId: row.reporter_id || null,
    // 提示词-57: 处理人上级（花名册为基石）
    handlerSupervisorId: row.handler_supervisor_id || null,
    handlerSupervisorName: row.handler_supervisor_name || null,
    occurredAt: accidentDate ? accidentDate.toISOString() : null,
    reportedAt: row.reported_at ? (row.reported_at instanceof Date ? row.reported_at.toISOString() : new Date(row.reported_at).toISOString()) : (accidentDate ? accidentDate.toISOString() : null),
    closedAt: closeDate ? closeDate.toISOString() : null,
    accidentDate: accidentDate ? accidentDate.toISOString().slice(0, 10) : null,
    closeDate: closeDate ? closeDate.toISOString().slice(0, 10) : null,
    year: year,
    month: month,
    // 时效相关
    rectificationDeadlineDays: deadlineDays,
    expiryStatus: calcExpiryStatus(row.accident_date, deadlineDays, statusEn),
    // 关联隐患/预案
    relatedHazardId: row.related_hazard_id || null,
    relatedEmergencyId: row.related_emergency_id || null,
    remark: row.remark || '',
    // 事故类别 / 性质（报表口径，区别于 accident_type）
    accidentCategory: row.accident_category || row.accidentCategory || '',
    accidentNature: row.accident_nature || row.accidentNature || '',
    // 三级（类别 → 性质 → 三级）
    accidentNatureLevel3: row.accident_nature_level3 || row.accidentNatureLevel3 || '',
    // 当事人所属部门 + 上级（花名册自动关联；非花名册留空）
    // row.partyDept* 回退用于内存模式（initMemoryData 走 camelCase 字段）
    partyDept: row.party_dept || row.partyDept || '',
    partyDeptId: row.party_dept_id != null ? Number(row.party_dept_id) : (row.partyDeptId != null ? Number(row.partyDeptId) : null),
    partySupervisor: row.party_supervisor || row.partySupervisor || '',
    partySupervisorId: row.party_supervisor_id != null ? Number(row.party_supervisor_id) : (row.partySupervisorId != null ? Number(row.partySupervisorId) : null),
    // 报送集团开关（DB 布尔 → 前端 camelCase；内存模式回退 camel 字段）
    reportGroup: row.report_group != null ? !!row.report_group : (row.reportGroup != null ? !!row.reportGroup : false),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  });
}

// ========== CSV 导出辅助（返回内容，由 controller 落响应头） ==========
function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

function buildCsvExport(data) {
  const headers = [
    'ID', '事故标题', '事故等级', '事故类型', '状态', '发生地点',
    '发生日期', '伤亡人数', '受伤人数', '经济损失', '整改期限(天)',
    '时效状态', '处理人', '结案日期', '上报人'
  ];
  const expiryTextMap = {
    normal: '正常', expiring: '临期', expired: '过期',
    permanent: '长期有效', unknown: '未知', closed: '已结案',
  };
  const rows = data.map(r => {
    const statusEn = normalizeStatus(r.status);
    const es = calcExpiryStatus(r.accident_date, r.rectification_deadline_days || 30, statusEn);
    const accidentDate = r.accident_date
      ? (r.accident_date instanceof Date ? r.accident_date : new Date(r.accident_date))
      : null;
    const closeDate = r.close_date
      ? (r.close_date instanceof Date ? r.close_date : new Date(r.close_date))
      : null;
    return [
      r.id || '',
      (r.description || r.title || '').replace(/"/g, '""'),
      levelToCn(normalizeLevel(r.level)),
      typeToCn(normalizeType(r.accident_type)),
      statusToCn(statusEn),
      r.location || r.township || '',
      accidentDate ? accidentDate.toISOString().slice(0, 10) : '',
      parseInt(r.casualties) || 0,
      parseInt(r.injuries) || 0,
      (parseFloat(r.loss_amount) || 0) + (parseFloat(r.compensation) || 0),
      parseInt(r.rectification_deadline_days) || 30,
      expiryTextMap[es] || es,
      r.handler || '',
      closeDate ? closeDate.toISOString().slice(0, 10) : '',
      r.reporter || r.handler || '',
    ].map(csvEscape).join(',');
  });
  const csv = '\uFEFF' + headers.map(csvEscape).join(',') + '\n' + rows.join('\n');
  return {
    writeHeaders: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="accidents_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
    content: csv,
  };
}

// ================================================================
//  端点 Service 函数（返回描述符，由 controller respond() 解释）
// ================================================================

// ===== GET /stats/all =====
async function accidentStatsAll() {
  try {
    if (!isConnected()) {
      initMemoryData();
      const data = memoryRecords.filter(r => !r.is_deleted);
      const stats = {
        total: data.length,
        byType: {},
        byLevel: {},
        byYear: {},
        byStatus: {},
        expiring: 0,
        expired: 0,
        totalCasualties: 0,
        totalInjuries: 0,
        totalEconomicLoss: 0,
      };
      data.forEach(r => {
        const typeEn = normalizeType(r.accident_type);
        const levelEn = normalizeLevel(r.level);
        const statusEn = normalizeStatus(r.status);
        stats.byType[typeEn] = (stats.byType[typeEn] || 0) + 1;
        stats.byLevel[levelEn] = (stats.byLevel[levelEn] || 0) + 1;
        const yr = r.year || (r.accident_date ? new Date(r.accident_date).getFullYear() : '');
        stats.byYear[String(yr)] = (stats.byYear[String(yr)] || 0) + 1;
        stats.byStatus[statusEn] = (stats.byStatus[statusEn] || 0) + 1;
        const es = calcExpiryStatus(r.accident_date, r.rectification_deadline_days || 30, statusEn);
        if (es === 'expiring') stats.expiring++;
        if (es === 'expired') stats.expired++;
        stats.totalCasualties += parseInt(r.casualties) || 0;
        stats.totalInjuries += parseInt(r.injuries) || 0;
        stats.totalEconomicLoss += (parseFloat(r.loss_amount) || 0) + (parseFloat(r.compensation) || 0);
      });
      return { __t: 'json', payload: stats, message: '统计成功(内存模式)' };
    }

    await ensureTables();
    const [totalR, typeR, levelR, yearR, statusR, lossR, casR] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS total FROM accidents WHERE is_deleted = false'),
      pool.query("SELECT accident_type, COUNT(*)::int AS count FROM accidents WHERE is_deleted = false GROUP BY accident_type"),
      pool.query("SELECT level, COUNT(*)::int AS count FROM accidents WHERE is_deleted = false GROUP BY level"),
      pool.query("SELECT year, COUNT(*)::int AS count FROM accidents WHERE is_deleted = false GROUP BY year ORDER BY year"),
      pool.query("SELECT status, COUNT(*)::int AS count FROM accidents WHERE is_deleted = false GROUP BY status"),
      pool.query("SELECT COALESCE(SUM(loss_amount), 0)::float AS total_loss, COALESCE(SUM(compensation), 0)::float AS total_comp FROM accidents WHERE is_deleted = false"),
      pool.query("SELECT COALESCE(SUM(casualties), 0)::int AS total_cas, COALESCE(SUM(injuries), 0)::int AS total_inj FROM accidents WHERE is_deleted = false"),
    ]);

    const byType = {}, byLevel = {}, byYear = {}, byStatus = {};
    typeR.rows.forEach(r => { byType[normalizeType(r.accident_type)] = r.count; });
    levelR.rows.forEach(r => { byLevel[normalizeLevel(r.level)] = r.count; });
    yearR.rows.forEach(r => { byYear[String(r.year)] = r.count; });
    statusR.rows.forEach(r => { byStatus[normalizeStatus(r.status)] = r.count; });

    // 临期/过期计数（需查询所有事故的时效状态）
    const allR = await pool.query('SELECT accident_date, close_date, status, rectification_deadline_days FROM accidents WHERE is_deleted = false');
    let expiring = 0, expired = 0;
    allR.rows.forEach(r => {
      const es = calcExpiryStatus(r.accident_date, r.rectification_deadline_days || 30, normalizeStatus(r.status));
      if (es === 'expiring') expiring++;
      if (es === 'expired') expired++;
    });

    const totalLoss = parseFloat(lossR.rows[0]?.total_loss || 0);
    const totalComp = parseFloat(lossR.rows[0]?.total_comp || 0);

    return {
      __t: 'json',
      payload: {
        total: totalR.rows[0].total,
        byType, byLevel, byYear, byStatus,
        expiring,
        expired,
        totalCasualties: parseInt(casR.rows[0]?.total_cas || 0),
        totalInjuries: parseInt(casR.rows[0]?.total_inj || 0),
        totalEconomicLoss: totalLoss + totalComp,
      },
      message: '统计成功',
    };
  } catch (err) {
    console.error('[Accident] 查询事故全部统计失败:', err.message);
    throw err;
  }
}

// ===== GET /stats/yearly =====
async function accidentStatsYearly(year) {
  try {
    if (!isConnected()) {
      initMemoryData();
      return { __t: 'json', payload: { year: new Date().getFullYear(), total: 0, byMonth: {}, byType: {} }, message: '统计成功(内存模式)' };
    }

    const theYear = parseInt(year) || new Date().getFullYear();

    const [totalR, monthR, typeR] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS total FROM accidents WHERE is_deleted = false AND year = $1', [theYear]),
      pool.query('SELECT month, COUNT(*)::int AS count FROM accidents WHERE is_deleted = false AND year = $1 GROUP BY month ORDER BY month', [theYear]),
      pool.query('SELECT accident_type, COUNT(*)::int AS count FROM accidents WHERE is_deleted = false AND year = $1 GROUP BY accident_type', [theYear]),
    ]);

    const byMonth = {};
    monthR.rows.forEach(r => { byMonth[String(r.month)] = r.count; });
    const byType = {};
    typeR.rows.forEach(r => { byType[normalizeType(r.accident_type)] = r.count; });

    return { __t: 'json', payload: { year: theYear, total: totalR.rows[0].total, byMonth, byType }, message: '统计成功' };
  } catch (err) {
    console.error('[Accident] 查询事故年度统计失败:', err.message);
    throw err;
  }
}

// ===== GET /unsettled =====
async function accidentUnsettled() {
  try {
    if (!isConnected()) {
      initMemoryData();
      const data = memoryRecords.filter(r => !r.is_deleted && normalizeStatus(r.status) !== 'closed');
      const years = {};
      data.forEach(r => {
        const yr = String(r.year || (r.accident_date ? new Date(r.accident_date).getFullYear() : ''));
        if (!years[yr]) years[yr] = { count: 0, list: [] };
        years[yr].list.push({
          date: r.accident_date || '',
          level: r.level || '',
          type: r.accident_type || '',
          person: r.involved_person || '',
          desc: r.description || '',
          status: r.status || '处理中'
        });
        years[yr].count = years[yr].list.length;
      });
      return { __t: 'json', payload: { total: data.length, years }, message: '查询成功(内存模式)' };
    }

    const result = await pool.query(
      "SELECT * FROM accidents WHERE is_deleted = false AND status != '已结案' ORDER BY accident_date DESC"
    );
    const rows = result.rows.map(formatRow);
    const years = {};
    rows.forEach(r => {
      const yr = String(r.year || (r.accidentDate ? new Date(r.accidentDate).getFullYear() : ''));
      if (!years[yr]) years[yr] = { count: 0, list: [] };
      years[yr].list.push({
        date: r.accidentDate || '',
        level: r.levelCn || '',
        type: r.typeCn || '',
        person: r.involvedPerson || '',
        desc: r.description || '',
        status: r.statusCn || '处理中'
      });
      years[yr].count = years[yr].list.length;
    });
    return { __t: 'json', payload: { total: rows.length, years }, message: '查询成功' };
  } catch (err) {
    console.error('[Accident] 查询未结案事故失败:', err.message);
    throw err;
  }
}

// ===== GET /stats（通用旧版兼容） =====
async function accidentStatsLegacy() {
  try {
    if (!isConnected()) {
      return {
        __t: 'json',
        payload: {
          total: 0,
          major: 0,
          serious: 0,
          general: 0,
          minor: 0,
          openCount: 0,
          closedCount: 0,
          totalCasualties: 0,
          totalInjuries: 0,
          totalEconomicLoss: 0,
          expiring: 0,
          expired: 0,
          byType: {},
          byLevel: {},
          byStatus: {},
        },
        message: '统计成功(内存模式)',
      };
    }

    await ensureTables();
    const [totalR, levelR, statusR, typeR, lossR, casR] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS total FROM accidents WHERE is_deleted = false'),
      pool.query("SELECT level, COUNT(*)::int AS count FROM accidents WHERE is_deleted = false GROUP BY level"),
      pool.query("SELECT status, COUNT(*)::int AS count FROM accidents WHERE is_deleted = false GROUP BY status"),
      pool.query("SELECT accident_type, COUNT(*)::int AS count FROM accidents WHERE is_deleted = false GROUP BY accident_type"),
      pool.query("SELECT COALESCE(SUM(loss_amount), 0)::float AS total_loss, COALESCE(SUM(compensation), 0)::float AS total_comp FROM accidents WHERE is_deleted = false"),
      pool.query("SELECT COALESCE(SUM(casualties), 0)::int AS total_cas, COALESCE(SUM(injuries), 0)::int AS total_inj FROM accidents WHERE is_deleted = false"),
    ]);

    const byLevel = { major: 0, serious: 0, general: 0, minor: 0 };
    const byStatus = { reported: 0, investigating: 0, processing: 0, closed: 0 };
    const byType = {};
    let openCount = 0;
    let closedCount = 0;

    levelR.rows.forEach(r => {
      const en = normalizeLevel(r.level);
      if (byLevel[en] !== undefined) byLevel[en] += r.count;
    });
    statusR.rows.forEach(r => {
      const en = normalizeStatus(r.status);
      if (byStatus[en] !== undefined) byStatus[en] += r.count;
      if (en === 'closed') closedCount += r.count; else openCount += r.count;
    });
    typeR.rows.forEach(r => {
      const en = normalizeType(r.accident_type);
      byType[en] = (byType[en] || 0) + r.count;
    });

    const totalLoss = parseFloat(lossR.rows[0]?.total_loss || 0);
    const totalComp = parseFloat(lossR.rows[0]?.total_comp || 0);

    // 临期/过期计数
    const allR = await pool.query('SELECT accident_date, status, rectification_deadline_days FROM accidents WHERE is_deleted = false');
    let expiring = 0, expired = 0;
    allR.rows.forEach(r => {
      const es = calcExpiryStatus(r.accident_date, r.rectification_deadline_days || 30, normalizeStatus(r.status));
      if (es === 'expiring') expiring++;
      if (es === 'expired') expired++;
    });

    return {
      __t: 'json',
      payload: {
        total: totalR.rows[0].total,
        ...byLevel,
        openCount,
        closedCount,
        totalCasualties: parseInt(casR.rows[0]?.total_cas || 0),
        totalInjuries: parseInt(casR.rows[0]?.total_inj || 0),
        totalEconomicLoss: totalLoss + totalComp,
        expiring,
        expired,
        byType,
        byLevel,
        byStatus,
      },
      message: '统计成功',
    };
  } catch (err) {
    console.error('[Accident] 查询事故统计失败:', err.message);
    throw err;
  }
}

// ===== GET /export（CSV） =====
async function accidentExport() {
  try {
    if (!isConnected()) {
      initMemoryData();
      const data = memoryRecords.filter(r => !r.is_deleted);
      return { __t: 'csv', ...buildCsvExport(data) };
    }

    await ensureTables();
    const result = await pool.query(`
      SELECT * FROM accidents WHERE is_deleted = FALSE ORDER BY accident_date DESC, id DESC
    `);
    return { __t: 'csv', ...buildCsvExport(result.rows) };
  } catch (err) {
    console.error('[Accident] 导出事故CSV失败:', err.message);
    throw err;
  }
}

// ===== GET /（列表） =====
async function accidentList(query) {
  // 预加载组织乡镇/公园名称（用于地点自动提取）
  let townNames = [];
  try {
    const client = await pool.connect();
    try {
      townNames = await getOrgTownNames(client);
    } finally {
      client.release();
    }
  } catch (e) {
    console.warn('[Accidents] 预加载组织乡镇名称失败:', e.message);
  }

  try {
    // 列表页是最常用入口：在此兜底执行幂等建表补列（tablesInitialized 后为低成本早退）
    await ensureTables();
    if (!isConnected()) {
      initMemoryData();
      let data = memoryRecords.filter(r => !r.is_deleted);
      const { page = 1, pageSize = 20, keyword, year, month, township, status, level, accident_type, type, expiryStatus } = query;
      if (keyword) {
        const kw = keyword.toLowerCase();
        data = data.filter(r =>
          (r.description && r.description.toLowerCase().includes(kw)) ||
          (r.location && r.location.toLowerCase().includes(kw)) ||
          (r.involved_person && r.involved_person.toLowerCase().includes(kw))
        );
      }
      if (year) data = data.filter(r => String(r.year) === String(year));
      if (month) data = data.filter(r => String(r.month) === String(month));
      if (township) data = data.filter(r => r.township === township);
      if (status === 'open') {
        data = data.filter(r => !['已结案', 'closed'].includes(r.status));
      } else if (status) {
        const s = STATUS_EN_TO_CN[status] || status;
        data = data.filter(r => r.status === s || r.status === status);
      }
      if (level) {
        const l = LEVEL_EN_TO_CN[level] || level;
        data = data.filter(r => r.level === l || r.level === level);
      }
      const typeFilter = type || accident_type;
      if (typeFilter) {
        const t = TYPE_EN_TO_CN[typeFilter] || typeFilter;
        data = data.filter(r => r.accident_type === t || r.accident_type === typeFilter);
      }
      let list = data.map((r) => formatRow(r, townNames));
      if (expiryStatus) {
        list = list.filter(r => r.expiryStatus === expiryStatus);
      }
      const total = list.length;
      const ps = parseInt(pageSize);
      const p = parseInt(page);
      const offset = (p - 1) * ps;
      const paged = list.slice(offset, offset + ps);
      return { __t: 'list', list: paged, total, page: p, pageSize: ps, message: '查询成功(内存模式)' };
    }

    let whereSql = ' WHERE accidents.is_deleted = false';
    const params = [];
    let paramIdx = 0;

    const { page = 1, pageSize = 20, keyword, year, month, township, status, level, accident_type, type, expiryStatus } = query;

    if (keyword) {
      paramIdx++;
      whereSql += ` AND (accidents.description ILIKE $${paramIdx} OR accidents.location ILIKE $${paramIdx} OR accidents.involved_person ILIKE $${paramIdx} OR accidents.involved_vehicle ILIKE $${paramIdx} OR accidents.accident_no ILIKE $${paramIdx} OR accidents.responsibility_team ILIKE $${paramIdx})`;
      params.push(`%${keyword}%`);
    }
    if (year) { paramIdx++; whereSql += ` AND accidents.year = $${paramIdx}`; params.push(parseInt(year)); }
    if (month) { paramIdx++; whereSql += ` AND accidents.month = $${paramIdx}`; params.push(parseInt(month)); }
    if (township) { paramIdx++; whereSql += ` AND accidents.township = $${paramIdx}`; params.push(township); }
    if (status === 'open') {
      // 未结案件：排除已结案状态（与 stats.openCount 口径一致，仅 closed 视为已结案）
      whereSql += ` AND accidents.status NOT IN ('已结案', 'closed')`;
    } else if (status) {
      const statusCn = STATUS_EN_TO_CN[status] || status;
      paramIdx++;
      whereSql += ` AND accidents.status = $${paramIdx}`;
      params.push(statusCn);
    }
    if (level) {
      const levelCn = LEVEL_EN_TO_CN[level] || level;
      paramIdx++;
      whereSql += ` AND accidents.level = $${paramIdx}`;
      params.push(levelCn);
    }
    const typeFilter = type || accident_type;
    if (typeFilter) {
      const typeCn = TYPE_EN_TO_CN[typeFilter] || typeFilter;
      paramIdx++;
      whereSql += ` AND accidents.accident_type = $${paramIdx}`;
      params.push(typeCn);
    }

    const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM accidents${whereSql}`, params);
    const total = countResult.rows[0].total;

    // 保存仅含 WHERE 参数的数组（expiryStatus 需要先过滤再分页，必须复用不受 LIMIT/OFFSET 影响的参数）
    const whereParams = params.slice();

    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    paramIdx++;
    const limitParam = paramIdx;
    params.push(parseInt(pageSize));
    paramIdx++;
    const offsetParam = paramIdx;
    params.push(offset);

    const baseSelectSql = `SELECT accidents.*, sup.id AS handler_supervisor_id, sup.name AS handler_supervisor_name
       FROM accidents
       LEFT JOIN employee_assignment ea ON accidents.handler_id = ea.employee_id AND ea.is_primary = true AND ea.is_current = true AND ea.is_deleted = false
       LEFT JOIN employee sup ON ea.supervisor_id = sup.id AND sup.is_deleted = false
       ${whereSql}`;

    let rows;
    if (expiryStatus) {
      // 时效状态由运行时 calcExpiryStatus 计算，无法进 SQL WHERE：先取全量匹配行，过滤后再分页
      const allResult = await pool.query(
        `${baseSelectSql} ORDER BY accidents.accident_date DESC, accidents.id DESC`,
        whereParams,
      );
      let allRows = allResult.rows.map((r) => formatRow(r, townNames));
      allRows = await Promise.all(allRows.map((r) => ensureAutoFilled(r)));
      const filtered = allRows.filter((r) => r.expiryStatus === expiryStatus);
      rows = filtered.slice(offset, offset + parseInt(pageSize));
      return {
        __t: 'list',
        list: rows,
        total: filtered.length,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        message: '查询成功',
      };
    }

    const listSql = `${baseSelectSql} ORDER BY accidents.accident_date DESC, accidents.id DESC LIMIT $${limitParam} OFFSET $${offsetParam}`;
    const result = await pool.query(listSql, params);

    rows = result.rows.map((r) => formatRow(r, townNames));
    // 读时回填：历史事故记录（party_dept / party_supervisor / responsibility_team 为空），
    // 按花名册实时推断并覆盖返回（不写库——DB 由用户保存时落盘，避免 48 条均发 UPDATE）。
    rows = await Promise.all(rows.map((r) => ensureAutoFilled(r)));

    return {
      __t: 'list',
      list: rows,
      total,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      message: '查询成功',
    };
  } catch (err) {
    console.error('[Accident] 查询事故列表失败:', err.message);
    throw err;
  }
}

// ===== GET /teams =====
async function accidentTeams(query) {
  try {
    if (!isConnected()) {
      return { __t: 'list', list: [], total: 0, page: 1, pageSize: 20, message: '查询成功(内存模式)' };
    }
    const { keyword, unit_type } = query;
    const params = [];
    let idx = 1;
    let whereSql = ' WHERE is_deleted = false';
    if (unit_type) {
      whereSql += ` AND unit_type = $${idx++}`;
      params.push(unit_type);
    }
    if (keyword) {
      whereSql += ` AND (unit_name ILIKE $${idx} OR unit_code ILIKE $${idx})`;
      params.push(`%${String(keyword).trim()}%`);
      idx++;
    }
    const result = await pool.query(
      `SELECT id, unit_name, unit_type, unit_code, org_unit_id
       FROM hse_operation_unit${whereSql}
       ORDER BY unit_type, unit_name
       LIMIT 500`,
      params,
    );
    const UNIT_TYPE_LABEL = {
      cleaning_team: '保洁班',
      collection_team: '收运班',
      transfer_station: '中转站',
      center_vehicle_team: '车辆作业组',
      operation_center: '作业中心',
    };
    // id 为 bigint，node-pg 默认返回字符串；转数字，避免前端回传时被 zod 拒绝
    const list = result.rows.map((r) => ({
      id: Number(r.id),
      unitName: r.unit_name,
      unitType: r.unit_type,
      unitTypeLabel: UNIT_TYPE_LABEL[r.unit_type] || r.unit_type,
      unitCode: r.unit_code || '',
      orgUnitId: r.org_unit_id || null,
    }));
    return { __t: 'json', payload: { list, total: list.length }, message: '查询成功' };
  } catch (err) {
    console.error('[Accident] 查询责任班组失败:', err.message);
    throw err;
  }
}

// ===== GET /personnel-search =====
async function accidentPersonnelSearch(query) {
  try {
    const { keyword } = query;
    if (!keyword || String(keyword).trim().length < 1) {
      return { __t: 'json', payload: { list: [] }, message: 'ok' };
    }
    const kw = String(keyword).trim();
    const r = await pool.query(
      `SELECT employee_id, name, operation_unit_id, unit_name, position_name
       FROM v_employee_current
       WHERE name ILIKE $1 AND is_current = true AND (employee_deleted = false OR employee_deleted IS NULL)
       ORDER BY name
       LIMIT 20`,
      [`%${kw}%`],
    );
    const list = r.rows.map((p) => ({
      employeeId: Number(p.employee_id),
      name: p.name,
      operationUnitId: p.operation_unit_id != null ? Number(p.operation_unit_id) : null,
      unitName: p.unit_name || '',
      positionName: p.position_name || '',
      isDriver: isDriverPosition(p.position_name),
      town: unitTown(p.unit_name),
    }));
    return { __t: 'json', payload: { list }, message: 'ok' };
  } catch (err) {
    console.error('[Accident] 花名册搜索失败:', err.message);
    throw err;
  }
}

// ===== GET /suggest-team =====
async function accidentSuggestTeam(query) {
  try {
    const { personnelId, name, location } = query;
    const result = await computeResponsibilityTeam({
      personnelId: personnelId ? Number(personnelId) : undefined,
      name: name ? String(name) : undefined,
      location: location ? String(location) : undefined,
    });
    return { __t: 'json', payload: result, message: 'ok' };
  } catch (err) {
    console.error('[Accident] 责任班组建议失败:', err.message);
    throw err;
  }
}

// ===== GET /category-nature =====
async function accidentCategoryNature() {
  try {
    return {
      __t: 'json',
      payload: {
        categories: ACCIDENT_CATEGORIES,
        naturesByCategory: CATEGORY_NATURE_MAP,
        // 三级：键为"类别+性质"（意外类别的键为"意外"），前端按 category+nature 取
        level3ByCategoryNature: CATEGORY_NATURE_L3,
      },
      message: 'ok',
    };
  } catch (err) {
    console.error('[Accident] 类别/性质元数据失败:', err.message);
    throw err;
  }
}

// ===== GET /suggest-party =====
async function accidentSuggestParty(query) {
  try {
    const { personnelId, name, location } = query;
    const result = await computePartyInfo({
      personnelId: personnelId ? Number(personnelId) : undefined,
      name: name ? String(name) : undefined,
      location: location ? String(location) : undefined,
    });
    return { __t: 'json', payload: result, message: 'ok' };
  } catch (err) {
    console.error('[Accident] 当事人部门/上级建议失败:', err.message);
    throw err;
  }
}

// ===== GET /:id =====
async function accidentDetail(id) {
  try {
    if (!isConnected()) {
      initMemoryData();
      const record = memoryRecords.find(r => r.id === parseInt(id) && !r.is_deleted);
      if (!record) return { __t: 'not-found' };
      return { __t: 'json', payload: formatRow(record), message: '查询成功' };
    }

    const result = await pool.query('SELECT * FROM accidents WHERE id = $1 AND is_deleted = false', [id]);
    if (result.rows.length === 0) return { __t: 'json', error: { code: -2, message: '记录不存在' } };
    const row = await ensureAutoFilled(formatRow(result.rows[0]));
    return { __t: 'json', payload: row, message: '查询成功' };
  } catch (err) {
    console.error('[Accident] 查询事故详情失败:', err.message);
    throw err;
  }
}

// ===== POST /（创建） =====
async function accidentCreate(body, audit) {
  try {
    const b = body;

    // 英文枚举值转中文（兼容前端传英文）
    if (b.status && STATUS_EN_TO_CN[b.status]) b.status = STATUS_EN_TO_CN[b.status];
    if (b.level && LEVEL_EN_TO_CN[b.level]) b.level = LEVEL_EN_TO_CN[b.level];
    if (b.type && TYPE_EN_TO_CN[b.type]) b.accident_type = TYPE_EN_TO_CN[b.type];
    if (b.accident_type && TYPE_EN_TO_CN[b.accident_type]) b.accident_type = TYPE_EN_TO_CN[b.accident_type];

    // 前端字段名映射到数据库字段
    if (b.title && !b.description) b.description = b.title;
    if (b.occurredAt && !b.accident_date) {
      const d = new Date(b.occurredAt);
      b.accident_date = d.toISOString().slice(0, 10);
    }
    if (b.closedAt && !b.close_date) {
      const d = new Date(b.closedAt);
      b.close_date = d.toISOString().slice(0, 10);
    }
    if (b.economicLoss !== undefined && b.loss_amount === undefined) {
      b.loss_amount = b.economicLoss;
    }
    if (b.reporter && !b.handler) b.handler = b.reporter;

    // camelCase → snake_case 兼容前端以 vben 的 dto 字段名（事故描述 title/occurredAt 等）
    // zod 默认 strip() 已剥除这些未知字段，补回以便提取与落库
    if (b.involvedVehicle !== undefined && b.involved_vehicle === undefined) {
      b.involved_vehicle = b.involvedVehicle;
    }
    if (b.responsibilityTeamId !== undefined && b.responsibility_team_id === undefined) {
      b.responsibility_team_id = b.responsibilityTeamId;
    }
    if (b.responsibilityTeam !== undefined && b.responsibility_team === undefined && typeof b.responsibilityTeam === 'string') {
      b.responsibility_team = b.responsibilityTeam;
    }
    if (b.accidentNatureLevel3 !== undefined && b.accident_nature_level3 === undefined) {
      b.accident_nature_level3 = b.accidentNatureLevel3;
    }
    if (b.partyDept !== undefined && b.party_dept === undefined) {
      b.party_dept = b.partyDept;
    }
    if (b.partySupervisor !== undefined && b.party_supervisor === undefined) {
      b.party_supervisor = b.partySupervisor;
    }

    // 反向派生：当事人部门/上级 从责任班组反推（当事人不在花名册、仅手填责任班组场景）
    const postPartyExposed =
      b.party_dept !== undefined || b.party_dept_id !== undefined ||
      b.party_supervisor !== undefined || b.party_supervisor_id !== undefined;
    if (!postPartyExposed) {
      const tId = b.responsibility_team_id != null ? Number(b.responsibility_team_id) : null;
      const tName = b.responsibility_team ? String(b.responsibility_team) : '';
      if (tId || tName) {
        const tp = await computePartyFromTeam(tId, tName);
        if (tp.partyDept) b.party_dept = tp.partyDept;
        if (tp.partyDeptId != null) b.party_dept_id = tp.partyDeptId;
        if (tp.partySupervisor) b.party_supervisor = tp.partySupervisor;
        if (tp.partySupervisorId != null) b.party_supervisor_id = tp.partySupervisorId;
      }
    }

    // 车牌号：用户未填写时从事故描述正则自动提取首个候选（如「鲁N821KT」）
    // 正面价值：事故描述里通常详写车牌，但表单的「车牌号」字段常被遗漏；本规则避免污染
    // 用户已填值（null/empty 均视为「未填」，此时用提取结果覆盖）
    const userSuppliedVehicle =
      b.involved_vehicle !== undefined && b.involved_vehicle !== null && String(b.involved_vehicle).trim() !== '';
    if (!userSuppliedVehicle) {
      const descForExtract = b.description || (b.title || '');
      const autoPlate = extractPlateFromDescription(descForExtract);
      if (autoPlate) {
        b.involved_vehicle = autoPlate;
        b._autoPlateExtracted = true;
      }
    }

    const deadlineDays = pickField(b, 'rectificationDeadlineDays') || 30;
    const relatedHazardId = pickField(b, 'relatedHazardId') || null;
    const relatedEmergencyId = pickField(b, 'relatedEmergencyId') || null;

    if (!isConnected()) {
      initMemoryData();
      const record = buildMemoryRecord(memoryIdCounter++, {
        ...b,
        casualties: b.casualties || 0,
        injuries: b.injuries || 0,
        rectification_deadline_days: deadlineDays,
        related_hazard_id: relatedHazardId,
        related_emergency_id: relatedEmergencyId,
      });
      if (!record.year && record.accident_date) record.year = new Date(record.accident_date).getFullYear();
      if (!record.month && record.accident_date) record.month = new Date(record.accident_date).getMonth() + 1;
      memoryRecords.push(record);
      // 记录版本履历
      await recordVersion(record.id, '1.0', 'create', '创建事故记录', b.changedBy || 'admin', record);
      return { __t: 'json', payload: formatRow(record), message: '创建成功(内存模式)' };
    }

    await ensureTables();
    const year = b.year || (b.accident_date ? new Date(b.accident_date).getFullYear() : new Date().getFullYear());
    const month = b.month || (b.accident_date ? new Date(b.accident_date).getMonth() + 1 : new Date().getMonth() + 1);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // P1-2: 传入 vehicle_id 时校验车辆存在且未删除（关联车辆）
      if (b.vehicle_id !== undefined && b.vehicle_id !== null) {
        const vehResult = await client.query('SELECT id FROM vehicles WHERE id = $1 AND is_deleted = false', [b.vehicle_id]);
        if (vehResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return { __t: 'json', error: { code: -2, message: '关联车辆不存在或已删除' } };
        }
      }

      // 责任班组：校验 ID 并回填名称快照
      const teamResolved = await resolveResponsibilityTeam(
        client,
        pickField(b, 'responsibilityTeamId'),
        pickField(b, 'responsibilityTeam'),
      );
      if (teamResolved.error) {
        await client.query('ROLLBACK');
        return { __t: 'json', error: { code: -2, message: teamResolved.error } };
      }

      // 事故编号：未显式传入时同年递增自动生成
      let accidentNo = (b.accident_no || '').trim();
      if (!accidentNo) {
        accidentNo = await generateAccidentNo(client, b.accident_date);
      } else {
        const dupCheck = await client.query(
          `SELECT id FROM accidents WHERE accident_no = $1 AND is_deleted = false`,
          [accidentNo],
        );
        if (dupCheck.rows.length > 0) {
          await client.query('ROLLBACK');
          return { __t: 'json', error: { code: -2, message: `事故编号 ${accidentNo} 已存在` } };
        }
      }

      const personRole = PERSON_ROLES.includes(b.involved_person_role)
        ? b.involved_person_role
        : inferPersonRole(normalizeType(b.accident_type), b.accident_type || '');

      // 类别/性质 + 所属部门/上级（camelCase → snake_case，写库用 snake）
      // 空字符串视为"未填写"，保留原值语义（若两边都空则写 NULL）
      if (b.accidentCategory !== undefined || b.accident_category !== undefined) {
        b.accident_category = b.accidentCategory ?? b.accident_category ?? '';
      }
      if (b.accidentNature !== undefined || b.accident_nature !== undefined) {
        b.accident_nature = b.accidentNature ?? b.accident_nature ?? '';
      }
      if (b.accidentNatureLevel3 !== undefined || b.accident_nature_level3 !== undefined) {
        b.accident_nature_level3 = b.accidentNatureLevel3 ?? b.accident_nature_level3 ?? '';
      }
      if (b.partyDept !== undefined || b.party_dept !== undefined) {
        b.party_dept = b.partyDept ?? b.party_dept ?? '';
      }
      if (b.partyDeptId !== undefined || b.party_dept_id !== undefined) {
        b.party_dept_id = b.partyDeptId ?? b.party_dept_id ?? null;
      }
      if (b.partySupervisor !== undefined || b.party_supervisor !== undefined) {
        b.party_supervisor = b.partySupervisor ?? b.party_supervisor ?? '';
      }
      if (b.partySupervisorId !== undefined || b.party_supervisor_id !== undefined) {
        b.party_supervisor_id = b.partySupervisorId ?? b.party_supervisor_id ?? null;
      }

      const result = await client.query(`
        INSERT INTO accidents (no, accident_no, accident_date, year, month, township, location, involved_vehicle, vehicle_id,
          involved_person, personnel_id, involved_person_role, accident_type, responsibility, responsibility_level,
          responsibility_team_id, responsibility_team, level,
          description, cause_analysis, loss_amount, compensation, status, handler, close_date, remark,
          casualties, injuries, rectification_deadline_days, related_hazard_id, related_emergency_id, handler_id, reporter_id,
          accident_category, accident_nature, party_dept, party_dept_id, party_supervisor, party_supervisor_id,
          accident_nature_level3, report_group)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41)
        RETURNING *
      `, [
        b.no || null, accidentNo, b.accident_date || null, year, month, b.township || '', b.location || '',
        b.involved_vehicle || '', b.vehicle_id || null, b.involved_person || '', b.personnel_id || null,
        personRole,
        b.accident_type || '', b.responsibility || '', b.responsibility_level || '',
        teamResolved.teamId, teamResolved.teamName, b.level || '一般',
        b.description || '', b.cause_analysis || '', b.loss_amount || 0, b.compensation || 0,
        b.status || '处理中', b.handler || '', b.close_date || null, b.remark || '',
        b.casualties || 0, b.injuries || 0, deadlineDays, relatedHazardId, relatedEmergencyId,
        b.handlerId || b.handler_id || null,
        b.reporterId || b.reporter_id || null,
        b.accident_category || null,
        b.accident_nature || null,
        b.party_dept || null,
        b.party_dept_id || null,
        b.party_supervisor || null,
        b.party_supervisor_id || null,
        b.accident_nature_level3 || null,
        b.report_group === undefined ? false : !!b.report_group
      ]);

      const newAccident = result.rows[0];

      // 记录版本履历
      await recordVersion(newAccident.id, '1.0', 'create', '创建事故记录', b.changedBy || 'admin', newAccident, client);

      await client.query('COMMIT');

      // 同步到 hse_events（异步执行，不阻塞响应）
      hseEventSync.syncAccident(newAccident.id, newAccident).catch(err => {
        console.error('Failed to sync accident to hse_events:', err.message);
      });

      // 月度自动考核：事故否决项（责任人当月扣100分）
      assessmentEvent.publish(assessmentEvent.EVENT_TYPES.ACCIDENT_CREATED, {
        accidentId: newAccident.id,
        accidentType: newAccident.accident_type,
        accidentLevel: newAccident.level,
        accidentDate: newAccident.accident_date,
        personnelId: newAccident.personnel_id,
        involvedPerson: newAccident.involved_person,
      });

      auditLog({ userId: audit?.userId, username: audit?.username, action: 'create', module: 'accidents', description: `创建事故记录`, ip: audit?.ip }).catch(() => {});
      const respRow = formatRow(newAccident);
      // 自动车牌号提示：告知前端"已从描述提取"，方便用户确认
      const createdMsg = b._autoPlateExtracted
        ? `创建成功；车牌号已从描述自动提取（${respRow.involvedVehicle}），可在弹窗修正`
        : '创建成功';
      return { __t: 'json', payload: { ...respRow, _autoPlateExtracted: !!b._autoPlateExtracted }, message: createdMsg };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[Accident] 创建事故失败:', err.message);
    throw err;
  }
}

// ===== PUT /:id（更新） =====
async function accidentUpdate(id, body, audit) {
  try {
    const parsedId = parseInt(id);
    if (isNaN(parsedId)) return { __t: 'json', error: { code: -1, message: '参数错误：ID必须为数字' } };
    const b = body;

    // 英文枚举值转中文（兼容前端传英文）
    if (b.status && STATUS_EN_TO_CN[b.status]) b.status = STATUS_EN_TO_CN[b.status];
    if (b.level && LEVEL_EN_TO_CN[b.level]) b.level = LEVEL_EN_TO_CN[b.level];
    if (b.type && TYPE_EN_TO_CN[b.type]) b.accident_type = TYPE_EN_TO_CN[b.type];
    if (b.accident_type && TYPE_EN_TO_CN[b.accident_type]) b.accident_type = TYPE_EN_TO_CN[b.accident_type];

    // 前端字段名映射到数据库字段
    if (b.title !== undefined && b.description === undefined) b.description = b.title;
    if (b.occurredAt !== undefined && b.accident_date === undefined) {
      const d = new Date(b.occurredAt);
      b.accident_date = d.toISOString().slice(0, 10);
      if (!b.year) b.year = d.getFullYear();
      if (!b.month) b.month = d.getMonth() + 1;
    }
    if (b.closedAt !== undefined && b.close_date === undefined) {
      const d = new Date(b.closedAt);
      b.close_date = d.toISOString().slice(0, 10);
    }
    if (b.economicLoss !== undefined && b.loss_amount === undefined) {
      b.loss_amount = b.economicLoss;
    }
    if (b.reporter !== undefined && b.handler === undefined) b.handler = b.reporter;

    // camelCase → snake_case 兼容（zod 部分字段会剥掉兼容键）
    if (b.involvedVehicle !== undefined && b.involved_vehicle === undefined) {
      b.involved_vehicle = b.involvedVehicle;
    }
    if (b.responsibilityTeamId !== undefined && b.responsibility_team_id === undefined) {
      b.responsibility_team_id = b.responsibilityTeamId;
    }
    if (b.responsibilityTeam !== undefined && b.responsibility_team === undefined && typeof b.responsibilityTeam === 'string') {
      b.responsibility_team = b.responsibilityTeam;
    }
    if (b.accidentNatureLevel3 !== undefined && b.accident_nature_level3 === undefined) {
      b.accident_nature_level3 = b.accidentNatureLevel3;
    }
    if (b.partyDept !== undefined && b.party_dept === undefined) {
      b.party_dept = b.partyDept;
    }
    if (b.partySupervisor !== undefined && b.party_supervisor === undefined) {
      b.party_supervisor = b.partySupervisor;
    }

    // 类别/性质 + 所属部门/上级（camelCase → snake，COALESCE 写库）
    if (b.accidentCategory !== undefined || b.accident_category !== undefined) {
      b.accident_category = b.accidentCategory ?? b.accident_category ?? null;
    }
    if (b.accidentNature !== undefined || b.accident_nature !== undefined) {
      b.accident_nature = b.accidentNature ?? b.accident_nature ?? null;
    }
    if (b.accidentNatureLevel3 !== undefined || b.accident_nature_level3 !== undefined) {
      b.accident_nature_level3 = b.accidentNatureLevel3 ?? b.accident_nature_level3 ?? null;
    }
    if (b.partyDept !== undefined || b.party_dept !== undefined) {
      b.party_dept = b.partyDept ?? b.party_dept ?? null;
    }
    if (b.partyDeptId !== undefined || b.party_dept_id !== undefined) {
      b.party_dept_id = b.partyDeptId ?? b.party_dept_id ?? null;
    }
    if (b.partySupervisor !== undefined || b.party_supervisor !== undefined) {
      b.party_supervisor = b.partySupervisor ?? b.party_supervisor ?? null;
    }
    if (b.partySupervisorId !== undefined || b.party_supervisor_id !== undefined) {
      b.party_supervisor_id = b.partySupervisorId ?? b.party_supervisor_id ?? null;
    }

    // 车牌号：用户**未在 body 中出现 any of these keys**时，从 description 重提取；
    // 显式传 '' 视为「清空」，不重新提，尊重用户意图
    const userExplicitlySetVehicle =
      b.involved_vehicle !== undefined || b.involvedVehicle !== undefined;
    if (!userExplicitlySetVehicle && b.description !== undefined) {
      // 仅当 description 真传了且未填车牌时，从新描述重提取
      const autoPlate = extractPlateFromDescription(b.description || '');
      if (autoPlate) {
        b.involved_vehicle = autoPlate;
        b._autoPlateExtracted = true;
      }
    }

    if (!isConnected()) {
      initMemoryData();
      const idx = memoryRecords.findIndex(r => r.id === parseInt(id) && !r.is_deleted);
      if (idx === -1) return { __t: 'json', error: { code: -2, message: '记录不存在' } };
      const snapshotBefore = { ...memoryRecords[idx] };
      Object.assign(memoryRecords[idx], b, { updated_at: new Date().toISOString() });
      if (pickField(b, 'rectificationDeadlineDays') !== undefined) {
        memoryRecords[idx].rectification_deadline_days = pickField(b, 'rectificationDeadlineDays');
      }
      if (pickField(b, 'relatedHazardId') !== undefined) {
        memoryRecords[idx].related_hazard_id = pickField(b, 'relatedHazardId');
      }
      if (pickField(b, 'relatedEmergencyId') !== undefined) {
        memoryRecords[idx].related_emergency_id = pickField(b, 'relatedEmergencyId');
      }
      // 记录版本履历
      await recordVersion(memoryRecords[idx].id, b.version || '1.0', 'update', b.changeSummary || b.change_summary || '更新事故记录', b.changedBy || 'admin', { before: snapshotBefore, after: memoryRecords[idx] });
      return { __t: 'json', payload: formatRow(memoryRecords[idx]), message: '更新成功(内存模式)' };
    }

    await ensureTables();

    const existResult = await pool.query(
      'SELECT * FROM accidents WHERE id = $1 AND is_deleted = false',
      [parsedId]
    );
    if (existResult.rows.length === 0) {
      return { __t: 'json', error: { code: -2, message: '记录不存在' } };
    }
    const beforeSnapshot = existResult.rows[0];

    // PUT 兜底：当事人字段变了，但责任班组/部门/上级未显式传入 → 调 suggest 推断回填。
    // 注意：b 中是否包含某字段的判断用 "key 是否在 body 中"。前端 onSubmit/persistRowDiff
    // 通常会同时传这些字段；如未传则视为"用户没动它"，保留 DB 旧值。
    const inferredName = pickField(b, 'involvedPerson');
    const inferredPersonnelId = pickField(b, 'personnelId');
    const inferredLocation = pickField(b, 'location');
    const partyExposed =
      pickField(b, 'partyDept') !== undefined ||
      pickField(b, 'partyDeptId') !== undefined ||
      pickField(b, 'partySupervisor') !== undefined ||
      pickField(b, 'partySupervisorId') !== undefined;
    const teamExposed =
      pickField(b, 'responsibilityTeamId') !== undefined ||
      pickField(b, 'responsibilityTeam') !== undefined;
    const personTouched =
      inferredName !== undefined ||
      inferredPersonnelId !== undefined ||
      inferredLocation !== undefined;
    let partyFallback = null;
    let teamFallback = null;
    if ((personTouched || (!partyExposed && !teamExposed)) &&
        ((inferredName || inferredPersonnelId))) {
      const personName = inferredName !== undefined ? inferredName : (beforeSnapshot.involved_person || '');
      const personnelIdVal = inferredPersonnelId !== undefined ? inferredPersonnelId : (beforeSnapshot.personnel_id || null);
      const locationVal = inferredLocation !== undefined ? inferredLocation : (beforeSnapshot.location || '');
      if (!partyExposed) {
        partyFallback = await computePartyInfo({
          personnelId: personnelIdVal ? Number(personnelIdVal) : undefined,
          name: personName ? String(personName) : undefined,
          location: locationVal ? String(locationVal) : undefined,
        });
        if (partyFallback.partyDept) b.party_dept = partyFallback.partyDept;
        if (partyFallback.partyDeptId != null) b.party_dept_id = partyFallback.partyDeptId;
        if (partyFallback.partySupervisor) b.party_supervisor = partyFallback.partySupervisor;
        if (partyFallback.partySupervisorId != null) b.party_supervisor_id = partyFallback.partySupervisorId;
      }
      if (!teamExposed && !pickField(b, 'responsibilityTeamId')) {
        teamFallback = await computeResponsibilityTeam({
          personnelId: personnelIdVal ? Number(personnelIdVal) : undefined,
          name: personName ? String(personName) : undefined,
          location: locationVal ? String(locationVal) : undefined,
        });
        if (teamFallback.responsibilityTeamId != null) b.responsibility_team_id = teamFallback.responsibilityTeamId;
        if (teamFallback.responsibilityTeam) b.responsibility_team = teamFallback.responsibilityTeam;
      }
    }
    // B) 责任班组 → 反推 当事人部门/上级（当事人不在花名册、用户仅手填责任班组场景）
    // 仅填补 A 步未覆盖的空字段（当事人优先于责任班组）
    if (!partyExposed) {
      const teamId = pickField(b, 'responsibilityTeamId') !== undefined
        ? pickField(b, 'responsibilityTeamId')
        : (beforeSnapshot.responsibility_team_id || null);
      const teamName = pickField(b, 'responsibilityTeam') !== undefined
        ? pickField(b, 'responsibilityTeam')
        : (beforeSnapshot.responsibility_team || '');
      if (teamId || teamName) {
        const teamParty = await computePartyFromTeam(
          teamId != null ? Number(teamId) : null,
          teamName ? String(teamName) : null,
        );
        if (teamParty.partyDept && !b.party_dept) b.party_dept = teamParty.partyDept;
        if (teamParty.partyDeptId != null && b.party_dept_id == null) b.party_dept_id = teamParty.partyDeptId;
        if (teamParty.partySupervisor && !b.party_supervisor) b.party_supervisor = teamParty.partySupervisor;
        if (teamParty.partySupervisorId != null && b.party_supervisor_id == null) b.party_supervisor_id = teamParty.partySupervisorId;
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // P1-2: 传入 vehicle_id 时校验车辆存在且未删除（关联车辆）
      if (b.vehicle_id !== undefined && b.vehicle_id !== null) {
        const vehResult = await client.query('SELECT id FROM vehicles WHERE id = $1 AND is_deleted = false', [b.vehicle_id]);
        if (vehResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return { __t: 'json', error: { code: -2, message: '关联车辆不存在或已删除' } };
        }
      }

      // 责任班组：传 ID 时校验存在并回填名称快照；未传则保持原值（COALESCE null 语义）
      const teamIdProvided = pickField(b, 'responsibilityTeamId') !== undefined;
      const teamResolved = await resolveResponsibilityTeam(
        client,
        teamIdProvided ? pickField(b, 'responsibilityTeamId') : null,
        pickField(b, 'responsibilityTeam'),
      );
      if (teamResolved.error) {
        await client.query('ROLLBACK');
        return { __t: 'json', error: { code: -2, message: teamResolved.error } };
      }

      // 事故编号：显式传入时查重（排除自身）
      let accidentNo = null;
      if (b.accident_no !== undefined && String(b.accident_no || '').trim() !== '') {
        accidentNo = String(b.accident_no).trim();
        const dupCheck = await client.query(
          `SELECT id FROM accidents WHERE accident_no = $1 AND id <> $2 AND is_deleted = false`,
          [accidentNo, parsedId],
        );
        if (dupCheck.rows.length > 0) {
          await client.query('ROLLBACK');
          return { __t: 'json', error: { code: -2, message: `事故编号 ${accidentNo} 已存在` } };
        }
      }

      const personRole = PERSON_ROLES.includes(b.involved_person_role)
        ? b.involved_person_role
        : null;

      const result = await client.query(`
        UPDATE accidents SET
          no = COALESCE($1, no), accident_date = COALESCE($2, accident_date),
          year = COALESCE($3, year), month = COALESCE($4, month),
          township = COALESCE($5, township), location = COALESCE($6, location),
          -- involved_vehicle：与事故描述/类别一致改为 COALESCE；前端 onSubmit 只在用户实际改动时发送此字段，未发/null 时保留原值；
          -- 用户主动清空（发 ''）仍写入 ''（COALESCE('') 不视作 NULL）
          involved_vehicle = COALESCE($7, involved_vehicle), vehicle_id = $8,
          involved_person = COALESCE($9, involved_person), personnel_id = COALESCE($10, personnel_id),
          accident_type = COALESCE($11, accident_type), responsibility = COALESCE($12, responsibility),
          responsibility_level = COALESCE($13, responsibility_level), level = COALESCE($14, level),
          description = COALESCE($15, description), cause_analysis = COALESCE($16, cause_analysis),
          loss_amount = COALESCE($17, loss_amount), compensation = COALESCE($18, compensation),
          status = COALESCE($19, status), handler = COALESCE($20, handler),
          close_date = COALESCE($21, close_date), remark = COALESCE($22, remark),
          casualties = COALESCE($23, casualties), injuries = COALESCE($24, injuries),
          rectification_deadline_days = COALESCE($25, rectification_deadline_days),
          related_hazard_id = COALESCE($26, related_hazard_id),
          related_emergency_id = COALESCE($27, related_emergency_id),
          handler_id = COALESCE($28, handler_id),
          reporter_id = COALESCE($29, reporter_id),
          responsibility_team_id = COALESCE($30, responsibility_team_id),
          responsibility_team = COALESCE($31, responsibility_team),
          involved_person_role = COALESCE($32, involved_person_role),
          accident_no = COALESCE($33, accident_no),
          accident_category = COALESCE($34, accident_category),
          accident_nature = COALESCE($35, accident_nature),
          party_dept = COALESCE($36, party_dept),
          party_dept_id = COALESCE($37, party_dept_id),
          party_supervisor = COALESCE($38, party_supervisor),
          party_supervisor_id = COALESCE($39, party_supervisor_id),
          accident_nature_level3 = COALESCE($41, accident_nature_level3),
          report_group = COALESCE($42, report_group),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $40 AND is_deleted = false
        RETURNING *
      `, [
        b.no, b.accident_date, b.year, b.month, b.township, b.location,
        // $7 involved_vehicle：null = 保留原值（用户未动）；字符串（含空）= 覆盖更新
        b.involved_vehicle === undefined ? null : String(b.involved_vehicle ?? ''),
        b.vehicle_id !== undefined ? b.vehicle_id : null,
        b.involved_person, b.personnel_id,
        b.accident_type, b.responsibility, b.responsibility_level, b.level,
        b.description, b.cause_analysis, b.loss_amount, b.compensation,
        b.status, b.handler, b.close_date, b.remark,
        b.casualties, b.injuries,
        pickField(b, 'rectificationDeadlineDays'),
        pickField(b, 'relatedHazardId'),
        pickField(b, 'relatedEmergencyId'),
        b.handlerId || b.handler_id || null,
        b.reporterId || b.reporter_id || null,
        teamResolved.teamId,
        teamResolved.teamName || null,
        personRole,
        accidentNo,
        b.accident_category,
        b.accident_nature,
        b.party_dept,
        b.party_dept_id,
        b.party_supervisor,
        b.party_supervisor_id,
        parsedId,
        b.accident_nature_level3,
        b.report_group === undefined ? null : !!b.report_group
      ]);

      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return { __t: 'json', error: { code: -2, message: '记录不存在' } };
      }

      const updated = result.rows[0];

      // 记录版本履历
      await recordVersion(updated.id, b.version || '1.0', 'update', b.changeSummary || b.change_summary || '更新事故记录', b.changedBy || 'admin', { before: beforeSnapshot, after: updated }, client);

      await client.query('COMMIT');
      auditLog({ userId: audit?.userId, username: audit?.username, action: 'update', module: 'accidents', description: `更新事故 ID=${parsedId}`, ip: audit?.ip }).catch(() => {});
      const updateMsg = b._autoPlateExtracted
        ? `更新成功；车牌号已从描述自动提取（${updated.involved_vehicle}）`
        : '更新成功';
      return { __t: 'json', payload: { ...formatRow(updated), _autoPlateExtracted: !!b._autoPlateExtracted }, message: updateMsg };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[Accident] 更新事故失败:', err.message);
    throw err;
  }
}

// ===== DELETE /:id（软删除） =====
async function accidentDelete(id, audit) {
  try {
    const parsedId = parseInt(id);
    if (isNaN(parsedId)) return { __t: 'json', error: { code: -1, message: '参数错误：ID必须为数字' } };
    if (!isConnected()) {
      initMemoryData();
      const record = memoryRecords.find(r => r.id === parsedId && !r.is_deleted);
      if (!record) return { __t: 'json', error: { code: -2, message: '记录不存在' } };
      record.is_deleted = true;
      return { __t: 'json', payload: null, message: '删除成功(内存模式)' };
    }

    const result = await pool.query(
      'UPDATE accidents SET is_deleted = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND is_deleted = false RETURNING id',
      [parsedId]
    );
    if (result.rows.length === 0) return { __t: 'json', error: { code: -2, message: '记录不存在' } };
    auditLog({ userId: audit?.userId, username: audit?.username, action: 'delete', module: 'accidents', description: `删除事故 ID=${parsedId}`, ip: audit?.ip }).catch(() => {});
    return { __t: 'json', payload: null, message: '删除成功' };
  } catch (err) {
    console.error('[Accident] 删除事故失败:', err.message);
    throw err;
  }
}

// ===== GET /:id/attachments =====
async function accidentAttachments(id, version) {
  try {
    if (!isConnected()) {
      initMemoryData();
      let data = memoryAttachments.filter(a => a.accident_id === parseInt(id) && !a.is_deleted);
      if (version) data = data.filter(a => a.version === version);
      data.sort((a, b) => (b.is_latest ? 1 : 0) - (a.is_latest ? 1 : 0) || new Date(b.created_at) - new Date(a.created_at));
      return { __t: 'json', payload: data.map(camelKeys), message: '查询成功(内存模式)' };
    }

    await ensureTables();
    let sql = 'SELECT * FROM accident_attachments WHERE accident_id = $1 AND is_deleted = FALSE';
    const params = [id];
    if (version) {
      sql += ' AND version = $2';
      params.push(version);
    }
    sql += ' ORDER BY is_latest DESC, created_at DESC';

    const result = await pool.query(sql, params);
    return { __t: 'json', payload: result.rows.map(camelKeys), message: '查询成功' };
  } catch (err) {
    console.error('[Accident] 查询事故附件失败:', err.message);
    throw err;
  }
}

// ===== POST /:id/attachments（上传附件） =====
async function accidentUploadAttachment({ id, body, file, fileUrl, originalName, audit }) {
  try {
    if (!file) return { __t: 'validation-error', message: '请上传文件' };

    const { version = '1.0', uploaded_by = 'admin' } = body || {};

    if (!isConnected()) {
      initMemoryData();
      // 旧版本标记为非最新
      memoryAttachments.forEach(a => {
        if (a.accident_id === parseInt(id) && a.is_latest) a.is_latest = false;
      });
      const record = buildMemoryRecord(memoryAttachmentIdCounter++, {
        accident_id: parseInt(id),
        filename: file.filename,
        original_name: originalName,
        file_type: 'document',
        file_size: file.size,
        file_url: fileUrl,
        version,
        uploaded_by,
        is_latest: true,
      });
      memoryAttachments.push(record);
      return { __t: 'json', payload: camelKeys(record), message: '上传成功(内存模式)' };
    }

    await ensureTables();

    // 数据库模式：旧版本标记为非最新
    await pool.query(
      'UPDATE accident_attachments SET is_latest = FALSE WHERE accident_id = $1 AND is_latest = TRUE',
      [id]
    );

    const result = await pool.query(`
      INSERT INTO accident_attachments (accident_id, filename, original_name, file_type, file_size, file_url, version, uploaded_by, is_latest)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
      RETURNING *
    `, [id, file.filename, originalName, 'document', file.size, fileUrl, version, uploaded_by]);

    auditLog({ userId: audit?.userId, username: audit?.username, action: 'upload_attachment', module: 'accidents', description: `上传事故附件 事故ID=${id}`, ip: audit?.ip }).catch(() => {});
    return { __t: 'json', payload: camelKeys(result.rows[0]), message: '上传成功' };
  } catch (err) {
    console.error('[Accident] 上传事故附件失败:', err.message);
    throw err;
  }
}

// ===== DELETE /:id/attachments/:aid =====
async function accidentDeleteAttachment(id, aid, audit) {
  try {
    if (!isConnected()) {
      initMemoryData();
      const att = memoryAttachments.find(a => a.id === parseInt(aid) && a.accident_id === parseInt(id) && !a.is_deleted);
      if (!att) return { __t: 'not-found', message: '附件不存在' };
      att.is_deleted = true;
      return { __t: 'json', payload: null, message: '删除成功(内存模式)' };
    }

    await ensureTables();

    const result = await pool.query(
      'UPDATE accident_attachments SET is_deleted = TRUE WHERE id = $1 AND accident_id = $2 RETURNING id',
      [aid, id]
    );
    if (result.rows.length === 0) return { __t: 'not-found', message: '附件不存在' };
    auditLog({ userId: audit?.userId, username: audit?.username, action: 'delete_attachment', module: 'accidents', description: `删除事故附件 事故ID=${id}, 附件ID=${aid}`, ip: audit?.ip }).catch(() => {});
    return { __t: 'json', payload: null, message: '删除成功' };
  } catch (err) {
    console.error('[Accident] 删除事故附件失败:', err.message);
    throw err;
  }
}

// ===== GET /:id/versions =====
async function accidentVersions(id) {
  try {
    if (!isConnected()) {
      initMemoryData();
      const data = memoryVersions.filter(v => v.accident_id === parseInt(id));
      return { __t: 'json', payload: data.map(camelKeys), message: '查询成功(内存模式)' };
    }

    await ensureTables();

    const result = await pool.query(
      'SELECT * FROM accident_versions WHERE accident_id = $1 ORDER BY created_at DESC',
      [id]
    );
    return { __t: 'json', payload: result.rows.map(camelKeys), message: '查询成功' };
  } catch (err) {
    console.error('[Accident] 查询事故版本失败:', err.message);
    throw err;
  }
}

module.exports = {
  // 纯函数/常量（供复用与单测）
  normalizeStatus,
  normalizeLevel,
  normalizeType,
  statusToCn,
  levelToCn,
  typeToCn,
  calcExpiryStatus,
  inferPersonRole,
  formatRow,
  buildCsvExport,
  extractPlateFromDescription,
  memoryRecords,
  memoryAttachments,
  memoryVersions,
  // 端点 service
  accidentStatsAll,
  accidentStatsYearly,
  accidentUnsettled,
  accidentStatsLegacy,
  accidentExport,
  accidentList,
  accidentTeams,
  accidentPersonnelSearch,
  accidentSuggestTeam,
  accidentCategoryNature,
  accidentSuggestParty,
  accidentDetail,
  accidentCreate,
  accidentUpdate,
  accidentDelete,
  accidentAttachments,
  accidentUploadAttachment,
  accidentDeleteAttachment,
  accidentVersions,
};