<script setup lang="ts">
/**
 * 员工公共选择组件 - Sprint5.8 / Sprint-Q Q4 增强
 *
 * 用途: 所有 HSE 模块人员选择的统一入口
 * 支持: 单选/多选、关键词搜索（防抖）、组织/岗位/驾驶员筛选、状态过滤、
 *       批量粘贴员工编号、统一错误态 UI
 *
 * 使用示例:
 * ```vue
 * <EmployeeSelector
 *   v-model:value="form.employee_id"
 *   placeholder="选择员工"
 *   :is-driver="true"
 * />
 *
 * <EmployeeSelector
 *   v-model:value="selectedIds"
 *   mode="multiple"
 *   placeholder="选择培训人员"
 * />
 *
 * <!-- Q4 增强 -->
 * <EmployeeSelector v-model:value="form.personId" :filter-status="在职" />
 * <EmployeeSelector v-model:value="form.personId" :paste-employee-codes="true" />
 * ```
 */

import { computed, ref, watch } from 'vue';
import {
  Select,
  Spin,
  Tag,
  Tooltip,
  Alert,
  Button,
  Empty,
  Input,
} from 'ant-design-vue';
import type { PropType } from 'vue';
import {
  getEmployeeSelectorList,
  getEmployeeSelectorBatch,
  type EmployeeSelectorApi,
} from '#/api/hse/employee-selector';

// ============================================================
// Props & Emits
// ============================================================

const props = defineProps({
  value: {
    type: [Number, Array] as PropType<number | number[]>,
    default: undefined,
  },
  mode: {
    type: String as PropType<'single' | 'multiple'>,
    default: 'single',
  },
  placeholder: {
    type: String,
    default: '选择员工',
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  isDriver: {
    type: Boolean,
    default: false,
  },
  orgUnitId: {
    type: Number,
    default: undefined,
  },
  positionId: {
    type: Number,
    default: undefined,
  },
  maxCount: {
    type: Number,
    default: 50,
  },
  showDetail: {
    type: Boolean,
    default: true,
  },
  // ---- Q4 新增（全部 optional，不影响现有用法）----
  /** org_status 过滤（在职/离职等），透传到选择器 API 的 status 参数 */
  filterStatus: {
    type: String,
    default: undefined,
  },
  /** 启用批量粘贴员工编号（Excel 粘贴） */
  pasteEmployeeCodes: {
    type: Boolean,
    default: false,
  },
  /** 是否显示加载失败/搜索无结果/网络超时统一 UI */
  showErrorState: {
    type: Boolean,
    default: true,
  },
  /** 搜索防抖延迟（ms），默认 300 */
  debounceMs: {
    type: Number,
    default: 300,
  },
});

const emit = defineEmits<{
  (e: 'update:value', value: number | number[] | undefined): void;
  (e: 'change', item: EmployeeSelectorApi.SelectorItem | EmployeeSelectorApi.SelectorItem[] | undefined): void;
  // Q4 新增：错误事件（加载失败/超时）
  (e: 'error', payload: { type: string; message: string }): void;
}>();

// ============================================================
// 状态
// ============================================================

const loading = ref(false);
const options = ref<EmployeeSelectorApi.SelectorItem[]>([]);
const searchText = ref('');
const selectedItems = ref<EmployeeSelectorApi.SelectorItem[]>([]);
const loadError = ref<{ type: string; message: string } | null>(null);
const pasteText = ref('');
const pasteError = ref('');

let loadToken = 0;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

const selectValue = computed({
  get: () => props.value,
  set: (val) => emit('update:value', val as number | number[] | undefined),
});

const isMultiple = computed(() => props.mode === 'multiple');

// ============================================================
// 方法
// ============================================================

async function loadOptions(keyword: string) {
  const token = ++loadToken;
  loading.value = true;
  loadError.value = null;
  const params: EmployeeSelectorApi.SelectorParams & { status?: string } = {
    keyword: keyword || undefined,
    is_driver: props.isDriver || undefined,
    org_unit_id: props.orgUnitId,
    position_id: props.positionId,
    limit: 50,
  };
  if (props.filterStatus) {
    // TODO(Q4 / Phase 1 任务 2): 后端 API 需支持 status 过滤（当前 SelectorParams 无 status 字段）
    params.status = props.filterStatus;
  }
  try {
    const res = await getEmployeeSelectorList(params as EmployeeSelectorApi.SelectorParams);
    if (token !== loadToken) return;
    options.value = res;
  } catch (e: any) {
    if (token !== loadToken) return;
    const msg = (e?.message ?? String(e)) as string;
    const isTimeout = /timeout/i.test(msg);
    loadError.value = {
      type: isTimeout ? 'timeout' : 'load',
      message: isTimeout ? '请求超时，请检查网络后重试' : '加载员工数据失败，请重试',
    };
    emit('error', loadError.value);
    options.value = [];
  } finally {
    if (token === loadToken) loading.value = false;
  }
}

async function loadSelectedItems() {
  if (!props.value) {
    selectedItems.value = [];
    return;
  }

  const ids = isMultiple.value
    ? (props.value as number[])
    : [props.value as number];

  if (ids.length === 0) {
    selectedItems.value = [];
    return;
  }

  try {
    const res = await getEmployeeSelectorBatch(ids);
    selectedItems.value = res;
  } catch (e) {
    console.error('加载已选员工失败:', e);
    selectedItems.value = [];
  }
}

function handleSearch(val: string) {
  searchText.value = val;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    loadOptions(val);
  }, props.debounceMs);
}

