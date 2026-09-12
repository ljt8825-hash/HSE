<script lang="ts" setup>
/**
 * 用户管理（web-naive 迁移）
 * 统一使用 HSE 公共组件栈；接入真实 API（server/routes/core.js - users）。
 * 用户管理无导入/导出/下载模板端点 → 隐藏「下载模板 / 导入 / 导出」动作；显示刷新 + 新增。
 */
import { reactive, ref, onMounted } from 'vue';
import {
  NButton,
  NForm,
  NFormItem,
  NGi,
  NInput,
  NModal,
  NPopconfirm,
  NSpace,
  NSelect,
  NSwitch,
} from 'naive-ui';

import {
  HseActionBar,
  HseDataGrid,
  HsePageLayout,
  HseSearchPanel,
  HseStatusTag,
  type HseActionKey,
} from '#/components/hse';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';
import {
  getUserList,
  createUser,
  updateUser,
  deleteUser,
  updateUserStatus,
  resetPassword,
  type SystemApi,
} from '#/api/hse/system';
import { message } from '#/adapter/naive';

defineOptions({ name: 'HseSystemUsers' });

// ===================== 映射 =====================
const STATUS_TAG: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  active: 'success',
  disabled: 'danger',
};
const STATUS_LABEL: Record<string, string> = {
  active: '启用',
  disabled: '禁用',
};

// ===================== 列表数据 =====================
const loading = ref(false);
const data = ref<SystemApi.UserItem[]>([]);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(10);
const sortBy = ref<string | undefined>(undefined);
const sortOrder = ref<'asc' | 'desc' | undefined>(undefined);

const searchForm = reactive({
  keyword: '',
  status: '' as '' | SystemApi.UserStatus,
});

