<script lang="ts" setup>
/**
 * 网格长巡查台账（web-naive · 阶段06B-1）
 * route：/site/grid/ledger（三级菜单，父级 /site/grid — 网格管理）
 * 契约来源：server/routes/site-mgmt.js grid_inspection_records 三个接口：
 *   GET  /grid-records（筛选列表 · 一次性返回，虚拟滚动渲染）
 *   GET  /grid-records/filter-options（筛选下拉选项）
 *   PUT  /grid-records/:id（单元格编辑保存 · 仅白名单字段可更新）
 * 能力：关键字/片区/网格级别/上报状态筛选；HseDataGrid 自定义表格 + 单元格编辑（点击即编辑，关闭即保存）
 *      + 虚拟滚动（大体积台账）。单元格编辑字段对齐后端 GRID_RECORD_EDITABLE 白名单。
 */
import { computed, onMounted, reactive, ref } from 'vue';

import { useAccess } from '@vben/access';

import {
  NButton,
  NCard,
  NForm,
  NFormItem,
  NGi,
  NImage,
  NImageGroup,
  NInput,
  NModal,
  NSelect,
  NSpace,
  NTag,
} from 'naive-ui';
import { $t } from '#/locales';

import {
  HseActionBar,
  HseDataGrid,
  HseImportDialog,
  HsePageLayout,
  HseSearchPanel,
  type HseActionKey,
} from '#/components/hse';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';
import {
  clearGridInspectionRecords,
  createGridInspectionRecord,
  deleteGridInspectionRecords,
  getGridInspectionFilterOptions,
  getGridInspectionList,
  updateGridInspectionRecord,
  type SiteApi,
} from '#/api/hse/site';
import { useGenericImport } from '#/views/hse/_shared/useGenericImport';
import { dialog, message } from '#/adapter/naive';

defineOptions({ name: 'SiteGridPatrolLedger' });

// P2-B1-E-02：「表格清空」（清空全部台账）为高危操作，业务规则限定仅主账号 admin 可见可执行。
// 前端隐藏仅为体验层控制，最终安全边界在后端（DELETE /api/site-mgmt/grid-records/all
// 经 requirePermission('hse:site:grid:purge') + requireRole('system_admin','admin') 双闸）。
const { hasAccessByRoles } = useAccess();
const canPurge = computed(() => hasAccessByRoles(['admin']));

// ===================== 常量映射 =====================
const GRID_LEVEL_OPTIONS = ['一级网格长', '二级网格长', '三级网格长'];
const POSITION_OPTIONS = ['网格长', '网格员', '安全员', '班组长'];
const GENDER_OPTIONS = ['男', '女'];
const RECTIFY_OPTIONS = ['是', '否', '—'];
const REPORT_STATUS_OPTIONS = ['已上报', '未上报', '待上报'];

// 单元格编辑字段（camelCase → DB snake_case，对齐 GRID_RECORD_EDITABLE 白名单）
const EDITABLE_FIELD_MAP: Record<string, string> = {
  areaTeam: 'area_team',
  inspectionDate: 'inspection_date',
  personnelName: 'personnel_name',
  gridLevel: 'grid_level',
  position: 'position',
  violatorName: 'violator_name',
  violatorGender: 'violator_gender',
  violatorAge: 'violator_age',
  reportStatus: 'report_status',
  violationBehavior: 'violation_behavior',
  needRectification: 'need_rectification',
  rectifier: 'rectifier',
  nickname: 'nickname',
  signupToday: 'signup_today',
  marker: 'marker',
  isResubmit: 'is_resubmit',
  serialNo: 'serial_no',
};

const REPORT_TAG: Record<string, 'success' | 'info' | 'warning' | 'default'> = {
  已上报: 'success',
  未上报: 'default',
  待上报: 'warning',
};

// 单元格编辑渲染子项
function editInput(): any {
  return { name: 'input', type: 'text' };
}
function editSelect(options: string[]): any {
  return { name: 'select', options: options.map((v) => ({ label: v, value: v })) };
}

