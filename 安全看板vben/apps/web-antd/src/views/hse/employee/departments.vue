<!--
  HSE 人员主数据中心 - 组织管理页 - Sprint5.1
  功能: 部门树展示 / 新增 / 编辑 / 删除 / 查看详情
  表: department (层级: 公司/部门/乡镇/班组)
-->
<template>
  <Page auto-content-height class="hse-page">
    <Row :gutter="16">
      <!-- 左侧：部门树 -->
      <Col :xs="24" :md="10" :lg="8">
        <Card :bordered="false" class="tree-card">
          <template #title>
            <div class="card-title">
              <IconifyIcon icon="lucide:git-fork" class="title-icon" />
              <span>组织架构</span>
            </div>
          </template>
          <template #extra>
            <a-space>
              <a-button
                v-if="canEdit"
                type="primary"
                size="small"
                @click="handleAdd(null)"
              >
                <template #icon>
                  <IconifyIcon icon="lucide:plus" />
                </template>
                新增根部门
              </a-button>
              <a-tooltip title="刷新">
                <a-button size="small" @click="loadTree">
                  <template #icon>
                    <IconifyIcon icon="lucide:refresh-cw" />
                  </template>
                </a-button>
              </a-tooltip>
            </a-space>
          </template>

          <a-spin :spinning="treeLoading">
            <a-input-search
              v-model:value="searchKeyword"
              placeholder="搜索部门名称/编码"
              class="mb-3"
              allow-clear
              @search="filterTree"
            />
            <div v-if="filteredTreeData.length === 0" class="empty-tip">
              <a-empty description="暂无部门数据" />
            </div>
            <a-tree
              v-else
              v-model:selectedKeys="selectedKeys"
              v-model:expandedKeys="expandedKeys"
              :tree-data="filteredTreeData"
              :field-names="treeFieldNames"
              :default-expand-all="false"
              show-line
              @select="handleSelect"
            >
              <template #title="{ name, dept_code, status, level, org_type }">
                <span :class="{ 'node-inactive': status === 'inactive' }">
                  {{ name }}
                  <a-tag :color="orgTypeColor(org_type)" class="node-level-tag">{{ orgTypeText(org_type) }}</a-tag>
                  <a-tag :color="levelColor(level)" class="node-level-tag">{{ levelText(level) }}</a-tag>
                  <span class="node-code">({{ dept_code }})</span>
                </span>
              </template>
            </a-tree>
          </a-spin>
        </Card>
      </Col>

      <!-- 右侧：部门详情 -->
      <Col :xs="24" :md="14" :lg="16">
        <Card :bordered="false">
          <template #title>
            <div class="card-title">
              <IconifyIcon icon="lucide:building-2" class="title-icon" />
              <span>{{ currentDept ? '部门详情' : '部门信息' }}</span>
            </div>
          </template>
          <template #extra>
            <a-space v-if="currentDept && canEdit">
              <a-button
                v-if="currentDept && canEdit && (currentDept as any).level !== 6"
                type="primary"
                size="small"
                @click="handleAdd(currentDept)"
              >
                <template #icon>
                  <IconifyIcon icon="lucide:plus" />
                </template>
                新增子部门
              </a-button>
              <a-button size="small" @click="handleEdit(currentDept)">
                <template #icon>
                  <IconifyIcon icon="lucide:pencil" />
                </template>
                编辑
              </a-button>
              <a-popconfirm
                title="确定删除该部门吗？若存在子部门将无法删除，请先移除所有子部门后再操作。"
                @confirm="handleDelete(currentDept)"
              >
                <a-button size="small" danger>
                  <template #icon>
                    <IconifyIcon icon="lucide:trash-2" />
                  </template>
                  删除
                </a-button>
              </a-popconfirm>
            </a-space>
          </template>

          <div v-if="!currentDept" class="empty-tip">
            <a-empty description="请从左侧选择一个部门" />
          </div>
          <a-descriptions v-else :column="2" bordered size="small">
            <a-descriptions-item label="部门名称">
              {{ currentDept.name }}
            </a-descriptions-item>
            <a-descriptions-item label="部门编码">
              {{ currentDept.dept_code }}
            </a-descriptions-item>
            <a-descriptions-item label="简称">
              {{ currentDept.short_name || '-' }}
            </a-descriptions-item>
            <a-descriptions-item label="层级">
              <a-tag :color="levelColor(currentDept.level)">
                {{ levelText(currentDept.level) }}
              </a-tag>
            </a-descriptions-item>
            <a-descriptions-item label="组织类型">
              <a-tag :color="orgTypeColor(currentDept.org_type)">
                {{ orgTypeText(currentDept.org_type) }}
              </a-tag>
            </a-descriptions-item>
            <a-descriptions-item label="直接上级">
              {{ currentDept.supervisor_name || '-' }}
            </a-descriptions-item>
            <a-descriptions-item label="层级路径" :span="2">
              {{ namePath || '-' }}
            </a-descriptions-item>
            <a-descriptions-item label="所在乡镇">
              {{ currentDept.township || '-' }}
            </a-descriptions-item>
            <a-descriptions-item label="排序">
              {{ currentDept.sort_order ?? 0 }}
            </a-descriptions-item>
            <a-descriptions-item label="编制人数">
              {{ currentDept.headcount ? currentDept.headcount : '-' }}
            </a-descriptions-item>
            <a-descriptions-item label="部门负责人">
              {{ managerName || '-' }}
            </a-descriptions-item>
            <a-descriptions-item label="安全负责人">
              {{ safetyManagerName || '-' }}
            </a-descriptions-item>
            <a-descriptions-item label="实际人数">
              <a-tag color="blue">
                {{ currentDept.actual_headcount ?? currentDept.employee_count ?? deptEmployeesTotal }} 人
                <a-tooltip
                  v-if="currentDept.employee_count_approximate"
                  title="班组人数为近似值（父乡镇均分），精确人数需在花名册导入中填写'所属部门'字段后计算"
                >
                  <span style="margin-left: 4px; color: #faad14">~</span>
                </a-tooltip>
              </a-tag>
            </a-descriptions-item>
            <a-descriptions-item label="状态">
              <a-tag :color="currentDept.status === 'active' ? 'green' : 'default'">
                {{ currentDept.status === 'active' ? '启用' : '停用' }}
              </a-tag>
            </a-descriptions-item>
            <a-descriptions-item label="描述" :span="2">
              {{ currentDept.description || '-' }}
            </a-descriptions-item>
          </a-descriptions>

          <!-- 部门员工列表 -->
          <div v-if="currentDept" class="mt-4">
            <Card :bordered="false" class="employee-card">
              <template #title>
                <div class="card-title">
                  <IconifyIcon icon="lucide:users" class="title-icon" />
                  <span>部门员工</span>
                  <span class="employee-count">({{ currentDept?.actual_headcount ?? currentDept?.employee_count ?? deptEmployeesTotal }})</span>
                </div>
              </template>
              <a-empty v-if="deptEmployees.length === 0" description="该部门暂无员工" />
              <a-table
                v-else
                :columns="employeeColumns"
                :data-source="deptEmployees"
                :pagination="deptEmployeePagination"
                :loading="deptEmployeeLoading"
                row-key="id"
                :scroll="{ x: 800 }"
                @change="handleDeptEmployeeTableChange"
              >
                <template #bodyCell="{ column, record, index }">
                  <template v-if="column.key === 'index'">
                    {{ (deptEmployeePagination.current - 1) * deptEmployeePagination.pageSize + index + 1 }}
                  </template>
                  <template v-else-if="column.key === 'name'">
                    {{ record.name }}
                    <a-tag v-if="record.is_public_welfare" color="blue" size="small">公益岗</a-tag>
                  </template>
                  <template v-else-if="column.key === 'age'">
                    {{ record.age ?? '-' }}
                  </template>
                  <template v-else-if="column.key === 'id_card'">
                    {{ record.id_card || '-' }}
                  </template>
                  <template v-else-if="column.key === 'start_date'">
                    {{ formatDate(record.start_date) }}
                  </template>
                </template>
              </a-table>
            </Card>
          </div>
        </Card>
      </Col>
    </Row>

    <!-- 部门编辑弹窗 -->
    <a-modal
      v-model:open="editModalOpen"
      :title="editMode === 'create' ? '新增部门' : '编辑部门'"
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
        <a-form-item v-if="formData.parent_id" label="上级部门">
          <a-input :value="parentDeptName" disabled />
        </a-form-item>
        <a-form-item label="部门编码" name="dept_code">
          <a-input
            v-model:value="formData.dept_code"
            placeholder="如 GROUP-001"
            :disabled="editMode === 'edit'"
          />
        </a-form-item>
        <a-form-item label="部门名称" name="name">
          <a-input v-model:value="formData.name" placeholder="请输入部门名称" />
        </a-form-item>
        <a-form-item label="简称">
          <a-input v-model:value="formData.short_name" placeholder="可选" />
        </a-form-item>
        <a-form-item label="层级" name="level">
          <a-select v-model:value="formData.level" placeholder="请选择层级">
            <Select.Option :value="1">公司</Select.Option>
            <Select.Option :value="2">部门中心</Select.Option>
            <Select.Option :value="3">乡镇作业中心</Select.Option>
            <Select.Option :value="4">部门</Select.Option>
            <Select.Option :value="5">乡镇</Select.Option>
            <Select.Option :value="6">班组</Select.Option>
          </a-select>
        </a-form-item>
        <a-form-item label="所在乡镇">
          <a-input v-model:value="formData.township" placeholder="可选" />
        </a-form-item>
        <a-form-item label="编制人数">
          <a-input-number
            v-model:value="formData.headcount"
            :min="0"
            :max="99999"
            style="width: 100%"
          />
        </a-form-item>
        <a-form-item label="部门负责人">
          <a-select
            v-model:value="formData.manager_id"
            placeholder="请选择部门负责人"
            allow-clear
            show-search
            :filter-option="false"
            :loading="employeeSearchLoading"
            @search="handleEmployeeSearch"
            style="width: 100%"
          >
            <Select.Option
              v-for="emp in employeeOptions"
              :key="emp.employee_id"
              :value="emp.employee_id"
            >
              {{ emp.name }} ({{ emp.employee_code || emp.employee_id }})
            </Select.Option>
          </a-select>
        </a-form-item>
        <a-form-item label="安全负责人">
          <a-select
            v-model:value="formData.safety_manager_id"
            placeholder="请选择安全负责人"
            allow-clear
            show-search
            :filter-option="false"
            :loading="employeeSearchLoading"
            @search="handleEmployeeSearch"
            style="width: 100%"
          >
            <Select.Option
              v-for="emp in employeeOptions"
              :key="emp.employee_id"
              :value="emp.employee_id"
            >
              {{ emp.name }} ({{ emp.employee_code || emp.employee_id }})
            </Select.Option>
          </a-select>
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
        <a-form-item label="描述">
          <a-textarea
            v-model:value="formData.description"
            :rows="3"
            placeholder="可选"
          />
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
import { Card, Col, Row, Select } from 'ant-design-vue';
import type { FormInstance } from 'ant-design-vue';
import {
  createDept,
  deleteDept,
  getDeptEmployees,
  getDeptTree,
  updateDept,
  type EmployeeApi,
} from '#/api/hse/employee';
import {
  getEmployeeSelectorList,
  getEmployeeSelectorBatch,
  type EmployeeSelectorApi,
} from '#/api/hse/employee-selector';

