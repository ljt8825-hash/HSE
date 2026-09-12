<template>
  <a-dropdown :trigger="['click']">
    <a-button :type="type" :size="size">
      <IconifyIcon icon="lucide:download" class="mr-1" />
      {{ label }}
      <IconifyIcon icon="lucide:chevron-down" class="inline ml-1" />
    </a-button>
    <template #overlay>
      <a-menu @click="handleMenuClick">
        <a-menu-item key="html">
          <IconifyIcon icon="lucide:file-text" class="mr-1" />
          HTML 打印
        </a-menu-item>
        <a-menu-item key="word">
          <IconifyIcon icon="lucide:file-type-docx" class="mr-1" />
          Word 文档
        </a-menu-item>
      </a-menu>
    </template>
  </a-dropdown>
</template>

<script setup lang="ts">
import { IconifyIcon } from '@vben/icons';
import { exportReportHtml, exportReportWord } from '#/api/hse/reports';

const props = withDefaults(defineProps<{
  reportId: number;
  label?: string;
  type?: 'primary' | 'default';
  size?: 'small' | 'middle' | 'large';
}>(), {
  label: '导出',
  type: 'default',
  size: 'middle',
});

function handleMenuClick({ key }: { key: string }) {
  if (key === 'html') {
    const url = exportReportHtml(props.reportId);
    window.open(url, '_blank');
  } else if (key === 'word') {
    const url = exportReportWord(props.reportId);
    window.location.href = url;
  }
}
</script>

<style scoped>
.inline {
  display: inline-block;
  vertical-align: middle;
}
.ml-1 {
  margin-left: 4px;
}
.mr-1 {
  margin-right: 4px;
}
</style>
