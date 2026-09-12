<script lang="ts" setup>
/**
 * 月度购买计划（web-naive）
 * 安全费用预算及支出 → 三级菜单「月度购买计划」
 * 选月份 → 生成购买计划（从价格库添加 / 手动新增，填数量）→ 上传「预算表」「安全支出申请表模板」
 * → 一键下载（支出申请表 + 购买计划 + 已上传合同/流程文件）。
 *
 * 预算联动：上传年度「安全费用预算表」后按「计划使用时间」的月份取当月预算行，
 * 与系统计划行（数量>0）合并填充支出申请表：
 *   - 计划列（数量/单价/总价）：系统计划值优先；仅预算有的行取预算值
 *   - 支出列（数量/单价/总价）：系统计划值；仅预算有的行填 0
 * 行序：预算表当月行（原顺序）在前，系统新增行在后。数据落库于 file_records。
 */
import { computed, onMounted, ref, watch } from 'vue';

import {
  NButton,
  NCard,
  NCheckbox,
  NCheckboxGroup,
  NInput,
  NInputNumber,
  NPopover,
  NSpace,
  NStatistic,
  NTag,
} from 'naive-ui';

import { HseDataGrid, HsePageLayout } from '#/components/hse';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';
import { message } from '#/adapter/naive';
import { useMaterialPrice } from '../../_shared/useMaterialPrice';
import { exportExcel } from '../../_shared/excel';
import {
  deleteFileRecord,
  downloadFileRecord,
  listFileRecords,
  uploadFileRecord,
  type FileRecordItem,
} from '#/api/hse/fileRecords';

declare module 'xlsx';
import * as XLSX from 'xlsx';

defineOptions({ name: 'ObjectivesBudgetMonthlyPlan' });

const { materialData, materialCategories, loadMaterials, updateItem } = useMaterialPrice();

const now = new Date();
const selectedMonth = ref(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);

// 文件落库：模块固定 monthly-plan，按 recordId(=selectedMonth) 在客户端区分月份
const FILE_MODULE = 'monthly-plan';

interface PlanRow {
  id: string;
  name: string;
  spec: string;
  unitPrice: number;
  quantity: number;
  measureItem?: string;
  budgetSubject?: string;
}
const planRows = ref<PlanRow[]>([]);

// 已上传文件：来自后端 file_records（长期保存，刷新不丢）
const uploadedFiles = ref<FileRecordItem[]>([]);
const filesLoading = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

// ===================== 预算表 / 安全支出申请表模板 =====================
// 两个固定槽位（与月份无关），各保留最新一份，落库 file_records
const BUDGET_RECORD = 'budget-table';
const TEMPLATE_RECORD = 'expenditure-template';

interface BudgetRow {
  name: string;
  spec: string;
  qty: number;
  unitPrice: number;
  total: number;
  month: string; // '2026-08'
  measureItem: string; // 措施项目
  budgetSubject: string; // 预算科目
  purpose: string; // 用途及依据
  dept: string; // 使用部门/地点
  remark: string;
}

interface TemplateMeta {
  title: string;
  h2: string[];
  h3: string[];
}

const budgetFile = ref<FileRecordItem | null>(null);
const templateFile = ref<FileRecordItem | null>(null);
const budgetRows = ref<BudgetRow[]>([]);
const templateMeta = ref<TemplateMeta | null>(null);
const budgetLoading = ref(false);
const templateLoading = ref(false);
const budgetInput = ref<HTMLInputElement | null>(null);
const templateInput = ref<HTMLInputElement | null>(null);

