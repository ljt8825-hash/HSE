/**
 * 物资价格库 · 跨页面共享 store（web-naive）
 * 数据持久化到后端（hse_material_price 表），刷新 / 重进不丢。
 * 内存态 materialData 作为 UI 响应式数据源，由后端加载填充、由增删改同步。
 * 用途：物资价格库页录入维护；年度预算 / 月度购买计划引用其单价。
 */
import { reactive, ref } from 'vue';

import {
  createMaterialPricesBatch,
  deleteMaterialPrice,
  listMaterialPrices,
  updateMaterialPrice,
} from '#/api/hse/materialPrice';

export interface MaterialItem {
  id: string;
  name: string;
  spec: string;
  unitPrice: number;
  /** 措施项目（安全生产费用类别）——从年度安全费用预算表按 名称+规格 联动 */
  measureItem?: string;
  /** 预算科目（费用化/资本化） */
  budgetSubject?: string;
}

export const materialCategories = [
  { key: 'fire', label: '消防器材' },
  { key: 'ad', label: '广告公司' },
  { key: 'safety', label: '安全物资' },
  { key: 'cert', label: '安全证' },
] as const;

export type MaterialCategoryKey = (typeof materialCategories)[number]['key'];

// 模块级 reactive：所有导入此文件的页面共享同一份数据
const materialData = reactive<Record<string, MaterialItem[]>>({
  fire: [],
  ad: [],
  safety: [],
  cert: [],
});

// 加载态与去重守卫（避免多页面并发重复拉取）
const loading = ref(false);
let loaded = false;
let loadPromise: Promise<void> | null = null;

export function useMaterialPrice() {
  function labelOf(key: string): string {
    return materialCategories.find((c) => c.key === key)?.label || key;
  }

  function listOf(key: string): MaterialItem[] {
    return materialData[key] || [];
  }

  /** 从后端拉取全部物资价格，按分类填充 materialData
   *  force=true 时跳过 loaded 守卫，真正重新拉取（用于刷新按钮） */
  async function loadMaterials(force = false): Promise<void> {
    if (force) {
      loaded = false;
      loadPromise = null;
    }
    if (loaded) return;
    if (loadPromise) return loadPromise;
    loading.value = true;
    loadPromise = (async () => {
      try {
        const res = await listMaterialPrices();
        const items = res.items || [];
        // 先清空再填充（以后端为准）
        materialData.fire = [];
        materialData.ad = [];
        materialData.safety = [];
        materialData.cert = [];
        for (const it of items) {
          const key = it.category;
          if (!materialData[key]) materialData[key] = [];
          materialData[key].push({
            id: String(it.id),
            name: it.name,
            spec: it.spec || '',
            unitPrice: Number(it.unitPrice) || 0,
            measureItem: it.measureItem || '',
            budgetSubject: it.budgetSubject || '',
          });
        }
        loaded = true;
      } catch (err) {
        // 失败不置 loaded，允许下次重试；不清空已有数据
        loaded = false;
        loadPromise = null;
        throw err;
      } finally {
        loading.value = false;
      }
    })();
    return loadPromise;
  }

  /** 批量新增（导入 / 增加）：写后端，返回带服务端 id 的记录并合并进 materialData */
  async function addItems(key: string, items: MaterialItem[]): Promise<MaterialItem[]> {
    const payload = (items || []).map((i) => ({
      name: i.name,
      spec: i.spec,
      unitPrice: Number(i.unitPrice) || 0,
      measureItem: i.measureItem || '',
      budgetSubject: i.budgetSubject || '',
    }));
    const created = await createMaterialPricesBatch(key, payload);
    const mapped: MaterialItem[] = (created || []).map((c) => ({
      id: String(c.id),
      name: c.name,
      spec: c.spec || '',
      unitPrice: Number(c.unitPrice) || 0,
      measureItem: c.measureItem || '',
      budgetSubject: c.budgetSubject || '',
    }));
    materialData[key] = [...(materialData[key] || []), ...mapped];
    return mapped;
  }

  /** 删除单条：软删后端 + 本地移除 */
  async function removeItem(key: string, id: string): Promise<void> {
    await deleteMaterialPrice(id);
    materialData[key] = (materialData[key] || []).filter((i) => i.id !== id);
  }

  /** 更新单条：写后端 + 本地赋值 */
  async function updateItem(
    key: string,
    id: string,
    patch: Partial<MaterialItem>,
  ): Promise<void> {
    await updateMaterialPrice(id, {
      name: patch.name as string,
      spec: patch.spec,
      unitPrice: Number(patch.unitPrice) || 0,
      measureItem: patch.measureItem ?? '',
      budgetSubject: patch.budgetSubject ?? '',
    });
    const item = (materialData[key] || []).find((i) => i.id === id);
    if (item) {
      item.name = patch.name as string;
      item.spec = patch.spec as string;
      item.unitPrice = patch.unitPrice as number;
      if (patch.measureItem !== undefined) item.measureItem = patch.measureItem;
      if (patch.budgetSubject !== undefined) item.budgetSubject = patch.budgetSubject;
    }
  }

  return {
    materialData,
    materialCategories,
    loading,
    labelOf,
    listOf,
    loadMaterials,
    addItems,
    removeItem,
    updateItem,
  };
}
