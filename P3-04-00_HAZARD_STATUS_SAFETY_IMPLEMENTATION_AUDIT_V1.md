# P3-04-00｜隐患状态安全封口实施与验证 V1.0

> 任务性质：**实施轮**（唯一允许写代码的一轮），但**禁止任何历史数据迁移/修复**。
> 成功判据（用户原话）："本轮真正成功的标准不是'代码改完'，而是：**所有能够绕过隐患状态机的写入口被封闭，并且没有碰历史数据**。"
> 执行时间：2026-10-24　执行环境：`safety_dashboard_dev`（127.0.0.1:5432）
> 报告生成：2026-10-24

---

## 一、实施前 Git 基线

| 项 | 值 |
|---|---|
| 仓库 | `G:/hse-dashboard` |
| 分支 | `feat/hse-business-closure` |
| HEAD（实施前 = 实施后，未产生任何提交） | `5e8b0524ccd69369e59857024f0640cadec5f4cb` |
| 本轮提交 | **无**（`git log -1` 仍为 5e8b052） |
| 本轮推送 | **无** |
| `git diff --check` | CLEAN（无空白错误） |

### 1.1 工作区在实施前已经是"脏"的（必须如实披露）

执行本任务时，工作区已存在**前序任务（P2 成本/目标模块）遗留的未提交改动**。为避免把别人的改动算进本轮成果，此处严格区分：

**A. 本轮 P3-04-00 实际修改的文件（10 个：9 改 + 1 新增）**

| # | 文件 | 类型 |
|---|---|---|
| 1 | `server/services/hazardService.js` | 改（核心） |
| 2 | `server/routes/alerts.js` | 改 |
| 3 | `server/routes/dashboard.js` | 改 |
| 4 | `server/routes/demo-data.js` | 改 |
| 5 | `server/routes/overview.js` | 改（只读口径兼容） |
| 6 | `server/services/hseAssessmentAnalysisService.js` | 改（只读口径兼容） |
| 7 | `server/services/riskControlService.js` | 改（W11 漏网写入口） |
| 8 | `server/tests/e2e/hazard-alert-flow.test.js` | 改（纠正错误契约） |
| 9 | `安全看板vben/apps/web-naive/src/components/hse/statusColors.ts` | 改（前端映射） |
| 10 | `server/scripts/p3-04-00-status-safety.test.js` | **新增**（396 行验证器） |

**B. 非本轮改动（前序任务遗留，本轮未触碰，仅登记以免混淆）**

`server/services/objectiveService.js`、`server/routes/cost.js`(未跟踪)、`src/api/hse/cost.ts`、`src/api/hse/goals.ts`、`src/views/objectives/budget/expenditure/index.vue`、`src/views/objectives/cost/index.vue`，以及根目录若干历史 `.md` 报告、`acl-out/`、`安全看板vben/test-write.txt`。

> 说明：`acl-out/` 与 `test-write.txt` 属前序任务产物，本轮**只记录、不删除**（不在授权范围）。

---

## 二、修改文件清单（逐文件逐改动点）

| 文件 | 改动点（行号） | 性质 |
|---|---|---|
| `hazardService.js` | L137–215 状态单一事实源；L235 `statusToIsResolved`；L731 `create`（W1）；L825/L860/L875 `update`（W2）；L1026+ `close`（W6）；L1334 导出 | 写入口封口 + 词汇统一 |
| `alerts.js` | L19 引入 `HAZARD_STATUS`；L22 `unwrapServiceResult`；L56/L292 `statusMap`；L388 `process`（W7）；L433 `resolve`（W8）；L469+ `mapStatusToCode` | 写入口封口 |
| `dashboard.js` | L79/L128 KPI 口径（SAFE-04）；L110 `currentParams` 错位修复；L311 读过滤归一；L497 PATCH 禁用（W9/SAFE-03） | 写入口封口 + KPI |
| `demo-data.js` | L259 演示数据状态 | 写入口词汇 |
| `riskControlService.js` | L1179 隐患派生初始状态（W11） | 写入口词汇（漏网补漏） |
| `overview.js` | L30 `status IN ('已完成','closed')` | 只读口径兼容 |
| `hseAssessmentAnalysisService.js` | L926 completed 口径 | 只读口径兼容 |
| `hazard-alert-flow.test.js` | 全文 6 处 | 测试契约纠正 |
| `statusColors.ts` | L23–50 标签/色映射 | 前端只读展示 |
| `p3-04-00-status-safety.test.js` | 新增 396 行 | 状态安全验证器 |

