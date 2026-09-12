/**
 * 驾驶员安全驾驶风险等级判定规则引擎
 * 依据：《2026年项目交通安全专项行动实施方案》附表1
 *      「驾驶员安全驾驶风险等级划分标准及管控措施」的「违规内容」列
 *
 * 判定口径（用户 2026-09-03 确认，含当日复议修订）：
 *   1. 记分窗口用「滚动窗口」而非自然年：本年度 = 近 12 个月。
 *   2. 【核心原则·复议修订】表1 每一档都是「年限前置 + 记分阈值 + 行为枚举」三者绑定，
 *      行为枚举的评估窗口必须继承该档自己的年限，不得与记分窗口混用：
 *        · 重大档「存在超速(记12分)/酒驾/…/高速或城市快速路逆行倒车」→ 窗口 = 近2年
 *        · 较大档「存在闯红灯/超速(记6分)/不按规定让行/违规载货载人」→ 窗口 = 近2年
 *        · 较低档「无酒驾、超速50%以上、闯红灯、逆行等高危违法行为」→ 窗口 = 近5年
 *      （修订前误将较大档行为枚举压缩到近12个月，导致 2 年内的闯红灯出窗漏判。）
 *   3. 【核心原则·复议修订】行为自身的限定条件不得剥离：
 *        · 超速按记分分档：记12分→重大 / 记6分→较大 / 警告或≤3分→一般
 *        · 逆行须满足「高速公路或城市快速路」才属重大档严重违法；
 *          普通道路逆行不构成重大/较大档枚举项，仅命中较低档排除项（近5年）→ 上调至「一般」
 *   4. 「一般」档严格照表1原文取 4~6 分；7~8 分表1未覆盖，兜底归入「较大」。
 *   5. 表1备注「因单位工作指派受到记分或行政处罚的不计入风险评估依据」→
 *      备注含「指派」字样的记录直接剔除。
 *
 * 判定顺序：从重到轻，命中即出；并用「近3年/近5年严重违法」抬升下限档（floor），
 * 使各档年限前置条件（近2年/近3年/近5年无严重违法）在结果上真正成立。
 */

export type RiskLevel = '较低' | '一般' | '较大' | '重大';

/** 单条违章输入（来源：库内 driver-violation 记录 或 Excel 解析行） */
export interface ViolationInput {
  /** 违章日期：'YYYY-MM-DD HH:mm:ss' / 'YYYY/M/D' / Date / Excel 序列号 */
  date?: unknown;
  /** 违章事由（用于关键词识别严重/较重违法行为） */
  desc?: unknown;
  /** 记分：数字，或 '记1分' / '1分' 之类的带单位串 */
  points?: unknown;
  /** 罚款（仅展示用，不参与判定） */
  fine?: unknown;
  /** 备注：含「指派」时该条不计入评估 */
  note?: unknown;
}

/** 判定结果 */
export interface RiskVerdict {
  level: RiskLevel;
  /** 近 12 个月累计记分 */
  windowScore: number;
  /** 近 12 个月单次最高记分 */
  maxSingle: number;
  /** 近 12 个月违章条数 */
  windowCount: number;
  /** 近2年内命中的严重违法行为（触发重大） */
  severeHits: string[];
  /** 近3/近5年内命中的严重违法行为（抬升下限档） */
  severeHitsW3: string[];
  severeHitsW5: string[];
  /** 近2年内命中的较重违法行为（触发较大；窗口继承较大档「近2年」年限前置） */
  majorHits: string[];
  /** 近5年内命中的「较低」档排除高危行为（表1：无酒驾、超速50%以上、闯红灯、逆行等）→ 至少「一般」 */
  lowExcludeHits: string[];
  /** 参与判定的有效条数（已剔除「工作指派」） */
  effectiveCount: number;
  /** 被剔除的「工作指派」条数 */
  excludedCount: number;
  /** 判定依据（人类可读，写入档案「评估结果」） */
  basis: string;
  /** 窗口口径说明 */
  windowLabel: string;
}

