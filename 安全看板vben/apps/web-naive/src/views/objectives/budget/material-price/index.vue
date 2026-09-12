<script lang="ts" setup>
/**
 * 物资价格库（web-naive）
 * 安全费用预算及支出 → 三级菜单「物资价格库」
 * 双列布局：左侧分类树（消防器材/广告公司/安全物资/安全证），右侧当前分类物资明细（名称/规格/单价万元）。
 * 支持 Excel/CSV 导入、导出、按名称搜索、删除。数据存于跨页面共享内存 store（刷新丢失）。
 */
import { computed, onMounted, reactive, ref, watch } from 'vue';

import {
  NButton,
  NCheckbox,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NModal,
  NPopconfirm,
  NRadioButton,
  NRadioGroup,
  NSpace,
  NTooltip,
  NTree,
} from 'naive-ui';

import { Menu, PanelLeft, Plus, RotateCw } from '@vben/icons';

import {
  HseDataGrid,
  HseImportDialog,
  HsePageLayout,
  HseSplitPane,
} from '#/components/hse';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';
import { message } from '#/adapter/naive';
import { useMaterialPrice, type MaterialItem } from '../../_shared/useMaterialPrice';
import { exportExcel } from '../../_shared/excel';

declare module 'xlsx';
import * as XLSX from 'xlsx';

defineOptions({ name: 'ObjectivesBudgetMaterialPrice' });

const { materialData, materialCategories, labelOf, addItems, removeItem, updateItem, loadMaterials, loading: materialsLoading } = useMaterialPrice();

const activeCategory = ref<string>('fire');

const treeOptions = computed(() =>
  materialCategories.map((c) => ({ key: c.key, label: c.label })),
);
const currentLabel = computed(() => labelOf(activeCategory.value));
const currentList = computed<MaterialItem[]>(() => materialData[activeCategory.value] || []);

const keyword = ref('');
const filteredList = computed<MaterialItem[]>(() => {
  const kw = keyword.value.trim();
  if (!kw) return currentList.value;
  return currentList.value.filter((i) => i.name.includes(kw));
});

// ===================== 行选择（全选 / 批量删除） =====================
const selectedIds = ref<Set<string>>(new Set());

function toggleSelect(id: string, checked: boolean) {
  const next = new Set(selectedIds.value);
  if (checked) next.add(id);
  else next.delete(id);
  selectedIds.value = next;
}

const allSelected = computed(() => {
  const list = filteredList.value;
  return list.length > 0 && list.every((i) => selectedIds.value.has(i.id));
});

function toggleSelectAll(checked: boolean) {
  const next = new Set(selectedIds.value);
  if (checked) filteredList.value.forEach((i) => next.add(i.id));
  else filteredList.value.forEach((i) => next.delete(i.id));
  selectedIds.value = next;
}

async function batchDelete() {
  const ids = Array.from(selectedIds.value);
  if (!ids.length) return;
  // 仅删除当前分类下确实存在的记录，避免切换分类后的残留 id 误删
  const currentIds = new Set(currentList.value.map((i) => i.id));
  const toDelete = ids.filter((id) => currentIds.has(id));
  for (const id of toDelete) {
    await removeItem(activeCategory.value, id);
  }
  selectedIds.value = new Set();
  message.success(`已删除 ${toDelete.length} 项`);
}

// 切换分类时清空选择状态，防止跨分类误删
watch(activeCategory, () => {
  selectedIds.value = new Set();
});

const columns: VxeTableGridColumns = [
  {
    title: '',
    field: '__sel',
    minWidth: 45,
    align: 'center',
    fixed: 'left',
    slots: { default: 'sel' },
  },
  {
    title: '序号',
    field: 'index',
    minWidth: 60,
    align: 'center',
    // 用插槽而非 formatter：formatter 结果会被 VXE 缓存，删除行后不会随 rowIndex 变化重算，
    // 导致序号出现跳号（如 1,2,4,5）；插槽随数据响应式重渲染，删除后自动连续编号。
    slots: { default: 'index' },
  },
  {
    title: '物资名称',
    field: 'name',
    minWidth: 160,
    align: 'center',
    showOverflow: 'tooltip',
    editRender: { name: 'input' },
  },
  {
    title: '规格',
    field: 'spec',
    minWidth: 100,
    align: 'center',
    showOverflow: 'tooltip',
    editRender: { name: 'input' },
  },
  {
    title: '措施项目',
    field: 'measureItem',
    minWidth: 160,
    align: 'center',
    showOverflow: 'tooltip',
    formatter: (params: any) => (params?.cellValue ? String(params.cellValue) : '-'),
    editRender: { name: 'input' },
  },
  {
    title: '预算科目',
    field: 'budgetSubject',
    minWidth: 90,
    align: 'center',
    formatter: (params: any) => (params?.cellValue ? String(params.cellValue) : '-'),
    editRender: { name: 'input' },
  },
  {
    title: '单价（万元）',
    field: 'unitPrice',
    minWidth: 110,
    align: 'center',
    formatter: (params: any) =>
      params?.cellValue != null ? `${Number(params.cellValue).toFixed(4)}` : '-',
    editRender: { name: 'input', props: { type: 'number' } },
  },
  {
    title: '操作',
    field: 'action',
    minWidth: 180,
    align: 'center',
    fixed: 'right',
    slots: { default: 'materialAction' },
  },
];