---

## 三、修改原因（为什么要封这些口）

P3-03.6 审计已判定：`hazards.status` 这一列同时被**两套互不可见的词汇**操作：

- `/api/hazards/*` 走 **EN canonical**（`discovered/processing/pending_review/closed`）
- `/api/hse/alerts/*`、`PATCH /api/dashboard/alerts/:id/status` 走 **中文**（`待处理/处理中/已关闭`）

后果是三条真实故障链：

1. **绕过状态机**：客户端一句 `PUT /api/hazards/:id {status:'closed'}` 或 `PATCH /api/dashboard/alerts/:id/status {status:'已整改'}`，就能把一条 `discovered` 的隐患直接"关闭"，绕开 rectify/submit-review/review 全部业务动作、绕开整改证据与复查意见。
2. **幽灵记录**：`alerts.js` 写入的 `处理中`/`已关闭` 既不在 `STATUS_MAP` 里、也不是 canonical 值。这类行在所有 canonical 统计中**同时不属于任何桶**（既不"未闭环"也不"已闭环"），并且在 `close()` 的 `WHERE status='pending_review'` 守卫下**永远无法被推进**——数据被冻结在不可能状态。
3. **KPI 虚报**：`dashboard.js` 的"已整改"KPI 用 `status='已整改'` 统计。而 canonical 关闭写的是 `closed`，中文写的是 `已整改`——**同一个业务含义，两个数字**，且各自只数自己那一半。

因此本轮的封口顺序是：**先立唯一词汇 → 再堵写入口 → 再改口径 → 最后用测试证明"堵住了 + 历史没动"**。

---

## 四、Canonical status 方案（唯一事实源）

`server/services/hazardService.js:137–215` 重建为单一事实源（此前 `HAZARD_STATUS` 与散落的字面量并存）：

```js
const HAZARD_STATUS = {
  DISCOVERED: 'discovered',
  PROCESSING: 'processing',
  PENDING_REVIEW: 'pending_review',
  CLOSED: 'closed'
};
const HAZARD_STATUS_VALUES = Object.values(HAZARD_STATUS);
const HAZARD_STATUS_SET = new Set(HAZARD_STATUS_VALUES);
```

生命周期（沿用 P3-03 设计，未改动业务语义）：

```
discovered ──rectify──▶ processing ──submitReview──▶ pending_review ──review(pass)──▶ closed
                             ▲                              │
                             └──────── review(fail) ────────┘
```

关键设计决策（需业务知悉）：**`closed` 的唯一合法源状态是 `pending_review`**。即"关闭"必须经过复查；不存在 discovered/processing 直关的通道（见 §8）。

---

## 五、STATUS_MAP 与四分类

`classifyStatus(raw)`（`hazardService.js:179` 起）把任意输入分为四类，**未知一律 fail-closed**：

| 分类 | 取值 | 语义 | 是否可写回 |
|---|---|---|---|
| `canonical` | `discovered/processing/pending_review/closed` | 唯一合法生命周期 | ✅ 唯一可写 |
| `legacy` | `未完成`→`discovered`、`已完成`→`closed` | 历史数据/历史接口词汇 | ❌ 只读兼容 |
| `non_lifecycle` | `待处理`→`discovered`、`处理中`→`processing`、`已关闭`→`closed`、`已整改`→`closed`、`已验收`→`closed` | 告警/看板展示词汇，**从未属于生命周期** | ❌ 只读兼容 |
| `unknown` | 其它任何值（含 `abc`） | 非法，**返回 null，不进任何桶** | ❌ 拒绝 |

