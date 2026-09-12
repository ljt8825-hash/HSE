<script lang="ts" setup>
/**
 * 转运站管理台账（web-naive · 补充缺失业务模块）
 * 后端契约：server/controllers/checkLedgerFactory.js → /api/transfer-stations
 * 规则映射：TRANSFER001（巡查缺失）/ TRANSFER002（标识牌问题）/ FIRE001（消防点检考核点）
 * 能力：服务端分页列表 / 筛选 / 详情抽屉 / 新增·编辑·删除(二次确认) / 批量删除 /
 *      服务端 Excel 导出 / 两段式导入（useCheckLedgerImport）。
 * 边界：不改既有 server 模块；列表返回 snake_case 行，提交用 camelCase payload。
 */
import { computed, onMounted, reactive, ref } from 'vue';

import {
  NButton,
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
  confirmTransferStationImport,
  createTransferStation,
  continueTransferStations,
  deleteTransferStation,
  deleteTransferStations,
  exportTransferStations,
  getTransferStationList,
  getTransferStationTemplate,
  previewTransferStationImport,
  updateTransferStation,
  type CheckLedgerApi,
} from '#/api/hse/checkLedger';
import { useCheckLedgerImport } from '#/views/hse/_shared/useCheckLedgerImport';
import { message } from '#/adapter/naive';

defineOptions({ name: 'SiteTransferStations' });

// ===================== 列表数据（月份下拉 + 本地过滤，对齐「安全文化建设」） =====================
const loading = ref(false);
const allRows = ref<CheckLedgerApi.TransferStationRow[]>([]);
const data = ref<CheckLedgerApi.TransferStationRow[]>([]);
const total = ref(0);

const searchForm = reactive<CheckLedgerApi.TransferStationListParams>({
  keyword: '',
  stationCode: undefined,
  areaTeam: undefined,
});

/** 当前选中月份（列表按此过滤），下拉选项由台账出现过的月份动态生成、倒序 */
const selectedMonth = ref('');
const monthOptions = ref<{ label: string; value: string }[]>([]);

const currentMonth = computed(() => {
  const now = new Date();
  return `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}`;
});