function exportMaterialExcel() {
  const rows: (string | number)[][] = [['物资名称', '规格', '单价（万元）']];
  for (const item of filteredList.value) {
    rows.push([item.name, item.spec || '-', Number(item.unitPrice)]);
  }
  exportExcel(`${currentLabel.value}物资明细.xlsx`, [{ name: currentLabel.value, data: rows }]);
}

async function deleteMaterial(row: MaterialItem) {
  await removeItem(activeCategory.value, row.id);
  message.success('删除成功');
}

// ===================== 单元格编辑（点击单元格直接修改；弹窗编辑保留） =====================
const gridRef = ref<InstanceType<typeof HseDataGrid>>();

const editRules: Record<string, any[]> = {
  name: [{ required: true, message: '物资名称不能为空' }],
  unitPrice: [
    {
      validator: (params: any) => {
        const v = params?.rowValue;
        if (v === null || v === undefined || v === '') return true;
        return Number(v) >= 0 || '单价不能为负数';
      },
    },
  ],
};

async function onCellEditClosed(payload: { row: MaterialItem; column: any }) {
  const row = payload?.row;
  if (!row?.id) return;
  // 校验失败时回滚原始值（keepSource），仅校验通过后落库
  const $grid = gridRef.value?.gridApi?.grid as any;
  if ($grid && typeof $grid.validate === 'function') {
    const result = await $grid.validate(row);
    const isValid = result === true || result === undefined || result === null;
    if (!isValid) {
      $grid.revertData(row);
      return;
    }
  }
  try {
    await updateItem(activeCategory.value, row.id, {
      name: row.name,
      spec: row.spec?.trim() ? row.spec.trim() : '-',
      unitPrice: Number(row.unitPrice) || 0,
      measureItem: row.measureItem || '',
      budgetSubject: row.budgetSubject || '',
    });
  } catch {
    /* 拦截器已提示 */
  }
}

// ===================== 导入（Excel/CSV 前端解析） =====================
// 导入单价单位：yuan = 源表以「元」计，自动 ÷10000 转成系统存储的「万元」；wan = 源表已是「万元」直接入库。
const importUnit = ref<'yuan' | 'wan'>('yuan');
const importOpen = ref(false);
const importPreviewData = ref<MaterialItem[]>([]);
const importPreviewError = ref<string | null>(null);
const importConfirming = ref(false);
const importResult = ref<{ success: boolean; message: string } | null>(null);

const importPreviewColumns: VxeTableGridColumns = [
  { title: '物资名称', field: 'name', minWidth: 160 },
  { title: '规格', field: 'spec', minWidth: 120 },
  { title: '单价（万元）', field: 'unitPrice', width: 140 },
];

function downloadTemplate() {
  const wsData = [
    ['物资名称', '规格', '单价（万元）'],
    ['灭火器', '4kg干粉', 0.045],
  ];
  exportExcel(`安全费用物资模板_${currentLabel.value}.xlsx`, [{ name: '物资明细', data: wsData }]);
}

function parseMaterialRows(
  headers: string[],
  rows: string[][],
): { data: MaterialItem[]; error?: string } {
  const nameIdx = headers.findIndex((h) => h.includes('物资名称'));
  const specIdx = headers.findIndex((h) => h.includes('规格'));
  const priceIdx = headers.findIndex((h) => h.includes('单价'));
  if (nameIdx === -1 || specIdx === -1 || priceIdx === -1) {
    return { data: [], error: '表头必须包含：物资名称、规格、单价（万元），请下载模板后填写' };
  }
  const data: MaterialItem[] = [];
  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i];
    if (!cells || !cells[nameIdx]) continue;
    const rawPrice = Number(cells[priceIdx]);
    let unitPrice = Number.isNaN(rawPrice) ? 0 : rawPrice;
    // 元 → 万元：系统单价统一以「万元」存储
    if (importUnit.value === 'yuan') {
      unitPrice = Number((unitPrice / 10000).toFixed(6));
    }
    data.push({
      id: `${Date.now()}_${i}`,
      name: cells[nameIdx],
      spec: cells[specIdx] || '-',
      unitPrice,
    });
  }
  return { data };
}

