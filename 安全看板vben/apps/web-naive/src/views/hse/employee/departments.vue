<script lang="ts" setup>
/**
 * 组织管理（web-naive 试点 · 阶段05）
 * 双列布局：左侧部门树 + 右侧部门详情 / 部门员工（HseDataGrid + VXE，真实分页 total）。
 * 复用真实既有 API（server/routes/hse-employee.js），禁 mock、禁猜测字段、禁新增后端端点。
 */
import { computed, h, onMounted, reactive, ref } from 'vue';

import { useAccess } from '@vben/access';
import {
  NAlert,
  NButton,
  NDescriptions,
  NDescriptionsItem,
  NEmpty,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NModal,
  NPopconfirm,
  NRadio,
  NRadioGroup,
  NSelect,
  NSpace,
  NSpin,
  NTag,
  NText,
  NTree,
  NTooltip,
  type FormInst,
  type TreeOption,
} from 'naive-ui';
import { List, Menu, PanelLeft, Plus, RotateCw, IconifyIcon } from '@vben/icons';

import {
  HseDataGrid,
  HsePageLayout,
  HseSplitPane,
  HseStatusTag,
} from '#/components/hse';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';
import {
  createDept,
  deleteDept,
  getDeptEmployees,
  getDeptTree,
  getEmployeeSelectorBatch,
  getEmployeeSelectorList,
  updateDept,
  type EmployeeApi,
  type EmployeeSelectorItem,
} from '#/api/hse/employee';
import { message } from '#/adapter/naive';

defineOptions({ name: 'PersonnelDepartments' });

// 写操作权限：仅 admin（用户决策：safety_manager 对组织管理可见只读，不显示新增/编辑/删除）
const { hasAccessByRoles } = useAccess();
const canEdit = computed(() => hasAccessByRoles(['admin']));

// ===================== 部门树 =====================
const treeLoading = ref(false);
const treeData = ref<EmployeeApi.DeptNode[]>([]);
const filteredTreeData = ref<EmployeeApi.DeptNode[]>([]);
const searchKeyword = ref('');
const selectedKeys = ref<(number | string)[]>([]);
const expandedKeys = ref<(number | string)[]>([]);
const currentDept = ref<EmployeeApi.DeptNode | null>(null);

// 部门树字段映射（后端 id 为 ou_X 合成 ID 或数字）
function toTreeOptions(nodes: EmployeeApi.DeptNode[]): TreeOption[] {
  return nodes.map((n) => ({
    key: String(n.id),
    label: n.name,
    dept: n,
    children: n.children?.length ? toTreeOptions(n.children) : undefined,
  }));
}
const treeOptions = computed(() => toTreeOptions(filteredTreeData.value));

// 自定义节点渲染：名称 + 语义标签（组织类型或层级，二选一避免「公司/公司」重复）+ 编码 + 停用样式
function renderNodeLabel(props: { option: TreeOption }) {
  const option = props.option;
  const d = (option as any).dept as EmployeeApi.DeptNode | undefined;
  if (!d) return option.label as string;
  // 有 org_type 时优先显示组织类型（层级语义已隐含在类型中），否则显示 L{n} 层级文本
  const tagLabel = isTopManagement(d)
    ? topManagementText()
    : d.org_type
      ? orgTypeText(d.org_type)
      : d.level
        ? levelText(d.level)
        : '';
  const tagType = isTopManagement(d)
    ? topManagementTag()
    : d.org_type
      ? orgTypeTag(d.org_type)
      : d.level
        ? levelTag(d.level)
        : 'neutral';
  return h('span', { class: { 'node-inactive': d.status === 'inactive' } }, [
    h('span', { style: 'margin-right:4px' }, d.name),
    tagLabel
      ? h(HseStatusTag, { type: tagType, size: 'small', label: tagLabel })
      : null,
  ]);
}

