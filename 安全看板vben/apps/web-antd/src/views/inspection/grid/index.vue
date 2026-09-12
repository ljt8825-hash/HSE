<template>
  <Page auto-content-height class="hse-page">
    <Row :gutter="[16, 16]" class="mb-4">
      <Col :xs="24" :sm="12" :md="8" :lg="6" :xl="6" v-for="stat in statItems" :key="stat.key">
        <HseStatCard
          :title="stat.label"
          :value="stat.value"
          :icon="stat.icon"
          :color="(stat.color as any)"
        />
      </Col>
    </Row>

    <Card :bordered="false">
      <template #title>
        <div class="card-header">
          <span>网格管理</span>
          <div class="action-group">
            <ImportButtonGroup
              module="grid"
              module-name="网格管理"
              download-tip="下载检查记录导入模板（三违检查记录表格式）"
              upload-hint="请上传三违检查记录表Excel文件"
              @refresh="() => { fetchData(); fetchFilterOptions(); fetchStats(currentFilterParams()); }"
            />
            <Button type="primary" @click="handleCreate">
              <template #icon><IconifyIcon icon="lucide:plus" /></template>
              新增网格
            </Button>
          </div>
        </div>
      </template>

      <Form layout="inline" class="filter-form">
        <FormItem label="关键词">
          <Input
            v-model:value="searchForm.keyword"
            placeholder="搜索名称/编号/区域"
            allow-clear
            @change="handleSearch"
          />
        </FormItem>
        <FormItem label="网格级别">
          <Select
            v-model:value="searchForm.gridLevel"
            placeholder="全部级别"
            allow-clear
            @change="handleSearch"
          >
            <SelectOption v-for="lv in filterOptions.gridLevels" :key="lv" :value="lv">{{ lv }}</SelectOption>
          </Select>
        </FormItem>
        <FormItem label="所属乡镇">
          <Select
            v-model:value="searchForm.township"
            placeholder="全部乡镇"
            allow-clear
            @change="handleSearch"
          >
            <SelectOption v-for="t in filterOptions.townships" :key="t" :value="t">{{ t }}</SelectOption>
          </Select>
        </FormItem>
        <FormItem label="状态">
          <Select
            v-model:value="searchForm.status"
            placeholder="全部状态"
            allow-clear
            @change="handleSearch"
          >
            <SelectOption v-for="st in filterOptions.statuses" :key="st" :value="st">{{ st }}</SelectOption>
          </Select>
        </FormItem>
        <FormItem label="年份">
          <Select
            v-model:value="searchForm.year"
            placeholder="全部年份"
            allow-clear
            @change="handleSearch"
          >
            <SelectOption v-for="y in filterOptions.years" :key="y" :value="String(y)">{{ y }}年</SelectOption>
          </Select>
        </FormItem>
        <FormItem label="月份">
          <Select
            v-model:value="searchForm.month"
            placeholder="全部月份"
            allow-clear
            @change="handleSearch"
          >
            <SelectOption v-for="m in filterOptions.months" :key="m" :value="String(m)">{{ m }}月</SelectOption>
          </Select>
        </FormItem>
        <FormItem>
          <Button @click="handleReset">重置</Button>
        </FormItem>
      </Form>

      <Table
        :columns="columns"
        :data-source="gridList"
        :loading="loading"
        :pagination="{
          current: pagination.current,
          pageSize: pagination.pageSize,
          total: total,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (t) => `共 ${t} 条记录`,
        }"
        :row-key="(record) => record.id"
        @change="(handleTableChange as any)"
        size="middle"
        :scroll="{ x: 1580 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'personnelId'">
            <Tooltip v-if="record.personnelId" :title="`员工ID #${record.personnelId}`">
              <span>{{ bindNameMap[String(record.personnelId)] || `已绑定员工 #${record.personnelId}` }}</span>
            </Tooltip>
            <span v-else class="text-gray-400">未绑定</span>
          </template>
          <template v-else-if="column.key === 'gridLevel'">
            <Tag :color="getLevelColor(record.gridLevel)">{{ record.gridLevel }}</Tag>
          </template>
          <template v-else-if="column.key === 'status'">
            <Tag :color="getStatusColor(record.status)">{{ record.status }}</Tag>
          </template>
          <template v-else-if="column.key === 'completionRate'">
            <Progress
              :percent="record.completionRate ?? 0"
              :size="'small'"
              :status="getCompletionStatus(record.completionRate ?? 0)"
              :stroke-color="getCompletionColor(record.completionRate ?? 0)"
              :format="formatPercent"
            />
          </template>
          <template v-else-if="column.key === 'action'">
            <Button type="link" size="small" @click="handleView(record as any)">查看</Button>
            <Button type="link" size="small" @click="handleEdit(record as any)">编辑</Button>
            <Popconfirm
              title="确定要删除此网格吗？"
              ok-text="删除"
              cancel-text="取消"
              @confirm="handleDelete(record as any)"
            >
              <Button type="link" size="small" danger>删除</Button>
            </Popconfirm>
            <Button type="link" size="small" style="color: #fa8c16" @click="handleViewViolations(record as any)">三违记录</Button>
          </template>
        </template>
      </Table>
    </Card>

    <Modal
      v-model:open="modalVisible"
      :title="editingRecord ? '编辑网格' : '新增网格'"
      :confirm-loading="modalLoading"
      width="720px"
      @ok="handleSave"
      @cancel="modalVisible = false"
    >
      <Form ref="formRef" :model="gridForm" :rules="(formRules as any)" layout="vertical">
        <Row :gutter="16">
          <Col :span="12">
            <FormItem label="网格名称" name="name">
              <Input v-model:value="gridForm.name" placeholder="请输入网格名称" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="网格编号" name="gridCode">
              <Input v-model:value="gridForm.gridCode" placeholder="请输入网格编号" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="网格级别" name="gridLevel">
              <Select v-model:value="gridForm.gridLevel" placeholder="请选择级别" style="width: 100%">
                <SelectOption value="一级网格">一级网格</SelectOption>
                <SelectOption value="二级网格">二级网格</SelectOption>
                <SelectOption value="三级网格">三级网格</SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="职务" name="position">
              <Select v-model:value="gridForm.position" placeholder="请选择职务" style="width: 100%">
                <SelectOption value="网格长">网格长</SelectOption>
                <SelectOption value="网格员">网格员</SelectOption>
                <SelectOption value="巡查员">巡查员</SelectOption>
                <SelectOption value="安全员">安全员</SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="负责人（绑定员工）" name="personnelId">
              <Select
                v-model:value="gridForm.personnelId"
                :loading="employeeSearching"
                :show-search="true"
                :filter-option="false"
                :not-found-content="null"
                placeholder="搜索并选择员工"
                style="width: 100%"
                allow-clear
                :options="employeeOptions"
                @search="searchEmployees"
                @dropdown-visible-change="(v: boolean) => v && !gridForm.personnelId && searchEmployees('')"
              />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="联系电话" name="phone">
              <Input v-model:value="gridForm.phone" placeholder="请输入联系电话" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="所属乡镇" name="township">
              <Select
                v-model:value="gridForm.township"
                placeholder="请选择乡镇"
                style="width: 100%"
                :options="townshipOptions.map((t) => ({ label: t, value: t }))"
              />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="巡查频率" name="patrolFrequency">
              <Select v-model:value="gridForm.patrolFrequency" placeholder="请选择频率" style="width: 100%">
                <SelectOption value="每日一次">每日一次</SelectOption>
                <SelectOption value="每日两次">每日两次</SelectOption>
                <SelectOption value="每周一次">每周一次</SelectOption>
                <SelectOption value="每周两次">每周两次</SelectOption>
                <SelectOption value="每月一次">每月一次</SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="风险等级" name="riskLevel">
              <Select v-model:value="gridForm.riskLevel" placeholder="请选择风险等级" style="width: 100%">
                <SelectOption value="重大风险">重大风险</SelectOption>
                <SelectOption value="较大风险">较大风险</SelectOption>
                <SelectOption value="一般风险">一般风险</SelectOption>
                <SelectOption value="低风险">低风险</SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="状态" name="status">
              <Select v-model:value="gridForm.status" placeholder="请选择状态" style="width: 100%">
                <SelectOption value="在岗">在岗</SelectOption>
                <SelectOption value="离岗">离岗</SelectOption>
                <SelectOption value="休假">休假</SelectOption>
                <SelectOption value="调整">调整</SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="24">
            <FormItem label="区域范围" name="area">
              <Textarea v-model:value="gridForm.area" :rows="2" placeholder="请描述网格区域范围" />
            </FormItem>
          </Col>
          <Col :span="24">
            <FormItem label="备注" name="remarks">
              <Textarea v-model:value="gridForm.remarks" :rows="2" placeholder="其他需要说明的事项" />
            </FormItem>
          </Col>
        </Row>
      </Form>
    </Modal>

    <Drawer v-model:open="detailDrawerVisible" title="网格详情" width="720px">
      <template v-if="currentRecord">
        <div class="detail-section">
          <h3 class="detail-title">{{ currentRecord.name }}</h3>
          <Tag :color="getLevelColor(currentRecord.gridLevel)" class="mr-2">{{ currentRecord.gridLevel }}</Tag>
          <Tag :color="getStatusColor(currentRecord.status)" class="mr-2">{{ currentRecord.status }}</Tag>
          <Tag :color="getRiskColor(currentRecord.riskLevel)">{{ currentRecord.riskLevel }}</Tag>
        </div>
        <div class="detail-section">
          <Row :gutter="16">
            <Col :span="12">
              <div class="detail-row">
                <span class="detail-label">网格编号：</span>
                <span class="detail-value">{{ currentRecord.gridCode || '—' }}</span>
              </div>
            </Col>
            <Col :span="12">
              <div class="detail-row">
                <span class="detail-label">职务：</span>
                <span class="detail-value">{{ currentRecord.position || '—' }}</span>
              </div>
            </Col>
            <Col :span="12">
              <div class="detail-row">
                <span class="detail-label">绑定员工：</span>
                <span class="detail-value">
                  <template v-if="currentRecord.personnelId">
                    {{ (currentRecord.personnelId && bindNameMap[String(currentRecord.personnelId)])
                      ? bindNameMap[String(currentRecord.personnelId)]
                      : `已绑定员工 #${currentRecord.personnelId}` }}
                  </template>
                  <span v-else class="text-gray-400">未绑定</span>
                </span>
              </div>
            </Col>
            <Col :span="12">
              <div class="detail-row">
                <span class="detail-label">联系电话：</span>
                <span class="detail-value">{{ currentRecord.phone || '—' }}</span>
              </div>
            </Col>
            <Col :span="12">
              <div class="detail-row">
                <span class="detail-label">所属乡镇：</span>
                <span class="detail-value">{{ currentRecord.township || '—' }}</span>
              </div>
            </Col>
            <Col :span="12">
              <div class="detail-row">
                <span class="detail-label">巡查频率：</span>
                <span class="detail-value">{{ currentRecord.patrolFrequency || '—' }}</span>
              </div>
            </Col>
            <Col :span="24">
              <div class="detail-row">
                <span class="detail-label">完成率：</span>
                <span class="detail-value">
                  <Progress
                    :percent="currentRecord.completionRate ?? 0"
                    :size="'small'"
                    :status="getCompletionStatus(currentRecord.completionRate ?? 0)"
                    :stroke-color="getCompletionColor(currentRecord.completionRate ?? 0)"
                    :format="formatPercent"
                    style="width: 200px"
                  />
                </span>
              </div>
            </Col>
          </Row>
        </div>
        <div class="detail-section">
          <div class="detail-label">区域范围</div>
          <div class="detail-content">{{ currentRecord.area || '无' }}</div>
        </div>
        <div v-if="currentRecord.remarks" class="detail-section">
          <div class="detail-label">备注</div>
          <div class="detail-content">{{ currentRecord.remarks }}</div>
        </div>
      </template>
    </Drawer>

    <!-- 阶段6：网格三违记录入口（预留接口，当前展示 mock 数据） -->
    <Drawer
      v-model:open="violationDrawerVisible"
      :title="`${violationDrawerGrid?.name ?? ''} - 三违记录`"
      width="680px"
      @close="violationDrawerVisible = false"
    >
      <Table
        :columns="violationColumns"
        :data-source="violationList"
        :loading="violationLoading"
        size="small"
        :pagination="false"
        :row-key="(record) => record.id"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'violationBehavior'">
            <Tooltip :title="record.violationBehavior">
              <span class="violation-behavior-ellipsis">{{ record.violationBehavior }}</span>
            </Tooltip>
          </template>
          <template v-else-if="column.key === 'rectificationStatus'">
            <Tag :color="RECTIFICATION_STATUS_COLOR[record.rectificationStatus]">{{ record.rectificationStatus }}</Tag>
          </template>
        </template>
      </Table>
      <div class="violation-tip">
        数据联调开发中，当前展示为示例数据（TODO: 后期对接真实三违数据接口）
      </div>
    </Drawer>
  </Page>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from 'vue';
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
  Progress,
  Textarea,
  message,
  Popconfirm,
  Tooltip,
} from 'ant-design-vue';
import type { FormInstance } from 'ant-design-vue';
import { IconifyIcon } from '@vben/icons';
import { Page } from '@vben/common-ui';
import HseStatCard from '#/components/hse/StatCard.vue';
import ImportButtonGroup from '#/components/hse/ImportButtonGroup.vue';
import { useDataTable, useSearchForm } from '#/composables/hse';

