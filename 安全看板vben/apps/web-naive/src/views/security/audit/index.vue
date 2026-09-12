<script lang="ts" setup>
/**
 * 审计日志（web-naive 迁移）
 * 统一使用 HSE 公共组件栈；接入真实 API（server/routes/hse/audit.js）。
 * 审计日志为只读页面 → 隐藏「下载模板 / 导入 / 新增」动作；显示刷新 + 导出。
 * 操作列仅提供「详情」查看。
 */
import { reactive, ref, onMounted } from 'vue';
import {
  NButton,
  NDescriptions,
  NDescriptionsItem,
  NDrawer,
  NDrawerContent,
  NGi,
  NInput,
  NSpace,
  NSelect,
  NTag,
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
  getAuditLogs,
  exportAuditLogs,
  type AuditApi,
} from '#/api/hse/audit';
import { message } from '#/adapter/naive';

defineOptions({ name: 'SystemAudit' });

// ===================== 映射 =====================
const ACTION_TAG: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  login: 'success',
  logout: 'neutral',
  create: 'info',
  update: 'warning',
  delete: 'danger',
  export: 'neutral',
  import: 'neutral',
};
const ACTION_LABEL: Record<string, string> = {
  login: '登录',
  logout: '登出',
  create: '新增',
  update: '修改',
  delete: '删除',
  export: '导出',
  import: '导入',
};
const MODULE_LABEL: Record<string, string> = {
  auth: '认证',
  users: '用户管理',
  roles: '角色管理',
  menus: '菜单管理',
  hazards: '隐患管理',
  accidents: '事故管理',
  training: '培训管理',
  insurance: '保险管理',
  system: '系统',
};

const ACTION_OPTIONS = [
  { label: '登录', value: 'login' },
  { label: '登出', value: 'logout' },
  { label: '新增', value: 'create' },
  { label: '修改', value: 'update' },
  { label: '删除', value: 'delete' },
  { label: '导出', value: 'export' },
  { label: '导入', value: 'import' },
];

const MODULE_OPTIONS = [
  { label: '认证', value: 'auth' },
  { label: '用户管理', value: 'users' },
  { label: '角色管理', value: 'roles' },
  { label: '菜单管理', value: 'menus' },
  { label: '隐患管理', value: 'hazards' },
  { label: '事故管理', value: 'accidents' },
  { label: '培训管理', value: 'training' },
  { label: '保险管理', value: 'insurance' },
  { label: '系统', value: 'system' },
];

// ===================== 列表数据 =====================
const loading = ref(false);
const data = ref<AuditApi.AuditLogItem[]>([]);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(10);
const sortBy = ref<string | undefined>(undefined);
const sortOrder = ref<'asc' | 'desc' | undefined>(undefined);

const searchForm = reactive({
  operator: '',
  actionType: '' as '' | string,
  module: '' as '' | string,
});