const { hasAccessByRoles } = useAccess();
const canEdit = computed(() => hasAccessByRoles(['admin', 'safety_manager']));

// 树数据
const treeLoading = ref(false);
const treeData = ref<EmployeeApi.DeptNode[]>([]);
const filteredTreeData = ref<EmployeeApi.DeptNode[]>([]);
const searchKeyword = ref('');
const selectedKeys = ref<number[]>([]);
const expandedKeys = ref<number[]>([]);
const currentDept = ref<EmployeeApi.DeptNode | null>(null);

// 部门员工列表
const deptEmployees = ref<EmployeeApi.EmployeeItem[]>([]);
const deptEmployeesTotal = ref(0);
const deptEmployeeLoading = ref(false);
const deptEmployeePagination = reactive({
  current: 1,
  pageSize: 10,
  total: 0,
  showSizeChanger: true,
  showTotal: (total: number) => `共 ${total} 条`,
});

const employeeColumns = [
  { title: '序号', key: 'index', width: 70 },
  { title: '姓名', key: 'name', width: 100 },
  { title: '性别', dataIndex: 'gender', key: 'gender', width: 80 },
  { title: '年龄', key: 'age', width: 80 },
  { title: '身份证件号', dataIndex: 'id_card', key: 'id_card', width: 180 },
  { title: '岗位', dataIndex: 'position_name', key: 'position_name', width: 120 },
  { title: '入职日期', key: 'start_date', width: 120 },
];

