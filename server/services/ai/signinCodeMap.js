/**
 * signinCodeMap —— 培训会议签到表「班组编号」解析
 *
 * 业务规则（来源：HSE 月度考核口径）：
 *   班组编号形如 <乡镇简称>-<序号>，例如 DC-1 / DC-01 / CHD-2。
 *   - 前缀 = 乡镇简称（DC=大曹镇，CHD=柴胡店镇 …）
 *   - 后缀 1 位数字：1=管理员、2=转运站操作工、3=驾驶员
 *     （即「乡镇作业中心经理为 XX 岗位培训」的场次）
 *   - 后缀 2 位数字：01=一班、02=二班 …（保洁班组）
 *
 * 乡镇简称 ↔ 全称映射缺省内置；如需扩充/纠错，在 server/config/team-code-map.json
 * 中以 [{"town":"大曹镇","codes":["DC"]}] 形式覆盖即可（无需改代码）。
 */
const fs = require('fs');
const path = require('path');

/** 内置乡镇简称映射（宁津项目 12 个乡镇/街道） */
const DEFAULT_TOWN_CODES = [
  { town: '大曹镇', codes: ['DC'] },
  { town: '柴胡店镇', codes: ['CHD'] },
  { town: '杜集镇', codes: ['DJ'] },
  { town: '长官镇', codes: ['ZG'] },
  { town: '张大庄镇', codes: ['ZDZ'] },
  { town: '大柳镇', codes: ['DL'] },
  { town: '宁城街道', codes: ['NC'] },
  { town: '津城街道', codes: ['JC'] },
  { town: '刘营伍乡', codes: ['LYW'] },
  { town: '相衙镇', codes: ['XY'] },
  { town: '保店镇', codes: ['BD'] },
  { town: '时集镇', codes: ['SJ'] },
];

/** 后缀 1 位数字 → 培训对象（乡镇作业中心经理直接培训的岗位） */
const ROLE_BY_SUFFIX = {
  1: '管理员',
  2: '转运站操作工',
  3: '驾驶员',
};

const CN_NUM = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

/** 1→一、10→十、11→十一、20→二十 */
function numberToCn(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return String(n);
  if (v < 10) return CN_NUM[v];
  if (v < 20) return v === 10 ? '十' : `十${CN_NUM[v % 10]}`;
  if (v < 100) {
    const tens = Math.floor(v / 10);
    const ones = v % 10;
    return `${CN_NUM[tens]}十${ones ? CN_NUM[ones] : ''}`;
  }
  return String(v);
}

let _townCodes = null;
function getTownCodes() {
  if (_townCodes) return _townCodes;
  let conf = null;
  try {
    const p = path.join(__dirname, '../../config/team-code-map.json');
    if (fs.existsSync(p)) conf = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) { /* 配置损坏则回退内置 */ }
  _townCodes = Array.isArray(conf) && conf.length ? conf : DEFAULT_TOWN_CODES;
  return _townCodes;
}

/**
 * 解析班组编号
 * @param {string} raw 形如 "DC-1" / "DC-01" / "CHD-2"
 * @returns {{ code:string, prefix:string, suffix:string, town:string,
 *             unitName:string, traineeRole:string, kind:string }}
 *          kind: 'role'(1位后缀) | 'class'(2位后缀) | 'unknown'
 */
function resolveTeamCode(raw) {
  const code = String(raw || '').trim().toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[—–－]/g, '-'); // 全角/长横线统一为半角
  const m = code.match(/^([A-Z]+)-?(\d+)$/);
  if (!m) {
    return {
      code, prefix: '', suffix: '', town: '', unitName: '', traineeRole: '', kind: 'unknown',
    };
  }
  const prefix = m[1];
  const suffix = m[2];
  const hit = getTownCodes().find((t) => (t.codes || []).some((c) => String(c).toUpperCase() === prefix));
  const town = hit ? hit.town : '';

  if (suffix.length === 1) {
    const role = ROLE_BY_SUFFIX[Number(suffix)] || '';
    return {
      code,
      prefix,
      suffix,
      town,
      unitName: town ? `${town}乡镇作业中心` : '',
      traineeRole: role,
      kind: 'role',
    };
  }
  // 2 位及以上：按保洁班组序号解读（01→一班）
  const seq = Number(suffix);
  return {
    code,
    prefix,
    suffix,
    town,
    unitName: town ? `${town}${numberToCn(seq)}班` : '',
    traineeRole: '',
    kind: 'class',
  };
}

module.exports = { resolveTeamCode, getTownCodes, numberToCn, DEFAULT_TOWN_CODES };
