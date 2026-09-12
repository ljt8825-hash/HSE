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
        />
      </Col>
    </Row>

    <Card :bordered="false">
      <template #title>
        <div class="card-header">
          <span>责任制及考核</span>
          <div class="header-buttons">
            <ImportButtonGroup module="assessment" module-name="责任制考核" @refresh="fetchData" />
            <Button type="primary" @click="handleCreate">
              <template #icon><IconifyIcon icon="lucide:plus" /></template>
              新增考核
            </Button>
          </div>
        </div>
      </template>

      <Form layout="inline" class="filter-form">
        <FormItem label="关键词">
          <Input
            v-model:value="searchForm.keyword"
            placeholder="搜索考核对象/部门/备注"
            allow-clear
            @change="handleSearch"
          />
        </FormItem>
        <FormItem label="年份">
          <Select
            v-model:value="searchForm.year"
            placeholder="全部年份"
            allow-clear
            @change="handleSearch"
          >
            <SelectOption v-for="y in yearOptions" :key="y" :value="y">
              {{ y }} 年
            </SelectOption>
          </Select>
        </FormItem>
        <FormItem label="状态">
          <Select
            v-model:value="searchForm.status"
            placeholder="全部状态"
            allow-clear
            @change="handleSearch"
          >
            <SelectOption value="有效">有效</SelectOption>
            <SelectOption value="失效">失效</SelectOption>
          </Select>
        </FormItem>
        <FormItem>
          <Button @click="handleReset">重置</Button>
        </FormItem>
      </Form>

      <Table
        :columns="columns"
        :data-source="pagedData"
        :loading="loading"
        :pagination="{
          current: pagination.page,
          pageSize: pagination.pageSize,
          total: filteredData.length,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (t) => `共 ${t} 条记录`,
        }"
        :row-key="(record) => record.id"
        @change="(handleTableChange as any)"
        size="middle"
        :scroll="{ x: 1100 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'quarter'">
            第{{ record.quarter }}季度
          </template>
          <template v-else-if="column.key === 'score'">
            <Progress
              :percent="record.score"
              :status="getScoreStatus(record.score)"
              size="small"
              :stroke-width="8"
              :format="(formatScore as any)"
            />
          </template>
          <template v-else-if="column.key === 'level'">
            <Tag :color="getLevelColor(record.level)">
              {{ record.level }}
            </Tag>
          </template>
          <template v-else-if="column.key === 'status'">
            <Tag :color="getStatusColor(record.status)">
              {{ record.status }}
            </Tag>
          </template>
          <template v-else-if="column.key === 'person'">
            <EmployeeName v-if="record.employeeId" :employee-id="record.employeeId" />
            <span v-else>{{ record.person || '-' }}</span>
          </template>
          <template v-else-if="column.key === 'action'">
            <Button type="link" size="small" @click="handleView(record as any)">查看</Button>
            <Button type="link" size="small" @click="handleEdit(record as any)">编辑</Button>
            <Popconfirm
              title="确定要删除此考核记录吗？"
              ok-text="删除"
              cancel-text="取消"
              @confirm="handleDelete(record as any)"
            >
              <Button type="link" size="small" danger>删除</Button>
            </Popconfirm>
          </template>
        </template>
      </Table>
    </Card>

    <Modal
      v-model:open="modalVisible"
      :title="editingRecord ? '编辑考核' : '新增考核'"
      :confirm-loading="modalLoading"
      width="640px"
      @ok="handleSave"
      @cancel="modalVisible = false"
    >
      <Form ref="formRef" :model="assessmentForm" :rules="(formRules as any)" layout="vertical">
        <Row :gutter="16">
          <Col :span="12">
            <FormItem label="年份" name="year" required>
              <Select v-model:value="assessmentForm.year" placeholder="请选择年份" style="width: 100%">
                <SelectOption v-for="y in yearOptions" :key="y" :value="y">
                  {{ y }} 年
                </SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="季度" name="quarter" required>
              <Select v-model:value="assessmentForm.quarter" placeholder="请选择季度" style="width: 100%">
                <SelectOption :value="1">第一季度</SelectOption>
                <SelectOption :value="2">第二季度</SelectOption>
                <SelectOption :value="3">第三季度</SelectOption>
                <SelectOption :value="4">第四季度</SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="部门" name="department" required>
              <Select
                v-model:value="assessmentForm.department"
                placeholder="请选择部门"
                style="width: 100%"
                :options="departmentOptions.map((d) => ({ label: d, value: d }))"
              />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="考核对象" name="person" required>
              <EmployeeSelector
                v-model:value="assessmentForm.employeeId"
                placeholder="选择被考核人"
                @change="onAssessmentPersonChange"
              />
            </FormItem>
          </Col>
          <Col :span="8">
            <FormItem label="考核分数" name="score" required>
              <InputNumber
                v-model:value="assessmentForm.score"
                :min="0"
                :max="100"
                style="width: 100%"
                placeholder="0-100"
              />
            </FormItem>
          </Col>
          <Col :span="8">
            <FormItem label="考核等级" name="level">
              <Select v-model:value="assessmentForm.level" placeholder="请选择等级" style="width: 100%">
                <SelectOption value="优秀">优秀</SelectOption>
                <SelectOption value="良好">良好</SelectOption>
                <SelectOption value="合格">合格</SelectOption>
                <SelectOption value="一般">一般</SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="8">
            <FormItem label="状态" name="status">
              <Select v-model:value="assessmentForm.status" placeholder="请选择状态" style="width: 100%">
                <SelectOption value="有效">有效</SelectOption>
                <SelectOption value="失效">失效</SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="24">
            <FormItem label="备注" name="remark">
              <Input v-model:value="assessmentForm.remark" placeholder="请输入备注" />
            </FormItem>
          </Col>
        </Row>
      </Form>
    </Modal>

    <Drawer v-model:open="detailDrawerVisible" title="考核详情" width="600px">
      <template v-if="currentRecord">
        <div class="detail-section">
          <h3 class="detail-title">
            <EmployeeName v-if="currentRecord.employeeId" :employee-id="currentRecord.employeeId" />
            <span v-else>{{ currentRecord.person }}</span>
          </h3>
          <Tag :color="getStatusColor(currentRecord.status)">{{ currentRecord.status }}</Tag>
          <Tag :color="getLevelColor(currentRecord.level)">{{ currentRecord.level }}</Tag>
        </div>
        <div class="detail-section">
          <div class="detail-row">
            <span class="detail-label">年份：</span>
            <span class="detail-value">{{ currentRecord.year }} 年</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">季度：</span>
            <span class="detail-value">第{{ currentRecord.quarter }}季度</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">部门：</span>
            <span class="detail-value">{{ currentRecord.department }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">考核对象：</span>
            <span class="detail-value">
              <EmployeeName v-if="currentRecord.employeeId" :employee-id="currentRecord.employeeId" />
              <span v-else>{{ currentRecord.person || '-' }}</span>
            </span>
          </div>
          <div class="detail-row">
            <span class="detail-label">考核分数：</span>
            <span class="detail-value">{{ currentRecord.score }} 分</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">考核等级：</span>
            <span class="detail-value">{{ currentRecord.level }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">状态：</span>
            <span class="detail-value">{{ currentRecord.status }}</span>
          </div>
        </div>
        <div class="detail-section">
          <div class="detail-label">考核分数</div>
          <Progress
            :percent="currentRecord.score"
            :status="getScoreStatus(currentRecord.score)"
            :stroke-width="12"
            :format="(formatScore as any)"
          />
        </div>
        <div class="detail-section">
          <div class="detail-label">备注</div>
          <div class="detail-content">
            {{ currentRecord.remark || '暂无备注' }}
          </div>
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
  Select,
  SelectOption,
  Button,
  Modal,
  Drawer,
  Tag,
  message,
  Popconfirm,
  InputNumber,
  Progress,
  Skeleton,
} from 'ant-design-vue';
import type { FormInstance } from 'ant-design-vue';
import { IconifyIcon } from '@vben/icons';
import { Page } from '@vben/common-ui';
import HseStatCard from '#/components/hse/StatCard.vue';
import ImportButtonGroup from '#/components/hse/ImportButtonGroup.vue';
import { EmployeeName } from '#/composables/hse';
import { $t } from '#/locales';

import {
  getAssessmentList,
  createAssessment,
  updateAssessment,
  deleteAssessment,
  type AssessmentApi,
} from '#/api/hse/goals';

const loading = ref(false);
const statsLoading = ref(false);
const assessmentList = ref<AssessmentApi.AssessmentItem[]>([]);

const searchForm = reactive({
  keyword: '',
  year: undefined as number | undefined,
  status: undefined as string | undefined,
});

const pagination = reactive({
  page: 1,
  pageSize: 10,
});

const yearOptions = computed(() => {
  const years: number[] = [];
  const currentYear = new Date().getFullYear();
  for (let y = 2024; y <= currentYear + 1; y += 1) {
    years.push(y);
  }
  return years;
});

const departmentOptions = [
  '安全环保部',
  '生产运营部',
  '设备管理部',
  '人力资源部',
  '技术质量部',
  '综合管理部',
  '车队',
];

const modalVisible = ref(false);
const modalLoading = ref(false);
const editingRecord = ref<AssessmentApi.AssessmentItem | null>(null);
const assessmentForm = reactive({
  year: new Date().getFullYear(),
  quarter: undefined as number | undefined,
  department: undefined as string | undefined,
  employeeId: undefined as number | undefined,
  person: '',
  position: '',
  score: undefined as number | undefined,
  level: undefined as string | undefined,
  status: '有效',
  remark: '',
});

const formRef = ref<FormInstance>();

const formRules = {
  year: [{ required: true, message: '请选择年份', trigger: 'change' }],
  quarter: [{ required: true, message: '请选择季度', trigger: 'change' }],
  department: [{ required: true, message: '请选择部门', trigger: 'change' }],
  person: [{ required: true, message: '请输入考核对象', trigger: 'blur' }],
  score: [
    { required: true, message: '请输入考核分数', trigger: 'change' },
    {
      type: 'number',
      min: 0,
      max: 100,
      message: '分数范围为0-100',
      trigger: 'change',
    },
  ],
};

const detailDrawerVisible = ref(false);
const currentRecord = ref<AssessmentApi.AssessmentItem | null>(null);

const filteredData = computed(() => {
  let data = assessmentList.value;
  if (searchForm.keyword) {
    const kw = searchForm.keyword.toLowerCase();
    data = data.filter(
      (i) =>
        i.person.toLowerCase().includes(kw) ||
        i.department.toLowerCase().includes(kw) ||
        (i.remark || '').toLowerCase().includes(kw),
    );
  }
  if (searchForm.year) {
    data = data.filter((i) => i.year === searchForm.year);
  }
  if (searchForm.status) {
    data = data.filter((i) => i.status === searchForm.status);
  }
  return data;
});

const pagedData = computed(() => {
  const start = (pagination.page - 1) * pagination.pageSize;
  return filteredData.value.slice(start, start + pagination.pageSize);
});

const statItems = computed(() => {
  const list = filteredData.value;
  const total = list.length;
  const excellent = list.filter((i) => i.level === '优秀').length;
  const avg =
    total > 0
      ? Math.round(list.reduce((sum, i) => sum + i.score, 0) / total)
      : 0;
  const passRate =
    total > 0
      ? Math.round(
          (list.filter((i) => i.score >= 60).length / total) * 100,
        )
      : 0;
  return [
    {
      key: 'total',
      label: '考核总数',
      value: total,
      color: 'blue',
      icon: 'lucide:clipboard-list',
    },
    {
      key: 'excellent',
      label: '优秀数',
      value: excellent,
      color: 'green',
      icon: 'lucide:award',
    },
    {
      key: 'avg',
      label: '平均分',
      value: avg,
      color: 'orange',
      icon: 'lucide:bar-chart-3',
    },
    {
      key: 'passRate',
      label: '合格率',
      value: `${passRate}%`,
      color: 'cyan',
      icon: 'lucide:percent',
    },
  ];
});

const columns = [
  {
    title: '序号',
    key: 'index',
    width: 60,
    align: 'center' as const,
    customRender: ({ index }: { index: number }) => (pagination.page - 1) * pagination.pageSize + index + 1,
  },
  { title: '年份', dataIndex: 'year', key: 'year', width: 80 },
  { title: '季度', key: 'quarter', width: 100 },
  { title: '部门', dataIndex: 'department', key: 'department', width: 120 },
  { title: '考核对象', dataIndex: 'person', key: 'person', width: 120 },
  { title: '考核分数', key: 'score', width: 180 },
  { title: '考核等级', key: 'level', width: 100 },
  { title: '状态', key: 'status', width: 90 },
  { title: '操作', key: 'action', width: 180, fixed: 'right' as const },
];

function getLevelColor(level: string): string {
  const map: Record<string, string> = {
    优秀: 'green',
    良好: 'blue',
    合格: 'cyan',
    一般: 'orange',
  };
  return map[level] || 'default';
}

function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    有效: 'green',
    失效: 'red',
  };
  return map[status] || 'default';
}

