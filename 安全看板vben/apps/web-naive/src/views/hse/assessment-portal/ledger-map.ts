/**
 * 考核类别 → 镜像路由映射（月度考核聚合门户专用）
 *
 * 门户页根据「类别扣分上限」返回的 category 字段，把卡片映射到对应镜像子路由；
 * category 值由后端/用户自由配置，故除精确键外还提供「包含式」柔性匹配，
 * 避免类别名称微调导致整卡跳转失效。找不到映射的类别统一落到「扣分规则库」。
 */
const MIRROR_PREFIX = '/objectives/assessment-monthly/mirror';

/** 精确键映射（与「类别扣分上限」常见的类别名对齐） */
export const ledgerRouteMap: Record<string, string> = {
  安全文化建设: `${MIRROR_PREFIX}/safety-culture`,
  '三违管理考核': `${MIRROR_PREFIX}/violation-assessment`,
  三违管理: `${MIRROR_PREFIX}/violation-assessment`,
  '三违管理(目标职责)': `${MIRROR_PREFIX}/violation-assessment`,
  三违台账: `${MIRROR_PREFIX}/violation-ledger`,
  现场管理: `${MIRROR_PREFIX}/grid-mgmt`,
  '现场管理-驾驶员管理': `${MIRROR_PREFIX}/driver-monthly`,
  '现场管理-转运站管理': `${MIRROR_PREFIX}/transfer-stations`,
  驾驶员管理: `${MIRROR_PREFIX}/driver-monthly`,
  驾驶员月度考核: `${MIRROR_PREFIX}/driver-monthly`,
  转运站管理: `${MIRROR_PREFIX}/transfer-stations`,
  HSE教育培训: `${MIRROR_PREFIX}/training-records`,
  教育培训: `${MIRROR_PREFIX}/training-records`,
  网格长巡查管理: `${MIRROR_PREFIX}/grid-mgmt`,
  网格长巡查台账: `${MIRROR_PREFIX}/grid-ledger`,
};

/** 默认回退：类别上限/规则库配置页 */
export const DEFAULT_LEDGER_ROUTE = '/objectives/assessment-rule';

/**
 * 台账镜像入口（门户「台账镜像」区固定展示，覆盖全部散落的考核台账页）。
 * 与类别扣分上限无耦合：无论 category-limit 表是否有对应类别，这些入口恒定存在。
 */
export const ledgerPages: Array<{ title: string; icon: string; path: string }> = [
  { title: '安全文化建设', icon: 'lucide:shield', path: `${MIRROR_PREFIX}/safety-culture` },
  { title: '三违管理考核', icon: 'lucide:clipboard-list', path: `${MIRROR_PREFIX}/violation-assessment` },
  { title: '三违台账', icon: 'lucide:list-checks', path: `${MIRROR_PREFIX}/violation-ledger` },
  { title: '三违分析', icon: 'lucide:bar-chart-3', path: `${MIRROR_PREFIX}/violation-analysis` },
  { title: '驾驶员-月度考核', icon: 'lucide:truck', path: `${MIRROR_PREFIX}/driver-monthly` },
  { title: '转运站管理', icon: 'lucide:building-2', path: `${MIRROR_PREFIX}/transfer-stations` },
  { title: '网格长巡查管理', icon: 'lucide:map', path: `${MIRROR_PREFIX}/grid-mgmt` },
  { title: '网格长巡查台账', icon: 'lucide:clipboard-list', path: `${MIRROR_PREFIX}/grid-ledger` },
  { title: '培训记录', icon: 'lucide:book-open', path: `${MIRROR_PREFIX}/training-records` },
];

/** 包含式规则（按优先级判定），用于柔性匹配未知类别名 */
const CONTAIN_RULES: Array<[string, string]> = [
  ['转运站', `${MIRROR_PREFIX}/transfer-stations`],
  ['驾驶员', `${MIRROR_PREFIX}/driver-monthly`],
  ['三违', `${MIRROR_PREFIX}/violation-ledger`],
  ['安全文化', `${MIRROR_PREFIX}/safety-culture`],
  ['培训', `${MIRROR_PREFIX}/training-records`],
  ['巡查台账', `${MIRROR_PREFIX}/grid-ledger`],
  ['网格', `${MIRROR_PREFIX}/grid-mgmt`],
];

/**
 * 解析类别 → 跳转路由。
 * @param category 类别扣分上限中的 category 字段
 * @returns 镜像路由 path；未知类别回退到 DEFAULT_LEDGER_ROUTE
 */
export function resolveLedgerRoute(category?: string | null): string {
  if (!category) return DEFAULT_LEDGER_ROUTE;
  const c = String(category).trim();
  if (!c) return DEFAULT_LEDGER_ROUTE;
  const exact = ledgerRouteMap[c];
  if (exact) return exact;
  for (const [kw, route] of CONTAIN_RULES) {
    if (c.includes(kw)) return route;
  }
  return DEFAULT_LEDGER_ROUTE;
}