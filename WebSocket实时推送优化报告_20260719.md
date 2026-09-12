# HSE 项目 WebSocket 实时推送优化报告

## 一、优化概述

### 1.1 优化背景

HSE 项目原有的全局通知铃铛组件采用 **30 秒轮询** 机制获取新通知，存在以下问题：

| 问题 | 影响 |
|------|------|
| 实时性差 | 用户可能延迟最多 30 秒才能收到紧急告警 |
| 资源浪费 | 频繁的 HTTP 请求占用服务器资源和带宽 |
| 扩展性受限 | 无法支持高频事件推送场景（如 IoT 实时告警） |

### 1.2 优化目标

- 将通知轮询替换为 **WebSocket 实时推送**
- 实现服务端主动推送通知，延迟 < 100ms
- 支持心跳保活和断线自动重连
- 优雅降级：WebSocket 失败时回退到 60 秒轮询
- 确保暗黑模式和移动端兼容

---

## 二、架构设计

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        前端（Vben Admin）                        │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐   │
│  │ Basic Layout │───▶│Notification  │───▶│ useHseWebSocket │   │
│  │  (Header)    │    │   Store      │    │  (Composable)    │   │
│  └──────────────┘    └──────────────┘    └────────┬─────────┘   │
└───────────────────────────────────────────────────┼─────────────┘
                                                    │ WebSocket
                                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                        后端（Node.js + Express）                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐   │
│  │  HTTP Server │    │  wsServer    │    │notificationService│ │
│  │  (:5666)     │◀───│  (/ws)       │◀───│  (推送触发)       │   │
│  └──────────────┘    └──────────────┘    └──────────────────┘   │
│       │                    │                                      │
│       ▼                    ▼                                      │
│  ┌──────────────┐    ┌──────────────┐                            │
│  │  API Routes  │    │   Clients    │                            │
│  │              │    │  (Map: ws→   │                            │
│  └──────────────┘    │   userId)    │                            │
│                      └──────────────┘                            │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 消息协议

**服务端推送格式：**
```json
{
  "type": "NOTIFICATION",
  "timestamp": 1718832000000,
  "payload": {
    "id": 1,
    "title": "隐患整改过期警告",
    "content": "隐患 #H003 已超过整改期限",
    "type": "alert",
    "bizType": "hazards",
    "bizId": "H003",
    "createdAt": "2024-06-19T10:00:00Z"
  }
}
```

**心跳消息：**
```json
{ "type": "PING", "timestamp": 1718832000000 }
{ "type": "PONG", "timestamp": 1718832000000 }
```

### 2.3 认证流程

1. 客户端从 `useAccessStore` 获取 JWT accessToken
2. 通过 URL query 参数传递 token：`ws://host/ws?token=xxx`
3. 服务端验证 token 有效性和类型（必须是 `access` 类型）
4. 认证成功后建立连接，客户端信息存入 `clients` Map
5. 认证失败返回 `AUTH_FAIL` 消息，关闭连接

---

## 三、修改文件清单

| 文件路径 | 修改类型 | 说明 |
|---------|---------|------|
| `server/services/wsServer.js` | 新增 | WebSocket 服务端实现 |
| `server/services/notificationService.js` | 修改 | 集成 WebSocket 推送 |
| `server/.env` | 修改 | 添加 CORS 允许端口 5175 |
| `server/app.js` | 修改 | 挂载 WebSocket 服务器 |
| `apps/web-antd/src/components/hse/useHseWebSocket.ts` | 新增 | WebSocket 客户端 Composable |
| `apps/web-antd/src/store/notifications.ts` | 修改 | 集成 WebSocket + 降级轮询 |
| `apps/web-antd/src/layouts/basic.vue` | 修改 | 切换到实时模式 |
| `apps/web-antd/vite.config.ts` | 修改 | 添加 WebSocket 代理 |

---

## 四、关键代码对比

### 4.1 服务端：WebSocket 认证

**修改前**：无 WebSocket 服务

**修改后**：`server/services/wsServer.js`

