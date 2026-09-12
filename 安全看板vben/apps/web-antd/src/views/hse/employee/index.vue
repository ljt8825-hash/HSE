<!--
  HSE 人员主数据中心 - 员工列表页 - Sprint5.1
  功能: 员工列表 / 搜索 / 新增 / 编辑 / 删除 / 导入 / 调岗 / 历史查询
  表: employee (主表) + hse_employee_org (组织关系) + employee_history (历史)
-->
<template>
  <Page auto-content-height class="hse-page">
    <div class="page-toolbar">
      <Space :size="8">
        <HelpButton menuCode="HSE_EMPLOYEE" />
      </Space>
    </div>
    <!-- 统计卡片 -->
    <Row :gutter="[16, 16]" class="mb-4">
      <Col :xs="24" :sm="12" :md="6">
        <Card :bordered="false" class="stat-card">
          <Statistic title="员工总数" :value="stats.total" :loading="statsLoading">
            <template #prefix>
              <IconifyIcon icon="lucide:users" class="stat-icon" />
            </template>
          </Statistic>
        </Card>
      </Col>
      <Col :xs="24" :sm="12" :md="6">
        <Card :bordered="false" class="stat-card">
          <Statistic title="在职人数" :value="activeCount" :loading="statsLoading">
            <template #prefix>
              <IconifyIcon icon="lucide:user-check" class="stat-icon stat-icon-green" />
            </template>
          </Statistic>
        </Card>
      </Col>
      <Col :xs="24" :sm="12" :md="6">
        <Card :bordered="false" class="stat-card">
          <Statistic title="生产人员" :value="productionCount" :loading="statsLoading">
            <template #prefix>
              <IconifyIcon icon="lucide:hard-hat" class="stat-icon stat-icon-blue" />
            </template>
          </Statistic>
        </Card>
      </Col>
      <Col :xs="24" :sm="12" :md="6">
        <Card :bordered="false" class="stat-card">
          <Statistic title="超龄人员" :value="overAgeCount" :loading="statsLoading">
            <template #prefix>
              <IconifyIcon icon="lucide:alert-triangle" class="stat-icon stat-icon-orange" />
            </template>
          </Statistic>
        </Card>
      </Col>
    </Row>

    <!-- 主内容区 -->
    <Card :bordered="false">
      <!-- 工具栏 -->
      <div class="toolbar">
        <div class="toolbar-left">
          <Input.Search
            v-model:value="searchForm.keyword"
            placeholder="搜索姓名/工号/手机号"
            style="width: 280px"
            allow-clear
            @search="handleSearch"
          />
          <Select
            v-model:value="searchForm.deptName"
            placeholder="部门"
            style="width: 160px"
            allow-clear
            @change="handleSearch"
          >
            <Select.Option v-for="d in deptOptions" :key="d" :value="d">{{ d }}</Select.Option>
          </Select>
          <Select
            v-model:value="searchForm.positionName"
            placeholder="岗位"
            style="width: 120px"
            allow-clear
            @change="handleSearch"
          >
            <Select.Option v-for="p in positionOptions" :key="p" :value="p">{{ p }}</Select.Option>
          </Select>
          <Select
            v-model:value="searchForm.gender"
            placeholder="性别"
            style="width: 100px"
            allow-clear
            @change="handleSearch"
          >
            <Select.Option value="男">男</Select.Option>
            <Select.Option value="女">女</Select.Option>
          </Select>
        </div>
        <div class="toolbar-right">
          <Button v-if="canEdit" type="primary" @click="handleAdd">
            <template #icon><IconifyIcon icon="lucide:plus" /></template>
            新增员工
          </Button>
          <Button v-if="canEdit" @click="handleImport">
            <template #icon><IconifyIcon icon="lucide:upload" /></template>
            导入
          </Button>
        </div>
      </div>

      <!-- 员工表格 -->
      <Table
        :columns="columns"
        :data-source="list"
        :loading="loading"
        :pagination="pagination"
        row-key="id"
        :scroll="{ x: 1600 }"
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <span class="emp-name">{{ record.name }}</span>
            <Tag v-if="record.is_public_welfare" color="blue" size="small">公益岗</Tag>
          </template>
          <template v-else-if="column.key === 'employee_code'">
            <span>{{ record.employee_code || '-' }}</span>
          </template>
          <template v-else-if="column.key === 'id_card'">
            {{ record.id_card || '-' }}
          </template>
          <template v-else-if="column.key === 'dept_name'">
            {{ record.dept_name || record.org_name || '-' }}
          </template>
          <template v-else-if="column.key === 'team_name'">
            <span>{{ extractTeamName(record.org_path) }}</span>
          </template>
          <template v-else-if="column.key === 'start_date'">
            {{ formatDate(record.start_date) }}
          </template>
          <template v-else-if="column.key === 'is_driver'">
            <Tag :color="record.is_driver ? 'blue' : 'default'">{{ record.is_driver ? '是' : '否' }}</Tag>
          </template>
          <template v-else-if="column.key === 'action'">
            <Space>
              <Button type="link" size="small" @click="handleTransfer(record as any)">调岗</Button>
              <Button type="link" size="small" @click="handleHistory(record as any)">历史</Button>
              <Button v-if="canEdit" type="link" size="small" @click="handleEdit(record as any)">编辑</Button>
              <Popconfirm
                v-if="canEdit"
                title="确定删除该员工吗？"
                @confirm="handleDelete(record as any)"
              >
                <Button type="link" size="small" danger>删除</Button>
              </Popconfirm>
            </Space>
          </template>
        </template>
      </Table>
    </Card>

    <!-- 弹窗组件 -->
    <EmployeeEditModal
      v-model:open="editModalOpen"
      :mode="editMode"
      :employee="currentEmployee"
      @success="loadList"
    />
    <OrgTransferModal
      v-model:open="transferModalOpen"
      :employee-id="currentEmployee?.id"
      :employee-name="currentEmployee?.name"
      @success="loadList"
    />
    <EmployeeHistoryDrawer
      v-model:open="historyDrawerOpen"
      :employee-id="currentEmployee?.id"
      :employee-name="currentEmployee?.name"
    />
    <EmployeeImportModal
      v-model:open="importModalOpen"
      @success="loadList"
    />
  </Page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { useAccess } from '@vben/access';