import {
  getGridAreaList,
  getGridAreaFilterOptions,
  getSiteStats,
  createGridArea,
  updateGridArea,
  deleteGridArea,
  type SiteApi,
} from '#/api/hse/site';
import {
  getEmployeeSelectorList,
  getEmployeeSelectorBatch,
} from '#/api/hse/employee-selector';

// 动态筛选选项（阶段2：由后端 /grid-areas/filter-options 聚合返回，不再硬编码）
const filterOptions = ref<SiteApi.GridAreaFilterOptions>({
  gridLevels: [],
  townships: [],
  statuses: [],
  years: [],
  months: [],
});

// 模态框乡镇下拉复用动态选项（兜底空数组）
const townshipOptions = computed(() => filterOptions.value.townships || []);

// 表格数据/分页托管：使用项目标准 composable useDataTable
const {
  loading,
  dataList: gridList,
  total,
  pagination,
  fetchData,
  handleTableChange,
  handleReset: tableHandleReset,
} = useDataTable<SiteApi.GridArea>({
  fetchFn: async ({ page, pageSize }) => {
    const res = await getGridAreaList({
      page,
      pageSize,
      keyword: searchForm.keyword || undefined,
      gridLevel: searchForm.gridLevel,
      township: searchForm.township,
      status: searchForm.status,
      year: searchForm.year,
      month: searchForm.month,
    });
    return { list: res.list || [], total: res.total || 0 };
  },
  defaultPageSize: 10,
});
// 列表加载后批量回显绑定员工姓名（personnel_id → 姓名）
watch(
  () => gridList.value,
  (rows) => {
    attachBindNames((rows || []) as SiteApi.GridArea[]);
  },
);