// 层级 / 组织类型语义
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
function levelTag(level?: number): 'success' | 'info' | 'warning' | 'danger' | 'neutral' {
  const map: Record<number, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
    1: 'danger',
    2: 'info',
    3: 'warning',
    4: 'success',
    5: 'warning',
    6: 'neutral',
  };
  return level ? map[level] || 'neutral' : 'neutral';
}
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
function orgTypeTag(orgType?: string): 'success' | 'info' | 'warning' | 'danger' | 'neutral' {
  const map: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
    company: 'danger',
    department: 'info',
    center: 'warning',
    town_center: 'warning',
    team: 'success',
  };
  return orgType ? map[orgType] || 'neutral' : 'neutral';
}
// 「项目管理层」为公司一把手/总经理所在的管理层，虽库内 org_type 仍为 department（作业/考核等模块沿用该口径，不改数据以免影响他模块），
// 本页仅从展示层将其标识为「管理层」而非「职能部门」。
function isTopManagement(d?: { org_code?: string; name?: string }) {
  return d ? d.org_code === 'DEPT-MANAGE' || d.name === '项目管理层' : false;
}
function topManagementText() {
  return '管理层';
}
function topManagementTag(): 'success' | 'info' | 'warning' | 'danger' | 'neutral' {
  return 'danger';
}

// 加载部门树
async function loadTree() {
  treeLoading.value = true;
  try {
    const data = await getDeptTree({ includeInactive: true });
    treeData.value = data || [];
    filteredTreeData.value = treeData.value;
    if (treeData.value.length > 0) {
      expandedKeys.value = treeData.value.map((n) => String(n.id));
    }
  } catch {
    /* 拦截器已提示 */
  } finally {
    treeLoading.value = false;
  }
}

// 树搜索过滤（名称 / 编码）
function filterTree() {
  const keyword = searchKeyword.value.trim();
  if (!keyword) {
    filteredTreeData.value = treeData.value;
    return;
  }
  const filterNodes = (nodes: EmployeeApi.DeptNode[]): EmployeeApi.DeptNode[] => {
    const result: EmployeeApi.DeptNode[] = [];
    for (const node of nodes) {
      const matched =
        node.name.toLowerCase().includes(keyword.toLowerCase()) ||
        (node.dept_code || '').toLowerCase().includes(keyword.toLowerCase());
      const children = node.children ? filterNodes(node.children) : [];
      if (matched || children.length > 0) {
        result.push({ ...node, children });
      }
    }
    return result;
  };
  filteredTreeData.value = filterNodes(treeData.value);
}

// 选中节点（NTree @update:selected-keys 第二参数为选中项数组，含 null）
function handleSelect(keys: (number | string)[], options: (TreeOption | null)[]) {
  selectedKeys.value = keys;
  if (keys.length === 0) {
    currentDept.value = null;
    deptEmployees.value = [];
    deptEmployeesTotal.value = 0;
    return;
  }
  const node = (options?.[0] as any)?.dept as EmployeeApi.DeptNode | undefined;
  currentDept.value = node || null;
  deptEmployeePagination.current = 1;
  loadDeptEmployees();
  loadManagerNames(currentDept.value);
}

// ===================== 部门详情 =====================
// 层级路径
const namePath = computed(() => {
  if (!currentDept.value) return '-';
  const names = findPathNames(treeData.value, currentDept.value.id);
  return names.length ? names.join(' / ') : currentDept.value.path || '-';
});
function findPathNames(nodes: EmployeeApi.DeptNode[], targetId: number | string, current: string[] = []): string[] {
  for (const n of nodes) {
    const next = [...current, n.name];
    if (String(n.id) === String(targetId)) return next;
    if (n.children) {
      const found = findPathNames(n.children, targetId, next);
      if (found.length) return found;
    }
  }
  return [];
}