async function loadData() {
  loading.value = true;
  try {
    const params: AuditApi.AuditLogParams = {
      page: currentPage.value,
      pageSize: pageSize.value,
      operator: searchForm.operator || undefined,
      actionType: searchForm.actionType || undefined,
      module: searchForm.module || undefined,
      sortField: sortBy.value,
      sortOrder: sortOrder.value,
    };
    const res = await getAuditLogs(params);
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
  searchForm.operator = '';
  searchForm.actionType = '';
  searchForm.module = '';
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
// 审计日志（只读）：仅显示刷新 + 导出，隐藏新增/导入/下载模板
const actionState = ref<Partial<Record<HseActionKey, { hidden?: boolean }>>>({
  downloadTemplate: { hidden: true },
  import: { hidden: true },
  create: { hidden: true },
});

async function onRefresh() {
  await loadData();
}

function triggerDownload(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

async function onExport() {
  try {
    const params: AuditApi.AuditLogParams = {
      operator: searchForm.operator || undefined,
      actionType: searchForm.actionType || undefined,
      module: searchForm.module || undefined,
    };
    const blob = await exportAuditLogs(params);
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    triggerDownload(blob as Blob, `审计日志_${dateStr}.csv`);
    message.success('导出成功');
  } catch {
    message.error('导出失败');
  }
}

// ===================== 详情抽屉 =====================
const detailDrawerOpen = ref(false);
const currentLog = ref<AuditApi.AuditLogItem | null>(null);

function openViewDetail(row: AuditApi.AuditLogItem) {
  currentLog.value = row;
  detailDrawerOpen.value = true;
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

function getStatusTagType(code: number): 'success' | 'danger' | 'neutral' {
  if (code < 400) return 'success';
  return 'danger';
}

const columns = ref<VxeTableGridColumns>([
  { type: 'seq', title: '序号', width: 60, align: 'center' },
  { title: '操作人', field: 'username', width: 120, align: 'center' },
  { title: '操作类型', field: 'action', width: 100, align: 'center', slots: { default: 'action' } },
  { title: '模块', field: 'module', width: 120, align: 'center', slots: { default: 'module' } },
  { title: '描述', field: 'description', minWidth: 200, align: 'left', showOverflow: 'tooltip' },
  { title: 'IP地址', field: 'ipAddress', width: 140, align: 'center' },
  { title: '状态码', field: 'statusCode', width: 90, align: 'center', slots: { default: 'statusCode' } },
  { title: '操作时间', field: 'createdAt', width: 170, align: 'center', sortable: true, slots: { default: 'createdAt' } },
  {
    title: '操作',
    field: 'view',
    width: 80,
    align: 'center',
    fixed: 'right',
    slots: { default: 'action-col' },
  },
]);

onMounted(() => {
  loadData();
});
</script>

<template>
  <HsePageLayout description="查看系统操作审计日志，支持按操作人、操作类型、模块筛选及导出" title="审计日志">
    <template #extra>
      <HseActionBar
        :actions="actionState"
        @refresh="onRefresh"
        @export="onExport"
      />
    </template>

    <!-- 搜索 -->
    <HseSearchPanel @query="onSearch" @reset="onReset">
      <NGi>
        <NInput
          v-model:value="searchForm.operator"
          placeholder="操作人（用户名）"
          clearable
          @keyup.enter="onSearch"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.actionType"
          placeholder="全部操作类型"
          clearable
          :options="ACTION_OPTIONS"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.module"
          placeholder="全部模块"
          clearable
          :options="MODULE_OPTIONS"
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
      <template #action="{ row }">
        <HseStatusTag :type="ACTION_TAG[row.action] || 'neutral'">
          {{ ACTION_LABEL[row.action] || row.action || '-' }}
        </HseStatusTag>
      </template>
      <template #module="{ row }">
        <NTag type="info" size="small" round>
          {{ MODULE_LABEL[row.module] || row.module || '-' }}
        </NTag>
      </template>
      <template #statusCode="{ row }">
        <HseStatusTag :type="getStatusTagType(row.statusCode)">
          {{ row.statusCode }}
        </HseStatusTag>
      </template>
      <template #createdAt="{ row }">
        {{ formatDate(row.createdAt) }}
      </template>
      <template #action-col="{ row }">
        <NButton size="small" type="primary" quaternary @click="openViewDetail(row)">
          详情
        </NButton>
      </template>
    </HseDataGrid>

    <!-- 审计详情抽屉 -->
    <NDrawer
      v-model:show="detailDrawerOpen"
      :width="560"
      placement="right"
    >
      <NDrawerContent title="审计详情" closable>
        <template v-if="currentLog">
          <NDescriptions :column="1" bordered label-placement="left" size="small">
            <NDescriptionsItem label="操作人">
              {{ currentLog.username }}（ID: {{ currentLog.userId }}）
            </NDescriptionsItem>
            <NDescriptionsItem label="操作类型">
              <HseStatusTag :type="ACTION_TAG[currentLog.action] || 'neutral'">
                {{ ACTION_LABEL[currentLog.action] || currentLog.action }}
              </HseStatusTag>
            </NDescriptionsItem>
            <NDescriptionsItem label="所属模块">
              <NTag type="info" size="small">
                {{ MODULE_LABEL[currentLog.module] || currentLog.module }}
              </NTag>
            </NDescriptionsItem>
            <NDescriptionsItem label="操作描述">
              {{ currentLog.description || '-' }}
            </NDescriptionsItem>
            <NDescriptionsItem label="IP 地址">
              {{ currentLog.ipAddress || '-' }}
            </NDescriptionsItem>
            <NDescriptionsItem label="浏览器/设备">
              <span style="word-break: break-all">{{ currentLog.userAgent || '-' }}</span>
            </NDescriptionsItem>
            <NDescriptionsItem label="状态码">
              <HseStatusTag :type="getStatusTagType(currentLog.statusCode)">
                {{ currentLog.statusCode }}
              </HseStatusTag>
            </NDescriptionsItem>
            <NDescriptionsItem label="操作时间">
              {{ formatDate(currentLog.createdAt) }}
            </NDescriptionsItem>
            <NDescriptionsItem v-if="currentLog.detail" label="详情数据">
              <pre style="max-height: 260px; overflow: auto; background: var(--n-color-embedded, #f5f5f5); padding: 10px; border-radius: 4px; margin: 0; font-size: 12px; line-height: 1.5;">
{{ JSON.stringify(currentLog.detail, null, 2) }}
              </pre>
            </NDescriptionsItem>
          </NDescriptions>
        </template>
        <template #footer>
          <NSpace justify="end">
            <NButton @click="detailDrawerOpen = false">关闭</NButton>
          </NSpace>
        </template>
      </NDrawerContent>
    </NDrawer>
  </HsePageLayout>
</template>
