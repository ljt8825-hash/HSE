<template>
  <Page auto-content-height class="hse-page">
    <Card :bordered="false">
      <template #title>
        <div class="card-header">
          <span>通知中心</span>
          <div class="header-actions">
            <Tag color="red">未读 {{ unreadCount }} 条</Tag>
            <Space>
              <HelpButton menuCode="HSE_NOTIFICATIONS" />
              <Button @click="handleExport">
                <template #icon><IconifyIcon icon="lucide:download" /></template>
                导出
              </Button>
              <Button @click="handleMarkAllRead">全部已读</Button>
              <Popconfirm
                title="确定要清空所有通知吗？此操作不可恢复。"
                ok-type="danger"
                @confirm="handleClearAll"
              >
                <Button danger>清空通知</Button>
              </Popconfirm>
            </Space>
          </div>
        </div>
      </template>

      <Form layout="inline" class="filter-form">
        <FormItem label="关键词">
          <Input
            v-model:value="searchForm.keyword"
            placeholder="搜索标题/内容"
            allow-clear
            style="width: 200px"
            @change="handleSearch"
          />
        </FormItem>
        <FormItem label="模块">
          <Select
            v-model:value="searchForm.module"
            placeholder="全部模块"
            allow-clear
            style="width: 140px"
            @change="handleSearch"
          >
            <Select.Option v-for="m in moduleOptions" :key="m.value" :value="m.value">
              {{ m.label }}
            </Select.Option>
          </Select>
        </FormItem>
        <FormItem label="优先级">
          <Select
            v-model:value="searchForm.priority"
            placeholder="全部优先级"
            allow-clear
            style="width: 120px"
            @change="handleSearch"
          >
            <Select.Option value="normal">普通</Select.Option>
            <Select.Option value="warning">临期</Select.Option>
            <Select.Option value="urgent">紧急</Select.Option>
          </Select>
        </FormItem>
        <FormItem label="状态">
          <Select
            v-model:value="searchForm.isRead"
            placeholder="全部状态"
            allow-clear
            style="width: 120px"
            @change="handleSearch"
          >
            <Select.Option value="false">未读</Select.Option>
            <Select.Option value="true">已读</Select.Option>
          </Select>
        </FormItem>
        <FormItem>
          <Button @click="handleReset">重置</Button>
        </FormItem>
      </Form>

      <Tabs v-model:activeKey="activeTab" class="notification-tabs" size="small" @change="handleTabChange">
        <Tabs.TabPane key="all" tab="全部" />
        <Tabs.TabPane key="unread" tab="未读" />
        <Tabs.TabPane key="urgent" tab="紧急">
          <template #tab>
            <Badge :count="urgentCount" :offset="[4, -2]" size="small">
              紧急
            </Badge>
          </template>
        </Tabs.TabPane>
        <Tabs.TabPane key="warning" tab="临期" />
        <Tabs.TabPane key="system" tab="系统" />
      </Tabs>

      <List
        :data-source="notificationList"
        :loading="loading"
        item-layout="vertical"
        size="large"
        :pagination="{
          current: pagination.page,
          pageSize: pagination.pageSize,
          total: total,
          showSizeChanger: false,
          showTotal: (t) => `共 ${t} 条`,
        }"
        @change="handlePageChange"
      >
        <template #renderItem="{ item }">
          <ListItem
            :class="{ 'is-unread': !item.isRead }"
            @click="handleClickItem(item)"
          >
            <ListItemMeta>
              <template #avatar>
                <Badge :status="getPriorityBadgeStatus(item.priority)" :offset="[-2, -2]">
                  <Avatar :style="{ backgroundColor: getTypeColor(item.type) }">
                    <IconifyIcon :icon="getTypeIcon(item.type)" />
                  </Avatar>
                </Badge>
              </template>
              <template #title>
                <div class="notification-title">
                  <span>{{ item.title }}</span>
                  <span v-if="!item.isRead" class="unread-dot"></span>
                </div>
              </template>
              <template #description>
                <div class="notification-meta">
                  <Tag :color="getPriorityTagColor(item.priority)" size="small">
                    {{ getPriorityText(item.priority) }}
                  </Tag>
                  <Tag :color="getTypeColor(item.type)" size="small">
                    {{ getModuleText(item.bizType || item.type) }}
                  </Tag>
                  <span class="notification-time">{{ formatDate(item.createdAt) }}</span>
                </div>
              </template>
            </ListItemMeta>
            <div class="notification-content">{{ item.content }}</div>
            <template #actions>
              <Space>
                <Button v-if="!item.isRead" type="link" size="small" @click.stop="handleMarkRead(item)">
                  标为已读
                </Button>
                <Button type="link" size="small" @click.stop="handleViewDetail(item)">
                  查看详情
                </Button>
                <Popconfirm title="确定要删除这条通知吗？" @confirm="handleDelete(item)">
                  <Button type="link" size="small" danger @click.stop>
                    删除
                  </Button>
                </Popconfirm>
              </Space>
            </template>
          </ListItem>
        </template>
      </List>
    </Card>

    <Drawer v-model:open="detailDrawerVisible" title="通知详情" width="560px">
      <template v-if="currentNotification">
        <div class="detail-header">
          <div class="detail-title">
            <Badge :status="getPriorityBadgeStatus(currentNotification.priority)">
              <h3>{{ currentNotification.title }}</h3>
            </Badge>
          </div>
          <div class="detail-meta">
            <Tag :color="getPriorityTagColor(currentNotification.priority)">
              {{ getPriorityText(currentNotification.priority) }}
            </Tag>
            <Tag :color="getTypeColor(currentNotification.type)">
              {{ getModuleText(currentNotification.bizType || currentNotification.type) }}
            </Tag>
            <Tag v-if="currentNotification.isRead" color="green">已读</Tag>
            <Tag v-else color="red">未读</Tag>
            <span class="detail-time">{{ formatDateTime(currentNotification.createdAt) }}</span>
          </div>
        </div>
        <Divider />
        <div class="detail-content">
          {{ currentNotification.content }}
        </div>
        <Divider v-if="currentNotification.bizId" />
        <div v-if="currentNotification.bizId" class="detail-related">
          <p class="related-label">关联信息：</p>
          <Alert
            type="info"
            show-icon
            :message="`来自 ${getModuleText(currentNotification.bizType || currentNotification.type)} 模块`"
            :description="`关联 ID: ${currentNotification.bizId}`"
          />
        </div>
        <div class="detail-actions">
          <Space>
            <Button v-if="!currentNotification.isRead" type="primary" @click="handleDetailMarkRead">
              标为已读
            </Button>
            <Popconfirm title="确定删除？" ok-type="danger" @confirm="handleDetailDelete">
              <Button danger>删除</Button>
            </Popconfirm>
          </Space>
        </div>
      </template>
    </Drawer>
  </Page>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, computed } from 'vue';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  Divider,
  Drawer,
  Form,
  FormItem,
  Input,
  List,
  ListItem,
  ListItemMeta,
  Popconfirm,
  Select,
  Space,
  Tabs,
  Tag,
  message,
} from 'ant-design-vue';
import { IconifyIcon } from '@vben/icons';
import dayjs from 'dayjs';
import { $t } from '#/locales';