// 图片字段以逗号分隔存放 webpath（如 /uploads/grid-inspection/{run}/row3_c8_1.jpeg），拆分成数组供预览。
// 排除占位文本（"--" / "-" / "无" / "无三违行为" 等），仅保留真正像图片路径的值，避免把占位符当 src 渲染裂图。
const IMG_PATH_RE = /(\/uploads\/|^https?:\/\/|\.(?:jpe?g|png|gif|webp|bmp)(?:[?#].*)?$)/i;
function toImageList(value?: string | null): string[] {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((p) => p.trim())
    .filter((p) => IMG_PATH_RE.test(p));
}

// ===================== 列表数据 =====================
const loading = ref(false);
const data = ref<SiteApi.GridInspectionRecord[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(100);
// 默认按巡查日期最新在前（服务端排序，支持点击表头切换）
const sortBy = ref('inspectionDate');
const sortOrder = ref<'asc' | 'desc'>('desc');

const searchForm = reactive({
  keyword: '',
  areaTeam: undefined as string | undefined,
  gridLevel: undefined as string | undefined,
  reportStatus: undefined as string | undefined,
});

const filterOptions = ref<SiteApi.GridInspectionFilterOptions>({
  areaTeams: [],
  gridLevels: [],
  reportStatuses: [],
  months: [],
});

/** 顶部月份下拉（YYYY-MM）：按巡查日期筛选当月明细；为空表示不限制（全部月份） */
const selectedMonth = ref('');
const monthOptions = ref<{ label: string; value: string }[]>([]);

const REPORT_STATUS_EDIT = REPORT_STATUS_OPTIONS.sort((a, b) => a.localeCompare(b, 'zh'));

async function loadData() {
  loading.value = true;
  try {
    const res = await getGridInspectionList({
      keyword: searchForm.keyword || undefined,
      areaTeam: searchForm.areaTeam,
      gridLevel: searchForm.gridLevel,
      reportStatus: searchForm.reportStatus,
      month: selectedMonth.value || undefined,
      page: page.value,
      pageSize: pageSize.value,
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

function onPageChange(payload: { currentPage: number; pageSize: number }) {
  page.value = payload.currentPage;
  pageSize.value = payload.pageSize;
  loadData();
}

// 点击表头排序（服务端三态）：取消排序时回退为默认日期倒序
function onSortChange(payload: { sortBy?: string; sortOrder?: 'asc' | 'desc' }) {
  if (payload.sortOrder && payload.sortBy) {
    sortBy.value = payload.sortBy;
    sortOrder.value = payload.sortOrder;
  } else {
    sortBy.value = 'inspectionDate';
    sortOrder.value = 'desc';
  }
  page.value = 1;
  loadData();
}

async function loadFilterOptions() {
  try {
    const res = await getGridInspectionFilterOptions();
    filterOptions.value = {
      areaTeams: res.areaTeams ?? [],
      gridLevels: res.gridLevels ?? [],
      reportStatuses: res.reportStatuses ?? [],
      months: res.months ?? [],
    };
    monthOptions.value = (res.months ?? []).map((m) => ({ label: m, value: m }));
    // 默认选中最近一个有数据的月份（最新在前）；可清空恢复全部
    if (!selectedMonth.value || !monthOptions.value.some((o) => o.value === selectedMonth.value)) {
      selectedMonth.value = monthOptions.value[0]?.value ?? '';
    }
  } catch {
    /* ignore */
  }
}

function onSearch() {
  page.value = 1;
  loadData();
}
function onReset() {
  Object.assign(searchForm, {
    keyword: '',
    areaTeam: undefined,
    gridLevel: undefined,
    reportStatus: undefined,
  });
  page.value = 1;
  loadData();
}
/** 顶部月份切换：重新拉取该月台账明细（清空则显示全部月份） */
function onMonthChange() {
  page.value = 1;
  loadData();
}
function onRefresh() {
  loadData();
}

// ===================== 工具条（对齐「网格长巡查管理」6 按钮） =====================
const gridRef = ref<any>(null);
const actionState = ref<Partial<Record<HseActionKey, { hidden?: boolean }>>>({
  export: {},
});

// 导入：grid 模块即写入 grid_inspection_records（台账表），复用通用导入网关
const {
  importOpen,
  importPreviewColumns,
  importPreviewData,
  importPreviewError,
  importConfirming,
  importResult,
  onDownloadTemplate: onImportTemplate,
  onUpload: onImportUpload,
  onConfirmImport: onImportConfirm,
  onImportClose: onImportDialogClose,
  bindRefresh: bindImportRefresh,
} = useGenericImport('grid');
bindImportRefresh(onRefresh);

// 导出：分页后表格仅含当前页，故按筛选条件分页拉取全量后由前端生成 CSV（保留多行图片不受影响）
async function handleExport() {
  try {
    const exportAll: any[] = [];
    const perPage = 200;
    let p = 1;
    let totalRows = 0;
    do {
      const r = await getGridInspectionList({
        keyword: searchForm.keyword || undefined,
        areaTeam: searchForm.areaTeam,
        gridLevel: searchForm.gridLevel,
        reportStatus: searchForm.reportStatus,
        month: selectedMonth.value || undefined,
        page: p,
        pageSize: perPage,
      });
      const list = r.list ?? [];
      exportAll.push(...list);
      totalRows = r.total ?? 0;
      p++;
    } while (exportAll.length < totalRows && totalRows > 0);

    const cols = (columns.value ?? []).filter((c: any) => c.type !== 'checkbox');
    const titleRow = cols.map((c: any) => `"${String(c.title ?? '').replace(/"/g, '""')}"`).join(',');
    const rows = exportAll.map((row) =>
      cols
        .map((c: any) => {
          let v = row[c.field ?? ''];
          if (c.formatter) {
            try {
              v = c.formatter({ row, cellValue: v }) ?? v;
            } catch {
              /* 忽略格式化异常 */
            }
          }
          const s = v == null ? '' : String(v).replace(/"/g, '""');
          return `"${s}"`;
        })
        .join(','),
    );
    const csv = '\uFEFF' + [titleRow, ...rows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `网格长巡查台账_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  } catch {
    message.error('导出失败');
  }
}

// 批量删除：勾选行 → DELETE /grid-records
function getSelectedRows(): any[] {
  try {
    return gridRef.value?.gridApi?.grid?.getCheckboxRecords?.() ?? [];
  } catch {
    return [];
  }
}
async function onBatchDelete() {
  const rows = getSelectedRows();
  if (!rows.length) {
    message.warning('请先勾选要删除的记录');
    return;
  }
  // 记录 id 兼容 number（PG 自增）与 string（WPS Record ID，Sprint-WPS-02-A 阻断项7整改），全链路按字符串/透传处理
  const ids = rows.map((r) => r.id).filter((v) => v != null && (typeof v === 'number' || typeof v === 'string'));
  if (!ids.length) {
    message.warning('请先勾选要删除的记录');
    return;
  }
  try {
    const res = await deleteGridInspectionRecords(ids);
    message.success(`已删除 ${res?.deleted ?? ids.length} 条`);
    onRefresh();
  } catch {
    /* 拦截器已提示 */
  }
}

// 表格清空：清空台账全部内容（调试用，二次确认后执行）
async function onClearAll() {
  try {
    const confirmed = await new Promise<boolean>((resolve) => {
      dialog.warning({
        title: '确定清空全部台账？',
        content: '该操作将删除台账中的所有记录并重置完成率，且不可恢复。是否继续？',
        positiveText: '清空',
        negativeText: '取消',
        onPositiveClick: () => resolve(true),
        onNegativeClick: () => resolve(false),
        onClose: () => resolve(false),
        onMaskClick: () => resolve(false),
      });
    });
    if (!confirmed) return;
    const res = await clearGridInspectionRecords();
    message.success(`已清空 ${res?.deleted ?? 0} 条记录`);
    onRefresh();
  } catch {
    /* 拦截器已提示 */
  }
}

// ===================== 新增弹窗 =====================
const formOpen = ref(false);
const formLoading = ref(false);
const formModel = reactive<Partial<SiteApi.GridInspectionRecord>>({
  areaTeam: '',
  inspectionDate: '',
  personnelName: '',
  gridLevel: '',
  position: '',
  violatorName: '',
  violatorGender: '',
  violatorAge: '',
  vehicleType: '',
  reportStatus: '',
  imageContent: '',
  violationBehavior: '',
  violationTypeResult: '',
  needRectification: '',
  rectifier: '',
  rectifiedPhoto: '',
  schematic: '',
});
function resetForm() {
  Object.assign(formModel, {
    areaTeam: '',
    inspectionDate: '',
    personnelName: '',
    gridLevel: '',
    position: '',
    violatorName: '',
    violatorGender: '',
    violatorAge: '',
    vehicleType: '',
    reportStatus: '',
    imageContent: '',
    violationBehavior: '',
    violationTypeResult: '',
    needRectification: '',
    rectifier: '',
    rectifiedPhoto: '',
    schematic: '',
  });
}
function openCreate() {
  resetForm();
  formOpen.value = true;
}
async function onSubmit() {
  if (!formModel.areaTeam && !formModel.personnelName && !formModel.violationBehavior) {
    message.warning('请至少填写片区/班组、检查人或违章行为');
    return;
  }
  formLoading.value = true;
  try {
    const payload: Partial<SiteApi.GridInspectionRecord> = {};
    for (const k of Object.keys(formModel)) {
      const v = (formModel as any)[k];
      if (v !== undefined && v !== null && String(v).trim() !== '') {
        (payload as any)[k] = v;
      }
    }
    await createGridInspectionRecord(payload);
    message.success('新增成功');
    formOpen.value = false;
    onRefresh();
  } catch {
    /* 拦截器已提示 */
  } finally {
    formLoading.value = false;
  }
}

// ===================== 单元格编辑保存 =====================
// cell 模式：点击单元格进入编辑，关闭即自动保存（HseDataGrid autoClear）。
// edit-closed 每次触发对应「单个单元格」，取回该列最新值，仅更新受影响字段，随后本地同步该单元格。
async function onEditClosed(payload: { row: any; column: any }) {
  const field = payload?.column?.field as string | undefined;
  if (!field || !EDITABLE_FIELD_MAP[field]) {
    return; // 非编辑白名单列（如展示列）忽略
  }
  const dbField = EDITABLE_FIELD_MAP[field];
  const value = payload.row?.[field];
  try {
    await updateGridInspectionRecord(payload.row.id, { [dbField]: value });
    message.success('已保存');
  } catch {
    // 倒带回滚本地值：重新拉取该行（简明处理：整体刷新，保证与后端一致）
    loadData();
  }
}

// ===================== 表格列 =====================
/** 巡查日期展示：统一为 yyyy-MM-dd；优先截取原字符串首 10 位，避免时区偏移 */
function formatDateShort(v: any): string {
  if (v == null || v === '') return '';
  const s = String(v).trim();
  const m = s.match(/^\d{4}-\d{2}-\d{2}/);
  if (m) return m[0];
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${mo}-${day}`;
  }
  return s;
}

const columns = ref<VxeTableGridColumns>([
  { type: 'checkbox', width: 50, align: 'center', fixed: 'left' },
  {
    title: '序号',
    field: 'index',
    width: 70,
    align: 'center',
    fixed: 'left',
    formatter: (params: any) => (params?.rowIndex ?? 0) + (page.value - 1) * pageSize.value + 1,
  },
  { title: '昵称', field: 'nickname', minWidth: 110, align: 'center', editRender: editInput() },
  { title: '分组名称', field: 'areaTeam', minWidth: 120, align: 'center', editRender: editInput() },
  { title: '姓名', field: 'personnelName', minWidth: 100, align: 'center', editRender: editInput() },
  { title: '所属岗位', field: 'position', minWidth: 130, align: 'center', editRender: editInput() },
  { title: '网格等级', field: 'gridLevel', minWidth: 115, align: 'center', editRender: editSelect(GRID_LEVEL_OPTIONS) },
  {
    title: '日期',
    field: 'inspectionDate',
    minWidth: 110,
    align: 'center',
    sortable: true,
    sortOrder: sortOrder.value,
    editRender: editInput(),
    formatter: ({ cellValue }: any) => formatDateShort(cellValue),
  },
  { title: '三违照片', field: 'imageContent', minWidth: 120, align: 'center', slots: { default: 'imageContent' } },
  {
    title: '三违行为',
    field: 'violationBehavior',
    minWidth: 220,
    align: 'center',
    editRender: editInput(),
    showOverflow: 'tooltip',
  },
  { title: '违章人姓名', field: 'violatorName', minWidth: 110, align: 'center', editRender: editInput() },
  { title: '违章人性别', field: 'violatorGender', minWidth: 105, align: 'center', editRender: editSelect(GENDER_OPTIONS) },
  { title: '违章人年龄', field: 'violatorAge', minWidth: 105, align: 'center', editRender: editInput() },
  { title: '整改后照片', field: 'rectifiedPhoto', minWidth: 120, align: 'center', slots: { default: 'rectifiedPhoto' } },
  { title: '编号', field: 'serialNo', minWidth: 110, align: 'center' },
]);

onMounted(async () => {
  await Promise.all([loadData(), loadFilterOptions()]);
});
</script>

<template>
  <HsePageLayout
    :description="$t('page.hse.siteGridPatrolLedgerDesc')"
    :title="$t('page.hse.siteGridPatrolLedger')"
  >
    <!-- 顶部工具条：与「网格长巡查管理」一致的 6 按钮 -->
    <template #extra>
      <NSpace>
        <NButton v-if="canPurge" type="warning" secondary @click="onClearAll">表格清空</NButton>
        <NButton type="error" secondary @click="onBatchDelete">批量删除</NButton>
        <HseActionBar
          :actions="actionState"
          @refresh="onRefresh"
          @download-template="onImportTemplate"
          @import="() => (importOpen = true)"
          @export="handleExport"
          @create="openCreate"
        />
      </NSpace>
    </template>

    <!-- 顶部月份下拉：按巡查日期筛选当月明细（结构对齐 驾驶员·月度考核 为内容区第一个子元素；清空=全部） -->
    <div class="mb-4">
      <NSelect
        v-model:value="selectedMonth"
        placeholder="请选择月份（留空显示全部）"
        clearable
        :options="monthOptions"
        style="max-width: 320px"
        @update:value="onMonthChange"
      />
    </div>

    <!-- 搜索 -->
    <HseSearchPanel @query="onSearch" @reset="onReset">
      <NGi>
        <NInput
          v-model:value="searchForm.keyword"
          placeholder="网格长 / 片区 / 违章人 / 违章行为"
          clearable
          @keyup.enter="onSearch"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.areaTeam"
          placeholder="片区/班组"
          clearable
          filterable
          :options="filterOptions.areaTeams.map((v) => ({ label: v, value: v }))"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.gridLevel"
          placeholder="网格级别"
          clearable
          :options="filterOptions.gridLevels.map((v) => ({ label: v, value: v }))"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.reportStatus"
          placeholder="上报状态"
          clearable
          :options="filterOptions.reportStatuses.map((v) => ({ label: v, value: v }))"
        />
      </NGi>
    </HseSearchPanel>

    <!-- 顶部提示 & 统计 -->
    <NCard
      :bordered="false"
      class="mb-4"
      size="small"
      title="台账说明"
    >
      <div class="flex items-center justify-between gap-4 text-sm text-gray-600">
        <span>点击可编辑单元格（蓝/填充态）直接修改，关闭即保存；共 {{ total }} 条，每页 {{ pageSize }} 条分页浏览。</span>
      </div>
    </NCard>

    <!-- 自定义表格：单元格编辑 + 服务端分页（每页 20） -->
    <HseDataGrid
      ref="gridRef"
      :columns="columns"
      :data="data"
      :loading="loading"
      :total="total"
      :current-page="page"
      :page-size="pageSize"
      :pager="true"
      editable
      edit-mode="cell"
      @page-change="onPageChange"
      @sort-change="onSortChange"
      @edit-closed="onEditClosed"
    >
      <template #report="{ row }">
        <NTag
          size="small"
          :type="REPORT_TAG[row.reportStatus] || 'default'"
          :bordered="false"
        >
          {{ row.reportStatus || '-' }}
        </NTag>
      </template>

      <template #imageContent="{ row }">
        <NImageGroup v-if="toImageList(row.imageContent).length">
          <NImage
            v-for="src in toImageList(row.imageContent)"
            :key="src"
            :src="src"
            :preview-src="src"
            width="56"
            height="56"
            object-fit="cover"
            class="mr-1"
          />
        </NImageGroup>
        <span v-else class="text-gray-400">-</span>
      </template>

      <template #rectifiedPhoto="{ row }">
        <NImageGroup v-if="toImageList(row.rectifiedPhoto).length">
          <NImage
            v-for="src in toImageList(row.rectifiedPhoto)"
            :key="src"
            :src="src"
            :preview-src="src"
            width="56"
            height="56"
            object-fit="cover"
            class="mr-1"
          />
        </NImageGroup>
        <span v-else class="text-gray-400">-</span>
      </template>
    </HseDataGrid>

    <!-- 新增台账记录弹窗 -->
    <NModal
      v-model:show="formOpen"
      title="新增巡查台账记录"
      preset="card"
      style="width: 720px; max-width: 94vw"
      :mask-closable="false"
    >
      <NForm label-placement="top">
        <div class="grid grid-cols-2 gap-x-4">
          <NFormItem label="片区/班组">
            <NInput v-model:value="formModel.areaTeam" placeholder="选填" />
          </NFormItem>
          <NFormItem label="巡查日期">
            <NInput v-model:value="formModel.inspectionDate" placeholder="yyyy-MM-dd，选填" />
          </NFormItem>
          <NFormItem label="检查人(网格长)">
            <NInput v-model:value="formModel.personnelName" placeholder="选填" />
          </NFormItem>
          <NFormItem label="网格级别">
            <NSelect
              v-model:value="formModel.gridLevel"
              :options="GRID_LEVEL_OPTIONS.map((v) => ({ label: v, value: v }))"
            />
          </NFormItem>
          <NFormItem label="职务">
            <NSelect
              v-model:value="formModel.position"
              :options="POSITION_OPTIONS.map((v) => ({ label: v, value: v }))"
            />
          </NFormItem>
          <NFormItem label="违章人">
            <NInput v-model:value="formModel.violatorName" placeholder="选填" />
          </NFormItem>
          <NFormItem label="性别">
            <NSelect
              v-model:value="formModel.violatorGender"
              :options="GENDER_OPTIONS.map((v) => ({ label: v, value: v }))"
            />
          </NFormItem>
          <NFormItem label="年龄">
            <NInput v-model:value="formModel.violatorAge" placeholder="选填" />
          </NFormItem>
          <NFormItem label="车辆类型">
            <NInput v-model:value="formModel.vehicleType" placeholder="选填" />
          </NFormItem>
          <NFormItem label="上报状态">
            <NSelect
              v-model:value="formModel.reportStatus"
              :options="REPORT_STATUS_EDIT.map((v) => ({ label: v, value: v }))"
            />
          </NFormItem>
          <NFormItem label="违章类型/结果">
            <NInput v-model:value="formModel.violationTypeResult" placeholder="选填" />
          </NFormItem>
          <NFormItem label="需整改">
            <NSelect
              v-model:value="formModel.needRectification"
              :options="RECTIFY_OPTIONS.map((v) => ({ label: v, value: v }))"
            />
          </NFormItem>
        </div>
        <NFormItem label="违章行为">
          <NInput v-model:value="formModel.violationBehavior" type="textarea" :rows="2" placeholder="选填" />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="formOpen = false">关闭</NButton>
          <NButton type="primary" :loading="formLoading" @click="onSubmit">保存</NButton>
        </NSpace>
      </template>
    </NModal>

    <!-- 通用导入（grid 模块 → 写入台账表 grid_inspection_records） -->
    <HseImportDialog
      v-model:open="importOpen"
      title="导入网格长巡查台账数据"
      :preview-columns="importPreviewColumns"
      :preview-data="importPreviewData"
      :preview-error="importPreviewError"
      :confirming="importConfirming"
      :result="importResult"
      @download-template="onImportTemplate"
      @upload="onImportUpload"
      @confirm="onImportConfirm"
      @close="onImportDialogClose"
    />
  </HsePageLayout>
</template>