/** 月份步进（YYYY-MM 加/减 n 个月，跨年由 Date 自动处理） */
function monthStep(ym: string, n: number): string {
  const [y = 0, m = 0] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}`;
}

/**
 * 月份下拉占位补全：把「最大台账月的下一个月 → 当前月」的连续缺失月份追加到下拉尾部，
 * 保证尚无台账的月份（如 2026-08、2026-09）也可选，即使该月尚未录入转运站数据。
 */
function fillPlaceholderMonths() {
  const max = monthOptions.value[0]?.value ?? ''; // 已倒序 → 首元素即最大台账月
  if (!max) return;
  let cursor = monthStep(max, 1);
  while (cursor <= (currentMonth.value || max)) {
    if (!monthOptions.value.some((o) => o.value === cursor)) {
      monthOptions.value.push({ label: cursor, value: cursor });
    }
    cursor = monthStep(cursor, 1);
  }
}

/**
 * 后端 /transfer-stations 的 pageSize 上限为 200（Math.min(200,…)），台账按月跨页累积后
 * 分页拉全，前端再做「月份 + 站点/片区」本地过滤（对齐安全文化建设 / 月度考核策略）。
 */
async function fetchAll(): Promise<CheckLedgerApi.TransferStationRow[]> {
  const size = 200;
  const all: CheckLedgerApi.TransferStationRow[] = [];
  let page = 1;
  let totalCount = Number.POSITIVE_INFINITY;
  while (all.length < totalCount && page <= 30) {
    const res = await getTransferStationList({ page, pageSize: size });
    const list = res.list ?? [];
    for (const r of list) all.push(r);
    totalCount = res.total ?? all.length;
    if (list.length < size) break;
    page++;
  }
  return all;
}

async function loadData() {
  loading.value = true;
  try {
    allRows.value = await fetchAll();
    // 月份下拉：仅取台账出现过的月份（check_date 前 7 位），倒序；默认选最近一个有数据的月份
    const set = new Set<string>();
    for (const r of allRows.value) if (r.check_date) set.add(String(r.check_date).slice(0, 7));
    monthOptions.value = [...set]
      .sort((a, b) => b.localeCompare(a))
      .map((m) => ({ label: m, value: m }));
    // 占位补全：把「最大台账月+1 → 当前月」的连续缺失月份（如 2026-08、2026-09）追加到下拉，
    // 即使这些月尚未录入台账也可选。
    fillPlaceholderMonths();
    if (!monthOptions.value.length) {
      monthOptions.value = [{ label: currentMonth.value, value: currentMonth.value }];
    }
    if (!monthOptions.value.some((o) => o.value === selectedMonth.value)) {
      selectedMonth.value = monthOptions.value[0]?.value ?? currentMonth.value;
    }
    applyFilter();
  } catch {
    allRows.value = [];
    data.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

/** 当前选中月份 + 站点/片区 过滤后的集合 */
function filteredRows(): CheckLedgerApi.TransferStationRow[] {
  const kw = (searchForm.keyword || '').trim();
  const code = (searchForm.stationCode || '').trim();
  const team = (searchForm.areaTeam || '').trim();
  return allRows.value.filter((r) => {
    const ym = r.check_date ? String(r.check_date).slice(0, 7) : '';
    if (selectedMonth.value && ym !== selectedMonth.value) return false;
    if (kw) {
      const hay = `${r.station_code || ''} ${r.station_name || ''} ${r.area_team || ''}`;
      if (!hay.includes(kw)) return false;
    }
    if (code && (r.station_code || '') !== code) return false;
    if (team && (r.area_team || '') !== team) return false;
    return true;
  });
}

/** 不分页：月份 + 筛选后全部展示（对齐安全文化建设） */
function applyFilter() {
  const rows = filteredRows();
  total.value = rows.length;
  data.value = rows;
}

function onSearch() {
  applyFilter();
}
function onReset() {
  Object.assign(searchForm, {
    keyword: '',
    stationCode: undefined,
    areaTeam: undefined,
  });
  applyFilter();
}
async function onMonthChange() {
  // 空月份延续上月：切到尚无台账且 ≥2026-08 的月份时，自动把上月站点身份复制成本月空页（幂等），
  // 供人工在系统里录入，无需靠 Excel 导入。
  const m = selectedMonth.value;
  if (m && m >= '2026-08' && !allRows.value.some((r) => (r.check_date ? String(r.check_date).slice(0, 7) : '') === m)) {
    try {
      const r = await continueTransferStations({ month: m });
      if (r.inserted > 0) {
        message.success(`${m} 无台账，已按上月（${r.sourceMonth}）自动生成 ${r.inserted} 条空页，可在下方录入`);
        await onRefresh();
        return;
      }
    } catch {
      /* 拦截器已提示 */
    }
  }
  applyFilter();
}
function onRefresh() {
  return loadData();
}

// ===================== 操作栏 / 导入 =====================
const actionState = ref<Partial<Record<HseActionKey, { hidden?: boolean }>>>({});

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
} = useCheckLedgerImport({
  downloadTemplate: getTransferStationTemplate,
  uploadPreview: previewTransferStationImport,
  confirmImport: confirmTransferStationImport,
  templateFilename: '转运站管理台账导入模板.xlsx',
});
bindImportRefresh(onRefresh);

function handleExport() {
  exportTransferStations({
    keyword: searchForm.keyword || undefined,
    stationCode: searchForm.stationCode || undefined,
    areaTeam: searchForm.areaTeam || undefined,
  }).catch(() => message.error('导出失败'));
}

// ===================== 批量删除 =====================
const gridRef = ref<any>(null);
function getSelectedRows(): CheckLedgerApi.TransferStationRow[] {
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
  try {
    await deleteTransferStations(rows.map((r) => r.id));
    message.success(`已批量删除 ${rows.length} 条`);
    onRefresh();
  } catch {
    /* 拦截器已提示 */
  }
}

// ===================== 新增 / 编辑 / 查看 =====================
const formOpen = ref(false);
const formMode = ref<'create' | 'edit'>('create');
const formLoading = ref(false);
const editingId = ref<number | null>(null);
const formModel = reactive<Required<CheckLedgerApi.TransferStationPayload>>({
  stationCode: '',
  stationName: '',
  areaTeam: '',
  checkDate: '',
  ledgerManagement: 0,
  signManagement: 0,
  electricitySafety: 0,
  fireManagement: 0,
  itemPlacement: 0,
  remark: '',
});

function resetForm() {
  Object.assign(formModel, {
    stationCode: '',
    stationName: '',
    areaTeam: '',
    checkDate: '',
    ledgerManagement: 0,
    signManagement: 0,
    electricitySafety: 0,
    fireManagement: 0,
    itemPlacement: 0,
    remark: '',
  });
}
function openCreate() {
  resetForm();
  formMode.value = 'create';
  editingId.value = null;
  formOpen.value = true;
}
function openEdit(row: CheckLedgerApi.TransferStationRow) {
  resetForm();
  formMode.value = 'edit';
  editingId.value = row.id;
  Object.assign(formModel, {
    stationCode: row.station_code ?? '',
    stationName: row.station_name ?? '',
    areaTeam: row.area_team ?? '',
    checkDate: row.check_date || '',
    ledgerManagement: row.ledger_management ?? 0,
    signManagement: row.sign_management ?? 0,
    electricitySafety: row.electricity_safety ?? 0,
    fireManagement: row.fire_management ?? 0,
    itemPlacement: row.item_placement ?? 0,
    remark: row.remark ?? '',
  });
  formOpen.value = true;
}
function openView(row: CheckLedgerApi.TransferStationRow) {
  currentRecord.value = row;
  detailDrawerVisible.value = true;
}

async function onSubmit() {
  if (!formModel.stationCode) {
    message.warning('请输入站点编号');
    return;
  }
  if (!formModel.stationName) {
    message.warning('请输入站点名称');
    return;
  }
  formLoading.value = true;
  try {
    const payload: CheckLedgerApi.TransferStationPayload = {
      ...formModel,
      checkDate: formModel.checkDate || null,
    };
    if (formMode.value === 'edit' && editingId.value != null) {
      await updateTransferStation(editingId.value, payload);
      message.success('更新成功');
    } else {
      await createTransferStation(payload);
      message.success('创建成功');
    }
    formOpen.value = false;
    onRefresh();
  } catch {
    /* 拦截器已提示 */
  } finally {
    formLoading.value = false;
  }
}

// ===================== 删除 =====================
async function onDelete(row: CheckLedgerApi.TransferStationRow) {
  try {
    await deleteTransferStation(row.id);
    message.success('删除成功');
    onRefresh();
  } catch {
    /* 拦截器已提示 */
  }
}

// ===================== 详情抽屉 =====================
const detailDrawerVisible = ref(false);
const currentRecord = ref<CheckLedgerApi.TransferStationRow | null>(null);

/** 扣分/数值列显示：>0 用红字加粗警示，=0 弱化灰色（对齐「安全文化建设」生效扣分样式） */
function formatScore(v: unknown): string {
  if (v == null || Number.isNaN(Number(v))) return '-';
  const n = Number(v);
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}
function isPositive(v: unknown): boolean {
  return v != null && !Number.isNaN(Number(v)) && Number(v) > 0;
}

/** 乡镇 → 所属作业中心（片区/班组展示口径；津城/宁城为「街道」、刘营伍为「乡」） */
const AREA_UNITS: Record<string, string> = {
  相衙: '相衙镇作业中心',
  大曹: '大曹镇作业中心',
  保店: '保店镇作业中心',
  宁城: '宁城街道作业中心',
  津城: '津城街道作业中心',
  柴胡店: '柴胡店镇作业中心',
  杜集: '杜集镇作业中心',
  张大庄: '张大庄镇作业中心',
  刘营伍: '刘营伍乡作业中心',
  时集: '时集镇作业中心',
  大柳: '大柳镇作业中心',
  长官: '长官镇作业中心',
};
function areaLabel(v: unknown): string {
  const t = v == null ? '' : String(v).trim();
  return AREA_UNITS[t] ?? t;
}

// ===================== 表格列 =====================
const columns = ref<VxeTableGridColumns>([
  { type: 'checkbox', width: 50, align: 'center', fixed: 'left' },
  { title: '站点名称', field: 'station_name', minWidth: 160, align: 'center', showOverflow: 'tooltip' },
  {
    title: '片区/班组',
    field: 'area_team',
    minWidth: 160,
    align: 'center',
    showOverflow: 'tooltip',
    formatter: ({ cellValue }) => areaLabel(cellValue),
  },
  {
    title: '台账管理',
    field: 'ledger_management',
    minWidth: 100,
    align: 'center',
    slots: { default: 'num' },
  },
  {
    title: '标识牌管理',
    field: 'sign_management',
    minWidth: 100,
    align: 'center',
    slots: { default: 'num' },
  },
  {
    title: '用电安全',
    field: 'electricity_safety',
    minWidth: 100,
    align: 'center',
    slots: { default: 'num' },
  },
  {
    title: '消防管理',
    field: 'fire_management',
    minWidth: 100,
    align: 'center',
    slots: { default: 'num' },
  },
  {
    title: '物品摆放',
    field: 'item_placement',
    minWidth: 100,
    align: 'center',
    slots: { default: 'num' },
  },
  {
    title: '考核分数',
    field: 'totalScore',
    minWidth: 110,
    align: 'center',
    slots: { default: 'totalScore' },
  },
  {
    title: '操作',
    field: 'action',
    width: 180,
    align: 'center',
    fixed: 'right',
    slots: { default: 'action' },
  },
]);

/** 考核分数 = 台账管理 + 标识牌管理 + 用电安全 + 消防管理 + 物品摆放 */
function totalScoreOf(row: CheckLedgerApi.TransferStationRow): number {
  return (
    Number(row.ledger_management ?? 0) +
    Number(row.sign_management ?? 0) +
    Number(row.electricity_safety ?? 0) +
    Number(row.fire_management ?? 0) +
    Number(row.item_placement ?? 0)
  );
}

onMounted(loadData);
</script>

<template>
  <HsePageLayout
    :description="$t('page.hse.siteTransferStationsDesc')"
    :title="$t('page.hse.siteTransferStations')"
  >
    <template #extra>
      <NSpace>
        <NButton type="error" secondary @click="onBatchDelete">
          批量删除
        </NButton>
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

    <!-- 月份下拉：选择某月即显示该月的转运站台账（对齐「安全文化建设」） -->
    <div class="mb-4">
      <NSelect
        v-model:value="selectedMonth"
        placeholder="请选择检查月份"
        :options="monthOptions"
        style="max-width: 320px"
        @update:value="onMonthChange"
      />
    </div>

    <!-- 搜索 -->
    <HseSearchPanel @query="onSearch" @reset="onReset">
      <NGi>
        <NInput v-model:value="searchForm.keyword" placeholder="站点编号 / 名称 / 片区" clearable @keyup.enter="onSearch" />
      </NGi>
      <NGi>
        <NInput v-model:value="searchForm.stationCode" placeholder="站点编号" clearable @keyup.enter="onSearch" />
      </NGi>
      <NGi>
        <NInput v-model:value="searchForm.areaTeam" placeholder="片区/班组" clearable @keyup.enter="onSearch" />
      </NGi>
    </HseSearchPanel>

    <!-- 表格 -->
    <HseDataGrid
      ref="gridRef"
      :columns="columns"
      :data="data"
      :loading="loading"
      :pager="false"
      :total="total"
    >
      <!-- 数值扣分列：非 0 红色 error 标签，0 纯数字 -->
      <template #num="{ row, column }">
        <NTag v-if="isPositive(row[column.field])" :bordered="false" size="small" type="error">
          {{ formatScore(row[column.field]) }}
        </NTag>
        <span v-else>{{ formatScore(row[column.field]) }}</span>
      </template>
      <!-- 考核分数 = 台账管理+标识牌管理+用电安全+消防管理+物品摆放；非 0 橙色 warning 标签，0 纯数字 -->
      <template #totalScore="{ row }">
        <NTag v-if="isPositive(totalScoreOf(row))" :bordered="false" size="small" type="warning">
          {{ formatScore(totalScoreOf(row)) }}
        </NTag>
        <span v-else>{{ formatScore(totalScoreOf(row)) }}</span>
      </template>
      <template #action="{ row }">
        <NSpace justify="center" :size="4">
          <NButton size="tiny" type="primary" quaternary @click="openView(row)">查看</NButton>
          <NButton size="tiny" type="primary" quaternary @click="openEdit(row)">编辑</NButton>
          <NPopconfirm @positive-click="onDelete(row)">
            <template #trigger>
              <NButton size="tiny" type="error" quaternary>删除</NButton>
            </template>
            确定删除该转运站台账记录吗？
          </NPopconfirm>
        </NSpace>
      </template>
    </HseDataGrid>

    <!-- 详情抽屉 -->
    <NDrawer v-model:show="detailDrawerVisible" :width="560">
      <NDrawerContent v-if="currentRecord" :title="`转运站台账详情 #${currentRecord.id}`">
        <NDescriptions :column="1" bordered label-placement="left">
          <NDescriptionsItem label="站点编号">{{ currentRecord.station_code || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="站点名称">{{ currentRecord.station_name || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="片区/班组">{{ currentRecord.area_team || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="检查日期">{{ currentRecord.check_date || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="台账管理">{{ currentRecord.ledger_management ?? 0 }}</NDescriptionsItem>
          <NDescriptionsItem label="标识牌管理">{{ currentRecord.sign_management ?? 0 }}</NDescriptionsItem>
          <NDescriptionsItem label="用电安全">{{ currentRecord.electricity_safety ?? 0 }}</NDescriptionsItem>
          <NDescriptionsItem label="消防管理">{{ currentRecord.fire_management ?? 0 }}</NDescriptionsItem>
          <NDescriptionsItem label="物品摆放">{{ currentRecord.item_placement ?? 0 }}</NDescriptionsItem>
          <NDescriptionsItem label="备注">{{ currentRecord.remark || '-' }}</NDescriptionsItem>
        </NDescriptions>
      </NDrawerContent>
      <template #footer>
        <NSpace justify="end">
          <NButton v-if="currentRecord" type="primary" size="small" @click="openEdit(currentRecord)">编辑</NButton>
        </NSpace>
      </template>
    </NDrawer>

    <!-- 新增 / 编辑 弹窗 -->
    <NModal
      v-model:show="formOpen"
      :title="formMode === 'create' ? '新增转运站台账' : '编辑转运站台账'"
      preset="card"
      style="width: 680px; max-width: 92vw"
      :mask-closable="false"
    >
      <NForm label-placement="top">
        <div class="grid grid-cols-2 gap-x-4">
          <NFormItem label="站点编号" required>
            <NInput v-model:value="formModel.stationCode" placeholder="请输入站点编号" />
          </NFormItem>
          <NFormItem label="站点名称" required>
            <NInput v-model:value="formModel.stationName" placeholder="请输入站点名称" />
          </NFormItem>
          <NFormItem label="片区/班组">
            <NInput v-model:value="formModel.areaTeam" placeholder="选填" />
          </NFormItem>
          <NFormItem label="检查日期">
            <NInput v-model:value="formModel.checkDate" placeholder="YYYY-MM" />
          </NFormItem>
          <NFormItem label="台账管理">
            <NInputNumber v-model:value="formModel.ledgerManagement" :min="0" style="width: 100%" />
          </NFormItem>
          <NFormItem label="标识牌管理">
            <NInputNumber v-model:value="formModel.signManagement" :min="0" style="width: 100%" />
          </NFormItem>
          <NFormItem label="用电安全">
            <NInputNumber v-model:value="formModel.electricitySafety" :min="0" style="width: 100%" />
          </NFormItem>
          <NFormItem label="消防管理">
            <NInputNumber v-model:value="formModel.fireManagement" :min="0" style="width: 100%" />
          </NFormItem>
          <NFormItem label="物品摆放">
            <NInputNumber v-model:value="formModel.itemPlacement" :min="0" style="width: 100%" />
          </NFormItem>
        </div>
        <NFormItem label="备注">
          <NInput v-model:value="formModel.remark" type="textarea" :rows="2" placeholder="选填" />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="formOpen = false">关闭</NButton>
          <NButton type="primary" :loading="formLoading" @click="onSubmit">保存</NButton>
        </NSpace>
      </template>
    </NModal>

    <!-- 通用导入（transfer-stations 模块） -->
    <HseImportDialog
      v-model:open="importOpen"
      title="导入转运站台账"
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