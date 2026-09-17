# MOBILE-WPS-V1 · 轻量中间层 REST 契约

> 状态：**契约已定义，服务端未实现**（NODE-01 明确不启动云服务器）。
> 消费方：`安全看板vben/apps/web-naive/src/api/mw/transports/http.ts`
> 生产方：未来的轻量中间层（NODE-04）。

---

## 0. 为什么需要中间层

```
❌ 不可行：手机浏览器 --(WPS client_credentials)--> WPS 多维表
   ⇒ 应用级凭证下发浏览器 = 交出整表读写权，WPS 侧无按登录用户的行级隔离。

✅ 本项目：手机浏览器 --(HTTPS + 会话令牌)--> 轻量中间层 --(WPS 凭证)--> WPS 多维表
   中间层只做三件事：
     ① 保管 WPS 凭证（AppId / Secret / Token / FileId / SheetId）
     ② 按会话做范围过滤（花名册候选池、区域可指派人员）
     ③ 把业务模型映射成 WPS 字段（含附件二段式写入）
```

**前端侧硬性保证**（测试 G1 / G3 静态扫描锁定）：

- 前端源码中**不存在**任何 WPS 凭证字面量；
- 前端源码中**不存在**任何直连 `*.wps.cn` 的 URL；
- 前端只持有**会话令牌**（V1 为手机号登录换取），不持有任何 WPS 凭据。

---

## 1. 通用约定

| 项 | 约定 |
|---|---|
| 基址 | `VITE_MW_API_BASE`，如 `https://mw.example.com/api/mw`。**未配置则不启用**（前端回落到本地 TEST 适配层） |
| 认证 | `Authorization: Bearer <会话令牌>`；无令牌即不发起请求 |
| Content-Type | `application/json`（照片上传为 `multipart/form-data`） |
| 业务主键 | `violationId`（`SW-YYYYMMDD-NNNN`）为路径参数，**不使用 WPS Record ID** |
| 时间格式 | ISO 8601 字符串 |
| 错误 | 非 2xx ⇒ 前端统一抛 `中间层请求失败（HTTP xxx）`；**不透传中间层原始报文**，避免泄露内部细节 |
| 204 | 返回 `undefined` |

### 前端的降级约定

- `resolvePhotoUrl` 换不出 URL 时**必须返回空串**（`{url: ""}` 或 404 → 前端兜底 `''`），页面渲染"附件无直链"占位，**不出现破图**。
- 中间层不可用时应返回 5xx，前端提示"中间层请求失败"，**不得**静默回落到本地 TEST 数据造成"提交成功但数据没进 WPS"的假象。

---

## 2. 接口清单

### 2.1 主数据

| 方法 | 路径 | 返回 | 说明 |
|---|---|---|---|
| GET | `/accounts` | `MobileAccount[]` | 账号表（含检查范围） |
| GET | `/roster` | `RosterEmployee[]` | 花名册 |
| GET | `/rules` | `ViolationRule[]` | 三违规则（`enabled=true`） |
| GET | `/areas` | `Area[]` | 责任区域（`status=ENABLED`） |

> ⚠️ 主数据**必须按会话范围过滤后返回**。禁止把整张花名册下发给前端再让前端筛——这等于把全公司人员名单暴露给任意登录者。

### 2.2 三违记录

| 方法 | 路径 | 返回 | 说明 |
|---|---|---|---|
| POST | `/violations` | `ViolationRecord` | 建单（含 BEFORE 照片绑定） |
| PATCH | `/violations/{violationId}` | `ViolationRecord` | 更新（状态流转 / 选人 / 选行为 / 整改 / 复查） |
| GET | `/violations/{violationId}` | `ViolationBundle \| null` | 单条 + 关联照片/转派/复查 |
| GET | `/violations` | `ViolationRecord[]` | 列表（**必须按会话范围过滤**） |
| GET | `/violations/next-seq?date=YYYYMMDD` | `{ seq: number }` | **原子分配**当日序号 |

> `next-seq` 是**并发关键点**：本地实现为单机计数，中间层必须保证原子性（DB 序列 / 唯一约束 / 分布式锁三选一），否则并发建单会产生重复 `violationId`。

### 2.3 照片

| 方法 | 路径 | 返回 | 说明 |
|---|---|---|---|
| POST | `/violations/{violationId}/photos` | `PhotoRecord` | `multipart/form-data`：`photoType`、`fileName`、`file` |
| GET | `/violations/{violationId}/photos` | `PhotoRecord[]` | |
| GET | `/photos/{photoId}/url` | `{ url: string }` | 换可访问地址；**换不出返回 `{url:""}`** |
| DELETE | `/photos/{photoId}` | `void` | |

> **强烈建议**：图片**不要**写进 WPS 原生 Attachment 字段。
> 原生附件值是 `{fileName, uploadId, source}`，无 URL；且本项目 V7 coop 域的"附件换 URL"端点实测 404。
> 推荐图片落中间层对象存储，`url` 列存可访问地址，绕开这项未确证能力。

