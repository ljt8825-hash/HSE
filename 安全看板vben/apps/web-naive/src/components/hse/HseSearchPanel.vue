<script lang="ts" setup>
import { computed, ref } from 'vue';

import { NButton, NCard, NGrid, NSpace, NTooltip } from 'naive-ui';
import { $t } from '#/locales';
import { ChevronDown, ChevronsRight, RotateCw, Search } from '@vben/icons';

const props = withDefaults(
  defineProps<{
    /** 查询按钮 loading（由调用方控制） */
    queryLoading?: boolean;
    /** 查询按钮 disabled */
    queryDisabled?: boolean;
    /** 重置按钮 loading */
    resetLoading?: boolean;
    /** 重置按钮 disabled */
    resetDisabled?: boolean;
    /** 是否可折叠（仅当存在 more 插槽时才有意义） */
    collapsible?: boolean;
    /** 初始是否展开 */
    defaultExpanded?: boolean;
    /** 桌面端列数（2 或 3），窄屏自动降为单列 */
    columns?: 2 | 3;
  }>(),
  {
    queryLoading: false,
    queryDisabled: false,
    resetLoading: false,
    resetDisabled: false,
    collapsible: true,
    defaultExpanded: true,
    columns: 3,
  },
);

const emit = defineEmits<{
  query: [];
  reset: [];
}>();

const expanded = ref(props.defaultExpanded);

// 响应式列数（Naive NGrid 字符串 cols，配合 responsive="screen"）：窄屏单列，桌面端按 columns 配置（2/3 列）
// NGrid 的 cols 类型本身支持字符串；调用方以 <NGi> 提供筛选项，必须是 NGrid 的直接插槽内容（由 NGrid 注入 gridInjectionKey）。
const gridCols = computed(() => `1 s:2 l:${props.columns}`);

function toggle() {
  expanded.value = !expanded.value;
}

const toggleLabel = computed(() =>
  expanded.value
    ? $t('page.hse.search.collapse')
    : $t('page.hse.search.expand'),
);
</script>

<template>
  <NCard :bordered="false" class="mb-4">
    <div class="flex flex-col gap-3">
      <NGrid :cols="gridCols" :x-gap="16" :y-gap="16" responsive="screen">
        <slot />
        <template v-if="expanded && $slots.more">
          <slot name="more" />
        </template>
      </NGrid>

      <NSpace class="flex-wrap" justify="end">
        <NTooltip v-if="collapsible && $slots.more">
          <template #trigger>
            <NButton quaternary size="small" @click="toggle">
              <template #icon>
                <component :is="expanded ? ChevronDown : ChevronsRight" />
              </template>
              {{ toggleLabel }}
            </NButton>
          </template>
          {{ toggleLabel }}
        </NTooltip>

        <NButton
          :disabled="resetDisabled"
          :loading="resetLoading"
          @click="emit('reset')"
        >
          <template #icon>
            <RotateCw />
          </template>
          {{ $t('page.hse.search.reset') }}
        </NButton>

        <NButton
          type="primary"
          :disabled="queryDisabled"
          :loading="queryLoading"
          @click="emit('query')"
        >
          <template #icon>
            <Search />
          </template>
          {{ $t('page.hse.search.query') }}
        </NButton>
      </NSpace>
    </div>
  </NCard>
</template>
