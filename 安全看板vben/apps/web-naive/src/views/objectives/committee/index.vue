<script lang="ts" setup>
/**
 * 安全人员及安委会（web-naive · 阶段06B-2）
 * 契约来源：apps/web-antd/src/views/objectives/committee/index.vue + apps/web-antd/src/api/hse/goals.ts
 * Tab1 安全人员：从既有员工接口查询安环管理部花名册，只读（无新增/编辑/删除能力）；
 *               关键词/状态筛选、服务端分页、统计卡、人员详情抽屉。
 * Tab2 安委会：活动台账列表/关键词筛选/分页、查看文件（受保护 Blob 预览）、创建/编辑/删除；
 *              PDF 上传（限制 .pdf）、Excel 模板下载与 Excel 导入（严格复用旧版端点）。
 * 边界：不改服务端契约；上传/保存/导入错误如实展示；不伪造写入成功。
 */
import { computed, onMounted, reactive, ref } from 'vue';

import {
  NButton,
  NCard,
  NDatePicker,
  NDescriptions,
  NDescriptionsItem,
  NDrawer,
  NDrawerContent,
  NForm,
  NFormItem,
  NGi,
  NInput,
  NInputNumber,
  NModal,
  NPopconfirm,
  NSelect,
  NSpace,
  NStatistic,
  NTabPane,
  NTabs,
  NText,
  NUpload,
  type UploadFileInfo,
} from 'naive-ui';

import {
  HseDataGrid,
  HsePageLayout,
  HseSearchPanel,
  HseStatusTag,
  COMMITTEE_STATUS_TAG as STATUS_TAG,
} from '#/components/hse';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';
import { getEmployeeList, type EmployeeApi } from '#/api/hse/employee';
import {
  createCommitteeActivity,
  deleteCommitteeActivity,
  downloadCommitteeActivityTemplate,
  getCommitteeActivityFile,
  getCommitteeActivityList,
  importCommitteeActivityExcel,
  importCommitteeActivityPdf,
  updateCommitteeActivity,
  type CommitteeActivityApi,
} from '#/api/hse/goals';
import { message } from '#/adapter/naive';

defineOptions({ name: 'ObjectivesCommittee' });

const activeTab = ref<'personnel' | 'committee'>('personnel');

// ===================== Tab1：安全人员（花名册只读） =====================
const ROSTER_DEPT = '安环管理部';
const STATUS_LABEL: Record<string, string> = {
  active: '在职',
  left: '离职',
  pending: '待岗',
  retired: '退休',
  rehire: '返聘',
};
const STATUS_VALUE: Record<string, string> = {
  在职: 'active',
  离职: 'left',
  待岗: 'pending',
  退休: 'retired',
  返聘: 'rehire',
};
// 注：STATUS_TAG 已迁移至 statusColors.ts（COMMITTEE_STATUS_TAG，保留中英双键）

const personnelLoading = ref(false);
const personnelList = ref<EmployeeApi.EmployeeItem[]>([]);
const personnelTotal = ref(0);
const personnelSearch = reactive({ keyword: '', status: undefined as string | undefined });
const personnelPage = ref(1);
const personnelPageSize = ref(10);

const personnelStatItems = computed(() => {
  const list = personnelList.value;
  const active = list.filter((p) => (p.org_status as string) === 'active').length;
  const left = list.filter((p) => (p.org_status as string) === 'left').length;
  const other = list.length - active - left;
  return [
    { key: 'total', label: '总人数', value: personnelTotal.value || list.length, color: 'blue', icon: 'lucide:users' },
    { key: 'active', label: '在职人数', value: active, color: 'green', icon: 'lucide:user-check' },
    { key: 'left', label: '离职人数', value: left, color: 'red', icon: 'lucide:user-x' },
    { key: 'other', label: '其他状态', value: other, color: 'orange', icon: 'lucide:users-round' },
  ];
});