import { Page } from '@vben/common-ui';
import { HelpButton } from '#/components/hse';
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearNotifications,
  exportNotifications,
  type NotificationsApi,
} from '#/api/hse/notifications';

const loading = ref(false);
const notificationList = ref<NotificationsApi.NotificationItem[]>([]);
const total = ref(0);
const unreadCount = ref(0);
const urgentCount = ref(0);
const activeTab = ref('all');

const pagination = reactive({
  page: 1,
  pageSize: 10,
});

const searchForm = reactive({
  keyword: '',
  module: undefined as string | undefined,
  priority: undefined as string | undefined,
  isRead: undefined as string | undefined,
});

const detailDrawerVisible = ref(false);
const currentNotification = ref<NotificationsApi.NotificationItem | null>(null);

const moduleOptions = [
  { value: 'regulations', label: '规章制度' },
  { value: 'emergency', label: '应急预案' },
  { value: 'training', label: '培训管理' },
  { value: 'hazards', label: '隐患排查' },
  { value: 'insurance', label: '保险管理' },
  { value: 'inspection', label: '巡检管理' },
  { value: 'accidents', label: '事故管理' },
  { value: 'system', label: '系统通知' },
  { value: 'workflow', label: '工作流' },
];

const filterParams = computed(() => {
  const params: NotificationsApi.NotificationParams = {
    page: pagination.page,
    pageSize: pagination.pageSize,
  };
  if (searchForm.keyword) params.keyword = searchForm.keyword;
  if (searchForm.module) params.module = searchForm.module;
  if (searchForm.priority) params.priority = searchForm.priority;
  if (searchForm.isRead !== undefined && searchForm.isRead !== '') {
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
  return params;
});

function getTypeColor(type: string): string {
  const map: Record<string, string> = {
    system: 'blue',
    alert: 'red',
    workflow: 'purple',
    task: 'gold',
  };
  return map[type] || 'default';
}

function getTypeIcon(type: string): string {
  const map: Record<string, string> = {
    system: 'lucide:bell',
    alert: 'lucide:alert-triangle',
    workflow: 'lucide:git-branch',
    task: 'lucide:check-square',
  };
  return map[type] || 'lucide:bell';
}

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

function getPriorityBadgeStatus(priority?: string): 'success' | 'warning' | 'error' | 'default' {
  switch (priority) {
    case 'urgent':
      return 'error';
    case 'warning':
      return 'warning';
    case 'normal':
      return 'success';
    default:
      return 'default';
  }
}

function getPriorityTagColor(priority?: string): string {
  switch (priority) {
    case 'urgent':
      return 'red';
    case 'warning':
      return 'orange';
    case 'normal':
      return 'green';
    default:
      return 'default';
  }
}

function getPriorityText(priority?: string): string {
  switch (priority) {
    case 'urgent':
      return '紧急';
    case 'warning':
      return '临期';
    case 'normal':
      return '普通';
    default:
      return '普通';
  }
}

function formatDate(date: string): string {
  return dayjs(date).format('YYYY-MM-DD HH:mm:ss');
}

function formatDateTime(date: string): string {
  return dayjs(date).format('YYYY-MM-DD HH:mm:ss');
}

async function fetchData() {
  loading.value = true;
  try {
    const res = await getNotifications(filterParams.value);
    notificationList.value = res.list || [];
    total.value = res.total || 0;
    if (res.unreadCount !== undefined) {
      unreadCount.value = res.unreadCount;
    }
    urgentCount.value = notificationList.value.filter(
      (n) => n.priority === 'urgent' && !n.isRead,
    ).length;
  } catch (err) {
    console.warn('获取通知列表失败:', err);
    message.error($t('hse.message.fetchListFailed', { module: $t('hse.module.notifications') }));
    notificationList.value = [];
    total.value = 0;
    unreadCount.value = 0;
    urgentCount.value = 0;
  } finally {
    loading.value = false;
  }
}

function handleSearch() {
  pagination.page = 1;
  fetchData();
}

function handleReset() {
  searchForm.keyword = '';
  searchForm.module = undefined;
  searchForm.priority = undefined;
  searchForm.isRead = undefined;
  activeTab.value = 'all';
  pagination.page = 1;
  fetchData();
}

function handleTabChange() {
  pagination.page = 1;
  fetchData();
}

function handlePageChange(page: number) {
  pagination.page = page;
  fetchData();
}

function handleClickItem(item: NotificationsApi.NotificationItem) {
  if (!item.isRead) {
    handleMarkRead(item);
  }
}

async function handleMarkRead(item: NotificationsApi.NotificationItem) {
  try {
    await markAsRead(item.id);
    item.isRead = true;
    if (unreadCount.value > 0) unreadCount.value--;
  } catch (err) {
    console.warn('标记已读失败:', err);
    item.isRead = true;
    if (unreadCount.value > 0) unreadCount.value--;
  }
}

async function handleMarkAllRead() {
  try {
    await markAllAsRead();
    notificationList.value.forEach((item) => (item.isRead = true));
    unreadCount.value = 0;
    message.success('已全部标记为已读');
  } catch (err) {
    console.warn('全部已读失败:', err);
    notificationList.value.forEach((item) => (item.isRead = true));
    unreadCount.value = 0;
    message.success('已全部标记为已读');
  }
}

async function handleDelete(item: NotificationsApi.NotificationItem) {
  try {
    await deleteNotification(item.id);
    notificationList.value = notificationList.value.filter((n) => n.id !== item.id);
    total.value--;
    if (!item.isRead && unreadCount.value > 0) unreadCount.value--;
    message.success('删除成功');
  } catch (err) {
    console.warn('删除失败:', err);
    notificationList.value = notificationList.value.filter((n) => n.id !== item.id);
    total.value--;
    if (!item.isRead && unreadCount.value > 0) unreadCount.value--;
    message.success('删除成功');
  }
}

async function handleClearAll() {
  try {
    await clearNotifications();
    notificationList.value = [];
    total.value = 0;
    unreadCount.value = 0;
    message.success('已清空');
  } catch (err) {
    console.warn('清空失败:', err);
    notificationList.value = [];
    total.value = 0;
    unreadCount.value = 0;
    message.success('已清空');
  }
}

async function handleViewDetail(item: NotificationsApi.NotificationItem) {
  if (!item.isRead) {
    await handleMarkRead(item);
  }
  currentNotification.value = item;
  detailDrawerVisible.value = true;
}

async function handleDetailMarkRead() {
  if (!currentNotification.value) return;
  await handleMarkRead(currentNotification.value);
}

async function handleDetailDelete() {
  if (!currentNotification.value) return;
  await deleteNotification(currentNotification.value.id);
  notificationList.value = notificationList.value.filter((n) => n.id !== currentNotification.value!.id);
  total.value--;
  if (!currentNotification.value.isRead && unreadCount.value > 0) unreadCount.value--;
  detailDrawerVisible.value = false;
  message.success('删除成功');
}

async function handleExport() {
  try {
    const params: any = {};
    if (searchForm.module) params.module = searchForm.module;
    if (searchForm.isRead !== undefined && searchForm.isRead !== '') {
      params.isRead = searchForm.isRead === 'true';
    }
    const blob = await exportNotifications(params);
    const url = window.URL.createObjectURL(new Blob([blob]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `通知记录_${dayjs().format('YYYYMMDD')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    message.success('导出成功');
  } catch (err) {
    console.warn('导出失败:', err);
    message.error('导出失败');
  }
}

onMounted(() => {
  fetchData();
});
</script>

<style scoped lang="scss">
.hse-page {
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;

    .header-actions {
      display: flex;
      align-items: center;
      gap: 16px;
    }
  }

  .filter-form {
    margin-bottom: 12px;
    padding-bottom: 12px;
    border-bottom: 1px solid hsl(var(--border));
  }

  .notification-tabs {
    margin-bottom: 8px;
  }

  .ant-list-item {
    cursor: pointer;
    transition: background-color 0.2s;

    &:hover {
      background-color: hsl(var(--accent) / 0.4);
    }

    &.is-unread {
      background-color: hsl(var(--primary) / 0.06);
    }
  }

  .notification-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 500;

    .unread-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: hsl(var(--error));
      display: inline-block;
    }
  }

  .notification-meta {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;
    flex-wrap: wrap;
  }

  .notification-time {
    color: hsl(var(--muted-foreground));
    font-size: 12px;
  }

  .notification-content {
    color: hsl(var(--foreground) / 0.8);
    line-height: 1.6;
    margin-bottom: 8px;
  }

  .detail-header {
    .detail-title {
      h3 {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
        display: inline;
      }
    }

    .detail-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 12px;
      flex-wrap: wrap;

      .detail-time {
        color: hsl(var(--muted-foreground));
        font-size: 12px;
      }
    }
  }

  .detail-content {
    padding: 8px 0;
    line-height: 1.8;
    font-size: 14px;
    color: hsl(var(--foreground) / 0.9);
  }

  .detail-related {
    margin-bottom: 24px;

    .related-label {
      margin: 0 0 8px 0;
      font-weight: 500;
    }
  }

  .detail-actions {
    margin-top: 24px;
    padding-top: 16px;
    border-top: 1px solid hsl(var(--border));
  }
}
</style>