/** 四级风险等级（顺序即由轻到重，用于取较高档） */
export const RISK_LEVELS: RiskLevel[] = ['较低', '一般', '较大', '重大'];

/** 等级序：用于比较取较高档 */
export function riskIndex(level: RiskLevel): number {
  return RISK_LEVELS.indexOf(level);
}
export function maxLevel(a: RiskLevel, b: RiskLevel): RiskLevel {
  return riskIndex(a) >= riskIndex(b) ? a : b;
}

/**
 * 表1「违规内容」+「管控措施」原文（单一数据源，与 Excel 附表1 逐字一致）
 * - content  → 写入档案「评估结果」
 * - measures → 写入档案「管控措施」
 */
export const RISK_RULES: Record<
  RiskLevel,
  { content: string; measures: string }
> = {
  较低: {
    content:
      '近5年无严重交通违法，本年度单次或年度累计记分≤3分，违章频次低，情节轻微，无酒驾、超速50%以上、闯红灯、逆行等高危违法行为。',
    measures:
      '常态化管理，定期开展交通安全警示教育和实操考核，正常安排驾驶作业。',
  },
  一般: {
    content:
      '近3年无严重交通违法，本年度累计记分4~6分（不含），违章频次较低，存在一般性违章，如违停、轻微超速（警告/记分≤3分）、不按规定行驶等，无重大违法记录。',
    measures:
      '1.列为一般关注人员，开展一对一安全约谈；限期签订安全行车承诺书，设定不少于3个月的规范提升期；\n2.开展交通安全专项培训（≥8学时），增加安全培训频次，不含班前会，持续周期≤4周；\n3.阶段性限制（≥2周）垃圾转运、收运等远途、夜间（凌晨）及高风险路段驾驶。',
  },
  较大: {
    content:
      '近2年无严重交通违法，年度累计记分≥9分或单次记分≥6分，违章频次较高，存在闯红灯、超速（记6分）、不按规定让行、违规载货/载人等较严重违法行为；有简易事故责任记录。',
    measures:
      '1.纳入重点监管名单，专项建档管理；\n2.暂停驾驶任务，强制参加交通安全专项培训和实操考核（≥16学时），持续周期≤2周；\n3.复工整改期：复工后每2周复盘1次行车违法记录，动态跟踪整改，持续周期≥3个月；\n4.复工整改期间出现同级风险行为的，升级管控措施。',
  },
  重大: {
    content:
      '近2年有严重交通违法，年度记分满12分或单次记分12分，存在超速（记12分）、酒驾、醉驾、毒驾、肇事逃逸、无证驾驶；涉可拘留、可吊销驾驶证、刑责等严重交通违法行为；驾驶证暂扣/降级/逾期未审验；高速或城市快速路逆行或倒车；负主要及以上责任的重大交通事故（造成1人死亡或3人以上重伤）、多次严重违法屡教不改；"路怒症"；具有严重不良社会影响。',
    measures:
      '1.立即暂停驾驶岗位工作，停工教育；\n2.按本单位规章制度，停工教育有成效的调离驾驶岗位；不接受教育或改正的，解除聘用关系或予以辞退。',
  },
};

/** 下拉选项 */
export const RISK_LEVEL_OPTIONS = RISK_LEVELS.map((v) => ({ label: v, value: v }));

/**
 * 等级 → 标签配色（对齐 HseStatusTag 的 HseStatusType：success/info/warning/danger）
 */
export const RISK_LEVEL_TAG: Record<RiskLevel, 'success' | 'info' | 'warning' | 'danger'> = {
  较低: 'success',
  一般: 'info',
  较大: 'warning',
  重大: 'danger',
};

/** 等级 → naive-ui NTag 的 type（naive 无 'danger'，用 'error'） */
export const RISK_LEVEL_NTAG: Record<RiskLevel, 'success' | 'info' | 'warning' | 'error'> = {
  较低: 'success',
  一般: 'info',
  较大: 'warning',
  重大: 'error',
};