```javascript
wss.on('connection', (ws, req) => {
  const parsedUrl = url.parse(req.url, true);
  const token = parsedUrl.query.token;
  
  if (!token) {
    ws.send(JSON.stringify({ type: 'AUTH_FAIL', ... }));
    ws.close(4001, '未授权');
    return;
  }
  
  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    ws.send(JSON.stringify({ type: 'AUTH_FAIL', ... }));
    ws.close(4001, '认证失败');
    return;
  }
  
  if (decoded.type !== 'access') {
    ws.send(JSON.stringify({ type: 'AUTH_FAIL', ... }));
    ws.close(4001, '无效令牌类型');
    return;
  }
  
  clients.set(ws, { userId: decoded.id, username: decoded.username });
  ws.send(JSON.stringify({ type: 'AUTH_SUCCESS', ... }));
});
```

### 4.2 客户端：连接管理

**新增**：`apps/web-antd/src/components/hse/useHseWebSocket.ts`

```typescript
function connect() {
  const accessStore = useAccessStore();
  const token = accessStore.accessToken;
  if (!token) return;
  
  const wsUrl = resolveWsUrl(token);
  ws = new WebSocket(wsUrl);
  
  ws.onopen = () => {
    setStatus('connected');
    retryCount.value = 0;
    consecutiveFailures = 0;
    startHeartbeat();
  };
  
  ws.onmessage = (event) => {
    const msg: WsMessage = JSON.parse(event.data);
    messageHandlers.forEach((h) => h(msg));
  };
  
  ws.onclose = (event) => {
    stopHeartbeat();
    if (event.code === 4001) {
      // 认证失败，等待 token 刷新
      if (consecutiveFailures >= DEGRADE_THRESHOLD) {
        degraded.value = true;
        degradedHandlers.forEach((h) => h());
      } else {
        setTimeout(connect, AUTH_FAIL_RETRY_DELAY);
      }
      return;
    }
    handleFailure();
  };
}
```

### 4.3 状态管理：实时模式

**修改前**：`store/notifications.ts`

```typescript
function startPolling() {
  pollTimer = setInterval(fetchRecent, 30000);
}
```

**修改后**：

```typescript
function startRealtime() {
  wsClient = useHseWebSocket();
  wsClient.onStatus((s) => { wsStatus.value = s; });
  wsClient.onMessage(handleWsMessage);
  wsClient.onDegraded(() => {
    isDegraded.value = true;
    startPolling(); // 降级到 60 秒轮询
  });
  
  // 监听 token 刷新
  watch(
    () => accessStore.accessToken,
    (newToken) => {
      if (newToken && newToken !== previousToken) {
        wsClient.disconnect();
        setTimeout(() => wsClient.connect(), 500);
      }
    }
  );
  
  wsClient.connect();
}
```

### 4.4 Layout：启动方式

**修改前**：`layouts/basic.vue`

```diff
- onMounted(() => { notificationStore.startPolling(); });
- onUnmounted(() => { notificationStore.stopPolling(); });
+ onMounted(() => { notificationStore.startRealtime(); });
+ onUnmounted(() => { notificationStore.stopRealtime(); });
```

---

## 五、核心机制详解

### 5.1 指数退避重连

```
重连延迟: 1s → 2s → 4s → 8s → 16s → 30s(最大)
重试次数:  1   2    3    4     5     6+
```

当连接断开时，客户端会按照指数增长的间隔进行重连，最大延迟为 30 秒，避免网络恢复时的"惊群效应"。

### 5.2 心跳保活机制

| 角色 | 行为 | 间隔 |
|------|------|------|
| 客户端 | 发送 PING 消息 | 25 秒 |
| 服务端 | 回复 PONG 消息 | 即时 |
| 服务端 | 检测连接存活 | 30 秒 |
| 服务端 | 清理无响应连接 | ping 失败后 |

### 5.3 优雅降级策略

```
WebSocket 失败 → 连续失败 3 次 → 切换到 60 秒轮询
                                    ↓
                            用户可手动重置降级状态
                                    ↓
                            重新尝试 WebSocket 连接
```

### 5.4 Token 刷新处理

当 Vben 的 token 刷新机制更新 accessToken 时：
1. `notificationStore` 中的 watcher 检测到 token 变化
2. 主动断开旧连接并延迟 500ms 重新连接
3. 使用新 token 进行认证

---

## 六、验证步骤

### 6.1 连接测试

**预期结果**：
- 登录后浏览器控制台显示 `[HseWebSocket] 连接成功`
- 服务端日志显示 `[WebSocket] 用户 admin 已连接，当前在线: 1`

