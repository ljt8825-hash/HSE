<script setup lang="ts">
import { ref } from 'vue';

import { Page } from '@vben/common-ui';

import type { VxeTableGridColumns } from '@vben/plugins/vxe-table';

import { HseDataGrid } from '#/components/hse';

const columns = ref<VxeTableGridColumns>([
  {
    field: 'no',
    title: 'No',
  },
  {
    field: 'title',
    title: 'Title',
  },
  {
    field: 'length',
    title: 'Length',
  },
]);
const data = [
  { length: '4:18', no: 3, title: 'Wonderwall' },
  { length: '4:48', no: 4, title: "Don't Look Back in Anger" },
  { length: '7:27', no: 12, title: 'Champagne Supernova' },
];
</script>

<template>
  <Page
    description="表单页用于向用户收集或验证信息，基础表单常见于数据项较少的表单场景。"
    title="HseDataGrid"
  >
    <HseDataGrid :columns="columns" :data="data" :pager="false" row-key="no" />
  </Page>
</template>

<style scoped></style>