function parseFile(file: File): Promise<{ data: MaterialItem[]; error?: string }> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv')) {
    return file.text().then((text) => {
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (lines.length < 2) return { data: [], error: '文件为空或缺少表头，请使用模板格式' };
      const headers = lines[0]!.split(',').map((h) => h.trim().replace(/^﻿/, ''));
      const body = lines.slice(1).map((l) => l.split(',').map((c) => c.trim()));
      return parseMaterialRows(headers, body);
    });
  }
  return file.arrayBuffer().then((buf) => {
    try {
      const wb = XLSX.read(buf, { type: 'array' });
      const wsName = wb.SheetNames[0];
      if (!wsName) return { data: [], error: 'Excel 文件中没有工作表' };
      const ws = wb.Sheets[wsName];
      if (!ws) return { data: [], error: '无法读取 Excel 工作表' };
      const json = XLSX.utils.sheet_to_json(ws, { header: 1 }) as (string | number)[][];
      const headerRowIdx = json.findIndex((row) => {
        const t = row.map((c) => String(c ?? ''));
        return (
          t.some((x) => x.includes('物资名称')) &&
          t.some((x) => x.includes('规格')) &&
          t.some((x) => x.includes('单价'))
        );
      });
      if (headerRowIdx === -1)
        return { data: [], error: '未找到表头，请确保表头包含：物资名称、规格、单价（万元）' };
      const headers = (json[headerRowIdx] as (string | number)[]).map((c) => String(c ?? '').trim());
      const body = json
        .slice(headerRowIdx + 1)
        .filter((r): r is (string | number)[] => Array.isArray(r))
        .map((r) => r.map((c) => String(c ?? '').trim()));
      return parseMaterialRows(headers, body);
    } catch (err) {
      return { data: [], error: `Excel 解析失败：${err instanceof Error ? err.message : String(err)}` };
    }
  });
}

async function onUpload(file: File) {
  importPreviewError.value = null;
  importPreviewData.value = [];
  importResult.value = null;
  const { data, error } = await parseFile(file);
  if (error) {
    importPreviewError.value = error;
    return;
  }
  if (data.length === 0) {
    importPreviewError.value = '未解析到有效数据，请检查文件内容';
    return;
  }
  importPreviewData.value = data;
}

async function onConfirm() {
  const rows = importPreviewData.value;
  if (!rows.length) return;
  importConfirming.value = true;
  try {
    await addItems(activeCategory.value, rows);
    importResult.value = {
      success: true,
      message: `成功导入 ${rows.length} 条${currentLabel.value}记录`,
    };
  } finally {
    importConfirming.value = false;
  }
}

function onClose() {
  importOpen.value = false;
  importPreviewData.value = [];
  importPreviewError.value = null;
  importResult.value = null;
}

// ===================== 手动增加 / 编辑 =====================
const addModalOpen = ref(false);
const addForm = reactive({
  name: '',
  spec: '',
  unitPrice: 0 as number,
  measureItem: '',
  budgetSubject: '',
});
const editingId = ref<string | null>(null);
const addModalTitle = computed(() => (editingId.value ? '编辑物资' : '增加物资'));

function openAdd() {
  editingId.value = null;
  addForm.name = '';
  addForm.spec = '';
  addForm.unitPrice = 0;
  addForm.measureItem = '';
  addForm.budgetSubject = '';
  addModalOpen.value = true;
}

function openEdit(row: MaterialItem) {
  viewModalOpen.value = false;
  editingId.value = row.id;
  addForm.name = row.name;
  addForm.spec = row.spec === '-' ? '' : row.spec;
  addForm.unitPrice = row.unitPrice;
  addForm.measureItem = row.measureItem || '';
  addForm.budgetSubject = row.budgetSubject || '';
  addModalOpen.value = true;
}

async function confirmAddOrEdit() {
  const name = addForm.name.trim();
  if (!name) {
    message.warning('请输入物资名称');
    return;
  }
  const spec = addForm.spec.trim() || '-';
  const unitPrice = Number(addForm.unitPrice) || 0;
  const measureItem = addForm.measureItem.trim();
  const budgetSubject = addForm.budgetSubject.trim();

  if (editingId.value) {
    await updateItem(activeCategory.value, editingId.value, {
      name,
      spec,
      unitPrice,
      measureItem,
      budgetSubject,
    });
    message.success('已更新该记录');
  } else {
    await addItems(activeCategory.value, [
      { id: `${Date.now()}_add`, name, spec, unitPrice, measureItem, budgetSubject },
    ]);
    message.success('已增加一条记录');
  }
  addModalOpen.value = false;
}