/** 从 Excel 单元格值提取 'YYYY-MM' 月份键（支持 Date / 数字序列 / '2026-01-01 00:00:00' 字符串） */
function monthKeyOf(v: unknown): string | null {
  if (v == null || v === '') return null;
  let d: Date | null = null;
  if (v instanceof Date) {
    d = v;
  } else if (typeof v === 'number') {
    const code = XLSX.SSF.parse_date_code(v);
    if (code) d = new Date(code.y, code.m - 1, code.d);
  } else {
    const s = String(v).trim();
    const m = s.match(/(\d{4})[-/年.](\d{1,2})/);
    if (m) return `${m[1]}-${String(Number(m[2])).padStart(2, '0')}`;
    const t = new Date(s);
    if (!Number.isNaN(t.getTime())) d = t;
  }
  if (!d || Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function fetchFileBytes(id: number): Promise<ArrayBuffer> {
  const blob = await downloadFileRecord(id);
  return await blob.arrayBuffer();
}

/** 解析预算表：第4行起数据，列固定（0序号 1措施项目 2预算科目 3名称 4用途 5数量 6规格 7单价 8总价 9计划使用时间 10部门 11备注） */
async function applyBudgetFile(file: FileRecordItem, notify = false) {
  budgetLoading.value = true;
  try {
    const buf = await fetchFileBytes(file.id);
    const wb = XLSX.read(buf, { type: 'array' });
    const wsName = wb.SheetNames.find((n) => n !== 'Sheet1') || wb.SheetNames[0] || '';
    const ws = wb.Sheets[wsName];
    if (!ws) throw new Error('预算表无有效工作表');
    const json = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }) as unknown[][];
    const rows: BudgetRow[] = [];
    for (let i = 3; i < json.length; i++) {
      const r = json[i] || [];
      const name = String(r[3] ?? '').trim();
      if (!name) continue;
      const month = monthKeyOf(r[9]);
      if (!month) continue;
      rows.push({
        name,
        spec: String(r[6] ?? '').trim(),
        qty: Number(r[5]) || 0,
        unitPrice: Number(r[7]) || 0,
        total: Number(r[8]) || 0,
        month,
        measureItem: String(r[1] ?? '').trim(),
        budgetSubject: String(r[2] ?? '').trim(),
        purpose: String(r[4] ?? '').trim(),
        dept: String(r[10] ?? '').trim(),
        remark: String(r[11] ?? '').trim(),
      });
    }
    budgetRows.value = rows;
    budgetFile.value = file;
    // 预算表解析成功后，把 措施项目/预算科目 按 名称+规格 同步回价格库（落库）
    syncMeasureToPriceLibrary().catch(() => {});
    if (notify) {
      const monthCount = rows.filter((x) => x.month === selectedMonth.value).length;
      message.success(`预算表已解析：共 ${rows.length} 条（${selectedMonth.value}月 ${monthCount} 条）`);
    }
  } catch (err) {
    budgetRows.value = [];
    budgetFile.value = null;
    message.error(`预算表解析失败：${err instanceof Error ? err.message : String(err)}`);
  } finally {
    budgetLoading.value = false;
  }
}

/** 解析支出模板：第1行标题、第2-3行双行表头 */
async function applyTemplateFile(file: FileRecordItem, notify = false) {
  templateLoading.value = true;
  try {
    const buf = await fetchFileBytes(file.id);
    const wb = XLSX.read(buf, { type: 'array' });
    const wsName = wb.SheetNames[0] || '';
    const ws = wb.Sheets[wsName];
    if (!ws) throw new Error('模板无有效工作表');
    const json = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }) as unknown[][];
    templateMeta.value = {
      title: String((json[0] || [])[0] ?? '').trim() || '安全支出申请表',
      h2: (json[1] || []).map((v) => String(v ?? '').trim()),
      h3: (json[2] || []).map((v) => String(v ?? '').trim()),
    };
    templateFile.value = file;
    if (notify) message.success('安全支出申请表模板已上传');
  } catch (err) {
    templateMeta.value = null;
    templateFile.value = null;
    message.error(`模板解析失败：${err instanceof Error ? err.message : String(err)}`);
  } finally {
    templateLoading.value = false;
  }
}

