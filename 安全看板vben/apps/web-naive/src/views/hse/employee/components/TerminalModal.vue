<script lang="ts" setup>
/**
 * 终态登记弹窗（B02-DEC-03.34 / A-02A）
 *
 * 唯一数据来源：`POST /api/hse/employee/org/terminate`（后端单事务终态登记出口）。
 * 本组件**不做**任何本地状态冒充：
 *   - 不修改 `employment_relation`，不构造任职段，不伪造成功；
 *   - 成功后只发 `success` 事件让列表重新拉取真实数据（服务端口径）；
 *   - 失败时保留全部已填内容，并原样展示后端 message。
 *
 * 业务事件日期（§3）：
 *   - 初始 `null`（空），必须由操作人显式选择；
 *   - 不调用 `Date.now()`，不预填今天，也不把系统登记时间当业务日期；
 *   - 「必须不早于当前任职段开始日期」由后端事务判定，前端只展示后端返回的原文。
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
  NRadioGroup,
  NRadio,
  NRadioButton,
} from 'naive-ui';

import {
  buildTerminatePayload,
  createTerminateFormState,
  extractTerminateError,
  type TerminateFormState,
  TERMINAL_TYPES,
  toTerminateDateString,
  validateTerminateForm,
} from '#/api/hse/employee-terminate';
import { terminateEmployee, type EmployeeApi } from '#/api/hse/employee';
import { orgStatusLabel } from '#/api/hse/employee-status';
import { message } from '#/adapter/naive';

const props = defineProps<{
  open: boolean;
  employeeId?: number;
  employeeName?: string;
  /** 当前任职状态（org_status 编码，用于弹窗内展示） */
  orgStatus?: string | null;
  /** 服务端派生标记：当前用工关系是否处于终态集合 */
  isTerminalRelation?: boolean | null;
  /** 服务端派生标记：当前用工关系是否为退休（用于展示提示，不参与资格判断） */
  isRetiredRelation?: boolean | null;
}>();

const emit = defineEmits<{
  (e: 'update:open', val: boolean): void;
  (e: 'success'): void;
}>();

// 提交状态：既用于按钮 loading，也用于拦截重复提交
const submitting = ref(false);
// 后端错误原文（保留在弹窗内，避免只靠一次性 toast 丢失上下文）
const backendError = ref('');

// 表单状态：event_date 初始 null（空），见 createTerminateFormState
const form = ref<TerminateFormState>(createTerminateFormState());

// 业务事件日期（时间戳 | null）；单独 ref 便于模板绑定，仍是同一份状态
const eventDate = ref<null | number>(null);
watch(eventDate, (v) => {
  form.value.event_date = v;
  if (v) backendError.value = '';
});

watch(
  () => props.open,
  (val) => {
    if (val) resetForm();
  },
);

// 展示当前关系提示：仅依据服务端派生的两个布尔 + org_status，不反推、不伪造
const relationHint = computed(() => {
  if (props.isRetiredRelation === true) return '退休';
  if (props.isTerminalRelation === true) return '已处于终态（辞职/死亡）';
  return '正式员工 / 待核实（以花名册为准）';
});

// 预览文案：让操作人在提交前确认「将写入的业务事件日期」，避免误以为是系统登记时间
const effectiveDatePreview = computed(() => toTerminateDateString(eventDate.value));

function resetForm() {
  form.value = createTerminateFormState();
  eventDate.value = null;
  backendError.value = '';
  submitting.value = false;
}

async function handleSubmit() {
  // §4 重复提交防护：提交中直接忽略再次点击（按钮同时 disabled + loading）
  if (submitting.value) return;

  const validationError = validateTerminateForm(props.employeeId, form.value);
  if (validationError) {
    backendError.value = '';
    message.warning(validationError);
    return;
  }

  submitting.value = true;
  backendError.value = '';
  try {
    await terminateEmployee(buildTerminatePayload(props.employeeId as number, form.value));
    // 只有后端明确成功（code=0，拦截器放行）才提示成功
    message.success('终态登记成功，已更新用工关系并关闭当前任职段');
    emit('update:open', false);
    // 交由父级重新拉取列表与统计，前端不本地改值
    emit('success');
  } catch (err) {
    // 保留输入，展示后端原文（不吞错、不泛化成「操作失败」）
    backendError.value = extractTerminateError(err);
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
    :title="`终态登记${employeeName ? ' - ' + employeeName : ''}`"
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
      data-testid="terminate-backend-error"
    >
      {{ backendError }}
    </NAlert>

    <NAlert type="info" :bordered="false" class="mb-3">
      终态登记会在同一事务内：把用工关系更新为选定类型（辞职 / 死亡 / 退休）、写入离职日期、
      关闭当前有效任职段、并写入人事变动历史与操作审计。提交后请通过列表确认结果，前端不本地改写任何状态。
    </NAlert>

    <NForm label-placement="top" :disabled="submitting">
      <NFormItem label="员工姓名">
        <NInput :value="employeeName || '-'" readonly />
      </NFormItem>

      <NFormItem label="当前用工关系">
        <NInput :value="relationHint" readonly />
      </NFormItem>

      <NFormItem label="当前任职状态">
        <NInput :value="orgStatusLabel(orgStatus)" readonly />
      </NFormItem>

      <NFormItem
        label="终态类型"
        required
        :feedback="'只能选择具体关系，不得使用笼统的「离职」代替'"
      >
        <NRadioGroup v-model:value="form.terminal_type" data-testid="terminate-type">
          <NRadioButton
            v-for="t in TERMINAL_TYPES"
            :key="t.value"
            :value="t.value"
            :disabled="submitting"
          >
            {{ t.label }}
          </NRadioButton>
        </NRadioGroup>
      </NFormItem>

      <NFormItem
        label="业务事件日期"
        required
        :feedback="
          effectiveDatePreview
            ? `将写入业务事件日期：${effectiveDatePreview}`
            : '必填，需手动选择；不使用系统当天日期或登记时间'
        "
      >
        <NDatePicker
          v-model:value="eventDate"
          type="date"
          format="yyyy-MM-dd"
          style="width: 100%"
          placeholder="请选择业务事件日期"
          :clearable="true"
          data-testid="terminate-event-date"
        />
      </NFormItem>

      <NFormItem label="备注">
        <NInput
          v-model:value="form.remark"
          type="textarea"
          :rows="3"
          placeholder="登记依据、审批文号等（可选）"
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
          data-testid="terminate-submit"
          @click="handleSubmit"
        >
          确认登记
        </NButton>
      </div>
    </template>
  </NModal>
</template>
