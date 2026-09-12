<script lang="ts" setup>
/**
 * 调岗 / 组织分配弹窗（web-naive 试点 · 阶段04）
 * Naive UI 实现，功能对齐 web-antd 版 OrgTransferModal.vue，禁引 Ant Design。
 * 数据来源：getDeptTree / getPositionList / assignOrg
 */
import { ref, computed, watch } from 'vue';
import {
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
  assignOrg,
  getDeptTree,
  getPositionList,
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

// 提交状态
const submitting = ref(false);

// 部门树原始数据
const deptTree = ref<EmployeeApi.DeptNode[]>([]);
const deptLoading = ref(false);

// 岗位列表
const positionList = ref<EmployeeApi.PositionItem[]>([]);
const positionLoading = ref(false);

// 表单数据
const form = ref<{
  team_id?: number;
  position_id?: number;
  change_reason: string;
  remark?: string;
}>({
  team_id: undefined,
  position_id: undefined,
  change_reason: '调岗',
  remark: '',
});

// 生效日期（时间戳，Naive NDatePicker 默认 number | null）
const startDate = ref<number>(Date.now());

// 部门树 → NTreeSelect 选项 { key, label, children }
const deptTreeOptions = computed(() => convertDeptTree(deptTree.value));

function convertDeptTree(
  nodes: EmployeeApi.DeptNode[],
): Array<{ key: number; label: string; children?: any[] }> {
  return (nodes ?? []).map((node) => {
    const item: { key: number; label: string; children?: any[] } = {
      key: node.id,
      label: node.short_name || node.name,
    };
    if (node.children && node.children.length > 0) {
      item.children = convertDeptTree(node.children);
    }
    return item;
  });
}

// 岗位选项
const positionOptions = computed(() =>
  (positionList.value ?? []).map((p) => ({ label: p.name, value: p.id })),
);

function formatDate(ts: number | null): string {
  if (!ts) return '';
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 弹窗打开时加载数据
watch(
  () => props.open,
  async (val) => {
    if (val) {
      resetForm();
      await loadDeptTree();
    }
  },
);

// 加载部门树
async function loadDeptTree() {
  deptLoading.value = true;
  try {
    const data = await getDeptTree();
    deptTree.value = data || [];
  } catch {
    /* 错误提示已由拦截器处理 */
  } finally {
    deptLoading.value = false;
  }
}

// 选择部门后加载岗位列表
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

// 提交
async function handleSubmit() {
  if (!props.employeeId) {
    message.warning('缺少员工信息');
    return;
  }
  if (!form.value.team_id) {
    message.warning('请选择目标部门');
    return;
  }
  if (!startDate.value) {
    message.warning('请选择生效日期');
    return;
  }

  submitting.value = true;
  try {
    const payload: EmployeeApi.OrgAssignFormData = {
      employee_id: props.employeeId,
      team_id: form.value.team_id,
      position_id: form.value.position_id,
      start_date: formatDate(startDate.value),
      change_reason: form.value.change_reason,
      remark: form.value.remark,
    };
    await assignOrg(payload);
    message.success('调岗成功');
    emit('update:open', false);
    emit('success');
  } catch {
    /* 错误提示已由拦截器处理 */
  } finally {
    submitting.value = false;
  }
}

function handleCancel() {
  emit('update:open', false);
}

function resetForm() {
  form.value = {
    team_id: undefined,
    position_id: undefined,
    change_reason: '调岗',
    remark: '',
  };
  startDate.value = Date.now();
  positionList.value = [];
}
</script>

<template>
  <NModal
    v-model:show="props.open"
    :title="`调岗/组织分配${employeeName ? ' - ' + employeeName : ''}`"
    preset="card"
    style="width: 560px; max-width: 92vw"
    :mask-closable="false"
    :bordered="false"
  >
    <NForm label-placement="top">
      <!-- 目标部门 -->
      <NFormItem label="目标部门" required>
        <NTreeSelect
          v-model:value="form.team_id"
          :options="deptTreeOptions"
          placeholder="请选择目标部门"
          clearable
          :default-expand-all="true"
          :loading="deptLoading"
          key-field="key"
          label-field="label"
          children-field="children"
          @update:value="handleDeptChange"
        />
      </NFormItem>

      <!-- 岗位 -->
      <NFormItem label="岗位">
        <NSelect
          v-model:value="form.position_id"
          :options="positionOptions"
          placeholder="请选择岗位（可选）"
          :loading="positionLoading"
          clearable
        />
      </NFormItem>

      <!-- 生效日期 -->
      <NFormItem label="生效日期" required>
        <NDatePicker
          v-model:value="startDate"
          type="date"
          format="yyyy-MM-dd"
          style="width: 100%"
          placeholder="请选择生效日期"
        />
      </NFormItem>

      <!-- 变更原因 -->
      <NFormItem label="变更原因">
        <NInput
          v-model:value="form.change_reason"
          placeholder="请输入变更原因"
          :maxlength="100"
        />
      </NFormItem>

      <!-- 备注 -->
      <NFormItem label="备注">
        <NInput
          v-model:value="form.remark"
          type="textarea"
          :rows="3"
          placeholder="备注信息（可选）"
          :maxlength="500"
          show-count
        />
      </NFormItem>
    </NForm>

    <template #footer>
      <div class="flex justify-end gap-2">
        <NButton @click="handleCancel">取消</NButton>
        <NButton type="primary" :loading="submitting" @click="handleSubmit">
          提交
        </NButton>
      </div>
    </template>
  </NModal>
</template>