/**
 * 严重交通违法（表1「重大」档枚举项）→ 命中即重大（需落在近2年内）
 * minPoints：该条还需达到的最低记分才计入（表1重大档的「超速」明确限定为「记12分」，
 *            故超速类必须满 12 分才算严重违法，6 分档留给「较大」判定）。
 */
const SEVERE_RULES: { label: string; kw: string[]; minPoints?: number }[] = [
  { label: '酒驾', kw: ['酒驾', '酒后驾驶', '饮酒后驾驶', '饮酒驾驶'] },
  { label: '醉驾', kw: ['醉驾', '醉酒'] },
  { label: '毒驾', kw: ['毒驾'] },
  { label: '肇事逃逸', kw: ['肇事逃逸', '交通肇事逃逸', '逃逸'] },
  {
    label: '无证驾驶',
    kw: ['无证驾驶', '未取得驾驶证', '驾驶证被吊销', '驾驶与准驾车型不符'],
  },
  {
    label: '超速50%以上（记12分）',
    minPoints: 12,
    kw: [
      '超过规定时速百分之五十',
      '超过规定时速50%以上',
      '超速50%以上',
      '时速百分之五十以上',
    ],
  },
  {
    label: '驾驶证暂扣/降级/逾期未审验',
    kw: ['暂扣', '降级', '逾期不参加审验', '逾期未审验', '扣留驾驶证'],
  },
  {
    label: '高速或城市快速路逆行/倒车',
    kw: [
      '高速公路倒车',
      '高速公路逆行',
      '城市快速路倒车',
      '城市快速路逆行',
      '高速倒车',
      '高速逆行',
      '在高速公路上倒车',
      '在高速公路上逆行',
    ],
  },
  { label: '涉拘留/吊销/刑责', kw: ['拘留', '吊销', '刑事', '刑责', '危险驾驶罪'] },
  { label: '路怒症', kw: ['路怒'] },
];

/**
 * 较重违法行为（表1「较大」档枚举项）→ 命中即较大
 * 窗口 = 近2年（继承较大档「近2年无严重交通违法」的年限前置，不可压缩到近12个月）。
 * 注：表1较大档枚举**不含「逆行」**——逆行仅出现在
 *     ①重大档且带「高速或城市快速路」前置（见 SEVERE_RULES）
 *     ②较低档排除项（见 LOW_EXCLUDE_RULES）
 *     故普通道路逆行不在此列，避免剥离前置条件后过度升档。
 */
const MAJOR_RULES: { label: string; kw: string[]; minPoints?: number }[] = [
  {
    label: '闯红灯',
    kw: ['闯红灯', '违反信号灯', '违反道路交通信号灯', '抢黄灯', '不按交通信号灯'],
  },
  {
    // 表1较大档「超速（记6分）」以记分为准：仅记分≥6分（如中型以上客车超速20%~50%）算较大档枚举；
    // 小型车超速20%~50%记3分属一般违章，不得剥离「记分=6分」前置误升较大。
    label: '超速（记6分）',
    minPoints: 6,
    kw: [
      '超过规定时速百分之二十以上未达到百分之五十',
      '超过规定时速20%以上未达到50%',
      '超过规定时速百分之二十以上不足百分之五十',
    ],
  },
  {
    label: '不按规定让行',
    kw: ['不按规定让行', '未让', '不让行', '未停车让行', '未停让人行横道', '不避让'],
  },
  {
    // 仅「达 30% 以上」或「违规载人」属表1的违规载货/载人；
    // 「超过最大允许总质量未达到百分之三十」实为记 1 分的轻微超载，不在此列。
    label: '违规载货/载人',
    kw: [
      '违规载',
      '货车违规载',
      '超过最大允许总质量百分之三十',
      '超过最大允许总质量30%',
      '超载百分之三十',
      '违反规定载货',
      '违反规定载客',
    ],
  },
  {
    // 超速 50% 以上但记分未满 12（如记 6 分）不属表1「重大」，降为较重行为
    label: '超速50%以上',
    kw: [
      '超过规定时速百分之五十',
      '超过规定时速50%以上',
      '超速50%以上',
      '时速百分之五十以上',
    ],
  },
  {
    label: '高速/快速路不按规定车道',
    kw: ['占用应急车道', '高速公路上不按规定车道', '在高速公路上不按规定车道'],
  },
];