/** 上传预算表 / 模板：先删该槽位旧记录，再传新文件并解析 */
async function uploadSlot(e: Event, slot: 'budget' | 'template') {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const recordId = slot === 'budget' ? BUDGET_RECORD : TEMPLATE_RECORD;
  try {
    const res = await listFileRecords({ module: FILE_MODULE });
    for (const f of (res.files || []).filter((x) => x.recordId === recordId)) {
      await deleteFileRecord(f.id).catch(() => {});
    }
    const created = await uploadFileRecord(file, FILE_MODULE, recordId);
    if (slot === 'budget') await applyBudgetFile(created, true);
    else await applyTemplateFile(created, true);
  } catch (err) {
    message.error(`上传失败：${err instanceof Error ? err.message : String(err)}`);
  } finally {
    input.value = '';
  }
}

/** 移除某槽位（删除落库记录并清空状态） */
async function removeSlot(slot: 'budget' | 'template') {
  const recordId = slot === 'budget' ? BUDGET_RECORD : TEMPLATE_RECORD;
  try {
    const res = await listFileRecords({ module: FILE_MODULE });
    for (const f of (res.files || []).filter((x) => x.recordId === recordId)) {
      await deleteFileRecord(f.id).catch(() => {});
    }
  } catch {
    /* 忽略 */
  }
  if (slot === 'budget') {
    budgetFile.value = null;
    budgetRows.value = [];
  } else {
    templateFile.value = null;
    templateMeta.value = null;
  }
}

/** 页面加载时恢复两个槽位的已上传文件 */
async function loadTemplateSlots() {
  try {
    const res = await listFileRecords({ module: FILE_MODULE });
    const all = res.files || [];
    const latestOf = (id: string) =>
      all
        .filter((f) => f.recordId === id)
        .sort((a, b) => b.id - a.id)[0] || null;
    const bf = latestOf(BUDGET_RECORD);
    const tf = latestOf(TEMPLATE_RECORD);
    if (bf) await applyBudgetFile(bf, false);
    if (tf) await applyTemplateFile(tf, false);
  } catch {
    /* 后端异常静默降级 */
  }
}

/** 当月预算行（按计划使用时间月份过滤） */
function monthBudgetRows(): BudgetRow[] {
  return budgetRows.value.filter((r) => r.month === selectedMonth.value);
}

/** 预算表 → 价格库联动：按 名称+规格 匹配，把 措施项目/预算科目 写回价格库物资（落库 hse_material_price） */
async function syncMeasureToPriceLibrary(): Promise<number> {
  const bList = budgetRows.value;
  if (!bList.length) return 0;
  await loadMaterials();
  const map = new Map<string, BudgetRow>();
  for (const b of bList) map.set(`${b.name.trim()}||${(b.spec || '-').trim()}`, b);
  let updated = 0;
  for (const cat of materialCategories) {
    for (const item of materialData[cat.key] || []) {
      const b = map.get(`${item.name.trim()}||${(item.spec || '-').trim()}`);
      if (
        b &&
        (item.measureItem !== b.measureItem || item.budgetSubject !== b.budgetSubject)
      ) {
        await updateItem(cat.key, item.id, {
          measureItem: b.measureItem,
          budgetSubject: b.budgetSubject,
        });
        updated += 1;
      }
    }
  }
  if (updated > 0) {
    message.success(`已从预算表同步 ${updated} 条物资的措施项目/预算科目到价格库`);
  }
  return updated;
}

// 切换月份时按 recordId 重新拉取该月文件
async function loadFiles() {
  filesLoading.value = true;
  try {
    const res = await listFileRecords({ module: FILE_MODULE });
    const all = res.files || [];
    uploadedFiles.value = all.filter((f) => f.recordId === selectedMonth.value);
  } catch (err) {
    // 后端未启动或异常时静默降级，不阻断页面其他功能
    uploadedFiles.value = [];
  } finally {
    filesLoading.value = false;
  }
}

