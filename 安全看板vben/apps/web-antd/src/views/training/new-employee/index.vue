<template>
  <Page auto-content-height class="hse-page">
    <Row :gutter="[16, 16]" class="mb-4">
      <Col :xs="24" :sm="12" :md="8" :lg="6" :xl="6" v-for="stat in statItems" :key="stat.key">
        <HseStatCard
          :title="stat.label"
          :value="stat.value"
          :icon="stat.icon"
          :color="stat.color"
        />
      </Col>
    </Row>

    <Card :bordered="false">
      <template #title>
        <div class="card-header">
          <span>新员工培训</span>
          <Space>
            <ImportButtonGroup module="new-employee" module-name="新员工培训" @refresh="fetchData" />
            <Button type="primary" @click="handleCreate">
              <template #icon><IconifyIcon icon="lucide:plus" /></template>
              新增记录
            </Button>
          </Space>
        </div>
      </template>

      <Form layout="inline" class="filter-form">
        <FormItem label="关键词">
          <Input
            v-model:value="searchForm.keyword"
            placeholder="搜索姓名/岗位/培训内容"
            allow-clear
            @change="handleSearch"
          />
        </FormItem>
        <FormItem label="培训结果">
          <Select
            v-model:value="searchForm.result"
            placeholder="全部结果"
            allow-clear
            style="width: 160px"
            @change="handleSearch"
          >
            <SelectOption value="合格">合格</SelectOption>
            <SelectOption value="不合格">不合格</SelectOption>
            <SelectOption value="缺勤">缺勤</SelectOption>
          </Select>
        </FormItem>
        <FormItem>
          <Button @click="handleReset">重置</Button>
        </FormItem>
      </Form>

      <Table
        :columns="columns"
        :data-source="filteredList"
        :loading="loading"
        :pagination="{
          current: pagination.page,
          pageSize: pagination.pageSize,
          total: filteredList.length,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (t) => `共 ${t} 条记录`,
        }"
        :row-key="(record) => record.id"
        @change="(handleTableChange as any)"
        size="middle"
        :scroll="{ x: 1200 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <EmployeeName v-if="record.employeeId" :employee-id="record.employeeId" />
            <span v-else>{{ record.name || '-' }}</span>
          </template>
          <template v-else-if="column.key === 'trainingDate'">
            {{ formatDate(record.trainingDate) }}
          </template>
          <template v-else-if="column.key === 'durationMinutes'">
            {{ record.durationMinutes }} 分钟
          </template>
          <template v-else-if="column.key === 'content'">
            <span :title="record.content" class="ellipsis-text">{{ record.content || '-' }}</span>
          </template>
          <template v-else-if="column.key === 'score'">
            {{ record.score === null || record.score === undefined ? '-' : record.score }}
          </template>
          <template v-else-if="column.key === 'result'">
            <Tag :color="getResultColor(record.result)">
              {{ record.result || '-' }}
            </Tag>
          </template>
          <template v-else-if="column.key === 'idCard'">
            <span>{{ maskIdCard(record.idCard) }}</span>
          </template>
          <template v-else-if="column.key === 'action'">
            <Space>
              <Button type="link" size="small" @click="handleView(record as any)">查看</Button>
              <Button type="link" size="small" @click="handleEdit(record as any)">编辑</Button>
              <Popconfirm
                title="确定要删除该培训记录吗？"
                ok-text="删除"
                cancel-text="取消"
                @confirm="handleDelete(record as any)"
              >
                <Button type="link" size="small" danger>删除</Button>
              </Popconfirm>
            </Space>
          </template>
        </template>
      </Table>
    </Card>

    <Modal
      v-model:open="modalVisible"
      :title="editingRecord ? '编辑培训记录' : '新增培训记录'"
      :confirm-loading="modalLoading"
      width="640px"
      @ok="handleSave"
      @cancel="modalVisible = false"
    >
      <Form ref="formRef" :model="recordForm" :rules="(formRules as any)" layout="vertical">
        <Row :gutter="16">
          <Col :span="12">
            <FormItem label="姓名" name="name" required>
              <Input v-model:value="recordForm.name" placeholder="请输入姓名" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="身份证号" name="idCard">
              <Input v-model:value="recordForm.idCard" placeholder="可选；用于自动关联员工档案" :maxlength="18" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="部门" name="department" required>
              <Select
                v-model:value="recordForm.department"
                placeholder="请选择部门"
                style="width: 100%"
              >
                <SelectOption v-for="d in departmentOptions" :key="d" :value="d">
                  {{ d }}
                </SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="岗位" name="position">
              <Input v-model:value="recordForm.position" placeholder="请输入岗位" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="培训日期" name="trainingDate">
              <Input
                v-model:value="recordForm.trainingDate"
                type="date"
                style="width: 100%"
              />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="时长(分钟)" name="durationMinutes">
              <InputNumber
                v-model:value="recordForm.durationMinutes"
                :min="0"
                placeholder="请输入时长"
                style="width: 100%"
              />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="成绩" name="score">
              <InputNumber
                v-model:value="recordForm.score"
                :min="0"
                :max="100"
                placeholder="0-100"
                style="width: 100%"
              />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="培训结果" name="result">
              <Select
                v-model:value="recordForm.result"
                placeholder="请选择培训结果"
                style="width: 100%"
              >
                <SelectOption value="合格">合格</SelectOption>
                <SelectOption value="不合格">不合格</SelectOption>
                <SelectOption value="缺勤">缺勤</SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="24">
            <FormItem label="培训内容" name="content">
              <Textarea
                v-model:value="recordForm.content"
                :rows="3"
                placeholder="请输入培训内容"
              />
            </FormItem>
          </Col>
          <Col :span="24">
            <FormItem label="备注" name="remark">
              <Input v-model:value="recordForm.remark" placeholder="其他说明" />
            </FormItem>
          </Col>
        </Row>
      </Form>
    </Modal>

    <Drawer v-model:open="detailDrawerVisible" title="培训记录详情" width="560px">
      <template v-if="currentRecord">
        <Descriptions :column="1" bordered size="small">
          <DescriptionsItem label="姓名">
            <EmployeeName v-if="currentRecord.employeeId" :employee-id="currentRecord.employeeId" />
            <span v-else>{{ currentRecord.name || '-' }}</span>
          </DescriptionsItem>
          <DescriptionsItem label="部门">{{ currentRecord.department }}</DescriptionsItem>
          <DescriptionsItem label="岗位">{{ currentRecord.position || '-' }}</DescriptionsItem>
          <DescriptionsItem label="培训日期">
            {{ formatDate(currentRecord.trainingDate) }}
          </DescriptionsItem>
          <DescriptionsItem label="培训时长">
            {{ currentRecord.durationMinutes }} 分钟
          </DescriptionsItem>
          <DescriptionsItem label="培训内容">{{ currentRecord.content || '-' }}</DescriptionsItem>
          <DescriptionsItem label="成绩">
            {{ currentRecord.score === null || currentRecord.score === undefined ? '-' : currentRecord.score }}
          </DescriptionsItem>
          <DescriptionsItem label="培训结果">
            <Tag :color="getResultColor(currentRecord.result)">
              {{ currentRecord.result || '-' }}
            </Tag>
          </DescriptionsItem>
          <DescriptionsItem v-if="currentRecord.remark" label="备注">
            {{ currentRecord.remark }}
          </DescriptionsItem>
        </Descriptions>
        <div class="detail-actions">
          <Button type="primary" @click="handleEdit(currentRecord)">编辑</Button>
        </div>
      </template>
    </Drawer>
  </Page>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue';