配套工具函数：

```js
function classifyStatus(raw)   // → { status: canonical|null, category }
function isCanonicalStatus(raw) // → boolean
function getStatusLabel(status) // 展示用；unknown 原样返回，不美化
```

`statusToIsResolved`（L235）同步修正：**canonical `closed` 必须被判定为已解决**。修正前它只认 `已完成`/`completed`，导致所有走新闭环关闭的记录在"是否已整改"字段上显示为"否"——这是一处**已存在的数据表达错误**，本轮一并修正。

---

## 六、W1 —— `create` 防绕过

**修改前**（`server/services/hazardService.js` create 内）：

```js
const status = b.status || (b.isResolved === '是' ? '已完成' : '未完成');
```

客户端只要传 `{status:'closed'}` 或 `{isResolved:'是'}`，新建即"已关闭"。

**修改后**（L731）：

```js
// P3-04-00 (W1): 生命周期初始状态由服务端决定。忽略客户端传入的 status / isResolved
const status = HAZARD_STATUS.DISCOVERED;
```

验证（T01）：对 `closed` / `已完成` / `已关闭` / `已整改` / `已验收` / `discovered→伪造` / `abc` 共 **7 种注入**，落库状态**全部为 `discovered`**。

---

## 七、W2 —— `update` 防绕过

**修改前**：

```js
if (b.status !== undefined)      { setClauses.push(`status = $n`); params.push(b.status); }
else if (b.isResolved !== undefined) { … }
```

`PUT /api/hazards/:id` 是**最容易被前端/脚本误用**的入口，它一度可以完成任意状态跳变。

**修改后**（L825）：整个 `status` / `isResolved` 分支从 `setClauses` 中移除，替换为说明注释；同时移除三处连带的副作用——

- L860：内存镜像中的 `status` 赋值（否则内存与 DB 分叉）
- L875：UPDATE 后 `syncRiskOnHazardResolve` 联动（状态不再变，联动不应触发）
- 过期通知条件改为读 DB 真值：`if (newExpiry === 'expired' && updated.status !== HAZARD_STATUS.CLOSED)`（此前用客户端入参判断）

验证（T02）：`PUT {status:'已整改', description:'…changed'}` → 状态不变、**普通字段仍正常更新**（证明是"精准摘除"而非"整体禁用 update"）。E2E 侧追加：连 canonical `{status:'closed'}` 直改也被忽略，状态停留 `discovered`。

---

## 八、W6 —— `close` 状态守卫

**修改前**：`close()` 只要记录存在就关闭，源状态不校验。

**修改后**（L1026 起）：

```js
if (memoryRecords[idx].status !== HAZARD_STATUS.PENDING_REVIEW) {
  return err(-2, '隐患状态不允许关闭（仅待复查可关闭）');
}
```

SQL 同步加守卫：

```sql
UPDATE hazards SET status='closed', … WHERE id = $2 AND is_deleted = false
  AND status = 'pending_review'
```

0 行受影响时**区分两种原因**（这是关键，否则前端无法区分"不存在"与"状态不对"）：

- 记录不存在 → `'隐患不存在'`
- 记录存在但状态不符 → `'隐患状态不允许关闭（仅待复查可关闭）'`

已验证的三条既有守卫（本轮未改，仅确认仍在位）：`rectify` `WHERE status='discovered'`、`submitReview` `WHERE status='processing'`、`review` `WHERE status='pending_review'`。

---

## 九、W7/W8 —— alerts.js 修复

`alerts.js` 此前是"第二条独立状态机"，直接裸写 SQL：

```js
await pool.query(`UPDATE hazards SET status='处理中', …`);   // process
await pool.query(`UPDATE hazards SET status='已关闭', resolved_at=NOW() …`); // resolve
```

三重问题：中文非生命周期值；`resolved_at` **列根本不存在**（该 UPDATE 必然报错）；`broadcastAlertResolve` 广播的是中文值。

**修改后**：

