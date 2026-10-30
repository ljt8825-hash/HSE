<script lang="ts" setup>
/**
 * 返聘弹窗（B02-DEC-03.28 / A-02e.5-D1）
 *
 * 唯一数据来源：`POST /api/hse/employee/org/rehire`（后端单事务返聘出口）。
 * 本组件**不做**任何本地状态冒充：
 *   - 不修改 `employment_relation`，不构造 `reinstated` 段，不伪造成功；
 *   - 成功后只发 `success` 事件让列表重新拉取真实数据（服务端口径）；
 *   - 失败时保留全部已填内容，并原样展示后端 message。
 *
 * 生效日期（§3）：
 *   - 初始 `null`（空），必须由操作人显式选择；
 *   - 不调用 `Date.now()`，不预填今天，也不把系统登记时间当业务日期；
 *   - 「必须晚于原任职段」由后端事务判定，前端只展示后端返回的原文。
 */
import { computed, ref, watch } from 'vue';

import {
  NAlert,
  NButton,
  NDatePicker,
  NForm,
  NFormItem,
  NInput,
  NModal,
  NSelect,
  NTreeSelect,
} from 'naive-ui';

import {
  buildRehirePayload,
  createRehireFormState,
  extractRehireError,
  type RehireFormState,
  toRehireDateString,
  validateRehireForm,
} from '#/api/hse/employee-rehire';
import {
  getDeptTree,
  getPositionList,
  rehireEmployee,
  type EmployeeApi,
} from '#/api/hse/employee';
import { message } from '#/adapter/naive';

const props = defineProps<{
  open: boolean;
  employeeId?: number;
  employeeName?: string;
}>();

const emit = defineEmits<{
  (e: 'update:open', val: boolean): void;
  (e: 'success'): void;
}>();

// 提交状态：既用于按钮 loading，也用于拦截重复提交
const submitting = ref(false);
// 后端错误原文（保留在弹窗内，避免只靠一次性 toast 丢失上下文）
const backendError = ref('');

// 部门树
const deptTree = ref<EmployeeApi.DeptNode[]>([]);
const deptLoading = ref(false);
// 岗位列表（随部门联动）
const positionList = ref<EmployeeApi.PositionItem[]>([]);
const positionLoading = ref(false);

// 表单状态：start_date 初始 null（空），见 createRehireFormState
const form = ref<RehireFormState>(createRehireFormState());

// 生效日期（时间戳 | null）；单独 ref 便于模板绑定，仍是同一份状态
const startDate = ref<null | number>(null);
watch(startDate, (v) => {
  form.value.start_date = v;
  if (v) backendError.value = '';
});

const deptTreeOptions = computed(() => convertDeptTree(deptTree.value));

function convertDeptTree(
  nodes: EmployeeApi.DeptNode[],
): Array<{ children?: any[]; key: number; label: string }> {
  return (nodes ?? []).map((node) => {
    const item: { children?: any[]; key: number; label: string } = {
      key: node.id,
      label: node.short_name || node.name,
    };
    if (node.children && node.children.length > 0) {
      item.children = convertDeptTree(node.children);
    }
    return item;
  });
}

const positionOptions = computed(() =>
  (positionList.value ?? []).map((p) => ({ label: p.name, value: p.id })),
);

// 预览文案：让操作人在提交前确认「将写入的业务生效日期」，避免误以为是系统登记时间
const effectiveDatePreview = computed(() => toRehireDateString(startDate.value));

watch(
  () => props.open,
  async (val) => {
    if (val) {
      resetForm();
      await loadDeptTree();
    }
  },
);

async function loadDeptTree() {
  deptLoading.value = true;
  try {
    deptTree.value = (await getDeptTree()) || [];
  } catch {
    /* 错误提示已由拦截器处理 */
  } finally {
    deptLoading.value = false;
  }
}

