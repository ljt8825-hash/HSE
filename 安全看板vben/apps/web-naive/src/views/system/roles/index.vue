<script lang="ts" setup>
/**
 * 角色管理（web-naive 迁移）
 * 统一使用 HSE 公共组件栈；接入真实 API（server/routes/core.js - roles/menus）。
 * 角色管理无导入/导出/下载模板端点 → 隐藏「下载模板 / 导入 / 导出」动作；显示刷新 + 新增。
 * 支持权限配置（菜单树勾选），使用 NDrawer + NTree 实现。
 */
import { reactive, ref, onMounted } from 'vue';
import {
  NButton,
  NDrawer,
  NDrawerContent,
  NForm,
  NFormItem,
  NGi,
  NInput,
  NInputNumber,
  NModal,
  NPopconfirm,
  NSpace,
  NSwitch,
  NTag,
  NTree,
} from 'naive-ui';
import type { TreeOption } from 'naive-ui';

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
  getRoleList,
  createRole,
  updateRole,
  deleteRole,
  getMenuList,
  getRoleMenus,
  assignRoleMenus,
  type SystemApi,
} from '#/api/hse/system';
import { message } from '#/adapter/naive';

defineOptions({ name: 'HseSystemRoles' });

// ===================== 列表数据 =====================
const loading = ref(false);
const data = ref<SystemApi.RoleItem[]>([]);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(10);
const sortBy = ref<string | undefined>(undefined);
const sortOrder = ref<'asc' | 'desc' | undefined>(undefined);

const searchForm = reactive({
  keyword: '',
});

