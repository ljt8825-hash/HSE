<template>
  <Page auto-content-height class="hse-page">
    <Row v-if="statsLoading" :gutter="[16, 16]" class="mb-4">
      <Col :xs="24" :sm="12" :md="8" :lg="6" :xl="6" v-for="i in 4" :key="`skel-${i}`">
        <Card :bordered="false">
          <Skeleton active :paragraph="{ rows: 2 }" />
        </Card>
      </Col>
    </Row>
    <SortableStatRow v-else-if="hasVisibleStats" page-key="inspection-violation">
      <Col :xs="24" :sm="12" :md="8" :lg="6" :xl="6" v-for="stat in statItems" :key="stat.key" class="sortable-stat-col" :data-stat-key="stat.key" v-show="isStatVisible(stat.key)">
        <HseStatCard
          :title="stat.label"
          :value="stat.value"
          :icon="stat.icon"
          :color="(stat.color as any)"
        />
      </Col>
    </SortableStatRow>

    <Card :bordered="false">
      <template #title>
        <div class="card-header">
          <span>"三违"管理</span>
          <div class="action-group">
            <Space :size="8">
              <HelpButton menuCode="HSE_INSPECTION" />
              <Tabs v-model:activeKey="viewMode" class="mr-4">
              <TabPane key="list" tab="列表视图" />
              <TabPane key="kanban" tab="看板视图" />
            </Tabs>
            <ImportButtonGroup v-if="isActionVisible('import')" module="violation" module-name="三违管理" @refresh="fetchList" />
            <Button v-if="isActionVisible('create')" type="primary" @click="handleCreate">
              <template #icon><IconifyIcon icon="lucide:plus" /></template>
              新增违章
            </Button>
            <ComponentVisibilitySettings
              title="三违管理显示设置"
              v-model:model-value="config"
              :stat-items="visibilityStatItems"
              :action-buttons="actionButtons"
              @reset="resetToDefault"
            />
            </Space>
          </div>
        </div>
      </template>

      <Form v-if="isFilterVisible" layout="inline" class="filter-form">
        <FormItem label="关键词">
          <Input
            v-model:value="searchForm.keyword"
            placeholder="搜索标题/违章人/描述"
            allow-clear
            @change="handleSearch"
          />
        </FormItem>
        <FormItem label="违章类型">
          <Select
            v-model:value="searchForm.type"
            placeholder="全部类型"
            allow-clear
            @change="handleSearch"
          >
            <SelectOption value="违章指挥">违章指挥</SelectOption>
            <SelectOption value="违章作业">违章作业</SelectOption>
            <SelectOption value="违反劳动纪律">违反劳动纪律</SelectOption>
          </Select>
        </FormItem>
        <FormItem label="违章级别">
          <Select
            v-model:value="searchForm.level"
            placeholder="全部级别"
            allow-clear
            @change="handleSearch"
          >
            <SelectOption value="一般">一般</SelectOption>
            <SelectOption value="较重">较重</SelectOption>
            <SelectOption value="严重">严重</SelectOption>
          </Select>
        </FormItem>
        <FormItem label="状态">
          <Select
            v-model:value="searchForm.status"
            placeholder="全部状态"
            allow-clear
            @change="handleSearch"
          >
            <SelectOption value="待整改">待整改</SelectOption>
            <SelectOption value="整改中">整改中</SelectOption>
            <SelectOption value="已整改">已整改</SelectOption>
            <SelectOption value="已复查">已复查</SelectOption>
          </Select>
        </FormItem>
        <FormItem label="部门">
          <Select
            v-model:value="searchForm.department"
            placeholder="全部部门"
            allow-clear
            @change="handleSearch"
          >
            <SelectOption v-for="d in departmentOptions" :key="d" :value="d">{{ d }}</SelectOption>
          </Select>
        </FormItem>
        <FormItem label="区域">
          <Select
            v-model:value="searchForm.area"
            placeholder="全部区域"
            allow-clear
            @change="handleSearch"
          >
            <SelectOption v-for="a in areaOptions" :key="a" :value="a">{{ a }}</SelectOption>
          </Select>
        </FormItem>
        <FormItem>
          <Button @click="handleReset">重置</Button>
        </FormItem>
      </Form>

      <template v-if="viewMode === 'list'">
        <Table
          ref="tableRef"
          :columns="tableColumns"
          :data-source="violationList"
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
          :scroll="{ x: 1600 }"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'type'">
              <Tag :color="getTypeColor(record.type)">{{ record.type }}</Tag>
            </template>
            <template v-else-if="column.key === 'level'">
              <Tag :color="getLevelColor(record.level)">{{ record.level }}</Tag>
            </template>
            <template v-else-if="column.key === 'status'">
              <Tag :color="getStatusColor(record.status)">{{ record.status }}</Tag>
            </template>
            <template v-else-if="column.key === 'discoverDate'">
              {{ formatDate(record.discoverDate) }}
            </template>
            <template v-else-if="column.key === 'deadline'">
              {{ formatDate(record.deadline) }}
            </template>
            <template v-else-if="column.key === 'action'">
              <Button type="link" size="small" @click="handleView(record as any)">查看</Button>
              <Button type="link" size="small" @click="handleEdit(record as any)">编辑</Button>
              <Popconfirm
                title="确定要删除此违章记录吗？"
                ok-text="删除"
                cancel-text="取消"
                @confirm="handleDelete(record as any)"
              >
                <Button type="link" size="small" danger>删除</Button>
              </Popconfirm>
            </template>
          </template>
        </Table>
      </template>

      <template v-else>
        <div class="kanban-container">
          <div
            v-for="col in kanbanColumns"
            :key="col.key"
            class="kanban-column"
            @dragover.prevent
            @drop="(e) => handleDrop(e, col.key)"
          >
            <div class="kanban-header" :style="{ borderLeftColor: `hsl(var(--${col.color}))` }">
              <span class="kanban-title">{{ col.title }}</span>
              <span class="kanban-count">{{ kanbanData[col.key as keyof typeof kanbanData]?.length || 0 }}</span>
            </div>
            <div class="kanban-content">
              <div
                v-for="item in kanbanData[col.key as keyof typeof kanbanData]"
                :key="item.id"
                class="kanban-card"
                draggable="true"
                @dragstart="(e) => handleDragStart(e, item)"
                @click="handleView(item)"
              >
                <div class="card-header">
                  <Tag :color="getLevelColor(item.level)">{{ item.level }}</Tag>
                  <Tag :color="getTypeColor(item.type)">{{ item.type }}</Tag>
                </div>
                <div class="card-title">{{ item.title }}</div>
                <div class="card-info">
                  <span>违章人：{{ item.violator }}</span>
                  <span>区域：{{ item.area }}</span>
                </div>
                <div class="card-footer">
                  <span class="deadline">{{ formatDate(item.deadline) }} 到期</span>
                  <span class="department">{{ item.department }}</span>
                </div>
              </div>
              <div v-if="!kanbanData[col.key as keyof typeof kanbanData]?.length" class="kanban-empty">
                暂无数据
              </div>
            </div>
          </div>
        </div>
      </template>
    </Card>

    <Modal
      v-model:open="modalVisible"
      :title="editingRecord ? '编辑违章' : '新增违章'"
      :confirm-loading="modalLoading"
      width="720px"
      @ok="handleSave"
      @cancel="modalVisible = false"
    >
      <Form ref="formRef" :model="violationForm" :rules="(formRules as any)" layout="vertical">
        <Row :gutter="16">
          <Col :span="24">
            <FormItem label="违章标题" name="title">
              <Input v-model:value="violationForm.title" placeholder="请输入违章标题" />
            </FormItem>
          </Col>
          <Col :span="8">
            <FormItem label="违章类型" name="type">
              <Select v-model:value="violationForm.type" placeholder="请选择类型" style="width: 100%">
                <SelectOption value="违章指挥">违章指挥</SelectOption>
                <SelectOption value="违章作业">违章作业</SelectOption>
                <SelectOption value="违反劳动纪律">违反劳动纪律</SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="8">
            <FormItem label="违章级别" name="level">
              <Select v-model:value="violationForm.level" placeholder="请选择级别" style="width: 100%">
                <SelectOption value="一般">一般</SelectOption>
                <SelectOption value="较重">较重</SelectOption>
                <SelectOption value="严重">严重</SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="8">
            <FormItem label="状态" name="status">
              <Select v-model:value="violationForm.status" placeholder="请选择状态" style="width: 100%">
                <SelectOption value="待整改">待整改</SelectOption>
                <SelectOption value="整改中">整改中</SelectOption>
                <SelectOption value="已整改">已整改</SelectOption>
                <SelectOption value="已复查">已复查</SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="所属部门" name="department">
              <Select
                v-model:value="violationForm.department"
                placeholder="请选择部门"
                style="width: 100%"
                :options="departmentOptions.map((d) => ({ label: d, value: d }))"
              />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="违章人员" name="violator">
              <Input v-model:value="violationForm.violator" placeholder="请输入违章人员姓名" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="发现区域" name="area">
              <Select
                v-model:value="violationForm.area"
                placeholder="请选择区域"
                style="width: 100%"
                :options="areaOptions.map((a) => ({ label: a, value: a }))"
              />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="发现人" name="discoverer">
              <Input v-model:value="violationForm.discoverer" placeholder="请输入发现人" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="发现日期" name="discoverDate">
              <DatePicker v-model:value="violationForm.discoverDate" style="width: 100%" value-format="YYYY-MM-DD" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="整改期限" name="deadline">
              <DatePicker v-model:value="violationForm.deadline" style="width: 100%" value-format="YYYY-MM-DD" />
            </FormItem>
          </Col>
          <Col :span="24">
            <FormItem label="违章描述" name="description">
              <Textarea v-model:value="violationForm.description" :rows="3" placeholder="请描述违章情况" />
            </FormItem>
          </Col>
          <Col :span="24">
            <FormItem label="整改措施" name="rectificationMeasure">
              <Textarea v-model:value="violationForm.rectificationMeasure" :rows="2" placeholder="请输入整改措施" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="整改人" name="rectifier">
              <Input v-model:value="violationForm.rectifier" placeholder="请输入整改人" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="整改日期" name="rectificationDate">
              <DatePicker v-model:value="violationForm.rectificationDate" style="width: 100%" value-format="YYYY-MM-DD" :disabled-date="(d) => d && d.isBefore(violationForm.discoverDate, 'day')" />
            </FormItem>
          </Col>
          <Col :span="24">
            <FormItem label="备注" name="remark">
              <Textarea v-model:value="violationForm.remark" :rows="2" placeholder="其他需要说明的事项" />
            </FormItem>
          </Col>
        </Row>
      </Form>
    </Modal>

    <Drawer v-model:open="detailDrawerVisible" title="违章详情" width="720px">
      <template v-if="currentRecord">
        <div class="detail-section">
          <h3 class="detail-title">{{ currentRecord.title }}</h3>
          <Tag :color="getTypeColor(currentRecord.type)" class="mr-2">{{ currentRecord.type }}</Tag>
          <Tag :color="getLevelColor(currentRecord.level)" class="mr-2">{{ currentRecord.level }}</Tag>
          <Tag :color="getStatusColor(currentRecord.status)">{{ currentRecord.status }}</Tag>
        </div>
        <div class="detail-section">
          <Row :gutter="16">
            <Col :span="12">
              <div class="detail-row">
                <span class="detail-label">所属部门：</span>
                <span class="detail-value">{{ currentRecord.department || '-' }}</span>
              </div>
            </Col>
            <Col :span="12">
              <div class="detail-row">
                <span class="detail-label">违章人员：</span>
                <span class="detail-value">{{ currentRecord.violator || '-' }}</span>
              </div>
            </Col>
            <Col :span="12">
              <div class="detail-row">
                <span class="detail-label">发现区域：</span>
                <span class="detail-value">{{ currentRecord.area || '-' }}</span>
              </div>
            </Col>
            <Col :span="12">
              <div class="detail-row">
                <span class="detail-label">发现人：</span>
                <span class="detail-value">{{ currentRecord.discoverer || '-' }}</span>
              </div>
            </Col>
            <Col :span="12">
              <div class="detail-row">
                <span class="detail-label">发现日期：</span>
                <span class="detail-value">{{ formatDate(currentRecord.discoverDate) }}</span>
              </div>
            </Col>
            <Col :span="12">
              <div class="detail-row">
                <span class="detail-label">整改期限：</span>
                <span class="detail-value">{{ formatDate(currentRecord.deadline) }}</span>
              </div>
            </Col>
            <Col :span="12">
              <div class="detail-row">
                <span class="detail-label">整改人：</span>
                <span class="detail-value">{{ currentRecord.rectifier || '-' }}</span>
              </div>
            </Col>
            <Col :span="12">
              <div class="detail-row">
                <span class="detail-label">整改日期：</span>
                <span class="detail-value">{{ formatDate(currentRecord.rectificationDate) }}</span>
              </div>
            </Col>
          </Row>
        </div>
        <div class="detail-section">
          <div class="detail-label">违章描述</div>
          <div class="detail-content">{{ currentRecord.description || '无' }}</div>
        </div>
        <div class="detail-section">
          <div class="detail-label">整改措施</div>
          <div class="detail-content">{{ currentRecord.rectificationMeasure || '无' }}</div>
        </div>
        <div v-if="currentRecord.remark" class="detail-section">
          <div class="detail-label">备注</div>
          <div class="detail-content">{{ currentRecord.remark }}</div>
        </div>
      </template>
    </Drawer>
  </Page>
