<template>
  <Page auto-content-height class="hse-page">
    <Card :bordered="false">
      <template #title>
        <div class="card-header">
          <span>培训要求管理</span>
          <div class="header-buttons">
            <Button v-if="isActionVisible('create')" type="primary" @click="handleCreate">
              <template #icon><IconifyIcon icon="lucide:plus" /></template>
              新增培训要求
            </Button>
            <ComponentVisibilitySettings
              title="培训要求管理显示设置"
              v-model:model-value="config"
              :stat-items="[]"
              :action-buttons="actionButtons"
              @reset="resetToDefault"
            />
          </div>
        </div>
      </template>

      <Form v-if="isFilterVisible" layout="inline" class="filter-form">
        <FormItem label="关键词">
          <Input
            v-model:value="searchForm.keyword"
            placeholder="搜索岗位/培训名称"
            allow-clear
            @change="handleSearch"
          />
        </FormItem>
        <FormItem>
          <Button @click="handleReset">重置</Button>
        </FormItem>
      </Form>

      <Table
        ref="tableRef"
        :columns="tableColumns"
        :data-source="requirementList"
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
          <template v-if="column.key === 'isRequired'">
            <Tag :color="record.isRequired ? 'red' : 'default'">
              {{ record.isRequired ? '必须' : '可选' }}
            </Tag>
          </template>
          <template v-else-if="column.key === 'trainingCycle'">
            <Tag :color="getCycleColor(record.trainingCycle)">
              {{ getCycleText(record.trainingCycle) }}
            </Tag>
          </template>
          <template v-else-if="column.key === 'durationMinutes'">
            {{ record.durationMinutes }} 分钟
          </template>
          <template v-else-if="column.key === 'action'">
            <Space>
              <Button type="link" size="small" @click="handleEdit(record as any)">编辑</Button>
              <Popconfirm
                title="确定要删除该培训要求吗？"
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
      :title="editingRequirement ? '编辑培训要求' : '新增培训要求'"
      :confirm-loading="modalLoading"
      width="640px"
      @ok="handleSave"
      @cancel="modalVisible = false"
    >
      <Form ref="formRef" :model="requirementForm" :rules="(formRules as any)" layout="vertical">
        <Row :gutter="16">
          <Col :span="12">
            <FormItem label="岗位" required>
              <EmployeeSelector
                v-model:value="requirementForm.positionId"
                mode="single"
                placeholder="请选择岗位"
                @change="onPositionChange"
              />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="培训名称" required>
              <Input v-model:value="requirementForm.trainingName" placeholder="请输入培训名称" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="培训周期" required>
              <Select v-model:value="requirementForm.trainingCycle" placeholder="请选择周期" style="width: 100%">
                <SelectOption value="年度">年度培训</SelectOption>
                <SelectOption value="半年">半年培训</SelectOption>
                <SelectOption value="季度">季度培训</SelectOption>
                <SelectOption value="月度">月度培训</SelectOption>
                <SelectOption value="专项">专项培训</SelectOption>
                <SelectOption value="入职">入职培训</SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="是否必须">
              <Select v-model:value="requirementForm.isRequired" style="width: 100%">
                <SelectOption :value="true">是</SelectOption>
                <SelectOption :value="false">否</SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="培训时长(分钟)" required>
              <InputNumber v-model:value="requirementForm.durationMinutes" :min="1" style="width: 100%" />
            </FormItem>
          </Col>
          <Col :span="24">
            <FormItem label="备注">
              <Textarea v-model:value="requirementForm.remark" :rows="2" placeholder="其他说明" />
            </FormItem>
          </Col>
        </Row>
      </Form>
    </Modal>
  </Page>
</template>

<script setup lang="ts">
import { ref, reactive, nextTick, onMounted } from 'vue';
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
  Tag,
  InputNumber,
  Textarea,
  message,
  Popconfirm,
  Space,
} from 'ant-design-vue';
import type { FormInstance } from 'ant-design-vue';
import { IconifyIcon } from '@vben/icons';
import { Page } from '@vben/common-ui';
import ComponentVisibilitySettings from '#/components/hse/ComponentVisibilitySettings.vue';
import { useTableColumnSettings } from '#/composables/useTableColumnSettings';
import { useComponentVisibility } from '#/composables/useComponentVisibility';
import type { VisibilityItem } from '#/composables/useComponentVisibility';
import EmployeeSelector from '#/components/hse/EmployeeSelector.vue';

import {
  getTrainingRequirements,
  createTrainingRequirement,
  updateTrainingRequirement,
  deleteTrainingRequirement,
  type TrainingRequirementApi,
} from '#/api/hse/training';

const loading = ref(false);
const requirementList = ref<TrainingRequirementApi.TrainingRequirement[]>([]);
const total = ref(0);

const searchForm = reactive({
  keyword: '',
});

const pagination = reactive({
  page: 1,
  pageSize: 10,
});

const modalVisible = ref(false);
const modalLoading = ref(false);
const editingRequirement = ref<TrainingRequirementApi.TrainingRequirement | null>(null);
const requirementForm = reactive({
  positionId: 0,
  positionName: '',
  trainingName: '',
  trainingCycle: '年度',
  isRequired: true as any,
  durationMinutes: 60,
  remark: '',
});

