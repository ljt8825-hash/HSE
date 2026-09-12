/**
 * HSE WebSocket 客户端 Composable
 *
 * 职责：
 * - 建立与后端 /ws 的 WebSocket 连接（携带 JWT token）
 * - 指数退避自动重连（1s → 2s → 4s → 8s → 最大 30s）
 * - 心跳保活（依赖服务端 30 秒协议级 ping，浏览器自动响应 pong）
 * - 消息分发（通过 onMessage 注册回调）
 * - 连接状态暴露（connected/connecting/disconnected）
 * - 连续失败 3 次后触发降级（onDegraded 回调）
 * - 认证失败后延迟重连（等待 token 刷新）
 *
 * 复用浏览器原生 WebSocket API，不引入新依赖。
 * 服务端实现见 server/services/wsServer.js
 */

import { onBeforeUnmount, ref } from 'vue';

import { useAccessStore } from '@vben/stores';
import { publishEmployeeEvent } from '#/composables/hse/useEmployeeEvent';
import type { EmployeeEventEnvelope } from '#/composables/hse/types';

/** WebSocket 连接状态 */
export type WsStatus = 'connected' | 'connecting' | 'disconnected';

/** 服务端消息格式（与 wsServer.js 对齐） */
export interface WsMessage {
  type: string;
  timestamp: number;
  payload: Record<string, any>;
}

/** 降级触发阈值：连续失败次数 */
const DEGRADE_THRESHOLD = 3;
/** 初始重连延迟（毫秒） */
const INITIAL_RETRY = 1000;
/** 最大重连延迟（毫秒） */
const MAX_RETRY = 30_000;
/** 认证失败后延迟重连时间（毫秒），等待 token 刷新 */
const AUTH_FAIL_RETRY_DELAY = 10_000;

/**
 * 脱敏显示 token（仅显示前 8 位和后 8 位）
 */
function maskToken(token: string): string {
  if (!token) return 'null';
  if (token.length <= 16) return `${token.slice(0, 4)}***${token.slice(-4)}`;
  return `${token.slice(0, 8)}***${token.slice(-8)}`;
}

/**
 * 解析 WebSocket URL
 * - 开发环境：通过 Vite 代理 /ws → ws://localhost:5666/ws
 * - 生产环境：相对路径 /ws → wss:// 或 ws:// 当前主机
 */
function resolveWsUrl(token: string): string {
  const { protocol, host } = window.location;
  const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';
  return `${wsProtocol}//${host}/ws?token=${encodeURIComponent(token)}`;
}

