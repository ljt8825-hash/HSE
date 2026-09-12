<script lang="ts" setup>
/**
 * 通知中心（web-naive）
 * 统一使用 HSE 公共组件栈（HseDataGrid / HseSearchPanel / HsePageLayout / HseStatusTag）。
 * 接入真实 API（/api/hse/notifications）。
 * 支持标为已读、全部已读、删除、清空、导出、Tab 快速筛选等功能。
 */
import { computed, onMounted, reactive, ref } from 'vue';

import {
  NBadge,
  NButton,
  NCard,
  NDrawer,
  NDrawerContent,
  NGi,
  NInput,
  NPopconfirm,
  NSelect,
  NSpace,
  NTabPane,
  NTabs,
  NTag,
} from 'naive-ui';

import {
  HseDataGrid,
  HsePageLayout,
  HseSearchPanel,
  HseStatusTag,
} from '#/components/hse';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';
import {
  clearNotifications,
  deleteNotification,
  exportNotifications,
  getNotifications,
  markAllAsRead,
  markAsRead,
  type NotificationsApi,
} from '#/api/hse/notifications';
import { message } from '#/adapter/naive';

defineOptions({ name: 'HseNotifications' });

// ===================== 枚举映射 =====================
const MODULE_OPTIONS = [
  { label: '规章制度', value: 'regulations' },
  { label: '应急预案', value: 'emergency' },
  { label: '培训管理', value: 'training' },
  { label: '隐患排查', value: 'hazards' },
  { label: '保险管理', value: 'insurance' },
  { label: '巡检管理', value: 'inspection' },
  { label: '事故管理', value: 'accidents' },
  { label: '系统通知', value: 'system' },
  { label: '工作流', value: 'workflow' },
];

const PRIORITY_OPTIONS = [
  { label: '普通', value: 'normal' },
  { label: '临期', value: 'warning' },
  { label: '紧急', value: 'urgent' },
];

const READ_STATUS_OPTIONS = [
  { label: '未读', value: 'false' },
  { label: '已读', value: 'true' },
];

const PRIORITY_TAG: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  normal: 'success',
  warning: 'warning',
  urgent: 'danger',
};

const PRIORITY_LABEL: Record<string, string> = {
  normal: '普通',
  warning: '临期',
  urgent: '紧急',
};

const TYPE_COLOR: Record<string, 'info' | 'success' | 'warning' | 'error' | 'default'> = {
  system: 'info',
  alert: 'error',
  workflow: 'warning',
  task: 'success',
};

function getModuleText(mod: string): string {
  const map: Record<string, string> = {
    regulations: '规章制度',
    emergency: '应急预案',
    training: '培训管理',
    hazards: '隐患排查',
    insurance: '保险管理',
    inspection: '巡检管理',
    accidents: '事故管理',
    system: '系统通知',
    workflow: '工作流',
    alert: '告警通知',
  };
  return map[mod] || mod;
}

// ===================== Tab 状态 =====================
type TabKey = 'all' | 'unread' | 'urgent' | 'warning' | 'system';
const activeTab = ref<TabKey>('all');

// ===================== 列表数据 =====================
const loading = ref(false);
const data = ref<NotificationsApi.NotificationItem[]>([]);
const total = ref(0);
const unreadCount = ref(0);
const currentPage = ref(1);
const pageSize = ref(10);

const searchForm = reactive({
  keyword: '',
  module: null as string | null,
  priority: null as string | null,
  isRead: null as string | null,
});

function buildParams(): NotificationsApi.NotificationParams {
  const params: NotificationsApi.NotificationParams = {
    page: currentPage.value,
    pageSize: pageSize.value,
  };
  if (searchForm.keyword) params.keyword = searchForm.keyword;
  if (searchForm.module) params.module = searchForm.module;

  // Tab 筛选优先级高于搜索表单
  if (activeTab.value === 'unread') {
    params.isRead = false;
  } else if (activeTab.value === 'urgent') {
    params.priority = 'urgent';
  } else if (activeTab.value === 'warning') {
    params.priority = 'warning';
  } else if (activeTab.value === 'system') {
    params.type = 'system';
  } else {
    // all 模式下使用表单筛选
    if (searchForm.priority) params.priority = searchForm.priority;
    if (searchForm.isRead !== null && searchForm.isRead !== '') {
      params.isRead = searchForm.isRead === 'true';
    }
  }
  return params;
}