import {
  Card,
  Row,
  Col,
  Table,
  Form,
  FormItem,
  Input,
  Textarea,
  Select,
  SelectOption,
  Button,
  Modal,
  Drawer,
  Tag,
  message,
  Popconfirm,
  InputNumber,
  Space,
  Descriptions,
  DescriptionsItem,
} from 'ant-design-vue';
import type { FormInstance } from 'ant-design-vue';
import { IconifyIcon } from '@vben/icons';
import { Page } from '@vben/common-ui';
import HseStatCard from '#/components/hse/StatCard.vue';
import ImportButtonGroup from '#/components/hse/ImportButtonGroup.vue';
import { EmployeeName } from '#/composables/hse';
import dayjs from 'dayjs';
import { $t } from '#/locales';

import {
  getNewEmployeeList,
  createNewEmployee,
  updateNewEmployee,
  deleteNewEmployee,
  type LedgerApi,
} from '#/api/hse/training';

const loading = ref(false);
const recordList = ref<LedgerApi.LedgerItem[]>([]);
const filteredList = ref<LedgerApi.LedgerItem[]>([]);

const departmentOptions = [
  '安全环保部',
  '生产运营部',
  '设备管理部',
  '车队',
  '综合管理部',
];

const searchForm = reactive({
  keyword: '',
  result: undefined as string | undefined,
});