### 2.4 转派 / 复查

| 方法 | 路径 | 返回 | 说明 |
|---|---|---|---|
| POST | `/transfers` | `TransferRecord` | 建转派单 |
| PATCH | `/transfers/{transferId}` | `TransferRecord` | 状态流转（PENDING→ACCEPTED→FEEDBACK→CLOSED） |
| GET | `/transfers` | `TransferRecord[]` | 列表（按会话过滤：我发起的 / 转派给我的） |
| POST | `/reviews` | `ReviewRecord` | 新增复查记录 |
| GET | `/violations/{violationId}/reviews` | `ReviewRecord[]` | 某记录的复查历史 |

---

## 3. 中间层必须复刻的业务约束

以下约束在前端 `core/flow.ts` 已实现，**中间层必须同样执行**（前端校验只是 UX，中间层才是安全边界）：

| 约束 | 说明 |
|---|---|
| **BEFORE 照片必须第一步** | 无 BEFORE ⇒ 拒绝建单 |
| 顺序 | 未选人 ⇒ 不许选行为；未选人/行为 ⇒ 不许整改或转派 |
| 范围 | 选人必须命中「登录人范围内的花名册候选池」，池外拒绝；**禁止姓名猜 employeeId** |
| 整改提交 | BEFORE 存在 + AFTER 存在 + 措施非空 + 整改责任人明确 |
| 转派 | 必须选区域 + 选管理员（禁止自由文本）；**转派人 ≠ 接收人**（发现人 ≠ 整改人） |
| 账号状态 | 停用账号不可登录、不可被选为责任人 |
| 规则状态 | `enabled=false` 的规则不可被选中 |
| 记录不可删除 | 只做状态流转，不提供删除接口 |
| **不计算扣分** | 中间层**不得**实现任何 E-08-11 扣分逻辑；V1 只记录事实 |

---

## 4. 状态机（中间层需同样校验）

```
DRAFT 待补充
  ├→ PENDING_RECTIFY 待整改
  ├→ RECTIFYING      整改中
  ├→ PENDING_REVIEW  待复查
  └→ TRANSFERRED     已转派

PENDING_RECTIFY → RECTIFYING | TRANSFERRED
RECTIFYING      → PENDING_REVIEW
PENDING_REVIEW  → COMPLETED | RECTIFYING
TRANSFERRED     → RECTIFYING
COMPLETED       终态
```

非法流转 ⇒ 返回错误，不静默接受。

---

## 5. 启用方式

```bash
# 安全看板vben/apps/web-naive/.env（或 .env.local）
VITE_MW_API_BASE=https://mw.example.com/api/mw
```

未配置该变量时，`getTransport()` 自动回落 `LocalTestTransport`（本机 TEST 数据，`isTestData=true`，UI 会明示）。
**不会**因为缺配置而把任何 WPS 密钥塞进前端。

---

## 7. NODE-04 可实现性审计（NODE-02A 补充）

> 依据任务书第十六条：只审计「NODE-04 按现有 REST Contract 是否可实现」，
> 若契约与 WPS 实际能力冲突，**只改本文件**，不实现 NODE-04、不启动云服务器。
> WPS 能力事实来源：NODE-01 真机验证 + `server/services/wpsClient.js` / `wpsDbsheetAdapter.js` 复核。

### 7.1 总体结论

```text
NODE-04 按现有 REST Contract：✅ 可实现
但契约存在 6 处「未约束的实现陷阱」，不改会在 NODE-04 现场返工。
⇒ 本节点已在下方补为**强制条款**（7.3），均为新增约束，不推翻既有接口签名。
```

### 7.2 冲突与缺口清单

| # | 契约条款 | WPS 实际能力 | 冲突性质 |
|---|---|---|---|
| **C-1** | `GET /violations/{violationId}`、`PATCH /violations/{violationId}` 以**业务键** `violationId` 寻址 | WPS **无单条按 ID 查端点**；`records/update` 只认 **WPS Record ID**，不认业务键 | 🔴 契约未规定「业务键 → Record ID」如何维护。不补 ⇒ 每次按业务键读写都要 `list_by_page` 全表 O(n) 扫描 |
| **C-2** | 主数据 `GET /roster` 等「必须按会话范围过滤后返回」 | `list_by_page` **不支持字段级条件过滤** | 🔴 1291 行花名册 = 每请求至少 13 次分页调用后才能过滤。不补 ⇒ 登录即雪崩 |
| **C-3** | `GET /violations/next-seq` 要求**原子分配**当日序号 | WPS **无计数器/序列/锁**；`records/create` 50 条/批 | 🔴 契约已提示原子性，但**未指明序号状态放哪**。WPS-only 中间层无处放 |
| **C-4** | `GET /photos/{photoId}/url` | V7 coop 域「附件换 URL」端点**实测 404**；Attachment 值 `{fileName, uploadId, source}` 不含 URL | 🟠 契约写的是「强烈建议」，未定为强制。不补 ⇒ 可能被实现成走 WPS 附件，直接不可用 |
| **C-5** | 全表读写 | 限频约 **10 req/s**；`create/update` **50 条/批**；响应 `fields_value` 是 **JSON 字符串** | 🟠 契约无节流与解析约束。不补 ⇒ 批量导入触发限频、字段映射静默错乱 |
| **C-6** | `t_*.status` / `photoType` 等用 `SingleSelect` | WPS 写入 SingleSelect 时，**选项值必须已存在于字段定义中** | 🟠 契约未约束建表顺序。不补 ⇒ 写入枚举值时报「选项不存在」 |