// ===================== 从价格库添加（下拉多选费用分类） =====================
const libPickerOpen = ref(false);
// 多选分类：打开时默认未选，由用户勾选；确定后仅将选中分类下物资加入计划
const selectedLibCats = ref<string[]>([]);

/** 打开面板：清空选择（默认未选） */
function openLibPicker() {
  selectedLibCats.value = [];
  libPickerOpen.value = true;
}

/** 仅将选中分类下的物资加入计划（跳过已在计划中的 名称+规格） */
function confirmAddFromPriceLibrary() {
  const cats = selectedLibCats.value;
  if (cats.length === 0) {
    message.warning('请至少选择一个费用分类');
    return;
  }
  const existing = new Set(planRows.value.map((r) => r.name + '|' + r.spec));
  let added = 0;
  let skipped = 0;
  for (const catKey of cats) {
    for (const m of materialData[catKey] || []) {
      const key = `${m.name}|${m.spec}`;
      if (existing.has(key)) {
        skipped += 1;
        continue;
      }
      planRows.value.push({
        id: `${Date.now()}_${m.id}_${added}`,
        name: m.name,
        spec: m.spec,
        unitPrice: m.unitPrice,
        quantity: 0,
        measureItem: m.measureItem || '',
        budgetSubject: m.budgetSubject || '',
      });
      added += 1;
    }
  }
  libPickerOpen.value = false;
  if (added === 0) {
    message.info(
      skipped > 0
        ? `所选分类物资均已在该月计划中（跳过 ${skipped} 项）`
        : '所选分类暂无物资，请先维护「物资价格库」',
    );
  } else {
    message.success(`已从价格库添加 ${added} 项物资${skipped ? `，跳过已存在 ${skipped} 项` : ''}`);
  }
}

function addEmptyRow() {
  planRows.value.push({
    id: `empty_${Date.now()}_${planRows.value.length}`,
    name: '',
    spec: '',
    unitPrice: 0,
    quantity: 0,
  });
}

function removeRow(row: PlanRow) {
  planRows.value = planRows.value.filter((r) => r.id !== row.id);
}

const rowsWithAmount = computed(() =>
  planRows.value.map((r) => ({
    ...r,
    amount: Number((r.quantity * r.unitPrice).toFixed(4)),
  })),
);

const totalItems = computed(() => planRows.value.length);
const totalAmount = computed(() =>
  Number(planRows.value.reduce((s, r) => s + r.quantity * r.unitPrice, 0).toFixed(4)),
);

const statItems = computed(() => [
  { key: 'month', label: '计划月份', value: selectedMonth.value },
  { key: 'items', label: '计划项数', value: totalItems.value },
  { key: 'amount', label: '总金额(万元)', value: totalAmount.value.toFixed(4) },
]);

const columns: VxeTableGridColumns = [
  {
    title: '序号',
    field: 'index',
    width: 70,
    align: 'center',
    formatter: (params: any) => (params?.rowIndex ?? 0) + 1,
  },
  { title: '物资名称', field: 'name', minWidth: 150, align: 'center', slots: { default: 'name' } },
  { title: '规格', field: 'spec', width: 110, align: 'center', slots: { default: 'spec' } },
  {
    title: '措施项目',
    field: 'measureItem',
    width: 170,
    align: 'center',
    showOverflow: 'tooltip',
    formatter: (params: any) => (params?.cellValue ? String(params.cellValue) : '-'),
  },
  { title: '单价(万)', field: 'unitPrice', width: 110, align: 'center', slots: { default: 'price' } },
  { title: '计划数量', field: 'quantity', width: 130, align: 'center', slots: { default: 'qty' } },
  {
    title: '计划金额(万)',
    field: 'amount',
    width: 140,
    align: 'center',
    formatter: (params: any) => (params?.cellValue != null ? Number(params.cellValue).toFixed(4) : '-'),
  },
  {
    title: '操作',
    field: 'action',
    width: 100,
    align: 'center',
    fixed: 'right',
    slots: { default: 'action' },
  },
];