import { Button, Card, Col, Input, message, Popconfirm, Row, Select, Space, Statistic, Table, Tag } from 'ant-design-vue';
import EmployeeEditModal from './components/EmployeeEditModal.vue';
import OrgTransferModal from './components/OrgTransferModal.vue';
import EmployeeHistoryDrawer from './components/EmployeeHistoryDrawer.vue';
import EmployeeImportModal from './components/EmployeeImportModal.vue';
import { HelpButton } from '#/components/hse';
import { useSearchForm, useDataTable } from '#/composables/hse';
import {
  deleteEmployee,
  getEmployeeList,
  getEmployeeStats,
  getFilterOptions,
  type EmployeeApi,
} from '#/api/hse/employee';

/** 员工搜索表单字段类型 */
interface EmployeeSearchForm {
  keyword: string;
  personType?: EmployeeApi.PersonType;
  personCategory?: EmployeeApi.PersonCategory;
  gender?: string;
  deptName?: string;
  positionName?: string;
}

const { hasAccessByRoles } = useAccess();
const canEdit = computed(() => hasAccessByRoles(['admin', 'safety_manager']));

// 统计数据
const statsLoading = ref(false);
const stats = ref<EmployeeApi.EmployeeStats>({
  total: 0,
  byPersonType: [],
  byPersonCategory: [],
  byOrgStatus: [],
});

const activeCount = computed(() => {
  const item = stats.value.byOrgStatus.find((s) => s.status === '在职');
  return item?.count || 0;
});
const productionCount = computed(() => {
  const item = stats.value.byPersonType.find((s) => s.person_type === '生产人员');
  return item?.count || 0;
});
const overAgeCount = computed(() => {
  const item = stats.value.byPersonCategory.find((s) => s.person_category === '超龄人员');
  return item?.count || 0;
});

// 列表数据（统一由 useDataTable 托管分页 / loading / 数据）
const table = useDataTable<EmployeeApi.EmployeeItem>({
  fetchFn: (params) =>
    getEmployeeList({
      page: params.page,
      pageSize: params.pageSize,
      keyword: searchForm.keyword || undefined,
      personType: searchForm.personType as EmployeeApi.PersonType,
      personCategory: searchForm.personCategory as EmployeeApi.PersonCategory,
      gender: searchForm.gender || undefined,
      deptName: searchForm.deptName || undefined,
      positionName: searchForm.positionName || undefined,
    }),
  defaultPageSize: 20,
  paginationExtra: {
    showSizeChanger: true,
    showTotal: (total: number) => `共 ${total} 条`,
  },
});
const { dataList: list, loading, pagination, fetchData: loadList, handleTableChange } = table;

// 筛选器选项
const deptOptions = ref<string[]>([]);
const positionOptions = ref<string[]>([]);

// 搜索表单（统一由 useSearchForm 托管状态与重置）
const { form: searchForm } = useSearchForm<EmployeeSearchForm>({
  defaults: {
    keyword: '',
    personType: undefined,
    personCategory: undefined,
    gender: undefined,
    deptName: undefined,
    positionName: undefined,
  },
  onSearch: () => table.handleReset(),
  debounceMs: 300,
});