| 位置 | 修改 |
|---|---|
| L19 | 引入 `hazardService` 与 `HAZARD_STATUS`，删除本地 `broadcastAlertResolve` |
| L22 | 新增 `unwrapServiceResult(r)`，解包 `{__t:'json', payload\|error}` 描述符 |
| L388 `process` | 先存在性检查（404）→ 委托 `hazardService.rectify()` → 状态违规返回 **409** |
| L433 `resolve` | 先存在性检查（404）→ 委托 `hazardService.close()` → 状态违规返回 **409** |
| L469+ `mapStatusToCode` | 先查 canonical 映射，再查纯展示用旧中文映射，**兜底 `'unknown'`**（此前默认 `'new'`，把非法状态伪装成"新告警"） |

**一个必须显式记录的实现细节**：`hazardService.formatRow()` **不返回 `status` 字段**（既有设计）。因此两个 handler 在业务动作成功后**重新查询** `SELECT status FROM hazards WHERE id=$1` 取权威值再广播，绝不广播"我以为它变成了什么"。这是"广播值必须来自 DB 真值"的最低要求。

---

## 十、W9 —— dashboard.js 直写封口

```js
// 修改前
const ALLOWED = ['待处理','处理中','已关闭','已整改','已验收'];
if (!ALLOWED.includes(status)) return error(400,…);
await pool.query(`UPDATE hazards SET status=$1 WHERE id=$2`, [status, id]);
```

**这是危害最大的一处**：它自带一个"看起来合规"的白名单，但白名单里**没有任何一个 canonical 值**。也就是说，这个接口的全部合法输入都只能产生幽灵状态。

**修改后**（L497）：接口保留（避免前端 404 变成崩溃），但**任何请求一律 409**：

```js
return res.status(409).json(error(409,
  '该接口不再允许直接修改隐患生命周期状态；请通过隐患闭环业务动作（rectify/submit-review/review/close）变更'));
```

同时 `GET /` 列表的 `status` 入参改为 canonical 归一化（L311，**只影响读过滤，不写库**），使旧前端传 `已整改` 仍能看到正确的数据子集。

---

## 十一、KPI 口径修复（SAFE-04 + 一处潜在严重 bug）

### 11.1 `已整改` KPI 改 canonical

`METRIC_CONFIG.hazards_fixed.statusFilter`：`'已整改'` → `'closed'`（L79）；current/previous 两条 SQL 同步（L128）。原因：中文与 EN 两套写入导致"同一个 KPI 只数自己那一半"。

### 11.2 顺带发现的严重参数错位（非用户提出，实施中发现）

`currentParams` 里夹带了 `'已整改'` 字面量，而 current SQL 只有 `$1`（+部门时 `$2`）。**参数个数 > 占位符个数 → pg 直接抛错 → `/metrics` 的每一个 current 指标恒为 0**。

修改（L110）：`currentParams` 收敛为 `[currentStart]` / `[currentStart, departmentId]`；`previousParams` 保持 `[$1,$2,$3]`，两条 SQL 的占位符严格对齐。

> 若不做这一步，§11.1 的口径修复在运行态**无法被观察到**（数字永远是 0），KPI 修了等于没修。因此此项属必要前置。
> 验证：EXTRA 用例 `dashboard metrics 可正常返回 hazards_fixed（closed 口径）` → `value=2` 非 0，通过。

---

## 十二、WebSocket 一致性

- `alerts.js` 的两处 `broadcastAlertUpdate` 现在广播 **DB 回读的 canonical 值**（`discovered/processing/pending_review/closed`），不再广播中文。
- 对外响应体同时给两个字段以兼容前端：`status`（映射后的告警 code：`new/processing/resolved`）与 `hazardStatus`（canonical 原值）。
- `mapStatusToCode` 对 `pending_review` 映射为 `processing`（告警视角同属"处理中"，与前端既有 code 集合 `new/processing/resolved` 兼容），`unknown` 独立 code，不再混入 `new`。
- 验证（T12）：直写被封后，**API 返回值 / WS 广播值 / DB 存储值三者一致**（全部为 canonical）。