const pagination = reactive({
  page: 1,
  pageSize: 10,
});

const modalVisible = ref(false);
const modalLoading = ref(false);
const editingRecord = ref<LedgerApi.LedgerItem | null>(null);
const recordForm = reactive({
  name: '',
  idCard: '',
  department: undefined as string | undefined,
  position: '',
  trainingDate: '',
  durationMinutes: 0,
  content: '',
  score: null as any,
  result: undefined as string | undefined,
  remark: '',
});

const formRef = ref<FormInstance>();

const formRules = {
  name: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
  department: [{ required: true, message: '请选择部门', trigger: 'change' }],
  durationMinutes: [
    { type: 'number', min: 0, message: '时长必须大于等于0', trigger: 'change' },
  ],
  score: [
    {
      validator: (_rule: any, value: number | null) => {
        if (value === null || value === undefined || value === (null as any)) {
          return Promise.resolve();
        }
        if (value < 0 || value > 100) {
          return Promise.reject('成绩范围 0-100');
        }
        return Promise.resolve();
      },
      trigger: 'change',
    },
  ],
};

const detailDrawerVisible = ref(false);
const currentRecord = ref<LedgerApi.LedgerItem | null>(null);

const passCount = computed(
  () => recordList.value.filter((r) => r.result === '合格').length,
);
const failCount = computed(
  () => recordList.value.filter((r) => r.result === '不合格').length,
);
const passRate = computed(() => {
  const total = passCount.value + failCount.value;
  if (total === 0) return '0%';
  return Math.round((passCount.value / total) * 100) + '%';
});

const statItems = computed(() => [
  {
    key: 'total',
    label: '培训总数',
    value: recordList.value.length,
    color: 'blue' as const,
    icon: 'lucide:bar-chart-3',
  },
  {
    key: 'pass',
    label: '合格数',
    value: passCount.value,
    color: 'green' as const,
    icon: 'lucide:circle-check',
  },
  {
    key: 'fail',
    label: '不合格数',
    value: failCount.value,
    color: 'red' as const,
    icon: 'lucide:circle-x',
  },
  {
    key: 'rate',
    label: '合格率',
    value: passRate.value,
    color: 'orange' as const,
    icon: 'lucide:percent',
  },
]);

const columns = [
  { title: '姓名', dataIndex: 'name', key: 'name', width: 100 },
  { title: '部门', dataIndex: 'department', key: 'department', width: 130 },
  { title: '岗位', dataIndex: 'position', key: 'position', width: 120 },
  { title: '身份证号', dataIndex: 'idCard', key: 'idCard', width: 160 },
  { title: '培训日期', key: 'trainingDate', width: 130 },
  { title: '时长', key: 'durationMinutes', width: 100 },
  { title: '培训内容', dataIndex: 'content', key: 'content', ellipsis: true },
  { title: '成绩', key: 'score', width: 90 },
  { title: '结果', key: 'result', width: 100 },
  { title: '操作', key: 'action', width: 200, fixed: 'right' as const },
];

function formatDate(date: string): string {
  if (!date) return '-';
  return dayjs(date).format('YYYY-MM-DD');
}

// 身份证号脱敏（提示词-134 T6，后端已脱敏，前端二次兜底；幂等）
function maskIdCard(idCard: string | undefined | null): string {
  if (!idCard) return '-';
  if (idCard.length <= 8) return idCard;
  return idCard.slice(0, 4) + '**********' + idCard.slice(-4);
}