const fileColumns: VxeTableGridColumns = [
  {
    title: '序号',
    field: 'index',
    width: 70,
    align: 'center',
    formatter: (params: any) => (params?.rowIndex ?? 0) + 1,
  },
  { title: '文件名', field: 'name', minWidth: 220, align: 'center', showOverflow: 'tooltip' },
  { title: '大小', field: 'sizeText', width: 140, align: 'center' },
  {
    title: '操作',
    field: 'action',
    width: 160,
    align: 'center',
    fixed: 'right',
    slots: { default: 'fileAction' },
  },
];

const fileRows = computed(() =>
  uploadedFiles.value.map((f) => ({
    id: f.id,
    name: f.originalName,
    sizeText: f.sizeFormatted || formatSize(f.size),
  })),
);

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function onFilesPicked(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = input.files;
  if (!files || files.length === 0) return;
  let ok = 0;
  let fail = 0;
  for (const file of Array.from(files)) {
    try {
      await uploadFileRecord(file, FILE_MODULE, selectedMonth.value);
      ok += 1;
    } catch (err) {
      fail += 1;
    }
  }
  input.value = '';
  await loadFiles();
  if (ok) message.success(`已上传 ${ok} 个文件（已落库）`);
  if (fail) message.warning(`${fail} 个文件上传失败`);
}

async function removeFile(row: { id: number }) {
  try {
    await deleteFileRecord(row.id);
    uploadedFiles.value = uploadedFiles.value.filter((f) => f.id !== row.id);
    message.success('已删除');
  } catch (err) {
    message.error('删除失败');
  }
}

async function downloadRecord(row: { id: number }) {
  try {
    await downloadFileRecord(row.id);
  } catch (err) {
    message.error('下载失败');
  }
}

/** 购买计划明细 sheet（现有逻辑） */
function buildPlanSheet(): (string | number)[][] {
  const data: (string | number)[][] = [
    ['物资名称', '规格', '措施项目', '预算科目', '单价（万元）', '计划数量', '计划金额（万元）'],
  ];
  for (const r of rowsWithAmount.value) {
    data.push([
      r.name || '-',
      r.spec || '-',
      r.measureItem || '',
      r.budgetSubject || '',
      r.unitPrice,
      r.quantity,
      r.amount,
    ]);
  }
  return data;
}

// ===================== 支出申请表：预算表 × 系统计划 合并 =====================
interface ExpenseRow {
  seq: number;
  name: string;
  spec: string;
  measureItem: string;
  budgetSubject: string;
  purpose: string;
  planTime: string;
  dept: string;
  remark: string;
  planQty: number;
  planUnit: number;
  planTotal: number;
  expQty: number;
  expUnit: number;
  expTotal: number;
  status: string;
}

/** 合并规则（用户拍板）：
 *  - 计划列（数量/单价/总价）：系统计划行优先；仅预算有的行取预算值
 *  - 支出列：系统计划行取系统值；仅预算有的行填 0
 * 行序：预算表当月行（原顺序）在前，系统新增行（数量>0）在后，按 名称+规格 合并去重 */