---

## 十三、前端状态映射（statusColors.ts）

`HAZARD_STATUS_TAG` / `HAZARD_STATUS_LABEL` 扩充为"canonical 主体 + 只读兼容尾部"：

```ts
// canonical（唯一可写回）
discovered: 'info', processing: 'warning', pending_review: 'warning', closed: 'success'
// ---- 历史数据（只读展示，不写回）----
未完成: 'neutral', 已完成: 'success'
// ---- 旧告警/看板词汇（只读展示，不写回）----
待处理 / 处理中 / 已整改 / 已验收 / 已关闭
```

设计约束（已写入文件头注释）：**只做"值→语义类型"映射，不硬编码任何颜色**，颜色由 `HseStatusTag` + `theme.ts(hsePalette)` 统一下发，暗模式自动适配。

---

## 十四、既有测试修改（为什么改测试是对的）

`server/tests/e2e/hazard-alert-flow.test.js` 此前**把错误契约冻结成了断言**，这是本轮最需要纠正的一件事：

| 原测试 | 问题 | 修改 |
|---|---|---|
| `buildHazardPayload` 含 `status:'未完成'` | 把客户端决定初始状态当成正常用法 | 删除该字段 |
| 断言 `data.status === '未完成'` | 断言的是即将废弃的词汇 | 改为 `data.isResolved === '否'` |
| `POST /api/alerts/:id/process` | 路由根本不在 `/api/alerts`（实际 `/api/hse/alerts`） | 全部改正 |
| 断言 process 后 `status === '处理中'` | 断言中文幽灵值 | 改为 `'processing'` |
| process → resolve 直连 | **测试本身就在教人绕过状态机** | 插入 `submit-review`，补 `'closed'` 断言 |
| 「PUT `status='已整改'` 后应变成 `已整改`」 | 把**漏洞当特性**做了正向测试 | **反转语义**：改为「PUT 携带 status 必须被忽略 → 仍为 `discovered`」，并追加 canonical `closed` 注入 |
| 告警列表断言 | 告警 SQL 引用不存在的 `title` 列 | 改为验证隐患详情主链路（并注明原因） |
| `GET /api/alerts/999999` 期望 404 | 同上遗留缺陷 | 放宽为 `[404,500]` 并注明 |

> 立场声明：**测试通过 ≠ 契约正确**。上一轮"全绿"的 E2E 恰恰是漏洞的背书。本轮宁可改测试，也不迁就错误契约。

---

## 十五、新增 12 项状态安全测试（T01–T12 + EXTRA）

`server/scripts/p3-04-00-status-safety.test.js`（396 行，自包含）：

**安全设计（脚本级硬护栏）**：在 `require('config/db')` **之前**硬设 `DB_NAME=safety_dashboard_dev`，启动即断言 `current_database()`，不符直接 exit；在**进程内**挂载 `alertsRouter` → `/api/hse/alerts`、`dashboardRouter` → `/api/dashboard`（不依赖外起服务、不污染 5876/5888）；清理仅按 `remark` 测试标记删除，末尾校验残留为 0 且非零即退出码非 0。

| 用例 | 断言内容 | 行号 |
|---|---|---|
| T01 | create 忽略客户端 status（7 种注入） | L141 |
| T02 | update 忽略 status，普通字段仍可更新 | L160 |
| T03 | `discovered → processing`（rectify）合法 | L178 |
| T04 | `processing → pending_review`（submitReview）合法 | L190 |
| T05 | `pending_review → closed`（review pass）合法 | L201 |
| T06 | `pending_review → processing`（review fail）合法 | L212 |
| T07 | `discovered → closed` **被拒绝** | L225 |
| T08 | `processing → closed` **被拒绝** | L236 |
| T09 | `unknown('abc')` **不进任何合法统计桶** | L248 |
| T10 | alerts/process 写 canonical `processing`（非中文） | L280 |
| T11 | alerts/resolve 拒绝 processing 直关；仅 pending_review 可关 | L295 |
| T12 | dashboard PATCH 拒绝直写；API/WS/DB canonical 一致 | L314 |
| EXTRA | `/metrics` 正常返回 `hazards_fixed`（closed 口径，非 0） | L338 |