// 搜索表单状态托管：使用项目标准 composable useSearchForm
const { form: searchForm, reset: resetSearch } = useSearchForm<{
  keyword: string;
  gridLevel: string | undefined;
  township: string | undefined;
  status: string | undefined;
  year: string | undefined;
  month: string | undefined;
}>({
  defaults: {
    keyword: '',
    gridLevel: undefined,
    township: undefined,
    status: undefined,
    year: undefined,
    month: undefined,
  },
  onSearch: () => tableHandleReset(),
});

const modalVisible = ref(false);
const modalLoading = ref(false);
const editingRecord = ref<SiteApi.GridArea | null>(null);
const gridForm = reactive<Partial<SiteApi.GridArea> & { gridPersonnel?: string }>({
  gridCode: '',
  gridLevel: '三级网格',
  name: '',
  position: '网格员',
  area: '',
  township: '',
  patrolFrequency: '每日一次',
  phone: '',
  completionRate: 100,
  riskLevel: '一般风险',
  remarks: '',
  status: '在岗',
  gridPersonnel: '',
  personnelId: null,
});

// 绑定员工姓名映射（grid_areas.personnel_id → 员工展示名），用于表格与详情回显
const bindNameMap = ref<Record<string, string>>({});
async function attachBindNames(rows: SiteApi.GridArea[]) {
  const ids = Array.from(
    new Set(rows.map((r) => r.personnelId).filter((v): v is number => typeof v === 'number' && !!v)),
  );
  if (!ids.length) {
    bindNameMap.value = {};
    return;
  }
  try {
    const list = await getEmployeeSelectorBatch(ids);
    const map: Record<string, string> = {};
    for (const it of list) {
      map[String(it.employee_id)] = it.unit_name || it.org_name
        ? `${it.name}（${it.unit_name || it.org_name}）`
        : it.name;
    }
    bindNameMap.value = map;
  } catch {
    bindNameMap.value = {};
  }
}

