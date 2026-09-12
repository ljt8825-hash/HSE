<script lang="ts" setup>
import type { VNode } from 'vue';

import { computed, onMounted, ref } from 'vue';

import { useSortable } from '@vben/hooks';

import { Row } from 'ant-design-vue';

interface Props {
  pageKey: string;
}

const props = defineProps<Props>();

const storageKey = computed(() => `stat-cards:${props.pageKey}`);
const rowRef = ref<HTMLElement | null>(null);

// 从 localStorage 加载顺序
const savedOrder = ref<string[]>([]);

function loadOrder() {
  try {
    const raw = localStorage.getItem(storageKey.value);
    if (raw) {
      const parsed = JSON.parse(raw);
      savedOrder.value = Array.isArray(parsed) ? parsed : [];
    }
  } catch {
    savedOrder.value = [];
  }
}

function saveOrder(order: string[]) {
  try {
    localStorage.setItem(storageKey.value, JSON.stringify(order));
  } catch {
    // ignore
  }
}

// 监听子元素变化，按 savedOrder 重新排序 DOM
const slots = defineSlots<{
  default(): VNode[];
}>();

// 初始化 sortable
onMounted(async () => {
  loadOrder();

  await new Promise((r) => setTimeout(r, 200));

  // ref 绑定在 antd <Row> 组件上，拿到的是组件实例，需取 $el 才是真实 DOM
  const rowEl = (rowRef.value as any)?.$el as HTMLElement | undefined;
  if (!rowEl) return;

  // 如果本地有保存的顺序，先重排 DOM
  if (savedOrder.value.length > 0) {
    const children = Array.from(rowEl.children) as HTMLElement[];
    const orderMap = new Map(savedOrder.value.map((k, i) => [k, i]));
    children.sort((a, b) => {
      const ai = orderMap.get(a.dataset.statKey || '') ?? Infinity;
      const bi = orderMap.get(b.dataset.statKey || '') ?? Infinity;
      return ai - bi;
    });
    children.forEach((child) => rowEl.appendChild(child));
  }

  const { initializeSortable } = useSortable(rowEl, {
    draggable: '.sortable-stat-col',
    animation: 300,
    delay: 0,
    onEnd: () => {
      const el = (rowRef.value as any)?.$el as HTMLElement | undefined;
      if (!el) return;
      const keys = Array.from(el.children).map(
        (child) => (child as HTMLElement).dataset.statKey || '',
      );
      savedOrder.value = keys;
      saveOrder(keys);
    },
  });

  await initializeSortable();
});

// 暴露方法供父组件重置
function resetOrder() {
  savedOrder.value = [];
  try {
    localStorage.removeItem(storageKey.value);
  } catch {
    // ignore
  }
  window.location.reload();
}

defineExpose({ resetOrder });
</script>

<template>
  <Row ref="rowRef" :gutter="[16, 16]" class="sortable-stat-row mb-4">
    <slot />
  </Row>
</template>

<style lang="scss" scoped>
.sortable-stat-row {
  :slotted(.sortable-stat-col) {
    cursor: grab;

    &:active {
      cursor: grabbing;
    }
  }

  :slotted(.sortable-ghost) {
    opacity: 0.4;
    background: hsl(var(--muted) / 0.3);
    border: 2px dashed hsl(var(--primary));
    border-radius: 8px;
  }

  :slotted(.sortable-drag) {
    opacity: 0.9;
  }
}
</style>