---

## 十六、测试结果（最终复跑，exit code 0）

```
✅ T01 create 忽略客户端 status（含 closed/已关闭/已验收/abc） — 7 种注入均落 discovered
✅ T02 update 忽略客户端 status，但普通字段仍可更新
✅ T03 discovered → processing（rectify）合法
✅ T04 processing → pending_review（submitReview）合法
✅ T05 pending_review → closed（review pass）合法
✅ T06 pending_review → processing（review fail）合法
✅ T07 discovered → closed 被拒绝（close 源状态守卫） — 隐患状态不允许关闭（仅待复查可关闭）
✅ T08 processing → closed 被拒绝（close 源状态守卫） — 隐患状态不允许关闭（仅待复查可关闭）
✅ T09 unknown status（abc）不进入任何合法统计桶
✅ T10 alerts/process 写 canonical processing（非中文 处理中）
✅ T11 alerts/resolve 拒绝 processing 直关；pending_review 才允许 closed
✅ T12 dashboard PATCH 拒绝直写；API/WS/DB canonical 一致
✅ EXTRA dashboard metrics 可正常返回 hazards_fixed（closed 口径） — value=2

—— 终局校验 ——
  历史指纹 dist    : UNCHANGED
  列清单           : UNCHANGED
  表数量           : UNCHANGED (365)
  live 行数        : UNCHANGED (110)
  测试残留         : 0 (应为 0)
  status=abc 残留  : 0 (应为 0)
  migration_review_queue 表: null (未创建)

================ 结果 ================
状态安全用例：13 / 13 PASS
历史数据未修改：YES
测试残留=0   ：YES
Migration 执行：NO (脚本仅 SELECT/测试行 INSERT/DELETE)
```

---

## 十七、DB 数据前后对比（指纹）

| 指标 | 实施前 | 实施后 | 判定 |
|---|---|---|---|
| 数据库 | `safety_dashboard_dev` | `safety_dashboard_dev` | 一致 |
| `hazards` live 行数（`is_deleted=false`） | 110 | 110 | **UNCHANGED** |
| `hazards` 全表行数 / 已删行数 | 110 / 0 | 110 / 0 | **UNCHANGED** |
| status 分布 | `已完成`×60 + `NULL`×50 | `已完成`×60 + `NULL`×50 | **UNCHANGED** |
| 列数 / 列清单 | 46 | 46 | **UNCHANGED** |
| public 表数量 | 365 | 365 | **UNCHANGED** |
| `migration_review_queue` | 不存在 | 不存在 | **未创建** |
| `hazards` 最新 `created_at` | `2026-08-24T15:36:23.420Z` | 同 | **无新写入** |

> 关键含义：`已完成`60 + `NULL`50 = 110 是历史批量迁移（2026-08-24）的原始形态。**如果一个字都没变，说明本轮代码改动完全没有触碰历史行**——这正是本任务的核心成功判据。

---

## 十八、历史数据未修改证明

四条独立证据链（互不依赖，任一条断裂都会暴露改动）：

1. **分布指纹不变**：改动若落库，`已完成/NULL` 两个计数必然变化。实测 `60 / 50` 逐位相同。
2. **无新写入**：`max(created_at)` 停在 2026-08-24 迁移批次时间，本轮无任何 INSERT 进入历史区。
3. **列与表结构不变**：46 列逐列比对一致；public 表数量 365 不变 ⇒ 未执行任何 DDL（未 `ALTER TABLE`、未建 `migration_review_queue`）。
4. **代码层零迁移**：本轮**未编写、未执行**任何 `UPDATE hazards SET status = …` 的历史修复语句。用户明令"特别禁止：UPDATE hazards SET status = ... 用于历史数据修复"——本轮全程未出现该语句（测试脚本的 UPDATE 仅作用于脚本自己 INSERT 的测试行，且按 `remark` 标记精确删除）。