function onPositionChange(item: any) {
  // Q4 修复：组件 change 事件回写完整 SelectorItem，同步岗位名称（原 v-model:employee-name 误用已移除）
  requirementForm.positionName = item?.name ?? '';
}

const formRef = ref<FormInstance>();

const formRules = {
  positionId: [{ required: true, message: '请选择岗位', trigger: 'change' }],
  trainingName: [
    { required: true, message: '请输入培训名称', trigger: 'blur' },
    { min: 2, max: 100, message: '培训名称长度为2-100字符', trigger: 'blur' },
  ],
  trainingCycle: [{ required: true, message: '请选择培训周期', trigger: 'change' }],
  durationMinutes: [
    { required: true, message: '请输入培训时长', trigger: 'change' },
    { type: 'number', min: 1, message: '培训时长必须大于0', trigger: 'change' },
  ],
};

const originalColumns = ref([
  { title: '岗位', dataIndex: 'positionName', key: 'positionName', width: 150 },
  { title: '培训名称', dataIndex: 'trainingName', key: 'trainingName', width: 200 },
  { title: '培训周期', key: 'trainingCycle', width: 120 },
  { title: '是否必须', key: 'isRequired', width: 100 },
  { title: '培训时长', key: 'durationMinutes', width: 120 },
  { title: '备注', dataIndex: 'remark', key: 'remark' },
  { title: '操作', key: 'action', width: 140, fixed: 'right' as const },
]);

const { columns: tableColumns, initSortable, initResizable } = useTableColumnSettings(originalColumns, 'training-requirements');
const tableRef = ref<any>(null);

const actionButtons = ref([
  { key: 'create', label: '新增培训要求' },
]);

const { config, isActionVisible, isFilterVisible, resetToDefault } = useComponentVisibility({
  pageKey: 'training-requirements',
  statItems: ref<VisibilityItem[]>([]),
  actionButtons,
});

function getCycleColor(cycle: string): string {
  const map: Record<string, string> = {
    '年度': 'blue',
    '半年': 'orange',
    '季度': 'green',
    '月度': 'default',
    '专项': 'purple',
    '入职': 'gold',
  };
  return map[cycle] || 'default';
}

function getCycleText(cycle: string): string {
  const map: Record<string, string> = {
    '年度': '年度',
    '半年': '半年',
    '季度': '季度',
    '月度': '月度',
    '专项': '专项',
    '入职': '入职',
  };
  return map[cycle] || cycle;
}

async function fetchData() {
  loading.value = true;
  try {
    const params: TrainingRequirementApi.RequirementListParams = {
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: searchForm.keyword || undefined,
    };
    const res = await getTrainingRequirements(params);
    requirementList.value = res.list || [];
    total.value = res.total || 0;
  } catch (err) {
    console.warn('获取培训要求列表失败:', err);
    message.error('获取培训要求列表失败');
    requirementList.value = [];
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
  pagination.page = 1;
  fetchData();
}

function handleTableChange(pag: { current: number; pageSize: number }) {
  pagination.page = pag.current;
  pagination.pageSize = pag.pageSize;
  fetchData();
}

function handleCreate() {
  editingRequirement.value = null;
  Object.assign(requirementForm, {
    positionId: 0,
    positionName: '',
    trainingName: '',
    trainingCycle: '年度',
    isRequired: true,
    durationMinutes: 60,
    remark: '',
  });
  modalVisible.value = true;
}

function handleEdit(record: TrainingRequirementApi.TrainingRequirement) {
  editingRequirement.value = record;
  Object.assign(requirementForm, {
    positionId: record.positionId,
    positionName: record.positionName,
    trainingName: record.trainingName,
    trainingCycle: record.trainingCycle,
    isRequired: record.isRequired,
    durationMinutes: record.durationMinutes,
    remark: record.remark || '',
  });
  modalVisible.value = true;
}

async function handleSave() {
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }
  modalLoading.value = true;
  try {
    const data: Partial<TrainingRequirementApi.TrainingRequirement> = {
      positionId: requirementForm.positionId,
      positionName: requirementForm.positionName,
      trainingName: requirementForm.trainingName,
      trainingCycle: requirementForm.trainingCycle,
      isRequired: requirementForm.isRequired,
      durationMinutes: requirementForm.durationMinutes,
      remark: requirementForm.remark,
    };
    if (editingRequirement.value) {
      await updateTrainingRequirement(editingRequirement.value.id, data);
      message.success('更新成功');
    } else {
      await createTrainingRequirement(data);
      message.success('创建成功');
    }
    modalVisible.value = false;
    fetchData();
  } catch (err) {
    console.warn('保存失败:', err);
    message.error('保存失败');
  } finally {
    modalLoading.value = false;
  }
}

async function handleDelete(record: TrainingRequirementApi.TrainingRequirement) {
  try {
    await deleteTrainingRequirement(record.id);
    message.success('删除成功');
    fetchData();
  } catch (err) {
    console.warn('删除失败:', err);
    message.error('删除失败');
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
  await fetchData();
  await initTableFeatures();
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
    flex-wrap: wrap;
  }

  .filter-form {
    margin-bottom: 16px;
    padding-bottom: 16px;
    border-bottom: 1px solid hsl(var(--border));
  }
}
</style>