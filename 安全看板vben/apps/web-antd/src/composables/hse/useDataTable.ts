/**
 * useDataTable —— 表格分页 + 数据获取统一管理 composable（第三阶段 · 页面统一化）
 *
 * 封装 Ant Design Vue Table 的「分页 / loading / 数据拉取」逻辑，消除各列表页
 * 重复实现 `pagination` + `handleTableChange` + 手动 `loading` 的现状。
 *
 * 设计要点：
 * - 调用方只需提供 `fetchFn(params) => Promise<{ list, total }>`，其余由本 composable 托管。
 * - `pagination` 直接兼容 a-table 的 `:pagination` 绑定（含 `current` / `pageSize` /
 *   `total` 以及透传的 `showSizeChanger` / `showTotal`）。
 * - `handleTableChange` 适配 a-table `@change` 事件首参（`{ current, pageSize }`）。
 *
 * 说明：分页键名采用 Ant Design Vue 约定的 `current`（而非 `page`），以零改动兼容
 * 业务页模板中既有的 `pagination.current` / `pagination.pageSize` / `pagination.total`
 * 绑定；fetch 入参仍使用 `{ page, pageSize }`。
 *
 * @example
 * const table = useDataTable<EmployeeItem>({
 *   fetchFn: ({ page, pageSize }) => getEmployeeList({ page, pageSize, ...searchForm }),
 *   defaultPageSize: 20,
 *   paginationExtra: { showSizeChanger: true, showTotal: (t) => `共 ${t} 条` },
 * });
 */
import { ref, reactive } from 'vue';
import type { Ref } from 'vue';

/** useDataTable 配置项 */
export interface UseDataTableOptions<T> {
  /** 数据获取函数：接收页码信息，返回列表与总数 */
  fetchFn: (params: { page: number; pageSize: number }) => Promise<{ list: T[]; total: number }>;
  /** 默认每页条数，默认 20 */
  defaultPageSize?: number;
  /** 透传给 a-table 的额外分页配置（showSizeChanger / showTotal 等） */
  paginationExtra?: Record<string, unknown>;
}

/** Ant Design Vue Table 分页对象（current 为当前页，兼容 @change 事件） */
export interface DataTablePagination {
  current: number;
  pageSize: number;
  total: number;
  [key: string]: unknown;
}

/** useDataTable 返回值 */
export interface UseDataTableReturn<T> {
  /** 表格 loading 状态 */
  loading: Ref<boolean>;
  /** 当前页数据列表 */
  dataList: Ref<T[]>;
  /** 数据总数（与 pagination.total 同步） */
  total: Ref<number>;
  /** a-table 可直接绑定的分页对象 */
  pagination: DataTablePagination;
  /** 拉取当前页数据 */
  fetchData: () => Promise<void>;
  /** 适配 a-table @change：更新页码并重新拉取（兼容 TablePaginationConfig 的可选字段） */
  handleTableChange: (pag: { current?: number; pageSize?: number }) => void;
  /** 回到第 1 页并重新拉取（搜索 / 重置时调用） */
  handleReset: () => void;
}

/**
 * 创建受管的表格状态。
 * @template T 行数据类型
 * @param options 配置项
 */
export function useDataTable<T>(options: UseDataTableOptions<T>): UseDataTableReturn<T> {
  const { fetchFn, defaultPageSize = 20, paginationExtra } = options;

  const loading = ref(false);
  const dataList = ref<T[]>([]) as Ref<T[]>;
  const total = ref(0);
  const pagination = reactive<DataTablePagination>({
    current: 1,
    pageSize: defaultPageSize,
    total: 0,
    ...(paginationExtra || {}),
  });

  /** 拉取当前页数据 */
  async function fetchData(): Promise<void> {
    loading.value = true;
    try {
      const result = await fetchFn({ page: pagination.current, pageSize: pagination.pageSize });
      dataList.value = result.list;
      total.value = result.total;
      pagination.total = result.total;
    } catch {
      // 错误提示由请求拦截器统一处理
    } finally {
      loading.value = false;
    }
  }

  /** 适配 a-table @change：更新页码并重新拉取 */
  function handleTableChange(pag: { current?: number; pageSize?: number }): void {
    pagination.current = pag.current ?? 1;
    pagination.pageSize = pag.pageSize ?? defaultPageSize;
    void fetchData();
  }

  /** 回到第 1 页并重新拉取（搜索 / 重置时调用） */
  function handleReset(): void {
    pagination.current = 1;
    void fetchData();
  }

  return { loading, dataList, total, pagination, fetchData, handleTableChange, handleReset };
}