// 员工选择（远程搜索，网格负责人绑定 personnel_id）
const employeeOptions = ref<{ label: string; value: number }[]>([]);
const employeeSearching = ref(false);
async function searchEmployees(keyword: string) {
  employeeSearching.value = true;
  try {
    const list = await getEmployeeSelectorList({ keyword: keyword || undefined, limit: 20 });
    employeeOptions.value = (list || []).map((it) => ({
      label: it.unit_name || it.org_name
        ? `${it.name}（${it.unit_name || it.org_name}）`
        : it.name,
      value: it.employee_id,
    }));
  } catch {
    employeeOptions.value = [];
  } finally {
    employeeSearching.value = false;
  }
}
// 编辑时按 personnelId 回显员工姓名
async function hydratePersonnelName(personnelId: number | null) {
  if (!personnelId) {
    employeeOptions.value = [];
    return;
  }
  try {
    const list = await getEmployeeSelectorBatch([personnelId]);
    const it = list?.[0];
    if (it) {
      gridForm.personnelId = it.employee_id;
      employeeOptions.value = [
        {
          label: it.unit_name || it.org_name
            ? `${it.name}（${it.unit_name || it.org_name}）`
            : it.name,
          value: it.employee_id,
        },
      ];
    }
  } catch {
    /* ignore */
  }
}

