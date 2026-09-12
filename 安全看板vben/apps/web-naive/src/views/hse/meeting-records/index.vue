<script lang="ts" setup>
/**
 * 安全会议出席管理（web-naive · 月度考核 RESP-004 数据源）
 * 能力：统计卡（会议数/应到人次/实到/缺席）/会议分组列表（服务端分页，支持编号·关键词筛选）/
 *     新建会议（登记多参会人及其出席状态，缺席扣分交由每日扫描兜底）/会议详情抽屉（逐条补参·删除）。
 * 契约：server/routes/hse-meeting-records.js + api/hse/meeting-records.ts。
 */
import { computed, onMounted, reactive, ref } from 'vue';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';

import {
  NButton,
  NDatePicker,
  NDescriptions,
  NDescriptionsItem,
  NDrawer,
  NDrawerContent,
  NForm,
  NFormItem,
  NInput,
  NEmpty,
  NModal,
  NPopconfirm,
  NSelect,
  NSpace,
  NSpin,
} from 'naive-ui';

import { HseActionBar, HseDataGrid, HsePageLayout, HseSearchPanel, HseStatCard, HseStatusTag } from '#/components/hse';
import {
  createMeeting,
  deleteMeetingRecord,
  getMeetingDetail,
  getMeetingGroups,
  getMeetingStats,
  updateMeetingRecord,
  type MeetingRecordApi,
} from '#/api/hse/meeting-records';
import { getEmployeeSelectorList, getEmployeeSelectorBatch, type EmployeeSelectorItem } from '#/api/hse/employee';
import { message } from '#/adapter/naive';

defineOptions({ name: 'MeetingRecordManagement' });

const loading = ref(false);
const creating = ref(false);
const dataSource = ref<MeetingRecordApi.MeetingGroup[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);

const searchForm = reactive({
  keyword: '',
  meeting_code: undefined as string | undefined,
});

const statusText: Record<string, string> = { attend: '实到', absent: '缺席', not_required: '未要求' };
const statusTag: Record<string, 'success' | 'error' | 'default'> = { attend: 'success', absent: 'error', not_required: 'default' };
const attendOptions = [
  { label: '实到', value: 'attend' },
  { label: '缺席', value: 'absent' },
  { label: '未要求', value: 'not_required' },
];

const stats = reactive({ total: 0, attend: 0, absent: 0, meetings: 0 });

const columns = computed<VxeTableGridColumns>(() => [
  { title: '会议编号', field: 'meetingCode', minWidth: 170, align: 'center', showOverflow: 'tooltip' },
  { title: '会议名称', field: 'meetingName', minWidth: 160, align: 'center', showOverflow: 'tooltip' },
  {
    title: '会议日期',
    field: 'meetingDate',
    minWidth: 110,
    align: 'center',
    formatter: ({ row }: any) => (row.meetingDate ? String(row.meetingDate).slice(0, 10) : '-'),
  },
  { title: '应到人次', field: 'total', minWidth: 90, align: 'center' },
  { title: '实到', field: 'attend', minWidth: 80, align: 'center' },
  { title: '缺席', field: 'absent', minWidth: 80, align: 'center' },
  { title: '未要求', field: 'notRequired', minWidth: 80, align: 'center' },
  { title: '操作', field: 'action', width: 120, align: 'center', fixed: 'right', slots: { default: 'action' } },
]);

async function loadStats() {
  try {
    const s = await getMeetingStats({});
    stats.total = s.total ?? 0;
    stats.attend = s.attend ?? 0;
    stats.absent = s.absent ?? 0;
    stats.meetings = s.meetings ?? 0;
  } catch {
    /* 拦截器已提示 */
  }
}

