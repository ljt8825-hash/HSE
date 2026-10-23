<template>
  <Page auto-content-height class="hse-page">
    <Row v-if="statsLoading" :gutter="[16, 16]" class="mb-4">
      <Col :xs="24" :sm="12" :md="8" :lg="6" :xl="6" v-for="i in 4" :key="`skel-${i}`">
        <Card :bordered="false">
          <Skeleton active :paragraph="{ rows: 2 }" />
        </Card>
      </Col>
    </Row>
    <Row v-else :gutter="[16, 16]" class="mb-4">
      <Col :xs="24" :sm="12" :md="8" :lg="6" :xl="6" v-for="stat in statItems" :key="stat.key">
        <HseStatCard
          :title="stat.label"
          :value="stat.value"
          :icon="stat.icon"
          :color="(stat.color as any)"
          :clickable="stat.key === 'signed' || stat.key === 'unsigned'"
          @click="handleStatClick(stat)"
        />
      </Col>
    </Row>

    <Card :bordered="false">
      <template #title>
        <div class="card-header">
          <span>目标责任书管理</span>
          <div class="header-buttons">
            <Space :size="8">
              <Radio.Group v-model:value="viewMode" size="small" button-style="solid">
                <RadioButton value="list">
                  <IconifyIcon icon="lucide:list" class="mr-1 align-[-2px]" />
                  列表
                </RadioButton>
                <RadioButton value="card">
                  <IconifyIcon icon="lucide:layout-grid" class="mr-1 align-[-2px]" />
                  卡片
                </RadioButton>
              </Radio.Group>
              <Button @click="handleDownloadTemplate">
                <template #icon><IconifyIcon icon="lucide:download" /></template>
                下载模板
              </Button>
              <Button type="primary" @click="showImportModal = true">
                <template #icon><IconifyIcon icon="lucide:upload" /></template>
                导入数据
              </Button>
              <Button type="primary" @click="openCreateModal">
                <template #icon><IconifyIcon icon="lucide:plus" /></template>
                新增/录入责任书
              </Button>
              <Button @click="openDiffModal">
                <template #icon><IconifyIcon icon="lucide:git-compare" /></template>
                对账差异
              </Button>
              <HelpButton menuCode="HSE_GOALS" />
            </Space>
          </div>
        </div>
      </template>

      <Form layout="inline" class="filter-form">
        <FormItem label="关键词">
          <Input
            v-model:value="search.form.keyword"
            placeholder="员工编号 / 姓名"
            allow-clear
            style="width: 200px"
            @change="handleSearch"
          />
        </FormItem>
        <FormItem label="所属部门">
          <Select
            v-model:value="search.form.department"
            placeholder="全部部门"
            allow-clear
            style="width: 180px"
            @change="handleSearch"
          >
            <SelectOption v-for="d in departmentOptions" :key="d" :value="d">
              {{ d }}
            </SelectOption>
          </Select>
        </FormItem>
        <FormItem label="签订情况">
          <Select
            v-model:value="search.form.signStatus"
            placeholder="全部"
            allow-clear
            style="width: 140px"
            @change="handleSearch"
          >
            <SelectOption value="signed">已签订</SelectOption>
            <SelectOption value="unsigned">未签订</SelectOption>
            <SelectOption value="unsigned_no_source">未签订·无源</SelectOption>
          </Select>
        </FormItem>
        <FormItem>
          <Button @click="handleReset">重置</Button>
        </FormItem>
      </Form>

      <Table
        v-if="viewMode === 'list'"
        :columns="columns"
        :data-source="table.dataList"
        :loading="table.loading"
        :pagination="table.pagination"
        :row-key="(record) => record.employeeId"
        @change="table.handleTableChange"
        size="middle"
        :scroll="{ x: 1240 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'signStatus'">
            <Tag v-if="record.signStatus === 'signed'" color="green">已签订</Tag>
            <Tag v-else-if="record.noSourceRecord" color="default">未签订·无源</Tag>
            <Tag v-else color="red">未签订</Tag>
          </template>
          <template v-else-if="column.key === 'hireDate'">
            {{ record.hireDate ? dayjs(record.hireDate).format('YYYY-MM-DD') : '—' }}
          </template>
          <template v-else-if="column.key === 'supervisor'">
            {{ record.supervisor || '—' }}
          </template>
          <template v-else-if="column.key === 'team'">
            {{ record.team || '—' }}
          </template>
          <template v-else-if="column.key === 'operation'">
            <Space :size="8" class="operation-cell">
              <Button type="link" size="small" @click="handleView(record)">
                <template #icon><IconifyIcon icon="lucide:eye" /></template>
                查看
              </Button>
              <Button type="link" size="small" @click="handleEditMenu(record)">
                <template #icon><IconifyIcon icon="lucide:pencil" /></template>
                {{ record.contractId ? '编辑' : '录入' }}
              </Button>
              <Popconfirm
                v-if="record.contractId"
                title="确认删除该责任书？"
                ok-text="删除"
                cancel-text="取消"
                ok-type="danger"
                @confirm="handleDelete(record)"
              >
                <Button type="link" size="small" danger>
                  <template #icon><IconifyIcon icon="lucide:trash-2" /></template>
                  删除
                </Button>
              </Popconfirm>
            </Space>
          </template>
        </template>
      </Table>

      <!-- 卡片视图 -->
      <div v-if="viewMode === 'card'" class="resp-card-grid">
        <Empty v-if="!table.loading && !table.dataList.length" description="暂无数据" class="py-12" />
        <template v-else>
          <Spin :spinning="table.loading">
            <Row :gutter="[16, 16]" class="card-grid">
              <Col
                v-for="record in table.dataList"
                :key="record.employeeId"
                :xs="24"
                :sm="12"
                :lg="8"
                :xl="6"
              >
                <Card
                  :bordered="false"
                  class="resp-card"
                  :class="{
                    'resp-card-signed': record.signStatus === 'signed',
                    'resp-card-unsigned': record.signStatus !== 'signed',
                  }"
                >
                  <div class="resp-card-head">
                    <div class="resp-card-name">
                      <span class="resp-card-emp">{{ record.name }}</span>
                      <span class="resp-card-code">{{ record.employeeCode }}</span>
                    </div>
                    <Tag v-if="record.noSourceRecord && record.signStatus !== 'signed'" color="default">
                      未签订·无源
                    </Tag>
                    <Tag v-else :color="record.signStatus === 'signed' ? 'green' : 'red'">
                      {{ SIGN_TEXT[record.signStatus] || record.signStatus }}
                    </Tag>
                  </div>
                  <Descriptions :column="1" size="small" class="resp-card-desc">
                    <DescriptionsItem label="所属部门">{{ record.department || '-' }}</DescriptionsItem>
                    <DescriptionsItem label="班组">{{ record.team || '-' }}</DescriptionsItem>
                    <DescriptionsItem label="职位">{{ record.position || '-' }}</DescriptionsItem>
                    <DescriptionsItem label="直接上级">{{ record.supervisor || '-' }}</DescriptionsItem>
                    <DescriptionsItem label="入职日期">
                      {{ record.hireDate ? dayjs(record.hireDate).format('YYYY-MM-DD') : '-' }}
                    </DescriptionsItem>
                  </Descriptions>
                  <div class="resp-card-actions">
                    <Space :size="8">
                      <Button type="link" size="small" @click="handleView(record)">查看</Button>
                      <Button type="link" size="small" @click="handleEditMenu(record)">
                        {{ record.contractId ? '编辑' : '录入' }}
                      </Button>
                      <Popconfirm
                        v-if="record.contractId"
                        title="确认删除该责任书？"
                        ok-text="删除"
                        cancel-text="取消"
                        ok-type="danger"
                        @confirm="handleDelete(record)"
                      >
                        <Button type="link" size="small" danger>删除</Button>
                      </Popconfirm>
                    </Space>
                  </div>
                </Card>
              </Col>
            </Row>
          </Spin>
          <div class="mt-4 flex justify-end">
            <Pagination
              :current="table.pagination?.current || 1"
              :page-size="table.pagination?.pageSize || 10"
              :total="table.pagination?.total || 0"
              show-size-changer
              show-quick-jumper
              :show-total="(t: number) => `共 ${t} 条记录`"
              @change="(page: number, pageSize: number) => table.handleTableChange({ current: page, pageSize })"
            />
          </div>
        </template>
      </div>
    </Card>

    <!-- 新增/录入责任书 -->
    <Modal
      v-model:open="showFormModal"
      :title="formMode === 'edit' ? '编辑责任书' : '新增/录入责任书'"
      :confirm-loading="creating"
      :mask-closable="false"
      ok-text="保存"
      cancel-text="取消"
      width="560px"
      @ok="handleCreateSubmit"
      @cancel="closeFormModal"
    >
      <Form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }" class="mt-4">
        <FormItem label="员工" required>
          <Select
            v-model:value="form.employeeId"
            show-search
            :filter-option="false"
            :disabled="formMode === 'edit'"
            :options="employeeSelectOptions"
            placeholder="输入员工编号 / 姓名 / 身份证号检索"
            @search="handleEmpSearch"
            @change="handleEmpChange"
          />
        </FormItem>
        <FormItem label="责任书标题">
          <Input v-model:value="form.title" placeholder="留空则自动生成：{姓名} 目标责任书" />
        </FormItem>
        <FormItem label="责任书类型">
          <Select v-model:value="form.contractType">
            <SelectOption value="目标责任书">目标责任书</SelectOption>
            <SelectOption value="安全生产责任书">安全生产责任书</SelectOption>
            <SelectOption value="岗位责任书">岗位责任书</SelectOption>
          </Select>
        </FormItem>
        <FormItem label="签订状态" required>
          <Select v-model:value="form.status">
            <SelectOption value="signed">已签订</SelectOption>
            <SelectOption value="unsigned">未签订</SelectOption>
          </Select>
        </FormItem>
        <FormItem label="签订日期">
          <DatePicker
            v-model:value="form.signDate"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"
            style="width: 100%"
            placeholder="选择签订日期"
          />
        </FormItem>
      </Form>
    </Modal>

    <!-- 查看责任书 -->
    <Modal
      v-model:open="showViewModal"
      title="查看责任书"
      :footer="null"
      :mask-closable="true"
      width="560px"
      @cancel="showViewModal = false"
    >
      <Descriptions :column="1" bordered class="mt-4" size="middle" v-if="viewDetail">
        <DescriptionsItem label="员工编号">{{ viewDetail.employeeCode || '-' }}</DescriptionsItem>
        <DescriptionsItem label="姓名">{{ viewDetail.name || '-' }}</DescriptionsItem>
        <DescriptionsItem label="所属部门">{{ viewDetail.department || '-' }}</DescriptionsItem>
        <DescriptionsItem label="班组">{{ viewDetail.team || '-' }}</DescriptionsItem>
        <DescriptionsItem label="职位">{{ viewDetail.position || '-' }}</DescriptionsItem>
        <DescriptionsItem label="直接上级">{{ viewDetail.supervisor || '-' }}</DescriptionsItem>
        <DescriptionsItem label="责任书标题">{{ viewDetail.title || '-' }}</DescriptionsItem>
        <DescriptionsItem label="责任书类型">{{ viewDetail.contractType || '-' }}</DescriptionsItem>
        <DescriptionsItem label="签订情况">
          <Tag :color="viewDetail.status === 'signed' ? 'green' : 'red'">
            {{ viewDetail.status === 'signed' ? '已签订' : '未签订' }}
          </Tag>
        </DescriptionsItem>
        <DescriptionsItem label="签订日期">{{ viewDetail.signDate || '-' }}</DescriptionsItem>
      </Descriptions>
    </Modal>

    <!-- 导入数据 -->
    <Modal
      v-model:open="showImportModal"
      title="导入责任书签订数据"
      :confirm-loading="importing"
      :mask-closable="false"
      ok-text="开始导入"
      cancel-text="关闭"
      width="560px"
      @ok="handleImport"
    >
      <div class="mb-3">
        <Button type="link" :style="{ paddingLeft: 0 }" @click="handleDownloadTemplate">下载导入模板</Button>
        <span :style="{ color: 'var(--muted-foreground)', fontSize: '12px' }">
          （按 员工编号 / 姓名 / 身份证号 匹配花名册，其余列为花名册数据）
        </span>
      </div>
      <Upload :before-upload="beforeUpload" :show-upload-list="false" accept=".xlsx,.xls,.csv">
        <Button>选择文件（.xlsx / .xls / .csv）</Button>
      </Upload>
      <div v-if="importFile" class="mt-2">已选择：{{ importFile.name }}</div>
      <Alert
        v-if="importResult"
        class="mt-3"
        type="success"
        show-icon
        :message="`导入完成：新增 ${importResult.inserted} 条，更新 ${importResult.updated} 条，未匹配 ${importResult.unmatched} 条（共 ${importResult.total} 行）`"
      >
        <template v-if="importResult.unmatchedSamples.length" #description>
          <div>未匹配样例：</div>
          <div v-for="(s, i) in importResult.unmatchedSamples" :key="i">
            {{ s.employeeCode || s.name || s.idCard || '（无标识）' }}
          </div>
        </template>
      </Alert>
    </Modal>

    <!-- 对账差异 -->
    <Modal
      v-model:open="showDiffModal"
      title="对账差异（源文件有、但不在职花名册）"
      :footer="null"
      :mask-closable="true"
      width="680px"
      @cancel="showDiffModal = false"
    >
      <Alert
        v-if="!diffLoading"
        class="mb-3"
        type="info"
        show-icon
        :message="`共 ${diffTotal} 条：以下人员出现在导入源文件中，但不在当前在职花名册内，按口径视为已离职，未导入责任书。`"
      />
      <Table
        :columns="diffColumns"
        :data-source="diffList"
        :loading="diffLoading"
        :pagination="{ pageSize: 10, showTotal: (t: number) => `共 ${t} 条` }"
        size="middle"
        :scroll="{ x: 620 }"
        row-key="employeeCode"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'sourceSigned'">
            <Tag :color="record.sourceSigned ? 'green' : 'red'">
              {{ record.sourceSigned ? '已签订' : '未签订' }}
            </Tag>
          </template>
          <template v-else-if="column.key === 'idCard'">
            {{ record.idCard || '-' }}
          </template>
        </template>
      </Table>
    </Modal>
  </Page>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { IconifyIcon } from '@vben/icons';
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
  Tag,
  Skeleton,
  Space,
  Modal,
  Popconfirm,
  Upload,
  DatePicker,
  Alert,
  Descriptions,
  DescriptionsItem,
  Radio,
  RadioButton,
  Empty,
  Pagination,
  message,
} from 'ant-design-vue';
import dayjs from 'dayjs';
import { Page } from '@vben/common-ui';
import { HelpButton } from '#/components/hse';
import HseStatCard from '#/components/hse/StatCard.vue';
import { useSearchForm, useDataTable } from '#/composables/hse';
import {
  getResponsibilityRoster,
  getResponsibilityRosterStats,
  getRosterDepartments,
  lookupEmployees,
  createResponsibility,
  getResponsibility,
  updateResponsibility,
  deleteResponsibility,
  downloadResponsibilityTemplate,
  importResponsibility,
  getResponsibilityUnmatched,
  type ResponsibilityRosterApi,
} from '#/api/hse/goals';