export function useHseWebSocket() {
  // 连接状态
  const status = ref<WsStatus>('disconnected');
  // 当前重连次数
  const retryCount = ref(0);
  // 是否已降级到轮询
  const degraded = ref(false);

  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let consecutiveFailures = 0;
  let manuallyClosed = false;

  // ===== 轮询兜底（提示词-42 Task B）：WS 不可用时每 30s 增量拉取员工事件 =====
  const POLL_INTERVAL_MS = 30_000; // 30s
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  // 轮询游标（epoch ms）：首次轮询拉取最近 60s 事件，避免遗漏 WS 断开瞬间事件
  let pollCursorMs = Date.now() - 60_000;

  // 消息回调集合
  const messageHandlers = new Set<(msg: WsMessage) => void>();
  // 状态变化回调
  const statusHandlers = new Set<(s: WsStatus) => void>();
  // 降级回调
  const degradedHandlers = new Set<() => void>();

  function setStatus(s: WsStatus) {
    status.value = s;
    statusHandlers.forEach((h) => h(s));
  }

  /**
   * 注册消息回调
   * @returns 取消注册函数
   */
  function onMessage(handler: (msg: WsMessage) => void): () => void {
    messageHandlers.add(handler);
    return () => messageHandlers.delete(handler);
  }

  /**
   * 注册状态变化回调
   */
  function onStatus(handler: (s: WsStatus) => void): () => void {
    statusHandlers.add(handler);
    return () => statusHandlers.delete(handler);
  }

  /**
   * 注册降级回调（连续失败 3 次时触发一次）
   */
  function onDegraded(handler: () => void): () => void {
    degradedHandlers.add(handler);
    return () => degradedHandlers.delete(handler);
  }

  /**
   * 计算指数退避延迟
   */
  function getRetryDelay(): number {
    const delay = Math.min(
      INITIAL_RETRY * 2 ** retryCount.value,
      MAX_RETRY,
    );
    return delay;
  }

  /**
   * 安排下一次重连
   */
  function scheduleReconnect() {
    if (manuallyClosed) return;
    if (degraded.value) return; // 已降级，不再重连

    const delay = getRetryDelay();
    retryCount.value += 1;
    console.warn(
      `[HseWebSocket] 将在 ${delay}ms 后重连（第 ${retryCount.value} 次）`,
    );

    reconnectTimer = setTimeout(() => {
      connect();
    }, delay);
  }

  /**
   * 建立连接
   */
  function connect() {
    if (manuallyClosed) {
      console.debug('[HseWebSocket] 手动关闭状态，跳过连接');
      return;
    }
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      console.debug('[HseWebSocket] 已有活跃连接，跳过连接');
      return;
    }

    const accessStore = useAccessStore();
    const token = accessStore.accessToken;
    if (!token) {
      console.warn('[HseWebSocket] 无 accessToken，跳过连接');
      return;
    }

    const wsUrl = resolveWsUrl(token);
    console.info('[HseWebSocket] 开始建立连接', {
      wsUrl: `${wsUrl.split('?')[0]}?token=***`,
      tokenMasked: maskToken(token),
      tokenLength: token.length,
      retryCount: retryCount.value,
    });
    setStatus('connecting');

    try {
      ws = new WebSocket(wsUrl);
    } catch (err) {
      console.error('[HseWebSocket] 创建连接失败:', err);
      handleFailure();
      return;
    }

    ws.onopen = () => {
      console.log('[HseWebSocket] 连接成功');
      setStatus('connected');
      retryCount.value = 0;
      consecutiveFailures = 0;
      degraded.value = false;
      stopPolling(); // WS 恢复，停止轮询兜底，回归 WS 事件驱动（B-5）
    };

    ws.onmessage = (event) => {
      try {
        const msg: WsMessage = JSON.parse(event.data);
        if (msg.type === 'PONG') {
          // 心跳响应，不打印日志避免刷屏
          return;
        }
        console.debug('[HseWebSocket] 收到消息', { type: msg.type });
        if (msg.type === 'AUTH_SUCCESS') {
          console.log('[HseWebSocket] 认证成功:', msg.payload?.message);
        }
        if (msg.type === 'AUTH_FAIL') {
          console.warn('[HseWebSocket] 服务端认证失败:', msg.payload?.message);
        }
        // R1-Phase1 任务 C：后端员工事件（双层包裹）转发到进程内事件总线
        // 服务端格式：{ type: 'NOTIFICATION', payload: { type: 'EMPLOYEE_EVENT', event: { type, employeeId, ... } } }
        // 防御性解析 + try/catch 隔离，避免单条异常事件阻断整个 WS 消息流。
        if (msg.type === 'NOTIFICATION' && msg.payload?.type === 'EMPLOYEE_EVENT') {
          try {
            const event = msg.payload?.event as EmployeeEventEnvelope | undefined;
            if (event && event.type && typeof event.employeeId !== 'undefined') {
              publishEmployeeEvent(event);
            }
          } catch (err) {
            console.error('[HseWebSocket] 处理 EMPLOYEE_EVENT 失败:', err);
          }
        }
        messageHandlers.forEach((h) => h(msg));
      } catch (err) {
        console.warn('[HseWebSocket] 解析消息失败:', err);
      }
    };

    ws.onerror = (err) => {
      console.warn('[HseWebSocket] 连接错误:', err);
      startPolling(); // WS 出错，启动轮询兜底（B-3）
    };

    ws.onclose = (event) => {
      setStatus('disconnected');

      console.info('[HseWebSocket] 连接关闭', {
        code: event.code,
        reason: event.reason || '(无)',
        wasClean: event.wasClean,
      });

      if (manuallyClosed) {
        console.debug('[HseWebSocket] 手动关闭，不重连');
        return;
      }

      if (event.code === 4001) {
        console.warn('[HseWebSocket] 认证失败，等待 token 刷新后重连');
        consecutiveFailures += 1;
        if (consecutiveFailures >= DEGRADE_THRESHOLD && !degraded.value) {
          degraded.value = true;
          console.warn(`[HseWebSocket] 连续认证失败 ${consecutiveFailures} 次，降级到轮询模式`);
          degradedHandlers.forEach((h) => h());
          startPolling(); // 认证持续失败，启动轮询兜底
        } else {
          reconnectTimer = setTimeout(() => {
            const newToken = useAccessStore().accessToken;
            if (newToken && newToken !== token) {
              console.log('[HseWebSocket] token 已更新，重新连接');
              retryCount.value = 0;
            }
            connect();
          }, AUTH_FAIL_RETRY_DELAY);
        }
        return;
      }

      handleFailure();
    };
  }

  /**
   * 处理连接失败：累计失败次数，触发降级或重连
   */
  function handleFailure() {
    consecutiveFailures += 1;
    if (consecutiveFailures >= DEGRADE_THRESHOLD && !degraded.value) {
      degraded.value = true;
      console.warn(
        `[HseWebSocket] 连续失败 ${consecutiveFailures} 次，降级到轮询模式`,
      );
      degradedHandlers.forEach((h) => h());
      startPolling(); // 连续失败达阈值，启动轮询兜底
      return;
    }
    scheduleReconnect();
  }

  /**
   * 主动关闭连接（不再重连）
   */
  function disconnect() {
    manuallyClosed = true;
    stopPolling(); // 主动关闭：停止轮询兜底
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (ws) {
      try {
        ws.close(1000, '客户端主动关闭');
      } catch {
        // 忽略关闭错误
      }
      ws = null;
    }
    setStatus('disconnected');
  }

  /**
   * 重置降级状态并尝试重新连接（用于网络恢复后从轮询切回 WS）
   */
  function resetDegraded() {
    degraded.value = false;
    consecutiveFailures = 0;
    retryCount.value = 0;
    manuallyClosed = false;
    connect();
  }

  // ===== 轮询兜底实现（提示词-42 Task B）=====
  /**
   * HTTP 轮询兜底：WS 断开时每 30s 拉取增量员工事件，转发到进程内事件总线。
   * 与 WS 事件通过 useEmployeeEvent 的 dedupKeys（type:employeeId:occurredAt，10s TTL）自动去重，
   * 因此轮询与 WS 重复事件不会触发重复刷新（B-8）。
   * 端点位于 /api 之下，受全局 authMiddleware 保护，故必须携带 JWT；失败静默，不阻塞 UI（B-6）。
   */
  async function pollEmployeeEvents() {
    try {
      const token = useAccessStore().accessToken;
      const res = await fetch(
        `/api/hse/employee/events?since=${encodeURIComponent(String(pollCursorMs))}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (!res.ok) return;
      const body = await res.json();
      const events = (body?.data?.events as any[]) || [];
      for (const event of events) {
        publishEmployeeEvent(event as any);
        const ts =
          typeof event?.publishedAtMs === 'number'
            ? event.publishedAtMs
            : event?.occurredAt
              ? Date.parse(event.occurredAt)
              : 0;
        if (ts > pollCursorMs) pollCursorMs = ts;
      }
    } catch {
      // 静默失败，不阻塞 UI（B-6）
    }
  }

  function startPolling() {
    if (pollTimer) return; // 已在轮询
    pollEmployeeEvents(); // 立即拉取一次
    pollTimer = setInterval(pollEmployeeEvents, POLL_INTERVAL_MS);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  // 组件卸载时自动清理
  onBeforeUnmount(() => {
    stopPolling();
    disconnect();
    messageHandlers.clear();
    statusHandlers.clear();
    degradedHandlers.clear();
  });

  return {
    // 状态
    status,
    retryCount,
    degraded,
    // 连接控制
    connect,
    disconnect,
    resetDegraded,
    // 事件注册
    onMessage,
    onStatus,
    onDegraded,
  };
}
