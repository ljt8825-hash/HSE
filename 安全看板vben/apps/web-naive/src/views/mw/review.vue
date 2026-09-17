<script lang="ts" setup>
/** MOBILE-WPS-V1 · 我的复查 */
import RecordList from './record-list.vue';

defineOptions({ name: 'MwMyReview' });
</script>

<template>
  <RecordList mode="review" title="我的复查" empty-text="暂无待复查记录" />
</template>