const statsLoading = ref(false);

/** 列表/卡片双视图切换 */
const viewMode = ref<'list' | 'card'>('list');
const SIGN_TEXT: Record<string, string> = { signed: '已签订', unsigned: '未签订' };

const search = useSearchForm({
  defaults: {
    keyword: '',
    department: undefined as string | undefined,
    signStatus: undefined as string | undefined,
  },
  onSearch: () => table.handleReset(),
});

const table = reactive(
  useDataTable<ResponsibilityRosterApi.RosterItem>({
    fetchFn: async ({ page, pageSize }) => {
      await fetchStats();
      const params: ResponsibilityRosterApi.RosterListParams = {
        page,
        pageSize,
        keyword: search.form.keyword || undefined,
        department: search.form.department,
        signStatus: (search.form.signStatus as ResponsibilityRosterApi.RosterListParams['signStatus']) || undefined,
      };
      return getResponsibilityRoster(params);
    },
    defaultPageSize: 10,
    paginationExtra: {
      showSizeChanger: true,
      showQuickJumper: true,
      showTotal: (t: number) => `共 ${t} 条记录`,
    },
  }),
);

const departmentOptions = ref<string[]>([]);

const statsData = ref({
  total: 0,
  signed: 0,
  unsigned: 0,
  signRate: 0,
});