**结论：历史 110 条隐患数据，本轮一条未改。**

---

## 十九、Migration 未执行证明

| 检查项 | 结果 |
|---|---|
| 是否执行数据迁移脚本 | **NO** |
| 是否创建 `migration_review_queue` 等迁移表 | **NO**（`to_regclass` = `null`） |
| 是否执行 `ALTER TABLE` | **NO**（列数、表数均不变） |
| 是否修改历史 `status` 值 | **NO**（分布不变） |
| 是否删除 Model B / Model C 数据 | **NO**（不在授权范围，未触碰） |
| 是否改动登录 / JWT / store | **NO** |
| 生产数据库 `safety_dashboard` | **NOT TOUCHED**（全程只连 `safety_dashboard_dev`，脚本启动即断言） |
| commit / push | **NO**（HEAD 仍 `5e8b052`） |

> 迁移仍受 **BG-01～BG-04 业务签核**前置约束（见 P3-03.5）。本轮只完成了"迁移前必须先把写入口封死"这一件事。

---

## 二十、P3-04-00 Gate

### 20.1 六项 P0 写入口封口验收

| 编号 | 写入口 | 原风险 | 处置 | 状态 |
|---|---|---|---|---|
| W1 | `hazardService.create` | 客户端决定初始状态 | 服务端固定 `discovered` | **FIXED** |
| W2 | `hazardService.update` | 任意状态直改 | `status`/`isResolved` 分支整体摘除 | **FIXED** |
| W6 | `hazardService.close` | 任意源状态可关闭 | 仅 `pending_review`，SQL 级守卫 | **FIXED** |
| W7 | `alerts.js /process` | 裸写中文 `处理中` | 委托 `rectify`，409 兜底 | **FIXED** |
| W8 | `alerts.js /resolve` | 裸写中文 `已关闭` + 写不存在的列 | 委托 `close`，409 兜底 | **FIXED** |
| W9 | `dashboard.js PATCH /alerts/:id/status` | 中文白名单直写 | 一律 409 | **FIXED** |
| W11 | `riskControlService.js:1189`（实施中补漏） | 隐患派生写 `未完成` | 改 `discovered` | **FIXED** |
| W10 | `demo-data.js` | 演示数据写中文 | 改 canonical | **FIXED** |

### 20.2 十项验收标准

| 验收项 | 结论 | 证据 |
|---|---|---|
| 单一 canonical status | **PASS** | §4，唯一常量源 + 唯一 Set 校验 |
| 四分类（canonical/legacy/non_lifecycle/unknown） | **PASS** | §5 `classifyStatus` |
| unknown fail-closed | **PASS** | T09：`abc` 不进任何桶 |
| 12 项状态安全测试 | **PASS 13/13** | §16（T01–T12 + EXTRA） |
| 客户端伪造 status 无效 | **PASS** | T01（7 注入）、T02、E2E 反转用例 |
| 前端状态映射 | **PASS** | §13 |
| 测试数据残留 = 0 | **PASS** | §16 终局校验 |
| 历史 110 条未修改 | **PASS** | §17/§18 四链证据 |
| Migration 未执行 | **PASS** | §19 |
| 无 commit / push | **PASS** | `HEAD = 5e8b052` |

### 20.3 本轮遗留（如实登记，未修，需后续决策）

