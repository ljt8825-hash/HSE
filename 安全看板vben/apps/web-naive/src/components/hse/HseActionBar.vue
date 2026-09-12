<script lang="ts" setup>
import { computed } from 'vue';
import type { Component } from 'vue';

import { NButton, NTooltip } from 'naive-ui';
import { $t } from '#/locales';
import { Copy, Download, Inbox, Plus, RotateCw } from '@vben/icons';

/** 标准动作键 */
export type HseActionKey =
  | 'refresh'
  | 'downloadTemplate'
  | 'import'
  | 'export'
  | 'create';

export interface HseActionState {
  /** 隐藏该动作 */
  hidden?: boolean;
  /** 禁用 */
  disabled?: boolean;
  /** 显示 loading */
  loading?: boolean;
}

const props = withDefaults(
  defineProps<{
    /**
     * 各动作的可选状态（隐藏 / 禁用 / loading）。
     * 键名与冻结顺序无关，顺序由组件内部固定。
     */
    actions?: Partial<Record<HseActionKey, HseActionState>>;
    /** 纵向排列 */
    vertical?: boolean;
  }>(),
  {
    actions: () => ({}),
    vertical: false,
  },
);

const emit = defineEmits([
  'refresh',
  'download-template',
  'import',
  'export',
  'create',
]);

// 动作元数据（图标 / 是否主按钮）。顺序固定，create 永远是主按钮。
const META: Record<HseActionKey, { icon: Component; primary: boolean }> = {
  refresh: { icon: RotateCw, primary: false },
  downloadTemplate: { icon: Copy, primary: false },
  import: { icon: Inbox, primary: false },
  export: { icon: Download, primary: false },
  create: { icon: Plus, primary: true },
};

// 冻结的标准顺序：刷新 → 下载模板 → 导入 → 导出 → 新增
const ORDER: HseActionKey[] = [
  'refresh',
  'downloadTemplate',
  'import',
  'export',
  'create',
];

const LABEL_KEY: Record<HseActionKey, string> = {
  refresh: 'page.hse.actions.refresh',
  downloadTemplate: 'page.hse.actions.downloadTemplate',
  import: 'page.hse.actions.import',
  export: 'page.hse.actions.export',
  create: 'page.hse.actions.create',
};

// 文案随 locale 实时变化
const visibleActions = computed(() =>
  ORDER.filter((key) => !props.actions?.[key]?.hidden).map((key) => ({
    key,
    label: $t(LABEL_KEY[key]),
    icon: META[key].icon,
    primary: META[key].primary,
  })),
);

function getState(key: HseActionKey): HseActionState {
  return props.actions?.[key] ?? {};
}

function onClick(key: HseActionKey) {
  if (key === 'downloadTemplate') {
    emit('download-template');
    return;
  }
  emit(key);
}
</script>

<template>
  <div
    class="flex flex-wrap items-center gap-2"
    :class="{ 'flex-col items-stretch': vertical }"
  >
    <NTooltip
      v-for="item in visibleActions"
      :key="item.key"
      trigger="hover"
    >
      <template #trigger>
        <NButton
          :type="item.primary ? 'primary' : 'default'"
          :secondary="!item.primary"
          :disabled="getState(item.key).disabled"
          :loading="getState(item.key).loading"
          @click="onClick(item.key)"
        >
          <template #icon>
            <component :is="item.icon" />
          </template>
          {{ item.label }}
        </NButton>
      </template>
      {{ item.label }}
    </NTooltip>
  </div>
</template>
