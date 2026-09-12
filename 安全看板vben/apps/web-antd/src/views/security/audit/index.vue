<template>
  <Page auto-content-height class="hse-page">
    <Row v-if="statsLoading" :gutter="[16, 16]" class="mb-4">
      <Col :xs="24" :sm="12" :md="8" :lg="6" :xl="6" v-for="i in 4" :key="`skel-${i}`">
        <Card :bordered="false">
          <Skeleton active :paragraph="{ rows: 2 }" />
        </Card>
      </Col>
    </Row>
    <Card :bordered="false">
      <template #title>
        <div class="card-header">
          <span>审计日志</span>
          <Space>
            <ImportButtonGroup module="audit" module-name="审计日志" />
            <Button type="primary" @click="handleExport">
              <template #icon><IconifyIcon icon="lucide:download" /></template>
              导出
            </Button>
          </Space>
        </div>
      </template>

      <Form layout="inline" class="filter-form">
        <FormItem label="操作人">
          <Input
            v-model:value="searchForm.operator"
            placeholder="搜索用户名"
            allow-clear
            @change="handleSearch"
          />
        </FormItem>
        <FormItem label="操作类型">
          <Select
            v-model:value="searchForm.actionType"
            placeholder="全部类型"
            allow-clear
            @change="handleSearch"
          >
            <SelectOption value="login">登录</SelectOption>
            <SelectOption value="create">新增</SelectOption>
            <SelectOption value="update">修改</SelectOption>
            <SelectOption value="delete">删除</SelectOption>
            <SelectOption value="export">导出</SelectOption>
            <SelectOption value="import">导入</SelectOption>
          </Select>
        </FormItem>
        <FormItem label="模块">
          <Select
            v-model:value="searchForm.module"
            placeholder="全部模块"
            allow-clear
            @change="handleSearch"
          >
            <SelectOption value="auth">认证</SelectOption>
            <SelectOption value="users">用户管理</SelectOption>
            <SelectOption value="roles">角色管理</SelectOption>
            <SelectOption value="hazards">隐患管理</SelectOption>
            <SelectOption value="accidents">事故管理</SelectOption>
            <SelectOption value="training">培训管理</SelectOption>
          </Select>
        </FormItem>
        <FormItem label="时间范围">
          <DatePicker.RangePicker v-model:value="dateRange" @change="handleSearch" />
        </FormItem>
        <FormItem>
          <Button @click="handleReset">重置</Button>
        </FormItem>
      </Form>

      <Table
        :columns="columns"
        :data-source="logList"
        :loading="loading"
        :pagination="{
          current: pagination.page,
          pageSize: pagination.pageSize,
          total: total,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (t) => `共 ${t} 条记录`,
        }"
        :row-key="(record) => record.id"
        @change="(handleTableChange as any)"
        size="middle"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'action'">
            <Tag :color="getActionColor(record.action)">
              {{ getActionText(record.action) }}
            </Tag>
          </template>
          <template v-else-if="column.key === 'module'">
            <Tag color="blue">{{ getModuleText(record.module) }}</Tag>
          </template>
          <template v-else-if="column.key === 'statusCode'">
            <Tag :color="record.statusCode < 400 ? 'green' : 'red'">
              {{ record.statusCode }}
            </Tag>
          </template>
          <template v-else-if="column.key === 'createdAt'">
            {{ formatDate(record.createdAt) }}
          </template>
          <template v-else-if="column.key === 'view'">
            <Button type="link" size="small" @click="handleViewDetail(record as any)">
              详情
            </Button>
          </template>
        </template>
      </Table>
    </Card>

    <Drawer v-model:open="detailDrawerVisible" title="审计详情" width="600px">
      <template v-if="currentLog">
        <Descriptions :column="1" bordered size="small">
          <DescriptionsItem label="操作人">
            {{ currentLog.username }} (ID: {{ currentLog.userId }})
          </DescriptionsItem>
          <DescriptionsItem label="操作类型">
            <Tag :color="getActionColor(currentLog.action)">
              {{ getActionText(currentLog.action) }}
            </Tag>
          </DescriptionsItem>
          <DescriptionsItem label="模块">
            <Tag color="blue">{{ getModuleText(currentLog.module) }}</Tag>
          </DescriptionsItem>
          <DescriptionsItem label="操作描述">{{ currentLog.description }}</DescriptionsItem>
          <DescriptionsItem label="IP地址">{{ currentLog.ipAddress || '-' }}</DescriptionsItem>
          <DescriptionsItem label="浏览器/设备">{{ currentLog.userAgent || '-' }}</DescriptionsItem>
          <DescriptionsItem label="状态码">
            <Tag :color="currentLog.statusCode < 400 ? 'green' : 'red'">
              {{ currentLog.statusCode }}
            </Tag>
          </DescriptionsItem>
          <DescriptionsItem label="操作时间">{{ formatDate(currentLog.createdAt) }}</DescriptionsItem>
          <DescriptionsItem v-if="currentLog.detail" label="详情数据">
            <pre class="audit-detail-pre">
{{ JSON.stringify(currentLog.detail, null, 2) }}
            </pre>
          </DescriptionsItem>
        </Descriptions>
      </template>
    </Drawer>
  </Page>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { Button, Card, Col, DatePicker, Descriptions, DescriptionsItem, Drawer, Form, FormItem, Input, Row, Select, SelectOption, Skeleton, Space, Table, Tag, message } from 'ant-design-vue'; // [Vben官方] 显式按需导入 antd 组件，参考 apps/web-antd/src/views/demos/antd/index.vue