const statItems = computed(() => [
  { key: 'total', label: '员工总数', value: statsData.value.total, color: 'blue', icon: 'lucide:users' },
  { key: 'signed', label: '已签订', value: statsData.value.signed, color: 'green', icon: 'lucide:check-circle-2' },
  { key: 'unsigned', label: '未签订', value: statsData.value.unsigned, color: 'red', icon: 'lucide:circle-slash' },
  {
    key: 'signRate',
    label: '签订率',
    value: `${statsData.value.signRate}%`,
    color: 'orange',
    icon: 'lucide:bar-chart-3',
  },
]);

const columns = [
  { title: '员工编号', dataIndex: 'employeeCode', key: 'employeeCode', width: 120 },
  { title: '姓名', dataIndex: 'name', key: 'name', width: 100, ellipsis: true },
  { title: '所属部门', dataIndex: 'department', key: 'department', width: 160, ellipsis: true },
  { title: '班组', dataIndex: 'team', key: 'team', width: 120, ellipsis: true },
  { title: '职位', dataIndex: 'position', key: 'position', width: 120, ellipsis: true },
  { title: '入职日期', dataIndex: 'hireDate', key: 'hireDate', width: 120, align: 'center' as const },
  { title: '直接上级', dataIndex: 'supervisor', key: 'supervisor', width: 120, ellipsis: true },
  { title: '责任书签订情况', key: 'signStatus', width: 150, align: 'center' as const },
  { title: '操作', key: 'operation', width: 160, align: 'center' as const, fixed: 'right' as const },
];

