<script lang="ts" setup>
/**
 * 员工花名册导入 V2（web-naive 完整迁移）
 * 行为契约：apps/web-antd/src/views/hse/employee-import-v2/index.vue
 * 专用批次流程：上传 → 批次列表 → 批次预览/待确认审批 → 入库 → 删除/清空。
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { useAccess } from '@vben/access';
import {
  NAlert,
  NButton,
  NCard,
  NDrawer,
  NDrawerContent,
  NInput,
  NInputNumber,
  NModal,
  NPopconfirm,
  NResult,
  NSelect,
  NSpace,
  NStatistic,
  NTag,
  NUpload,
  NUploadDragger,
} from 'naive-ui';
import { message, dialog } from '#/adapter/naive';
import { Inbox } from '@vben/icons';

import {
  HseActionBar,
  HseDataGrid,
  HsePageLayout,
  HseStatusTag,
  type HseActionKey,
} from '#/components/hse';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';
import {
  getImportBatchList,
  uploadEmployeeRoster,
  getBatchPreview,
  getBatchPendingList,
  resolvePending,
  executeImport,
  deleteImportBatch,
  getRosterSourceFiles,
  importRosterFromSource,
  type EmployeeImportV2Api,
} from '#/api/hse/employee-import-v2';

defineOptions({ name: 'PersonnelImport' });

// 应用根无 NDialogProvider，使用 #/adapter/naive 的离散 dialog（createDiscreteApi）

// ============================================================
// 权限
// ============================================================
const { hasAccessByRoles } = useAccess();
const canImport = computed(() => hasAccessByRoles(['admin', 'safety_manager']));
const canResolve = computed(() => hasAccessByRoles(['admin', 'safety_manager']));
const canExecute = computed(() => hasAccessByRoles(['admin', 'safety_manager']));
const canClearAll = computed(() => hasAccessByRoles(['admin']));

// ============================================================
// 列表
// ============================================================
const loading = ref(false);
const list = ref<EmployeeImportV2Api.ImportBatch[]>([]);
const total = ref(0);
const pagination = reactive({ page: 1, pageSize: 20 });
const searchForm = reactive({
  status: undefined as string | undefined,
});

const statusTypeMap: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  uploaded: 'neutral',
  parsing: 'info',
  pending_review: 'warning',
  completed: 'success',
  partial_completed: 'warning',
  failed: 'danger',
};
const statusTextMap: Record<string, string> = {
  uploaded: '已上传',
  parsing: '解析中',
  pending_review: '待审核',
  completed: '已入库',
  partial_completed: '部分入库',
  failed: '失败',
};
const statusOptions = [
  { label: '已上传', value: 'uploaded' },
  { label: '待审核', value: 'pending_review' },
  { label: '已入库', value: 'completed' },
  { label: '部分入库', value: 'partial_completed' },
  { label: '入库失败', value: 'failed' },
];

const pendingTypeTypeMap: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  auto_matched: 'success',
  missing_field: 'warning',
  unknown_dept: 'danger',
  unknown_position: 'danger',
  id_card_conflict: 'danger',
  phone_conflict: 'danger',
};
const pendingTypeTextMap: Record<string, string> = {
  auto_matched: '自动匹配',
  missing_field: '字段缺失',
  unknown_dept: '未知部门',
  unknown_position: '未知岗位',
  id_card_conflict: '身份证冲突',
  phone_conflict: '手机号冲突',
};
const pendingStatusTypeMap: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  pending: 'warning',
  approved: 'info',
  rejected: 'neutral',
  imported: 'success',
};
const pendingStatusTextMap: Record<string, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已拒绝',
  imported: '已入库',
};

// 上传抽屉
const uploadDrawerVisible = ref(false);
const uploading = ref(false);
const uploadResult = ref<EmployeeImportV2Api.UploadResult | null>(null);

// 详情抽屉
const detailDrawerVisible = ref(false);
const detailLoading = ref(false);
const currentBatch = ref<EmployeeImportV2Api.ImportBatch | null>(null);
const pendingList = ref<EmployeeImportV2Api.ImportPending[]>([]);
const pendingFilter = reactive({
  status: undefined as string | undefined,
  pending_type: undefined as string | undefined,
});

// 待审记录表本地切片分页：
// 数据全量保存在 pendingList（供「批量通过 / 确认入库」做准确统计），
// 但渲染只输出当前页切片，避免一次性渲染上千行导致主线程卡死/长时间空白。
const pendingPage = ref(1);
const pendingPageSize = ref(20);
const pagedPendingList = computed(() => {
  const start = (pendingPage.value - 1) * pendingPageSize.value;
  return pendingList.value.slice(start, start + pendingPageSize.value);
});

function onPendingPageChange(payload: { currentPage: number; pageSize: number }) {
  pendingPage.value = payload.currentPage;
  pendingPageSize.value = payload.pageSize;
}

// 审核表单
const resolveForm = reactive({
  visible: false,
  pending: null as EmployeeImportV2Api.ImportPending | null,
  resolution: 'approved' as 'approved' | 'rejected',
  target_org_id: undefined as number | undefined,
  target_unit_id: undefined as number | undefined,
  target_pos_id: undefined as number | undefined,
  remark: '',
});

// 入库结果模态
const importResultVisible = ref(false);
const importResult = ref<EmployeeImportV2Api.ImportResult | null>(null);

// 清空（已暂停：P0-1 数据删除风险隔离，原 clearAllPreview / clearAllLoading 状态随之移除）

// ============================================================
// 列表加载
// ============================================================
async function loadList() {
  loading.value = true;
  try {
    const res = await getImportBatchList({
      page: pagination.page,
      pageSize: pagination.pageSize,
      status: searchForm.status,
    });
    list.value = res.list ?? [];
    total.value = res.total ?? 0;
  } catch (e: any) {
    message.error(e?.message || '加载批次列表失败');
  } finally {
    loading.value = false;
  }
}

function onPageChange(payload: { currentPage: number; pageSize: number }) {
  pagination.page = payload.currentPage;
  pagination.pageSize = payload.pageSize;
  loadList();
}

function handleSearch() {
  pagination.page = 1;
  loadList();
}

function handleReset() {
  searchForm.status = undefined;
  pagination.page = 1;
  loadList();
}

function handleDownloadTemplate() {
  const link = document.createElement('a');
  link.href = '/templates/employee_roster_template.xlsx';
  link.download = '员工花名册导入模板.xlsx';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  message.success('模板下载中...');
}

// ============================================================
// 上传
// ============================================================
function openUploadDrawer() {
  uploadDrawerVisible.value = true;
  uploadResult.value = null;
}

function onUploadChange({ file }: { file?: any }) {
  const raw: File | undefined = file?.file ?? file;
  if (!raw || !(raw instanceof File)) return;
  const ext = '.' + (raw.name.split('.').pop() || '').toLowerCase();
  if (!['.xlsx', '.xls'].includes(ext)) {
    message.error(`不支持的文件类型: ${raw.name}`);
    return;
  }
  if (raw.size > 10 * 1024 * 1024) {
    message.error('文件大小不能超过 10MB');
    return;
  }
  handleUploadFile(raw);
}

async function handleUploadFile(file: File) {
  uploading.value = true;
  try {
    const res = await uploadEmployeeRoster(file);
    uploadResult.value = res;
    message.success(
      `上传成功：共 ${res.totalRows} 行，成功匹配 ${res.successCount} 条，异常 ${res.pendingCount} 条`,
    );
    loadList();
  } catch (e: any) {
    message.error(e?.message || '上传失败');
  } finally {
    uploading.value = false;
  }
}

// ============================================================
// 详情 + 待审核
// ============================================================
async function openDetailDrawer(batch: EmployeeImportV2Api.ImportBatch) {
  currentBatch.value = batch;
  detailDrawerVisible.value = true;
  pendingFilter.status = undefined;
  pendingFilter.pending_type = undefined;
  await loadDetail();
  await loadPendingList();
}

async function loadDetail() {
  if (!currentBatch.value) return;
  detailLoading.value = true;
  try {
    const res = await getBatchPreview(currentBatch.value.id);
    currentBatch.value = res.batch;
  } catch (e: any) {
    message.error(e?.message || '加载批次详情失败');
  } finally {
    detailLoading.value = false;
  }
}

async function loadPendingList() {
  if (!currentBatch.value) return;
  try {
    pendingList.value = (await getBatchPendingList(currentBatch.value.id, {
      status: pendingFilter.status,
      pending_type: pendingFilter.pending_type,
    })) as EmployeeImportV2Api.ImportPending[];
    pendingPage.value = 1;
  } catch (e: any) {
    message.error(e?.message || '加载待确认记录失败');
  }
}

function closeDetailDrawer() {
  detailDrawerVisible.value = false;
  currentBatch.value = null;
  pendingList.value = [];
}

// ============================================================
// 审核
// ============================================================
function openResolveDialog(pending: EmployeeImportV2Api.ImportPending) {
  resolveForm.pending = pending;
  resolveForm.resolution = 'approved';
  resolveForm.target_org_id = pending.target_org_id;
  resolveForm.target_unit_id = pending.target_unit_id;
  resolveForm.target_pos_id = pending.target_pos_id;
  resolveForm.remark = pending.pending_desc || '';
  resolveForm.visible = true;
}

async function handleResolveSubmit() {
  if (!resolveForm.pending) return;
  try {
    await resolvePending(resolveForm.pending.id, {
      resolution: resolveForm.resolution,
      target_org_id: resolveForm.target_org_id,
      target_unit_id: resolveForm.target_unit_id,
      target_pos_id: resolveForm.target_pos_id,
      remark: resolveForm.remark,
    });
    message.success(resolveForm.resolution === 'approved' ? '已通过' : '已拒绝');
    resolveForm.visible = false;
    loadDetail();
    loadPendingList();
    loadList();
  } catch (e: any) {
    message.error(e?.message || '操作失败');
  }
}

async function handleBatchApprove() {
  if (!currentBatch.value) return;
  const items = pendingList.value.filter((p) => p.status === 'pending' && p.target_org_id);
  if (items.length === 0) {
    message.warning('当前筛选下没有可批量通过且已匹配组织/岗位的记录');
    return;
  }
  dialog.warning({
    title: '批量通过确认',
    content: `将对 ${items.length} 条记录执行通过，请确认目标组织/岗位已正确`,
    positiveText: '确认通过',
    negativeText: '取消',
    onPositiveClick: async () => {
      let okCount = 0;
      for (const p of items) {
        try {
          await resolvePending(p.id, {
            resolution: 'approved',
            target_org_id: p.target_org_id,
            target_unit_id: p.target_unit_id,
            target_pos_id: p.target_pos_id,
          });
          okCount++;
        } catch {
          // 静默继续
        }
      }
      message.success(`已通过 ${okCount} 条`);
      loadDetail();
      loadPendingList();
      loadList();
    },
  });
}

// ============================================================
// 正式入库
// ============================================================
function openImportConfirm() {
  if (!currentBatch.value) return;
  const pendingItems = pendingList.value.filter((p) => p.status === 'pending');
  if (pendingItems.length > 0) {
    dialog.warning({
      title: '存在未审核的异常数据',
      content: `当前批次有 ${pendingItems.length} 条异常数据处于"待审核"状态。请先完成审核（通过/拒绝）后再执行入库。`,
      positiveText: '我知道了',
    });
    return;
  }
  const approvedItems = pendingList.value.filter((p) => p.status === 'approved');
  if (approvedItems.length === 0) {
    dialog.warning({
      title: '无可入库数据',
      content: '当前批次没有"已通过"状态的记录，请先审核通过后再入库。',
      positiveText: '我知道了',
    });
    return;
  }
  dialog.warning({
    title: '确认入库',
    content: `即将把 ${approvedItems.length} 条已通过 (approved) 的记录写入员工主数据，是否继续？`,
    positiveText: '确认入库',
    negativeText: '取消',
    onPositiveClick: handleExecuteImport,
  });
}

async function handleExecuteImport() {
  if (!currentBatch.value) return;
  try {
    const res = await executeImport(currentBatch.value.id);
    importResult.value = res as EmployeeImportV2Api.ImportResult;
    importResultVisible.value = true;
    loadDetail();
    loadPendingList();
    loadList();
  } catch (e: any) {
    message.error(e?.message || '入库失败');
  }
}

// ============================================================
// 删除批次
// ============================================================
async function handleDeleteBatch(record: any) {
  try {
    await deleteImportBatch(record.id);
    message.success('批次删除成功');
    loadList();
  } catch (e: any) {
    message.error(e?.message || '删除失败');
  }
}

// ============================================================
// 清空所有人员 —— 已暂停（P0-1 数据删除风险隔离 · B02-DEC-03.30）
// ============================================================
// 原实现（GET 预览 → 二次确认弹窗 → POST /clear-all-cascade）已整体移除：
// 该接口会无条件物理删除全部人员、任职关系及 employee 的全部外键子表数据，不可逆。
// 服务端已在 services/employeeImportV2Service.js 中以 PURGE_ALL_PERMANENTLY_DISABLED
// 永久短路（早于 pool.connect()），本页不再保留任何可发起该请求的调用路径。
// 注意：前端禁用只是交互层提示，真正的安全边界是服务端 fail-closed 隔离。
function notifyPurgeSuspended() {
  message.warning(
    '「清空人员信息」已暂停（P0 数据删除风险隔离）：该操作会物理删除全部人员及关联业务数据，如需清空测试数据请联系系统管理员。',
  );
}

// ============================================================
// 目录花名册导入（从 G:\safety_vault\08_保险及人员管理\花名册 扫描 + 自动确认入库）
// ============================================================
const sourceDrawerVisible = ref(false);
const sourceLoading = ref(false);
const sourceDirectory = ref('');
const sourceFiles = ref<EmployeeImportV2Api.SourceFile[]>([]);
const sourceImporting = ref<string | null>(null); // 当前单个导入中的文件名
const sourceImportingAll = ref(false); // 是否正在批量导入

async function loadSourceFiles() {
  sourceLoading.value = true;
  try {
    const res = await getRosterSourceFiles();
    sourceDirectory.value = res.directory ?? '';
    sourceFiles.value = res.list ?? [];
  } catch (e: any) {
    message.error(e?.message || '加载来源目录文件失败');
  } finally {
    sourceLoading.value = false;
  }
}

function openSourceDrawer() {
  sourceDrawerVisible.value = true;
  loadSourceFiles();
}

function formatSize(bytes?: number): string {
  if (!bytes && bytes !== 0) return '-';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function formatMtime(mtime?: string | null): string {
  if (!mtime) return '-';
  try {
    return new Date(mtime).toLocaleString('zh-CN');
  } catch {
    return mtime;
  }
}

async function confirmImportOne(file: EmployeeImportV2Api.SourceFile) {
  if (file.imported || !file.fileName) return;
  sourceImporting.value = file.fileName;
  try {
    const res = await importRosterFromSource(file.fileName);
    const imp: any = res?.import || {};
    message.success(
      `「${file.fileName}」导入并自动入库完成：新增 ${imp.insertedCount ?? 0}，更新 ${imp.updatedCount ?? 0}，失败 ${imp.failedCount ?? 0}`,
    );
    await loadSourceFiles();
    loadList();
  } catch (e: any) {
    message.error(e?.message || `「${file.fileName}」导入失败`);
  } finally {
    sourceImporting.value = null;
  }
}

async function confirmImportAll() {
  const pending = sourceFiles.value.filter((f) => !f.imported);
  if (pending.length === 0) {
    message.warning('目录中没有未导入的文件');
    return;
  }
  sourceImportingAll.value = true;
  let ok = 0;
  const failed: string[] = [];
  for (const f of pending) {
    try {
      const res = await importRosterFromSource(f.fileName);
      const imp: any = res?.import || {};
      if (imp && imp.failedCount > 0) {
        failed.push(`${f.fileName}（有 ${imp.failedCount} 行失败）`);
      }
      ok++;
    } catch (e: any) {
      failed.push(`${f.fileName}：${e?.message || '导入失败'}`);
    }
  }
  sourceImportingAll.value = false;
  message[ok > 0 ? 'success' : 'error'](
    `批量处理完成：成功 ${ok} 个${failed.length ? `，异常 ${failed.length} 个（${failed.slice(0, 3).join('；')}）` : ''}`,
  );
  await loadSourceFiles();
  loadList();
}

// 目录源文件表格列（按修改时间由近到远展示）
const sourceColumns = ref<VxeTableGridColumns>([
  { title: '文件名称', field: 'fileName', minWidth: 220, align: 'left', showOverflow: 'tooltip' },
  { title: '修改时间', field: 'mtime', width: 170, align: 'center', slots: { default: 'mtime' } },
  { title: '大小', field: 'size', width: 90, align: 'center', slots: { default: 'size' } },
  { title: '状态', field: 'imported', width: 100, align: 'center', slots: { default: 'imported' } },
  { title: '操作', field: 'action', width: 130, align: 'center', fixed: 'right', slots: { default: 'action' } },
]);

const columns = ref<VxeTableGridColumns>([
  { title: '批次号', field: 'batch_no', minWidth: 200, align: 'center', showOverflow: 'tooltip', slots: { default: 'batchNo' } },
  { title: '文件名称', field: 'file_name', minWidth: 180, align: 'center', showOverflow: 'tooltip' },
  { title: '规则版本', field: 'rule_version', minWidth: 90, align: 'center' },
  { title: '总人数', field: 'total_count', minWidth: 80, align: 'center' },
  { title: '已匹配', field: 'success_count', minWidth: 80, align: 'center', slots: { default: 'success' } },
  { title: '异常', field: 'pending_count', minWidth: 80, align: 'center', slots: { default: 'pending' } },
  { title: '跳过', field: 'skipped_count', minWidth: 70, align: 'center' },
  { title: '状态', field: 'status', minWidth: 110, align: 'center', slots: { default: 'status' } },
  { title: '操作人', field: 'operator', minWidth: 100, align: 'center', slots: { default: 'operator' } },
  { title: '导入时间', field: 'created_at', minWidth: 170, align: 'center', slots: { default: 'createdAt' } },
  { title: '操作', field: 'action', width: 200, align: 'center', fixed: 'right', slots: { default: 'action' } },
]);

const pendingColumns = ref<VxeTableGridColumns>([
  { title: 'Excel行', field: 'row_num', width: 70, align: 'center' },
  { title: '员工编号', field: 'employee_no', width: 100, align: 'left', showOverflow: 'tooltip' },
  { title: '姓名', field: 'employee_name', width: 100, align: 'center' },
  { title: '所属部门', field: 'raw_dept', width: 120, align: 'left', showOverflow: 'tooltip' },
  { title: '职位', field: 'raw_position', width: 100, align: 'left', showOverflow: 'tooltip' },
  { title: '班组', field: 'raw_team', width: 80, align: 'left', showOverflow: 'tooltip' },
  { title: '匹配状态', field: 'pending_type', width: 110, align: 'center', slots: { default: 'pendingType' } },
  { title: '描述', field: 'pending_desc', width: 160, align: 'left', showOverflow: 'tooltip', slots: { default: 'pendingDesc' } },
  { title: '状态', field: 'status', width: 100, align: 'center', slots: { default: 'pendingStatus' } },
  { title: '规则版本', field: 'rule_version', width: 90, align: 'center' },
  { title: '操作', field: 'action', width: 100, align: 'center', slots: { default: 'pendingAction' } },
]);

const actionState = computed<Partial<Record<HseActionKey, { hidden?: boolean; loading?: boolean }>>>(() => ({
  'download-template': canImport.value ? {} : { hidden: true },
  import: canImport.value ? {} : { hidden: true },
  export: { hidden: true },
  create: { hidden: true },
}));

// 危险操作入口：已暂停（P0-1）。保留占位按钮是为了让管理员明确看到「功能还在、但已停用」，
// 而不是以为功能被误删；点击只提示，不发起任何请求。
const purgeSuspendedTip =
  '已暂停（P0 数据删除风险隔离）：该操作会物理删除全部人员及关联业务数据，如需清空测试数据请联系系统管理员';

function formatDateTime(date?: string | null): string {
  if (!date) return '-';
  try {
    return new Date(date).toLocaleString('zh-CN');
  } catch {
    return date;
  }
}

onMounted(() => {
  loadList();
});
</script>

<template>
  <div class="personnel-import">
  <HsePageLayout :title="$t('page.hse.personnelImport')" :description="$t('page.hse.personnelImportDesc')">
    <template #extra>
      <HseActionBar
        :actions="actionState"
        @refresh="loadList"
        @download-template="handleDownloadTemplate"
        @import="openUploadDrawer"
      />
      <NButton v-if="canImport" type="primary" secondary @click="openSourceDrawer">
        从目录导入
      </NButton>
      <!-- P0-1 数据删除风险隔离：全量清空入口已暂停，仅保留禁用态提示，不发起任何请求 -->
      <NButton v-if="canClearAll" disabled :title="purgeSuspendedTip" @click="notifyPurgeSuspended">
        清空人员信息（已暂停）
      </NButton>
    </template>

    <!-- 筛选 -->
    <div class="mb-3 flex flex-wrap items-center gap-3">
      <NSelect
        v-model:value="searchForm.status"
        :options="statusOptions"
        placeholder="批次状态"
        clearable
        style="width: 160px"
        @update:value="handleSearch"
      />
      <NButton @click="handleReset">重置</NButton>
    </div>

    <!-- 批次列表 -->
    <HseDataGrid
      :columns="columns"
      :data="list"
      :loading="loading"
      :pager="true"
      :total="total"
      @page-change="onPageChange"
    >
      <template #batchNo="{ row }">
        <a class="cursor-pointer text-[var(--vxe-ui-font-primary-color)] hover:underline" @click="openDetailDrawer(row)">
          {{ row.batch_no }}
        </a>
      </template>
      <template #success="{ row }">
        <NTag :bordered="false" size="small" type="success">{{ row.success_count || 0 }}</NTag>
      </template>
      <template #pending="{ row }">
        <NTag :bordered="false" size="small" type="warning">{{ row.pending_count || 0 }}</NTag>
      </template>
      <template #status="{ row }">
        <HseStatusTag :type="statusTypeMap[row.status] || 'neutral'" :label="statusTextMap[row.status] || row.status" />
      </template>
      <template #operator="{ row }">
        {{ row.operator || '-' }}
      </template>
      <template #createdAt="{ row }">
        {{ formatDateTime(row.created_at) }}
      </template>
      <template #action="{ row }">
        <NSpace justify="center">
          <NButton size="small" type="primary" quaternary @click="openDetailDrawer(row)">查看</NButton>
          <NPopconfirm @positive-click="handleDeleteBatch(row)">
            <template #trigger>
              <NButton size="small" type="error" quaternary>删除</NButton>
            </template>
            确定删除该批次？删除后不可恢复，其下的待确认记录也会一并删除。
          </NPopconfirm>
        </NSpace>
      </template>
    </HseDataGrid>

    <!-- 上传抽屉 -->
    <NDrawer v-model:show="uploadDrawerVisible" :width="640">
      <NDrawerContent title="上传员工花名册" :native-scrollbar="false">
        <NAlert type="info" :show-icon="true" class="mb-4">
          <template #header>使用说明</template>
          <div class="text-sm leading-6">
            1. 支持 .xlsx / .xls 格式；<br />
            2. 请使用系统提供的标准模板，包含 13 个标准字段（员工编号/姓名/身份证号/性别/出生日期/所属部门/班组/职位/入职日期/联系电话/是否驾驶员/驾驶证类型/直接上级）；<br />
            3. 上传后系统将自动解析、校验、组织/岗位匹配；<br />
            4. 异常数据进入待审核，需要人工确认后才能入库。
          </div>
        </NAlert>
        <NUpload
          accept=".xlsx,.xls"
          :max="1"
          :default-upload="false"
          :show-file-list="true"
          @change="onUploadChange"
        >
          <NUploadDragger>
            <div class="flex flex-col items-center gap-2 py-6">
              <Inbox :size="48" class="text-[var(--vxe-ui-font-primary-color)]" />
              <div class="text-base font-medium">点击或拖拽文件到此区域上传</div>
              <div class="text-sm text-muted-foreground">仅支持 .xlsx / .xls 格式，文件大小不超过 10MB</div>
            </div>
          </NUploadDragger>
        </NUpload>

        <div v-if="uploadResult" class="mt-6">
          <NAlert type="success" :show-icon="true" title="上传解析完成">
            <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
              <NStatistic label="批次号" :value="uploadResult.batchNo" />
              <NStatistic label="总人数" :value="uploadResult.totalRows" />
              <NStatistic label="成功匹配" :value="uploadResult.successCount" />
              <NStatistic label="异常待审" :value="uploadResult.pendingCount" />
            </div>
            <div class="mt-3">
              规则版本：<NTag :bordered="false" type="info">{{ uploadResult.ruleVersion }}</NTag>
            </div>
          </NAlert>
        </div>
      </NDrawerContent>
    </NDrawer>

    <!-- 批次详情 / 审核抽屉 -->
    <NDrawer
      v-model:show="detailDrawerVisible"
      :width="1180"
      @close="closeDetailDrawer"
    >
      <NDrawerContent
        :title="`批次详情：${currentBatch?.batch_no || ''}`"
      >
        <div v-if="currentBatch" class="flex h-full min-h-0 flex-col">
          <!-- 批次概览 -->
          <NCard :bordered="false" class="mb-4">
            <div class="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              <NStatistic label="总人数" :value="currentBatch.total_count" />
              <NStatistic label="已匹配" :value="currentBatch.success_count" />
              <NStatistic label="异常" :value="currentBatch.pending_count" />
              <NStatistic label="跳过" :value="currentBatch.skipped_count" />
              <NStatistic label="规则版本" :value="currentBatch.rule_version" />
              <div class="flex flex-col justify-center">
                <span class="mb-1 text-xs text-muted-foreground">状态</span>
                <HseStatusTag
                  :type="statusTypeMap[currentBatch.status] || 'neutral'"
                  :label="statusTextMap[currentBatch.status] || currentBatch.status"
                />
              </div>
            </div>
          </NCard>

          <!-- 操作栏 -->
          <NSpace class="mb-3">
            <NButton @click="loadPendingList">
              <template #icon><Inbox :size="16" /></template>
              刷新
            </NButton>
            <NButton
              v-if="canResolve && currentBatch.status === 'pending_review' && pendingList.some((p) => p.status === 'pending')"
              @click="handleBatchApprove"
            >
              批量通过
            </NButton>
            <NButton
              v-if="canExecute && currentBatch.status !== 'completed'"
              type="primary"
              @click="openImportConfirm"
            >
              确认入库
            </NButton>
          </NSpace>

          <!-- 筛选 -->
          <NSpace class="mb-3">
            <NSelect
              v-model:value="pendingFilter.status"
              :options="Object.entries(pendingStatusTextMap).map(([value, label]) => ({ value, label }))"
              placeholder="待审状态"
              clearable
              style="width: 140px"
              @update:value="loadPendingList"
            />
            <NSelect
              v-model:value="pendingFilter.pending_type"
              :options="Object.entries(pendingTypeTextMap).map(([value, label]) => ({ value, label }))"
              placeholder="异常类型"
              clearable
              style="width: 140px"
              @update:value="loadPendingList"
            />
          </NSpace>

          <!-- 待审记录表 -->
          <HseDataGrid
            :columns="pendingColumns"
            :data="pagedPendingList"
            :loading="detailLoading"
            :total="pendingList.length"
            :pager="{ pageSize: pendingPageSize, pageSizes: [20, 50, 100] }"
            :size="'small'"
            @page-change="onPendingPageChange"
          >
            <template #pendingType="{ row }">
              <HseStatusTag
                :type="pendingTypeTypeMap[row.pending_type] || 'neutral'"
                :label="pendingTypeTextMap[row.pending_type] || row.pending_type"
              />
            </template>
            <template #pendingDesc="{ row }">
              <span class="text-error">{{ row.pending_desc || '-' }}</span>
            </template>
            <template #pendingStatus="{ row }">
              <HseStatusTag
                :type="pendingStatusTypeMap[row.status] || 'neutral'"
                :label="pendingStatusTextMap[row.status] || row.status"
              />
            </template>
            <template #pendingAction="{ row }">
              <NButton
                v-if="row.status === 'pending'"
                size="small"
                type="primary"
                text
                @click="openResolveDialog(row)"
              >
                审核
              </NButton>
              <span v-else class="text-muted-foreground">-</span>
            </template>
          </HseDataGrid>
        </div>
      </NDrawerContent>
    </NDrawer>

    <!-- 审核弹窗 -->
    <NModal
      v-model:show="resolveForm.visible"
      :title="resolveForm.resolution === 'approved' ? '通过审核' : '拒绝审核'"
      preset="card"
      style="width: 560px; max-width: 92vw"
      :mask-closable="false"
    >
      <div v-if="resolveForm.pending">
        <NAlert
          :title="`员工：${resolveForm.pending.employee_name || '-'}（行 ${resolveForm.pending.row_num}）`"
          :description="`所属部门：${resolveForm.pending.raw_dept || '-'} | 职位：${resolveForm.pending.raw_position || '-'} | 异常类型：${pendingTypeTextMap[resolveForm.pending.pending_type] || resolveForm.pending.pending_type}`"
          type="info"
          :show-icon="true"
          class="mb-4"
        />
        <div class="mb-3">
          <label class="mb-1 block text-sm">决议：</label>
          <NSelect
            v-model:value="resolveForm.resolution"
            :options="[
              { label: '通过', value: 'approved' },
              { label: '拒绝', value: 'rejected' },
            ]"
          />
        </div>
        <div v-if="resolveForm.resolution === 'approved'" class="mb-3">
          <p class="mb-2 text-muted-foreground">注：当前版本仅展示待审目标，如需修改请联系开发扩展目标选择器。</p>
          <div class="mb-2">目标组织ID：<NInputNumber v-model:value="resolveForm.target_org_id" :min="0" placeholder="可选" style="width: 200px" /></div>
          <div class="mb-2">目标作业单元ID：<NInputNumber v-model:value="resolveForm.target_unit_id" :min="0" placeholder="可选" style="width: 200px" /></div>
          <div>目标岗位ID：<NInputNumber v-model:value="resolveForm.target_pos_id" :min="0" placeholder="可选" style="width: 200px" /></div>
        </div>
        <div>
          <label class="mb-1 block text-sm">备注：</label>
          <NInput v-model:value="resolveForm.remark" type="textarea" :rows="3" placeholder="可填写处理说明" />
        </div>
      </div>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="resolveForm.visible = false">取消</NButton>
          <NButton type="primary" @click="handleResolveSubmit">确定</NButton>
        </NSpace>
      </template>
    </NModal>

    <!-- 入库结果 -->
    <NModal
      v-model:show="importResultVisible"
      title="入库结果"
      preset="card"
      style="width: 560px; max-width: 92vw"
      :show-footer="false"
    >
      <div v-if="importResult">
        <NResult
          :status="importResult.failedCount > 0 ? 'warning' : 'success'"
          :title="importResult.failedCount > 0 ? '部分入库完成' : '入库完成'"
          :sub-title="`共处理 ${importResult.total} 条记录，新增 ${importResult.insertedCount} 个员工，更新 ${importResult.updatedCount} 个员工，创建 ${importResult.assignmentCount} 条任职关系`"
        >
          <template #footer>
            <div v-if="importResult.errors && importResult.errors.length > 0" class="mt-2 text-left">
              <p class="text-error">失败记录：</p>
              <ul class="list-disc pl-5">
                <li v-for="(e, i) in importResult.errors" :key="i" class="text-error">{{ e }}</li>
              </ul>
            </div>
          </template>
        </NResult>
      </div>
    </NModal>
  </HsePageLayout>

  <!-- 目录花名册导入抽屉（来源目录扫描 + 自动确认入库） -->
  <NDrawer v-model:show="sourceDrawerVisible" :width="920" :title="'目录花名册导入（按修改时间由近到远）'">
    <NDrawerContent class="flex h-full min-h-0 flex-col">
      <NAlert type="info" :show-icon="true" class="mb-3">
        <template #header>来源目录：{{ sourceDirectory || '未加载' }}</template>
        <div class="text-sm leading-6">
          1. 展示来源目录中的 Excel 花名册文件，已按修改时间由近到远排序；<br />
          2. 点击「导入并入库」将自动完成解析校验，并把匹配成功的行写入员工主数据（异常行保留到批次待审）；<br />
          3. 已导入过的文件不再重复导入，如需重新导入请先删除对应批次。
        </div>
      </NAlert>
      <div class="mb-3 flex items-center gap-3">
        <NButton :loading="sourceLoading" @click="loadSourceFiles">
          <template #icon><Inbox :size="16" /></template>
          刷新列表
        </NButton>
        <NButton
          type="primary"
          :loading="sourceImportingAll"
          :disabled="sourceFiles.every((f) => f.imported)"
          @click="confirmImportAll"
        >
          全部自动导入并入库
        </NButton>
        <span v-if="sourceImporting !== null" class="text-sm text-muted-foreground">
          正在导入：{{ sourceImporting }} …
        </span>
      </div>
      <HseDataGrid
        :columns="sourceColumns"
        :data="sourceFiles"
        :loading="sourceLoading"
        :pager="false"
        :height="'auto'"
      >
        <template #mtime="{ row }">{{ formatMtime(row.mtime) }}</template>
        <template #size="{ row }">{{ formatSize(row.size) }}</template>
        <template #imported="{ row }">
          <HseStatusTag
            :type="row.imported ? 'success' : 'warning'"
            :label="row.imported ? '已导入' : '未导入'"
          />
        </template>
        <template #action="{ row }">
          <NButton
            v-if="!row.imported"
            size="small"
            type="primary"
            :loading="sourceImporting === row.fileName"
            @click="confirmImportOne(row)"
          >
            导入并入库
          </NButton>
          <span v-else class="text-muted-foreground">-</span>
        </template>
      </HseDataGrid>
    </NDrawerContent>
  </NDrawer>
  </div>
</template>