const treeFieldNames = {
  children: 'children',
  title: 'name',
  key: 'id',
};

// 弹窗状态
const editModalOpen = ref(false);
const editMode = ref<'create' | 'edit'>('create');
const submitLoading = ref(false);
const formRef = ref<FormInstance>();
const parentDeptName = ref('');
const formData = reactive<EmployeeApi.DeptFormData>({
  dept_code: '',
  name: '',
  short_name: '',
  parent_id: null,
  level: 3,
  township: '',
  headcount: 0,
  sort_order: 0,
  status: 'active',
  description: '',
});

// 部门负责人 / 安全负责人 选择器（提示词-117 P1-6）
const employeeOptions = ref<EmployeeSelectorApi.SelectorItem[]>([]);
const employeeSearchLoading = ref(false);
const managerEmployees = ref<EmployeeSelectorApi.SelectorItem[]>([]);
let employeeSearchTimer: ReturnType<typeof setTimeout> | null = null;

const formRules = {
  dept_code: [
    { required: true, message: '请输入部门编码' },
    { max: 50, message: '编码长度不能超过50' },
  ],
  name: [
    { required: true, message: '请输入部门名称' },
    { max: 100, message: '名称长度不能超过100' },
  ],
  level: [{ required: true, message: '请选择层级' }],
};

