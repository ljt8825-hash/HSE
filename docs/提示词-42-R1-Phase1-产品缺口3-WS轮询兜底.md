# 提示词 42：产品缺口 #3 — WS 轮询兜底实现

> 编号：提示词-42
> 日期：2026-07-30
> 状态：待执行
> 前置：提示词-41 执行报告 ✅（reporter 切换完成，含 handlerId 静默失效修复）
> 关联：`提示词-40-R1-Phase1-产品主线回归.md`、`R1-Phase1-终态报告.md`

---

## 0. 背景

当前「花名册为基石打通各模块交互」的跨模块数据刷新依赖 **WebSocket 事件驱动**：

```
employeeEventService.publishEmployeeEvent()
  → wsServer.broadcastNotification()
  → useHseWebSocket.onmessage
  → publishEmployeeEvent()
  → useEmployeeData 缓存失效 + refresh()
  → EmployeeName 自动刷新
```

**问题**：若 WS 连接断开（网络抖动、代理超时、浏览器休眠恢复），`EmployeeName` 不会自动刷新，其他模块展示的员工信息可能过期。

**目标**：在 WS 不可用时，优雅降级为 30s 间隔 HTTP 轮询 `/api/hse/employee/events?since=`，确保跨模块数据最终一致。

---

## 1. 现状分析

### 1.1 已有基础设施

| 组件 | 文件 | 现状 |
|------|------|------|
| 事件发布 | `server/services/employeeEventService.js` | 环形缓冲 + 10s 去重，`getEventsSince(timestamp)` 已实现 |
| 事件端点 | `server/routes/hse-employee.js` | `GET /api/hse/employee/events?since=` 已路由但需确认是否挂载 |
| WS 连接 | `src/components/hse/useHseWebSocket.ts` | `onmessage` 解析 `NOTIFICATION → EMPLOYEE_EVENT`，转发 `publishEmployeeEvent` |
| 缓存层 | `src/composables/hse/useEmployeeData.ts` | `subscribe` 监听事件，`cache.delete(event.employeeId)` + `refresh()` |
| 事件总线 | `src/composables/hse/useEmployeeEvent.ts` | `publishEmployeeEvent` + `subscribe` + 幂等去重 |

### 1.2 轮询兜底设计

```
┌─────────────────────────────────────────────────────┐
│                  useHseWebSocket                      │
│  ┌──────────┐     ┌──────────┐     ┌──────────────┐ │
│  │ WS 连接  │ ──→ │ onmessage│ ──→ │ publishEvent │ │
│  └──────────┘     └──────────┘     └──────────────┘ │
│       │                                              │
│       │ WS 断开 / 超时                                │
│       ▼                                              │
│  ┌──────────┐     ┌──────────┐     ┌──────────────┐ │
│  │ 30s 轮询 │ ──→ │ GET      │ ──→ │ publishEvent │ │
│  │ timer    │     │ /events  │     │ (批量)       │ │
│  └──────────┘     └──────────┘     └──────────────┘ │
│       │                                              │
│       │ WS 重连成功                                   │
│       ▼                                              │
│  ┌──────────┐                                        │
│  │ 停止轮询 │                                        │
│  └──────────┘                                        │
└─────────────────────────────────────────────────────┘
```

**关键行为**：
- **WS 连接正常时**：不启动轮询（节省带宽）
- **WS 断开时**：自动启动 30s 间隔轮询，获取增量事件
- **WS 重连时**：自动停止轮询，恢复 WS 事件驱动
- **轮询端点不可用时**：静默失败，不阻塞 UI

---

## 2. 任务 A：确认/修复后端事件轮询端点

### 2.1 端点检查

确认 `GET /api/hse/employee/events?since=<ISO_TIMESTAMP>` 已挂载并可用：

```javascript
// server/routes/hse-employee.js 中应已有或新增
router.get('/employees/events', async (ctx) => {
  const { since } = ctx.query;
  const events = employeeEventService.getEventsSince(since);
  ctx.body = { code: 0, data: { events } };
});
```

### 2.2 验证

- `node --check server/routes/hse-employee.js` 语法通过
- 实时冒烟：`GET /api/hse/employee/events?since=2026-01-01T00:00:00.000Z` → HTTP 200，返回 `{ code: 0, data: { events: [...] } }`

---

## 3. 任务 B：前端轮询兜底实现

### 3.1 修改文件：`src/components/hse/useHseWebSocket.ts`

#### 3.1.1 新增轮询状态变量

```typescript
// 轮询兜底
const POLL_INTERVAL_MS = 30_000; // 30s
let pollTimer: ReturnType<typeof setInterval> | null = null;
let lastEventTimestamp: string | null = null; // 记录最后一次收到事件的时间戳，用于增量轮询
```

#### 3.1.2 新增轮询函数

```typescript
/**
 * HTTP 轮询兜底：当 WS 断开时，每 30s 拉取增量事件
 */
async function pollEmployeeEvents() {
  try {
    const since = lastEventTimestamp || new Date(Date.now() - 60_000).toISOString();
    const res = await fetch(`/api/hse/employee/events?since=${encodeURIComponent(since)}`);
    if (!res.ok) return;
    const body = await res.json();
    const events = body?.data?.events || [];
    for (const event of events) {
      publishEmployeeEvent(event);
      // 更新最新时间戳
      if (event.occurredAt && (!lastEventTimestamp || event.occurredAt > lastEventTimestamp)) {
        lastEventTimestamp = event.occurredAt;
      }
    }
  } catch {
    // 静默失败，不阻塞 UI
  }
}

function startPolling() {
  if (pollTimer) return; // 已在轮询
  // 立即执行一次，然后按间隔轮询
  pollEmployeeEvents();
  pollTimer = setInterval(pollEmployeeEvents, POLL_INTERVAL_MS);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
```

