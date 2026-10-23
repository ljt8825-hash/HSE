/**
 * 通用台账 CRUD composable
 *
 * 提取自 training/ledger/index.vue 的通用逻辑，供所有 ledger 页面复用。
 * 使用方式：
 *   const { loading, rows, total, page, pageSize, checkedIds, loadList, ... } = useLedgerCrud({
 *     api: { list, create, batchDelete },
 *     defaultPageSize: 20,
 *   });
 */
import { computed, ref } from 'vue';

export interface LedgerCrudOptions<T extends { id?: number; employeeId?: number }> {
  api: {
    list: (params: any) => Promise<{ list: T[]; total: number }>;
    create?: (data: any) => Promise<{ created: number }>;
    batchDelete: (ids: number[], month?: string) => Promise<{ deleted: number }>;
  };
  defaultPageSize?: number;
  /** 用于勾选的唯一键字段，默认 'employeeId'，若无则用 'id' */
  keyField?: 'employeeId' | 'id';
}

export function useLedgerCrud<T extends { id?: number; employeeId?: number }>(
  options: LedgerCrudOptions<T>,
) {
  const { api, defaultPageSize = 20, keyField = 'employeeId' } = options;

  const loading = ref(false);
  const rows = ref<T[]>([]);
  const total = ref(0);
  const page = ref(1);
  const pageSize = ref(defaultPageSize);
  const checkedIds = ref<number[]>([]);

  function getRowKey(row: T): number {
    return (row as any)[keyField] ?? (row as any).id ?? 0;
  }

  async function loadList(extraParams: Record<string, any> = {}) {
    loading.value = true;
    try {
      const res = await api.list({ page: page.value, pageSize: pageSize.value, ...extraParams });
      rows.value = res.list ?? [];
      total.value = res.total ?? 0;
      checkedIds.value = [];
    } finally {
      loading.value = false;
    }
  }

  async function createItem(data: any) {
    if (!api.create) return;
    const res = await api.create(data);
    return res;
  }

  async function deleteItems(ids: number[], month?: string) {
    const res = await api.batchDelete(ids, month);
    return res;
  }

  function toggleChecked(id: number, checked: boolean) {
    if (checked) {
      if (!checkedIds.value.includes(id)) {
        checkedIds.value = [...checkedIds.value, id];
      }
    } else {
      checkedIds.value = checkedIds.value.filter((v) => v !== id);
    }
  }

  function toggleAll(checked: boolean) {
    checkedIds.value = checked ? rows.value.map(getRowKey) : [];
  }

  const allChecked = computed(() => {
    return rows.value.length > 0 && rows.value.every((r) => checkedIds.value.includes(getRowKey(r)));
  });

  const someChecked = computed(() => {
    return rows.value.some((r) => checkedIds.value.includes(getRowKey(r))) && !allChecked.value;
  });

  function resetChecked() {
    checkedIds.value = [];
  }

  return {
    loading,
    rows,
    total,
    page,
    pageSize,
    checkedIds,
    loadList,
    createItem,
    deleteItems,
    toggleChecked,
    toggleAll,
    allChecked,
    someChecked,
    resetChecked,
    getRowKey,
  };
}
