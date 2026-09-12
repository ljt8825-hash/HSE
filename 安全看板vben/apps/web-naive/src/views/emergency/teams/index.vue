<script lang="ts" setup>
/**
 * 应急队伍管理（web-naive · 阶段04）
 * 统一使用 HSE 公共组件栈；接入真实 API（server/routes/emergency.js）。
 */
import { reactive, ref, onMounted } from 'vue';

import {
  NButton,
  NCard,
  NEmpty,
  NForm,
  NFormItem,
  NGi,
  NInput,
  NModal,
  NPopconfirm,
  NSpace,
  NSelect,
  NStatistic,
} from 'naive-ui';
import { IconifyIcon } from '@vben/icons';
import { $t } from '#/locales';

import {
  HseActionBar,
  HseDataGrid,
  HsePageLayout,
  HseSearchPanel,
  type HseActionKey,
} from '#/components/hse';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';
import {
  createTeam,
  deleteTeam,
  exportTeams,
  generateTeams,
  getTeamList,
  getTeamMembers,
  getTeamStats,
  updateTeam,
  type EmergencyTeamApi,
} from '#/api/hse/emergency';
import { message } from '#/adapter/naive';

defineOptions({ name: 'HseEmergencyTeams' });

// ===================== 映射 =====================
const TEAM_TYPE_OPTIONS = [
  { label: '专职应急队', value: '专职应急队' },
  { label: '兼职应急队', value: '兼职应急队' },
  { label: '志愿消防队', value: '志愿消防队' },
  { label: '专家顾问组', value: '专家顾问组' },
];

// ===================== 列表数据 =====================
const loading = ref(false);
const data = ref<EmergencyTeamApi.EmergencyTeam[]>([]);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(20);
const sortBy = ref<string | undefined>(undefined);
const sortOrder = ref<'asc' | 'desc' | undefined>(undefined);

const searchForm = reactive({ keyword: '', department: '' });

