/**
 * 通用台账搜索/筛选/分页 composable
 *
 * 提取自 violation/ledger 和 grid-ledger 的通用搜索逻辑。
 * 使用方式：
 *   const { searchForm, page, pageSize, loading, total, data, loadData, onSearch, onReset, onPageChange } = useLedgerSearch({
 *     api: { list: getGridInspectionList },
 *     defaultPageSize: 100,
 *     defaultSearchForm: { keyword: '', areaTeam: undefined },
 *   });
 */
import { reactive, ref } from 'vue';

export interface LedgerSearchOptions<T = any> {
  api: {
    list: (params: Record<string, any>) => Promise<{ list: T[]; total: number }>;
  };
  defaultPageSize?: number;
  defaultSearchForm?: Record<string, any>;
  /** 默认的 hasViolation / hasRectifiedPhoto 等固定筛选参数 */
  fixedParams?: Record<string, any>;
}

export function useLedgerSearch<T = any>(options: LedgerSearchOptions<T>) {
  const { api, defaultPageSize = 20, defaultSearchForm = {}, fixedParams = {} } = options;

  const loading = ref(false);
  const data = ref<T[]>([]);
  const total = ref(0);
  const page = ref(1);
  const pageSize = ref(defaultPageSize);
  const searchForm = reactive({ ...defaultSearchForm });

  async function loadData() {
    loading.value = true;
    try {
      const params: Record<string, any> = {
        page: page.value,
        pageSize: pageSize.value,
        ...fixedParams,
      };
      // 只传有值的搜索字段
      for (const [key, val] of Object.entries(searchForm)) {
        if (val !== undefined && val !== null && val !== '') {
          params[key] = val;
        }
      }
      const res = await api.list(params);
      data.value = res.list ?? [];
      total.value = res.total ?? 0;
    } catch {
      data.value = [];
      total.value = 0;
    } finally {
      loading.value = false;
    }
  }

  function onSearch() {
    page.value = 1;
    loadData();
  }

  function onReset() {
    Object.assign(searchForm, defaultSearchForm);
    page.value = 1;
    loadData();
  }

  function onPageChange(payload: { currentPage: number; pageSize: number }) {
    page.value = payload.currentPage;
    pageSize.value = payload.pageSize;
    loadData();
  }

  function onRefresh() {
    loadData();
  }

  return {
    loading,
    data,
    total,
    page,
    pageSize,
    searchForm,
    loadData,
    onSearch,
    onReset,
    onPageChange,
    onRefresh,
  };
}
