# B00｜WPS-PG 与 Feishu-PG 链路边界审计

> 只读核验。基线 HEAD `9d503d2`。
> 本文件回答一个具体问题：**为什么这两条链必须保持独立，以及现在它们各自真实走到了哪一步。**

---

## 1. 先澄清一个命名陷阱（不澄清会全盘误判）

代码里 `WPS` 一词有三种完全不同的含义，混用会导致错误结论：

| 出现形式 | 真实含义 | 是否与金山 WPS 产品有关 |
|---|---|---|
| `CF-WPS-20` / `-43` / `-95` / `-100` / `-102` / `-103` | **内部工单编号**（变更单编号） | ❌ 无关，只是编号前缀 |
| `/wps/records/create` | **历史路径名**，后端已改写信飞书主台账 | ❌ 无关（`index.js:9` 明写"历史路径名保留"） |
| `wpsAdapter` | 2026-09-18 已删除的旧适配器 | 曾有关，现已移除 |
| `wrangler.toml` 的 `WPS_*` 变量 | POC 阶段配置残留，当前无消费方 | 曾有关 |
| `pages/functions/wps/[[route]].js` | 仅反代 `/wps/*` 到 Worker（照片上传） | ❌ 无关 |
| `server/routes/wps-grid-sync.js` 等 | **真正的金山 WPS 365 集成** | ✅ 有关 |

**结论：手机 H5 侧的所有 "WPS" 字样都不是金山 WPS；金山 WPS 只存在于 `server/` 的巡查同步模块里。**

---

## 2. 链路 A：WPS → PG（真实打通，但已停流）

### 2.1 组件与实现位置

| 层 | 文件 | 职责 |
|---|---|---|
| 路由 | `server/routes/wps-grid-sync.js`（7.2 KB） | 8 个端点，`app.js:427` 挂 `app.use('/api/wps-grid-sync')` |
| 门面 | `server/services/wpsGridSyncService.js` | 兼容层，只做转发 + 反向写入硬封禁 |
| 引擎 | `server/services/wpsGridPullEngine.js` | **唯一 WPS→PG 单向拉取实现**（幂等/事务/排除/保护） |
| 字段真源 | `server/services/wps/wpsFieldMap.js` | `SYNC_PROJECTION` 18 列冻结投影 |
| 调度 | `server/services/wpsGridSyncScheduler.js` | cron `*/15 * * * *`，双闸 fail-closed |
| 凭据 | `server/.env` 中 8 个 `WPS_*` 键 | OAuth / APPKEY（不落库） |

### 2.2 写入目标（关键：只有两张表）

```text
$ grep -oE "(INSERT INTO|UPDATE|FROM) [a-z_]{4,}" services/wpsGridPullEngine.js | sort | uniq -c
      1 INSERT INTO grid_inspection_records
      1 INSERT INTO grid_record_sync_map
      1 UPDATE grid_inspection_records
      2 UPDATE grid_record_sync_map
      1 FROM grid_inspection_records
      2 FROM grid_record_sync_map
```

→ **`wpsGridPullEngine` 只写 `grid_inspection_records` 与 `grid_record_sync_map`。**
→ **完全不碰 `hazards`，不碰任何隐患表。**

这是本文件最重要的一条事实：**任务书附图中"WPS → PG"这条箭头，指向的是巡查台账，不是隐患。**

### 2.3 触发机制（4 种，全部只读核验）

| 触发方式 | 位置 | 条件 | 现状 |
|---|---|---|---|
| cron 定时 | `wpsGridSyncScheduler.js:79` `cron.schedule('*/15 * * * *')` | `SCHEDULER_ENABLED==='true'` **且** `WPS_GRID_SYNC==='true'` 且凭据齐备 | `.env` 两项均为 `true` ⇒ **已注册** |
| 手动 pull | `POST /api/wps-grid-sync/pull` | `canWrite(req)`（admin/system_admin） | 存在 |
| 手动 trigger | `POST /api/wps-grid-sync/trigger` | 同上 | 存在（`:152`） |
| Webhook | `POST /api/wps-grid-sync/webhook` | 需公网可达；`WPS_WEBHOOK_SECRET` 可选 | **预留未接线**（代码注释自述"预留"） |

### 2.4 运行状态实测（这是"打通"与"在跑"的差别）

```sql
-- 生产库，BEGIN READ ONLY
SELECT COUNT(*) rows, to_char(MAX(last_sync_at),...) max_sync, to_char(MAX(wps_updated_at),...) max_wps_updated
FROM grid_record_sync_map;
```

| 项 | 值 |
|---|---|
| 映射行数 | 2061 |
| `MAX(last_sync_at)` | **2026-09-11 18:09** |
| `MAX(wps_updated_at)` | 2026-09-10 22:27 |

