<script lang="ts" setup>
/**
 * HseDataGrid —— HSE 通用数据表格（基于 VXE Table + VbenVxeGrid 封装）
 *
 * 设计原则（见 01-强制设计约束.md 第 5 节）：
 * - 表头文字与排序图标居中（headerAlign / 列 headerAlign）。
 * - 长文本单行省略并悬停展示完整内容（showOverflow: 'tooltip'，列可覆盖）。
 * - 单元格语义对齐由调用方按列配置（长文本左对齐，日期/数值/状态/操作居中）。
 * - 仅白名单列可排序（列定义 sortable: true）；排序为「服务端三态」：
 *   升序 → 降序 → 取消排序，组件绝不本地重排数据，仅向外 emit 标准化事件。
 * - 不提供列宽拖动、列顺序拖动、用户自定义列宽（columnConfig.resizable: false）。
 * - 组件内不写任何业务 API、业务字段或业务状态映射。
 *
 * 事件协议：
 * - sort-change: { sortBy?: string; sortOrder?: 'asc' | 'desc' }（取消排序时 sortOrder 为 undefined）
 * - edit-save:    { row }   行编辑保存（校验通过后）
 * - edit-cancel:  { row }   行编辑取消 / 校验失败回滚
 * - page-change:  { currentPage; pageSize }
 * - reload:       外部请求刷新
 */
import { computed, ref, useSlots, watch } from 'vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import type {
  VxeGridListeners,
  VxeTableGridColumns,
  VxeTableGridOptions,
} from '@vben/plugins/vxe-table';

interface Props {
  /** 列定义（调用方按语义配置 align / sortable / showOverflow / editRender） */
  columns: VxeTableGridColumns;
  /** 表格数据（由调用方提供，组件不主动请求后端） */
  data?: any[];
  /** 加载态 */
  loading?: boolean;
  /** 行唯一标识字段，默认 'id' */
  rowKey?: string;
  /** 分页：true=默认分页；对象=透传分页配置；false=不分页 */
  pager?: boolean | Record<string, any>;
  /** 当前页（外部受控，服务端分页下随筛选重置回第 1 页）；不传时组件内部维护 */
  currentPage?: number;
  /** 每页条数（外部受控） */
  pageSize?: number;
  /** 服务端总条数（分页为服务端模式时由调用方提供） */
  total?: number;
  /** 是否开启行编辑基础能力 */
  editable?: boolean;
  /**
   * 编辑模式：'row'=行编辑（默认，配合操作列进入编辑态）；
   * 'cell'=单元格点击直接编辑（点击带 editRender 的单元格即进入编辑，关闭时自动保存）。
   */
  editMode?: 'row' | 'cell';
  /**
   * 行编辑校验规则（透传 VXE `editRules`）。
   * 调用方按业务字段声明必填等规则，例如：
   *   { name: [{ required: true, message: '姓名不能为空' }] }
   * 公共组件不内置任何业务字段或校验逻辑。
   */
  editRules?: Record<string, any[]>;
  /** 固定高度（开启后表格内部滚动）；不传则按内容自适应 */
  height?: number | string;
  /** 虚拟滚动（大体积台账/日志场景）：需配合 height 使用；VXE 在数据行数>阈值时自动生效 */
  virtualScroll?: boolean;
  /** 尺寸 */
  size?: 'medium' | 'small' | 'mini';
  /** 行样式函数（如地图联动高亮），透传 VXE `rowClassName` */
  rowClassName?: (params: { row: any }) => string;
  /** 是否开启横向自适应：列宽自动填充容器宽度，禁用横向滚动条 */
  autoWidth?: boolean;
  /** 初始排序（服务端模式下回填表头排序箭头，不参与数据请求）。
   *  例如 { field: 'score_total', order: 'desc' }，field 需与某 sortable 列的 field 一致 */
  defaultSort?: { field: string; order: 'asc' | 'desc' };
  /**
   * 工具栏「自定义列」按钮（vxe-toolbar-custom-target）：点击弹出列显隐设置。
   * true=启用，默认关闭；对象可透传 vxe toolbarConfig.custom 配置并指定持久化 key，
   * 典型用法：{ storageKey: 'hse_accidents_columns' }（存储到 localStorage，刷新后保留列设置）。
   * 开启后在需要时由调用方按页面传入，其他页不受影响。
   */
  toolbarCustom?: boolean | { storageKey?: string } & Record<string, any>;
  /**
   * 行拖拽排序：启用 vxe `rowDragConfig`（v4 内建，已废弃历史 dragConfig）。
   * true=启用（默认整行可拖）；对象=透传 rowDragConfig 配置。
   * 仅手柄触发用法：传 { trigger: 'cell' } + 目标列声明 dragSort: true。
   * 落库由调用方监听 `row-dragend` 事件（参数 dragRow/newRow 为数据源引用），
   * 用引用在自身数据源重排后，本组件随 data prop 变化自动刷新。
   */
  rowDrag?: boolean | Record<string, any>;
}