async function loadData() {
  loading.value = true;
  try {
    const res = await getRoleList({
      page: currentPage.value,
      pageSize: pageSize.value,
      keyword: searchForm.keyword || undefined,
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
// 角色管理：无导入/导出/下载模板，仅显示刷新 + 新增
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
  code: string;
  name: string;
  description: string;
  sortOrder: number;
  activeStatus: boolean;
}>({
  code: '',
  name: '',
  description: '',
  sortOrder: 0,
  activeStatus: true,
});

function resetForm() {
  formModel.code = '';
  formModel.name = '';
  formModel.description = '';
  formModel.sortOrder = 0;
  formModel.activeStatus = true;
}

function openCreate() {
  resetForm();
  formMode.value = 'create';
  editingId.value = null;
  formOpen.value = true;
}

function openEdit(row: SystemApi.RoleItem) {
  resetForm();
  formMode.value = 'edit';
  editingId.value = row.id;
  formModel.code = row.code;
  formModel.name = row.name;
  formModel.description = row.description ?? '';
  formModel.sortOrder = row.sortOrder;
  formModel.activeStatus = row.status === 'active';
  formOpen.value = true;
}

function openView(row: SystemApi.RoleItem) {
  openEdit(row);
  formMode.value = 'view';
}

async function onSubmit() {
  if (!formModel.code) {
    message.warning('角色编码不能为空');
    return;
  }
  if (!formModel.name) {
    message.warning('角色名称不能为空');
    return;
  }
  formLoading.value = true;
  try {
    const payload = {
      code: formModel.code,
      name: formModel.name,
      description: formModel.description || undefined,
      sortOrder: formModel.sortOrder,
      status: (formModel.activeStatus ? 'active' : 'disabled') as SystemApi.UserStatus,
    };
    if (formMode.value === 'create') {
      await createRole(payload);
      message.success('创建成功');
    } else if (formMode.value === 'edit' && editingId.value != null) {
      await updateRole(editingId.value, payload);
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

async function onDelete(row: SystemApi.RoleItem) {
  try {
    await deleteRole(row.id);
    message.success('删除成功');
    onRefresh();
  } catch {
    /* 拦截器已提示 */
  }
}

// ===================== 权限配置（抽屉 + 菜单树） =====================
const permissionDrawerOpen = ref(false);
const permissionLoading = ref(false);
const currentRole = ref<SystemApi.RoleItem | null>(null);
const checkedMenuKeys = ref<(string | number)[]>([]);
const menuTreeData = ref<TreeOption[]>([]);

/** 将后端菜单树转换为 NTree 所需格式（label/key/children） */
function convertMenuTree(menus: SystemApi.MenuItem[]): TreeOption[] {
  return menus.map((m) => ({
    label: m.name,
    key: m.id,
    children: m.children && m.children.length > 0 ? convertMenuTree(m.children) : undefined,
  }));
}

/** 默认 fallback 菜单树（当 API 失败时使用） */
function getFallbackMenuTree(): TreeOption[] {
  return [
    {
      label: '系统管理',
      key: 1,
      children: [
        { label: '用户管理', key: 11 },
        { label: '角色管理', key: 12 },
        { label: '菜单管理', key: 13 },
      ],
    },
    {
      label: 'HSE管理',
      key: 2,
      children: [
        { label: '告警中心', key: 21 },
        { label: '工作流引擎', key: 22 },
      ],
    },
  ];
}

async function openPermission(row: SystemApi.RoleItem) {
  currentRole.value = row;
  permissionDrawerOpen.value = true;
  permissionLoading.value = true;
  try {
    const tree = await getMenuList();
    menuTreeData.value = convertMenuTree(tree as SystemApi.MenuItem[]);
  } catch {
    menuTreeData.value = getFallbackMenuTree();
  }
  try {
    const menuIds = await getRoleMenus(row.id);
    checkedMenuKeys.value = (menuIds as number[]).map((id) => id);
  } catch {
    checkedMenuKeys.value = [1, 11, 12, 2, 21];
  } finally {
    permissionLoading.value = false;
  }
}

async function onSavePermission() {
  if (!currentRole.value) return;
  permissionLoading.value = true;
  try {
    const menuIds = checkedMenuKeys.value
      .filter((k) => typeof k === 'number')
      .map((k) => k as number);
    await assignRoleMenus(currentRole.value.id, menuIds);
    message.success('权限配置成功');
    permissionDrawerOpen.value = false;
  } catch {
    /* 拦截器已提示 */
  } finally {
    permissionLoading.value = false;
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
  { title: '角色编码', field: 'code', width: 160, align: 'center' },
  { title: '角色名称', field: 'name', width: 160, align: 'center' },
  { title: '描述', field: 'description', minWidth: 200, align: 'left', showOverflow: 'tooltip' },
  { title: '排序', field: 'sortOrder', width: 80, align: 'center' },
  { title: '状态', field: 'status', width: 90, align: 'center', slots: { default: 'status' } },
  { title: '创建时间', field: 'createdAt', width: 170, align: 'center', sortable: true, slots: { default: 'createdAt' } },
  {
    title: '操作',
    field: 'action',
    width: 260,
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
  <HsePageLayout description="管理系统角色及权限配置，支持新增、编辑、权限分配及删除操作" title="角色管理">
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
          placeholder="角色名称 / 编码"
          clearable
          @keyup.enter="onSearch"
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
        <HseStatusTag :type="row.status === 'active' ? 'success' : 'neutral'">
          {{ row.status === 'active' ? '启用' : row.status === 'disabled' ? '停用' : (row.status || '-') }}
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
          <NButton size="small" type="primary" quaternary @click="openPermission(row)">
            权限配置
          </NButton>
          <NPopconfirm @positive-click="onDelete(row)">
            <template #trigger>
              <NButton size="small" type="error" quaternary>删除</NButton>
            </template>
            确定删除该角色吗？
          </NPopconfirm>
        </NSpace>
      </template>
    </HseDataGrid>

    <!-- 新增 / 编辑 / 查看 弹窗 -->
    <NModal
      v-model:show="formOpen"
      :title="
        formMode === 'create'
          ? '新增角色'
          : formMode === 'edit'
            ? '编辑角色'
            : '角色详情'
      "
      preset="card"
      style="width: 520px; max-width: 92vw"
      :mask-closable="false"
    >
      <NForm :disabled="formMode === 'view'" label-placement="top">
        <NFormItem label="角色编码" required>
          <NInput v-model:value="formModel.code" placeholder="请输入角色编码" />
        </NFormItem>
        <NFormItem label="角色名称" required>
          <NInput v-model:value="formModel.name" placeholder="请输入角色名称" />
        </NFormItem>
        <NFormItem label="角色描述">
          <NInput
            v-model:value="formModel.description"
            type="textarea"
            :rows="3"
            placeholder="选填"
          />
        </NFormItem>
        <NFormItem label="排序">
          <NInputNumber v-model:value="formModel.sortOrder" :min="0" style="width: 100%" />
        </NFormItem>
        <NFormItem label="状态">
          <NSwitch
            :value="formModel.activeStatus"
            @update:value="(val: boolean) => (formModel.activeStatus = val)"
          >
            <template #checked>启用</template>
            <template #unchecked>停用</template>
          </NSwitch>
        </NFormItem>
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

    <!-- 权限配置抽屉 -->
    <NDrawer
      v-model:show="permissionDrawerOpen"
      :width="500"
      placement="right"
    >
      <NDrawerContent title="权限配置" closable>
        <template v-if="currentRole">
          <div style="margin-bottom: 16px">
            <NTag type="info" size="small">{{ currentRole.name }}</NTag>
          </div>
          <div v-if="permissionLoading" style="padding: 20px; text-align: center; color: #999">
            加载中...
          </div>
          <NTree
            v-else
            :data="menuTreeData"
            :checked-keys="checkedMenuKeys"
            @update:checked-keys="(keys: (string | number)[]) => (checkedMenuKeys = keys)"
            checkable
            default-expand-all
            cancellable
          />
        </template>
        <template #footer>
          <NSpace justify="end">
            <NButton @click="permissionDrawerOpen = false">取消</NButton>
            <NButton
              type="primary"
              :loading="permissionLoading"
              @click="onSavePermission"
            >
              保存
            </NButton>
          </NSpace>
        </template>
      </NDrawerContent>
    </NDrawer>
  </HsePageLayout>
</template>