const diffColumns = [
  { title: '员工编码', dataIndex: 'employeeCode', key: 'employeeCode', width: 120 },
  { title: '姓名', dataIndex: 'name', key: 'name', width: 100 },
  { title: '身份证号', dataIndex: 'idCard', key: 'idCard', width: 180 },
  { title: '源目标责任书', key: 'sourceSigned', width: 110 },
  { title: '说明', dataIndex: 'reason', key: 'reason', width: 200 },
];

const showDiffModal = ref(false);
const diffLoading = ref(false);
const diffList = ref<ResponsibilityRosterApi.UnmatchedItem[]>([]);
const diffTotal = ref(0);

async function openDiffModal() {
  showDiffModal.value = true;
  await fetchDiff();
}

async function fetchDiff() {
  diffLoading.value = true;
  try {
    const res = await getResponsibilityUnmatched();
    diffList.value = res.list;
    diffTotal.value = res.total;
  } catch (err: any) {
    message.error(err?.message || '获取对账差异失败');
  } finally {
    diffLoading.value = false;
  }
}

// ============ 新增/编辑责任书 ============
const showFormModal = ref(false);
const creating = ref(false);
const formMode = ref<'create' | 'edit'>('create');
const editingContractId = ref<number | null>(null);
const employeeOptions = ref<ResponsibilityRosterApi.EmployeeOption[]>([]);
const form = reactive({
  employeeId: undefined as number | undefined,
  employeeCode: '',
  employeeName: '',
  title: '',
  contractType: '目标责任书',
  status: 'signed' as 'signed' | 'unsigned',
  signDate: '' as string,
});

