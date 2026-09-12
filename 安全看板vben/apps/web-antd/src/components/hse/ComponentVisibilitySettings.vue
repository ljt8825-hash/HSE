<script lang="ts" setup>
import { computed, ref } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, Checkbox, Drawer, Space, Switch, Tooltip } from 'ant-design-vue';

import type { VisibilityConfig, VisibilityItem } from '#/composables/useComponentVisibility';

interface Props {
  title?: string;
  statItems: VisibilityItem[];
  actionButtons: VisibilityItem[];
  modelValue: VisibilityConfig;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  'update:modelValue': [value: VisibilityConfig];
  reset: [];
}>();

const open = ref(false);

const localConfig = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
});

function handleReset() {
  emit('reset');
}

const allStatsSelected = computed({
  get: () => props.statItems.every((item) => localConfig.value.stats[item.key]),
  set: (val: boolean) => {
    props.statItems.forEach((item) => {
      localConfig.value.stats[item.key] = val;
    });
  },
});

const allActionsSelected = computed({
  get: () => props.actionButtons.every((item) => localConfig.value.actions[item.key]),
  set: (val: boolean) => {
    props.actionButtons.forEach((item) => {
      localConfig.value.actions[item.key] = val;
    });
  },
});
</script>

<template>
  <Tooltip title="组件显示设置">
    <Button type="text" @click="open = true">
      <template #icon>
        <IconifyIcon icon="lucide:settings" />
      </template>
      显示设置
    </Button>
  </Tooltip>

  <Drawer
    v-model:open="open"
    :title="title || '组件显示设置'"
    placement="right"
    width="320px"
  >
    <div class="visibility-settings">
      <!-- 统计卡片 -->
      <div class="setting-section">
        <div class="section-title">
          <Checkbox v-model:checked="allStatsSelected" />
          <span>统计卡片</span>
        </div>
        <div class="section-items">
          <Checkbox
            v-for="item in statItems"
            :key="item.key"
            v-model:checked="localConfig.stats[item.key]"
          >
            {{ item.label }}
          </Checkbox>
        </div>
      </div>

      <!-- 操作栏按钮 -->
      <div class="setting-section">
        <div class="section-title">
          <Checkbox v-model:checked="allActionsSelected" />
          <span>操作栏按钮</span>
        </div>
        <div class="section-items">
          <Checkbox
            v-for="item in actionButtons"
            :key="item.key"
            v-model:checked="localConfig.actions[item.key]"
          >
            {{ item.label }}
          </Checkbox>
        </div>
      </div>

      <!-- 筛选器区域 -->
      <div class="setting-section">
        <div class="section-title">
          <span>筛选器区域</span>
          <Switch v-model:checked="localConfig.filter" size="small" />
        </div>
      </div>
    </div>

    <template #footer>
      <Space class="drawer-footer">
        <Button @click="open = false">关闭</Button>
        <Button type="primary" @click="handleReset">恢复默认</Button>
      </Space>
    </template>
  </Drawer>
</template>

<style lang="scss" scoped>
.visibility-settings {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.setting-section {
  .section-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
    font-size: 14px;
    color: hsl(var(--foreground));
    margin-bottom: 12px;
    justify-content: space-between;
  }

  .section-items {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding-left: 24px;
    /* color 由父级继承，Ant Design Checkbox label 自动继承 color，无需 :deep() */
    color: hsl(var(--foreground));
  }
}

.drawer-footer {
  display: flex;
  justify-content: flex-end;
  width: 100%;
}
</style>
