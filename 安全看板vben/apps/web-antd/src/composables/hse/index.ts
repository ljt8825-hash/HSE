/**
 * 消费层公共 Composable 统一导出（Sprint-Q / Q3）
 *
 * 所有消费层模块按需从 '@/composables/hse' 引入，禁止散落直接调用 employee API。
 */

export * from './types';
export * from './useEmployeeData';
export * from './useEmployeeSearch';
export * from './useEmployeeEvent';
export * from './useEmployeeLink';
export * from './useEmployeeSelectorAdapter';

// 第三阶段 · 页面统一化：公共 CRUD composable
export { useSearchForm } from './useSearchForm';
export type { UseSearchFormOptions, UseSearchFormReturn } from './useSearchForm';
export { useDataTable } from './useDataTable';
export type { UseDataTableOptions, UseDataTableReturn, DataTablePagination } from './useDataTable';
export { useCrudModal } from './useCrudModal';
export type { UseCrudModalOptions, UseCrudModalReturn } from './useCrudModal';