### 7.3 新增强制条款（NODE-04 必须遵守）

**M-1（对应 C-1）· 业务键 ↔ WPS Record ID 映射为强制要求**
中间层必须维护 `violationId → WPS Record ID` 的映射（独立映射表或启动时一次性全量建索引 + 增量维护）。
**禁止**在请求路径上对每个 `violationId` 做全表扫描。映射未命中 ⇒ 返回 404，**不得**退化为全表扫描。

**M-2（对应 C-2）· 主数据必须服务端缓存**
`/accounts`、`/roster`、`/rules`、`/areas` **必须**在中间层做内存缓存（建议 TTL ≥ 5 min 或按版本号失效）。
**禁止**每个前端请求都回源 WPS 全表分页。花名册按 `township` 建内存索引后按会话范围返回子集。
> 数据规模基线（NODE-02A 实测）：`t_roster` 1291 行、`t_account` ≤ 62 行、`t_area` 16 行。

**M-3（对应 C-3）· 序号分配必须有独立状态源**
`next-seq` 的序号状态**不得**只存在 WPS 里。允许三选一：① 中间层本地 DB 序列；② WPS 表上的唯一约束 + 冲突重试；③ 分布式锁。
**禁止**「先 `list_by_page` 数一下今天几条，再 +1」——并发下必然撞号。

**M-4（对应 C-4）· 图片存储改为强制走对象存储**
将原「强烈建议」**升级为强制**：照片**必须**落中间层对象存储，`t_photo.url` 存可访问地址。
**禁止**把照片写进 WPS 原生 Attachment 字段作为唯一副本（无直链，换 URL 端点在本项目 V7 coop 域 404）。
`GET /photos/{photoId}/url` 换不出时返回 `{url:""}`（前端已有占位降级）。

**M-5（对应 C-5）· 节流与解析**
- 对 WPS 的调用**必须**限流（≤ 10 req/s）并实现指数退避；
- `create` / `update` 按 **50 条/批**切片；
- 读取响应时**必须** `JSON.parse` `fields_value`（它是 JSON 字符串，不是对象）——否则会出现「写入成功但读回空」的静默故障；
- `list_by_page` 以「返回不足一页」为终止条件。

**M-6（对应 C-6）· 建表必须先建枚举选项**
建表时**先**把 `SingleSelect` 字段的全部选项建齐（`status` / `role` / `scopeType` / `areaTeam` / `violationStatus` / `photoType` / `transferStatus` / `reviewResult`），**再**写记录。
枚举清单见 `WPS-DATA-MODEL.md` 与 `src/api/mw/core/schema.ts` 的 `ENUM_VALUES`。

### 7.4 未发现冲突的部分（复核通过）

| 契约条款 | 复核结论 |
|---|---|
| 前端零 WPS 凭证（测试 G1/G3） | ✅ 与 WPS 认证模型一致，无冲突 |
| 「记录不可删除，只做状态流转」 | ✅ WPS `batch_delete` 存在但本项目不用，无冲突 |
| 中间层不实现 E-08-11 扣分 | ✅ 与 WPS 能力无关，为业务约束，无冲突 |
| `POST /violations/{id}/photos` 用 `multipart/form-data` | ✅ 照片不落 WPS 附件，与 M-4 一致 |
| 未来 `HseBackendTransport` 替换 | ✅ 与 WPS 能力无关，适配层接缝无冲突 |
| 禁止 PG → WPS 反向同步 | ✅ 与现有 WPS-PG-SYNC 冻结方向一致 |

---

## 6. 未来迁移到 HSE Backend / PostgreSQL

适配层设计为单一接缝：

```
UI (src/views/mw/*)
  ↓
业务门面 (src/api/mw/index.ts)
  ↓
MwTransport 接口 (src/api/mw/transports/types.ts)
  ↓
LocalTestTransport | HttpMiddlewareTransport | (未来) HseBackendTransport
```

迁移到正式 HSE Backend 时：

1. 新增 `HseBackendTransport implements MwTransport`，指向现有 HSE 后端；
2. 在 `transports/index.ts` 工厂里加一个分支；
3. **页面与业务门面零改动**（测试 F3 已锁定这一性质）。

反向不成立：**不得**建立 PG → WPS 的反向同步（现有 WPS-PG-SYNC 冻结体系已硬锁，本项目不触碰）。