async function loadData() {
  loading.value = true;
  try {
    const res = await getUserList({
      page: currentPage.value,
      pageSize: pageSize.value,
      keyword: searchForm.keyword || undefined,
      status: searchForm.status || undefined,
      sortField: sortBy.value,
      sortOrder: sortOrder.value,
    });
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
  currentPage.value = 1;
  loadData();
}

function onReset() {
  searchForm.keyword = '';
  searchForm.status = '';
  onSearch();
}

function onPageChange(payload: { currentPage: number; pageSize: number }) {
  currentPage.value = payload.currentPage;
  pageSize.value = payload.pageSize;
  loadData();
}

function onSortChange(payload: { sortBy?: string; sortOrder?: 'asc' | 'desc' }) {
  sortBy.value = payload.sortBy;
  sortOrder.value = payload.sortOrder;
  currentPage.value = 1;
  loadData();
}

// ===================== 操作栏 =====================
// 用户管理：无导入/导出/下载模板，仅显示刷新 + 新增
const actionState = ref<Partial<Record<HseActionKey, { hidden?: boolean }>>>({
  downloadTemplate: { hidden: true },
  import: { hidden: true },
  export: { hidden: true },
});

async function onRefresh() {
  await loadData();
}

// ===================== 新增 / 编辑 / 查看 =====================
const formOpen = ref(false);
const formMode = ref<'create' | 'edit' | 'view'>('create');
const formLoading = ref(false);
const editingId = ref<number | null>(null);
const formModel = reactive<{
  username: string;
  realName: string;
  email: string;
  phone: string;
  department: string;
  password: string;
  activeStatus: boolean;
}>({
  username: '',
  realName: '',
  email: '',
  phone: '',
  department: '',
  password: '',
  activeStatus: true,
});

function resetForm() {
  formModel.username = '';
  formModel.realName = '';
  formModel.email = '';
  formModel.phone = '';
  formModel.department = '';
  formModel.password = '';
  formModel.activeStatus = true;
}

function openCreate() {
  resetForm();
  formMode.value = 'create';
  editingId.value = null;
  formOpen.value = true;
}

function openEdit(row: SystemApi.UserItem) {
  resetForm();
  formMode.value = 'edit';
  editingId.value = row.id;
  formModel.username = row.username;
  formModel.realName = row.realName;
  formModel.email = row.email ?? '';
  formModel.phone = row.phone ?? '';
  formModel.department = row.department ?? '';
  formModel.activeStatus = row.status === 'active';
  formOpen.value = true;
}

function openView(row: SystemApi.UserItem) {
  openEdit(row);
  formMode.value = 'view';
}

async function onSubmit() {
  if (!formModel.username) {
    message.warning('用户名不能为空');
    return;
  }
  if (!formModel.realName) {
    message.warning('真实姓名不能为空');
    return;
  }
  if (formMode.value === 'create' && !formModel.password) {
    message.warning('请设置密码');
    return;
  }
  formLoading.value = true;
  try {
    const payload: Record<string, any> = {
      username: formModel.username,
      realName: formModel.realName,
      email: formModel.email || undefined,
      phone: formModel.phone || undefined,
      department: formModel.department || undefined,
      status: formModel.activeStatus ? 'active' : 'disabled',
    };
    if (formMode.value === 'create') {
      payload.password = formModel.password;
      await createUser(payload as any);
      message.success('创建成功');
    } else if (formMode.value === 'edit' && editingId.value != null) {
      await updateUser(editingId.value, payload);
      message.success('更新成功');
    }
    formOpen.value = false;
    onRefresh();
  } catch {
    /* 拦截器已提示 */
  } finally {
    formLoading.value = false;
  }
}

async function onDelete(row: SystemApi.UserItem) {
  try {
    await deleteUser(row.id);
    message.success('删除成功');
    onRefresh();
  } catch {
    /* 拦截器已提示 */
  }
}

async function onToggleStatus(row: SystemApi.UserItem) {
  const newStatus = row.status === 'active' ? 'disabled' : 'active';
  try {
    await updateUserStatus(row.id, newStatus);
    message.success(newStatus === 'active' ? '已启用' : '已禁用');
    onRefresh();
  } catch {
    /* 拦截器已提示 */
  }
}

async function onResetPassword(row: SystemApi.UserItem) {
  try {
    await resetPassword(row.id, '123456');
    message.success(`密码已重置为 123456`);
  } catch {
    /* 拦截器已提示 */
  }
}

// ===================== 表格列 =====================
function formatDate(date: string): string {
  if (!date) return '-';
  try {
    const d = new Date(date);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch {
    return date;
  }
}

const columns = ref<VxeTableGridColumns>([
  { type: 'seq', title: '序号', width: 60, align: 'center' },
  { title: '用户名', field: 'username', width: 130, align: 'center', sortable: true },
  { title: '真实姓名', field: 'realName', width: 120, align: 'center' },
  { title: '部门', field: 'department', minWidth: 140, align: 'left', showOverflow: 'tooltip' },
  { title: '邮箱', field: 'email', minWidth: 180, align: 'left', showOverflow: 'tooltip' },
  { title: '手机号', field: 'phone', width: 130, align: 'center' },
  { title: '状态', field: 'status', width: 90, align: 'center', slots: { default: 'status' } },
  { title: '创建时间', field: 'createdAt', width: 170, align: 'center', sortable: true, slots: { default: 'createdAt' } },
  {
    title: '操作',
    field: 'action',
    width: 280,
    align: 'center',
    fixed: 'right',
    slots: { default: 'action' },
  },
]);

onMounted(() => {
  loadData();
});
</script>

<template>
  <HsePageLayout description="管理系统用户账号，支持新增、编辑、启用/禁用、重置密码及删除操作" title="用户管理">
    <template #extra>
      <HseActionBar
        :actions="actionState"
        @refresh="onRefresh"
        @create="openCreate"
      />
    </template>

    <!-- 搜索 -->
    <HseSearchPanel @query="onSearch" @reset="onReset">
      <NGi>
        <NInput
          v-model:value="searchForm.keyword"
          placeholder="用户名 / 真实姓名"
          clearable
          @keyup.enter="onSearch"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.status"
          placeholder="全部状态"
          clearable
          :options="[
            { label: '启用', value: 'active' },
            { label: '禁用', value: 'disabled' },
          ]"
        />
      </NGi>
    </HseSearchPanel>

    <!-- 表格 -->
    <HseDataGrid
      :columns="columns"
      :data="data"
      :loading="loading"
      :pager="true"
      :total="total"
      :current-page="currentPage"
      :page-size="pageSize"
      @page-change="onPageChange"
      @sort-change="onSortChange"
    >
      <template #status="{ row }">
        <HseStatusTag :type="STATUS_TAG[row.status] || 'neutral'">
          {{ STATUS_LABEL[row.status] || row.status || '-' }}
        </HseStatusTag>
      </template>
      <template #createdAt="{ row }">
        {{ formatDate(row.createdAt) }}
      </template>
      <template #action="{ row }">
        <NSpace justify="center" :size="4">
          <NButton size="small" type="primary" quaternary @click="openView(row)">
            查看
          </NButton>
          <NButton size="small" type="primary" quaternary @click="openEdit(row)">
            编辑
          </NButton>
          <NButton size="small" type="warning" quaternary @click="onResetPassword(row)">
            重置密码
          </NButton>
          <NButton
            size="small"
            quaternary
            :type="row.status === 'active' ? 'default' : 'success'"
            @click="onToggleStatus(row)"
          >
            {{ row.status === 'active' ? '禁用' : '启用' }}
          </NButton>
          <NPopconfirm @positive-click="onDelete(row)">
            <template #trigger>
              <NButton size="small" type="error" quaternary>删除</NButton>
            </template>
            确定删除该用户吗？
          </NPopconfirm>
        </NSpace>
      </template>
    </HseDataGrid>

    <!-- 新增 / 编辑 / 查看 弹窗 -->
    <NModal
      v-model:show="formOpen"
      :title="
        formMode === 'create'
          ? '新增用户'
          : formMode === 'edit'
            ? '编辑用户'
            : '用户详情'
      "
      preset="card"
      style="width: 640px; max-width: 92vw"
      :mask-closable="false"
    >
      <NForm :disabled="formMode === 'view'" label-placement="top">
        <div class="grid grid-cols-2 gap-x-4">
          <NFormItem label="用户名" required>
            <NInput v-model:value="formModel.username" placeholder="请输入用户名" />
          </NFormItem>
          <NFormItem label="真实姓名" required>
            <NInput v-model:value="formModel.realName" placeholder="请输入真实姓名" />
          </NFormItem>
          <NFormItem label="邮箱">
            <NInput v-model:value="formModel.email" placeholder="选填" />
          </NFormItem>
          <NFormItem label="手机号">
            <NInput v-model:value="formModel.phone" placeholder="选填" />
          </NFormItem>
          <NFormItem label="部门">
            <NInput v-model:value="formModel.department" placeholder="选填" />
          </NFormItem>
          <NFormItem v-if="formMode === 'create'" label="密码" required>
            <NInput
              v-model:value="formModel.password"
              type="password"
              placeholder="请输入初始密码"
              show-password-on="click"
            />
          </NFormItem>
          <NFormItem v-if="formMode !== 'create'" label="状态">
            <NSwitch
              :value="formModel.activeStatus"
              @update:value="(val: boolean) => (formModel.activeStatus = val)"
            >
              <template #checked>启用</template>
              <template #unchecked>禁用</template>
            </NSwitch>
          </NFormItem>
          <NFormItem v-if="formMode === 'create'" label="状态">
            <NSwitch
              :value="formModel.activeStatus"
              @update:value="(val: boolean) => (formModel.activeStatus = val)"
            >
              <template #checked>启用</template>
              <template #unchecked>禁用</template>
            </NSwitch>
          </NFormItem>
        </div>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="formOpen = false">关闭</NButton>
          <NButton
            v-if="formMode !== 'view'"
            type="primary"
            :loading="formLoading"
            @click="onSubmit"
          >
            保存
          </NButton>
        </NSpace>
      </template>
    </NModal>
  </HsePageLayout>
</template>