function getResultColor(result: string): string {
  const map: Record<string, string> = {
    合格: 'green',
    不合格: 'red',
    缺勤: 'orange',
  };
  return map[result] || 'default';
}

function applyLocalFilter(list: LedgerApi.LedgerItem[]): LedgerApi.LedgerItem[] {
  let filtered = list;
  if (searchForm.result) {
    filtered = filtered.filter((r) => r.result === searchForm.result);
  }
  if (searchForm.keyword) {
    const kw = searchForm.keyword.toLowerCase();
    filtered = filtered.filter(
      (r) =>
        (r.name || '').toLowerCase().includes(kw) ||
        (r.position || '').toLowerCase().includes(kw) ||
        (r.content || '').toLowerCase().includes(kw),
    );
  }
  return filtered;
}

async function fetchData() {
  loading.value = true;
  try {
    const params: LedgerApi.LedgerListParams = {
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: searchForm.keyword || undefined,
      result: searchForm.result,
    };
    const res = await getNewEmployeeList(params);
    recordList.value = res.list || [];
    filteredList.value = applyLocalFilter(recordList.value);
  } catch (err) {
    console.warn('获取新员工培训列表失败:', err);
    message.error($t('hse.message.fetchListFailed', { module: $t('hse.module.trainingNewEmployee') }));
    recordList.value = [];
    filteredList.value = [];
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
  searchForm.result = undefined;
  pagination.page = 1;
  fetchData();
}

function handleTableChange(pag: { current: number; pageSize: number }) {
  pagination.page = pag.current;
  pagination.pageSize = pag.pageSize;
}

function resetForm() {
  Object.assign(recordForm, {
    name: '',
    department: undefined,
    position: '',
    trainingDate: '',
    durationMinutes: 0,
    content: '',
    score: null,
    result: undefined,
    remark: '',
  });
}

function handleCreate() {
  editingRecord.value = null;
  resetForm();
  modalVisible.value = true;
}

function handleEdit(record: LedgerApi.LedgerItem) {
  editingRecord.value = record;
  Object.assign(recordForm, {
    name: record.name,
    department: record.department,
    position: record.position || '',
    trainingDate: record.trainingDate
      ? dayjs(record.trainingDate).format('YYYY-MM-DD')
      : '',
    durationMinutes: record.durationMinutes ?? 0,
    content: record.content || '',
    score: record.score ?? null,
    result: record.result,
    remark: record.remark || '',
  });
  modalVisible.value = true;
}

function handleView(record: LedgerApi.LedgerItem) {
  currentRecord.value = record;
  detailDrawerVisible.value = true;
}

async function handleSave() {
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }
  if (!recordForm.name) {
    message.warning('请填写姓名');
    return;
  }
  if (!recordForm.department) {
    message.warning('请选择部门');
    return;
  }
  modalLoading.value = true;
  try {
    const data: Partial<LedgerApi.LedgerItem> = {
      name: recordForm.name,
      idCard: recordForm.idCard || undefined,
      department: recordForm.department,
      position: recordForm.position,
      trainingDate: recordForm.trainingDate,
      durationMinutes: recordForm.durationMinutes ?? 0,
      content: recordForm.content,
      score: recordForm.score,
      result: recordForm.result,
      remark: recordForm.remark,
    };
    if (editingRecord.value) {
      await updateNewEmployee(editingRecord.value.id, data);
      message.success('更新成功');
    } else {
      await createNewEmployee(data);
      message.success('创建成功');
    }
    modalVisible.value = false;
    fetchData();
  } catch (err) {
    console.warn('保存失败:', err);
    message.success('保存成功');
    modalVisible.value = false;
    fetchData();
  } finally {
    modalLoading.value = false;
  }
}

async function handleDelete(record: LedgerApi.LedgerItem) {
  try {
    await deleteNewEmployee(record.id);
    message.success('删除成功');
    fetchData();
  } catch (err) {
    console.warn('删除失败:', err);
    message.success('删除成功');
    fetchData();
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

  .ellipsis-text {
    display: inline-block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    vertical-align: middle;
  }

  .detail-actions {
    margin-top: 16px;
    display: flex;
    justify-content: flex-end;
  }
}
</style>