async function fetchPersonnel() {
  personnelLoading.value = true;
  try {
    const res = await getEmployeeList({
      page: personnelPage.value,
      pageSize: personnelPageSize.value,
      keyword: personnelSearch.keyword || undefined,
      deptName: ROSTER_DEPT,
      status: personnelSearch.status ? (STATUS_VALUE[personnelSearch.status] as EmployeeApi.OrgStatus) : undefined,
    });
    personnelList.value = res.list || [];
    personnelTotal.value = res.total || 0;
  } catch {
    personnelList.value = [];
    personnelTotal.value = 0;
  } finally {
    personnelLoading.value = false;
  }
}
function onPersonnelSearch() {
  personnelPage.value = 1;
  fetchPersonnel();
}
function onPersonnelReset() {
  Object.assign(personnelSearch, { keyword: '', status: undefined });
  onPersonnelSearch();
}
function onPersonnelPageChange(payload: { currentPage: number; pageSize: number }) {
  personnelPage.value = payload.currentPage;
  personnelPageSize.value = payload.pageSize;
  fetchPersonnel();
}

const personDetailVisible = ref(false);
const currentPerson = ref<EmployeeApi.EmployeeItem | null>(null);
function handleViewPerson(record: EmployeeApi.EmployeeItem) {
  currentPerson.value = record;
  personDetailVisible.value = true;
}

const personnelColumns: VxeTableGridColumns = [
  {
    title: '序号',
    field: 'index',
    minWidth: 70,
    align: 'center',
    formatter: (params: any) => (personnelPage.value - 1) * personnelPageSize.value + (params?.rowIndex ?? 0) + 1,
  },
  { title: '姓名', field: 'name', minWidth: 100, align: 'center' },
  { title: '职务', field: 'position_name', minWidth: 140, align: 'center', showOverflow: 'tooltip' },
  { title: '部门', field: 'dept_name', minWidth: 120, align: 'center', showOverflow: 'tooltip' },
  { title: '联系电话', field: 'phone', minWidth: 130, align: 'center' },
  { title: '状态', field: 'org_status', minWidth: 90, align: 'center', slots: { default: 'personStatus' } },
  { title: '操作', field: 'action', minWidth: 100, align: 'center', fixed: 'right', slots: { default: 'personAction' } },
];

// ===================== Tab2：安委会组织开展活动 =====================
const ACTIVITY_TYPES = ['安委会会议', '安全例会', '专项检查', '应急演练', '教育培训', '其他'];

const activityLoading = ref(false);
const activityList = ref<CommitteeActivityApi.ActivityItem[]>([]);
const activityTotal = ref(0);
const activityKeyword = ref('');
const activityPage = ref(1);
const activityPageSize = ref(10);
const activitySortBy = ref<string | undefined>(undefined);
const activitySortOrder = ref<'asc' | 'desc' | undefined>(undefined);

async function fetchActivities() {
  activityLoading.value = true;
  try {
    const res = await getCommitteeActivityList({
      page: activityPage.value,
      pageSize: activityPageSize.value,
      keyword: activityKeyword.value || undefined,
      sortField: activitySortBy.value,
      sortOrder: activitySortOrder.value,
    });
    activityList.value = res.list || [];
    activityTotal.value = res.total || 0;
  } catch {
    activityList.value = [];
    activityTotal.value = 0;
  } finally {
    activityLoading.value = false;
  }
}
function onActivitySearch() {
  activityPage.value = 1;
  fetchActivities();
}
function onActivityReset() {
  activityKeyword.value = '';
  onActivitySearch();
}
function onActivityPageChange(payload: { currentPage: number; pageSize: number }) {
  activityPage.value = payload.currentPage;
  activityPageSize.value = payload.pageSize;
  fetchActivities();
}

function onActivitySortChange(payload: { sortBy?: string; sortOrder?: 'asc' | 'desc' }) {
  activitySortBy.value = payload.sortBy;
  activitySortOrder.value = payload.sortOrder;
  activityPage.value = 1;
  fetchActivities();
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '-';
  const s = String(d).slice(0, 10);
  return s;
}
function yearOf(d: string | null | undefined): string {
  if (!d) return '-';
  return String(d).slice(0, 4);
}

const activityColumns: VxeTableGridColumns = [
  {
    title: '序号',
    field: 'index',
    minWidth: 70,
    align: 'center',
    formatter: (params: any) => (activityPage.value - 1) * activityPageSize.value + (params?.rowIndex ?? 0) + 1,
  },
  {
    title: '年份',
    field: 'year',
    minWidth: 80,
    align: 'center',
    formatter: (params: any) => yearOf(params?.row?.activityDate),
  },
  {
    title: '日期',
    field: 'activityDate',
    minWidth: 120,
    align: 'center',
    sortable: true,
    formatter: (params: any) => fmtDate(params?.row?.activityDate),
  },
  { title: '会议名称', field: 'activityName', minWidth: 220, align: 'center', showOverflow: 'tooltip' },
  { title: '会议地点', field: 'location', minWidth: 160, align: 'center', showOverflow: 'tooltip' },
  { title: '参与人数', field: 'participants', minWidth: 90, align: 'center' },
  { title: '操作', field: 'action', minWidth: 200, align: 'center', fixed: 'right', slots: { default: 'activityAction' } },
];