// 负责人 / 安全负责人姓名回显
const managerEmployees = ref<EmployeeSelectorItem[]>([]);
const managerName = computed(() => {
  const id = currentDept.value?.manager_id;
  if (!id) return null;
  return managerEmployees.value.find((e) => e.employee_id === id)?.name || null;
});
const safetyManagerName = computed(() => {
  const id = currentDept.value?.safety_manager_id;
  if (!id) return null;
  return managerEmployees.value.find((e) => e.employee_id === id)?.name || null;
});
async function loadManagerNames(dept: EmployeeApi.DeptNode | null) {
  const ids = [dept?.manager_id, dept?.safety_manager_id].filter(
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

// ===================== 部门员工列表（HseDataGrid + VXE） =====================
const deptEmployees = ref<EmployeeApi.EmployeeItem[]>([]);
const deptEmployeesTotal = ref(0);
const deptEmployeeLoading = ref(false);
const deptEmployeePagination = reactive({
  current: 1,
  pageSize: 10,
});

// 收集自节点起所有后代组织单元的真实 org_unit_id（班组叶子无 org_unit_id，且共享其所在乡镇 ou，无需计入）
function collectOrgUnitIds(node: EmployeeApi.DeptNode): number[] {
  const self = node.org_type !== 'team' && node.org_unit_id != null ? [node.org_unit_id] : [];
  for (const c of node.children || []) self.push(...collectOrgUnitIds(c));
  return self;
}

async function loadDeptEmployees() {
  if (!currentDept.value) return;
  deptEmployeeLoading.value = true;
  try {
    const base = {
      page: deptEmployeePagination.current,
      pageSize: deptEmployeePagination.pageSize,
    };
    let params: { page?: number; pageSize?: number; ouIds?: string; deptName?: string } = base;
    // 班组（如「长官镇一班」）：按 ea.dept_name 精确过滤该班人员
    if (currentDept.value.org_type === 'team') {
      params = { ...base, deptName: String(currentDept.value.name) };
    }
    // 组织单元（公司/作业中心/乡镇）：级联收集所有后代 ou id，展示整棵子树人员
    else {
      const ids = collectOrgUnitIds(currentDept.value);
      if (ids.length > 0) params = { ...base, ouIds: ids.join(',') };
    }
    const data = await getDeptEmployees(currentDept.value.id, params);
    deptEmployees.value = data.list || [];
    deptEmployeesTotal.value = data.total || 0;
  } catch {
    deptEmployees.value = [];
    deptEmployeesTotal.value = 0;
  } finally {
    deptEmployeeLoading.value = false;
  }
}

function onDeptEmployeePageChange(payload: { currentPage: number; pageSize: number }) {
  deptEmployeePagination.current = payload.currentPage;
  deptEmployeePagination.pageSize = payload.pageSize;
  loadDeptEmployees();
}

function formatDate(dateStr?: string) {
  if (!dateStr) return '-';
  return dateStr.slice(0, 10);
}

// 部门员工「查看」：复用已加载的分页数据，仅前端只读展示，不调用后端
const employeeDetailVisible = ref(false);
const employeeDetail = ref<EmployeeApi.EmployeeItem | null>(null);
function openEmployeeDetail(row: EmployeeApi.EmployeeItem) {
  employeeDetail.value = row;
  employeeDetailVisible.value = true;
}

const employeeColumns = computed<VxeTableGridColumns>(() => [
  { title: '序号', field: '_index', width: 70, align: 'center' },
  {
    title: '姓名',
    field: 'name',
    width: 120,
    align: 'center',
    showOverflow: 'tooltip',
    slots: { default: 'empName' },
  },
  { title: '性别', field: 'gender', width: 80, align: 'center' },
  { title: '年龄', field: 'age', width: 80, align: 'center' },
  {
    title: '身份证件号',
    field: 'id_card',
    width: 190,
    align: 'center',
    showOverflow: 'tooltip',
  },
  {
    title: '岗位',
    field: 'position_name',
    width: 140,
    align: 'center',
    showOverflow: 'tooltip',
  },
  { title: '入职日期', field: 'start_date', width: 120, align: 'center', slots: { default: 'empStartDate' }, formatter: ({ cellValue }) => (cellValue ? formatDate(cellValue) : '-') },
  {
    title: '操作',
    field: 'action',
    width: 90,
    align: 'center',
    fixed: 'right',
    slots: { default: 'action' },
  },
]);

// ===================== 新增 / 编辑弹窗 =====================
const editModalOpen = ref(false);
const editMode = ref<'create' | 'edit'>('create');
const submitLoading = ref(false);
const formRef = ref<FormInst | null>(null);
const parentDeptName = ref('');
const formData = reactive<EmployeeApi.DeptFormData>({
  dept_code: '',
  name: '',
  short_name: '',
  parent_id: null,
  level: 3,
  township: '',
  manager_id: null,
  safety_manager_id: null,
  headcount: 0,
  sort_order: 0,
  status: 'active',
  description: '',
});

const formRules = {
  dept_code: [
    { required: true, message: '请输入部门编码', trigger: ['blur', 'input'] },
    { max: 50, message: '编码长度不能超过50', trigger: ['blur', 'input'] },
  ],
  name: [
    { required: true, message: '请输入部门名称', trigger: ['blur', 'input'] },
    { max: 100, message: '名称长度不能超过100', trigger: ['blur', 'input'] },
  ],
  level: [{ required: true, type: 'number' as const, message: '请选择层级', trigger: ['blur', 'change'] }],
};

// 负责人选项
const employeeOptions = ref<EmployeeSelectorItem[]>([]);
const employeeSearchLoading = ref(false);
let employeeSearchTimer: ReturnType<typeof setTimeout> | null = null;

async function ensureEmployeeOptions(
  keyword?: string,
  managerId?: number | null,
  safetyManagerId?: number | null,
) {
  employeeSearchLoading.value = true;
  try {
    const base = await getEmployeeSelectorList({ limit: 100, keyword });
    const list: EmployeeSelectorItem[] = [...(base || [])];
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
    /* 拦截器已提示 */
  } finally {
    employeeSearchLoading.value = false;
  }
}
function handleEmployeeSearch(value: string) {
  if (employeeSearchTimer) clearTimeout(employeeSearchTimer);
  employeeSearchTimer = setTimeout(() => {
    ensureEmployeeOptions(
      value || undefined,
      formData.manager_id,
      formData.safety_manager_id,
    ).catch(() => {});
  }, 300);
}

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
    manager_id: null,
    safety_manager_id: null,
    headcount: 0,
    sort_order: 0,
    status: 'active',
    description: '',
  });
  ensureEmployeeOptions(undefined).catch(() => {});
  editModalOpen.value = true;
}