/**
 * 「较低」档排除的高危违法行为（表1较低档原文：
 *   "无酒驾、超速50%以上、闯红灯、逆行等高危违法行为"）
 * 窗口 = 近5年（继承较低档「近5年」年限前置）。
 * 命中 → 不满足「较低」档前置，按表1阶梯上调至「一般」。
 *
 * 作用：兜住 SEVERE/MAJOR 的近2年窗口之外、但仍在近5年内的高危行为，
 *      以及表1未列入较大档枚举的「普通道路逆行」。
 */
const LOW_EXCLUDE_RULES: { label: string; kw: string[]; minPoints?: number }[] = [
  { label: '酒驾', kw: ['酒驾', '酒后驾驶', '饮酒后驾驶', '饮酒驾驶'] },
  { label: '醉驾', kw: ['醉驾', '醉酒'] },
  {
    label: '超速50%以上',
    kw: [
      '超过规定时速百分之五十',
      '超过规定时速50%以上',
      '超速50%以上',
      '时速百分之五十以上',
    ],
  },
  {
    label: '闯红灯',
    kw: ['闯红灯', '违反信号灯', '违反道路交通信号灯', '抢黄灯', '不按交通信号灯'],
  },
  { label: '逆行', kw: ['逆向行驶', '逆行'] },
];

/** 备注含这些词 → 属「单位工作指派」不计入评估（表1备注） */
const EXCLUDE_KEYWORDS = ['工作指派', '单位指派', '公车指派'];

function toText(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v);
}

/** 记分归一化：'记1分' / '1分' / 1 / '1' → 1 */
export function parsePoints(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = toText(v).trim();
  if (!s) return 0;
  const m = s.match(/\d+(?:\.\d+)?/);
  return m ? Number.parseFloat(m[0]) : 0;
}

/**
 * 日期归一化 → Date | null
 * 兼容：Date / Excel 序列号(数字) / 'YYYY-MM-DD HH:mm:ss' / 'YYYY/M/D H:mm:ss' / 'YYYY.M.D'
 */
export function parseDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number') {
    // Excel 日期序列号：1900 日期系统，需减 25569 天差值
    if (v > 0 && v < 100_000) {
      const d = new Date(Math.round((v - 25569) * 86_400_000));
      return Number.isNaN(d.getTime()) ? null : d;
    }
    return null;
  }
  const s = toText(v).trim().replace(/[年月]/g, '-').replace(/[日]/g, ' ').trim();
  if (!s) return null;
  // 脏串抢救（与后端 import.js parseViolationTime 同款）：
  // 汇总表个别单元格把日期时间连写成 `2025/1/910:36:00`（日与小时之间缺分隔符），
  // 直接 new Date 会把日贪婪认成 91 而判非法，这里先还原为标准串。
  const dirty = s.match(/^(\d{4})\/(\d{1,2})\/(\d+):(\d{2})(?::(\d{2}))?$/);
  if (dirty) {
    const year = Number(dirty[1]);
    const month = Number(dirty[2]);
    const dh = dirty[3] || ''; // 日+时拼接段，如 "910" → 日 9 / 时 10
    const minute = Number(dirty[4] || '0');
    const second = Number(dirty[5] || '0');
    if (month >= 1 && month <= 12 && minute <= 59 && second <= 59) {
      // 取所有合法的「日(1-2位)+时(1-2位)」拆分中第一个可用的
      for (let hl = 2; hl >= 1; hl--) {
        if (dh.length < hl + 1) continue;
        const hour = Number(dh.slice(-hl));
        const day = Number(dh.slice(0, dh.length - hl));
        if (hour <= 23 && day >= 1 && day <= 31) {
          const fixed = new Date(year, month - 1, day, hour, minute, second);
          if (!Number.isNaN(fixed.getTime()) && fixed.getDate() === day) return fixed;
        }
      }
    }
  }
  // 两位年兜底：'5/9/25 7:42'（部分 Excel 导出/区域设置会输出 M/D/YY）→ 2025-05-09
  const shortYear = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2})(?:[\sT]|$)/);
  if (shortYear) {
    const [, mo, da, yy] = shortYear;
    const month = Number(mo);
    const day = Number(da);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const full = 2000 + Number(yy);
      const d0 = new Date(full, month - 1, day);
      if (!Number.isNaN(d0.getTime())) return d0;
    }
  }
  const iso = s.replace(/\//g, '-').replace(/\./g, '-');
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T'));
  if (!Number.isNaN(d.getTime())) return d;
  // 兜底：仅年月日
  const m = iso.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const d2 = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(d2.getTime()) ? null : d2;
  }
  return null;
}