async function handleDeptChange(deptId?: number) {
  form.value.position_id = undefined;
  positionList.value = [];
  if (!deptId) return;
  positionLoading.value = true;
  try {
    const data = await getPositionList({ deptId });
    positionList.value = Array.isArray(data) ? data : (data.list ?? []);
  } catch {
    /* 错误提示已由拦截器处理 */
  } finally {
    positionLoading.value = false;
  }
}

function resetForm() {
  form.value = createRehireFormState();
  startDate.value = null;
  positionList.value = [];
  backendError.value = '';
  submitting.value = false;
}

async function handleSubmit() {
  // §4 重复提交防护：提交中直接忽略再次点击（按钮同时 disabled + loading）
  if (submitting.value) return;

  const validationError = validateRehireForm(props.employeeId, form.value);
  if (validationError) {
    backendError.value = '';
    message.warning(validationError);
    return;
  }

  submitting.value = true;
  backendError.value = '';
  try {
    await rehireEmployee(buildRehirePayload(props.employeeId as number, form.value));
    // 只有后端明确成功（code=0，拦截器放行）才提示成功
    message.success('返聘成功，已生成新的任职段并重置用工关系');
    emit('update:open', false);
    // 交由父级重新拉取列表与统计，前端不本地改值
    emit('success');
  } catch (err) {
    // 保留输入，展示后端原文（不吞错、不泛化成「操作失败」）
    backendError.value = extractRehireError(err);
  } finally {
    submitting.value = false;
  }
}

function handleCancel() {
  if (submitting.value) return;
  emit('update:open', false);
}
</script>

<template>
  <NModal
    v-model:show="props.open"
    :title="`返聘${employeeName ? ' - ' + employeeName : ''}`"
    preset="card"
    style="width: 560px; max-width: 92vw"
    :mask-closable="false"
    :bordered="false"
  >
    <NAlert
      v-if="backendError"
      type="error"
      :bordered="false"
      class="mb-3"
      data-testid="rehire-backend-error"
    >
      {{ backendError }}
    </NAlert>

    <NAlert type="info" :bordered="false" class="mb-3">
      返聘会在同一事务内：把用工关系重置为「正式员工」、新建一条「返聘」任职段、并写入人事变动历史。
      原退休任职段保持不变，不会被覆盖或重新打开。
    </NAlert>

    <NForm label-placement="top" :disabled="submitting">
      <NFormItem label="目标部门" required>
        <NTreeSelect
          v-model:value="form.team_id"
          :options="deptTreeOptions"
          placeholder="请选择返聘后的归属部门"
          clearable
          :default-expand-all="true"
          :loading="deptLoading"
          key-field="key"
          label-field="label"
          children-field="children"
          @update:value="handleDeptChange"
        />
      </NFormItem>

      <NFormItem label="岗位" required>
        <NSelect
          v-model:value="form.position_id"
          :options="positionOptions"
          placeholder="请先选择部门，再选择岗位"
          :loading="positionLoading"
          :disabled="!form.team_id"
          clearable
        />
      </NFormItem>

      <NFormItem
        label="返聘生效日期（业务日期）"
        required
        :feedback="
          effectiveDatePreview
            ? `将写入业务生效日期：${effectiveDatePreview}`
            : '必填，需手动选择；不使用系统当天日期或登记时间'
        "
      >
        <NDatePicker
          v-model:value="startDate"
          type="date"
          format="yyyy-MM-dd"
          style="width: 100%"
          placeholder="请选择返聘生效日期"
          :clearable="true"
          data-testid="rehire-start-date"
        />
      </NFormItem>

      <NFormItem label="备注">
        <NInput
          v-model:value="form.remark"
          type="textarea"
          :rows="3"
          placeholder="返聘依据、审批文号等（可选）"
          :maxlength="500"
          show-count
        />
      </NFormItem>
    </NForm>

    <template #footer>
      <div class="flex justify-end gap-2">
        <NButton :disabled="submitting" @click="handleCancel">取消</NButton>
        <NButton
          type="primary"
          :loading="submitting"
          :disabled="submitting"
          data-testid="rehire-submit"
          @click="handleSubmit"
        >
          确认返聘
        </NButton>
      </div>
    </template>
  </NModal>
</template>