**验证命令**：
```bash
# 服务端日志检查
tail -f server/logs/combined.log | grep WebSocket

# 浏览器控制台检查
# 搜索: [HseWebSocket]
```

### 6.2 实时推送测试

**步骤**：
1. 打开浏览器，登录系统
2. 在终端执行：
```bash
cd server
node -e "const { createNotification } = require('./services/notificationService'); createNotification({ userId: 1, title: '测试推送', content: '实时推送测试', type: 'system', bizType: 'test' })"
```
3. 观察浏览器通知铃铛的未读数是否立即增加

### 6.3 断线重连测试

**步骤**：
1. 停止后端服务：`Ctrl+C`
2. 观察浏览器控制台：显示重连日志
3. 重启后端服务
4. 观察浏览器：自动恢复连接

### 6.4 降级机制测试

**步骤**：
1. 停止后端服务
2. 等待连续 3 次重连失败
3. 观察控制台：`[NotificationStore] WebSocket 降级到 60 秒轮询`
4. 验证降级后仍能通过轮询获取通知

---

## 七、业务模块联动

### 7.1 通知触发点

| 模块 | 事件 | 推送时机 |
|------|------|---------|
| 风险管控 | 风险等级变更 | `risk-control.js` 状态更新时 |
| 隐患排查 | 隐患过期/新增 | `hazards.js` 创建/更新时 |
| 培训管理 | 证书到期提醒 | `training.js` 定时任务 |
| 保险管理 | 保单临期提醒 | `insurance.js` 定时任务 |
| 事故管理 | 事故报告提交 | `accidents.js` 创建时 |
| 工作流 | 待办任务分配 | `workflow.js` 任务创建时 |

### 7.2 推送代码示例

```javascript
// notificationService.js - createNotification 自动触发推送
async function createNotification({ userId, title, content, type, bizType, bizId, pushWs = true }) {
  // 1. 保存到数据库
  const result = await pool.query('INSERT INTO notifications ...');
  
  // 2. 通过 WebSocket 推送（默认开启）
  if (pushWs && userId) {
    wsServer.sendToUser(userId, {
      id: notification.id,
      title, content, type, bizType, bizId,
      createdAt: notification.created_at,
    });
  }
}
```

---

## 八、浏览器兼容性

| 浏览器 | WebSocket 支持 | 降级轮询支持 |
|--------|--------------|-------------|
| Chrome | ✅ | ✅ |
| Firefox | ✅ | ✅ |
| Safari | ✅ | ✅ |
| Edge | ✅ | ✅ |
| IE 11 | ❌（降级到轮询） | ✅ |

---

## 九、剩余风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 服务端重启导致连接断开 | 用户短暂收不到推送 | 客户端自动重连 |
| Token 过期期间推送丢失 | 离线期间的通知 | 轮询兜底 + 登录后拉取 |
| 高并发推送压力 | 服务端性能下降 | 消息队列（后续优化） |
| 网络不稳定 | 频繁重连 | 指数退避 + 心跳检测 |

---

## 十、后续优化建议

1. **消息队列集成**：引入 Redis Pub/Sub 或 RabbitMQ，支持分布式部署
2. **消息持久化**：推送失败的消息存入数据库，用户上线后补发
3. **批量推送**：高频事件合并推送，减少网络开销
4. **推送权限控制**：根据用户角色过滤推送内容
5. **监控告警**：添加 WebSocket 连接数、推送成功率监控

---

## 十一、全局测试 Checklist

### ✅ 功能验证
- [x] WebSocket 连接建立成功
- [x] JWT 认证通过
- [x] 实时推送通知到客户端
- [x] 未读数自动更新
- [x] 断线自动重连（指数退避）
- [x] 连续失败降级到轮询
- [x] Token 刷新后自动重连
- [x] 心跳保活机制正常

### ✅ 兼容性验证
- [x] 暗黑模式显示正常
- [x] 移动端响应式布局
- [x] 降级轮询功能正常

### ✅ 安全验证
- [x] Token 脱敏日志
- [x] 无效 Token 拒绝连接
- [x] Token 类型校验（仅允许 access token）

---

**报告生成时间**：2026-07-19  
**报告版本**：v1.0  
**修改范围**：通知模块 WebSocket 改造