</template>

<script setup lang="ts">
import { ref, reactive, nextTick, onMounted, computed } from 'vue';
import {
  Card,
  Row,
  Col,
  Table,
  Form,
  FormItem,
  Input,
  Select,
  SelectOption,
  Button,
  Modal,
  Drawer,
  Tag,
  DatePicker,
  Textarea,
  message,
  Popconfirm,
  Tabs,
  TabPane,
  Skeleton,
  Space,
} from 'ant-design-vue';
import type { FormInstance } from 'ant-design-vue';
import { IconifyIcon } from '@vben/icons';
import { Page } from '@vben/common-ui';
import { HelpButton } from '#/components/hse';
import HseStatCard from '#/components/hse/StatCard.vue';
import ImportButtonGroup from '#/components/hse/ImportButtonGroup.vue';
import SortableStatRow from '#/components/hse/SortableStatRow.vue';
import ComponentVisibilitySettings from '#/components/hse/ComponentVisibilitySettings.vue';
import { useTableColumnSettings } from '#/composables/useTableColumnSettings';
import { useComponentVisibility } from '#/composables/useComponentVisibility';
import dayjs from 'dayjs';
import { $t } from '#/locales';

import {
  getViolationList,
  getSiteStats,
  createViolation,
  updateViolation,
  deleteViolation,
  type SiteApi,
} from '#/api/hse/site';

