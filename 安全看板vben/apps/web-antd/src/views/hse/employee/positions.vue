<!--
  HSE 人员主数据中心 - 岗位管理页 - Sprint5.1
  功能: 岗位列表 / 搜索 / 新增 / 编辑 / 删除 / 部门过滤
  表: position (岗位管理 + 安全职责标识)
-->
<template>
  <Page auto-content-height class="hse-page">
    <Card :bordered="false">
      <!-- 工具栏 -->
      <div class="toolbar">
        <div class="toolbar-left">
          <a-input-search
            v-model:value="searchForm.keyword"
            placeholder="搜索岗位名称/编码"
            style="width: 280px"
            allow-clear
            @search="handleSearch"
          />
          <a-tree-select
            v-model:value="searchForm.deptId"
            placeholder="所属部门"
            style="width: 260px"
            allow-clear
            tree-default-expand-all
            :tree-data="deptTreeData"
            :field-names="treeFieldNames"
            @change="handleSearch"
          />
          <a-select
            v-model:value="searchForm.jobCategory"
            placeholder="岗位类别"
            style="width: 140px"
            allow-clear
            @change="handleSearch"
          >
            <Select.Option value="管理">管理</Select.Option>
            <Select.Option value="技术">技术</Select.Option>
            <Select.Option value="生产">生产</Select.Option>
            <Select.Option value="辅助">辅助</Select.Option>
          </a-select>
          <a-select
            v-model:value="searchForm.specialPost"
            placeholder="特种作业"
            style="width: 120px"
            allow-clear
            @change="handleSearch"
          >
            <Select.Option :value="true">是</Select.Option>
            <Select.Option :value="false">否</Select.Option>
          </a-select>
        </div>
        <div class="toolbar-right">
          <a-button v-if="canEdit" type="primary" @click="handleAdd">
            <template #icon><IconifyIcon icon="lucide:plus" /></template>
            新增岗位
          </a-button>
        </div>
      </div>

      <!-- 岗位表格 -->
      <a-table
        :columns="columns"
        :data-source="list"
        :loading="loading"
        row-key="id"
        :pagination="tablePagination"
        @change="handleTableChange"
        :scroll="{ x: 1200 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <span class="pos-name">{{ record.name }}</span>
            <a-tag v-if="record.is_special_post" color="volcano" size="small">特种作业</a-tag>
            <a-tag v-if="record.is_safety_critical" color="red" size="small">安全关键</a-tag>
          </template>
          <template v-else-if="column.key === 'dept_name'">
            {{ record.dept_name || '-' }}
          </template>
          <template v-else-if="column.key === 'job_category'">
            <a-tag v-if="record.job_category" color="blue">{{ record.job_category }}</a-tag>
            <span v-else>-</span>
          </template>
          <template v-else-if="column.key === 'is_special_post'">
            <a-tag :color="record.is_special_post ? 'volcano' : 'default'">
              {{ record.is_special_post ? '是' : '否' }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'is_safety_critical'">
            <a-tag :color="record.is_safety_critical ? 'red' : 'default'">
              {{ record.is_safety_critical ? '是' : '否' }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'status'">
            <a-tag :color="record.status === 'active' ? 'green' : 'default'">
              {{ record.status === 'active' ? '启用' : '停用' }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'safety_duties'">
            <a-tooltip v-if="record.safety_duties" :title="record.safety_duties">
              <span class="ellipsis-text">{{ record.safety_duties }}</span>
            </a-tooltip>
            <span v-else>-</span>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space>
              <a-button v-if="canEdit" type="link" size="small" @click="handleEdit(record)">
                编辑
              </a-button>
              <a-popconfirm
                v-if="canEdit"
                title="确定删除该岗位吗？"
                @confirm="handleDelete(record)"
              >
                <a-button type="link" size="small" danger>删除</a-button>
              </a-popconfirm>
            </a-space>
          </template>
        </template>
      </a-table>
    </Card>

    <!-- 岗位编辑弹窗 -->
    <a-modal
      v-model:open="editModalOpen"
      :title="editMode === 'create' ? '新增岗位' : '编辑岗位'"
      width="640px"
      :confirm-loading="submitLoading"
      @ok="handleSubmit"
    >
      <a-form
        ref="formRef"
        :model="formData"
        :rules="formRules"
        :label-col="{ span: 6 }"
        :wrapper-col="{ span: 16 }"
      >
        <a-form-item label="岗位编码" name="position_code">
          <a-input
            v-model:value="formData.position_code"
            placeholder="如 POS-001"
            :disabled="editMode === 'edit'"
          />
        </a-form-item>
        <a-form-item label="岗位名称" name="name">
          <a-input v-model:value="formData.name" placeholder="请输入岗位名称" />
        </a-form-item>
        <a-form-item label="所属部门" name="dept_id">
          <a-tree-select
            v-model:value="formData.dept_id"
            placeholder="请选择所属部门"
            tree-default-expand-all
            :tree-data="deptTreeData"
            :field-names="treeFieldNames"
            allow-clear
          />
        </a-form-item>
        <a-form-item label="岗位类别" name="job_category">
          <a-select v-model:value="formData.job_category" placeholder="请选择岗位类别">
            <Select.Option value="管理">管理</Select.Option>
            <Select.Option value="技术">技术</Select.Option>
            <Select.Option value="生产">生产</Select.Option>
            <Select.Option value="辅助">辅助</Select.Option>
          </a-select>
        </a-form-item>
        <a-form-item label="特种作业岗位">
          <a-switch v-model:checked="formData.is_special_post" />
          <span class="form-tip">如电工、焊工、高处作业等</span>
        </a-form-item>
        <a-form-item label="安全关键岗位">
          <a-switch v-model:checked="formData.is_safety_critical" />
          <span class="form-tip">安全职责关键岗位</span>
        </a-form-item>
        <a-form-item label="安全职责">
          <a-textarea
            v-model:value="formData.safety_duties"
            :rows="4"
            placeholder="请输入该岗位的安全职责描述"
          />
        </a-form-item>
        <a-form-item label="排序">
          <a-input-number
            v-model:value="formData.sort_order"
            :min="0"
            :max="9999"
            style="width: 100%"
          />
        </a-form-item>
        <a-form-item label="状态">
          <a-radio-group v-model:value="formData.status">
            <a-radio value="active">启用</a-radio>
            <a-radio value="inactive">停用</a-radio>
          </a-radio-group>
        </a-form-item>
      </a-form>
    </a-modal>
  </Page>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { useAccess } from '@vben/access';
import { message } from 'ant-design-vue';
import { Card, Select } from 'ant-design-vue';
import type { FormInstance } from 'ant-design-vue';
import {
  createPosition,
  deletePosition,
  getDeptTree,
  getPositionList,
  updatePosition,
  type EmployeeApi,
} from '#/api/hse/employee';

const { hasAccessByRoles } = useAccess();
const canEdit = computed(() => hasAccessByRoles(['admin', 'safety_manager']));

// 列表数据
const loading = ref(false);
const list = ref<EmployeeApi.PositionItem[]>([]);
const searchForm = reactive({
  keyword: '',
  deptId: undefined as number | undefined,
  jobCategory: undefined as string | undefined,
  specialPost: undefined as boolean | undefined,
});

// 部门树
const deptTreeData = ref<EmployeeApi.DeptNode[]>([]);
const treeFieldNames = {
  children: 'children',
  label: 'name',
  value: 'id',
};

const columns = [
  { title: '岗位编码', dataIndex: 'position_code', key: 'position_code', width: 120 },
  { title: '岗位名称', key: 'name', width: 200 },
  { title: '所属部门', key: 'dept_name', width: 160 },
  { title: '岗位类别', key: 'job_category', width: 100 },
  { title: '特种作业', key: 'is_special_post', width: 100 },
  { title: '安全关键', key: 'is_safety_critical', width: 100 },
  { title: '安全职责', key: 'safety_duties', ellipsis: true },
  { title: '状态', key: 'status', width: 80 },
  { title: '操作', key: 'action', width: 140, fixed: 'right' as const },
];

// 弹窗状态
const editModalOpen = ref(false);
const editMode = ref<'create' | 'edit'>('create');
const submitLoading = ref(false);
const formRef = ref<FormInstance>();
const currentPositionId = ref<number | null>(null);
const formData = reactive<EmployeeApi.PositionFormData & { status?: string }>({
  position_code: '',
  name: '',
  dept_id: undefined,
  job_category: undefined,
  is_special_post: false,
  is_safety_critical: false,
  safety_duties: '',
  sort_order: 0,
  status: 'active',
});

const formRules = {
  position_code: [
    { required: true, message: '请输入岗位编码' },
    { max: 50, message: '编码长度不能超过50' },
  ],
  name: [
    { required: true, message: '请输入岗位名称' },
    { max: 100, message: '名称长度不能超过100' },
  ],
  // 提示词-122 P3：所属部门必填，避免无归属岗位成为数据孤岛
  dept_id: [{ required: true, message: '请选择所属部门' }],
};

// 服务端分页状态（提示词-122 P2：替代原纯前端分页与 filteredList 前端过滤）
const tablePagination = reactive({
  current: 1,
  pageSize: 20,
  total: 0,
  showSizeChanger: true,
  showTotal: (t: number) => `共 ${t} 条`,
});

// 加载列表（提示词-122 P2：筛选与分页均下发至服务端）
async function loadList() {
  loading.value = true;
  try {
    const resp = (await getPositionList({
      deptId: searchForm.deptId,
      keyword: searchForm.keyword || undefined,
      jobCategory: searchForm.jobCategory,
      isSpecialPost: searchForm.specialPost,
      page: tablePagination.current,
      pageSize: tablePagination.pageSize,
      // 服务端分页返回 {list,total,page,pageSize}；兼容旧调用（直接数组）
    })) as any;
    const rows = Array.isArray(resp) ? resp : (resp?.list ?? []);
    list.value = rows;
    if (!Array.isArray(resp)) {
      tablePagination.total = resp?.total ?? rows.length;
      tablePagination.current = resp?.page ?? 1;
    }
  } catch {
    // 错误提示已由拦截器处理
  } finally {
    loading.value = false;
  }
}

// 表格分页/排序变更（提示词-122 P2）
function handleTableChange(pag: { current: number; pageSize: number }) {
  tablePagination.current = pag.current;
  tablePagination.pageSize = pag.pageSize;
  loadList();
}

// 加载部门树
async function loadDeptTree() {
  try {
    const data = await getDeptTree();
    deptTreeData.value = data || [];
  } catch {
    // 错误提示已由拦截器处理
  }
}

// 搜索（筛选条件变化 → 回到第 1 页）
function handleSearch() {
  tablePagination.current = 1;
  loadList();
}

// 新增
function handleAdd() {
  editMode.value = 'create';
  currentPositionId.value = null;
  Object.assign(formData, {
    position_code: '',
    name: '',
    dept_id: searchForm.deptId,
    job_category: undefined,
    is_special_post: false,
    is_safety_critical: false,
    safety_duties: '',
    sort_order: 0,
    status: 'active',
  });
  editModalOpen.value = true;
}

// 编辑
function handleEdit(record: EmployeeApi.PositionItem) {
  editMode.value = 'edit';
  currentPositionId.value = record.id;
  Object.assign(formData, {
    position_code: record.position_code,
    name: record.name,
    dept_id: record.dept_id,
    job_category: record.job_category,
    is_special_post: record.is_special_post || false,
    is_safety_critical: record.is_safety_critical || false,
    safety_duties: record.safety_duties || '',
    sort_order: record.sort_order || 0,
    status: record.status || 'active',
  });
  editModalOpen.value = true;
}

// 提交
async function handleSubmit() {
  try {
    await formRef.value?.validate();
    submitLoading.value = true;
    if (editMode.value === 'create') {
      await createPosition(formData);
      message.success('新增成功');
    } else if (currentPositionId.value) {
      await updatePosition(currentPositionId.value, formData);
      message.success('更新成功');
    }
    editModalOpen.value = false;
    await loadList();
  } catch (err: any) {
    if (err?.errorFields) return; // 表单校验错误
    // 错误提示已由拦截器处理
  } finally {
    submitLoading.value = false;
  }
}

// 删除
async function handleDelete(record: EmployeeApi.PositionItem) {
  try {
    await deletePosition(record.id);
    message.success('删除成功');
    loadList();
  } catch {
    // 错误提示已由拦截器处理
  }
}

onMounted(() => {
  loadList();
  loadDeptTree();
});
</script>

<style scoped>
.hse-page {
  padding: 16px;
}

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

.pos-name {
  font-weight: 500;
  margin-right: 4px;
}

.ellipsis-text {
  display: inline-block;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
  color: hsl(var(--muted-foreground));
  font-size: 13px;
}

.form-tip {
  margin-left: 12px;
  color: hsl(var(--muted-foreground));
  font-size: 12px;
}
</style>