async function loadData() {
  loading.value = true;
  try {
    const res = await getMeetingGroups({
      page: page.value,
      size: pageSize.value,
      meeting_code: searchForm.meeting_code || undefined,
      keyword: searchForm.keyword || undefined,
    });
    dataSource.value = res.list || [];
    total.value = res.total || 0;
  } catch {
    dataSource.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

function onSearch() {
  page.value = 1;
  loadData();
  loadStats();
}
function onReset() {
  searchForm.keyword = '';
  searchForm.meeting_code = undefined;
  onSearch();
}
function onPageChange(payload: { currentPage: number; pageSize: number }) {
  page.value = payload.currentPage;
  pageSize.value = payload.pageSize;
  loadData();
}

// ===================== 新建会议 =====================
const createModalOpen = ref(false);
const employeeSearching = ref(false);
const employeeOptions = ref<any[]>([]);
const createForm = reactive({
  meetingName: '',
  meetingDate: new Date().toISOString().slice(0, 10) as string | null,
  meetingType: '安全会议',
  organizer: '',
  rows: [] as { employeeId: number | null; employeeName: string; status: 'attend' | 'absent' | 'not_required' }[],
});

async function searchEmployees(keyword?: string) {
  employeeSearching.value = true;
  try {
    const list = await getEmployeeSelectorList({ keyword: keyword || undefined, limit: 20 });
    employeeOptions.value = list.map((e: EmployeeSelectorItem) => ({
      label: `${e.name}${e.position_name ? `（${e.position_name}）` : ''}`,
      value: e.employee_id,
    }));
  } catch {
    employeeOptions.value = [];
  } finally {
    employeeSearching.value = false;
  }
}

function addAttendanceRow() {
  createForm.rows.push({ employeeId: null, employeeName: '', status: 'attend' });
}
function removeAttendanceRow(index: number) {
  createForm.rows.splice(index, 1);
}
async function onRowEmployeeChange(index: number) {
  const rid = createForm.rows[index].employeeId;
  if (!rid) return;
  const names = await getEmployeeSelectorBatch([rid]);
  const item = names[0];
  createForm.rows[index].employeeName = item?.name || '';
}

function showCreateModal() {
  createForm.meetingName = '';
  createForm.meetingDate = new Date().toISOString().slice(0, 10);
  createForm.meetingType = '安全会议';
  createForm.organizer = '';
  createForm.rows = [];
  addAttendanceRow();
  createModalOpen.value = true;
}

async function handleCreate() {
  if (!createForm.meetingName) {
    message.warning('请填写会议名称');
    return;
  }
  if (!createForm.meetingDate) {
    message.warning('请选择会议日期');
    return;
  }
  const attendees = createForm.rows
    .filter((r) => r.employeeId)
    .map((r) => ({
      employeeId: r.employeeId as number,
      attendanceStatus: r.status,
    }));
  if (!attendees.length) {
    message.warning('请至少登记一名参会人员');
    return;
  }
  creating.value = true;
  try {
    await createMeeting({
      meetingName: createForm.meetingName,
      meetingDate: createForm.meetingDate,
      meetingType: createForm.meetingType,
      organizer: createForm.organizer || undefined,
      attendees,
    });
    message.success('会议创建成功');
    createModalOpen.value = false;
    loadData();
    loadStats();
  } catch {
    /* 拦截器已提示 */
  } finally {
    creating.value = false;
  }
}

// ===================== 会议详情 / 逐条补参 =====================
const detailDrawerOpen = ref(false);
const detailCode = ref('');
const detailRecords = ref<MeetingRecordApi.MeetingRecord[]>([]);
const detailLoading = ref(false);

async function handleView(row: MeetingRecordApi.MeetingGroup) {
  detailCode.value = row.meetingCode;
  detailDrawerOpen.value = true;
  detailLoading.value = true;
  detailRecords.value = [];
  try {
    detailRecords.value = (await getMeetingDetail(row.meetingCode)) || [];
  } catch {
    detailRecords.value = [];
  } finally {
    detailLoading.value = false;
  }
}

async function changeAttendance(record: MeetingRecordApi.MeetingRecord, status: string) {
  try {
    const updated = await updateMeetingRecord(record.id, { attendanceStatus: status });
    const idx = detailRecords.value.findIndex((r) => r.id === record.id);
    if (idx >= 0) detailRecords.value[idx] = updated;
    message.success(status === 'attend' ? '已标记实到（撤销缺席扣分）' : '已更新出席状态');
    loadData();
    loadStats();
  } catch {
    /* 拦截器已提示 */
  }
}

async function handleDeleteRecord(record: MeetingRecordApi.MeetingRecord) {
  try {
    await deleteMeetingRecord(record.id);
    detailRecords.value = detailRecords.value.filter((r) => r.id !== record.id);
    message.success('已删除该出席记录');
    loadData();
    loadStats();
  } catch {
    /* 拦截器已提示 */
  }
}

const actionState = ref<Record<string, { hidden?: boolean }>>({
  downloadTemplate: { hidden: true },
  import: { hidden: true },
  export: { hidden: true },
});

onMounted(() => {
  loadData();
  loadStats();
});
</script>

<template>
  <HsePageLayout title="会议出席管理">
    <template #extra>
      <HseActionBar :actions="actionState" @refresh="onSearch" @create="showCreateModal" />
    </template>

    <NSpace vertical :size="16">
      <NSpace :size="16" wrap>
        <HseStatCard title="会议数" :value="String(stats.meetings)" icon="lucide:calendar-check" color="primary" />
        <HseStatCard title="应到人次" :value="String(stats.total)" icon="lucide:users" color="info" />
        <HseStatCard title="实到" :value="String(stats.attend)" icon="lucide:user-check" color="success" />
        <HseStatCard title="缺席（扣分）" :value="String(stats.absent)" icon="lucide:user-x" color="danger" />
      </NSpace>

      <HseSearchPanel @query="onSearch" @reset="onReset">
        <NInput v-model:value="searchForm.meeting_code" placeholder="会议编号" clearable style="min-width: 160px" @keyup.enter="onSearch" />
        <NInput v-model:value="searchForm.keyword" placeholder="会议名称/编号关键词" clearable style="min-width: 200px" @keyup.enter="onSearch" />
      </HseSearchPanel>

      <HseDataGrid
        :columns="columns"
        :data="dataSource"
        :loading="loading"
        :pager="true"
        :total="total"
        auto-width
        @page-change="onPageChange"
      >
        <template #action="{ row }">
          <NSpace justify="center" :size="4">
            <NButton size="small" type="primary" quaternary @click="handleView(row)">查看</NButton>
          </NSpace>
        </template>
      </HseDataGrid>
    </NSpace>

    <!-- 新建会议 -->
    <NModal v-model:show="createModalOpen" title="新建会议" preset="card" style="width: 640px; max-width: 94vw">
      <NForm label-placement="top">
        <NSpace :size="12" style="width: 100%">
          <NFormItem label="会议名称" required style="flex: 1">
            <NInput v-model:value="createForm.meetingName" placeholder="如：月度安全生产例会" />
          </NFormItem>
          <NFormItem label="会议日期" required style="width: 160px">
            <NDatePicker
              v-model:value="createForm.meetingDate"
              type="date"
              value-format="yyyy-MM-dd"
              style="width: 100%"
            />
          </NFormItem>
        </NSpace>
        <NSpace :size="12" style="width: 100%">
          <NFormItem label="会议类型" style="flex: 1">
            <NInput v-model:value="createForm.meetingType" placeholder="安全会议" />
          </NFormItem>
          <NFormItem label="组织者" style="flex: 1">
            <NInput v-model:value="createForm.organizer" placeholder="组织者姓名" />
          </NFormItem>
        </NSpace>
        <NFormItem label="参会人员">
          <NSpace vertical :size="8" style="width: 100%">
            <NSpace
              v-for="(row, idx) in createForm.rows"
              :key="idx"
              :size="8"
              style="width: 100%"
              align="center"
            >
              <NSelect
                v-model:value="row.employeeId"
                filterable
                remote
                clearable
                style="flex: 1"
                placeholder="搜索并选择员工"
                :loading="employeeSearching"
                :options="employeeOptions"
                @search="searchEmployees"
                @update:value="onRowEmployeeChange(idx)"
                @focus="searchEmployees('')"
              />
              <span style="width: 90px" class="truncate">{{ row.employeeName }}</span>
              <NSelect v-model:value="row.status" :options="attendOptions" style="width: 96px" />
              <NButton quaternary size="small" type="error" @click="removeAttendanceRow(idx)">移除</NButton>
            </NSpace>
            <NButton dashed size="small" @click="addAttendanceRow">+ 添加参会人</NButton>
          </NSpace>
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="createModalOpen = false">取消</NButton>
          <NButton type="primary" :loading="creating" @click="handleCreate">创建并登记出席</NButton>
        </NSpace>
      </template>
    </NModal>

    <!-- 会议出席明细抽屉 -->
    <NDrawer v-model:show="detailDrawerOpen" :width="620" placement="right" :show-mask="false">
      <NDrawerContent closable :title="`会议明细 · ${detailCode}`">
        <NSpin :show="detailLoading">
          <NSpace vertical :size="10">
            <template v-if="!detailRecords.length && !detailLoading">
              <NEmpty description="该会议暂无出席记录" />
            </template>
            <NDescriptions
              v-for="record in detailRecords"
              :key="record.id"
              :column="4"
              bordered
              size="small"
              :label-style="{ width: '74px' }"
            >
              <template #header>
                <NSpace align="center" :size="8">
                  <HseStatusTag :type="statusTag[record.attendanceStatus] || 'default'">
                    {{ statusText[record.attendanceStatus] || record.attendanceStatus }}
                  </HseStatusTag>
                  <span style="font-weight: 600">{{ record.employeeName }}</span>
                </NSpace>
              </template>
              <NDescriptionsItem label="工号">{{ record.employeeCode || '-' }}</NDescriptionsItem>
              <NDescriptionsItem label="岗位">{{ record.position || '-' }}</NDescriptionsItem>
              <NDescriptionsItem label="签到时间">{{ record.signTime ? String(record.signTime).slice(0, 19) : '-' }}</NDescriptionsItem>
              <NDescriptionsItem :label="'备注'">
                <span class="truncate" style="max-width: 120px; display: inline-block; vertical-align: bottom">
                  {{ record.remark || '-' }}
                </span>
              </NDescriptionsItem>
              <NDescriptionsItem label="操作" :span="4">
                <NSpace :size="4">
                  <NButton v-if="record.attendanceStatus !== 'attend'" size="tiny" type="primary" @click="changeAttendance(record, 'attend')">
                    补签实到
                  </NButton>
                  <NButton v-if="record.attendanceStatus !== 'absent'" size="tiny" type="warning" @click="changeAttendance(record, 'absent')">
                    标记缺席
                  </NButton>
                  <NPopconfirm @positive-click="handleDeleteRecord(record)">
                    <template #trigger>
                      <NButton size="tiny" type="error" quaternary>删除</NButton>
                    </template>
                    确认删除该出席记录？
                  </NPopconfirm>
                </NSpace>
              </NDescriptionsItem>
            </NDescriptions>
          </NSpace>
        </NSpin>
      </NDrawerContent>
    </NDrawer>
  </HsePageLayout>
</template>

<style scoped>
.truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>