// ===================== 查看 =====================
const viewModalOpen = ref(false);
const viewItem = ref<MaterialItem | null>(null);

function openView(row: MaterialItem) {
  viewItem.value = row;
  viewModalOpen.value = true;
}

// 进入页面即从后端加载已落库的物资价格
onMounted(loadMaterials);
</script>

<template>
  <HsePageLayout title="物资价格库" content-class="flex flex-col flex-1 min-h-0">
    <HseSplitPane
      title="费用分类"
      storage-key="hse-material-split-width"
      :default-width="240"
    >
      <template #left>
        <div class="tree-panel">
          <div class="panel-head">
            <div class="panel-title">
              <Menu class="size-4 title-icon" />
              <span>费用分类</span>
            </div>
            <div class="panel-actions">
              <NTooltip>
                <template #trigger>
                  <span class="btn-trigger-wrap">
                    <NButton
                      size="tiny"
                      quaternary
                      aria-label="刷新"
                      @click="loadMaterials(true)"
                    >
                      <template #icon><RotateCw class="size-3.5" /></template>
                    </NButton>
                  </span>
                </template>
                刷新
              </NTooltip>
            </div>
          </div>

          <NTree
            :selected-keys="[activeCategory]"
            block-line
            :data="treeOptions"
            :default-expand-all="true"
            selectable
            @update:selected-keys="(keys) => keys.length && (activeCategory = String(keys[0]))"
          />
        </div>
      </template>

      <template #right>
        <div class="detail-panel">
          <div class="detail-head">
            <div class="panel-title">
              <PanelLeft class="size-4 title-icon" />
              <span>{{ currentLabel }}物资明细</span>
            </div>
            <NSpace size="small">
              <NInput
                v-model:value="keyword"
                placeholder="搜索物资名称"
                clearable
                style="width: 160px"
              />
              <NButton size="small" @click="exportMaterialExcel">导出</NButton>
              <NButton type="primary" size="small" @click="importOpen = true">导入物资</NButton>
            </NSpace>
          </div>

          <div class="toolbar mb-2 flex flex-wrap items-center justify-between gap-3">
            <div class="flex flex-wrap items-center gap-3">
              <NCheckbox :checked="allSelected" @update:checked="toggleSelectAll">全选</NCheckbox>
              <span class="text-sm text-muted-foreground">已选 {{ selectedIds.size }} 项</span>
              <NButton type="error" size="small" :disabled="selectedIds.size === 0" @click="batchDelete">
                批量删除
              </NButton>
            </div>
            <NButton type="primary" size="small" @click="openAdd">
              <template #icon><Plus class="size-3.5" /></template>
              增加
            </NButton>
          </div>

          <div class="grid-wrap">
            <HseDataGrid
              ref="gridRef"
              v-if="filteredList.length || materialsLoading"
              :columns="columns"
              :data="filteredList"
              :loading="materialsLoading"
              :pager="false"
              :editable="true"
              :edit-mode="'cell'"
              :edit-rules="editRules"
              auto-width
              height="100%"
              @edit-closed="onCellEditClosed"
            >
              <template #sel="{ row }">
                <NCheckbox
                  :checked="selectedIds.has(row.id)"
                  @update:checked="(v: boolean) => toggleSelect(row.id, v)"
                />
              </template>
              <template #index="{ rowIndex }">
                <span>{{ rowIndex + 1 }}</span>
              </template>
              <template #materialAction="{ row }">
                <NSpace :size="8" justify="center" :wrap="false">
                  <NButton size="small" type="primary" quaternary @click="openView(row)">查看</NButton>
                  <NPopconfirm @positive-click="deleteMaterial(row)">
                    <template #trigger>
                      <NButton size="small" type="error" quaternary>删除</NButton>
                    </template>
                    确定删除该物资记录吗？
                  </NPopconfirm>
                </NSpace>
              </template>
            </HseDataGrid>
            <div v-else class="grid-empty">
              暂无{{ currentLabel }}数据，点击右上角「导入物资」添加
            </div>
          </div>
        </div>
      </template>
    </HseSplitPane>

    <HseImportDialog
      v-model:open="importOpen"
      :title="`导入${currentLabel}物资`"
      :preview-columns="importPreviewColumns"
      :preview-data="importPreviewData"
      :preview-error="importPreviewError"
      :confirming="importConfirming"
      :result="importResult"
      @download-template="downloadTemplate"
      @upload="onUpload"
      @confirm="onConfirm"
      @close="onClose"
    >
      <template #header-extra>
        <div class="mb-3 flex flex-wrap items-center gap-2 rounded bg-muted/50 px-3 py-2">
          <span class="text-sm text-muted-foreground">本次导入单价单位：</span>
          <NRadioGroup v-model:value="importUnit" size="small">
            <NRadioButton value="yuan">元（自动 ÷10000 转为万元）</NRadioButton>
            <NRadioButton value="wan">万元（直接导入）</NRadioButton>
          </NRadioGroup>
        </div>
      </template>
    </HseImportDialog>

    <!-- 手动增加 / 编辑物资 -->
    <NModal
      v-model:show="addModalOpen"
      :title="addModalTitle"
      preset="card"
      style="width: 480px; max-width: 96vw"
    >
      <NForm label-placement="top">
        <NFormItem label="物资名称" required>
          <NInput v-model:value="addForm.name" placeholder="请输入物资名称" />
        </NFormItem>
        <NFormItem label="规格">
          <NInput v-model:value="addForm.spec" placeholder="请输入规格" />
        </NFormItem>
        <NFormItem label="措施项目（安全生产费用类别）">
          <NInput
            v-model:value="addForm.measureItem"
            placeholder="如：配备、维护、保养应急救援器材（上传预算表后自动带出）"
          />
        </NFormItem>
        <NFormItem label="预算科目（费用化/资本化）">
          <NInput v-model:value="addForm.budgetSubject" placeholder="如：费用化" />
        </NFormItem>
        <NFormItem label="单价（万元）">
          <NInputNumber
            v-model:value="addForm.unitPrice"
            :min="0"
            :precision="6"
            :step="0.0001"
            style="width: 100%"
            placeholder="请输入单价（万元）"
          />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="addModalOpen = false">取消</NButton>
          <NButton type="primary" @click="confirmAddOrEdit">确定</NButton>
        </NSpace>
      </template>
    </NModal>

    <!-- 查看物资 -->
    <NModal
      v-model:show="viewModalOpen"
      title="物资详情"
      preset="card"
      style="width: 480px; max-width: 96vw"
    >
      <NForm label-placement="left" label-width="120">
        <NFormItem label="物资名称">
          <span class="text-sm">{{ viewItem?.name || '-' }}</span>
        </NFormItem>
        <NFormItem label="规格">
          <span class="text-sm">{{ viewItem?.spec || '-' }}</span>
        </NFormItem>
        <NFormItem label="措施项目">
          <span class="text-sm">{{ viewItem?.measureItem || '-' }}</span>
        </NFormItem>
        <NFormItem label="预算科目">
          <span class="text-sm">{{ viewItem?.budgetSubject || '-' }}</span>
        </NFormItem>
        <NFormItem label="单价（万元）">
          <span class="text-sm">{{ viewItem?.unitPrice != null ? viewItem.unitPrice.toFixed(4) : '-' }}</span>
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton v-if="viewItem" @click="openEdit(viewItem)">弹窗编辑</NButton>
          <NButton @click="viewModalOpen = false">关闭</NButton>
        </NSpace>
      </template>
    </NModal>
  </HsePageLayout>
