<script lang="ts" setup>
/** MOBILE-WPS-V1 · 我的任务（被转派给我的 / 我发起的转派） */
import RecordList from './record-list.vue';

defineOptions({ name: 'MwMyTask' });
</script>

<template>
  <RecordList mode="task" title="我的任务" empty-text="暂无任务" />
</template>
