/**
 * 物资价格库 · 后端 API 封装（web-naive）
 * 挂载于 /api/hse/material-price（全局鉴权），复用 #/api/request 的 requestClient。
 * requestClient 已配置 responseReturn:'data'，故各方法直接返回后端 success() 的 data 字段。
 */
import { requestClient } from '#/api/request';

const BASE = '/hse/material-price';

export interface MaterialPriceItem {
  id: string;
  category: string;
  name: string;
  spec: string;
  unitPrice: number;
  /** 措施项目（安全生产费用类别），从年度安全费用预算表联动 */
  measureItem?: string;
  /** 预算科目（费用化/资本化） */
  budgetSubject?: string;
}

export interface MaterialPriceListResult {
  items: MaterialPriceItem[];
}

export interface MaterialPricePayload {
  category: string;
  name: string;
  spec?: string;
  unitPrice: number;
  measureItem?: string;
  budgetSubject?: string;
}

/** 列表：返回全部未删除物资，前端按 category 分组 */
export function listMaterialPrices() {
  return requestClient.get<MaterialPriceListResult>(BASE);
}

/** 新增单条 */
export function createMaterialPrice(payload: MaterialPricePayload) {
  return requestClient.post<MaterialPriceItem>(BASE, payload);
}

/** 批量新增（导入）：返回创建后的完整记录数组（含服务端 id） */
export function createMaterialPricesBatch(
  category: string,
  items: { name: string; spec?: string; unitPrice: number; measureItem?: string; budgetSubject?: string }[],
) {
  return requestClient.post<MaterialPriceItem[]>(`${BASE}/batch`, { category, items });
}

/** 更新单条 */
export function updateMaterialPrice(
  id: string | number,
  payload: { name: string; spec?: string; unitPrice: number; measureItem?: string; budgetSubject?: string },
) {
  return requestClient.put<MaterialPriceItem>(`${BASE}/${id}`, payload);
}

/** 删除（软删） */
export function deleteMaterialPrice(id: string | number) {
  return requestClient.delete(`${BASE}/${id}`);
}