const formRef = ref<FormInstance>();

const formRules = {
  name: [
    { required: true, message: '请输入网格名称', trigger: 'blur' },
    { min: 2, max: 50, message: '名称长度为2-50字符', trigger: 'blur' },
  ],
  gridCode: [{ required: true, message: '请输入网格编号', trigger: 'blur' }],
  gridLevel: [{ required: true, message: '请选择网格级别', trigger: 'change' }],
  position: [{ required: true, message: '请选择职务', trigger: 'change' }],
  township: [{ required: true, message: '请选择所属乡镇', trigger: 'change' }],
  status: [{ required: true, message: '请选择状态', trigger: 'change' }],
  phone: [{ required: true, message: '请输入联系电话', trigger: 'blur' }],
};

const detailDrawerVisible = ref(false);
const currentRecord = ref<SiteApi.GridArea | null>(null);

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
  { key: 'total', label: '网格总数', value: statsData.value.totalGridAreas, color: 'blue', icon: 'lucide:layout-grid' },
  { key: 'onDuty', label: '在岗人员', value: statsData.value.onDutyGridPersonnel, color: 'green', icon: 'lucide:users' },
  { key: 'avgRate', label: '平均完成率', value: statsData.value.avgCompletionRate + '%', color: 'cyan', icon: 'lucide:trending-up' },
  { key: 'avgCompletion', label: '网格级别', value: '三级', color: 'purple', icon: 'lucide:layers' },
]);

const columns = [
  { title: '序号', key: 'index', width: 70, align: 'center' as const, customRender: ({ index }: { index: number }) => (pagination.current - 1) * pagination.pageSize + index + 1 },
  { title: '网格编号', dataIndex: 'gridCode', key: 'gridCode', width: 100 },
  { title: '网格名称', dataIndex: 'name', key: 'name', width: 160, ellipsis: true },
  { title: '绑定员工', dataIndex: 'personnelId', key: 'personnelId', width: 200, ellipsis: true },
  { title: '网格级别', dataIndex: 'gridLevel', key: 'gridLevel', width: 100, align: 'center' as const },
  { title: '职务', dataIndex: 'position', key: 'position', width: 90, ellipsis: true },
  { title: '区域范围', dataIndex: 'area', key: 'area', width: 200, ellipsis: true },
  { title: '巡查频率', dataIndex: 'patrolFrequency', key: 'patrolFrequency', width: 100, align: 'center' as const },
  { title: '完成率', dataIndex: 'completionRate', key: 'completionRate', width: 140, align: 'center' as const },
  { title: '状态', dataIndex: 'status', key: 'status', width: 90, align: 'center' as const },
  { title: '操作', key: 'action', width: 240, align: 'center' as const, fixed: 'right' as const },
];

function getLevelColor(level: string) {
  const map: Record<string, string> = {
    '一级网格': 'red',
    '二级网格': 'orange',
    '三级网格': 'blue',
  };
  return map[level] || 'default';
}