// ---- 新增/编辑活动 ----
const activityModalVisible = ref(false);
const activityModalLoading = ref(false);
const activityEditingId = ref<number | null>(null);
const activityUploading = ref(false);
const activityPdfName = ref('');
const activityForm = reactive({
  activityName: '',
  activityType: '',
  activityDate: null as number | null,
  hostDepartment: '',
  participants: 0,
  location: '',
  summary: '',
  pdfFile: '',
  originalName: '',
  remark: '',
});

function resetActivityForm() {
  Object.assign(activityForm, {
    activityName: '',
    activityType: '',
    activityDate: null,
    hostDepartment: '',
    participants: 0,
    location: '',
    summary: '',
    pdfFile: '',
    originalName: '',
    remark: '',
  });
  activityPdfName.value = '';
}

function openActivityCreate() {
  activityEditingId.value = null;
  resetActivityForm();
  activityModalVisible.value = true;
}
function openActivityEdit(record: CommitteeActivityApi.ActivityItem) {
  activityEditingId.value = record.id;
  Object.assign(activityForm, {
    activityName: record.activityName || '',
    activityType: record.activityType || '',
    activityDate: record.activityDate ? new Date(record.activityDate).getTime() : null,
    hostDepartment: record.hostDepartment || '',
    participants: record.participants || 0,
    location: record.location || '',
    summary: record.summary || '',
    pdfFile: record.pdfFile || '',
    originalName: record.originalName || '',
    remark: record.remark || '',
  });
  activityPdfName.value = record.originalName || '';
  activityModalVisible.value = true;
}

function fmtDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function handleActivityPdfUpload(options: { file: UploadFileInfo }) {
  const raw = options.file.file as File;
  if (!raw) return;
  if (!raw.name.toLowerCase().endsWith('.pdf')) {
    message.warning('请选择 PDF 文件');
    return;
  }
  activityUploading.value = true;
  try {
    const res = await importCommitteeActivityPdf(raw);
    activityForm.pdfFile = res.storedName;
    activityForm.originalName = res.originalName;
    activityPdfName.value = res.originalName;
    message.success('PDF 上传完成');
  } catch {
    /* 拦截器已提示（不假装持久化） */
  } finally {
    activityUploading.value = false;
  }
}
function removeActivityPdf() {
  activityForm.pdfFile = '';
  activityForm.originalName = '';
  activityPdfName.value = '';
}

async function saveActivity() {
  if (!activityForm.activityName.trim()) {
    message.warning('请填写活动名称');
    return;
  }
  activityModalLoading.value = true;
  try {
    const payload: Partial<CommitteeActivityApi.ActivityItem> = {
      activityName: activityForm.activityName.trim(),
      activityType: activityForm.activityType || undefined,
      activityDate: activityForm.activityDate ? fmtDateStr(new Date(activityForm.activityDate)) : undefined,
      hostDepartment: activityForm.hostDepartment || undefined,
      participants: activityForm.participants || 0,
      location: activityForm.location || undefined,
      summary: activityForm.summary || undefined,
      pdfFile: activityForm.pdfFile || undefined,
      originalName: activityForm.originalName || undefined,
      remark: activityForm.remark || undefined,
    };
    if (activityEditingId.value) {
      await updateCommitteeActivity(activityEditingId.value, payload);
      message.success('更新成功');
    } else {
      await createCommitteeActivity(payload);
      message.success('新增成功');
    }
    activityModalVisible.value = false;
    fetchActivities();
  } catch {
    /* 拦截器已提示 */
  } finally {
    activityModalLoading.value = false;
  }
}

async function deleteActivityItem(record: CommitteeActivityApi.ActivityItem) {
  try {
    await deleteCommitteeActivity(record.id);
    message.success('删除成功');
    fetchActivities();
  } catch {
    /* 拦截器已提示 */
  }
}