function buildExpenseRows(): ExpenseRow[] {
  const month = selectedMonth.value;
  const budgetList = monthBudgetRows();
  const planList = rowsWithAmount.value.filter(
    (r) => (r.quantity || 0) > 0 && (r.name || '').trim() !== '',
  );
  const key = (name: string, spec: string) => `${name.trim()}||${(spec || '-').trim()}`;
  const planMap = new Map<string, (typeof planList)[number]>();
  for (const p of planList) planMap.set(key(p.name, p.spec), p);
  const used = new Set<string>();
  const out: ExpenseRow[] = [];

  // 预算表当月行在前
  for (const b of budgetList) {
    const k = key(b.name, b.spec);
    used.add(k);
    const p = planMap.get(k);
    const qty = p ? p.quantity : b.qty;
    const unit = p ? p.unitPrice : b.unitPrice;
    const total = p ? Number((p.quantity * p.unitPrice).toFixed(4)) : b.total;
    out.push({
      seq: out.length + 1,
      name: b.name,
      spec: b.spec || '-',
      measureItem: p?.measureItem || b.measureItem,
      budgetSubject: p?.budgetSubject || b.budgetSubject,
      purpose: b.purpose,
      planTime: `${month}-01`,
      dept: b.dept,
      remark: b.remark,
      planQty: qty,
      planUnit: unit,
      planTotal: total,
      expQty: p ? p.quantity : 0,
      expUnit: p ? p.unitPrice : 0,
      expTotal: p ? Number((p.quantity * p.unitPrice).toFixed(4)) : 0,
      status: p ? '申请中' : '未支出',
    });
  }
  // 系统新增行在后
  for (const p of planList) {
    const k = key(p.name, p.spec);
    if (used.has(k)) continue;
    used.add(k);
    const b = budgetList.find((x) => key(x.name, x.spec) === k);
    out.push({
      seq: out.length + 1,
      name: p.name,
      spec: p.spec || '-',
      measureItem: p.measureItem || (b ? b.measureItem : ''),
      budgetSubject: p.budgetSubject || (b ? b.budgetSubject : ''),
      purpose: b ? b.purpose : '',
      planTime: `${month}-01`,
      dept: b ? b.dept : '',
      remark: b ? b.remark : '',
      planQty: p.quantity,
      planUnit: p.unitPrice,
      planTotal: Number((p.quantity * p.unitPrice).toFixed(4)),
      expQty: p.quantity,
      expUnit: p.unitPrice,
      expTotal: Number((p.quantity * p.unitPrice).toFixed(4)),
      status: '申请中',
    });
  }
  return out;
}

/** 支出申请表 sheet：标题 + 双行表头（取上传模板，缺省用默认）+ 数据行 + 底部合计/总额/结余 */
function buildExpenseSheet(rows: ExpenseRow[]): (string | number)[][] {
  const meta = templateMeta.value;
  const title = meta?.title || '安全支出申请表';
  const h2 = meta?.h2?.length
    ? meta.h2
    : ['序号', '措施项目', '预算科目', '名称', '用途及依据', '计划使用时间', '使用部门/地点', '规格/品牌', '计划', '', '', '支出', '', '', '使用状态', '备注'];
  const h3 = meta?.h3?.length
    ? meta.h3
    : ['', '（安全生产费用类别）', '（费用化/资本化）', '', '', '', '', '', '数量', '单价/万元', '总价/万元', '数量', '单价/万元', '总价/万元', '已支出/申请中/未支出', ''];
  const W = 16;
  const sheet: (string | number)[][] = [];
  const blank = () => Array(W).fill('');
  const titleRow = blank();
  titleRow[0] = title;
  const h2Row = blank();
  for (let i = 0; i < W; i++) h2Row[i] = h2[i] ?? '';
  const h3Row = blank();
  for (let i = 0; i < W; i++) h3Row[i] = h3[i] ?? '';
  sheet.push(titleRow, h2Row, h3Row);
  for (const r of rows) {
    sheet.push([
      r.seq,
      r.measureItem,
      r.budgetSubject,
      r.name,
      r.purpose,
      r.planTime,
      r.dept,
      r.spec,
      r.planQty,
      r.planUnit,
      r.planTotal,
      r.expQty,
      r.expUnit,
      r.expTotal,
      r.status,
      r.remark,
    ]);
  }
  // 底部：合计 / 年度预算计划总额·结余 / 年度实际支出总额·结余
  const planTotalSum = Number(rows.reduce((s, r) => s + (r.planTotal || 0), 0).toFixed(4));
  const expTotalSum = Number(rows.reduce((s, r) => s + (r.expTotal || 0), 0).toFixed(4));
  const annualBudgetTotal = Number(
    budgetRows.value.reduce((s, r) => s + (r.total || 0), 0).toFixed(4),
  );
  const f1 = blank();
  f1[0] = '……';
  f1[10] = planTotalSum;
  f1[13] = expTotalSum;
  const f2 = blank();
  f2[0] = '—';
  f2[8] = '年度安全费用预算计划总额';
  f2[10] = annualBudgetTotal;
  f2[11] = '年度安全费用实际支出总额';
  f2[13] = expTotalSum;
  f2[14] = '—';
  const f3 = blank();
  f3[0] = '—';
  f3[8] = '年度安全费用预算计划结余';
  f3[10] = Number((annualBudgetTotal - planTotalSum).toFixed(4));
  f3[11] = '年度安全费用实际支出结余';
  f3[13] = Number((expTotalSum - expTotalSum).toFixed(4));
  f3[14] = '—';
  sheet.push(f1, f2, f3);
  return sheet;
}

