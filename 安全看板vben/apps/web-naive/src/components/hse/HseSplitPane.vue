<script lang="ts" setup>
/**
 * HseSplitPane —— HSE 双列布局公共组件（阶段05）
 *
 * 设计（01-强制设计约束.md 第 6 节）：
 * - 桌面：左栏默认 280px，可拖动 220px-420px；右侧自适应，不产生页面级横向溢出。
 * - 拖动仅作用于页面中间分隔条，不改变 Vben 全局侧栏宽度；不恢复表格列宽/列顺序拖动。
 * - 使用 Pointer Events；拖动中禁止文本选择；松开 / 失焦 / 组件卸载正确清理监听。
 * - 左栏宽度仅保存到当前浏览器 localStorage（稳定、页面维度明确的 key），不同步上传。
 * - <768px：左栏自动成为 Naive NDrawer，由带 Lucide 图标 + tooltip 的按钮打开；右侧始终可用。
 * - 分隔条可聚焦：role="separator"、aria-label、左右方向键小步调整、Home/End 调至最小/最大。
 * - 全部使用 HSE 主题令牌（CSS 变量），亮暗主题一致；不在页面散落硬编码语义色。
 */
import {
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  computed,
} from 'vue';

import { NDrawer, NDrawerContent, NButton, NTooltip } from 'naive-ui';
import { PanelLeft } from '@vben/icons';

/** 左栏宽度范围 */
const MIN_W = 220;
const MAX_W = 420;
const DEFAULT_W = 280;
/** 键盘小步调整步长 */
const KEY_STEP = 16;

const props = withDefaults(
  defineProps<{
    /** 左栏标题（移动端抽屉标题） */
    title?: string;
    /** localStorage key（稳定、页面维度明确，如 'hse-dept-split-width'） */
    storageKey?: string;
    /** 左栏初始宽度（未保存偏好时生效） */
    defaultWidth?: number;
  }>(),
  {
    title: '',
    storageKey: 'hse-split-width',
    defaultWidth: DEFAULT_W,
  },
);

const emit = defineEmits<{
  (e: 'update:width', width: number): void;
}>();

// ==================== 宽度状态 ====================
const leftWidth = ref(DEFAULT_W);
const isDragging = ref(false);
const isMobile = ref(false);

// 校验 localStorage 中保存的宽度是否在合法范围内
function readStoredWidth(): number {
  try {
    const raw = localStorage.getItem(props.storageKey);
    if (!raw) return props.defaultWidth;
    const n = Number(raw);
    if (Number.isNaN(n)) return props.defaultWidth;
    return Math.min(MAX_W, Math.max(MIN_W, n));
  } catch {
    return props.defaultWidth;
  }
}

function persistWidth(w: number) {
  try {
    localStorage.setItem(props.storageKey, String(Math.round(w)));
  } catch {
    /* localStorage 不可用时静默忽略 */
  }
}

// ==================== 响应式（<768px 转抽屉） ====================
const mql = typeof window !== 'undefined' ? window.matchMedia('(max-width: 767.98px)') : null;

function syncIsMobile(_e?: MediaQueryListEvent) {
  isMobile.value = mql ? mql.matches : false;
}

// 移动端抽屉状态
const mobileDrawerOpen = ref(false);

const computedLeftWidth = computed(() => leftWidth.value);

// ==================== Pointer Events 拖动 ====================
let dragPointerId: number | null = null;

function onSeparatorPointerDown(e: PointerEvent) {
  if (isMobile.value) return;
  e.preventDefault();
  isDragging.value = true;
  dragPointerId = e.pointerId;
  // 拖动中禁止文本选择
  document.body.classList.add('hse-split-no-select');
  document.body.style.userSelect = 'none';
  (e.currentTarget as HTMLElement)?.setPointerCapture?.(e.pointerId);
}

function onSeparatorPointerMove(e: PointerEvent) {
  if (!isDragging.value || e.pointerId !== dragPointerId) return;
  e.preventDefault();
  const container = containerRef.value;
  if (!container) return;
  const rect = container.getBoundingClientRect();
  const delta = e.clientX - rect.left;
  leftWidth.value = Math.min(MAX_W, Math.max(MIN_W, delta));
  emit('update:width', leftWidth.value);
}

function onSeparatorPointerUp(e: PointerEvent) {
  if (e.pointerId !== dragPointerId) return;
  isDragging.value = false;
  dragPointerId = null;
  document.body.classList.remove('hse-split-no-select');
  document.body.style.userSelect = '';
  persistWidth(leftWidth.value);
}

// ==================== 键盘操作（分隔条可聚焦） ====================
function onSeparatorKeydown(e: KeyboardEvent) {
  const key = e.key;
  if (key === 'ArrowLeft') {
    e.preventDefault();
    leftWidth.value = Math.max(MIN_W, leftWidth.value - KEY_STEP);
  } else if (key === 'ArrowRight') {
    e.preventDefault();
    leftWidth.value = Math.min(MAX_W, leftWidth.value + KEY_STEP);
  } else if (key === 'Home') {
    e.preventDefault();
    leftWidth.value = MIN_W;
  } else if (key === 'End') {
    e.preventDefault();
    leftWidth.value = MAX_W;
  } else {
    return;
  }
  persistWidth(leftWidth.value);
  emit('update:width', leftWidth.value);
}

