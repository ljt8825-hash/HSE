<!--
  员工新增/编辑弹窗 - HSE 人员主数据中心 Sprint5.1
  说明: 页面内组件，用于员工主数据的新增和编辑
  复用: Ant Design Vue 的 a-modal / a-form / a-input / a-select / a-date-picker / a-switch
-->
<template>
  <a-modal
    :open="open"
    :title="mode === 'edit' ? '编辑员工' : '新增员工'"
    :width="600"
    :confirm-loading="submitting"
    :ok-button-props="{ disabled: !canSubmit }"
    :mask-closable="false"
    ok-text="提交"
    cancel-text="取消"
    @ok="handleSubmit"
    @cancel="handleCancel"
  >
    <a-form
      ref="formRef"
      layout="vertical"
      :model="form"
      :rules="rules"
    >
      <!-- 工号 -->
      <a-form-item label="工号" name="employee_code">
        <a-input
          v-model:value="form.employee_code"
          placeholder="请输入工号"
          :maxlength="50"
          allow-clear
        />
      </a-form-item>

      <!-- 身份证号 -->
      <a-form-item label="身份证号" name="id_card">
        <a-input
          v-model:value="form.id_card"
          placeholder="请输入身份证号"
          :maxlength="18"
          allow-clear
        />
      </a-form-item>

      <!-- 身份证地址 -->
      <a-form-item label="身份证地址" name="id_address">
        <a-textarea
          v-model:value="form.id_address"
          placeholder="请输入身份证地址"
          :rows="2"
          :maxlength="256"
          allow-clear
        />
      </a-form-item>

      <!-- 姓名 -->
      <a-form-item label="姓名" name="name" required>
        <a-input
          v-model:value="form.name"
          placeholder="请输入姓名"
          :maxlength="50"
          allow-clear
        />
      </a-form-item>

      <!-- 性别 -->
      <a-form-item label="性别" name="gender">
        <a-select
          v-model:value="form.gender"
          :options="genderOptions"
          placeholder="请选择性别"
          allow-clear
        />
      </a-form-item>

      <!-- 出生日期 -->
      <a-form-item label="出生日期" name="birth_date">
        <a-date-picker
          v-model:value="birthDate"
          format="YYYY-MM-DD"
          value-format="YYYY-MM-DD"
          style="width: 100%"
          placeholder="请选择出生日期"
          allow-clear
        />
      </a-form-item>

      <!-- 手机号 -->
      <a-form-item label="手机号" name="phone">
        <a-input
          v-model:value="form.phone"
          placeholder="请输入手机号"
          :maxlength="20"
          allow-clear
        />
      </a-form-item>

      <!-- 人员分类 -->
      <a-form-item label="人员分类" name="person_category">
        <a-select
          v-model:value="form.person_category"
          :options="personCategoryOptions"
          placeholder="请选择人员分类"
          allow-clear
        />
      </a-form-item>

      <!-- 人员类型 -->
      <a-form-item label="人员类型" name="person_type">
        <a-select
          v-model:value="form.person_type"
          :options="personTypeOptions"
          placeholder="请选择人员类型"
          allow-clear
        />
      </a-form-item>

      <!-- 是否公益岗 -->
      <a-form-item label="是否公益岗" name="is_public_welfare">
        <a-switch
          v-model:checked="form.is_public_welfare"
          checked-children="是"
          un-checked-children="否"
        />
      </a-form-item>
    </a-form>
  </a-modal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { message, type FormInstance } from 'ant-design-vue';
import dayjs, { type Dayjs } from 'dayjs';
import { useAccess } from '@vben/access';
import {
  createEmployee,
  updateEmployee,
  type EmployeeApi,
} from '#/api/hse/employee';

// ============================================================
// Props / Emits
// ============================================================
const props = defineProps<{
  open: boolean;
  mode: 'create' | 'edit';
  employee?: EmployeeApi.EmployeeItem | null;
}>();

const emit = defineEmits<{
  (e: 'update:open', val: boolean): void;
  (e: 'success'): void;
}>();

// ============================================================
// 权限
// ============================================================
const { hasAccessByRoles } = useAccess();
const canSubmit = computed(() => hasAccessByRoles(['admin', 'safety_manager']));

// ============================================================
// 选项常量
// ============================================================
const genderOptions = [
  { label: '男', value: '男' },
  { label: '女', value: '女' },
];

const personCategoryOptions = [
  { label: '适龄人员', value: '适龄人员' },
  { label: '超龄人员', value: '超龄人员' },
];

// v1.2 不含驾驶员
const personTypeOptions = [
  { label: '生产人员', value: '生产人员' },
  { label: '管理人员', value: '管理人员' },
  { label: '技术人员', value: '技术人员' },
  { label: '辅助人员', value: '辅助人员' },
];

// ============================================================
// 表单状态
// ============================================================
const formRef = ref<FormInstance>();
const submitting = ref(false);

const form = ref<EmployeeApi.EmployeeFormData>({
  employee_code: '',
  id_card: '',
  name: '',
  gender: undefined,
  birth_date: undefined,
  phone: '',
  id_address: '',
  person_category: undefined,
  person_type: undefined,
  is_public_welfare: false,
});

// 出生日期单独以 Dayjs 对象维护，便于 DatePicker 使用
const birthDate = ref<Dayjs | undefined>(undefined);

const rules: Record<string, any[]> = {
  name: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
};

// ============================================================
// 监听弹窗打开 - 填充表单
// ============================================================
watch(
  () => props.open,
  (val) => {
    if (val) {
      resetForm();
      if (props.mode === 'edit' && props.employee) {
        fillForm(props.employee);
      }
    }
  },
  { immediate: true },
);

function fillForm(emp: EmployeeApi.EmployeeItem) {
  form.value = {
    employee_code: emp.employee_code ?? '',
    id_card: emp.id_card ?? '',
    name: emp.name ?? '',
    gender: emp.gender || undefined,
    birth_date: emp.birth_date || undefined,
    phone: emp.phone ?? '',
    id_address: emp.id_address ?? '',
    person_category: emp.person_category || undefined,
    person_type: emp.person_type || undefined,
    is_public_welfare: !!emp.is_public_welfare,
  };
  birthDate.value = emp.birth_date ? dayjs(emp.birth_date) : undefined;
}

function resetForm() {
  form.value = {
    employee_code: '',
    id_card: '',
    name: '',
    gender: undefined,
    birth_date: undefined,
    phone: '',
    id_address: '',
    person_category: undefined,
    person_type: undefined,
    is_public_welfare: false,
  };
  birthDate.value = undefined;
  formRef.value?.clearValidate();
}

// ============================================================
// 提交
// ============================================================
async function handleSubmit() {
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }

  submitting.value = true;
  try {
    const payload: EmployeeApi.EmployeeFormData = {
      ...form.value,
      birth_date: birthDate.value
        ? birthDate.value.format('YYYY-MM-DD')
        : undefined,
    };

    if (props.mode === 'edit' && props.employee?.id) {
      await updateEmployee(props.employee.id, payload);
      message.success('员工更新成功');
    } else {
      await createEmployee(payload);
      message.success('员工创建成功');
    }
    emit('update:open', false);
    emit('success');
  } catch {
    // 错误提示已由拦截器处理
  } finally {
    submitting.value = false;
  }
}

// ============================================================
// 取消
// ============================================================
function handleCancel() {
  emit('update:open', false);
}
</script>