function matchLabels(
  text: string,
  rules: { label: string; kw: string[]; minPoints?: number }[],
  points = 0,
): string[] {
  if (!text) return [];
  const hits: string[] = [];
  for (const r of rules) {
    if (!r.kw.some((k) => text.includes(k))) continue;
    // 声明了 minPoints 的规则（如「超速记12分」）需该条记分达标才算命中
    if (r.minPoints !== undefined && points < r.minPoints) continue;
    hits.push(r.label);
  }
  return hits;
}

function monthsAgo(now: Date, months: number): Date {
  const d = new Date(now.getTime());
  const day = d.getDate();
  d.setMonth(d.getMonth() - months);
  // 处理月末溢出（如 3-31 减 1 个月变 3-03）
  if (d.getDate() < day) d.setDate(0);
  return d;
}

function fmtDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function uniq(arr: string[]): string[] {
  return [...new Set(arr)];
}

/**
 * 核心：按表1「违规内容」判定单个驾驶员的风险等级
 * @param items 该驾驶员的全部违章记录
 * @param now   判定基准时刻（默认当前），窗口按此滚动
 */
export function calcDriverRisk(
  items: ViolationInput[],
  now: Date = new Date(),
): RiskVerdict {
  const w1Start = monthsAgo(now, 12);
  const w2Start = monthsAgo(now, 24);
  const w3Start = monthsAgo(now, 36);
  const w5Start = monthsAgo(now, 60);

  let windowScore = 0;
  let maxSingle = 0;
  let windowCount = 0;
  let effectiveCount = 0;
  let excludedCount = 0;
  const severeW2: string[] = [];
  const severeW3: string[] = [];
  const severeW5: string[] = [];
  /** 较重违法行为：窗口 = 近2年（继承较大档年限前置） */
  const majorW2: string[] = [];
  /** 较低档排除的高危行为：窗口 = 近5年（继承较低档年限前置） */
  const lowExcludeW5: string[] = [];

  for (const it of items || []) {
    const note = toText(it.note);
    if (EXCLUDE_KEYWORDS.some((k) => note.includes(k))) {
      excludedCount += 1;
      continue;
    }
    effectiveCount += 1;
    const d = parseDate(it.date);
    const desc = toText(it.desc);
    const pts = parsePoints(it.points);

    // 记分口径：仅「本年度」= 近12个月
    if (d && d >= w1Start && d <= now) {
      windowScore += pts;
      windowCount += 1;
      if (pts > maxSingle) maxSingle = pts;
    }
    // 行为口径：各档行为枚举按该档自己的年限窗口评估
    if (d && d >= w2Start && d <= now) {
      severeW2.push(...matchLabels(desc, SEVERE_RULES, pts));
      majorW2.push(...matchLabels(desc, MAJOR_RULES, pts));
    }
    if (d && d >= w3Start && d <= now) severeW3.push(...matchLabels(desc, SEVERE_RULES, pts));
    if (d && d >= w5Start && d <= now) {
      severeW5.push(...matchLabels(desc, SEVERE_RULES, pts));
      lowExcludeW5.push(...matchLabels(desc, LOW_EXCLUDE_RULES, pts));
    }
  }

  // 下限档：近3年有严重违法 → 至少「较大」；近5年有严重违法 → 至少「一般」
  const floor: RiskLevel = severeW3.length
    ? '较大'
    : severeW5.length
      ? '一般'
      : '较低';

  let level: RiskLevel;
  let hit: string;
  if (severeW2.length) {
    level = '重大';
    hit = `近2年存在严重交通违法（${uniq(severeW2).join('、')}）`;
  } else if (maxSingle >= 12 || windowScore >= 12) {
    level = '重大';
    hit = `年度记分满12分或单次记分12分（近12个月累计${windowScore}分/单次最高${maxSingle}分）`;
  } else if (maxSingle >= 6) {
    level = '较大';
    hit = `单次记分≥6分（近12个月单次最高${maxSingle}分）`;
  } else if (windowScore >= 9) {
    level = '较大';
    hit = `年度累计记分≥9分（近12个月累计${windowScore}分）`;
  } else if (majorW2.length) {
    // 较大档行为枚举窗口 = 近2年（与该档「近2年无严重交通违法」前置同窗）
    level = '较大';
    hit = `近2年内存在表1「较大」档列举的较严重违法行为（${uniq(majorW2).join('、')}）`;
  } else if (windowScore >= 7 && windowScore <= 8) {
    // 表1未覆盖的 7~8 分空档，按用户确认兜底归入「较大」
    level = '较大';
    hit = `年度累计记分${windowScore}分（表1未覆盖的7~8分空档，按兜底规则归入较大）`;
  } else if (windowScore >= 4 && windowScore <= 6) {
    level = '一般';
    hit = `本年度累计记分${windowScore}分（4~6分区间）`;
  } else if (lowExcludeW5.length) {
    // 较低档要求「近5年无酒驾、超速50%以上、闯红灯、逆行等高危违法行为」
    level = '一般';
    hit = `本年度累计记分${windowScore}分（≤3分），但近5年内存在表1「较低」档排除的高危违法行为（${uniq(
      lowExcludeW5,
    ).join('、')}），不满足「较低」档前置，按表1阶梯上调至「一般」`;
  } else {
    level = '较低';
    hit = `近12个月累计记分${windowScore}分（≤3分）`;
  }

  const finalLevel = maxLevel(level, floor);
  const raised = riskIndex(floor) > riskIndex(level);
  // 抬升说明：明确点出「不满足哪一档的前置条件」，让判定口径对管理层自解释；
  // 未抬升且落在「较低」档时，补一句「近5年无严重交通违法」以呼应表1原文。
  const floorNote = raised
    ? `；但${severeW3.length ? '近3年' : '近5年'}内存在严重交通违法（${uniq(
        severeW3.length ? severeW3 : severeW5,
      ).join('、')}），不满足${
        severeW3.length ? '「一般」档「近3年无严重交通违法」' : '「较低」档「近5年无严重交通违法」'
      }的前置条件，按表1阶梯上调至「${floor}」`
    : level === '较低'
      ? '，且近5年无严重交通违法'
      : '';

  const basis = [
    `【判定依据】${hit}${floorNote}。`,
    `【窗口口径】记分：本年度=近12个月（${fmtDate(w1Start)}~${fmtDate(now)}）。` +
      `行为：重大/较大档按近2年（${fmtDate(w2Start)}起）、一般档前置按近3年（${fmtDate(w3Start)}起）、` +
      `较低档前置按近5年（${fmtDate(w5Start)}起）——各档行为枚举随该档年限评估。`,
    `【数据】参与判定${effectiveCount}条，其中近12个月${windowCount}条、累计${windowScore}分、单次最高${maxSingle}分${
      excludedCount ? `；按表1备注剔除「单位工作指派」${excludedCount}条` : ''
    }。`,
  ].join('\n');

  return {
    level: finalLevel,
    windowScore,
    maxSingle,
    windowCount,
    severeHits: uniq(severeW2),
    severeHitsW3: uniq(severeW3),
    severeHitsW5: uniq(severeW5),
    majorHits: uniq(majorW2),
    lowExcludeHits: uniq(lowExcludeW5),
    effectiveCount,
    excludedCount,
    basis,
    windowLabel: `本年度=${fmtDate(w1Start)}~${fmtDate(now)}`,
  };
}

