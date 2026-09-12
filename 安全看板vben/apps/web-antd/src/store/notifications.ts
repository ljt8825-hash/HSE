import type { NotificationItem as VbenNotificationItem } from '@vben/layouts';

import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';

import {
  clearNotifications,
  deleteNotification,
  getNotifications,
  getNotificationStats,
  markAllAsRead,
  markAsRead,
  type NotificationsApi,
} from '#/api/hse/notifications';
import { useHseWebSocket } from '#/components/hse/useHseWebSocket';
import { useAccessStore } from '@vben/stores';

/**
 * 业务通知字段 → Vben Notification 组件字段映射
 * 业务侧字段通过 [key: string]: any 透传，便于点击回调使用
 */
function mapToVbenItem(
  item: NotificationsApi.NotificationItem,
): VbenNotificationItem & {
  bizType?: string;
  bizId?: string | number;
  priority?: string;
  type?: string;
  relatedId?: number;
  relatedType?: string;
} {
  // 相对时间格式化（简化版，避免引入 dayjs 依赖）
  const dateStr = formatRelativeTime(item.createdAt);
  // 根据业务类型生成跳转链接
  const link = resolveBizLink(item.bizType, item.relatedId);
  // 头像占位（按优先级着色，无外部依赖）
  const avatar = resolveAvatar(item.priority);
  return {
    id: item.id,
    avatar,
    date: dateStr,
    isRead: item.isRead,
    message: item.content,
    title: item.title,
    link,
    // 业务字段透传
    bizType: item.bizType,
    bizId: item.bizId,
    priority: item.priority,
    type: item.type,
    relatedId: item.relatedId,
    relatedType: item.relatedType,
  };
}

/**
 * 简化版相对时间格式化（不引入新依赖）
 */