function getStatusColor(status: string) {
  const map: Record<string, string> = {
    '在岗': 'green',
    '离岗': 'default',
    '休假': 'orange',
    '调整': 'blue',
  };
  return map[status] || 'default';
}

function getRiskColor(risk: string) {
  const map: Record<string, string> = {
    '重大风险': 'red',
    '较大风险': 'orange',
    '一般风险': 'blue',
    '低风险': 'green',
  };
  return map[risk] || 'default';
}

// 完成率颜色分级：<60% 红 / 60%~79% 橙 / ≥80% 绿
function getCompletionStatus(rate: number): 'exception' | 'normal' | 'success' {
  if (rate < 60) return 'exception';
  if (rate < 80) return 'normal';
  return 'success';
}

function getCompletionColor(rate: number): string {
  if (rate < 60) return '#ff4d4f';
  if (rate < 80) return '#faad14';
  return '#52c41a';
}

function formatPercent(percent?: number): string {
  return `${percent ?? 0}%`;
}

async function fetchStats(params?: { year?: number; month?: number }) {
  try {
    const res = await getSiteStats(params);
    Object.assign(statsData.value, res);
  } catch (err) {
    console.warn('获取统计数据失败:', err);
  }
}

function currentFilterParams(): { year?: number; month?: number } {
  const year = searchForm.year ? Number(searchForm.year) : undefined;
  const month = searchForm.month ? Number(searchForm.month) : undefined;
  return { year, month };
}

function handleSearch() {
  tableHandleReset();
  fetchStats(currentFilterParams());
}

function handleReset() {
  resetSearch();
  fetchStats();
}

function handleCreate() {
  editingRecord.value = null;
  Object.assign(gridForm, {
    gridCode: '',
    gridLevel: '三级网格',
    name: '',
    position: '网格员',
    area: '',
    township: '',
    patrolFrequency: '每日一次',
    phone: '',
    completionRate: 100,
    riskLevel: '一般风险',
    remarks: '',
    status: '在岗',
    gridPersonnel: '',
    personnelId: null,
  });
  employeeOptions.value = [];
  modalVisible.value = true;
}

function handleEdit(record: SiteApi.GridArea) {
  editingRecord.value = record;
  Object.assign(gridForm, { ...record, personnelId: record.personnelId ?? null });
  hydratePersonnelName(record.personnelId ?? null);
  modalVisible.value = true;
}

function handleView(record: SiteApi.GridArea) {
  currentRecord.value = record;
  detailDrawerVisible.value = true;
}

// ===== 阶段6：网格三违记录入口（预留接口，当前展示 mock 数据） =====

interface GridViolationMock {
  id: number;
  inspectionDate: string;
  inspectorName: string;
  violatorName: string;
  violationBehavior: string;
  violationType: string;
  rectificationStatus: '待整改' | '整改中' | '已整改';
}

const RECTIFICATION_STATUS_COLOR: Record<string, string> = {
  '待整改': 'red',
  '整改中': 'orange',
  '已整改': 'green',
};

const violationColumns = [
  { title: '检查日期', dataIndex: 'inspectionDate', key: 'inspectionDate', width: 100 },
  { title: '检查人', dataIndex: 'inspectorName', key: 'inspectorName', width: 90 },
  { title: '违章人', dataIndex: 'violatorName', key: 'violatorName', width: 90 },
  { title: '三违行为', dataIndex: 'violationBehavior', key: 'violationBehavior', width: 220 },
  { title: '三违类型', dataIndex: 'violationType', key: 'violationType', width: 110 },
  { title: '整改状态', dataIndex: 'rectificationStatus', key: 'rectificationStatus', width: 90 },
];