/** 按等级取表1「违规内容」（写入评估结果） */
export function riskContent(level: RiskLevel): string {
  return RISK_RULES[level]?.content ?? '';
}

/** 按等级取表1「管控措施」 */
export function riskMeasures(level: RiskLevel): string {
  return RISK_RULES[level]?.measures ?? '';
}

/**
 * 仅按「驾驶记分」判定的引擎（用于「按违章记录判定」按钮）。
 * 与 calcDriverRisk 不同：**不以任何行为/命中为指标**，只依据记分定级。
 * 记分口径（表1「违规内容」的记分档）：
 *   · 重大：前期，单次记分 12 分 或 近12个月累计记分 ≥ 12 分
 *   · 较大：单次记分 ≥ 6 分，或 近12个月累计记分 ≥ 9 分
 *   · 一般：近12个月累计记分 4~6 分
 *   · 较低：近12个月累计记分 ≤ 3 分
 * 返回结构兼容 RiskVerdict，命中行为字段一律置空，便于 UI 复用。
 */
export function calcDriverRiskByScore(
  items: ViolationInput[],
  now: Date = new Date(),
): RiskVerdict {
  const w1Start = monthsAgo(now, 12);

  let windowScore = 0;
  let maxSingle = 0;
  let windowCount = 0;
  let effectiveCount = 0;
  let excludedCount = 0;

  for (const it of items || []) {
    const note = toText(it.note);
    if (EXCLUDE_KEYWORDS.some((k) => note.includes(k))) {
      excludedCount += 1;
      continue;
    }
    effectiveCount += 1;
    const d = parseDate(it.date);
    const pts = parsePoints(it.points);
    if (d && d >= w1Start && d <= now) {
      windowScore += pts;
      windowCount += 1;
      if (pts > maxSingle) maxSingle = pts;
    }
  }

  let level: RiskLevel;
  let hit: string;
  if (maxSingle >= 12 || windowScore >= 12) {
    level = '重大';
    hit = `单次记分12分或近12个月累计记分满12分（累计${windowScore}分/单次最高${maxSingle}分）`;
  } else if (maxSingle >= 6) {
    level = '较大';
    hit = `单次记分≥6分（近12个月单次最高${maxSingle}分）`;
  } else if (windowScore >= 9) {
    level = '较大';
    hit = `近12个月累计记分≥9分（累计${windowScore}分）`;
  } else if (windowScore >= 4 && windowScore <= 6) {
    level = '一般';
    hit = `近12个月累计记分${windowScore}分（4~6分区间）`;
  } else {
    level = '较低';
    hit = `近12个月累计记分${windowScore}分（≤3分）`;
  }

  const basis = [
    `【判定依据】${hit}。`,
    `【窗口口径】记分：本年度=近12个月（${fmtDate(w1Start)}~${fmtDate(now)}）。`,
    `【数据】参与判定${effectiveCount}条，其中近12个月${windowCount}条、累计${windowScore}分、单次最高${maxSingle}分${
      excludedCount ? `；按表1备注剔除「单位工作指派」${excludedCount}条` : ''
    }。`,
  ].join('\n');

  return {
    level,
    windowScore,
    maxSingle,
    windowCount,
    severeHits: [],
    severeHitsW3: [],
    severeHitsW5: [],
    majorHits: [],
    lowExcludeHits: [],
    effectiveCount,
    excludedCount,
    basis,
    windowLabel: `本年度=${fmtDate(w1Start)}~${fmtDate(now)}`,
  };
}

/**
 * 判定结果 → 档案字段写入值
 * assessmentResult = 表1违规内容原文 + 判定依据（便于追溯）
 * controlMeasures = 表1管控措施原文
 */
export function verdictToArchive(v: RiskVerdict): {
  assessmentLevel: RiskLevel;
  assessmentResult: string;
  controlMeasures: string;
} {
  return {
    assessmentLevel: v.level,
    assessmentResult: `${riskContent(v.level)}\n${v.basis}`,
    controlMeasures: riskMeasures(v.level),
  };
}