// 层级文本/颜色
function levelText(level?: number) {
  const map: Record<number, string> = {
    1: '公司',
    2: '部门中心',
    3: '乡镇作业中心',
    4: '部门',
    5: '乡镇',
    6: '班组',
  };
  return level ? map[level] || '-' : '-';
}

function levelColor(level?: number) {
  const map: Record<number, string> = {
    1: 'purple',
    2: 'blue',
    3: 'cyan',
    4: 'green',
    5: 'orange',
    6: 'default',
  };
  return level ? map[level] || 'default' : 'default';
}

// 组织类型文本/颜色（提示词-125 B-1/B-2：合并树节点 org_type 标签与详情面板）
function orgTypeText(orgType?: string) {
  const map: Record<string, string> = {
    company: '公司',
    department: '职能部门',
    center: '作业中心',
    town_center: '乡镇',
    team: '班组',
  };
  return orgType ? map[orgType] || orgType : '';
}

function orgTypeColor(orgType?: string) {
  const map: Record<string, string> = {
    company: 'red',
    department: 'blue',
    center: 'orange',
    town_center: 'purple',
    team: 'green',
  };
  return orgType ? map[orgType] || 'default' : 'default';
}

// 部门负责人 / 安全负责人 姓名（提示词-115 / 117）
// 优先从已加载的分页员工列表中匹配，否则从批量回显结果中匹配
const managerName = computed(() => {
  const id = currentDept.value?.manager_id;
  if (!id) return null;
  const fromList = deptEmployees.value.find((e) => e.id === id)?.name;
  if (fromList) return fromList;
  return managerEmployees.value.find((e) => e.employee_id === id)?.name || null;
});
const safetyManagerName = computed(() => {
  const id = currentDept.value?.safety_manager_id;
  if (!id) return null;
  const fromList = deptEmployees.value.find((e) => e.id === id)?.name;
  if (fromList) return fromList;
  return managerEmployees.value.find((e) => e.employee_id === id)?.name || null;
});

// 层级路径：从 treeData 递归解析 ID 路径为名称路径（提示词-115，原"所属区域"语义修正）
const namePath = computed(() => {
  if (!currentDept.value) return '-';
  const names = findPathNames(treeData.value, currentDept.value.id);
  return names.length ? names.join(' / ') : currentDept.value.path || '-';
});