const columns = [
  { title: '员工编号', dataIndex: 'employee_code', key: 'employee_code', width: 120, fixed: 'left' as const },
  { title: '姓名', dataIndex: 'name', key: 'name', width: 100 },
  { title: '性别', dataIndex: 'gender', key: 'gender', width: 70 },
  { title: '身份证号', dataIndex: 'id_card', key: 'id_card', width: 180 },
  { title: '联系电话', dataIndex: 'phone', key: 'phone', width: 130 },
  { title: '所属部门', dataIndex: 'dept_name', key: 'dept_name', width: 140, ellipsis: true },
  { title: '班组', dataIndex: 'team_name', key: 'team_name', width: 100, ellipsis: true },
  { title: '职位', dataIndex: 'position_name', key: 'position_name', width: 120 },
  { title: '入职日期', dataIndex: 'start_date', key: 'start_date', width: 110 },
  { title: '是否驾驶员', dataIndex: 'is_driver', key: 'is_driver', width: 100 },
  { title: '直接上级', dataIndex: 'supervisor_name', key: 'supervisor_name', width: 100, ellipsis: true },
  { title: '操作', key: 'action', width: 240, fixed: 'right' as const },
];

// 弹窗状态
const editModalOpen = ref(false);
const editMode = ref<'create' | 'edit'>('create');
const currentEmployee = ref<EmployeeApi.EmployeeItem | null>(null);
const transferModalOpen = ref(false);
const historyDrawerOpen = ref(false);
const importModalOpen = ref(false);

function formatDate(dateStr?: string) {
  if (!dateStr) return '-';
  return dateStr.slice(0, 10);
}

// 提示词-60：从 org_path（/集团/区域/企业/项目/班组）提取末级班组名
function extractTeamName(orgPath?: string): string {
  if (!orgPath) return '-';
  const parts = String(orgPath).split('/').filter(Boolean);
  return parts[parts.length - 1] || '-';
}

// 列表加载已由 useDataTable（table.fetchData / 别名 loadList）托管

// 加载筛选器选项（提示词-92 任务1：从花名册实际数据动态提取部门/岗位）
async function loadFilterOptions() {
  try {
    const options = await getFilterOptions();
    deptOptions.value = options.departments;
    positionOptions.value = options.positions;
  } catch {
    // 错误提示已由拦截器处理
  }
}

// 加载统计
async function loadStats() {
  statsLoading.value = true;
  try {
    stats.value = await getEmployeeStats();
  } catch {
    // 错误提示已由拦截器处理
  } finally {
    statsLoading.value = false;
  }
}

// 搜索：回到第 1 页并重新拉取（由 useDataTable.handleReset 实现）
function handleSearch() {
  table.handleReset();
}

// 新增
function handleAdd() {
  editMode.value = 'create';
  currentEmployee.value = null;
  editModalOpen.value = true;
}

// 编辑
function handleEdit(record: EmployeeApi.EmployeeItem) {
  editMode.value = 'edit';
  currentEmployee.value = record;
  editModalOpen.value = true;
}

// 调岗
function handleTransfer(record: EmployeeApi.EmployeeItem) {
  currentEmployee.value = record;
  transferModalOpen.value = true;
}

// 历史
function handleHistory(record: EmployeeApi.EmployeeItem) {
  currentEmployee.value = record;
  historyDrawerOpen.value = true;
}

// 导入
function handleImport() {
  importModalOpen.value = true;
}

// 删除
async function handleDelete(record: EmployeeApi.EmployeeItem) {
  try {
    await deleteEmployee(record.id);
    message.success('删除成功');
    loadList();
    loadStats();
  } catch {
    // 错误提示已由拦截器处理
  }
}

// 性能优化：独立 API 调用改为 Promise.all 并行执行
onMounted(async () => {
  await Promise.all([
    loadList(),
    loadStats(),
    loadFilterOptions(),
  ]);
});
</script>

<style scoped>
.hse-page {
  padding: 16px;
}

.stat-card {
  border-radius: 8px;
}

.stat-icon {
  font-size: 20px;
  color: hsl(var(--primary));
}

.stat-icon-green { color: hsl(var(--success, 142 71% 45%)); }
.stat-icon-blue { color: hsl(var(--info, 217 91% 60%)); }
.stat-icon-orange { color: hsl(var(--warning, 38 92% 50%)); }

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 12px;
}

.toolbar-left {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.toolbar-right {
  display: flex;
  gap: 8px;
}

.emp-name {
  font-weight: 500;
}

.org-path {
  color: hsl(var(--muted-foreground));
  font-size: 13px;
}
</style>
