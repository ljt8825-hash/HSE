/**
 * PC「网格长巡查台账」数据源开关（Sprint-WPS-02 · 目标 B / Sprint-WPS-02-A 整改）
 *
 * 唯一决策点：当前 PC 台账业务数据源是 PostgreSQL 还是 WPS 多维表。
 *
 * 三态语义（Sprint-WPS-02-A 阻断项 1 整改结论）：
 *   - 'pg'            WPS_GRID_DATA_SOURCE 缺省或 ='false' → 明确使用 PostgreSQL（默认，零行为变化）。
 *   - 'wps'           WPS_GRID_DATA_SOURCE='true' 且 WPS 凭证完整 → 必须使用 WPS。
 *   - 'misconfigured' WPS_GRID_DATA_SOURCE='true' 但 WPS 凭证不完整（缺 APP_ID/APP_SECRET/文件ID/表ID 任一）
 *                     → 配置错误。上层必须返回显式配置错误，禁止静默回落到 PostgreSQL。
 *
 * 原则（阻断项 1）：
 *   - 只有配置开关决定数据源；WPS 凭证只决定「WPS 是否可用」。
 *   - 绝不出现「管理员以为切到 WPS，实际系统悄悄还在 PG」。
 *   - 进程内按进程生命期计算一次（env 在启动时确定，无需热更新）。
 */
const wpsClient = require('../wpsClient');

const MODE = { PG: 'pg', WPS: 'wps', MISCONFIGURED: 'misconfigured' };

function envEnabled() {
  return String(process.env.WPS_GRID_DATA_SOURCE || '').toLowerCase() === 'true';
}

let cachedMode = null;

/** 返回三态：'pg' | 'wps' | 'misconfigured'（每次进程只计算一次） */
function getGridDataSourceMode() {
  if (cachedMode) return cachedMode;
  if (!envEnabled()) {
    cachedMode = MODE.PG;
  } else if (!wpsClient.isConfigured()) {
    cachedMode = MODE.MISCONFIGURED;
    console.warn('[gridDataSource] WPS_GRID_DATA_SOURCE=true 但 WPS 凭证不完整 → 判为配置错误（misconfigured），禁止静默回落到 PostgreSQL');
  } else {
    cachedMode = MODE.WPS;
    console.log('[gridDataSource] WPS 网格长巡查台账数据源已启用');
  }
  return cachedMode;
}

/**
 * 兼容旧调用：仅在真正启用 WPS 时返回 true。
 * 注意：为满足「配置不完整禁止静默回 PG」，外部应优先使用 getGridDataSourceMode() 三态判定；
 *      isWpsGridDataSourceEnabled() 对 'misconfigured' 也返回 false，上层请勿据此回落 PG。
 */
function isWpsGridDataSourceEnabled() {
  return getGridDataSourceMode() === MODE.WPS;
}

module.exports = { getGridDataSourceMode, isWpsGridDataSourceEnabled, MODE };