</template>

<style scoped>
/* 与「组织管理」页一致的双列面板样式（HseSplitPane 内填充容器） */
.tree-panel {
  height: 100%;
  overflow: auto;
  padding: 12px;
}

/* 右侧明细面板：纵向 flex，头部/工具条固定，表格吃满剩余高度（消除底部留白） */
.detail-panel {
  height: 100%;
  padding: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 关键：内容区已是 flex 列容器，让 HseSplitPane 作为 flex 子项撑满剩余高度
   （仅靠 height:100% 在 flex 拉伸父级下会被浏览器视为非"明确高度"而塌缩） */
:deep(.hse-split-pane) {
  flex: 1 1 0;
  min-height: 0;
}

.panel-head,
.detail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.detail-head {
  margin-bottom: 12px;
  flex-shrink: 0;
}

.toolbar {
  flex-shrink: 0;
}

/* 表格容器：占满头部/工具条之外的剩余高度 */
.grid-wrap {
  flex: 1 1 auto;
  min-height: 0;
  position: relative;
}

.grid-empty {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: hsl(var(--muted-foreground));
  font-size: 14px;
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

/* NTooltip trigger 单根包装：避免控制台 "should have exactly one child" */
.btn-trigger-wrap {
  display: inline-flex;
}

.title-icon {
  color: hsl(var(--primary));
}
</style>
