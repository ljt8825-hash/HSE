<script lang="ts" setup>
/** MOBILE-WPS-V1 · 我的整改 */
import RecordList from './record-list.vue';

defineOptions({ name: 'MwMyRectify' });
</script>

<template>
  <RecordList
    mode="rectify"
    title="我的整改"
    empty-text="暂无待整改记录"
  />
</template>