const employeeSelectOptions = computed(() =>
  employeeOptions.value.map((o) => ({
    value: o.employeeId,
    label: `${o.employeeCode} - ${o.name}${o.department ? `（${o.department}）` : ''}`,
  })),
);

function openCreateModal() {
  formMode.value = 'create';
  editingContractId.value = null;
  resetForm();
  showFormModal.value = true;
}

function openCreateModalForRow(item: ResponsibilityRosterApi.RosterItem) {
  formMode.value = 'create';
  editingContractId.value = null;
  resetForm();
  form.employeeId = item.employeeId;
  form.employeeCode = item.employeeCode || '';
  form.employeeName = item.name;
  employeeOptions.value = [
    {
      employeeId: item.employeeId,
      employeeCode: item.employeeCode || '',
      name: item.name,
      idCard: null,
      department: item.department,
      position: item.position,
    },
  ];
  showFormModal.value = true;
}

function closeFormModal() {
  showFormModal.value = false;
  resetForm();
}

async function handleEmpSearch(keyword: string) {
  if (!keyword) {
    employeeOptions.value = [];
    return;
  }
  try {
    employeeOptions.value = await lookupEmployees(keyword);
  } catch (err) {
    console.warn('员工检索失败:', err);
  }
}

function handleEmpChange(value: any) {
  const id = value as number;
  const opt = employeeOptions.value.find((o) => o.employeeId === id);
  form.employeeId = id;
  form.employeeName = opt?.name || '';
  form.employeeCode = opt?.employeeCode || '';
}