function handleChange(val: any) {
  emit('update:value', val);

  if (isMultiple.value) {
    const items = selectedItems.value.filter((item) =>
      (val as number[]).includes(item.employee_id)
    );
    emit('change', items);
  } else {
    const item = selectedItems.value.find((i) => i.employee_id === val);
    emit('change', item);
  }
}

// 格式化显示
function formatLabel(item: EmployeeSelectorApi.SelectorItem): string {
  if (!item) return '';
  if (props.showDetail) {
    return `${item.name} (${item.org_name || '-'} / ${item.position_name || '-'})`;
  }
  return item.name;
}

// 头像首字母
function getInitial(label: string): string {
  const s = (label || '?').toString().trim();
  return s ? s.charAt(0).toUpperCase() : '?';
}

// 批量粘贴员工编号解析（支持换行/逗号/空格/中文逗号分隔，仅识别数字员工ID）
async function handlePasteResolve() {
  pasteError.value = '';
  const tokens = pasteText.value
    .split(/[\s,，、]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const ids = tokens
    .map((t) => Number(t))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (ids.length === 0) {
    pasteError.value = '未识别到有效的员工编号（仅支持数字员工ID）';
    return;
  }
  try {
    const items = await getEmployeeSelectorBatch(ids);
    if (!items.length) {
      pasteError.value = '未匹配到对应员工';
      return;
    }
    const newIds = items.map((i) => i.employee_id);
    if (isMultiple.value) {
      const existing = Array.isArray(props.value) ? (props.value as number[]) : [];
      const merged = Array.from(new Set([...existing, ...newIds]));
      selectedItems.value = mergeItems(selectedItems.value, items);
      handleChange(merged);
    } else {
      selectedItems.value = items.slice(0, 1);
      handleChange(newIds[0] as number);
    }
    pasteText.value = '';
  } catch (e) {
    pasteError.value = '批量解析失败，请重试';
  }
}

function mergeItems(
  base: EmployeeSelectorApi.SelectorItem[],
  add: EmployeeSelectorApi.SelectorItem[],
): EmployeeSelectorApi.SelectorItem[] {
  const map = new Map<number, EmployeeSelectorApi.SelectorItem>();
  [...base, ...add].forEach((i) => map.set(i.employee_id, i));
  return Array.from(map.values());
}

function handleRetry() {
  loadOptions(searchText.value);
}

// 监听 value 变化，加载已选项
watch(
  () => props.value,
  () => {
    loadSelectedItems();
  },
  { immediate: true }
);

// 初始化加载
loadOptions('');
</script>

<template>
  <div>
    <Select
      v-model:value="selectValue"
      :mode="isMultiple ? 'multiple' : undefined"
      :placeholder="placeholder"
      :disabled="disabled"
      :loading="loading"
      :filter-option="false"
      show-search
      allow-clear
      :max-tag-count="3"
      :max-tag-placeholder="`+${maxCount}`"
      style="width: 100%"
      @search="handleSearch"
      @change="handleChange"
    >
      <template #dropdownRender>
        <div v-if="!loading && searchText && options.length === 0" style="padding: 16px; text-align: center; color: #999">
          <Empty description="未找到匹配的员工" :image="Empty.PRESENTED_IMAGE_SIMPLE" />
        </div>
        <div v-else style="padding: 8px; color: #999; font-size: 12px">
          输入姓名/工号搜索
        </div>
      </template>

      <Spin :spinning="loading">
        <Select.Option
          v-for="item in options"
          :key="item.employee_id"
          :value="item.employee_id"
          :label="formatLabel(item)"
          :item="item"
        >
          <div style="display: flex; justify-content: space-between; align-items: center">
            <span style="font-weight: 500">{{ item.name }}</span>
            <span style="color: #999; font-size: 12px">
              {{ item.employee_code || '-' }}
            </span>
          </div>
          <div style="color: #666; font-size: 12px; margin-top: 2px">
            {{ item.org_name || '-' }} / {{ item.position_name || '-' }}
            <Tag v-if="item.unit_name" size="small" style="margin-left: 4px">
              {{ item.unit_name }}
            </Tag>
          </div>
        </Select.Option>
      </Spin>

      <template #tagRender="{ label, closable, onClose }">
        <Tag
          :closable="closable"
          style="margin-right: 3px; display: inline-flex; align-items: center"
          @close="onClose"
        >
          <span
            style="display: inline-flex; width: 18px; height: 18px; border-radius: 50%; background: #1677ff; color: #fff; font-size: 11px; align-items: center; justify-content: center; margin-right: 4px"
          >{{ getInitial(label) }}</span>
          <Tooltip :title="label">
            <span style="max-width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-block">
              {{ label }}
            </span>
          </Tooltip>
        </Tag>
      </template>
    </Select>

    <!-- 批量粘贴员工编号 -->
    <div v-if="pasteEmployeeCodes" style="margin-top: 6px">
      <Input.TextArea
        v-model:value="pasteText"
        :rows="2"
        placeholder="可粘贴员工编号（Excel 列 / 逗号 / 空格 / 换行分隔）"
        @blur="handlePasteResolve"
      />
      <div v-if="pasteError" style="color: #cf1322; font-size: 12px; margin-top: 2px">
        {{ pasteError }}
      </div>
    </div>

    <!-- 统一错误态 UI -->
    <Alert
      v-if="showErrorState && loadError"
      :type="loadError.type === 'timeout' ? 'warning' : 'error'"
      :message="loadError.message"
      show-icon
      style="margin-top: 4px"
    >
      <template v-if="loadError.type === 'load'" #action>
        <Button size="small" @click="handleRetry">重试</Button>
      </template>
    </Alert>
  </div>
</template>
