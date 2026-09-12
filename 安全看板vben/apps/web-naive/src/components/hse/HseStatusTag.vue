<script lang="ts" setup>
import { computed } from 'vue';

import { NTag } from 'naive-ui';
import { $t } from '#/locales';

/** HSE 语义状态类型（与主题令牌一一对应） */
export type HseStatusType = 'success' | 'info' | 'warning' | 'danger' | 'neutral';

const props = withDefaults(
  defineProps<{
    /** 语义类型，决定颜色 */
    type?: HseStatusType;
    /** 尺寸 */
    size?: 'small' | 'medium' | 'large';
    /** 自定义文案，缺省使用 locale 默认文案 */
    label?: string;
  }>(),
  {
    type: 'neutral',
    size: 'medium',
    label: '',
  },
);

// neutral 在 Naive 中没有对应 type，回落到 default（中性灰）
const tagType = computed(() => {
  switch (props.type) {
    case 'success':
      return 'success';
    case 'info':
      return 'info';
    case 'warning':
      return 'warning';
    case 'danger':
      return 'error';
    default:
      return undefined;
  }
});

const text = computed(() => props.label || $t(`page.hse.status.${props.type}`));
</script>

<template>
  <NTag :type="tagType" :size="size" :bordered="false">
    <slot>{{ text }}</slot>
  </NTag>
</template>