function resetForm() {
  form.employeeId = undefined;
  form.employeeCode = '';
  form.employeeName = '';
  form.title = '';
  form.contractType = '目标责任书';
  form.status = 'signed';
  form.signDate = '';
  employeeOptions.value = [];
}

async function handleCreateSubmit() {
  if (formMode.value === 'create' && !form.employeeId) {
    message.error('请先选择员工');
    return;
  }
  creating.value = true;
  try {
    if (formMode.value === 'edit' && editingContractId.value) {
      await updateResponsibility(editingContractId.value, {
        title: form.title || undefined,
        contractType: form.contractType,
        status: form.status,
        signDate: form.signDate || null,
      });
      message.success('责任书更新成功');
    } else {
      await createResponsibility({
        employeeId: form.employeeId,
        title: form.title || undefined,
        contractType: form.contractType,
        status: form.status,
        signDate: form.signDate || null,
      });
      message.success('责任书保存成功');
    }
    showFormModal.value = false;
    resetForm();
    await table.fetchData();
  } catch (err: any) {
    message.error(err?.message || '保存失败');
  } finally {
    creating.value = false;
  }
}

// ============ 查看 ============
const showViewModal = ref(false);
const viewDetail = ref<ResponsibilityRosterApi.ResponsibilityDetail | null>(null);

async function handleView(record: any) {
  const item = record as ResponsibilityRosterApi.RosterItem;
  if (!item.contractId) {
    message.info('该员工尚未录入责任书记录');
    return;
  }
  try {
    viewDetail.value = await getResponsibility(item.contractId);
    showViewModal.value = true;
  } catch (err: any) {
    message.error(err?.message || '查看失败');
  }
}

// ============ 编辑 ============
async function handleEditMenu(record: any) {
  const item = record as ResponsibilityRosterApi.RosterItem;
  if (!item.contractId) {
    openCreateModalForRow(item);
    return;
  }
  await handleEdit(record);
}

async function handleEdit(record: any) {
  const item = record as ResponsibilityRosterApi.RosterItem;
  if (!item.contractId) {
    message.info('该员工尚未录入责任书记录，无法编辑');
    return;
  }
  try {
    const detail = await getResponsibility(item.contractId);
    formMode.value = 'edit';
    editingContractId.value = detail.contractId;
    form.employeeId = detail.employeeId;
    form.employeeCode = detail.employeeCode;
    form.employeeName = detail.name;
    form.title = detail.title || '';
    form.contractType = detail.contractType || '目标责任书';
    form.status = detail.status;
    form.signDate = detail.signDate || '';
    employeeOptions.value = [{
      employeeId: detail.employeeId,
      employeeCode: detail.employeeCode,
      name: detail.name,
      idCard: null,
      department: detail.department,
      position: detail.position,
    }];
    showFormModal.value = true;
  } catch (err: any) {
    message.error(err?.message || '获取详情失败');
  }
}

