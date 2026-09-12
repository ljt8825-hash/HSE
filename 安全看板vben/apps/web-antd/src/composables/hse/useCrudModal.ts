/**
 * useCrudModal —— 弹窗 / 抽屉 增删改查状态统一管理 composable（第三阶段 · 页面统一化）
 *
 * 封装 Modal / Drawer 的「打开 / 关闭 / 提交 / loading」逻辑，消除各页面重复实现
 * `visible` + `editingRecord` + `form` + 提交 try/catch + `message` 调用的现状。
 *
 * 设计要点：
 * - 调用方只需提供 `saveFn(data, isEdit)` 与 `onSuccess` 回调，其余由本 composable 托管。
 * - `saveFn` 约定返回 `{ code: 0, message?: string }`；`code === 0` 视为成功。
 * - 统一 `message.success / error` 调用，避免各页面散落。
 * - `openCreate` / `openEdit(record)` 区分新增与编辑，编辑时回填 `form`。
 *
 * 适用场景：页面内「内联表单弹窗」（表单状态由本页持有）的 CRUD 流程。
 * 若编辑 UI 已委托给独立的子组件（如 EmployeeEditModal），或弹窗为单一任务 +
 * 分支操作（如审批 approve / reject），则与本模型不匹配，宜保留原实现。
 *
 * @example
 * const modal = useCrudModal({
 *   saveFn: (data, isEdit) => (isEdit ? api.update(data.id, data) : api.create(data)),
 *   onSuccess: () => table.fetchData(),
 *   defaults: { name: '', code: '' },
 *   successMsg: { create: '新增成功', update: '编辑成功' },
 * });
 */
import { ref, reactive } from 'vue';
import { message } from 'ant-design-vue';

/** useCrudModal 配置项 */
export interface UseCrudModalOptions<T> {
  /** 创建 / 更新 API 函数，返回约定结构 `{ code, message? }` */
  saveFn: (data: T, isEdit: boolean) => Promise<{ code: number; message?: string }>;
  /** 保存成功后的回调（通常是刷新列表） */
  onSuccess: () => void;
  /** 表单默认值（新增时回填） */
  defaults: T;
  /** 成功提示文本 */
  successMsg?: { create: string; update: string };
}

/** useCrudModal 返回值 */
export interface UseCrudModalReturn<T> {
  /** 弹窗显隐 */
  visible: Ref<boolean>;
  /** 提交 loading */
  loading: Ref<boolean>;
  /** 当前编辑的记录（null 表示新增） */
  editingRecord: Ref<T | null>;
  /** 表单响应式对象 */
  form: T;
  /** 打开新增弹窗 */
  openCreate: () => void;
  /** 打开编辑弹窗（回填记录） */
  openEdit: (record: T) => void;
  /** 提交表单 */
  handleSave: () => Promise<void>;
  /** 关闭弹窗 */
  close: () => void;
}

import type { Ref } from 'vue';

/**
 * 创建受管的弹窗 CRUD 状态。
 * @template T 表单数据类型（需为对象）
 * @param options 配置项
 */
export function useCrudModal<T extends Record<string, any>>(
  options: UseCrudModalOptions<T>,
): UseCrudModalReturn<T> {
  const { saveFn, onSuccess, defaults, successMsg } = options;

  const visible = ref(false);
  const loading = ref(false);
  const editingRecord = ref<T | null>(null) as Ref<T | null>;
  const form = reactive({ ...defaults }) as T;

  /** 打开新增弹窗：清空表单为默认值 */
  function openCreate(): void {
    editingRecord.value = null;
    Object.assign(form, defaults);
    visible.value = true;
  }

  /** 打开编辑弹窗：回填记录 */
  function openEdit(record: T): void {
    editingRecord.value = record;
    Object.assign(form, record);
    visible.value = true;
  }

  /** 提交表单：调用 saveFn，统一处理成功 / 失败提示 */
  async function handleSave(): Promise<void> {
    loading.value = true;
    try {
      const result = await saveFn({ ...form } as T, !!editingRecord.value);
      if (result.code === 0) {
        message.success(
          editingRecord.value
            ? (successMsg?.update || '编辑成功')
            : (successMsg?.create || '新增成功'),
        );
        visible.value = false;
        onSuccess();
      } else {
        message.error(result.message || '操作失败');
      }
    } catch {
      message.error('操作失败，请重试');
    } finally {
      loading.value = false;
    }
  }

  /** 关闭弹窗 */
  function close(): void {
    visible.value = false;
  }

  return { visible, loading, editingRecord, form, openCreate, openEdit, handleSave, close };
}