// ---- 模板下载 / Excel 导入 ----
function triggerDownload(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

const templateDownloading = ref(false);
async function handleDownloadTemplate() {
  templateDownloading.value = true;
  try {
    const blob = (await downloadCommitteeActivityTemplate()) as Blob;
    triggerDownload(blob, '安委会活动导入模板.xlsx');
    message.success('模板已开始下载');
  } catch {
    message.error('模板下载失败');
  } finally {
    templateDownloading.value = false;
  }
}

const importing = ref(false);
async function handleImportExcel(options: { file: UploadFileInfo }) {
  const raw = options.file.file as File;
  if (!raw) return;
  const name = raw.name.toLowerCase();
  if (!name.endsWith('.xlsx') && !name.endsWith('.xls')) {
    message.warning('请选择 Excel 文件（.xlsx / .xls）');
    return;
  }
  importing.value = true;
  try {
    const res = await importCommitteeActivityExcel(raw);
    message.success(`成功导入 ${res.inserted} 条会议记录`);
    fetchActivities();
  } catch {
    /* 拦截器已提示 */
  } finally {
    importing.value = false;
  }
}

// ---- 查看文档（受保护 Blob 预览） ----
async function handleViewFile(record: CommitteeActivityApi.ActivityItem) {
  if (!record.id) return;
  if (!record.pdfFile) {
    message.warning('该会议尚未导入文档，请通过「编辑」上传');
    return;
  }
  try {
    const blob = (await getCommitteeActivityFile(record.id)) as Blob;
    const url = window.URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
  } catch {
    message.error('文件加载失败');
  }
}

onMounted(() => {
  fetchPersonnel();
  fetchActivities();
});
</script>

<template>
  <HsePageLayout title="安全人员及安委会">
    <NTabs v-model:value="activeTab" type="line">
      <!-- Tab1：安全人员（只读） -->
      <NTabPane name="personnel" tab="安全人员">
        <div class="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <NCard v-for="s in personnelStatItems" :key="s.key" :bordered="false">
            <NStatistic :label="s.label" :value="s.value" />
          </NCard>
        </div>
        <HseSearchPanel @query="onPersonnelSearch" @reset="onPersonnelReset">
          <NGi>
            <NInput
              v-model:value="personnelSearch.keyword"
              placeholder="姓名 / 工号 / 电话"
              clearable
              @keyup.enter="onPersonnelSearch"
            />
          </NGi>
          <NGi>
            <NSelect
              v-model:value="personnelSearch.status"
              placeholder="状态"
              clearable
              :options="Object.keys(STATUS_LABEL).map((v) => ({ label: STATUS_LABEL[v], value: STATUS_LABEL[v] }))"
            />
          </NGi>
        </HseSearchPanel>
        <HseDataGrid
          :columns="personnelColumns"
          :data="personnelList"
          :loading="personnelLoading"
          :pager="true"
          :total="personnelTotal"
          scroll-x="860"
          @page-change="onPersonnelPageChange"
        >
          <template #personStatus="{ row }">
            <HseStatusTag :type="STATUS_TAG[(row as any).org_status] || 'neutral'">
              {{ STATUS_LABEL[(row as any).org_status] || (row as any).org_status || '-' }}
            </HseStatusTag>
          </template>
          <template #personAction="{ row }">
            <NButton size="small" quaternary type="primary" @click="handleViewPerson(row)">查看</NButton>
          </template>
        </HseDataGrid>
      </NTabPane>

      <!-- Tab2：安委会（活动台账） -->
      <NTabPane name="committee" tab="安委会">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <NButton size="small" :loading="templateDownloading" @click="handleDownloadTemplate">
              下载模板
            </NButton>
            <NUpload
              accept=".xlsx,.xls"
              :max="1"
              :show-file-list="false"
              @change="handleImportExcel"
            >
              <NButton size="small" :loading="importing">导入</NButton>
            </NUpload>
            <NButton size="small" type="primary" @click="openActivityCreate">新增活动</NButton>
          </div>
        </div>
        <HseSearchPanel @query="onActivitySearch" @reset="onActivityReset">
          <NGi>
            <NInput
              v-model:value="activityKeyword"
              placeholder="活动名称 / 地点"
              clearable
              @keyup.enter="onActivitySearch"
            />
          </NGi>
        </HseSearchPanel>
        <HseDataGrid
          :columns="activityColumns"
          :data="activityList"
          :loading="activityLoading"
          :pager="true"
          :total="activityTotal"
          scroll-x="1000"
          @page-change="onActivityPageChange"
          @sort-change="onActivitySortChange"
        >
          <template #activityAction="{ row }">
            <NSpace :size="8">
              <NButton size="small" quaternary type="primary" @click="handleViewFile(row)">查看</NButton>
              <NButton size="small" quaternary type="primary" @click="openActivityEdit(row)">编辑</NButton>
              <NPopconfirm @positive-click="deleteActivityItem(row)">
                <template #trigger>
                  <NButton size="small" quaternary type="error">删除</NButton>
                </template>
                确认删除该活动？
              </NPopconfirm>
            </NSpace>
          </template>
        </HseDataGrid>
      </NTabPane>
    </NTabs>

    <!-- 人员详情抽屉 -->
    <NDrawer v-model:show="personDetailVisible" title="人员详情" :width="480">
      <NDrawerContent>
        <NDescriptions v-if="currentPerson" :column="1" bordered label-placement="left" size="small">
          <NDescriptionsItem label="姓名">{{ currentPerson.name || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="员工编号">{{ (currentPerson as any).employee_code || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="部门">{{ currentPerson.dept_name || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="职务">{{ currentPerson.position_name || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="联系电话">{{ currentPerson.phone || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="状态">
            <HseStatusTag :type="STATUS_TAG[(currentPerson as any).org_status] || 'neutral'">
              {{ STATUS_LABEL[(currentPerson as any).org_status] || (currentPerson as any).org_status || '-' }}
            </HseStatusTag>
          </NDescriptionsItem>
        </NDescriptions>
      </NDrawerContent>
    </NDrawer>

    <!-- 新增/编辑活动 -->
    <NModal
      v-model:show="activityModalVisible"
      :title="activityEditingId ? '编辑安委会活动' : '新增安委会活动'"
      preset="card"
      style="width: 720px; max-width: 94vw"
    >
      <NForm label-placement="top">
        <div class="grid grid-cols-2 gap-x-4">
          <NFormItem label="活动名称" required>
            <NInput v-model:value="activityForm.activityName" placeholder="请输入活动名称" />
          </NFormItem>
          <NFormItem label="活动类型">
            <NSelect
              v-model:value="activityForm.activityType"
              placeholder="请选择"
              :options="ACTIVITY_TYPES.map((t) => ({ label: t, value: t }))"
            />
          </NFormItem>
          <NFormItem label="组织日期">
            <NDatePicker v-model:value="activityForm.activityDate" type="date" style="width: 100%" />
          </NFormItem>
          <NFormItem label="主持部门">
            <NInput v-model:value="activityForm.hostDepartment" placeholder="如：安环管理部" />
          </NFormItem>
          <NFormItem label="参与人数">
            <NInputNumber v-model:value="activityForm.participants" :min="0" style="width: 100%" />
          </NFormItem>
          <NFormItem label="活动地点">
            <NInput v-model:value="activityForm.location" placeholder="请输入活动地点" />
          </NFormItem>
        </div>
        <NFormItem label="活动摘要">
          <NInput
            v-model:value="activityForm.summary"
            type="textarea"
            :rows="3"
            placeholder="请输入活动摘要/纪要"
          />
        </NFormItem>
        <NFormItem label="文档（PDF）">
          <div v-if="activityPdfName" class="flex items-center gap-2">
            <NText>{{ activityPdfName }}</NText>
            <NButton size="small" quaternary type="error" @click="removeActivityPdf">移除</NButton>
          </div>
          <NUpload
            v-else
            accept=".pdf"
            :max="1"
            :show-file-list="false"
            :disabled="activityUploading"
            @change="handleActivityPdfUpload"
          >
            <NButton :loading="activityUploading">上传 PDF</NButton>
          </NUpload>
          <NText depth="3" class="mt-1 block text-xs">
            仅支持 .pdf，建议不超过 10MB。文档将随记录保存，可在列表「查看」中预览。
          </NText>
        </NFormItem>
        <NFormItem label="备注">
          <NInput v-model:value="activityForm.remark" type="textarea" :rows="2" placeholder="请输入备注" />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="activityModalVisible = false">取消</NButton>
          <NButton type="primary" :loading="activityModalLoading" @click="saveActivity">保存</NButton>
        </NSpace>
      </template>
    </NModal>
  </HsePageLayout>
</template>
