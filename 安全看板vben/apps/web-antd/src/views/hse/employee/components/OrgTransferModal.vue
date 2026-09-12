<!--
  调岗/组织分配弹窗 - HSE 人员主数据中心 Sprint5.1
  说明: 页面内组件，用于员工的组织关系调岗/分配
  复用: Ant Design Vue 的 a-modal / a-form / a-tree-select / a-select / a-date-picker / a-input / a-textarea
-->
<template>
  <a-modal
    :open="open"
    :title="`调岗/组织分配${employeeName ? ' - ' + employeeName : ''}`"
    :width="560"
    :confirm-loading="submitting"
    :mask-closable="false"
    ok-text="提交"
    cancel-text="取消"
    @ok="handleSubmit"
    @cancel="handleCancel"
  >
    <a-form layout="vertical" :model="form">
      <!-- 目标部门 -->
      <a-form-item label="目标部门" required>
        <a-tree-select
          v-model:value="form.team_id"
          :tree-data="deptTreeData"
          placeholder="请选择目标部门"
          allow-clear
          tree-default-expand-all
          :field-names="{ label: 'title', value: 'value', children: 'children' }"
          :loading="deptLoading"
          @change="handleDeptChange"
        />
      </a-form-item>

      <!-- 岗位 -->
      <a-form-item label="岗位">
        <a-select
          v-model:value="form.position_id"
          :options="positionOptions"
          placeholder="请选择岗位（可选）"
          :loading="positionLoading"
          :field-names="{ label: 'name', value: 'id' }"
          allow-clear
        />
      </a-form-item>

      <!-- 生效日期 -->
      <a-form-item label="生效日期" required>
        <a-date-picker
          v-model:value="startDate"
          format="YYYY-MM-DD"
          value-format="YYYY-MM-DD"
          style="width: 100%"
          placeholder="请选择生效日期"
        />
      </a-form-item>

      <!-- 变更原因 -->
      <a-form-item label="变更原因">
        <a-input
          v-model:value="form.change_reason"
          placeholder="请输入变更原因"
          :maxlength="100"
        />
      </a-form-item>

      <!-- 备注 -->
      <a-form-item label="备注">
        <a-textarea
          v-model:value="form.remark"
          :rows="3"
          placeholder="备注信息（可选）"
          :maxlength="500"
          show-count
        />
      </a-form-item>
    </a-form>
  </a-modal>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { message } from 'ant-design-vue';
import dayjs, { type Dayjs } from 'dayjs';
import {
  assignOrg,
  getDeptTree,
  getPositionList,
  type EmployeeApi,
} from '#/api/hse/employee';

// Props
const props = defineProps<{
  open: boolean;
  employeeId?: number;
  employeeName?: string;
}>();

// Emits
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

// 生效日期（dayjs 对象）
const startDate = ref<Dayjs>(dayjs());

// 部门树数据 - 转换为 antd TreeSelect 所需格式 { value, title, children }
const deptTreeData = computed(() => convertDeptTree(deptTree.value));

// 递归转换部门树
function convertDeptTree(
  nodes: EmployeeApi.DeptNode[],
): Array<{ value: number; title: string; children?: any[] }> {
  return nodes.map((node) => {
    const item: { value: number; title: string; children?: any[] } = {
      value: node.id,
      title: node.short_name || node.name,
    };
    if (node.children && node.children.length > 0) {
      item.children = convertDeptTree(node.children);
    }
    return item;
  });
}

// 岗位选项
const positionOptions = computed(() => positionList.value);

// 弹窗打开时加载数据
watch(
  () => props.open,
  async (val) => {
    if (val) {
      resetForm();
      await loadDeptTree();
    }
  },
  { immediate: true },
);

// 加载部门树
async function loadDeptTree() {
  deptLoading.value = true;
  try {
    const data = await getDeptTree();
    deptTree.value = data || [];
  } catch {
    // 错误提示已由拦截器处理
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
    positionList.value = data || [];
  } catch {
    // 错误提示已由拦截器处理
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
      start_date: startDate.value.format('YYYY-MM-DD'),
      change_reason: form.value.change_reason,
      remark: form.value.remark,
    };
    await assignOrg(payload);
    message.success('调岗成功');
    emit('update:open', false);
    emit('success');
  } catch {
    // 错误提示已由拦截器处理
  } finally {
    submitting.value = false;
  }
}

// 取消
function handleCancel() {
  emit('update:open', false);
}

// 重置表单
function resetForm() {
  form.value = {
    team_id: undefined,
    position_id: undefined,
    change_reason: '调岗',
    remark: '',
  };
  startDate.value = dayjs();
  positionList.value = [];
}
</script>