#### 3.1.3 在 WS 生命周期中集成

```typescript
// WS 连接成功 → 停止轮询
ws.onopen = () => {
  // ... existing onopen logic ...
  stopPolling(); // 停止轮询，恢复 WS 事件驱动
};

// WS 断开 → 启动轮询
ws.onclose = () => {
  // ... existing onclose logic (重连逻辑) ...
  startPolling(); // 启动轮询兜底
};

// WS 错误 → 启动轮询（如果尚未启动）
ws.onerror = () => {
  // ... existing onerror logic ...
  startPolling(); // 启动轮询兜底
};
```

### 3.2 设计要点

| 要点 | 实现 |
|------|------|
| 轮询间隔 | 30s（与提示词-34 §5.3 一致） |
| 增量拉取 | 使用 `since` 参数，仅拉取上次时间戳之后的事件 |
| 首次轮询 | 拉取最近 60s 内的事件（避免遗漏 WS 断开瞬间的事件） |
| 静默失败 | `try/catch` 包裹，轮询失败不报错、不阻塞 UI |
| 去重保护 | 依赖 `useEmployeeEvent` 的 `dedupKeys` Set（10s TTL），轮询与 WS 重复事件自动去重 |
| 资源清理 | 组件卸载时清除 `pollTimer`（`onUnmounted` 或 `ws.close` 时） |

### 3.3 验证

- WS 正常连接时，确认无轮询请求（Network 面板无 `/events?since=` 请求）
- 手动断开 WS（断网 / 关闭 WS 服务），确认 30s 后出现 `/events?since=` 轮询请求
- 发布一个员工事件，确认轮询能拉取到并触发 `EmployeeName` 刷新
- WS 重连后，确认轮询停止，不再有 `/events?since=` 请求
- 页面刷新/关闭时，确认无残留定时器（无内存泄漏）

---

## 4. 验证清单

### 4.1 后端

- [ ] A-1 `node --check server/routes/hse-employee.js` 语法通过
- [ ] A-2 `GET /api/hse/employee/events?since=` 返回 200，含 `events` 数组
- [ ] A-3 无 `since` 参数时返回合理默认值（空数组或最近事件）

### 4.2 前端

- [ ] B-1 `vue-tsc` 无新增类型错误（与既有 WS 代码对齐）
- [ ] B-2 WS 正常连接时，Network 面板无 `/events?since=` 请求
- [ ] B-3 WS 断开后，30s 内出现 `/events?since=` 轮询请求
- [ ] B-4 轮询拉取到事件后，`EmployeeName` 正确刷新
- [ ] B-5 WS 重连后，轮询停止，不再有 `/events?since=` 请求
- [ ] B-6 轮询端点不可用时，不影响页面正常使用（静默失败）
- [ ] B-7 页面刷新/关闭时，无残留定时器（Performance/Memory 无泄漏）
- [ ] B-8 轮询与 WS 同时收到相同事件时，不会重复刷新（去重保护生效）

### 4.3 红线

- [ ] 不修改路由定义
- [ ] 不修改菜单配置
- [ ] 不修改组件库
- [ ] 不修改其他模块代码
- [ ] 不修改登录代码
- [ ] 不破坏现有 WS 事件驱动功能

---

## 5. 执行顺序

```
1. 任务 A：确认/修复后端事件轮询端点
   ↓ 冒烟通过
2. 任务 B：前端轮询兜底实现
   ↓ 代码审查
3. 功能验证：WS 断开 → 轮询启动 → 事件刷新 → WS 重连 → 轮询停止
```

---

## 6. 风险评估

| 风险 | 等级 | 缓解 |
|------|------|------|
| 轮询频率过高增加服务器负载 | 低 | 30s 间隔，仅在 WS 断开时启动；`getEventsSince` 基于环形缓冲（O(1) 查询） |
| 轮询与 WS 事件重复触发刷新 | 低 | `useEmployeeEvent` 的 `dedupKeys` Set（10s TTL）自动去重 |
| 轮询端点未挂载导致 404 | 中 | 任务 A 确认/修复；`try/catch` 静默失败 |
| 定时器未清理导致内存泄漏 | 低 | `onUnmounted` / `ws.close` 时清除 `pollTimer` |

---

## 7. 范围外（后续独立任务）

| # | 内容 | 优先级 |
|---|------|--------|
| 1 | 回填策略增强 v1.2（多人员拆分、模糊匹配） | P2 |
| 2 | 全项目 TS 存量错误清零（576 处） | P2 |
| 3 | 风险/隐患/应急等模块统一 `XxxId + EmployeeName` 模式（提示词-41 报告 §7 建议） | P2 |
| 4 | 员工主档案页关联业务 Tab 浏览器交互验证（提示词-40 报告 §一 待人工执行） | P2 |

---

> 编制：Senior Developer（高级开发工程师）
> 关联文档：`提示词-41-执行报告.md`、`提示词-40-R1-Phase1-产品主线回归.md`、`R1-Phase1-终态报告.md`