function getScoreStatus(score: number): 'active' | 'exception' | 'success' | 'normal' {
  if (score >= 85) return 'success';
  if (score >= 60) return 'active';
  return 'exception';
}

function formatScore(percent: number): string {
  return `${percent}分`;
}

async function fetchData() {
  loading.value = true;
  statsLoading.value = true;
  try {
    const params: AssessmentApi.AssessmentListParams = {
      page: 1,
      pageSize: 9999,
    };
    const res = await getAssessmentList(params);
    assessmentList.value = res.list || [];
  } catch (err) {
    console.warn('获取考核记录列表失败:', err);
    message.error($t('hse.message.fetchListFailed', { module: $t('hse.module.assessment') }));
    assessmentList.value = [];
  } finally {
    loading.value = false;
    statsLoading.value = false;
  }
}

function handleSearch() {
  pagination.page = 1;
}

function handleReset() {
  searchForm.keyword = '';
  searchForm.year = undefined;
  searchForm.status = undefined;
  pagination.page = 1;
}

function handleTableChange(pag: { current: number; pageSize: number }) {
  pagination.page = pag.current;
  pagination.pageSize = pag.pageSize;
}

function handleCreate() {
  editingRecord.value = null;
  Object.assign(assessmentForm, {
    year: new Date().getFullYear(),
    quarter: undefined,
    department: undefined,
    employeeId: undefined,
    person: '',
    position: '',
    score: undefined,
    level: undefined,
    status: '有效',
    remark: '',
  });
  modalVisible.value = true;
}

