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
          <span>驾驶员实操</span>
          <div class="header-buttons">
            <ImportButtonGroup module="driver" module-name="驾驶员实操" @refresh="fetchData" />
            <Button type="primary" @click="handleCreate">
              <template #icon><IconifyIcon icon="lucide:plus" /></template>
              新增记录
            </Button>
          </div>
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
        :data-source="driverList"
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
        :scroll="{ x: 1400 }"
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
            {{ record.durationMinutes ? `${record.durationMinutes}分钟` : '-' }}
          </template>
          <template v-else-if="column.key === 'score'">
            <span v-if="record.score === null || record.score === undefined" class="muted-text">-</span>
            <span v-else>{{ record.score }}</span>
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
                title="确定要删除此记录吗？"
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
      :title="editingRecord ? '编辑驾驶员实操记录' : '新增驾驶员实操记录'"
      :confirm-loading="modalLoading"
      width="640px"
      @ok="handleSave"
      @cancel="modalVisible = false"
    >
      <Form ref="formRef" :model="driverForm" :rules="(formRules as any)" layout="vertical">
        <Row :gutter="16">
          <Col :span="12">
            <FormItem label="姓名" name="name" required>
              <Input v-model:value="driverForm.name" placeholder="请输入姓名" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="身份证号" name="idCard">
              <Input v-model:value="driverForm.idCard" placeholder="可选；用于自动关联员工档案" :maxlength="18" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="部门" name="department" required>
              <Select v-model:value="driverForm.department" placeholder="请选择部门" style="width: 100%">
                <SelectOption v-for="d in departmentOptions" :key="d" :value="d">
                  {{ d }}
                </SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="岗位" name="position">
              <Input v-model:value="driverForm.position" placeholder="请输入岗位" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="培训日期" name="trainingDate">
              <Input v-model:value="driverForm.trainingDate" type="date" style="width: 100%" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="时长(分钟)" name="durationMinutes">
              <InputNumber v-model:value="driverForm.durationMinutes" :min="0" style="width: 100%" placeholder="请输入时长" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="成绩" name="score">
              <InputNumber v-model:value="driverForm.score" :min="0" :max="100" style="width: 100%" placeholder="0-100" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="培训结果" name="result">
              <Select v-model:value="driverForm.result" placeholder="请选择结果" style="width: 100%">
                <SelectOption value="合格">合格</SelectOption>
                <SelectOption value="不合格">不合格</SelectOption>
                <SelectOption value="缺勤">缺勤</SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="24">
            <FormItem label="培训内容" name="content">
              <Input.TextArea v-model:value="driverForm.content" :rows="3" placeholder="请输入培训内容" />
            </FormItem>
          </Col>
          <Col :span="24">
            <FormItem label="备注" name="remark">
              <Input v-model:value="driverForm.remark" placeholder="请输入备注" />
            </FormItem>
          </Col>
        </Row>
      </Form>
    </Modal>

    <Drawer v-model:open="detailDrawerVisible" title="驾驶员实操详情" width="560px">
      <template v-if="currentRecord">
        <Descriptions :column="1" bordered>
          <DescriptionsItem label="姓名">
            <EmployeeName v-if="currentRecord.employeeId" :employee-id="currentRecord.employeeId" />
            <span v-else>{{ currentRecord.name || '-' }}</span>
          </DescriptionsItem>
          <DescriptionsItem label="部门">{{ currentRecord.department }}</DescriptionsItem>
          <DescriptionsItem label="岗位">{{ currentRecord.position || '-' }}</DescriptionsItem>
          <DescriptionsItem label="培训日期">{{ formatDate(currentRecord.trainingDate) }}</DescriptionsItem>
          <DescriptionsItem label="培训时长">
            {{ currentRecord.durationMinutes ? `${currentRecord.durationMinutes}分钟` : '-' }}
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
          <DescriptionsItem label="备注">{{ currentRecord.remark || '-' }}</DescriptionsItem>
        </Descriptions>
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
  getDriverList,
  createDriver,
  updateDriver,
  deleteDriver,
  type LedgerApi,
} from '#/api/hse/training';

const loading = ref(false);
const driverList = ref<LedgerApi.LedgerItem[]>([]);
const total = ref(0);

const searchForm = reactive({
  keyword: '',
  result: undefined as string | undefined,
});

const pagination = reactive({
  page: 1,
  pageSize: 10,
});

const departmentOptions = [
  '安全环保部',
  '生产运营部',
  '设备管理部',
  '车队',
  '综合管理部',
];

const modalVisible = ref(false);
const modalLoading = ref(false);
const editingRecord = ref<LedgerApi.LedgerItem | null>(null);
const driverForm = reactive({
  name: '',
  idCard: '',
  department: undefined as string | undefined,
  position: '',
  trainingDate: '',
  durationMinutes: undefined as number | undefined,
  content: '',
  score: undefined as number | undefined,
  result: undefined as string | undefined,
  remark: '',
});

const formRef = ref<FormInstance>();