// ==================== 失焦 / 卸载清理 ====================
function onSeparatorBlur() {
  if (isDragging.value) {
    isDragging.value = false;
    dragPointerId = null;
    document.body.classList.remove('hse-split-no-select');
    document.body.style.userSelect = '';
    persistWidth(leftWidth.value);
  }
}

function cleanupDrag() {
  isDragging.value = false;
  dragPointerId = null;
  document.body.classList.remove('hse-split-no-select');
  document.body.style.userSelect = '';
}

const containerRef = ref<HTMLElement | null>(null);

watch(
  () => props.defaultWidth,
  (v) => {
    // 仅当无已保存偏好时应用 defaultWidth（readStoredWidth 已处理）
    if (!localStorage.getItem(props.storageKey) && v) {
      leftWidth.value = Math.min(MAX_W, Math.max(MIN_W, v));
    }
  },
);

onMounted(() => {
  leftWidth.value = readStoredWidth();
  syncIsMobile();
  mql?.addEventListener('change', syncIsMobile);
  // 窗口失焦时兜底清理拖动状态
  window.addEventListener('blur', cleanupDrag);
});

onBeforeUnmount(() => {
  cleanupDrag();
  mql?.removeEventListener('change', syncIsMobile);
  window.removeEventListener('blur', cleanupDrag);
});
</script>

<template>
  <!-- 桌面双列 -->
  <div
    v-if="!isMobile"
    ref="containerRef"
    class="hse-split-pane"
    :class="{ 'hse-split-dragging': isDragging }"
  >
    <aside
      class="hse-split-left"
      :style="{ width: `${computedLeftWidth}px`, flexBasis: `${computedLeftWidth}px` }"
    >
      <div class="hse-split-left-inner">
        <slot name="left" />
      </div>
    </aside>

    <!-- 分隔条：可聚焦，键盘可操作 -->
    <div
      class="hse-split-separator"
      role="separator"
      tabindex="0"
      :aria-label="title || '调整左右栏宽度'"
      aria-orientation="vertical"
      :aria-valuenow="computedLeftWidth"
      :aria-valuemin="MIN_W"
      :aria-valuemax="MAX_W"
      @pointerdown="onSeparatorPointerDown"
      @pointermove="onSeparatorPointerMove"
      @pointerup="onSeparatorPointerUp"
      @pointercancel="onSeparatorPointerUp"
      @keydown="onSeparatorKeydown"
      @blur="onSeparatorBlur"
    >
      <span class="hse-split-grip" aria-hidden="true"></span>
    </div>

    <main class="hse-split-right">
      <slot name="right" />
    </main>
  </div>

  <!-- 移动端：左栏转抽屉，右侧始终可用 -->
  <div v-else class="hse-split-pane hse-split-mobile">
    <NTooltip :disabled="false">
      <template #trigger>
        <NButton
          class="hse-split-mobile-trigger"
          type="primary"
          secondary
          size="small"
          aria-label="打开目录"
          @click="mobileDrawerOpen = true"
        >
          <template #icon>
            <PanelLeft class="size-4" />
          </template>
        </NButton>
      </template>
      打开目录
    </NTooltip>

    <NDrawer v-model:show="mobileDrawerOpen" :width="320" placement="left">
      <NDrawerContent :title="title || '目录'" closable>
        <slot name="left" />
      </NDrawerContent>
    </NDrawer>

    <main class="hse-split-right">
      <slot name="right" />
    </main>
  </div>
</template>

<style scoped>
.hse-split-pane {
  display: flex;
  align-items: stretch;
  width: 100%;
  min-width: 0;
  gap: 0;
  height: 100%;
}

.hse-split-left {
  flex-shrink: 0;
  min-width: 0;
  height: 100%;
  overflow: hidden;
  transition: width 0.15s ease;
}

.hse-split-dragging .hse-split-left {
  transition: none;
}

.hse-split-left-inner {
  height: 100%;
  overflow: auto;
}

.hse-split-separator {
  flex-shrink: 0;
  width: 6px;
  cursor: col-resize;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  outline: none;
  touch-action: none;
  position: relative;
  z-index: 10;
}

.hse-split-separator:hover .hse-split-grip,
.hse-split-separator:focus-visible .hse-split-grip,
.hse-split-dragging .hse-split-grip {
  background: hsl(var(--primary) / 0.85);
  box-shadow: 0 0 0 1px hsl(var(--primary) / 0.2);
}

.hse-split-grip {
  width: 3px;
  height: 48px;
  border-radius: 2px;
  background: hsl(var(--border));
  transition: background 0.15s ease;
}

.hse-split-right {
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  overflow: hidden;
}

.hse-split-mobile {
  position: relative;
}

.hse-split-mobile-trigger {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 20;
}
</style>