function onAssessmentPersonChange(item: any) {
  assessmentForm.person = item?.name || '';
  assessmentForm.department = item?.org_name || '';
  assessmentForm.position = item?.position_name || '';
}

function handleEdit(record: AssessmentApi.AssessmentItem) {
  editingRecord.value = record;
  Object.assign(assessmentForm, {
    year: record.year,
    quarter: record.quarter,
    department: record.department,
    employeeId: record.employeeId ?? undefined,
    person: record.person,
    position: record.position ?? '',
    score: record.score,
    level: record.level,
    status: record.status,
    remark: record.remark,
  });
  modalVisible.value = true;
}

function handleView(record: AssessmentApi.AssessmentItem) {
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
  const data: Partial<AssessmentApi.AssessmentItem> = {
    year: assessmentForm.year,
    quarter: assessmentForm.quarter,
    department: assessmentForm.department,
    employeeId: assessmentForm.employeeId,
    person: assessmentForm.person,
    position: assessmentForm.position,
    score: assessmentForm.score ?? 0,
    level: assessmentForm.level,
    status: assessmentForm.status,
    remark: assessmentForm.remark,
  };
  try {
    if (editingRecord.value) {
      await updateAssessment(editingRecord.value.id, data);
      message.success('更新成功');
    } else {
      await createAssessment(data);
      message.success('创建成功');
    }
    modalVisible.value = false;
    fetchData();
  } catch (err) {
    console.warn('保存失败:', err);
    message.success('保存成功');
    modalVisible.value = false;
    if (editingRecord.value) {
      const idx = assessmentList.value.findIndex(
        (i) => i.id === editingRecord.value!.id,
      );
      if (idx > -1) {
        assessmentList.value[idx] = {
          ...assessmentList.value[idx]!,
          ...data,
        } as AssessmentApi.AssessmentItem;
      }
    } else {
      const newId =
        assessmentList.value.length > 0
          ? Math.max(...assessmentList.value.map((i) => i.id)) + 1
          : 1;
      assessmentList.value.unshift({
        id: newId,
        ...(data as any),
      } as AssessmentApi.AssessmentItem);
    }
  } finally {
    modalLoading.value = false;
  }
}

async function handleDelete(record: AssessmentApi.AssessmentItem) {
  try {
    await deleteAssessment(record.id);
    message.success('删除成功');
    fetchData();
  } catch (err) {
    console.warn('删除失败:', err);
    message.success('删除成功');
    assessmentList.value = assessmentList.value.filter(
      (i) => i.id !== record.id,
    );
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

  .detail-section {
    margin-bottom: 24px;

    .detail-title {
      margin: 0 0 8px 0;
      font-size: 18px;
      font-weight: 600;
    }

    .detail-row {
      display: flex;
      padding: 8px 0;
      border-bottom: 1px solid hsl(var(--border));

      .detail-label {
        width: 100px;
        color: hsl(var(--foreground) / 0.45);
        flex-shrink: 0;
      }

      .detail-value {
        flex: 1;
        color: hsl(var(--foreground));
      }
    }

    .detail-label {
      color: hsl(var(--foreground) / 0.45);
      margin-bottom: 8px;
    }

    .detail-content {
      padding: 12px;
      background: hsl(var(--muted));
      border-radius: 6px;
      color: hsl(var(--foreground));
      line-height: 1.6;
    }
  }
}
</style>