// ============ 删除 ============
function handleDelete(record: any) {
  const item = record as ResponsibilityRosterApi.RosterItem;
  if (!item.contractId) {
    message.info('该员工尚未录入责任书记录');
    return;
  }
  deleteResponsibility(item.contractId as number)
    .then(() => {
      message.success('删除成功');
      table.fetchData();
    })
    .catch((err: any) => {
      message.error(err?.message || '删除失败');
    });
}

// ============ 导入数据 ============
const showImportModal = ref(false);
const importing = ref(false);
const importFile = ref<File | null>(null);
const importResult = ref<ResponsibilityRosterApi.ImportResult | null>(null);

function beforeUpload(file: File) {
  importFile.value = file;
  return false;
}

async function handleImport() {
  if (!importFile.value) {
    message.error('请先选择文件');
    return;
  }
  importing.value = true;
  importResult.value = null;
  try {
    const res = await importResponsibility(importFile.value);
    importResult.value = res;
    message.success(`导入完成：新增 ${res.inserted}，更新 ${res.updated}，未匹配 ${res.unmatched}`);
    await table.fetchData();
  } catch (err: any) {
    message.error(err?.message || '导入失败');
  } finally {
    importing.value = false;
  }
}

async function handleDownloadTemplate() {
  try {
    const blob = await downloadResponsibilityTemplate();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '责任书签订台账导入模板.xlsx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.warn('下载模板失败:', err);
    message.error('下载模板失败');
  }
}

async function fetchStats() {
  statsLoading.value = true;
  try {
    const res = await getResponsibilityRosterStats({
      keyword: search.form.keyword || undefined,
      department: search.form.department,
      signStatus: (search.form.signStatus as string) || undefined,
    });
    statsData.value = {
      total: res.total,
      signed: res.signed,
      unsigned: res.unsigned,
      signRate: res.signRate,
    };
  } catch (err) {
    console.warn('获取签订统计失败:', err);
    message.error('获取签订统计失败');
  } finally {
    statsLoading.value = false;
  }
}

async function loadDepartments() {
  try {
    departmentOptions.value = await getRosterDepartments();
  } catch (err) {
    console.warn('获取部门选项失败:', err);
  }
}

function handleSearch() {
  table.handleReset();
}

/** 点击统计卡片联动筛选器：已签订/未签订 → 设置签订情况筛选（再次点击取消） */
function handleStatClick(stat: { key: string }) {
  if (stat.key !== 'signed' && stat.key !== 'unsigned') return;
  const next = search.form.signStatus === stat.key ? undefined : (stat.key as 'signed' | 'unsigned');
  search.form.signStatus = next;
  table.handleReset();
}

function handleReset() {
  search.reset();
}

onMounted(async () => {
  await loadDepartments();
  await table.fetchData();
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

  .header-buttons {
    display: flex;
    gap: 8px;
  }

  .filter-form {
    margin-bottom: 16px;
    padding-bottom: 16px;
    border-bottom: 1px solid hsl(var(--border));
  }

  .resp-card-grid {
    min-height: 120px;
  }

  .resp-card {
    border: 1px solid hsl(var(--border));
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
    transition: box-shadow 0.2s ease, transform 0.2s ease;
    height: 100%;

    &:hover {
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08);
      transform: translateY(-2px);
    }
  }

  .resp-card-signed {
    border-left: 3px solid #52c41a;
  }

  .resp-card-unsigned {
    border-left: 3px solid #ff4d4f;
  }

  .resp-card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 12px;
  }

  .resp-card-name {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
  }

  .resp-card-emp {
    font-size: 16px;
    font-weight: 600;
    color: hsl(var(--foreground));
  }

  .resp-card-code {
    font-size: 12px;
    color: hsl(var(--muted-foreground));
  }

  .resp-card-desc {
    margin-bottom: 8px;
  }

  .resp-card-actions {
    padding-top: 8px;
    border-top: 1px dashed hsl(var(--border));

    .ant-btn-link {
      padding: 0;
      height: 24px;
    }
  }

  .operation-cell {
    white-space: nowrap;
  }
}
</style>