function findParentDept(nodes: EmployeeApi.DeptNode[], id: number | string): EmployeeApi.DeptNode | null {
  for (const n of nodes) {
    if (String(n.id) === String(id)) return n;
    if (n.children) {
      const found = findParentDept(n.children, id);
      if (found) return found;
    }
  }
  return null;
}

function handleEdit(record: EmployeeApi.DeptNode) {
  editMode.value = 'edit';
  parentDeptName.value = '';
  if (record.parent_id) {
    const parent = findParentDept(treeData.value, record.parent_id);
    parentDeptName.value = parent?.name || '';
  }
  Object.assign(formData, {
    dept_code: record.dept_code,
    name: record.name,
    short_name: record.short_name || '',
    parent_id: record.parent_id || null,
    level: record.level,
    township: record.township || '',
    manager_id: record.manager_id ?? null,
    safety_manager_id: record.safety_manager_id ?? null,
    headcount: record.headcount || 0,
    sort_order: record.sort_order || 0,
    status: record.status || 'active',
    description: record.description || '',
  });
  ensureEmployeeOptions(undefined, record.manager_id, record.safety_manager_id).catch(() => {});
  editModalOpen.value = true;
}

async function handleSubmit() {
  // 先执行 Naive 表单校验：失败时抛错（不调用 API、弹窗保持、由表单显示错误/聚焦）
  try {
    await formRef.value?.validate();
  } catch {
    return; // 校验失败：不进入加载态、不调用新增/更新 API
  }
  submitLoading.value = true;
  try {
    if (editMode.value === 'create') {
      await createDept(formData);
      message.success('新增成功');
    } else if (currentDept.value) {
      await updateDept(Number(currentDept.value.id), formData);
      message.success('更新成功');
    }
    editModalOpen.value = false;
    await loadTree();
    if (currentDept.value) {
      selectedKeys.value = [String(currentDept.value.id)];
    }
  } catch {
    // 接口失败：弹窗保持打开，错误提示由拦截器处理，不显示成功
  } finally {
    submitLoading.value = false;
  }
}

async function handleDelete(record: EmployeeApi.DeptNode) {
  try {
    await deleteDept(Number(record.id));
    message.success('删除成功');
    currentDept.value = null;
    selectedKeys.value = [];
    await loadTree();
  } catch {
    // 删除失败（如存在子部门）：错误提示由拦截器处理
  }
}

// 序号计算（VXE 行索引基于当前页）
function empIndex(_row: EmployeeApi.EmployeeItem, index: number) {
  return (deptEmployeePagination.current - 1) * deptEmployeePagination.pageSize + index + 1;
}

onMounted(() => {
  loadTree();
});
</script>