async function loadData() {
  loading.value = true;
  try {
    const res = await getTeamList({
      page: currentPage.value,
      pageSize: pageSize.value,
      keyword: searchForm.keyword || undefined,
      department: searchForm.department || undefined,
      sortField: sortBy.value,
      sortOrder: sortOrder.value,
    });
    data.value = res.list ?? [];
    total.value = res.total ?? 0;
  } catch {
    data.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

const statTotal = ref(0);
const statMemberCount = ref(0);
const statFullTime = ref(0);
const statPartTime = ref(0);

async function loadStats() {
  try {
    const stats = await getTeamStats();
    statTotal.value = stats.total ?? 0;
    statMemberCount.value = stats.memberCount ?? 0;
    statFullTime.value = stats.fullTime ?? 0;
    statPartTime.value = stats.partTime ?? 0;
  } catch {
    /* ignore */
  }
}

function onSearch() {
  currentPage.value = 1;
  loadData();
  loadStats();
}
function onReset() {
  searchForm.keyword = '';
  searchForm.department = '';
  onSearch();
}
function onPageChange(payload: { currentPage: number; pageSize: number }) {
  currentPage.value = payload.currentPage;
  pageSize.value = payload.pageSize;
  loadData();
}

function onSortChange(payload: { sortBy?: string; sortOrder?: 'asc' | 'desc' }) {
  sortBy.value = payload.sortBy;
  sortOrder.value = payload.sortOrder;
  currentPage.value = 1;
  loadData();
}

// ===================== 操作栏 =====================
// 06C-3 对齐基线：应急队伍基线无导入入口（后端无 emergency_teams 导入配置），仅导出+新增
const actionState = ref<
  Partial<Record<HseActionKey, { hidden?: boolean }>>
>({
  downloadTemplate: { hidden: true },
  import: { hidden: true },
});

async function onRefresh() {
  await Promise.all([loadData(), loadStats()]);
}

async function onExport() {
  try {
    const blob = await exportTeams();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = '应急队伍列表.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch {
    message.error('导出失败');
  }
}

// ===================== 一键生成队伍 =====================
const generating = ref(false);

async function onGenerateTeams() {
  generating.value = true;
  try {
    const res = await generateTeams();
    const msg = (res as any)?.message || '生成成功';
    message.success(msg);
    await onRefresh();
  } catch (e: any) {
    message.error(e?.message || '生成失败');
  } finally {
    generating.value = false;
  }
}

// ===================== 队员名单弹窗 =====================
const memberModalVisible = ref(false);
const memberTeamName = ref('');
const memberList = ref<EmergencyTeamApi.TeamMember[]>([]);

async function onShowMembers(row: EmergencyTeamApi.EmergencyTeam) {
  memberTeamName.value = row.name;
  memberList.value = [];
  memberModalVisible.value = true;
  try {
    const members = await getTeamMembers(row.id);
    memberList.value = Array.isArray(members) ? members : [];
  } catch {
    /* 接口失败时显示空名单（错误已由拦截器提示） */
  }
}

// ===================== 新增 / 编辑 / 查看 =====================
const formOpen = ref(false);
const formMode = ref<'create' | 'edit' | 'view'>('create');
const formLoading = ref(false);
const editingId = ref<number | null>(null);
const formModel = reactive<EmergencyTeamApi.TeamFormData>({
  name: '',
  type: '',
  department: '',
  leader_name: '',
  contact_phone: '',
  description: '',
});

function resetForm() {
  formModel.name = '';
  formModel.type = '';
  formModel.department = '';
  formModel.leader_name = '';
  formModel.contact_phone = '';
  formModel.description = '';
}

function openCreate() {
  resetForm();
  formMode.value = 'create';
  editingId.value = null;
  formOpen.value = true;
}
function openEdit(row: EmergencyTeamApi.EmergencyTeam) {
  resetForm();
  formMode.value = 'edit';
  editingId.value = row.id;
  Object.assign(formModel, {
    name: row.name,
    type: row.type ?? '',
    department: row.department ?? '',
    leader_name: row.leader_name ?? '',
    contact_phone: row.contact_phone ?? '',
    description: row.description ?? '',
  });
  formOpen.value = true;
}
function openView(row: EmergencyTeamApi.EmergencyTeam) {
  openEdit(row);
  formMode.value = 'view';
}

async function onSubmit() {
  if (!formModel.name) {
    message.warning('队伍名称不能为空');
    return;
  }
  if (!formModel.type) {
    message.warning('请选择队伍类型');
    return;
  }
  formLoading.value = true;
  try {
    const payload: EmergencyTeamApi.TeamFormData = { ...formModel };
    if (formMode.value === 'edit' && editingId.value != null) {
      await updateTeam(editingId.value, payload);
      message.success('编辑成功');
    } else {
      await createTeam(payload);
      message.success('新增成功');
    }
    formOpen.value = false;
    onRefresh();
  } catch {
    /* 拦截器已提示 */
  } finally {
    formLoading.value = false;
  }
}

async function onDelete(row: EmergencyTeamApi.EmergencyTeam) {
  try {
    await deleteTeam(row.id);
    message.success('删除成功');
    onRefresh();
  } catch {
    /* 拦截器已提示 */
  }
}

// ===================== 表格列 =====================
const teamColumns = ref<VxeTableGridColumns>([
  { title: '队伍名称', field: 'name', minWidth: 180, align: 'center', showOverflow: 'tooltip', slots: { default: 'team_name' } },
  { title: '所属部门', field: 'department', minWidth: 140, align: 'center', showOverflow: 'tooltip' },
  { title: '队长', field: 'leader_name', minWidth: 100, align: 'center' },
  { title: '联系电话', field: 'contact_phone', minWidth: 140, align: 'center' },
  { title: '队员人数', field: 'member_ids', minWidth: 100, align: 'center', sortable: true, slots: { default: 'member_count' } },
  {
    title: '创建时间',
    field: 'created_at',
    minWidth: 120,
    align: 'center',
    sortable: true,
    formatter: ({ cellValue }) => {
      const s = cellValue == null ? '' : String(cellValue);
      return s ? (s.length >= 10 ? s.slice(0, 10) : s) : '-';
    },
  },
  {
    title: '操作',
    field: 'action',
    width: 200,
    align: 'center',
    fixed: 'right',
    slots: { default: 'action' },
  },
]);

onMounted(() => {
  loadData();
  loadStats();
});
</script>

<template>
  <HsePageLayout
    :description="$t('page.hse.emergencyTeamsDesc')"
    :title="$t('page.hse.emergencyTeams')"
  >
    <template #title>
      <div class="flex items-center gap-2 text-lg font-semibold">
        <IconifyIcon icon="lucide:shield-users" :size="20" />
        <span>{{ $t('page.hse.emergencyTeams') }}</span>
      </div>
    </template>
    <template #extra>
      <div class="flex items-center gap-2">
        <NPopconfirm @positive-click="onGenerateTeams">
          <template #trigger>
            <NButton
              :loading="generating"
              size="small"
              type="primary"
              secondary
            >
              <template #icon>
                <IconifyIcon icon="lucide:wand-sparkles" :size="16" />
              </template>
              一键生成队伍
            </NButton>
          </template>
          将依据「组织管理」中的环卫/市政绿化作业中心自动生成应急救援小队，并<strong>替换现有全部队伍</strong>，是否继续？
        </NPopconfirm>
        <HseActionBar
          :actions="actionState"
          @refresh="onRefresh"
          @export="onExport"
          @create="openCreate"
        />
      </div>
    </template>

    <!-- 统计卡 -->
    <div class="mb-4 grid grid-cols-4 gap-3">
      <NCard :bordered="false">
        <NStatistic label="队伍总数" :value="statTotal" />
      </NCard>
      <NCard :bordered="false">
        <NStatistic label="队伍人员数" :value="statMemberCount" />
      </NCard>
      <NCard :bordered="false">
        <NStatistic label="专职队数" :value="statFullTime" />
      </NCard>
      <NCard :bordered="false">
        <NStatistic label="兼职队数" :value="statPartTime" />
      </NCard>
    </div>

    <!-- 搜索 -->
    <HseSearchPanel @query="onSearch" @reset="onReset">
      <NGi>
        <NInput
          v-model:value="searchForm.keyword"
          placeholder="队伍名称/队长/部门"
          clearable
          @keyup.enter="onSearch"
        />
      </NGi>
      <NGi>
        <NInput
          v-model:value="searchForm.department"
          placeholder="所属部门"
          clearable
          @keyup.enter="onSearch"
        />
      </NGi>
    </HseSearchPanel>

    <!-- 表格 -->
    <HseDataGrid
      :columns="teamColumns"
      :data="data"
      :loading="loading"
      :pager="true"
      :total="total"
      @page-change="onPageChange"
      @sort-change="onSortChange"
    >
      <template #team_name="{ row }">
        <NButton size="small" type="primary" text @click="onShowMembers(row)">
          {{ row.name }}
        </NButton>
      </template>
      <template #member_count="{ row }">
        {{ Array.isArray(row.member_ids) ? row.member_ids.length : 0 }}
      </template>
      <template #action="{ row }">
        <NSpace justify="center">
          <NButton size="small" type="primary" quaternary @click="openView(row)">
            查看
          </NButton>
          <NButton size="small" type="primary" quaternary @click="openEdit(row)">
            编辑
          </NButton>
          <NPopconfirm @positive-click="onDelete(row)">
            <template #trigger>
              <NButton size="small" type="error" quaternary>删除</NButton>
            </template>
            确定删除该队伍吗？
          </NPopconfirm>
        </NSpace>
      </template>
    </HseDataGrid>

    <!-- 新增 / 编辑 / 查看 弹窗 -->
    <NModal
      v-model:show="formOpen"
      :title="
        formMode === 'create'
          ? '新增应急队伍'
          : formMode === 'edit'
            ? '编辑应急队伍'
            : '队伍详情'
      "
      preset="card"
      style="width: 680px; max-width: 92vw"
      :mask-closable="false"
    >
      <NForm :disabled="formMode === 'view'" label-placement="top">
        <div class="grid grid-cols-2 gap-x-4">
          <NFormItem label="队伍名称" required>
            <NInput v-model:value="formModel.name" placeholder="请输入队伍名称" />
          </NFormItem>
          <NFormItem label="队伍类型" required>
            <NSelect
              v-model:value="formModel.type"
              placeholder="请选择队伍类型"
              :options="TEAM_TYPE_OPTIONS"
            />
          </NFormItem>
          <NFormItem label="所属部门">
            <NInput v-model:value="formModel.department" placeholder="请输入所属部门" />
          </NFormItem>
          <NFormItem label="队长">
            <NInput v-model:value="formModel.leader_name" placeholder="请输入队长姓名" />
          </NFormItem>
          <NFormItem label="联系电话">
            <NInput v-model:value="formModel.contact_phone" placeholder="请输入联系电话" />
          </NFormItem>
        </div>
        <NFormItem label="队伍描述">
          <NInput
            v-model:value="formModel.description"
            type="textarea"
            :rows="3"
            placeholder="选填，队伍职责与简介"
          />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="formOpen = false">关闭</NButton>
          <NButton
            v-if="formMode !== 'view'"
            type="primary"
            :loading="formLoading"
            @click="onSubmit"
          >
            保存
          </NButton>
        </NSpace>
      </template>
    </NModal>

    <!-- 队员名单弹窗 -->
    <NModal
      v-model:show="memberModalVisible"
      :title="`队员名单 - ${memberTeamName}`"
      preset="card"
      style="width: 460px; max-width: 92vw"
    >
      <div class="mb-3 text-sm text-gray-400">共 {{ memberList.length }} 名队员</div>
      <div v-if="memberList.length" class="max-h-80 overflow-auto">
        <div
          v-for="(m, i) in memberList"
          :key="m.id ?? i"
          class="flex items-center justify-between border-b border-gray-100 py-2 last:border-b-0"
        >
          <span class="text-gray-800">{{ m.employee_name ?? m.employeeName ?? '-' }}</span>
          <span v-if="m.role" class="text-xs text-gray-400">{{ m.role }}</span>
        </div>
      </div>
      <NEmpty v-else description="暂无队员" />
      <template #footer>
        <NSpace justify="end">
          <NButton @click="memberModalVisible = false">关闭</NButton>
        </NSpace>
      </template>
    </NModal>
  </HsePageLayout>
</template>