// 递归查找从根到目标节点的名称路径
function findPathNames(
  nodes: EmployeeApi.DeptNode[],
  targetId: number,
  current: string[] = [],
): string[] {
  for (const n of nodes) {
    const next = [...current, n.name];
    if (n.id === targetId) return next;
    if (n.children) {
      const found = findPathNames(n.children, targetId, next);
      if (found.length) return found;
    }
  }
  return [];
}

// 加载员工选择器选项（弹窗打开时调用；合并当前已选负责人确保回显）
async function ensureEmployeeOptions(
  keyword?: string,
  managerId?: number,
  safetyManagerId?: number,
) {
  employeeSearchLoading.value = true;
  try {
    const base = await getEmployeeSelectorList({ limit: 100, keyword });
    const list: EmployeeSelectorApi.SelectorItem[] = [...(base || [])];
    const ids = [managerId, safetyManagerId].filter((x): x is number => !!x);
    if (ids.length > 0) {
      const extra = await getEmployeeSelectorBatch(ids);
      const have = new Set(list.map((e) => e.employee_id));
      for (const e of extra || []) {
        if (!have.has(e.employee_id)) list.push(e);
      }
    }
    employeeOptions.value = list;
  } catch {
    // 错误提示已由拦截器处理
  } finally {
    employeeSearchLoading.value = false;
  }
}

// 远程搜索负责人（防抖，提示词-117 P1-6）
function handleEmployeeSearch(value: string) {
  if (employeeSearchTimer) clearTimeout(employeeSearchTimer);
  employeeSearchTimer = setTimeout(() => {
    ensureEmployeeOptions(
      value || undefined,
      currentDept.value?.manager_id,
      currentDept.value?.safety_manager_id,
    ).catch(() => {});
  }, 300);
}

// 选中部门时回显负责人姓名（批量查询，覆盖分页列表未包含的情况）
async function loadManagerNames(dept: EmployeeApi.DeptNode) {
  const ids = [dept.manager_id, dept.safety_manager_id].filter(
    (x): x is number => !!x,
  );
  if (ids.length === 0) {
    managerEmployees.value = [];
    return;
  }
  try {
    managerEmployees.value = await getEmployeeSelectorBatch(ids);
  } catch {
    managerEmployees.value = [];
  }
}

// 加载部门树
async function loadTree() {
  treeLoading.value = true;
  try {
    const data = await getDeptTree({ includeInactive: true });
    treeData.value = data || [];
    filteredTreeData.value = treeData.value;
    // 默认展开第一层
    if (treeData.value.length > 0) {
      expandedKeys.value = treeData.value.map((node) => node.id);
    }
  } catch {
    // 错误提示已由拦截器处理
  } finally {
    treeLoading.value = false;
  }
}

// 树搜索过滤
function filterTree() {
  const keyword = searchKeyword.value.trim();
  if (!keyword) {
    filteredTreeData.value = treeData.value;
    return;
  }
  const filterNodes = (
    nodes: EmployeeApi.DeptNode[],
  ): EmployeeApi.DeptNode[] => {
    const result: EmployeeApi.DeptNode[] = [];
    for (const node of nodes) {
      const matched =
        node.name.toLowerCase().includes(keyword.toLowerCase()) ||
        node.dept_code?.toLowerCase().includes(keyword.toLowerCase());
      const children = node.children ? filterNodes(node.children) : [];
      if (matched || children.length > 0) {
        result.push({ ...node, children });
      }
    }
    return result;
  };
  filteredTreeData.value = filterNodes(treeData.value);
}

// 选中节点
function handleSelect(keys: (string | number)[], info: any) {
  if (keys.length === 0) {
    currentDept.value = null;
    deptEmployees.value = [];
    deptEmployeesTotal.value = 0;
    return;
  }
  currentDept.value = info.node as EmployeeApi.DeptNode;
  deptEmployeePagination.current = 1;
  loadDeptEmployees();
  loadManagerNames(currentDept.value);
}

// 加载部门员工
async function loadDeptEmployees() {
  if (!currentDept.value) return;
  deptEmployeeLoading.value = true;
  try {
    const data = await getDeptEmployees(currentDept.value.id, {
      page: deptEmployeePagination.current,
      pageSize: deptEmployeePagination.pageSize,
    });
    deptEmployees.value = data.list || [];
    deptEmployeesTotal.value = data.total || 0;
    deptEmployeePagination.total = data.total || 0;
    deptEmployeePagination.current = data.page || 1;
    deptEmployeePagination.pageSize = data.pageSize || 10;
  } catch {
    // 错误提示已由拦截器处理
  } finally {
    deptEmployeeLoading.value = false;
  }
}