const props = withDefaults(defineProps<Props>(), {
  data: () => [],
  loading: false,
  rowKey: 'id',
  pager: false,
  editable: false,
  size: 'small',
  autoWidth: false,
  virtualScroll: false,
});

const emit = defineEmits<{
  'sort-change': [payload: { sortBy?: string; sortOrder?: 'asc' | 'desc' }];
  'edit-save': [payload: { row: any }];
  'edit-cancel': [payload: { row: any }];
  'edit-closed': [payload: { row: any; column: any }];
  'page-change': [payload: { currentPage: number; pageSize: number }];
  /**
   * 行拖拽结束（vxe `row-dragend`）：payload 含 oldRow/newRow/dragRow/dragPos/_index，
   * 其中 dragRow/newRow 为数据源引用，调用方需据此在自身数据源重排后，
   * 本组件随 data prop 变化自动刷新。（VXE 已按最终顺序内部交换，此处复原源数组即可保持一致。）
   */
  'row-dragend': [payload: {
    oldRow: any;
    newRow: any;
    dragRow: any;
    dragPos: string;
    _index?: { newIndex: number; oldIndex: number };
  }];
  reload: [];
}>();

const slots = useSlots();

// 分页当前状态由组件内部维护：
// 未启用 vxe 代理（无 ajax.query）时，分页器高亮只读 pagerConfig.currentPage（见 vxe grid.js 第734行）。
// 若不在此处维护并回写 currentPage，每次数据/总数更新经 setGridOptions 重设 pagerConfig（默认值=1），
// 会导致翻页后高亮永远停在初始页（数据已请求但页码不动 = "点击无反应"）。
const pagerInitConfig =
  typeof props.pager === 'object' && props.pager ? (props.pager as Record<string, any>) : {};
const currentPage = ref(1);
const pageSize = ref((pagerInitConfig.pageSize as number) ?? 20);