// 进入页面 / 切换月份时加载该月已落库文件；同时加载已落库的价格库与预算表/模板槽位
onMounted(() => {
  loadMaterials();
  loadFiles();
  loadTemplateSlots();
});
watch(selectedMonth, () => {
  loadFiles();
});

function oneClickDownload() {
  const expRows = buildExpenseRows();
  if (expRows.length === 0 && uploadedFiles.value.length === 0) {
    message.warning('请先生成购买计划（数量>0）或上传文件');
    return;
  }
  const sheets: { name: string; data: (string | number)[][] }[] = [];
  if (expRows.length > 0) {
    sheets.push({ name: '支出申请表', data: buildExpenseSheet(expRows) });
  }
  if (planRows.value.length > 0) {
    sheets.push({ name: '购买计划', data: buildPlanSheet() });
  }
  if (sheets.length > 0) {
    exportExcel(`安全费用支出申请表_${selectedMonth.value}.xlsx`, sheets);
  }
  // 下载已落库的合同/流程文件（后端文件，逐一下载）
  for (const f of uploadedFiles.value) {
    downloadFileRecord(f.id).catch(() => {});
  }
  message.success('已导出支出申请表、购买计划并下载已上传文件');
}
</script>

<template>
  <HsePageLayout title="月度购买计划">
    <template #extra>
      <div class="flex flex-wrap items-center gap-2">
        <NInput
          v-model:value="selectedMonth"
          placeholder="计划月份，如 2026-09"
          style="width: 150px"
        />
        <NPopover
          v-model:show="libPickerOpen"
          trigger="click"
          placement="bottom-start"
          :width="280"
          :show-arrow="false"
        >
          <template #trigger>
            <NButton size="small" @click="openLibPicker">从价格库添加</NButton>
          </template>
          <div class="lib-picker">
            <div class="lib-picker-title">选择费用分类（可多选）</div>
            <NCheckboxGroup v-model:value="selectedLibCats" class="lib-picker-group">
              <NCheckbox
                v-for="c in materialCategories"
                :key="c.key"
                :value="c.key"
                :label="c.label"
              />
            </NCheckboxGroup>
            <div class="lib-picker-footer">
              <NButton size="small" quaternary @click="libPickerOpen = false">取消</NButton>
              <NButton size="small" type="primary" @click="confirmAddFromPriceLibrary">
                确定添加
              </NButton>
            </div>
          </div>
        </NPopover>
        <NButton size="small" @click="addEmptyRow">新增行</NButton>
        <NButton size="small" :loading="budgetLoading" @click="budgetInput?.click()">
          预算表
        </NButton>
        <input
          ref="budgetInput"
          type="file"
          accept=".xlsx,.xls,.csv"
          hidden
          @change="(e) => uploadSlot(e, 'budget')"
        />
        <NButton size="small" :loading="templateLoading" @click="templateInput?.click()">
          安全支出申请表模板
        </NButton>
        <input
          ref="templateInput"
          type="file"
          accept=".xlsx,.xls,.csv"
          hidden
          @change="(e) => uploadSlot(e, 'template')"
        />
        <NButton type="primary" size="small" @click="oneClickDownload">一键下载</NButton>
      </div>
    </template>

    <!-- 预算表 / 模板上传状态 -->
    <div v-if="budgetFile || templateFile" class="mb-3 flex flex-wrap items-center gap-2 text-sm">
      <NTag v-if="budgetFile" size="small" type="info" closable @close="removeSlot('budget')">
        预算表：{{ budgetFile.originalName }}（共 {{ budgetRows.length }} 条，{{ selectedMonth }}月
        {{ monthBudgetRows().length }} 条）
      </NTag>
      <NTag v-if="templateFile" size="small" type="success" closable @close="removeSlot('template')">
        支出模板：{{ templateFile.originalName }}
      </NTag>
    </div>

    <div class="mb-4 grid grid-cols-3 gap-3">
      <NCard v-for="s in statItems" :key="s.key" :bordered="false">
        <NStatistic :label="s.label" :value="s.value" />
      </NCard>
    </div>

    <HseDataGrid
      :columns="columns"
      :data="rowsWithAmount"
      :loading="false"
      :pager="false"
      scroll-x="900"
    >
      <template #name="{ row }">
        <NInput v-model:value="row.name" size="small" placeholder="物资名称" />
      </template>
      <template #spec="{ row }">
        <NInput v-model:value="row.spec" size="small" placeholder="规格" />
      </template>
      <template #price="{ row }">
        <NInputNumber
          v-model:value="row.unitPrice"
          :min="0"
          :precision="4"
          :step="0.0001"
          size="small"
          style="width: 100%"
          placeholder="单价"
        />
      </template>
      <template #qty="{ row }">
        <NInputNumber
          v-model:value="row.quantity"
          :min="0"
          :precision="0"
          size="small"
          style="width: 100%"
          placeholder="数量"
        />
      </template>
      <template #action="{ row }">
        <NSpace :size="8">
          <NButton size="small" quaternary type="error" @click="removeRow(row)">删除</NButton>
        </NSpace>
      </template>
    </HseDataGrid>

    <div class="mt-6 mb-2 flex items-center justify-between">
      <div class="text-sm font-medium">合同及流程文件</div>
      <NButton size="small" @click="fileInput?.click()">上传文件</NButton>
      <input
        ref="fileInput"
        type="file"
        multiple
        hidden
        @change="onFilesPicked"
      />
    </div>
    <NCard :bordered="true" class="bg-white shadow-sm">
      <HseDataGrid
        :columns="fileColumns"
        :data="fileRows"
        :loading="filesLoading"
        :pager="false"
        height="220"
      >
        <template #fileAction="{ row }">
          <NSpace :size="8">
            <NButton size="small" quaternary type="primary" @click="downloadRecord(row)">
              下载
            </NButton>
            <NButton size="small" quaternary type="error" @click="removeFile(row)">删除</NButton>
          </NSpace>
        </template>
      </HseDataGrid>
      <div v-if="!filesLoading && !uploadedFiles.length" class="py-6 text-center text-gray-400">
        暂无文件。上传供应商合同、报价单、采购单、验收单等必备流程文件，将<span class="text-green-600">长期保存到系统</span>；点击「一键下载」可连同购买计划一并下载。
      </div>
    </NCard>
  </HsePageLayout>
</template>

<style scoped>
/* 「从价格库添加」下拉面板：纵向多选分类 */
.lib-picker {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.lib-picker-title {
  font-size: 13px;
  font-weight: 600;
}

.lib-picker-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.lib-picker-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid hsl(var(--border));
}
</style>