// 部门员工表格分页变化
function handleDeptEmployeeTableChange(pagination: { current: number; pageSize: number }) {
  deptEmployeePagination.current = pagination.current;
  deptEmployeePagination.pageSize = pagination.pageSize;
  loadDeptEmployees();
}

// 日期格式化
function formatDate(dateStr?: string) {
  if (!dateStr) return '-';
  return dateStr.slice(0, 10);
}

// 新增
function handleAdd(parent: EmployeeApi.DeptNode | null) {
  editMode.value = 'create';
  parentDeptName.value = parent?.name || '';
  Object.assign(formData, {
    dept_code: '',
    name: '',
    short_name: '',
    parent_id: parent?.id || null,
    level: parent ? Math.min((parent.level || 3) + 1, 6) : 1,
    township: parent?.township || '',
    headcount: 0,
    sort_order: 0,
    status: 'active',
    description: '',
  });
  ensureEmployeeOptions(undefined).catch(() => {});
  editModalOpen.value = true;
}

// 编辑
function handleEdit(record: EmployeeApi.DeptNode) {
  editMode.value = 'edit';
  parentDeptName.value = '';
  // 查找父部门名称
  if (record.parent_id) {
    const findParent = (
      nodes: EmployeeApi.DeptNode[],
    ): EmployeeApi.DeptNode | null => {
      for (const node of nodes) {
        if (node.id === record.parent_id) return node;
        if (node.children) {
          const found = findParent(node.children);
          if (found) return found;
        }
      }
      return null;
    };
    const parent = findParent(treeData.value);
    parentDeptName.value = parent?.name || '';
  }
  Object.assign(formData, {
    dept_code: record.dept_code,
    name: record.name,
    short_name: record.short_name || '',
    parent_id: record.parent_id || null,
    level: record.level,
    township: record.township || '',
    manager_id: record.manager_id,
    safety_manager_id: record.safety_manager_id,
    headcount: record.headcount || 0,
    sort_order: record.sort_order || 0,
    status: record.status || 'active',
    description: record.description || '',
  });
  ensureEmployeeOptions(undefined, record.manager_id, record.safety_manager_id).catch(
    () => {},
  );
  editModalOpen.value = true;
}

// 提交
async function handleSubmit() {
  try {
    await formRef.value?.validate();
    submitLoading.value = true;
    if (editMode.value === 'create') {
      await createDept(formData);
      message.success('新增成功');
    } else if (currentDept.value) {
      await updateDept(currentDept.value.id, formData);
      message.success('更新成功');
    }
    editModalOpen.value = false;
    await loadTree();
    // 重新选中
    if (currentDept.value) {
      selectedKeys.value = [currentDept.value.id];
    }
  } catch (err: any) {
    if (err?.errorFields) return; // 表单校验错误
    // 错误提示已由拦截器处理
  } finally {
    submitLoading.value = false;
  }
}

// 删除
async function handleDelete(record: EmployeeApi.DeptNode) {
  try {
    await deleteDept(record.id);
    message.success('删除成功');
    currentDept.value = null;
    selectedKeys.value = [];
    await loadTree();
  } catch {
    // 错误提示已由拦截器处理
  }
}

onMounted(() => {
  loadTree();
});
</script>

<style scoped>
.hse-page {
  padding: 16px;
}

.tree-card {
  border-radius: 8px;
}

.card-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.title-icon {
  font-size: 18px;
  color: hsl(var(--primary));
}

.empty-tip {
  padding: 40px 0;
  text-align: center;
}

.node-code {
  color: hsl(var(--muted-foreground));
  font-size: 12px;
  margin-left: 4px;
}

.node-level-tag {
  margin-left: 4px;
  font-size: 12px;
  line-height: 18px;
}

.node-inactive {
  color: hsl(var(--muted-foreground));
  text-decoration: line-through;
}

.mb-3 {
  margin-bottom: 12px;
}
</style>