function getMockViolations(grid: SiteApi.GridArea | null): GridViolationMock[] {
  const completionRate = grid?.completionRate ?? 100;
  const pool: GridViolationMock[] = [
    {
      id: 1,
      inspectionDate: '2026-07-03',
      inspectorName: '王建国',
      violatorName: '李伟',
      violationBehavior: '在作业区域内未按规定佩戴安全帽，且未系好下颚带，存在高空坠物打击风险。',
      violationType: '违章指挥',
      rectificationStatus: '已整改',
    },
    {
      id: 2,
      inspectionDate: '2026-07-08',
      inspectorName: '赵敏',
      violatorName: '张强',
      violationBehavior: '配电箱未上锁、未悬挂警示标识，非电工人员可随意触碰，存在触电隐患。',
      violationType: '违章作业',
      rectificationStatus: '整改中',
    },
    {
      id: 3,
      inspectionDate: '2026-07-12',
      inspectorName: '王建国',
      violatorName: '陈晓东',
      violationBehavior: '高处作业未系安全带，且脚手架脚手板未满铺，存在高处坠落风险。',
      violationType: '违反劳动纪律',
      rectificationStatus: '待整改',
    },
    {
      id: 4,
      inspectionDate: '2026-07-15',
      inspectorName: '孙立',
      violatorName: '刘洋',
      violationBehavior: '消防通道被物料临时占用，宽度不足影响应急疏散，已现场督促清理。',
      violationType: '违章作业',
      rectificationStatus: '已整改',
    },
  ];
  // 完成率偏低时额外补充一条待整改记录，强化演示效果（基于网格 completionRate 构造）
  if (completionRate < 80) {
    pool.push({
      id: 5,
      inspectionDate: '2026-07-18',
      inspectorName: '赵敏',
      violatorName: '周涛',
      violationBehavior: '特种作业人员无证上岗操作起重设备，且未办理作业许可审批手续。',
      violationType: '违章指挥',
      rectificationStatus: '待整改',
    });
  }
  return pool;
}

const violationDrawerVisible = ref(false);
const violationDrawerGrid = ref<SiteApi.GridArea | null>(null);
const violationLoading = ref(false);
const violationList = ref<GridViolationMock[]>([]);

async function loadGridViolations(gridId: number) {
  // TODO[GRID_VIOLATION_INTEGRATION]: 后期对接三违数据接口
  // 接口规划：GET /api/violations/by-grid?gridId=xxx&year=xxx&month=xxx
  // 关联逻辑：通过 grid_inspection_records.violator_name + area_team + inspection_date
  //          关联 violations 表获取该网格下的三违详情
  // 当前返回 mock 数据演示 UI（不依赖真实后端）
  void gridId;
  violationLoading.value = true;
  try {
    violationList.value = getMockViolations(violationDrawerGrid.value);
  } finally {
    violationLoading.value = false;
  }
}

function handleViewViolations(record: SiteApi.GridArea) {
  violationDrawerGrid.value = record;
  violationDrawerVisible.value = true;
  loadGridViolations(record.id);
}

async function handleSave() {
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }
  modalLoading.value = true;
  try {
    const saveData = { ...gridForm };
    delete (saveData as any).gridPersonnel;
    saveData.personnelId = gridForm.personnelId ?? null;
    if (editingRecord.value) {
      await updateGridArea(editingRecord.value.id, saveData);
      message.success('更新成功');
    } else {
      await createGridArea(saveData);
      message.success('创建成功');
    }
    modalVisible.value = false;
    fetchData();
    fetchStats(currentFilterParams());
  } catch (err) {
    console.warn('保存失败:', err);
    message.error('保存失败');
  } finally {
    modalLoading.value = false;
  }
}

async function handleDelete(record: SiteApi.GridArea) {
  try {
    await deleteGridArea(record.id);
    message.success('删除成功');
    fetchData();
    fetchStats(currentFilterParams());
  } catch (err) {
    console.warn('删除失败:', err);
    message.error('删除失败');
  }
}

// 拉取动态筛选选项（网格级别/乡镇/状态 + 检查记录年/月）
async function fetchFilterOptions() {
  try {
    const res = await getGridAreaFilterOptions();
    filterOptions.value = {
      gridLevels: res.gridLevels || [],
      townships: res.townships || [],
      statuses: res.statuses || [],
      years: res.years || [],
      months: res.months || [],
    };
  } catch (err) {
    console.warn('获取筛选选项失败:', err);
  }
}

onMounted(() => {
  fetchData();
  fetchStats();
  fetchFilterOptions();
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
  min-width: 100px;
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
.violation-behavior-ellipsis {
  display: inline-block;
  max-width: 200px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  vertical-align: bottom;
}
.violation-tip {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px dashed hsl(var(--border));
  color: hsl(var(--muted-foreground));
  font-size: 12px;
  line-height: 1.6;
}
</style>