```sql
SELECT to_char(inspection_date,'YYYY-MM') mon, COUNT(*) FROM grid_inspection_records GROUP BY 1;
```

| 月份 | 行数（生产） | 行数（dev） |
|---|---|---|
| 2026-08 | 1724 | 1724 |
| 2026-09 | 1504 | 345 |
| **2026-10** | **0** | **0** |

→ **链路代码完整、调度器已注册、凭据齐备，但自 2026-09-11 之后没有新的 Pull 落库。**
→ 按任务书 §七 的分类，这属于 **B（已配置但未运行）**，不是 A（已实现且在跑）。

### 2.5 反向写入：恒封禁（三重硬锁）

| 层 | 实现 | 效果 |
|---|---|---|
| 引擎常量 | `wpsGridPullEngine.js:40` `const REVERSE_WRITE_ENABLED = false;` | 硬编码 false，非 env 开关 |
| 门面函数 | `wpsGridSyncService.js:87 pushRow()` → 直接 return `{disabled:true}` | 不触达任何 WPS 写 API |
| 挂钩 | `onPgRowChanged` / `onPgRowsDeleted` → no-op | 桌面改 PG 不传导到 WPS |

`WPS_SYNC_DELETE` / `WPS_SYNC_PUSH_CUTOFF` 两个环境变量**已失效**（代码注释明写"硬锁"），
即使配置也不生效。这是 WPS-PG-SYNC-01/02 阶段做的收敛，属已冻结状态。

---

## 3. 链路 B：H5 → 飞书（真实打通，正在跑）

见 `B00-手机H5-飞书-PG事实链核验.md` §3。此处只摘与边界相关的点：

| 项 | 事实 |
|---|---|
| 后端适配器 | `worker/storage/index.js:15` `getAdapter = () => feishuAdapter`（硬编码，无开关） |
| 后端类型 | `storageConfig().backend === 'feishu'` |
| 是否连 PG | **否**（`wrangler.toml` 注释「本 POC 不连接 PG / HSE / JWT，不写库」） |
| 是否连 WPS | **否**（`wpsAdapter` 已删除） |
| 实际业务量 | 主台账 **1608 条**（2026-09-29 ~ 2026-10-27）；隐患表 **2 条** |

---

## 4. 六维度隔离验证（回答"能不能合并"）

| 维度 | WPS → PG | H5 → 飞书 | 是否共享 |
|---|---|---|---|
| 运行宿主 | Node/Express（`server/`） | Cloudflare Worker | ❌ |
| 传输层 | HTTP 直连 server（PG） | Pages Functions → Worker | ❌ |
| 认证体系 | WPS OAuth（服务端凭据） + JWT | Worker Session（`WORKER_SESSION_SECRET`，HS256，自签自验） | ❌ |
| 数据底座 | PostgreSQL | 飞书 Bitable | ❌ |
| 同步机制 | cron 15min + 手动端点 | 无（无同步） | ❌ |
| 代码目录 | `server/services/wps*` / `server/routes/wps-*` | `grid-mobile-cloudflare/**` | ❌ |
| 业务域 | 网格巡查台账 / 三违 | 隐患 + 巡查/三违（飞书主台账） | ⚠️ **概念重叠** |

> 唯一交集是「业务语义都含巡查台账」。**物理层面零共享。**

---

## 5. 为什么必须保持两条独立链路（技术理由，不是偏好）

### 5.1 数据模型不兼容

| 维度 | WPS 多维表格 | 飞书 Bitable |
|---|---|---|
| 主键 | `wps_record_id`（业务序号/记录 ID 混合，见 `api/hse/site.ts` 注释） | `record_id`（`recxxxx` 字符串） |
| 字段契约 | 18 列冻结投影（SYNC_PROJECTION），hash 口径固定 | 38 列，且**运行时可自动建列**（`ensureHazardRectFields`） |
| 变更检测 | `canonicalHash`（18 列 SHA-256，`''≡null`） | 无（无 hash 机制） |
| 写入语义 | 单向 Pull，反向硬锁 | 双向（提交/指派/整改/验收都写） |
| 排除机制 | BT/EA 冻结排除，`WPS_SYNC_EXCLUDE_EXTRA` 只能追加不能移除 | 无 |

**飞书的表结构会自己长（代码自动 `ensureField`），WPS 侧是 18 列 hash 冻结。**
把两者放进同一个同步引擎，等于让"可自动漂移的结构"去喂"禁止漂移的 hash 口径" —— 必然冲突。

### 5.2 认证不可合并

