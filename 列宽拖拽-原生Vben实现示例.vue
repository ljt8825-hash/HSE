<script setup lang="ts">
// ✅ 纯 Vben 原生：仅使用 @vben/plugins/vxe-table 提供的 useVbenVxeGrid
//
// 列宽拖拽（resizable）已在 apps/web-antd/src/adapter/vxe-table.ts 中全局开启：
//     setConfig({ grid: { columnConfig: { resizable: true } } })
// 因此本组件【零自定义封装、零自定义样式】，开箱即得列宽拖拽能力。
//
// 列宽状态的“持久化 + 响应式”使用 vxe-table 原生机制：
//     id             → localStorage 键前缀（vxe-table 原生）
//     customConfig.storage → 列宽/列序/显隐自动写入 localStorage，刷新后自动恢复（vxe-table 原生）

import { reactive } from 'vue';

import { Page } from '@vben/common-ui';
import { useVbenVxeGrid, type VxeTableGridOptions } from '@vben/plugins/vxe-table';

interface RowType {
  id: number;
  name: string;
  department: string;
  role: string;
  phone: string;
  entryDate: string;
}

// 示例数据（实际项目可替换为接口数据，见文末“远程数据”说明）
const tableData: RowType[] = [
  { id: 1, name: '张伟', department: '安全监察部', role: '安全工程师', phone: '13800000001', entryDate: '2021-03-12' },
  { id: 2, name: '李娜', department: '生产运行部', role: '班组长', phone: '13800000002', entryDate: '2020-07-01' },
  { id: 3, name: '王强', department: '设备管理部', role: '维修技师', phone: '13800000003', entryDate: '2022-11-23' },
  { id: 4, name: '赵敏', department: '安全监察部', role: '安全员', phone: '13800000004', entryDate: '2019-05-30' },
  { id: 5, name: '刘洋', department: '物流运输部', role: '驾驶员', phone: '13800000005', entryDate: '2023-01-15' },
  { id: 6, name: '陈静', department: '生产运行部', role: '操作工', phone: '13800000006', entryDate: '2021-09-08' },
  { id: 7, name: '杨光', department: '设备管理部', role: '电气工程师', phone: '13800000007', entryDate: '2018-12-19' },
  { id: 8, name: '周磊', department: '物流运输部', role: '调度员', phone: '13800000008', entryDate: '2022-04-02' },
];

// gridOptions 使用 Vben 原生类型，所有字段均为 vxe-table 原生支持
const gridOptions = reactive<VxeTableGridOptions<RowType>>({
  // 🔑 id：列状态持久化的 localStorage 键前缀（vxe-table 原生机制）
  id: 'hse-column-resize-demo',

  // 🔑 customConfig.storage：原生“列自定义”持久化
  //    列宽 / 列顺序 / 显隐 会被自动写入 localStorage，刷新页面后自动恢复
  customConfig: {
    storage: true,
  },

  // 列定义：给每列设定初始 width 即可，resizable 由全局配置统一开启
  columns: [
    { title: '序号', field: 'id', width: 80 },
    { title: '姓名', field: 'name', width: 120 },
    { title: '部门', field: 'department', width: 160 },
    { title: '岗位', field: 'role', width: 140 },
    { title: '联系电话', field: 'phone', width: 160 },
    { title: '入职日期', field: 'entryDate', width: 140 },
  ],

  data: tableData,

  // —— 以下均为 vxe-table 原生外观/行为配置，按需开启 ——
  border: true, // 显示列边框，拖拽手柄（列右边缘）更直观
  stripe: true, // 斑马纹
  pagerConfig: { pageSize: 10 }, // 原生分页
  minHeight: 200,
});

// useVbenVxeGrid 返回 [Grid 组件, gridApi]
// Grid 直接放进模板即可，无任何额外封装逻辑
const [Grid] = useVbenVxeGrid(gridOptions);
</script>

<template>
  <Page
    title="列宽拖拽（Vben 原生网格）"
    description="将鼠标移到任意列的右边缘，按住拖动即可调整列宽；刷新页面后列宽自动保留。"
  >
    <Grid />
  </Page>
</template>