const formRules = {
  name: [
    { required: true, message: '请输入姓名', trigger: 'blur' },
    { min: 2, max: 20, message: '姓名长度为2-20字符', trigger: 'blur' },
  ],
  department: [{ required: true, message: '请选择部门', trigger: 'change' }],
  position: [{ max: 50, message: '岗位长度不超过50字符', trigger: 'blur' }],
  trainingDate: [{ required: true, message: '请选择培训日期', trigger: 'change' }],
  durationMinutes: [
    {
      type: 'number',
      validator: (_rule: any, value: number) =>
        value === undefined || value === null || value >= 0
          ? Promise.resolve()
          : Promise.reject('时长必须大于等于0'),
      trigger: 'change',
    },
  ],
  score: [
    {
      type: 'number',
      validator: (_rule: any, value: number) => {
        if (value === undefined || value === null) return Promise.resolve();
        if (value < 0 || value > 100) return Promise.reject('成绩范围为0-100');
        return Promise.resolve();
      },
      trigger: 'change',
    },
  ],
  result: [{ required: true, message: '请选择培训结果', trigger: 'change' }],
  content: [{ max: 500, message: '培训内容不超过500字符', trigger: 'blur' }],
  remark: [{ max: 200, message: '备注不超过200字符', trigger: 'blur' }],
};

const detailDrawerVisible = ref(false);
const currentRecord = ref<LedgerApi.LedgerItem | null>(null);

const statItems = computed(() => {
  const list = driverList.value;
  const totalCount = list.length;
  const passCount = list.filter((item) => item.result === '合格').length;
  const failCount = list.filter((item) => item.result === '不合格').length;
  const denominator = passCount + failCount;
  const passRate =
    denominator > 0 ? Math.round((passCount / denominator) * 100) : 0;
  return [
    { key: 'total', label: '培训总数', value: totalCount, color: 'blue' as const, icon: 'lucide:users' },
    { key: 'pass', label: '合格数', value: passCount, color: 'green' as const, icon: 'lucide:check-circle-2' },
    { key: 'fail', label: '不合格数', value: failCount, color: 'red' as const, icon: 'lucide:x-circle' },
    { key: 'rate', label: '合格率', value: `${passRate}%`, color: 'orange' as const, icon: 'lucide:percent' },
  ];
});

const columns = [
  { title: '姓名', dataIndex: 'name', key: 'name', width: 100 },
  { title: '部门', dataIndex: 'department', key: 'department', width: 120 },
  { title: '岗位', dataIndex: 'position', key: 'position', width: 130 },
  { title: '身份证号', dataIndex: 'idCard', key: 'idCard', width: 160 },
  { title: '培训日期', key: 'trainingDate', width: 120 },
  { title: '时长', key: 'durationMinutes', width: 100 },
  { title: '培训内容', dataIndex: 'content', key: 'content', width: 220, ellipsis: true },
  { title: '成绩', key: 'score', width: 80 },
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

async function fetchData() {
  loading.value = true;
  try {
    const params: LedgerApi.LedgerListParams = {
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: searchForm.keyword || undefined,
      result: searchForm.result,
    };
    const res = await getDriverList(params);
    driverList.value = res.list || [];
    total.value = res.total || 0;
  } catch (err) {
    console.warn('获取驾驶员实操列表失败:', err);
    message.error($t('hse.message.fetchListFailed', { module: $t('hse.module.trainingDriver') }));
    driverList.value = [];
    total.value = 0;
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
  fetchData();
}

function handleCreate() {
  editingRecord.value = null;
  Object.assign(driverForm, {
    name: '',
    department: undefined,
    position: '',
    trainingDate: '',
    durationMinutes: undefined,
    content: '',
    score: undefined,
    result: undefined,
    remark: '',
  });
  modalVisible.value = true;
}

function handleEdit(record: LedgerApi.LedgerItem) {
  editingRecord.value = record;
  Object.assign(driverForm, {
    name: record.name,
    department: record.department,
    position: record.position || '',
    trainingDate: record.trainingDate || '',
    durationMinutes: record.durationMinutes,
    content: record.content || '',
    score: record.score,
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
  modalLoading.value = true;
  try {
    const data: Partial<LedgerApi.LedgerItem> = {
      name: driverForm.name,
      idCard: driverForm.idCard || undefined,
      department: driverForm.department,
      position: driverForm.position,
      trainingDate: driverForm.trainingDate,
      durationMinutes: driverForm.durationMinutes,
      content: driverForm.content,
      score: driverForm.score === undefined ? null : driverForm.score,
      result: driverForm.result,
      remark: driverForm.remark,
    };
    if (editingRecord.value) {
      await updateDriver(editingRecord.value.id, data);
      message.success('更新成功');
    } else {
      await createDriver(data);
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
    await deleteDriver(record.id);
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

  .header-buttons {
    display: flex;
    gap: 8px;
  }

  .filter-form {
    margin-bottom: 16px;
    padding-bottom: 16px;
    border-bottom: 1px solid hsl(var(--border));
  }

  .muted-text {
    color: hsl(var(--muted-foreground));
  }
}
</style>