import { IconifyIcon } from '@vben/icons'; // [Vben官方] 图标改用 IconifyIcon(icon prop)，参考 @vben/icons 与 layouts/basic.vue
import { Page } from '@vben/common-ui';
import ImportButtonGroup from '#/components/hse/ImportButtonGroup.vue';
import dayjs from 'dayjs';
import { $t } from '#/locales';

import { getAuditLogs, exportAuditLogs, type AuditApi } from '#/api/hse/audit';

const loading = ref(false);
const statsLoading = ref(false);
const logList = ref<AuditApi.AuditLogItem[]>([]);
const total = ref(0);

const searchForm = reactive({
  operator: '',
  actionType: undefined as string | undefined,
  module: undefined as string | undefined,
});

const pagination = reactive({
  page: 1,
  pageSize: 10,
});

const dateRange = ref<any>(null);
const detailDrawerVisible = ref(false);
const currentLog = ref<AuditApi.AuditLogItem | null>(null);

const columns = [
  {
    title: '序号',
    key: 'index',
    width: 60,
    align: 'center' as const,
    customRender: ({ index }: { index: number }) => (pagination.page - 1) * pagination.pageSize + index + 1,
  },
  { title: '操作人', dataIndex: 'username', key: 'username', width: 120 },
  { title: '操作类型', key: 'action', width: 100 },
  { title: '模块', key: 'module', width: 100 },
  { title: '描述', dataIndex: 'description', key: 'description', ellipsis: true },
  { title: 'IP地址', dataIndex: 'ipAddress', key: 'ipAddress', width: 130 },
  { title: '状态码', key: 'statusCode', width: 80 },
  { title: '操作时间', key: 'createdAt', width: 170 },
  { title: '操作', key: 'view', width: 80, fixed: 'right' as const },
];

function formatDate(date: string): string {
  return dayjs(date).format('YYYY-MM-DD HH:mm:ss');
}

function getActionColor(action: string): string {
  const map: Record<string, string> = {
    login: 'green',
    logout: 'default',
    create: 'blue',
    update: 'gold',
    delete: 'red',
    export: 'purple',
    import: 'cyan',
  };
  return map[action] || 'default';
}

function getActionText(action: string): string {
  const map: Record<string, string> = {
    login: '登录',
    logout: '登出',
    create: '新增',
    update: '修改',
    delete: '删除',
    export: '导出',
    import: '导入',
  };
  return map[action] || action;
}

function getModuleText(module: string): string {
  const map: Record<string, string> = {
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
  return map[module] || module;
}

async function fetchData() {
  loading.value = true;
  statsLoading.value = true;
  try {
    const params: AuditApi.AuditLogParams = {
      page: pagination.page,
      pageSize: pagination.pageSize,
      operator: searchForm.operator || undefined,
      actionType: searchForm.actionType,
      module: searchForm.module,
    };
    if (dateRange.value && dateRange.value[0] && dateRange.value[1]) {
      params.startTime = dateRange.value[0].format('YYYY-MM-DD');
      params.endTime = dateRange.value[1].format('YYYY-MM-DD');
    }
    const res = await getAuditLogs(params);
    logList.value = res.list || [];
    total.value = res.total || 0;
  } catch (err) {
    console.warn('获取审计日志列表失败:', err);
    message.error($t('hse.message.fetchListFailed', { module: $t('hse.module.audit') }));
    logList.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
    statsLoading.value = false;
  }
}

function handleSearch() {
  pagination.page = 1;
  fetchData();
}

function handleReset() {
  searchForm.operator = '';
  searchForm.actionType = undefined;
  searchForm.module = undefined;
  dateRange.value = null;
  pagination.page = 1;
  fetchData();
}

function handleTableChange(pag: { current: number; pageSize: number }) {
  pagination.page = pag.current;
  pagination.pageSize = pag.pageSize;
  fetchData();
}

function handleViewDetail(record: AuditApi.AuditLogItem) {
  currentLog.value = record;
  detailDrawerVisible.value = true;
}

async function handleExport() {
  try {
    const params: AuditApi.AuditLogParams = {
      operator: searchForm.operator || undefined,
      actionType: searchForm.actionType,
      module: searchForm.module,
    };
    await exportAuditLogs(params);
    message.success('导出成功');
  } catch (err) {
    console.warn('导出失败:', err);
    message.info('导出功能演示');
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
  }

  .filter-form {
    margin-bottom: 16px;
    padding-bottom: 16px;
    border-bottom: 1px solid hsl(var(--border));
  }

  .audit-detail-pre {
    max-height: 300px;
    overflow: auto;
    background: hsl(var(--muted));
    padding: 12px;
    border-radius: 4px;
    margin: 0;
  }
}
</style>