function buildGridOptions(): VxeTableGridOptions {
  const opts: VxeTableGridOptions = {
    rowConfig: { keyField: props.rowKey },
    // 行样式（地图联动等场景的高亮），透传 VXE rowClassName
    ...(props.rowClassName ? { rowClassName: props.rowClassName } : {}),
    // 强制禁止列宽拖动 / 列顺序拖动 / 用户自定义列宽
    columnConfig: { resizable: false },
    // 表头居中（排序图标随之居中）
    headerAlign: 'center',
    align: 'center',
    // 长文本默认省略 + tooltip；列可通过 showOverflow: false 关闭
    showOverflow: 'tooltip',
    border: false,
    stripe: true,
    round: true,
    minHeight: 180,
    size: props.size,
    columns: props.columns as any,
    // 服务端三态排序：组件只负责切换状态与上报，绝不本地重排。
    // remote:true 时 VXE 仅维护排序状态（表头箭头），不会自行重排数据；
    // 初始排序由调用方通过 :sort 传入，这里仅声明排序行为协议。
    sortConfig: {
      remote: true,
      trigger: 'cell',
      multiple: false,
      orders: ['asc', 'desc', null],
      // 初始排序箭头回填（仅表头状态，不触发请求）
      ...(props.defaultSort
        ? { defaultSort: { field: props.defaultSort.field, order: props.defaultSort.order } }
        : {}),
    },
  };

  // 行拖拽排序：rowConfig.drag 开启 HTML5 拖拽（vxe 事件门），rowDragConfig 配置行为。
  // handle-only 用法：调用方传 { trigger: 'cell' }，并在目标手柄列声明 dragSort: true；
  // 默认 showIcon:false，由调用方在 slot 内渲染自己的手柄图标（如 ⠿），避免双图标。
  if (props.rowDrag) {
    opts.rowConfig = {
      ...(opts.rowConfig || {}),
      drag: true,
    };
    opts.rowDragConfig = {
      showIcon: false,
      ...(typeof props.rowDrag === 'object' ? props.rowDrag : {}),
    };
  }

  if (props.height) {
    opts.height = props.height;
  }

  // 工具栏「自定义列」按钮（vxe-toolbar-custom-target）：vxe-grid 内置，开启后点击弹出列显隐设置。
  // 需配合模板中提供的 toolbar-tools 占位，确保 vxe 工具栏被渲染（见 template）。
  if (props.toolbarCustom) {
    // toolbarConfig.custom：仅启用工具栏「自定义列」按钮（boolean）。对象里的 storageKey
    // 只用于下方的表级持久化（customConfig.storage），不作为 toolbar custom 配置透传。
    opts.toolbarConfig = { custom: true } as VxeTableGridOptions['toolbarConfig'];
    // 自定义列持久化：不配置 storage 时，列显隐/顺序只生效于本次会话，刷新即回到默认。
    // vxe-table 要求 storage=true 且网格必须有 id（作为 localStorage 的 storageKey）。
    // storageKey 由调用方按页面传入，避免多页面共用同一 key 互相覆盖。
    const storageKey =
      typeof props.toolbarCustom === 'object' && props.toolbarCustom.storageKey;
    if (storageKey) {
      opts.id = storageKey;
      opts.customConfig = { storage: true };
    }
  }

  // 虚拟滚动：VXE 在固定高度 + scrollY.enabled 且数据行数超阈值时启用 DOM 虚拟化
  if (props.virtualScroll) {
    opts.scrollY = { enabled: true };
  }

  // 横向自适应：禁用横向滚动条，让列宽自动填充容器宽度
  if (props.autoWidth) {
    opts.scrollX = { enabled: false };
  }

  if (props.editable) {
    opts.keepSource = true;
    const isCell = props.editMode === 'cell';
    opts.editConfig = {
      // cell 模式：点击单元格即进入编辑；row 模式：由调用方通过 beginEdit 手动进入
      trigger: isCell ? 'click' : 'manual',
      mode: isCell ? 'cell' : 'row',
      showStatus: true,
      // cell 模式关闭即清除编辑态；row 模式保留编辑态以便操作列显示保存/取消
      autoClear: isCell,
    };
    // 校验规则由调用方透传（业务字段不进入公共组件）
    if (props.editRules) {
      (opts as any).editRules = props.editRules;
    }
  }

  if (props.pager) {
    const cfg = typeof props.pager === 'object' ? props.pager : {};
    opts.pagerConfig = {
      // 关键：显式携带内部维护的 currentPage/pageSize，使分页器高亮与翻页动作保持一致；
      // 若调用方外部受控（currentPage/pageSize 传入），优先用外部值（筛选后重置回第 1 页）。
      currentPage: props.currentPage ?? currentPage.value,
      pageSize: props.pageSize ?? pageSize.value,
      pageSizes: cfg.pageSizes ?? [10, 20, 30, 50, 100],
      total: props.total ?? props.data.length,
      background: true,
      className: 'mt-2 w-full',
    };
  } else {
    // 显式禁用 VXE pager：否则 VXE 默认启用分页栏（共 N 条/每页/翻页），
    // 会在调用方声明 :pager="false" 时仍显示分页控件。
    opts.pagerConfig = { enabled: false };
  }

  return opts;
}

const gridOptions = computed<VxeTableGridOptions>(() => buildGridOptions());

const gridEvents = computed<VxeGridListeners>(() => ({
  sortChange({ field, order }) {
    // 标准化为 { sortBy, sortOrder }；取消排序时 order 为 null → undefined
    emit('sort-change', {
      sortBy: field as string | undefined,
      sortOrder: order === 'asc' || order === 'desc' ? order : undefined,
    });
  },
  // vxe-table 实际 emit kebab-case 'page-change'，但 VxeGridListeners 类型仅声明 camelCase 'pageChange'，
  // 此处用 as any 显式声明以匹配真实事件名
  'page-change': ((payload: { currentPage: number; pageSize: number }) => {
    // 同步组件内部分页状态 → gridOptions 重算 → watch 触发 setGridOptions，
    // 把最新的 currentPage 回写到 pagerConfig，分页器高亮才会跟随翻页动作。
    currentPage.value = payload.currentPage;
    pageSize.value = payload.pageSize;
    emit('page-change', { currentPage: payload.currentPage, pageSize: payload.pageSize });
  }) as any,
  // 单元格编辑关闭（cell 模式）：点击其他处/回车/ESC 后触发，row 已写入最新值，持久化由调用方处理
  'edit-closed': ((payload: { row: any; column: any }) => {
    emit('edit-closed', payload);
  }) as any,
// 行拖拽结束：转发 vxe `row-dragend`（含 dragRow/newRow 引用 → 调用方据此重排自身数据源）
  'row-dragend': ((payload: any) => {
    emit('row-dragend', payload);
  }) as any,
}));

