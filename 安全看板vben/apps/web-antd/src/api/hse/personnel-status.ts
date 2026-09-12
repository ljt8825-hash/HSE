/**
 * 人员保险状态显示映射（任务7：页面险种列与详情统一按后端 status 显示）。
 * status 语义由后端 calcInsuranceStatus 统一给出：
 *   insured   = 当前有效且止期距业务日 > 30 天
 *   expiring  = 当前有效且止期距业务日 0–30 天（含 0/30）
 *   expired   = 只有历史保单（止期早于业务日）
 *   uninsured = 未来/停用/日期不完整/无有效事实
 * 前端仅做文本/颜色映射，禁止用保额、记录对象存在或 hasInsurance 直接判定"已参保"。
 */

const STATUS_TEXT: Record<string, string> = {
  insured: '已参保',
  expiring: '即将到期',
  expired: '已过期',
  uninsured: '未参保',
};

const STATUS_COLOR: Record<string, string> = {
  insured: 'green',
  expiring: 'gold',
  expired: 'red',
  uninsured: 'default',
};

export function getInsuranceStatusText(status?: string | null): string {
  if (!status) return '未参保';
  return STATUS_TEXT[status] || status;
}

export function getInsuranceStatusColor(status?: string | null): string {
  if (!status) return 'default';
  return STATUS_COLOR[status] || 'default';
}

/** 是否当前有效参保（仅与 status 同源，禁止由 hasInsurance 反推 isCurrent） */
export function isActiveInsurance(status?: string | null): boolean {
  return status === 'insured' || status === 'expiring';
}