Worker 的 Session 密钥 `WORKER_SESSION_SECRET` 与 `JWT_VERIFY_SECRET` **被明确要求不同**
（`wrangler.toml` 注释：「若复用，Worker 签出的 token 会被本地 HSE 后端接受，跨系统信任升级」）。
即：**架构上刻意切断了两侧的信任传递。**

### 5.3 业务节奏不同

| 维度 | WPS 巡查 | H5 隐患 |
|---|---|---|
| 写入频率 | 每天数十~上百条（1724/月） | 极低（2 条 / 3 个月） |
| 写入者 | 网格长（桌面） | 安环管理部（手机，`hazardGate` 限定） |
| 状态机 | 无（台账式留痕） | 3 值闭环 + 打回计数 |
| 附件 | 无（照片在 PG 侧） | 有（飞书附件列，type 17） |

把低频高复杂（隐患）与高频低复杂（巡查）塞进同一个同步通道，会让"隐患改一次要等 15 分钟 cron"。

### 5.4 一旦合并会发生的具体故障

| 场景 | 后果 |
|---|---|
| 用 WPS 引擎拉飞书隐患 | `canonicalHash` 依赖 18 列固定顺序；飞书 38 列且可增长 ⇒ hash 永不匹配 ⇒ 每轮全量 UPDATE |
| 用飞书 Worker 写 WPS 巡查 | Worker 无 WPS 凭据（已删 wpsAdapter）⇒ 需回填 OAuth ⇒ 触碰 WPS 生产链 |
| 共用 PG 写入器 | 巡查表 1724 行/月 vs 隐患表 2 行/3 月，事务粒度与频率差 3 个数量级 |
| 共用幂等 | WPS 用 `wps_record_id` + hash；飞书用 `cid` 寄生「备注」文本 ⇒ 无共同键 |

---

## 6. 手机 H5 是否错误复用了 WPS？（任务书 §十五）

```text
$ grep -rn "wps" grid-mobile-cloudflare/frontend/*.js
check.app.js:1831:  …（cfwps97-photo-watermark）…      ← 测试用例名，非调用
check.app.js:3506:  …（worker/test/cfwps89-*.test.mjs）← 测试文件名，非调用
```

- 前端 **0 处** WPS API / OAuth / 表格接口调用
- Worker 端 `wpsAdapter` 已删除，`getAdapter()` 硬编码 feishu
- `pages/functions/wps/[[route]].js` 仅把 `/wps/*` 反代给 Worker（照片上传历史路径），**不涉及金山 WPS**

> **PASS：未发现手机 H5 通过 WPS 的生产链路。**
> 也**未发现**历史代码/测试代码中残留可执行的 WPS 调用（仅注释与文件名提及）。
> 按任务书要求，即使发现也不删除 —— 本轮未删除任何文件。

---

## 7. 两条链的现状对照（一张表看清）

| | WPS → PG | H5 → Feishu | Feishu → PG |
|---|---|---|---|
| 代码是否存在 | ✅ 完整 | ✅ 完整 | ❌ **不存在** |
| 是否有配置 | ✅ 8 个 `WPS_*` | ✅ `wrangler.toml` + secret | ❌ |
| 是否有凭据 | ✅ | ✅ | ❌ |
| 是否有触发入口 | ✅ cron + 3 端点 | ✅ HTTP 请求即触发 | ❌ |
| 是否在运行 | ⚠️ **自 2026-09-11 停** | ✅ **在跑（1608 条）** | ❌ |
| 分类（§七） | **B 已配置但未运行** | **A 已实现且在跑** | **E 完全不存在** |
| 落点 | `grid_inspection_records` | 飞书 `tblnyMjxtxjpP08q` | — |
| 反向写入 | 恒封禁 | 双向（闭环） | — |
| 幂等 | `wps_record_id` + 18 列 hash | `cid` 寄生「备注」+ 内存缓存 | 无 |

---

## 8. 边界结论

```text
链路 A  WPS → PG      = 已打通，当前停流（2026-09-11 后 0 新增）
链路 B  H5 → 飞书      = 已打通，正在运行（主台账 1608 条 / 隐患表 2 条）
链路 C  飞书 → PG      = 不存在

A 与 B 必须独立：
  六维度零共享（宿主/传输/认证/底座/同步/代码）
  唯一交集是业务语义，不是基础设施

禁止的错误做法（本任务已核验未发生）：
  ✗ 让 H5 改走 WPS
  ✗ 用 WPS 引擎拉飞书隐患
  ✗ 把 /wps/records/create 当金山 WPS 理解

任何后续"打通飞书 → PG"的工作，只能在链路 C 这一段进行，
不得通过修改 H5 → 飞书 来实现。
```
