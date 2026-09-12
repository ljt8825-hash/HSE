/**
 * 人员保险业务日（任务3，提示词08；任务1，提示词09 集中管理）。
 *
 * 业务时区固定为 Asia/Shanghai。Node 侧不得用 UTC toISOString().slice(0,10) 代表中国业务日；
 * DB 侧不得依赖连接会话时区下的裸 CURRENT_DATE。
 *
 * 唯一允许的 PostgreSQL 业务日表达式（提示词09，任务1）：
 *   (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date
 * 注意：必须带外层括号——`AT TIME ZONE` 的优先级高于 `::date` 类型转换，
 * 无括号时 PostgreSQL 会尝试把字符串 'Asia/Shanghai' 转为 date 而失败。
 *
 * insurance.js / import.js 只能从本模块导入 BUSINESS_DAY_SQL，不得各自复制文字常量。
 * 纯函数、可注入时刻（测试固定北京时间零点前后边界）。
 */

const BUSINESS_TIMEZONE = 'Asia/Shanghai';

/** 唯一允许的人员保险业务日 SQL 表达式（带括号，可执行） */
const BUSINESS_DAY_SQL = "(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date";

/** 用 Intl 在指定时区拆出 YYYY/MM/DD，避免 UTC 偏移造成前后一天偏差 */
function formatInTimeZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * 返回业务日 YYYY-MM-DD（Asia/Shanghai）。
 * @param {Date|string|number} [now] 可注入时刻（默认当前时间）
 */
function getBusinessDayStr(now = new Date()) {
  const d = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`无效时刻: ${now}`);
  }
  return formatInTimeZone(d, BUSINESS_TIMEZONE);
}

module.exports = { BUSINESS_TIMEZONE, BUSINESS_DAY_SQL, getBusinessDayStr };