const loading = ref(false);
const statsLoading = ref(false);
const violationList = ref<SiteApi.Violation[]>([]);
const total = ref(0);
const viewMode = ref('list');

const kanbanColumns = [
  { key: 'pending', title: '待整改', color: 'red' },
  { key: 'processing', title: '整改中', color: 'orange' },
  { key: 'completed', title: '已整改', color: 'green' },
];

const pendingViolations = computed(() => violationList.value.filter(v => v.status === '待整改'));
const processingViolations = computed(() => violationList.value.filter(v => v.status === '整改中'));
const completedViolations = computed(() => violationList.value.filter(v => v.status === '已整改' || v.status === '已复查'));

const kanbanData = computed(() => ({
  pending: pendingViolations.value,
  processing: processingViolations.value,
  completed: completedViolations.value,
}));

const searchForm = reactive({
  keyword: '',
  type: undefined as string | undefined,
  level: undefined as string | undefined,
  status: undefined as string | undefined,
  department: undefined as string | undefined,
  area: undefined as string | undefined,
});

const pagination = reactive({
  page: 1,
  pageSize: 10,
});

const departmentOptions = [
  '生产运行部',
  '设备保障部',
  '安全环保部',
  '车队',
  '综合管理部',
];

const areaOptions = [
  '生产车间A',
  '生产车间B',
  '危化品仓库',
  '办公楼',
  '厂区主干道',
  '锅炉房',
];