function formatRelativeTime(isoDate: string): string {
  if (!isoDate) return '';
  try {
    const now = Date.now();
    const t = new Date(isoDate).getTime();
    if (Number.isNaN(t)) return isoDate;
    const diff = Math.max(0, now - t);
    const min = 60 * 1000;
    const hour = 60 * min;
    const day = 24 * hour;
    if (diff < min) return '刚刚';
    if (diff < hour) return `${Math.floor(diff / min)} 分钟前`;
    if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
    if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`;
    // 超过 7 天显示日期
    const d = new Date(isoDate);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  } catch {
    return isoDate;
  }
}

/**
 * 根据业务类型解析跳转链接
 * 预留与规章制度/应急预案/培训/保险等模块联动
 */
function resolveBizLink(
  bizType?: string,
  relatedId?: number,
): string | undefined {
  if (!bizType || !relatedId) return undefined;
  const map: Record<string, string> = {
    hazard_expired: '/hse/hazards',
    hazard_expiring: '/hse/hazards',
    risk_expired: '/hse/risk-control',
    risk_expiring: '/hse/risk-control',
    insurance_expiring: '/hse/insurance',
    insurance_expired: '/hse/insurance',
    training_expiring: '/hse/training',
    training_expired: '/hse/training',
    emergency_drill: '/hse/emergency',
    regulation_review: '/hse/regulations',
    accident_deadline: '/hse/accidents',
    inspection_overdue: '/hse/inspection',
    workflow_task: '/workflow/tasks',
  };
  return map[bizType] || '/hse/notifications';
}

/**
 * 根据优先级生成头像占位 SVG（避免引入图标依赖）
 */
function resolveAvatar(priority?: string): string {
  const color =
    priority === 'urgent'
      ? '%23f5222d'
      : priority === 'warning'
        ? '%23fa8c16'
        : '%2352c41a';
  // 简单的圆形占位 SVG，data URI 内联
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="${color}"/><text x="20" y="26" font-size="18" fill="white" text-anchor="middle" font-family="sans-serif">HSE</text></svg>`;
  return `data:image/svg+xml;utf8,${svg}`;
}

export const useNotificationStore = defineStore('hse-notification', () => {
  // 最近未读通知列表（已映射为 Vben 格式，最多 5 条）
  const recentList = ref<
    Array<VbenNotificationItem & Record<string, any>>
  >([]);
  // 未读数
  const unreadCount = ref(0);
  // 加载状态
  const loading = ref(false);
  // 统计信息
  const stats = ref<NotificationsApi.NotificationStats | null>(null);
  // 降级轮询定时器
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  // 降级轮询间隔（毫秒），60 秒（WS 失败时降级使用）
  const POLL_INTERVAL = 60 * 1000;
  // 最近 5 条
  const RECENT_LIMIT = 5;

  // WebSocket 客户端实例（延迟初始化，避免 store 初始化时无 accessStore）
  let wsClient: ReturnType<typeof useHseWebSocket> | null = null;
  // WS 消息取消注册函数
  let unregMessage: (() => void) | null = null;
  let unregDegraded: (() => void) | null = null;
  // 实时模式是否已启动
  const realtimeStarted = ref(false);
  // 当前连接状态（connected / connecting / disconnected）
  const wsStatus = ref<'connected' | 'connecting' | 'disconnected'>(
    'disconnected',
  );
  // 是否已降级到轮询
  const isDegraded = ref(false);

  // 是否显示红点
  const hasUnread = computed(() => unreadCount.value > 0);

  /**
   * 拉取最近未读通知（最多 5 条），同时更新未读数
   */
  async function fetchRecent() {
    loading.value = true;
    try {
      const res = await getNotifications({
        page: 1,
        pageSize: RECENT_LIMIT,
        isRead: false,
      });
      const list = res?.list || [];
      recentList.value = list.map(mapToVbenItem);
      unreadCount.value = res?.unreadCount ?? res?.total ?? 0;
      return res;
    } catch (err) {
      console.warn('[NotificationStore] fetchRecent failed:', err);
      // 失败时不清空已有数据，保持上次状态
      return { list: [], total: 0, unreadCount: 0 };
    } finally {
      loading.value = false;
    }
  }

  /**
   * 仅刷新未读数（轻量调用）
   */
  async function fetchUnreadCount() {
    try {
      const res = await getNotifications({
        page: 1,
        pageSize: 1,
        isRead: false,
      });
      unreadCount.value = res?.unreadCount ?? 0;
      return unreadCount.value;
    } catch (err) {
      console.warn('[NotificationStore] fetchUnreadCount failed:', err);
      return 0;
    }
  }

  /**
   * 拉取统计信息（可选）
   */
  async function fetchStats() {
    try {
      const res = await getNotificationStats();
      stats.value = res;
      return res;
    } catch (err) {
      console.warn('[NotificationStore] fetchStats failed:', err);
      stats.value = null;
      return null;
    }
  }

  /**
   * 标记单条已读
   */
  async function markItemRead(id: number | string) {
    // 乐观更新
    const target = recentList.value.find((n) => n.id === id);
    if (target) target.isRead = true;
    if (unreadCount.value > 0) unreadCount.value -= 1;
    try {
      await markAsRead(Number(id));
    } catch (err) {
      console.warn('[NotificationStore] markItemRead failed:', err);
      // 失败时回滚
      if (target) target.isRead = false;
      unreadCount.value += 1;
    }
  }

  /**
   * 全部已读
   */
  async function markAllRead() {
    // 乐观更新
    const previous = recentList.value.map((n) => ({ ...n }));
    recentList.value.forEach((n) => (n.isRead = true));
    const prevCount = unreadCount.value;
    unreadCount.value = 0;
    try {
      await markAllAsRead();
    } catch (err) {
      console.warn('[NotificationStore] markAllRead failed:', err);
      // 失败时回滚
      recentList.value = previous;
      unreadCount.value = prevCount;
    }
  }

  /**
   * 删除单条通知
   */
  async function deleteItem(id: number | string) {
    const previous = recentList.value.slice();
    recentList.value = recentList.value.filter((n) => n.id !== id);
    try {
      await deleteNotification(Number(id));
      // 删除成功后重新拉取未读数
      await fetchUnreadCount();
    } catch (err) {
      console.warn('[NotificationStore] deleteItem failed:', err);
      // 失败时回滚
      recentList.value = previous;
    }
  }

  /**
   * 清空全部通知
   */
  async function clearAll() {
    const previous = recentList.value.slice();
    const prevCount = unreadCount.value;
    recentList.value = [];
    unreadCount.value = 0;
    try {
      await clearNotifications();
    } catch (err) {
      console.warn('[NotificationStore] clearAll failed:', err);
      // 失败时回滚
      recentList.value = previous;
      unreadCount.value = prevCount;
    }
  }

  /**
   * 处理 WebSocket 推送的通知消息
   * 服务端消息格式：{ type: 'NOTIFICATION', timestamp, payload: {...通知字段} }
   */
  function handleWsMessage(msg: {
    type: string;
    timestamp: number;
    payload: Record<string, any>;
  }) {
    if (msg.type !== 'NOTIFICATION' || !msg.payload) return;
    const p = msg.payload;
    // 构造业务侧 NotificationItem（与后端 createNotification 的 payload 对齐）
    const bizItem: NotificationsApi.NotificationItem = {
      id: p.id || Date.now(),
      userId: p.userId || 0,
      title: p.title || '',
      content: p.content || '',
      type: p.type || 'system',
      priority: p.priority || 'normal',
      bizType: p.bizType,
      bizId: p.bizId,
      isRead: false,
      createdAt: p.createdAt || new Date().toISOString(),
      relatedId: p.relatedId,
      relatedType: p.relatedType,
    };
    // 映射为 Vben 格式并插入到列表头部（最多保留 RECENT_LIMIT 条）
    const mapped = mapToVbenItem(bizItem);
    // 去重（避免同 id 重复）
    if (recentList.value.some((n) => n.id === mapped.id)) return;
    recentList.value = [mapped, ...recentList.value].slice(0, RECENT_LIMIT);
    unreadCount.value += 1;
  }

  /**
   * 启动降级轮询（WS 失败时使用，60 秒间隔）
   */
  function startPolling() {
    stopPolling();
    // 首次立即拉取
    fetchRecent();
    pollTimer = setInterval(() => {
      fetchRecent();
    }, POLL_INTERVAL);
  }

  /**
   * 停止降级轮询
   */
  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  /**
   * 启动实时模式：WebSocket 优先，失败降级到 60 秒轮询
   * 组件 onMounted 时调用，重复调用会先清理旧连接
   */
  function startRealtime() {
    if (realtimeStarted.value) return;
    realtimeStarted.value = true;

    // 首次立即拉取一次，保证页面加载时有数据（WS 建立前的过渡）
    fetchRecent();

    // 延迟初始化 WebSocket 客户端（此时 accessStore 已就绪）
    try {
      wsClient = useHseWebSocket();
      // 同步连接状态到 store
      const unregStatus = wsClient.onStatus((s) => {
        wsStatus.value = s;
      });
      // 注册消息处理器
      unregMessage = wsClient.onMessage(handleWsMessage);
      // 注册降级回调：WS 连续失败 3 次后切换到轮询
      unregDegraded = wsClient.onDegraded(() => {
        isDegraded.value = true;
        console.warn('[NotificationStore] WebSocket 降级到 60 秒轮询');
        startPolling();
      });
      // 保留 unregStatus 引用避免被回收（在 stopRealtime 中清理）
      (wsClient as any)._unregStatus = unregStatus;
      // 发起连接
      wsClient.connect();

      // 监听 accessToken 变化，token 刷新后自动重新连接
      const accessStore = useAccessStore();
      let previousToken = accessStore.accessToken;
      const tokenWatcher = watch(
        () => accessStore.accessToken,
        (newToken) => {
          if (newToken && newToken !== previousToken) {
            console.log('[NotificationStore] Token 已刷新，尝试重新连接 WebSocket');
            previousToken = newToken;
            if (wsClient) {
              wsClient.disconnect();
              setTimeout(() => {
                wsClient?.connect();
              }, 500);
            }
          }
        },
        { immediate: false },
      );
      (wsClient as any)._tokenWatcher = tokenWatcher;
    } catch (err) {
      console.warn('[NotificationStore] WebSocket 初始化失败，直接降级到轮询:', err);
      isDegraded.value = true;
      startPolling();
    }
  }

  /**
   * 停止实时模式：关闭 WS + 清理轮询
   * 组件 onUnmounted 时调用，避免内存泄漏
   */
  function stopRealtime() {
    realtimeStarted.value = false;
    // 清理 WS
    if (unregMessage) {
      unregMessage();
      unregMessage = null;
    }
    if (unregDegraded) {
      unregDegraded();
      unregDegraded = null;
    }
    if (wsClient) {
      const unregStatus = (wsClient as any)._unregStatus;
      if (typeof unregStatus === 'function') unregStatus();
      const tokenWatcher = (wsClient as any)._tokenWatcher;
      if (typeof tokenWatcher === 'function') tokenWatcher();
      wsClient.disconnect();
      wsClient = null;
    }
    // 清理轮询
    stopPolling();
    wsStatus.value = 'disconnected';
    isDegraded.value = false;
  }

  function $reset() {
    stopRealtime();
    recentList.value = [];
    unreadCount.value = 0;
    loading.value = false;
    stats.value = null;
  }

  return {
    // state
    recentList,
    unreadCount,
    loading,
    stats,
    wsStatus,
    isDegraded,
    realtimeStarted,
    // getters
    hasUnread,
    // actions
    fetchRecent,
    fetchUnreadCount,
    fetchStats,
    markItemRead,
    markAllRead,
    deleteItem,
    clearAll,
    // 实时模式（WebSocket + 降级轮询）
    startRealtime,
    stopRealtime,
    // 兼容旧接口（仅内部使用，外部应使用 startRealtime/stopRealtime）
    startPolling,
    stopPolling,
    $reset,
  };
});
