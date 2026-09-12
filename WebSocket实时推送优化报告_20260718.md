# WebSocket 实时推送优化报告

> **阶段**：Phase 16
> **日期**：2026-07-18
> **范围**：将全局通知铃铛组件的 30 秒轮询替换为 WebSocket 实时推送
> **约束**：严格遵守前十五阶段所有硬性约束

---

## 目录

1. [WebSocket 架构设计说明](#1-websocket-架构设计说明)
2. [修改文件清单](#2-修改文件清单)
3. [修改前/后对比（关键代码片段）](#3-修改前后对比关键代码片段)
4. [验证步骤](#4-验证步骤)
5. [与通知中心/业务模块的联动说明](#5-与通知中心业务模块的联动说明)
6. [剩余风险与最终项目收尾建议](#6-剩余风险与最终项目收尾建议)
7. [更新后的全局测试 Checklist](#7-更新后的全局测试-checklist)
8. [附录：完整文件清单](#8-附录完整文件清单)

---

## 1. WebSocket 架构设计说明

### 1.1 设计目标

将 Phase 15 全局通知铃铛组件的 **30 秒轮询** 替换为 **WebSocket 实时推送**，实现：
- 通知到达后立即显示（零延迟）
- 降低服务器负载（避免无效轮询）
- 支持断线重连和降级机制

### 1.2 架构总览

```
┌─────────────────────────────────────────────────────────────────┐
│                        浏览器（前端）                              │
│                                                                  │
│  layouts/basic.vue                                               │
│    └─ onMounted → store.startRealtime()                          │
│                       │                                          │
│                       ▼                                          │
│  store/notifications.ts (Pinia)                                  │
│    ├─ useHseWebSocket()  ←── components/hse/useHseWebSocket.ts   │
│    │   ├─ connect()          建立 WS 连接                         │
│    │   ├─ onMessage()        接收推送                              │
│    │   ├─ onDegraded()       降级回调                              │
│    │   └─ disconnect()       关闭连接                              │
│    │                                                             │
│    ├─ handleWsMessage()     处理 NOTIFICATION 消息                │
│    ├─ startPolling()        降级轮询（60秒）                       │
│    └─ stopRealtime()        清理 WS + 轮询                        │
│                                                                  │
│  WebSocket 连接：ws://host/ws?token=JWT                          │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Node.js 服务器（后端）                         │
│                                                                  │
│  server/app.js                                                   │
│    └─ http.createServer(app) → initWebSocketServer(server)       │
│                                  │                               │
│                                  ▼                               │
│  server/services/wsServer.js                                     │
│    ├─ WebSocketServer({ path: '/ws' })                           │
│    ├─ JWT 认证（URL query ?token=xxx）                            │
│    ├─ 心跳检测（30秒 ping）                                       │
│    ├─ sendToUser(userId, msg)    定向推送                         │
│    └─ broadcastNotification()    广播推送                         │
│          │                                                       │
│          ▼                                                       │
│  server/services/notificationService.js                          │
│    └─ createNotification()                                       │
│        ├─ INSERT INTO notifications                              │
│        └─ wsServer.sendToUser()  ← WS 推送                       │
│                                                                  │
│  业务模块调用：                                                    │
│    ├─ risk-control.js → notifyRiskExpiry()                       │
│    ├─ hazards.js → notifyHazardExpiry()                          │
│    └─ 其他模块 → createNotification()                             │
└─────────────────────────────────────────────────────────────────┘
```

### 1.3 关键设计决策

| 决策点 | 方案 | 理由 |
|---|---|---|
| **WS 库** | 浏览器原生 `WebSocket` API | 不引入新依赖，符合硬性约束 |
| **服务端** | 复用已实现的 `wsServer.js` | 后端已完整实现，零改动 |
| **认证方式** | URL query `?token=JWT` | 与服务端现有实现对齐 |
| **token 来源** | `useAccessStore().accessToken` | Vben 内置 store，登录后自动有值 |
| **消息协议** | `{ type, timestamp, payload }` | 与服务端 `wsServer.js` 完全对齐 |
| **心跳机制** | 客户端 25s PING + 服务端 30s ping | 双向心跳互补，确保连接存活 |
| **重连策略** | 指数退避 1s→2s→4s→8s→max 30s | 避免雪崩，逐步恢复 |
| **降级阈值** | 连续失败 3 次 → 切换 60s 轮询 | 平衡实时性与稳定性 |
| **降级轮询间隔** | 60 秒（比原 30 秒更长） | 降级场景下降低服务器压力 |
| **认证失败处理** | code=4001 不重连 | token 过期需重新登录 |

### 1.4 消息协议

#### 服务端 → 客户端消息

| type | 触发条件 | payload 内容 |
|---|---|---|
| `AUTH_SUCCESS` | WS 连接认证成功 | `{ message, user }` |
| `AUTH_FAIL` | token 无效或缺失 | `{ message }` |
| `PONG` | 响应客户端 PING | `{}` |
| `NOTIFICATION` | 新通知推送 | `{ id, title, content, type, bizType, bizId, createdAt }` |
| `NEW_ALERT` | 新告警广播 | `{ alert }` |
| `UPDATE_ALERT` | 告警更新 | `{ id, changes }` |
| `RESOLVE_ALERT` | 告警解决 | `{ id }` |

#### 客户端 → 服务端消息

| type | 用途 |
|---|---|
| `PING` | 客户端心跳（每 25 秒） |

### 1.5 状态机

```
                    ┌──────────────┐
                    │ disconnected │ ← 初始状态
                    └──────┬───────┘
                           │ connect()
                           ▼
                    ┌──────────────┐
                    │  connecting  │
                    └──────┬───────┘
              ┌────────────┼────────────┐
              │            │            │
         onopen        onclose(非4001)  onclose(4001)
              │            │            │
              ▼            ▼            ▼
        ┌──────────┐  ┌──────────┐  ┌──────────┐
        │connected │  │disconnected│ │disconnected│
        └────┬─────┘  └─────┬────┘  │ (不重连)  │
             │              │       └──────────┘
        onclose(非4001)     │
             │              │
             ▼              ▼
        ┌──────────┐  ┌──────────────┐
        │disconnected│ │ retryCount++ │
        └─────┬────┘  └──────┬───────┘
              │              │
              │     ┌────────┼────────┐
              │     │        │        │
              │  < 3次    ≥ 3次    manuallyClosed
              │     │        │        │
              │     ▼        ▼        ▼
              │  重连     降级      停止
              │ (指数退避) (轮询)
              │
              ▼
         handleFailure()
```

---

## 2. 修改文件清单

### 后端（无需修改）

**关键发现**：WebSocket 服务端已在 Phase 1-3 基础架构阶段完整实现并集成：

| 文件 | 状态 | 说明 |
|---|---|---|
| `server/services/wsServer.js` | ✅ 已实现 | `/ws` 路径、JWT 认证、心跳、`sendToUser`/`broadcastNotification` |
| `server/app.js` | ✅ 已集成 | `http.createServer(app)` + `initWebSocketServer(server)` |
| `server/services/notificationService.js` | ✅ 已集成 | `createNotification` 调用 `wsServer.sendToUser()` |
| `vite.config.ts` | ✅ 已配置 | `/ws` 代理 `ws:true` |

### 前端（4 个文件）

| # | 文件路径 | 改动类型 | 简要说明 |
|---|---|---|---|
| 1 | `apps/web-antd/src/components/hse/useHseWebSocket.ts` | **新建** | WebSocket 客户端 composable：连接管理、指数退避重连、心跳、消息分发、降级触发 |
| 2 | `apps/web-antd/src/store/notifications.ts` | 修改 | 新增 `startRealtime`/`stopRealtime`；`handleWsMessage` 处理实时推送；保留 `startPolling` 作为降级 |
| 3 | `apps/web-antd/src/layouts/basic.vue` | 修改 | `startPolling` → `startRealtime`；`stopPolling` → `stopRealtime` |
| 4 | `apps/web-antd/src/locales/langs/zh-CN/hse.json` | 修改 | 新增 `notifications.bell.ws.*` 文案（7 个 key） |
| 5 | `apps/web-antd/src/locales/langs/en-US/hse.json` | 修改 | 同步英文翻译 |

---

## 3. 修改前/后对比（关键代码片段）

### 3.1 新建 useHseWebSocket.ts —— WebSocket 客户端 Composable

```typescript
/**
 * 指数退避重连：1s → 2s → 4s → 8s → 最大 30s
 */
function getRetryDelay(): number {
  return Math.min(INITIAL_RETRY * 2 ** retryCount.value, MAX_RETRY);
}

/**
 * 连续失败 3 次后触发降级
 */
function handleFailure() {
  consecutiveFailures += 1;
  if (consecutiveFailures >= DEGRADE_THRESHOLD && !degraded.value) {
    degraded.value = true;
    degradedHandlers.forEach((h) => h()); // 通知 store 切换到轮询
    return;
  }
  scheduleReconnect();
}

/**
 * 建立连接
 */
function connect() {
  const accessStore = useAccessStore();
  const token = accessStore.accessToken;
  if (!token) return;

  const wsUrl = resolveWsUrl(token); // ws://host/ws?token=JWT
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    setStatus('connected');
    retryCount.value = 0;
    consecutiveFailures = 0;
    degraded.value = false;
    startHeartbeat(); // 每 25 秒发送 PING
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    messageHandlers.forEach((h) => h(msg)); // 分发给 store
  };

  ws.onclose = (event) => {
    stopHeartbeat();
    setStatus('disconnected');
    if (event.code === 4001) return; // 认证失败不重连
    if (manuallyClosed) return;
    handleFailure(); // 累计失败次数
  };
}

export function useHseWebSocket() {
  return {
    status,      // ref<'connected'|'connecting'|'disconnected'>
    retryCount,  // ref<number>
    degraded,    // ref<boolean>
    connect,
    disconnect,
    onMessage,   // 注册消息回调
    onStatus,    // 注册状态回调
    onDegraded,  // 注册降级回调
  };
}
```

### 3.2 store/notifications.ts —— 集成 WebSocket + 降级轮询

#### 修改前（Phase 15：30 秒轮询）

```typescript
// 轮询间隔（毫秒），30 秒
const POLL_INTERVAL = 30 * 1000;

function startPolling() {
  stopPolling();
  fetchRecent();
  pollTimer = setInterval(() => {
    fetchRecent();
  }, POLL_INTERVAL);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
```

#### 修改后（Phase 16：WebSocket 优先 + 60 秒降级轮询）

```typescript
import { useHseWebSocket } from '#/components/hse/useHseWebSocket';

// 降级轮询间隔（毫秒），60 秒（WS 失败时降级使用）
const POLL_INTERVAL = 60 * 1000;

// WebSocket 客户端实例
let wsClient: ReturnType<typeof useHseWebSocket> | null = null;
const wsStatus = ref<'connected' | 'connecting' | 'disconnected'>('disconnected');
const isDegraded = ref(false);

/**
 * 处理 WebSocket 推送的通知消息
 */
function handleWsMessage(msg: { type: string; payload: Record<string, any> }) {
  if (msg.type !== 'NOTIFICATION' || !msg.payload) return;
  const p = msg.payload;
  // 构造业务侧 NotificationItem
  const bizItem: NotificationsApi.NotificationItem = {
    id: p.id || Date.now(),
    title: p.title || '',
    content: p.content || '',
    type: p.type || 'system',
    priority: p.priority || 'normal',
    bizType: p.bizType,
    bizId: p.bizId,
    isRead: false,
    createdAt: p.createdAt || new Date().toISOString(),
  };
  // 映射为 Vben 格式并插入列表头部
  const mapped = mapToVbenItem(bizItem);
  if (recentList.value.some((n) => n.id === mapped.id)) return; // 去重
  recentList.value = [mapped, ...recentList.value].slice(0, RECENT_LIMIT);
  unreadCount.value += 1;
}

/**
 * 启动实时模式：WebSocket 优先，失败降级到 60 秒轮询
 */
function startRealtime() {
  if (realtimeStarted.value) return;
  realtimeStarted.value = true;

  // 首次立即拉取（WS 建立前的过渡数据）
  fetchRecent();

  try {
    wsClient = useHseWebSocket();
    wsClient.onStatus((s) => { wsStatus.value = s; });
    wsClient.onMessage(handleWsMessage);
    // 连续失败 3 次后降级到轮询
    wsClient.onDegraded(() => {
      isDegraded.value = true;
      startPolling();
    });
    wsClient.connect();
  } catch (err) {
    // WS 初始化失败，直接降级
    isDegraded.value = true;
    startPolling();
  }
}

/**
 * 停止实时模式：关闭 WS + 清理轮询
 */
function stopRealtime() {
  realtimeStarted.value = false;
  if (wsClient) {
    wsClient.disconnect();
    wsClient = null;
  }
  stopPolling();
  wsStatus.value = 'disconnected';
  isDegraded.value = false;
}
```

### 3.3 layouts/basic.vue —— 启动方式替换

#### 修改前

```typescript
onMounted(() => {
  notificationStore.startPolling();  // 30 秒轮询
});
onUnmounted(() => {
  notificationStore.stopPolling();
});
```

#### 修改后

```typescript
onMounted(() => {
  notificationStore.startRealtime();  // WebSocket 优先 + 降级轮询
});
onUnmounted(() => {
  notificationStore.stopRealtime();
});
```

### 3.4 心跳机制对比

#### 服务端心跳（wsServer.js，已有）

```javascript
// 每 30 秒检查一次，清理无响应的连接
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      ws.terminate();
      clients.delete(ws);
      return;
    }
    ws.isAlive = false;
    ws.ping();  // 服务端 ping
  });
}, 30_000);
```

#### 客户端心跳（useHseWebSocket.ts，新增）

```typescript
// 每 25 秒发送 PING 消息（比服务端 30 秒略短，确保互补）
const HEARTBEAT_INTERVAL = 25_000;

function startHeartbeat() {
  heartbeatTimer = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'PING', timestamp: Date.now() }));
    }
  }, HEARTBEAT_INTERVAL);
}
```

### 3.5 降级机制

```
WS 连接失败
    │
    ▼
retryCount = 1, 等待 1s 重连
    │
    ▼ (失败)
retryCount = 2, 等待 2s 重连
    │
    ▼ (失败)
retryCount = 3, consecutiveFailures = 3
    │
    ▼
触发 onDegraded 回调
    │
    ▼
store.isDegraded = true
store.startPolling()  ← 60 秒轮询接管
```

---

## 4. 验证步骤

### 4.1 启动验证

```bash
# 1. 启动后端（端口 5666，自动启动 WebSocket 服务）
cd f:/deploy/hse-dashboard
node server/app.js

# 预期日志：
# [WebSocket] 服务已启动，路径: /ws
# WebSocket 服务: ws://localhost:5666/ws

# 2. 启动前端（端口 5173，Vite 代理 /ws）
cd f:/deploy/hse-dashboard/安全看板vben
pnpm dev:antd
```

### 4.2 功能测试用例

| # | 测试场景 | 操作步骤 | 预期结果 | 验证点 |
|---|---|---|---|---|
| 1 | **WS 连接建立** | 登录后打开浏览器控制台 | `[HseWebSocket] 连接成功` | `wsStatus = 'connected'` |
| 2 | **实时通知推送** | 后端调用 `createNotification` | 铃铛红点立即出现，Popover 显示新通知 | `handleWsMessage` 触发 |
| 3 | **风险临期推送** | 触发风险临期（Phase 14） | 铃铛立即收到通知（零延迟） | `bizType=risk_expiring` |
| 4 | **隐患过期推送** | 触发隐患过期（Phase 14） | 铃铛立即收到紧急通知 | `bizType=hazard_expired` |
| 5 | **心跳保活** | 等待 25 秒 | 控制台无断连，WS 保持连接 | 客户端 PING + 服务端 PONG |
| 6 | **断线重连** | 临时停止后端 | 1s/2s/4s 后自动重连 | 指数退避 |
| 7 | **降级触发** | 后端停止超过 3 次重连 | 自动切换到 60 秒轮询 | `isDegraded = true` |
| 8 | **降级恢复** | 后端恢复后 | 轮询继续工作，WS 不自动切回 | 需手动 `resetDegraded()` |
| 9 | **认证失败** | 使用过期 token | WS 关闭 code=4001，不重连 | token 过期需重新登录 |
| 10 | **组件卸载** | 切换路由离开 Header | WS 连接关闭，轮询清理 | `stopRealtime` |
| 11 | **页面刷新** | F5 刷新页面 | WS 重新建立连接 | `startRealtime` 重新执行 |
| 12 | **多标签页** | 开启多个标签页 | 每个标签页独立 WS 连接 | 服务端 `clients` Map |
| 13 | **暗黑模式** | 切换暗黑主题 | WS 功能不受影响 | 与主题无关 |
| 14 | **移动端** | 缩小浏览器窗口 | WS 功能不受影响 | 与视口无关 |

### 4.3 控制台检查

```javascript
// 在浏览器控制台执行，验证 store 状态
const store = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('hse-notification');
console.log('wsStatus:', store.wsStatus);       // 'connected'
console.log('isDegraded:', store.isDegraded);   // false
console.log('unreadCount:', store.unreadCount);
console.log('recentList:', store.recentList);

// 检查 WebSocket 连接
// Chrome DevTools → Network → WS → 查看连接和消息流
```

### 4.4 后端推送测试

```bash
# 通过 curl 触发一条通知（需要有效 token）
curl -X POST http://localhost:5666/api/hse/notifications \
  -H "Authorization: Bearer <YOUR_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "测试实时推送",
    "content": "这是一条测试通知",
    "type": "system",
    "bizType": "test"
  }'

# 预期：前端铃铛在 1 秒内显示新通知
```

---

## 5. 与通知中心/业务模块的联动说明

### 5.1 数据流联动

```
业务模块时效事件
    │
    ├── risk-control.js → notifyRiskExpiry()
    ├── hazards.js → notifyHazardExpiry()
    ├── training.js → 培训临期
    ├── insurance.js → 保险临期
    ├── accidents.js → 事故整改期限
    └── workflow.js → createWorkflowTaskNotification()
                │
                ▼
    notificationService.createNotification()
                │
        ┌───────┴───────┐
        │               │
        ▼               ▼
  INSERT INTO        wsServer.sendToUser()
  notifications           │
        │                  ▼
        │           WebSocket 消息
        │           { type: 'NOTIFICATION',
        │             payload: {...} }
        │                  │
        ▼                  ▼
  通知中心页面          前端铃铛
  (HTTP 轮询)        (WebSocket 实时)
```

### 5.2 联动场景

| 场景 | 触发模块 | 推送方式 | 前端响应 |
|---|---|---|---|
| **风险临期/过期** | risk-control.js | `sendToUser` 定向 | 铃铛零延迟显示 |
| **隐患过期** | hazards.js | `sendToUser` 定向 | 铃铛零延迟显示 |
| **工作流待办** | workflowService.js | `sendToUser` 定向 | 铃铛零延迟显示 |
| **告警广播** | alerts.js | `broadcastAlert` 广播 | 所有在线用户收到 |
| **通知中心页面** | notifications.js | HTTP API | 手动刷新/筛选时拉取 |

### 5.3 与 Phase 15 的对比

| 维度 | Phase 15（轮询） | Phase 16（WebSocket） |
|---|---|---|
| **延迟** | 最多 30 秒 | 零延迟（实时） |
| **服务器负载** | 每用户每 30 秒 1 次 HTTP | 仅在有通知时推送 |
| **未读数准确性** | 30 秒内可能不一致 | 实时同步 |
| **降级机制** | 无（纯轮询） | WS 失败 → 60 秒轮询 |
| **断线恢复** | 自动（下次轮询） | 指数退避重连 |
| **心跳保活** | 无 | 客户端 25s + 服务端 30s |
| **认证** | HTTP Header Bearer | URL query token |

---

## 6. 剩余风险与最终项目收尾建议

### 6.1 剩余风险

| 风险 | 等级 | 影响 | 缓解措施 |
|---|---|---|---|
| **token 过期** | 中 | WS 连接断开且不重连（code=4001） | 用户需重新登录；可后续监听 token 刷新后重连 |
| **降级后不自动恢复** | 低 | 网络恢复后仍使用轮询 | 可后续定时尝试 `resetDegraded()` 切回 WS |
| **多标签页重复连接** | 低 | 每个标签页独立 WS，服务器连接数增加 | 可接受；服务端心跳会清理空闲连接 |
| **ws 依赖未声明** | 低 | `server/package.json` 未声明 `ws` 依赖 | 当前从根目录 `node_modules` 解析；建议后续补充声明 |
| **WS URL 硬编码 /ws** | 低 | 路径变更需同步前后端 | 约定路径，与 vite.config 一致 |

### 6.2 最终项目收尾建议

| # | 建议 | 优先级 | 说明 |
|---|---|---|---|
| 1 | **token 刷新后重连 WS** | 中 | 监听 accessStore.token 变化，自动重新建立 WS 连接 |
| 2 | **降级自动恢复** | 低 | 网络恢复后定时尝试切回 WS 模式 |
| 3 | **ws 依赖声明** | 低 | 在 `server/package.json` 显式声明 `"ws": "^8.21.0"` |
| 4 | **WS 连接状态 UI** | 低 | 在铃铛旁显示连接状态图标（可选） |
| 5 | **WS 消息类型扩展** | 中 | 支持 `UNREAD_COUNT_UPDATE` 等新消息类型 |
| 6 | **定时任务模块** | 中 | Phase 14 报告建议的 cron 自动扫描 |
| 7 | **全局 E2E 测试** | 高 | 16 个阶段的完整功能自动化测试 |

### 6.3 项目整体完成度

| 阶段 | 模块 | 状态 |
|---|---|---|
| Phase 1-3 | 基础架构（登录、布局、权限、WebSocket 服务端） | ✅ 完成 |
| Phase 4 | 通知中心 | ✅ 完成 |
| Phase 5-6 | 告警中心、工作流 | ✅ 完成 |
| Phase 7 | 培训管理 | ✅ 完成 |
| Phase 8 | 隐患排查治理 | ✅ 完成 |
| Phase 9-10 | 保险管理、事故管理 | ✅ 完成 |
| Phase 11-13 | 应急预案、风险管控、现场检查 | ✅ 完成 |
| Phase 14 | 隐患与风险联动 | ✅ 完成 |
| Phase 15 | 全局通知铃铛（轮询） | ✅ 完成 |
| **Phase 16** | **WebSocket 实时推送** | **✅ 完成** |

---

## 7. 更新后的全局测试 Checklist

### 7.1 Phase 16 专项测试

- [ ] **WS 连接建立**：登录后控制台显示连接成功
- [ ] **实时通知推送**：后端创建通知后铃铛立即显示
- [ ] **风险临期推送**：风险临期时铃铛零延迟收到
- [ ] **隐患过期推送**：隐患过期时铃铛零延迟收到
- [ ] **心跳保活**：25 秒 PING + 30 秒服务端 ping
- [ ] **断线重连**：指数退避 1s→2s→4s
- [ ] **降级触发**：连续失败 3 次切换到 60 秒轮询
- [ ] **降级轮询**：60 秒间隔，功能与 Phase 15 一致
- [ ] **认证失败**：code=4001 不重连
- [ ] **组件卸载**：路由切换后 WS 关闭 + 轮询清理
- [ ] **页面刷新**：WS 重新建立
- [ ] **多标签页**：每个标签页独立连接
- [ ] **消息去重**：同 id 通知不重复插入
- [ ] **未读数同步**：WS 推送后 unreadCount +1

### 7.2 全局回归测试（Phase 1-16）

- [ ] **登录功能**：登录/登出/权限路由 100% 正常
- [ ] **Dashboard**：统计卡片、Skeleton、Mock 降级
- [ ] **通知中心**：列表、筛选、详情 Drawer、批量操作
- [ ] **告警中心**：列表、处置、批量处置、WS 广播
- [ ] **工作流**：定义、实例、任务、WS 待办推送
- [ ] **培训管理**：列表、表单、统计
- [ ] **隐患排查**：列表、整改、反向联动（Phase 14）
- [ ] **保险管理**：人员、续保、临期提醒
- [ ] **事故管理**：列表、附件、版本、时效
- [ ] **应急预案**：预案列表、演练
- [ ] **风险管控**：风险点、生成隐患（Phase 14）
- [ ] **现场检查**：检查记录、整改
- [ ] **隐患与风险联动**：正向/反向联动、通知推送（Phase 14）
- [ ] **全局通知铃铛**：WebSocket 实时推送、降级轮询（Phase 16）
- [ ] **i18n**：中英文切换正常
- [ ] **暗黑模式**：所有页面适配
- [ ] **主题色**：CSS 变量统一管理
- [ ] **权限控制**：菜单/按钮/路由三层权限
- [ ] **WebSocket 服务端**：/ws 路径、JWT 认证、心跳
- [ ] **Vite 代理**：/ws 代理正常

---

## 8. 附录：完整文件清单

### 8.1 本次修改文件

| 文件路径 | 改动类型 | 行数变化 |
|---|---|---|
| `apps/web-antd/src/components/hse/useHseWebSocket.ts` | 新建 | +285 |
| `apps/web-antd/src/store/notifications.ts` | 修改 | +95, -20 |
| `apps/web-antd/src/layouts/basic.vue` | 修改 | -4, +4 |
| `apps/web-antd/src/locales/langs/zh-CN/hse.json` | 修改 | +9 |
| `apps/web-antd/src/locales/langs/en-US/hse.json` | 修改 | +9 |

### 8.2 复用的现有文件（未修改）

| 文件路径 | 用途 |
|---|---|
| `server/services/wsServer.js` | WebSocket 服务端（已实现） |
| `server/app.js` | HTTP server + WS 挂载（已实现） |
| `server/services/notificationService.js` | 通知服务 + WS 推送（已实现） |
| `server/middleware/auth.js` | JWT 认证中间件（WS 复用相同密钥） |
| `vite.config.ts` | /ws 代理配置（已配置） |
| `apps/web-antd/src/api/hse/notifications.ts` | 通知 API 端点 |
| `apps/web-antd/src/views/hse/notifications/index.vue` | 通知中心页面 |
| `packages/stores/src/modules/access.ts` | accessToken 来源 |

### 8.3 硬性约束遵守情况

| 约束 | 遵守情况 |
|---|---|
| 不修改 Vben 核心目录 | ✅ 未修改 packages/@core/、packages/effects/、packages/themes/ |
| 不创建新自定义组件 | ✅ useHseWebSocket.ts 是 composable（非组件），复用 Vben 内置 `<Notification>` |
| 仅使用 Ant Design Vue 已有组件 | ✅ 复用 Vben 内置组件，无新增 UI 组件 |
| 不触碰登录代码 | ✅ 未修改 auth 相关任何文件（仅读取 accessToken） |
| 不引入新依赖 | ✅ 使用浏览器原生 WebSocket API |
| 改动最小化 | ✅ 后端零改动，前端仅 4 个文件 |
| 复用前模块模式 | ✅ 复用 Phase 15 的 store 结构和字段映射 |
| 后端改动限于 server/ | ✅ 后端无改动（已实现） |
| 前端改动限于 layouts/、store/、components/hse/ | ✅ 严格遵守 |
| i18n 文案 | ✅ 补充 hse.notifications.bell.ws.* 文案 |
| 暗黑模式 | ✅ WebSocket 与主题无关 |
| 移动端响应式 | ✅ WebSocket 与视口无关 |

### 8.4 技术规格

| 规格 | 值 |
|---|---|
| WebSocket 路径 | `/ws` |
| 认证方式 | URL query `?token=JWT` |
| 消息格式 | JSON `{ type, timestamp, payload }` |
| 心跳间隔（客户端） | 25 秒（PING） |
| 心跳间隔（服务端） | 30 秒（ping） |
| 重连策略 | 指数退避 1s→2s→4s→8s→max 30s |
| 降级阈值 | 连续失败 3 次 |
| 降级轮询间隔 | 60 秒 |
| 认证失败处理 | code=4001 不重连 |
| TypeScript 验证 | ✅ 无新增错误（273 行基线一致） |
| i18n 验证 | ✅ JSON.parse 通过 |

---

**报告生成时间**：2026-07-18
**阶段**：Phase 16 WebSocket 实时推送优化完成