<template>
  <HsePageLayout :title="$t('page.hse.departments')" description="部门树与部门详情（双列布局试点）">
    <HseSplitPane
      title="组织架构"
      storage-key="hse-dept-split-width"
      :default-width="280"
    >
      <template #left>
        <div class="dept-tree-panel">
          <div class="panel-head">
            <div class="panel-title">
              <Menu class="size-4 title-icon" />
              <span>{{ $t('page.hse.departments') }}</span>
            </div>
            <div class="panel-actions">
              <!-- 图标按钮 Tooltip：NTooltip trigger 槽必须单根，用语义中性的 span 包裹 NButton
                   （避免 getFirstSlotVNode "should have exactly one child" 控制台错误） -->
              <NTooltip>
                <template #trigger>
                  <span class="btn-trigger-wrap">
                    <NButton
                      v-if="canEdit"
                      type="primary"
                      size="tiny"
                      aria-label="新增根部门"
                      @click="handleAdd(null)"
                    >
                      <template #icon><Plus class="size-3.5" /></template>
                    </NButton>
                  </span>
                </template>
                新增根部门
              </NTooltip>
              <NTooltip>
                <template #trigger>
                  <span class="btn-trigger-wrap">
                    <NButton
                      size="tiny"
                      quaternary
                      aria-label="刷新"
                      @click="loadTree"
                    >
                      <template #icon><RotateCw class="size-3.5" /></template>
                    </NButton>
                  </span>
                </template>
                刷新
              </NTooltip>
            </div>
          </div>

          <NInput
            v-model:value="searchKeyword"
            placeholder="搜索部门名称/编码"
            clearable
            class="tree-search"
            @update:value="filterTree"
            @keyup.enter="filterTree"
          />

          <NSpin :show="treeLoading">
            <NEmpty v-if="filteredTreeData.length === 0 && !treeLoading" description="暂无部门数据" class="py-10" />
              <NTree
                v-else
                :data="treeOptions"
                :selected-keys="selectedKeys"
                :expanded-keys="expandedKeys"
                selectable
                block-line
                :show-line="true"
                :render-label="renderNodeLabel"
                @update:selected-keys="handleSelect"
                @update:expanded-keys="(v: any[]) => (expandedKeys = v)"
              />
            </NSpin>
        </div>
      </template>

      <template #right>
        <div class="dept-detail-panel">
          <NEmpty v-if="!currentDept" description="请从左侧选择一个部门" class="py-20" />

          <template v-else>
            <div class="detail-head">
              <div class="panel-title">
                <PanelLeft class="size-4 title-icon" />
                <span>部门详情</span>
              </div>
              <NSpace v-if="canEdit" size="small">
                <NButton
                  v-if="currentDept.level !== 6"
                  type="primary"
                  size="tiny"
                  @click="handleAdd(currentDept)"
                >
                  <template #icon><Plus class="size-3.5" /></template>
                  新增子部门
                </NButton>
                <NButton size="tiny" @click="handleEdit(currentDept)">
                  <template #icon><IconifyIcon icon="lucide:pencil" class="size-3.5" /></template>
                  编辑
                </NButton>
                <NPopconfirm
                  @positive-click="handleDelete(currentDept)"
                >
                  <template #trigger>
                    <NButton size="tiny" type="error" secondary>
                      <template #icon><IconifyIcon icon="lucide:trash-2" class="size-3.5" /></template>
                      删除
                    </NButton>
                  </template>
                  确定删除该部门吗？若存在子部门将无法删除，请先移除所有子部门后再操作。
                </NPopconfirm>
              </NSpace>
            </div>

            <NDescriptions :column="2" bordered size="small" class="detail-desc">
              <NDescriptionsItem label="部门名称">{{ currentDept.name }}</NDescriptionsItem>
              <NDescriptionsItem label="部门编码">{{ currentDept.dept_code }}</NDescriptionsItem>
              <NDescriptionsItem label="简称">{{ currentDept.short_name || '-' }}</NDescriptionsItem>
              <NDescriptionsItem label="层级">
                <HseStatusTag :type="levelTag(currentDept.level)" size="small" :label="levelText(currentDept.level)" />
              </NDescriptionsItem>
              <NDescriptionsItem label="组织类型">
                <HseStatusTag
                  :type="isTopManagement(currentDept) ? topManagementTag() : orgTypeTag(currentDept.org_type)"
                  size="small"
                  :label="isTopManagement(currentDept) ? topManagementText() : orgTypeText(currentDept.org_type) || '-'"
                />
              </NDescriptionsItem>
              <NDescriptionsItem label="直接上级">{{ currentDept.supervisor_name || '-' }}</NDescriptionsItem>
              <NDescriptionsItem label="层级路径" :span="2">{{ namePath }}</NDescriptionsItem>
              <NDescriptionsItem label="所在乡镇">{{ currentDept.township || '-' }}</NDescriptionsItem>
              <NDescriptionsItem label="排序">{{ currentDept.sort_order ?? 0 }}</NDescriptionsItem>
              <NDescriptionsItem label="编制人数">{{ deptEmployeesTotal }} 人</NDescriptionsItem>
              <NDescriptionsItem label="部门负责人">{{ currentDept.manager_name || managerName || '-' }}</NDescriptionsItem>
              <NDescriptionsItem label="安全负责人">{{ safetyManagerName || '-' }}</NDescriptionsItem>
              <NDescriptionsItem label="实际人数">
                <NTag size="small" type="info">
                  {{ deptEmployeesTotal }} 人
                </NTag>
              </NDescriptionsItem>
              <NDescriptionsItem label="状态">
                <HseStatusTag
                  :type="currentDept.status === 'active' ? 'success' : 'neutral'"
                  size="small"
                  :label="currentDept.status === 'active' ? '启用' : '停用'"
                />
              </NDescriptionsItem>
              <NDescriptionsItem label="描述" :span="2">{{ currentDept.description || '-' }}</NDescriptionsItem>
            </NDescriptions>

            <!-- 部门员工列表 -->
            <div class="mt-4">
              <div class="panel-title mb-2">
                <List class="size-4 title-icon" />
                <span>部门员工</span>
                <NText depth="3" class="employee-count">
                  ({{ deptEmployeesTotal }})
                </NText>
              </div>
              <NAlert v-if="deptEmployeesTotal === 0 && !deptEmployeeLoading" type="info" :show-icon="true" title="该部门暂无员工" class="mb-2" />
              <HseDataGrid
                :columns="employeeColumns"
                :data="deptEmployees"
                :loading="deptEmployeeLoading"
                :total="deptEmployeesTotal"
                :pager="{ current: deptEmployeePagination.current, pageSize: deptEmployeePagination.pageSize }"
                height="360"
                @page-change="onDeptEmployeePageChange"
              >
                <template #empName="{ row }">
                  <div class="flex items-center gap-1">
                    <span>{{ row.name }}</span>
                    <NTag v-if="row.is_public_welfare" size="tiny" type="info">公益岗</NTag>
                  </div>
                </template>
                <template #empStartDate="{ row }">
                  <span>{{ formatDate(row.start_date) }}</span>
                </template>
                <template #_index="{ row, rowIndex }">
                  <span>{{ empIndex(row, rowIndex) }}</span>
                </template>
                <template #action="{ row }">
                  <NButton size="small" type="primary" quaternary @click="openEmployeeDetail(row)">查看</NButton>
                </template>
              </HseDataGrid>
            </div>
          </template>

          <!-- 部门员工详情（前端只读，复用已加载数据，不调后端） -->
          <NModal
            v-model:show="employeeDetailVisible"
            preset="card"
            title="员工详情"
            style="width: 520px; max-width: 92vw"
            :mask-closable="false"
          >
            <NDescriptions v-if="employeeDetail" :column="1" bordered size="small">
              <NDescriptionsItem label="姓名">{{ employeeDetail.name }}</NDescriptionsItem>
              <NDescriptionsItem label="性别">{{ employeeDetail.gender || '-' }}</NDescriptionsItem>
              <NDescriptionsItem label="年龄">{{ employeeDetail.age ?? '-' }}</NDescriptionsItem>
              <NDescriptionsItem label="身份证号">{{ employeeDetail.id_card || '-' }}</NDescriptionsItem>
              <NDescriptionsItem label="岗位">{{ employeeDetail.position_name || '-' }}</NDescriptionsItem>
              <NDescriptionsItem label="入职日期">{{ employeeDetail.start_date ? employeeDetail.start_date.slice(0, 10) : '-' }}</NDescriptionsItem>
            </NDescriptions>
            <template #footer>
              <NSpace justify="end">
                <NButton @click="employeeDetailVisible = false">关闭</NButton>
              </NSpace>
            </template>
          </NModal>
        </div>
      </template>
    </HseSplitPane>

    <!-- 新增 / 编辑部门弹窗 -->
    <NModal
      v-model:show="editModalOpen"
      preset="card"
      :title="editMode === 'create' ? '新增部门' : '编辑部门'"
      style="width: 620px"
      :mask-closable="false"
    >
      <NForm
        ref="formRef"
        :model="formData"
        :rules="formRules"
        label-placement="left"
        label-width="110"
        require-mark-placement="right-hanging"
      >
        <NFormItem v-if="formData.parent_id" label="上级部门">
          <NInput :value="parentDeptName" disabled />
        </NFormItem>
        <NFormItem label="部门编码" path="dept_code">
          <NInput
            v-model:value="formData.dept_code"
            placeholder="如 GROUP-001"
            :disabled="editMode === 'edit'"
          />
        </NFormItem>
        <NFormItem label="部门名称" path="name">
          <NInput v-model:value="formData.name" placeholder="请输入部门名称" />
        </NFormItem>
        <NFormItem label="简称">
          <NInput v-model:value="formData.short_name" placeholder="可选" />
        </NFormItem>
        <NFormItem label="层级" path="level">
          <NSelect
            v-model:value="formData.level"
            placeholder="请选择层级"
            :options="[
              { label: '公司', value: 1 },
              { label: '部门中心', value: 2 },
              { label: '乡镇作业中心', value: 3 },
              { label: '部门', value: 4 },
              { label: '乡镇', value: 5 },
              { label: '班组', value: 6 },
            ]"
          />
        </NFormItem>
        <NFormItem label="所在乡镇">
          <NInput v-model:value="formData.township" placeholder="可选" />
        </NFormItem>
        <NFormItem label="编制人数">
          <NInputNumber v-model:value="formData.headcount" :min="0" :max="99999" style="width: 100%" />
        </NFormItem>
        <NFormItem label="部门负责人">
          <NSelect
            v-model:value="formData.manager_id"
            placeholder="请选择部门负责人"
            clearable
            filterable
            remote
            :loading="employeeSearchLoading"
            :options="employeeOptions.map((e) => ({ label: `${e.name} (${e.employee_code || e.employee_id})`, value: e.employee_id }))"
            @search="handleEmployeeSearch"
          />
        </NFormItem>
        <NFormItem label="安全负责人">
          <NSelect
            v-model:value="formData.safety_manager_id"
            placeholder="请选择安全负责人"
            clearable
            filterable
            remote
            :loading="employeeSearchLoading"
            :options="employeeOptions.map((e) => ({ label: `${e.name} (${e.employee_code || e.employee_id})`, value: e.employee_id }))"
            @search="handleEmployeeSearch"
          />
        </NFormItem>
        <NFormItem label="排序">
          <NInputNumber v-model:value="formData.sort_order" :min="0" :max="9999" style="width: 100%" />
        </NFormItem>
        <NFormItem label="状态">
          <NRadioGroup v-model:value="formData.status">
            <NRadio value="active">启用</NRadio>
            <NRadio value="inactive">停用</NRadio>
          </NRadioGroup>
        </NFormItem>
        <NFormItem label="描述">
          <NInput
            v-model:value="formData.description"
            type="textarea"
            :rows="3"
            placeholder="可选"
          />
        </NFormItem>
      </NForm>

      <template #footer>
        <NSpace justify="end">
          <NButton @click="editModalOpen = false">取消</NButton>
          <NButton type="primary" :loading="submitLoading" @click="handleSubmit">保存</NButton>
        </NSpace>
      </template>
    </NModal>
  </HsePageLayout>
</template>

<style scoped>
.dept-tree-panel,
.dept-detail-panel {
  height: 100%;
  overflow: auto;
  padding: 12px;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  font-size: 14px;
}

.panel-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* NTooltip trigger 单根包装：保持按钮行内布局 */
.btn-trigger-wrap {
  display: inline-flex;
}

.title-icon {
  color: hsl(var(--primary));
}

.tree-search {
  margin-bottom: 10px;
}

.node-code {
  color: hsl(var(--muted-foreground));
  font-size: 12px;
  margin-left: 4px;
}

.node-inactive {
  color: hsl(var(--muted-foreground));
  text-decoration: line-through;
}

.detail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.detail-desc {
  margin-bottom: 4px;
}

.employee-count {
  font-weight: 400;
  font-size: 12px;
}

.mt-4 {
  margin-top: 16px;
}
</style>