const modalVisible = ref(false);
const modalLoading = ref(false);
const editingRecord = ref<SiteApi.Violation | null>(null);
const violationForm = reactive<any>({
  title: '',
  type: '违章作业',
  level: '一般',
  status: '待整改',
  department: '',
  violator: '',
  area: '',
  discoverer: '',
  discoverDate: '',
  description: '',
  rectificationMeasure: '',
  deadline: '',
  rectifier: '',
  rectificationDate: '',
  remark: '',
});

const formRef = ref<FormInstance>();

const formRules = {
  title: [
    { required: true, message: '请输入违章标题', trigger: 'blur' },
    { min: 2, max: 100, message: '标题长度为2-100字符', trigger: 'blur' },
  ],
  type: [{ required: true, message: '请选择违章类型', trigger: 'change' }],
  level: [{ required: true, message: '请选择违章级别', trigger: 'change' }],
  status: [{ required: true, message: '请选择状态', trigger: 'change' }],
  department: [{ required: true, message: '请选择所属部门', trigger: 'change' }],
  violator: [{ required: true, message: '请输入违章人员', trigger: 'blur' }],
  area: [{ required: true, message: '请选择发现区域', trigger: 'change' }],
  discoverer: [{ required: true, message: '请输入发现人', trigger: 'blur' }],
  discoverDate: [{ required: true, message: '请选择发现日期', trigger: 'change' }],
  description: [{ required: true, message: '请输入违章描述', trigger: 'blur' }],
};

