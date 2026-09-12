<template>
  <Tooltip title="帮助">
    <Button
      type="text"
      size="small"
      class="help-button"
      @click="handleClick"
    >
      <template #icon>
        <IconifyIcon icon="lucide:circle-help" :size="18" />
      </template>
    </Button>
  </Tooltip>
  <HelpPanel
    v-model:visible="panelVisible"
    :menu-code="menuCode"
    @close="panelVisible = false"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { Button, Tooltip } from 'ant-design-vue';
import { IconifyIcon } from '@vben/icons';
import HelpPanel from './HelpPanel.vue';

interface Props {
  menuCode: string;
}

const props = defineProps<Props>();

const panelVisible = ref(false);

function handleClick() {
  panelVisible.value = true;
}
</script>

<style lang="less" scoped>
.help-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border-radius: 50%;
  color: hsl(var(--muted-foreground));
  transition: all 0.2s ease;

  &:hover {
    background: hsl(var(--muted));
    color: hsl(var(--foreground));
  }
}
</style>