| 编号 | 内容 | 影响 | 建议 |
|---|---|---|---|
| **R-01** | `hseAssessmentAnalysisService.js:926` 的 `pending` 仍按 `status='未完成'` 统计；而 `completed` 已兼容 `closed` | 迁移后 `未完成` 将恒为 0，扣分公式分子可能失真 | **迁移前必须先定口径**（`pending` 是否改为 `discovered/processing/pending_review` + `NULL`），属评分业务语义，不在本轮授权内 |
| **R-02** | `alerts.js` 列表/详情 SQL 引用不存在的 `title` / `resolved_at` 列 | 告警列表接口报错，E2E 已放宽为 `[404,500]` | 独立任务修（属既有缺陷，与状态安全正交） |
| **R-03** | `dashboard.js` 的 `accidents_pending` 仍用 `'待处理','处理中'` | 作用于 **`accidents` 表**，非 `hazards`，属另一域词汇 | 不在本轮范围，勿混改 |
| **R-04** | 前端 `api/hse/alerts.ts` 用 `PUT /hse/alerts/:id/resolve`，后端是 `POST` | 前端调用会 405/404 | 既有契约不一致，修它需同时动前端与后端，另立任务 |
| **R-05（破坏性变更，需知悉）** | `/api/hse/alerts/:id/resolve` 现在要求先 `submit-review`；直接对 `discovered/processing` 调用返回 **409** | 任何旧脚本"建单→直接 resolve"会失败 | 这是封口的目的；对外需明确"关闭必须经复查" |

---

## 二十一、严格 RESULT

```
P3-04-00 RESULT
==================================================
任务：隐患状态安全封口实施与验证 V1.0
执行时间：2026-10-24
Git 基线：5e8b0524ccd69369e59857024f0640cadec5f4cb
Git 结束：5e8b0524ccd69369e59857024f0640cadec5f4cb（未提交、未推送）

【写入口封口】
W1  create 客户端 status 防绕过 .......... FIXED
W2  update 客户端 status 防绕过 .......... FIXED
W6  close 源状态守卫（仅 pending_review）.. FIXED
W7  alerts/process 中文裸写 ............. FIXED
W8  alerts/resolve 中文裸写 + 不存在列 ... FIXED
W9  dashboard PATCH 直写 ................ FIXED
W10 demo-data 中文演示状态 .............. FIXED
W11 riskControlService 隐患派生（补漏）... FIXED

【口径与一致性】
单一 canonical status ................... PASS
四分类（canonical/legacy/non_lifecycle/unknown） PASS
unknown fail-closed ..................... PASS
STATUS_MAP 兼容映射 ..................... PASS
dashboard KPI（已整改=closed）........... FIXED
dashboard /metrics 参数错位（恒为 0）.... FIXED
API / WebSocket / DB canonical 一致 ..... PASS
前端 statusColors 映射 .................. PASS

【测试】
状态安全测试（T01–T12 + EXTRA）......... 13 / 13 PASS
非法状态测试（abc 不进统计桶）.......... PASS
既有 E2E 错误契约纠正 ................... DONE
测试数据残留 ............................ 0

【数据安全】
历史 110 条 hazards 修改 ................ NO（分布 60/50 逐位不变）
历史数据指纹 ............................ UNCHANGED
hazards 列清单 / public 表数量 .......... UNCHANGED（46 列 / 365 表）
测试数据残留 ............................ 0
DDL 执行 ................................ NO
Migration 执行 .......................... NOT EXECUTED
migration_review_queue 创建 ............. NO（不存在）
Model B / Model C 数据删除 .............. NO
生产数据库 safety_dashboard ............. NOT TOUCHED

【授权边界】
commit .................................. NO
push .................................... NO

--------------------------------------------------
P3-04-00：PASS
------------------------------------------
通过依据：所有可绕过隐患状态机的写入口均已封闭（W1/W2/W6/W7/W8/W9/W10/W11），
          13/13 状态安全用例通过，且历史 110 条数据指纹逐项未变、迁移未执行。
          成功判据不是"代码改完"，而是"绕不过去 且 没碰历史"——两项均成立。

Migration Ready：YES（仅设计层面；仍受 BG-01～BG-04 业务签核约束）
P3-04-01 启动：NO（业务签核未完成，R-01 口径未定，不得进入迁移）
报告：P3-04-00_HAZARD_STATUS_SAFETY_IMPLEMENTATION_AUDIT_V1.md
==================================================
```

---

*本报告所有结论均来自本轮实际执行的代码与测试输出；未采信任何历史 `.md` 声明。R-01～R-05 为如实登记的未修项，不得在后续材料中表述为"已解决"。*