const detailDrawerVisible = ref(false);
const currentRecord = ref<SiteApi.Violation | null>(null);

const statsData = ref<SiteApi.SiteStats>({
  totalViolations: 0,
  pendingViolations: 0,
  rectifiedViolations: 0,
  seriousViolations: 0,
  violationByType: {},
  totalFireEquipment: 0,
  normalFireEquipment: 0,
  abnormalFireEquipment: 0,
  expiredFireEquipment: 0,
  fireByType: {},
  totalGridAreas: 0,
  onDutyGridPersonnel: 0,
  avgCompletionRate: 0,
});

const statItems = computed(() => [
  { key: 'total', label: '违章总数', value: statsData.value.totalViolations, color: 'blue', icon: 'lucide:shield-alert' },
  { key: 'pending', label: '待整改', value: statsData.value.pendingViolations, color: 'orange', icon: 'lucide:clock' },
  { key: 'rectified', label: '已整改', value: statsData.value.rectifiedViolations, color: 'green', icon: 'lucide:check-circle-2' },
  { key: 'serious', label: '严重违章', value: statsData.value.seriousViolations, color: 'red', icon: 'lucide:alert-triangle' },
]);

const originalColumns = ref([
  { title: '序号', key: 'index', width: 70, customRender: ({ index }: { index: number }) => index + 1 },
  { title: '违章标题', dataIndex: 'title', key: 'title', width: 200, ellipsis: true },
  { title: '违章类型', dataIndex: 'type', key: 'type', width: 110 },
  { title: '违章级别', dataIndex: 'level', key: 'level', width: 100 },
  { title: '状态', dataIndex: 'status', key: 'status', width: 100 },
  { title: '所属部门', dataIndex: 'department', key: 'department', width: 110 },
  { title: '违章人员', dataIndex: 'violator', key: 'violator', width: 100 },
  { title: '发现区域', dataIndex: 'area', key: 'area', width: 120 },
  { title: '发现人', dataIndex: 'discoverer', key: 'discoverer', width: 90 },
  { title: '发现日期', dataIndex: 'discoverDate', key: 'discoverDate', width: 110 },
  { title: '整改期限', dataIndex: 'deadline', key: 'deadline', width: 110 },
  { title: '操作', key: 'action', width: 180, fixed: 'right' as const },
]);

const { columns: tableColumns, initSortable, initResizable } = useTableColumnSettings(originalColumns, 'inspection-violation');
const tableRef = ref<any>(null);

