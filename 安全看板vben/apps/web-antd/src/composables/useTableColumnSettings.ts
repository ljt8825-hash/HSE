import type { Ref } from 'vue';

import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';

import { useSortable } from '@vben/hooks';

interface ColumnSetting {
  order: string[];
  widths: Record<string, number>;
}

// 拖拽手柄图标（lucide:grip-vertical），以原生 SVG 注入，避免依赖 Vue 组件渲染时序
const GRIP_SVG = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>`;

const GLOBAL_STYLE_ID = 'hse-col-drag-style';

function ensureGlobalStyle() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(GLOBAL_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = GLOBAL_STYLE_ID;
  style.textContent = `
    .col-drag-handle {
      display: inline-flex;
      vertical-align: middle;
      margin-right: 8px;
      cursor: grab;
      color: hsl(var(--foreground));
      opacity: 0.4;
      transition: opacity 0.15s ease, transform 0.15s ease;
      user-select: none;
    }
    .ant-table-thead th.ant-table-cell:hover .col-drag-handle {
      opacity: 1;
    }
    .col-drag-handle:active {
      cursor: grabbing;
      transform: scale(1.1);
    }
    .col-resize-handle:hover {
      background: hsl(var(--primary));
    }
  `;
  document.head.appendChild(style);
}

export function useTableColumnSettings<T extends { key: string; [key: string]: any }>(
  originalColumns: Ref<T[]>,
  pageKey: string,
) {
  const storageKey = `table-columns:${pageKey}`;

  const columnOrder = ref<string[]>([]);
  const columnWidths = ref<Record<string, number>>({});
  const isReady = ref(false);
  const sortableInstance = ref<any>(null);

  let dragObserver: MutationObserver | null = null;
  let rescheduleTimer: number | null = null;
  let isDragging = false;

  // 从 localStorage 加载
  function loadSettings() {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved: ColumnSetting = JSON.parse(raw);
        columnOrder.value = saved.order || [];
        columnWidths.value = saved.widths || {};
      }
    } catch {
      // ignore
    }
  }

  // 保存到 localStorage
  function saveSettings() {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          order: columnOrder.value,
          widths: columnWidths.value,
        }),
      );
    } catch {
      // ignore
    }
  }

  // 处理后的 columns
  const columns = ref<T[]>([]) as Ref<T[]>;

  function computeColumns() {
    const source = [...originalColumns.value];

    // 给每个 column 添加 customHeaderCell，用于 DOM 映射
    const withAttrs = source.map((col) => ({
      ...col,
      customHeaderCell: () => ({
        'data-col-key': col.key,
        style: columnWidths.value[col.key]
          ? { width: `${columnWidths.value[col.key]}px`, minWidth: `${columnWidths.value[col.key]}px` }
          : undefined,
      }),
    }));

    // 应用顺序
    if (columnOrder.value.length > 0) {
      const orderMap = new Map(columnOrder.value.map((k, i) => [k, i]));
      withAttrs.sort((a, b) => {
        const ai = orderMap.get(a.key) ?? Infinity;
        const bi = orderMap.get(b.key) ?? Infinity;
        return ai - bi;
      });
    }

    columns.value = withAttrs;
  }

  watch([originalColumns, columnOrder, columnWidths], computeColumns, { deep: true, immediate: true });

  // 给表头每个 th 注入可见拖拽手柄
  function injectGrips(tr: HTMLElement) {
    const ths = tr.querySelectorAll<HTMLElement>('th.ant-table-cell');
    ths.forEach((th) => {
      if (th.querySelector('.col-drag-handle')) return;
      const grip = document.createElement('span');
      grip.className = 'col-drag-handle';
      grip.setAttribute('title', '按住拖拽调整列顺序');
      grip.innerHTML = GRIP_SVG;
      const target = th.querySelector('.ant-table-cell-content') || th;
      target.insertBefore(grip, target.firstChild);
      th.style.position = 'relative';
    });
  }

  // 给表头每个 th 注入列宽调整手柄
  function injectResizeHandles(tr: HTMLElement) {
    const ths = tr.querySelectorAll<HTMLElement>('th.ant-table-cell');

    ths.forEach((th) => {
      if (th.querySelector('.col-resize-handle')) return;

      const key = th.dataset.colKey;
      if (!key) return;

      const handle = document.createElement('div');
      handle.className = 'col-resize-handle';
      handle.style.cssText =
        'position:absolute;right:0;top:0;bottom:0;width:6px;cursor:col-resize;z-index:1;';
      th.style.position = 'relative';
      th.appendChild(handle);

      handle.addEventListener('mousedown', (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const startX = e.pageX;
        const startWidth = th.getBoundingClientRect().width;

        const onMouseMove = (moveEvt: MouseEvent) => {
          const newWidth = Math.max(60, startWidth + moveEvt.pageX - startX);
          th.style.width = `${newWidth}px`;
          th.style.minWidth = `${newWidth}px`;
        };

        const onMouseUp = (upEvt: MouseEvent) => {
          const finalWidth = Math.max(60, startWidth + upEvt.pageX - startX);
          columnWidths.value = { ...columnWidths.value, [key]: finalWidth };
          saveSettings();
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      });
    });
  }

  async function setupTableFeatures(tableEl: HTMLElement) {
    if (!tableEl || !tableEl.isConnected) return;

    // 清理旧实例与观察者（避免重复绑定 / 内存泄漏）
    if (sortableInstance.value) {
      try {
        sortableInstance.value.destroy();
      } catch {
        // ignore
      }
      sortableInstance.value = null;
    }
    if (dragObserver) {
      dragObserver.disconnect();
      dragObserver = null;
    }

    await nextTick();
    await new Promise((r) => requestAnimationFrame(() => r(null)));

    const thead = tableEl.querySelector('.ant-table-thead');
    if (!thead) {
      // 等待 thead 出现
      const observer = new MutationObserver((_m, obs) => {
        if (tableEl.querySelector('.ant-table-thead')) {
          obs.disconnect();
          setupTableFeatures(tableEl);
        }
      });
      observer.observe(tableEl, { childList: true, subtree: true });
      return;
    }

    const tr = thead.querySelector('tr');
    if (!tr) {
      const observer = new MutationObserver((_m, obs) => {
        if (thead.querySelector('tr')) {
          obs.disconnect();
          setupTableFeatures(tableEl);
        }
      });
      observer.observe(thead, { childList: true, subtree: true });
      return;
    }

    ensureGlobalStyle();
    injectGrips(tr);
    injectResizeHandles(tr);

    try {
      const { initializeSortable } = useSortable(tr as HTMLElement, {
        draggable: 'th.ant-table-cell',
        handle: '.col-drag-handle',
        animation: 200,
        delay: 0,
        onStart: () => {
          // 拖拽进行中：暂停观察者，避免 sortable 移动 th 触发重建导致 onEnd 丢失
          isDragging = true;
        },
        onEnd: () => {
          isDragging = false;
          const ths = tr.querySelectorAll('th.ant-table-cell');
          const keys: string[] = [];
          ths.forEach((th) => {
            const key = (th as HTMLElement).dataset.colKey;
            if (key) keys.push(key);
          });
          // 更新顺序并持久化；列顺序变化会触发表格重渲染，
          // 由下方 MutationObserver 重新注入手柄并重建 sortable
          columnOrder.value = keys;
          saveSettings();
        },
      });

      sortableInstance.value = await initializeSortable();
    } catch (err) {
      console.error('[useTableColumnSettings] sortable init FAILED:', err);
    }

    // 监听表格 DOM 变化（数据刷新 / 列顺序变化 / antd 重渲染），
    // 自动重建拖拽与手柄，避免重渲染后拖拽失效。
    // 注意：拖拽进行中（isDragging）不响应，否则会打断 onEnd。
    dragObserver = new MutationObserver(() => {
      if (isDragging) return;
      if (dragObserver) {
        dragObserver.disconnect();
        dragObserver = null;
      }
      // 合并同帧多次变更，避免抖动
      if (rescheduleTimer) {
        clearTimeout(rescheduleTimer);
      }
      rescheduleTimer = window.setTimeout(() => {
        rescheduleTimer = null;
        setupTableFeatures(tableEl);
      }, 60);
    });
    dragObserver.observe(tableEl, { childList: true, subtree: true });
  }

  async function ensureFeatures(tableEl: HTMLElement) {
    if (!tableEl || !tableEl.isConnected) return;
    if (sortableInstance.value) return; // 已初始化，避免重复
    await setupTableFeatures(tableEl);
  }

  function initSortable(tableEl: HTMLElement) {
    return ensureFeatures(tableEl);
  }

  function initResizable(tableEl: HTMLElement) {
    return ensureFeatures(tableEl);
  }

  onMounted(() => {
    loadSettings();
    isReady.value = true;
  });

  onUnmounted(() => {
    if (sortableInstance.value) {
      try {
        sortableInstance.value.destroy();
      } catch {
        // ignore
      }
      sortableInstance.value = null;
    }
    if (dragObserver) {
      dragObserver.disconnect();
      dragObserver = null;
    }
    if (rescheduleTimer) {
      clearTimeout(rescheduleTimer);
      rescheduleTimer = null;
    }
  });

  return {
    columns,
    columnOrder,
    columnWidths,
    initSortable,
    initResizable,
    isReady,
  };
}
