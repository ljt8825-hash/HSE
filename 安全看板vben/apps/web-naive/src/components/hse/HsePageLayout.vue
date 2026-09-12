<script lang="ts" setup>
import { Page } from '@vben/common-ui';

withDefaults(
  defineProps<{
    /** 页面标题 */
    title?: string;
    /** 页面描述 */
    description?: string;
    /** 内容区自定义 class（间距 / 背景等） */
    contentClass?: string;
    /** 头部自定义 class */
    headerClass?: string;
    /** 内容区自动计算高度 */
    autoContentHeight?: boolean;
    /** 页脚固定 */
    footerFixed?: boolean;
    /** 高度偏移 */
    heightOffset?: number;
  }>(),
  {
    contentClass: '',
    headerClass: '',
    autoContentHeight: false,
    footerFixed: false,
    heightOffset: 0,
  },
);
</script>

<template>
  <Page
    :title="title"
    :description="description"
    :content-class="contentClass"
    :header-class="headerClass"
    :auto-content-height="autoContentHeight"
    :footer-fixed="footerFixed"
    :height-offset="heightOffset"
  >
    <template #title>
      <div v-if="$slots.breadcrumb" class="mb-2">
        <slot name="breadcrumb" />
      </div>
      <slot name="title">
        <div v-if="title" class="text-lg font-semibold">{{ title }}</div>
      </slot>
    </template>

    <template #description>
      <slot name="description">
        <p v-if="description" class="text-muted-foreground">{{ description }}</p>
      </slot>
    </template>

    <template #extra>
      <div class="flex flex-wrap items-center gap-2">
        <slot name="extra" />
      </div>
    </template>

    <template #footer>
      <slot name="footer" />
    </template>

    <slot />
  </Page>
</template>