const visibilityStatItems = computed(() => statItems.value.map((s) => ({ key: s.key, label: s.label })));
const actionButtons = ref([
  { key: 'import', label: '导入数据' },
  { key: 'create', label: '新增违章' },
]);

const { config, isStatVisible, isActionVisible, isFilterVisible, resetToDefault } = useComponentVisibility({
  pageKey: 'inspection-violation',
  statItems: visibilityStatItems,
  actionButtons,
});

const hasVisibleStats = computed(() => statItems.value.some((s) => isStatVisible.value(s.key)));

function getTypeColor(type: string): string {
  const map: Record<string, string> = {
    '违章指挥': 'red',
    '违章作业': 'orange',
    '违反劳动纪律': 'blue',
  };
  return map[type] || 'default';
}

function getLevelColor(level: string) {
  const map: Record<string, string> = {
    '一般': 'green',
    '较重': 'orange',
    '严重': 'red',
  };
  return map[level] || 'default';
}

function getStatusColor(status: string) {
  const map: Record<string, string> = {
    '待整改': 'red',
    '整改中': 'orange',
    '已整改': 'green',
    '已复查': 'blue',
  };
  return map[status] || 'default';
}

function formatDate(date: string | null | undefined) {
  if (!date) return '-';
  return dayjs(date).format('YYYY-MM-DD');
}

async function fetchList() {
  loading.value = true;
  try {
    const res = await getViolationList({
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: searchForm.keyword || undefined,
      type: searchForm.type,
      level: searchForm.level,
      status: searchForm.status,
      department: searchForm.department,
      area: searchForm.area,
    });
    violationList.value = res.list || [];
    total.value = res.total || 0;
  } catch (err) {
    console.warn('获取三违列表失败:', err);
    message.error($t('hse.message.fetchFailed'));
  } finally {
    loading.value = false;
  }
}

async function fetchStats() {
  statsLoading.value = true;
  try {
    const res = await getSiteStats();
    Object.assign(statsData.value, res);
  } catch (err) {
    console.warn('获取统计数据失败:', err);
  } finally {
    statsLoading.value = false;
  }
}

function handleSearch() {
  pagination.page = 1;
  fetchList();
}

function handleReset() {
  searchForm.keyword = '';
  searchForm.type = undefined;
  searchForm.level = undefined;
  searchForm.status = undefined;
  searchForm.department = undefined;
  searchForm.area = undefined;
  pagination.page = 1;
  fetchList();
}

function handleTableChange(pag: { current: number; pageSize: number }) {
  pagination.page = pag.current;
  pagination.pageSize = pag.pageSize;
  fetchList();
}

function handleCreate() {
  editingRecord.value = null;
  Object.assign(violationForm, {
    title: '',
    type: '违章作业',
    level: '一般',
    status: '待整改',
    department: '',
    violator: '',
    area: '',
    discoverer: '',
    discoverDate: dayjs().format('YYYY-MM-DD'),
    description: '',
    rectificationMeasure: '',
    deadline: dayjs().add(7, 'day').format('YYYY-MM-DD'),
    rectifier: '',
    rectificationDate: '',
    remark: '',
  });
  modalVisible.value = true;
}

function handleEdit(record: SiteApi.Violation) {
  editingRecord.value = record;
  Object.assign(violationForm, record);
  modalVisible.value = true;
}

function handleView(record: SiteApi.Violation) {
  currentRecord.value = record;
  detailDrawerVisible.value = true;
}

async function handleSave() {
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }
  modalLoading.value = true;
  try {
    if (editingRecord.value) {
      await updateViolation(editingRecord.value.id, violationForm);
      message.success('更新成功');
    } else {
      await createViolation(violationForm);
      message.success('创建成功');
    }
    modalVisible.value = false;
    fetchList();
    fetchStats();
  } catch (err) {
    console.warn('保存失败:', err);
    message.error('保存失败');
  } finally {
    modalLoading.value = false;
  }
}

async function handleDelete(record: SiteApi.Violation) {
  try {
    await deleteViolation(record.id);
    message.success('删除成功');
    fetchList();
    fetchStats();
  } catch (err) {
    console.warn('删除失败:', err);
    message.error('删除失败');
  }
}