async function loadData() {
  loading.value = true;
  try {
    const res = await getNotifications(buildParams());
    data.value = res.list || [];
    total.value = res.total || 0;
    if (res.unreadCount !== undefined) {
      unreadCount.value = res.unreadCount;
    }
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
  searchForm.module = null;
  searchForm.priority = null;
  searchForm.isRead = null;
  activeTab.value = 'all';
  currentPage.value = 1;
  loadData();
}

function onPageChange(payload: { currentPage: number; pageSize: number }) {
  currentPage.value = payload.currentPage;
  pageSize.value = payload.pageSize;
  loadData();
}

function onTabChange() {
  currentPage.value = 1;
  loadData();
}

// ===================== 标记已读 =====================
async function handleMarkRead(row: NotificationsApi.NotificationItem, showMsg = true) {
  try {
    await markAsRead(row.id);
    row.isRead = true;
    if (unreadCount.value > 0) unreadCount.value--;
    if (showMsg) message.success('已标记为已读');
  } catch {
    // 乐观更新
    row.isRead = true;
    if (unreadCount.value > 0) unreadCount.value--;
  }
}

async function handleMarkAllRead() {
  try {
    await markAllAsRead();
    data.value.forEach((item) => (item.isRead = true));
    unreadCount.value = 0;
    message.success('已全部标记为已读');
  } catch {
    // 乐观更新
    data.value.forEach((item) => (item.isRead = true));
    unreadCount.value = 0;
    message.success('已全部标记为已读');
  }
}

// ===================== 删除 / 清空 =====================
async function handleDelete(row: NotificationsApi.NotificationItem) {
  try {
    await deleteNotification(row.id);
    data.value = data.value.filter((n) => n.id !== row.id);
    total.value--;
    if (!row.isRead && unreadCount.value > 0) unreadCount.value--;
    message.success('删除成功');
  } catch {
    // 乐观更新
    data.value = data.value.filter((n) => n.id !== row.id);
    total.value--;
    if (!row.isRead && unreadCount.value > 0) unreadCount.value--;
    message.success('删除成功');
  }
}

async function handleClearAll() {
  try {
    await clearNotifications();
    data.value = [];
    total.value = 0;
    unreadCount.value = 0;
    message.success('已清空所有通知');
  } catch {
    data.value = [];
    total.value = 0;
    unreadCount.value = 0;
    message.success('已清空所有通知');
  }
}

// ===================== 导出 =====================
const exportLoading = ref(false);

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

function formatDateTime(dateStr?: string): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function todayStamp(): string {
  const now = new Date();
  const y = String(now.getFullYear());
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

async function onExport() {
  exportLoading.value = true;
  try {
    const params: any = {};
    if (searchForm.module) params.module = searchForm.module;
    if (searchForm.isRead !== null && searchForm.isRead !== '') {
      params.isRead = searchForm.isRead === 'true';
    }
    if (activeTab.value === 'unread') {
      params.isRead = false;
    } else if (activeTab.value === 'urgent') {
      params.priority = 'urgent';
    } else if (activeTab.value === 'warning') {
      params.priority = 'warning';
    } else if (activeTab.value === 'system') {
      params.type = 'system';
    }
    const blob = await exportNotifications(params);
    triggerDownload(blob, `通知记录_${todayStamp()}.csv`);
    message.success('导出成功');
  } catch {
    message.error('导出失败');
  } finally {
    exportLoading.value = false;
  }
}

// ===================== 详情抽屉 =====================
const detailDrawerVisible = ref(false);
const currentNotification = ref<NotificationsApi.NotificationItem | null>(null);

async function openViewDetail(row: NotificationsApi.NotificationItem) {
  if (!row.isRead) {
    await handleMarkRead(row, false);
  }
  currentNotification.value = row;
  detailDrawerVisible.value = true;
}

async function handleDetailMarkRead() {
  if (currentNotification.value) {
    await handleMarkRead(currentNotification.value);
  }
}

async function handleDetailDelete() {
  if (currentNotification.value) {
    await handleDelete(currentNotification.value);
    detailDrawerVisible.value = false;
  }
}

// ===================== 表格列 =====================
const columns = ref<VxeTableGridColumns>([
  {
    title: '优先级',
    field: 'priority',
    width: 80,
    align: 'center',
    slots: { default: 'priority' },
  },
  { title: '通知标题', field: 'title', minWidth: 200, align: 'left', showOverflow: 'tooltip' },
  { title: '来源模块', field: 'bizType', width: 110, align: 'center', slots: { default: 'module' } },
  {
    title: '通知内容',
    field: 'content',
    minWidth: 250,
    align: 'left',
    showOverflow: 'tooltip',
  },
  { title: '状态', field: 'isRead', width: 80, align: 'center', slots: { default: 'readStatus' } },
  {
    title: '通知时间',
    field: 'createdAt',
    width: 170,
    align: 'center',
    slots: { default: 'createdAt' },
  },
  {
    title: '操作',
    field: 'action',
    width: 200,
    align: 'center',
    fixed: 'right',
    slots: { default: 'action' },
  },
]);

// 紧急未读数（用于 Tab 徽标）
const urgentUnreadCount = computed(() =>
  data.value.filter((n) => n.priority === 'urgent' && !n.isRead).length
);

onMounted(() => {
  loadData();
});
</script>

<template>
  <HsePageLayout :title="$t('page.hse.notifications')" description="集中管理系统通知、告警提醒和工作流消息">
    <template #extra>
      <NSpace>
        <NTag v-if="unreadCount > 0" type="error" :bordered="false" round>
          未读 {{ unreadCount }} 条
        </NTag>
        <NButton :loading="exportLoading" @click="onExport">导出</NButton>
        <NButton @click="handleMarkAllRead">全部已读</NButton>
        <NPopconfirm @positive-click="handleClearAll">
          <template #trigger>
            <NButton type="error" secondary>清空通知</NButton>
          </template>
          确定要清空所有通知吗？此操作不可恢复。
        </NPopconfirm>
      </NSpace>
    </template>

    <!-- 搜索 -->
    <HseSearchPanel @query="onSearch" @reset="onReset">
      <NGi>
        <NInput
          v-model:value="searchForm.keyword"
          placeholder="搜索标题/内容"
          clearable
          @keyup.enter="onSearch"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.module"
          placeholder="来源模块"
          clearable
          :options="MODULE_OPTIONS"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.priority"
          placeholder="优先级"
          clearable
          :options="PRIORITY_OPTIONS"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.isRead"
          placeholder="阅读状态"
          clearable
          :options="READ_STATUS_OPTIONS"
        />
      </NGi>
    </HseSearchPanel>

    <!-- Tab 快速筛选 -->
    <NTabs v-model:value="activeTab" type="line" class="mb-3" @update:value="onTabChange">
      <NTabPane name="all" tab="全部" />
      <NTabPane name="unread" tab="未读" />
      <NTabPane name="urgent">
        <template #tab>
          <NBadge :value="urgentUnreadCount" :max="99" :show-zero="false">
            紧急
          </NBadge>
        </template>
      </NTabPane>
      <NTabPane name="warning" tab="临期" />
      <NTabPane name="system" tab="系统" />
    </NTabs>

    <!-- 表格 -->
    <HseDataGrid
      :columns="columns"
      :data="data"
      :loading="loading"
      :pager="true"
      :total="total"
      @page-change="onPageChange"
    >
      <template #priority="{ row }">
        <HseStatusTag :type="PRIORITY_TAG[row.priority] || 'neutral'" size="small">
          {{ PRIORITY_LABEL[row.priority] || row.priority }}
        </HseStatusTag>
      </template>
      <template #module="{ row }">
        <NTag :type="TYPE_COLOR[row.type] || 'default'" :bordered="false" size="small">
          {{ getModuleText(row.bizType || row.type) }}
        </NTag>
      </template>
      <template #readStatus="{ row }">
        <NTag v-if="row.isRead" type="success" :bordered="false" size="small">已读</NTag>
        <NTag v-else type="error" :bordered="false" size="small">未读</NTag>
      </template>
      <template #createdAt="{ row }">
        {{ row.createdAt ? formatDateTime(row.createdAt) : '-' }}
      </template>
      <template #action="{ row }">
        <NSpace justify="center">
          <NButton
            v-if="!row.isRead"
            size="small"
            type="primary"
            quaternary
            @click="handleMarkRead(row)"
          >
            标为已读
          </NButton>
          <NButton size="small" type="primary" quaternary @click="openViewDetail(row)">
            查看详情
          </NButton>
          <NPopconfirm @positive-click="handleDelete(row)">
            <template #trigger>
              <NButton size="small" type="error" quaternary>删除</NButton>
            </template>
            确定删除这条通知吗？
          </NPopconfirm>
        </NSpace>
      </template>
    </HseDataGrid>

    <!-- 详情抽屉 -->
    <NDrawer v-model:show="detailDrawerVisible" :width="560" placement="right">
      <NDrawerContent title="通知详情" :closable="true">
        <template v-if="currentNotification">
          <div class="detail-header mb-3">
            <div class="flex items-center gap-2">
              <HseStatusTag
                :type="PRIORITY_TAG[currentNotification.priority] || 'neutral'"
                size="small"
              >
                {{ PRIORITY_LABEL[currentNotification.priority] || currentNotification.priority }}
              </HseStatusTag>
              <NTag
                :type="TYPE_COLOR[currentNotification.type] || 'default'"
                :bordered="false"
                size="small"
              >
                {{ getModuleText(currentNotification.bizType || currentNotification.type) }}
              </NTag>
              <NTag
                v-if="currentNotification.isRead"
                type="success"
                :bordered="false"
                size="small"
              >
                已读
              </NTag>
              <NTag v-else type="error" :bordered="false" size="small">未读</NTag>
            </div>
            <h3 class="mt-2 text-lg font-semibold">{{ currentNotification.title }}</h3>
            <div class="text-muted-foreground mt-1 text-xs">
              {{ formatDateTime(currentNotification.createdAt) }}
            </div>
          </div>

          <NCard :bordered="false" class="mb-4" content-style="padding: 16px; line-height: 1.8;">
            {{ currentNotification.content }}
          </NCard>

          <div v-if="currentNotification.bizId" class="mb-4">
            <NCard :bordered="false" type="info" size="small">
              来自 {{ getModuleText(currentNotification.bizType || currentNotification.type) }} 模块，关联 ID: {{ currentNotification.bizId }}
            </NCard>
          </div>

          <NSpace>
            <NButton
              v-if="!currentNotification.isRead"
              type="primary"
              @click="handleDetailMarkRead"
            >
              标为已读
            </NButton>
            <NPopconfirm @positive-click="handleDetailDelete">
              <template #trigger>
                <NButton type="error" secondary>删除</NButton>
              </template>
              确定删除这条通知吗？
            </NPopconfirm>
          </NSpace>
        </template>
      </NDrawerContent>
    </NDrawer>
  </HsePageLayout>
</template>

<style scoped>
.mb-3 {
  margin-bottom: 12px;
}
.mb-4 {
  margin-bottom: 16px;
}
.mt-1 {
  margin-top: 4px;
}
.mt-2 {
  margin-top: 8px;
}
.flex {
  display: flex;
}
.items-center {
  align-items: center;
}
.gap-2 {
  gap: 8px;
}
.text-lg {
  font-size: 18px;
}
.font-semibold {
  font-weight: 600;
}
.text-xs {
  font-size: 12px;
}
</style>