// 初始化时传入快照；后续 props 变化通过 setGridOptions 同步
const [Grid, gridApi] = useVbenVxeGrid({
  gridOptions: gridOptions.value,
  gridEvents: gridEvents.value,
});

watch(gridOptions, (val) => {
  gridApi.setGridOptions(val);
});

// 外部受控分页：把调用方的 currentPage/pageSize 同步进内部 ref，保证后续翻页动作基于外部值
watch(
  () => props.currentPage,
  (v) => {
    if (typeof v === 'number' && v >= 1) currentPage.value = v;
  },
);
watch(
  () => props.pageSize,
  (v) => {
    if (typeof v === 'number' && v >= 1) pageSize.value = v;
  },
);

// 数据同步：优先直接调用 VXE 实例的 loadData 写入数据，
// 避免经由 api.setState({ tableData }) → 外层 options computed 重算 →
// cloneDeep 重建列 → 把刚设置的排序状态（order / 箭头）一并清掉。
// 仅当 VXE 实例尚未挂载（首次 immediate）时，才回退到 store.tableData，
// 由 Vben 包装层在 options 中注入初始 data（仅发生一次，不干扰排序）。
function syncTableData(val: any[]) {
  const $grid = gridApi.grid as any;
  if ($grid && typeof $grid.loadData === 'function') {
    $grid.loadData(val);
  } else if (typeof $grid?.reloadData === 'function') {
    $grid.reloadData(val);
  } else if (typeof $grid?.setData === 'function') {
    $grid.setData(val);
  } else {
    gridApi.setState({ tableData: val } as any);
  }
}

// 数据 / 加载态同步
watch(
  () => props.data,
  (val) => {
    syncTableData(val);
  },
  { immediate: true },
);

watch(
  () => props.loading,
  (val) => {
    gridApi.setLoading(val);
  },
  { immediate: true },
);

// —— 行编辑基础能力（保存动作通过事件交给调用方） ——
// gridApi.grid 为 VXE 实例，其编辑/校验方法在运行时存在，此处以 any 调用以兼容类型版本差异
async function beginEdit(row: any) {
  const $grid = gridApi.grid as any;
  if ($grid) {
    await $grid.setEditRow(row);
  }
}

async function saveEdit(row: any) {
  const $grid = gridApi.grid as any;
  if (!$grid) {
    return;
  }
  // vxe-table@4.19.25 的 validate() 行为：校验成功返回 true（或 undefined，版本差异），
  // 校验失败返回错误映射（truthy 对象）。因此「成功」应同时容纳 true 与 undefined，
  // 仅当结果为错误映射时才视为失败，避免把「无规则/校验通过」的行误判为失败而回滚+发 edit-cancel。
  const result = await $grid.validate(row);
  const isValid = result === true || result === undefined || result === null;
  if (isValid) {
    // 校验成功：保留编辑后的值、退出编辑、只发 edit-save
    await $grid.clearEdit();
    emit('edit-save', { row: { ...row } });
  } else {
    // 校验失败：回滚原始值、退出编辑、发 edit-cancel
    $grid.revertData(row);
    await $grid.clearEdit();
    emit('edit-cancel', { row: { ...row } });
  }
}

function cancelEdit(row: any) {
  const $grid = gridApi.grid as any;
  if (!$grid) {
    return;
  }
  $grid.revertData(row);
  $grid.clearEdit();
  emit('edit-cancel', { row: { ...row } });
}

function revertRow(row: any) {
  (gridApi.grid as any)?.revertData(row);
}

function reload(data?: any[]) {
  if (data) {
    syncTableData(data);
  }
  emit('reload');
}

defineExpose({ gridApi, beginEdit, saveEdit, cancelEdit, revertRow, reload });
</script>

<template>
  <Grid>
    <!-- 透传父级所有插槽（自定义单元格：状态标签 / 操作列等） -->
    <template v-for="(_slot, name) in slots" :key="name" #[name]="slotProps">
      <slot :name="name" v-bind="slotProps ?? {}" />
    </template>
    <!-- toolbarCustom：调用方未提供 toolbar-tools 时，注入空占位以触发 vxe 工具栏渲染，
        使工具栏“自定义列”按钮（vxe-toolbar-custom-target）得以显示 -->
    <template v-if="toolbarCustom && !slots['toolbar-tools']" #toolbar-tools></template>
  </Grid>
</template>