const draggingItem = ref<SiteApi.Violation | null>(null);

function handleDragStart(e: DragEvent, item: SiteApi.Violation) {
  draggingItem.value = item;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', item.id.toString());
  }
}

async function handleDrop(_e: DragEvent, targetColumn: string) {
  if (!draggingItem.value) return;
  
  const statusMap: Record<string, string> = {
    pending: '待整改',
    processing: '整改中',
    completed: '已整改',
  };
  
  const newStatus = statusMap[targetColumn];
  if (!newStatus || draggingItem.value.status === newStatus) {
    draggingItem.value = null;
    return;
  }
  
  try {
    await updateViolation(draggingItem.value.id, { status: newStatus });
    message.success(`状态已更新为${newStatus}`);
    fetchList();
    fetchStats();
  } catch (err) {
    console.warn('更新状态失败:', err);
    message.error('状态更新失败，请稍后重试');
  } finally {
    draggingItem.value = null;
  }
}

async function initTableFeatures() {
  await nextTick();
  if (tableRef.value?.$el) {
    initSortable(tableRef.value.$el);
    initResizable(tableRef.value.$el);
  }
}

onMounted(async () => {
  await Promise.all([fetchList(), fetchStats()]);
  await initTableFeatures();
});
</script>

<style scoped lang="scss">
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}
.action-group {
  display: flex;
  gap: 8px;
}
.filter-form {
  margin-bottom: 16px;
}
.detail-section {
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid hsl(var(--border));
  &:last-child {
    border-bottom: none;
    margin-bottom: 0;
  }
}
.detail-title {
  margin: 0 0 12px 0;
  font-size: 18px;
  font-weight: 600;
  color: hsl(var(--foreground));
}
.detail-row {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}
.detail-label {
  color: hsl(var(--muted-foreground));
  min-width: 90px;
}
.detail-value {
  color: hsl(var(--foreground));
  flex: 1;
}
.detail-content {
  margin-top: 8px;
  padding: 12px;
  background: hsl(var(--muted) / 0.3);
  border-radius: 6px;
  color: hsl(var(--foreground));
  line-height: 1.6;
}
.mr-2 {
  margin-right: 8px;
}

.kanban-container {
  display: flex;
  gap: 16px;
  padding: 8px 0;
  overflow-x: auto;
}

.kanban-column {
  flex: 1;
  min-width: 320px;
  max-width: 400px;
  background: hsl(var(--muted) / 0.2);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
}

.kanban-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-left: 4px solid;
  background: hsl(var(--background));
  border-radius: 8px 8px 0 0;

  .kanban-title {
    font-weight: 600;
    font-size: 14px;
    color: hsl(var(--foreground));
  }

  .kanban-count {
    background: hsl(var(--muted));
    color: hsl(var(--foreground));
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 12px;
    min-width: 24px;
    text-align: center;
  }
}

.kanban-content {
  flex: 1;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 200px;
}

.kanban-card {
  background: hsl(var(--background));
  border-radius: 6px;
  padding: 12px;
  cursor: grab;
  transition: all 0.2s ease;
  border: 1px solid hsl(var(--border));

  &:hover {
    border-color: hsl(var(--primary));
    box-shadow: 0 2px 8px hsl(var(--primary) / 0.1);
  }

  &:active {
    cursor: grabbing;
  }

  &[draggable="true"] {
    opacity: 0.9;
  }
}

.card-header {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
}

.card-title {
  font-weight: 500;
  font-size: 13px;
  color: hsl(var(--foreground));
  margin-bottom: 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;

  span {
    font-size: 12px;
    color: hsl(var(--muted-foreground));
  }
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 8px;
  border-top: 1px solid hsl(var(--border));

  .deadline {
    font-size: 12px;
    color: hsl(var(--warning));
  }

  .department {
    font-size: 12px;
    color: hsl(var(--muted-foreground));
  }
}

.kanban-empty {
  text-align: center;
  padding: 24px;
  color: hsl(var(--muted-foreground));
  font-size: 13px;
}
</style>
