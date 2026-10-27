# B03-01-B｜Worker → Feishu 隐患字段核验报告

> 节点：B03-01-B（跨系统数据链路与同步边界设计 · 第 2 个节点）
> 性质：**只读源码审计**。代码修改 0 / DDL 0 / DML 0 / 配置修改 0 / 部署 0 / 生产访问 0。
> 取证方式：仓库源码逐行读取 + 行号引用。**未调用飞书 API、未访问生产数据、未运行 Worker。**
> 生成时间：2026-10-27

---

## 1. 执行摘要

### 1.1 一句话结论

> **Worker 向飞书隐患表写入的字段，全部由其自身从「会话 JWT」+「用户表单」+「服务端常量」三处取值拼装而成，其中「人员」与「组织」没有任何机器可解析的外键 —— 排查人标识是手机号，「部门」在现有权限闸门下恒为常量「安环管理部」，而「网格 / 乡镇 / 区域 / 班组 / 作业单元」在本链路上一个都不存在。**

### 1.2 六条核心事实

| # | 事实 | 证据 |
|---|---|---|
| 1 | 隐患表 ID `tblnyMjxtxjpP08q` **不出现在任何代码里**，只以 `FS_HAZARD_TABLE_ID`（`wrangler.toml:116`）注入；缺省时按**表名**`H5隐患排查台账表` 反查（`storage/index.js:23,55`） | `wrangler.toml:116`；`storage/index.js:18-24,42-46` |
| 2 | 源码可追溯的隐患表列共 **37 列**（基础 16 + 闭环 15 + AI 6）；B00 实测为 **38 列**，差额 1 列可归因为飞书建表默认「多行文本」列（B00 §3 末行记为无业务语义） | `_scratch/hazard-table-create.mjs:58-83`；`_scratch/hazard-fields-extend.mjs:25-39`；`_scratch/hazard-ai-fields.mjs:26-31`；B00 文档 §1 |
| 3 | **唯一的人员机器标识是手机号**（`排查人ID` = `payload.sub` = 身份表「手机号」），不存在 `employee_id` / `employee_code` / 身份证 | `index.js:941`（签发 `sub: identity.phone`）；`index.js:3312` |
| 4 | **「排查人部门」在现有闸门下是常量**：`hazardGate` 硬校验 `department === '安环管理部'`，非该部门一律 403 ⇒ 该列 2/2 行必然都是「安环管理部」，不承载组织信息 | `index.js:3103-3111`；`index.js:3314` |
| 5 | **网格 / 乡镇 / township / area / 班组 / 作业单元：全链 0 命中**（H5 payload、Worker 入参、Feishu 列名三处皆无）。位置只有一段**自由文本**，且其快捷词表是前端硬编码 16 项 | `check.app.js:5028-5048`（payload 全量）；`check.app.js:4644`（`HAZARD_LOCATIONS`） |
| 6 | 状态由 Worker 常量决定，**只写 3 个值**（待整改 / 待验收 / 已闭环）；飞书单选设计态有 5 个选项，其中「整改中」「已整改」本链路**永不写入** | `index.js:2954,2962,2963`；`_scratch/hazard-table-create.mjs:78-80`；`_scratch/hazard-fields-extend.mjs:61-72` |

### 1.3 与前序文档的口径差异（必须记录，不掩盖）

| # | 差异 | 处理 |
|---|---|---|
| D-1 | B00 §4 记「状态：飞书 ✅ 3 值状态机」；本轮源码显示飞书单选**设计态 5 选项**（待整改/整改中/已整改/已闭环 + 追加 待验收），而 Worker **只写其中 3 个** | 两者不冲突：「3 值」指**写入值域**，非选项数。本报告统一表述为「选项 5 / 实际写入 3」，并把选项实际生效情况列入 §16 无法确认 |
| D-2 | B00 §1 记飞书 **38 列**；本轮源码只能拼出 **37 列** | 差额 1 列归因为建表默认「多行文本」列（B00 §3 末行已记「无业务语义」），列入 §16 G1 |
| D-3 | B00 §4 记「附件：飞书 ✅ 附件列」为**单列**；本轮源码显示是**两个附件列**（现场照片 + 整改后照片） | B00 成文早于 2026-10-19.109 的闭环改造；以本轮为准 |

### 1.4 最终状态

> **B03-01-B：PASS WITH GAPS**
> 六项 PASS 判据在**源码层全部满足**；未判 PASS 的原因只有一条：**飞书侧「列是否存在/选项是否生效」本轮禁止实测**，只能引用 B00 的旧实测与本轮源码推导，差 1 列与状态选项数存在待实测项（详见 §16）。

---

## 2. 实际生产链

### 2.1 链路图（每一跳都有源码位置）

```text
手机浏览器
  │  静态页 check.html + check.app.js（frontend/）
  │  API_BASE = ''（同源）           frontend/config.js:15
  ▼
Cloudflare Pages
  │  pages/functions/api/[[route]].js  →  onRequest = proxyToWorker
  │  请求体原样转发：await request.arrayBuffer()（不改一个字节）
  ▼                                  pages/_workerProxy.js:44-47
Cloudflare Worker
  │  worker/index.js → 路由分发 index.js:4779-4788
  │  PWD 门（先于 handler）index.js:4754
  │  hazardGate（部门门）index.js:3204 等 8 处（ai-fill 不设此门，仅验会话）
  ▼
storage/feishuAdapter.js
  │  batch_create（新建） / PUT records/:id（更新）
  │  drive/v1/medias/upload_all（照片 → file_token）
  ▼
飞书 Base  WX9TbTqJKa7sywsgrU4cVoKdnXb
  └─ 表 FS_HAZARD_TABLE_ID = tblnyMjxtxjpP08q  「H5隐患排查台账表」
```

### 2.2 九跳中有三跳是「无改写」的

| 跳 | 是否改写数据 | 证据 |
|---|---|---|
| H5 → Pages | 否（JS 自行序列化 JSON） | `check.app.js:5028-5049` |
| Pages → Worker | **否**（`arrayBuffer` 原样 + 保留 method/header） | `_workerProxy.js:44-47,65` |
| Worker → Feishu | 是（中文列名映射 + 附件 `{file_token}` 包装 + 常量注入） | `index.js:3310-3339`；`feishuAdapter.js:154-180` |

> 因此「H5 传了什么」约等于「网络层传了什么」；真正的变形全部发生在 Worker 的 `handleHazardSubmit` 与 `feishuAdapter`。

### 2.3 Worker 隐患接口全清单（9 个，读写各半）

| # | 方法 | 路径 | handler | 行号 | 读/写 |
|---|---|---|---|---|---|
| 1 | POST | `/api/mobile/hazard/submit` | `handleHazardSubmit` | 3197 | **写（create）** |
| 2 | POST | `/api/mobile/hazard/ai-fill` | `handleHazardAiFill` | 3449 | 读图片，**不写表** |
| 3 | GET | `/api/mobile/hazard/list` | `handleHazardList` | 3513 | 读（scan） |
| 4 | GET | `/api/mobile/hazard/detail` | `handleHazardDetail` | 3549 | 读（getRecord） |
| 5 | GET | `/api/mobile/hazard/assignable` | `handleHazardAssignable` | 3595 | 读身份表 |
| 6 | POST | `/api/mobile/hazard/assign` | `handleHazardAssign` | 3627 | **写（update）** |
| 7 | GET | `/api/mobile/hazard/todos` | `handleHazardTodos` | 3749 | 读 |
| 8 | POST | `/api/mobile/hazard/rectify` | `handleHazardRectify` | 3784 | **写（update）** |
| 9 | POST | `/api/mobile/hazard/review` | `handleHazardReview` | 3862 | **写（update）** |

写接口白名单：`index.js:790-792`。分发：`index.js:4779-4788`。
**无 delete / revoke / cancel 路由**（`index.js` 中 `hazard` 与 `delete|revoke` 同现的匹配全为 isolate 缓存清理，非业务删除，见 §13.5）。

> **权限门的一处不对称（源码事实，只记录不评价）**：8 个接口走 `hazardGate`（硬校验 `department === '安环管理部'`），唯一例外是 `ai-fill` —— 它只校验会话，**不校验部门**（`index.js:3453-3455`）。即任何已登录用户（含乡镇作业中心经理/管理员）都可调用多模态识图接口，但**其结果只返回给前端，不写表**（`handleHazardAiFill` 内 0 次 `createRecords`/`updateRecord`，全函数见 `3449-3506`）。写入门未被绕过，但 AI 配额可被非目标部门消耗。

---

## 3. H5 → Worker → Feishu 调用链（submit 逐行）

### 3.1 H5 侧（`check.app.js` / `check.html`）

| 步 | 动作 | 行号 |
|---|---|---|
| 1 | 三步走表单：①拍照/相册（可跳过）②预览 ③填表；控件 id：`hz-cat-grid` `hz-level-grid` `hz-desc` `hz-basis` `hz-suggestion` `hz-tv-grid` `hz-mj-grid` `hz-rl-grid` `hz-loc-grid` `hz-location` `hz-photos` `hz-rect-photos` | `check.html` view-hazard-form 段 |
| 2 | **无「排查时间」控件**（`check.html` 隐患段无任何 time/date input；唯一 date 控件是整改期限 `hz-assign-deadline`） | `check.html:1347` |
| 3 | 提交时**现场生成** `find_time = nowLocalInspectTime()`（手机本地墙钟，`YYYY-MM-DD HH:mm`，不可编辑、不可回填） | `check.app.js:101-104,5033` |
| 4 | 照片先逐张上传拿 `file_token`（失败即中止，绝不建半截记录） | `check.app.js:5009-5027` |
| 5 | 拼 body（14 个可能键） | `check.app.js:5028-5048` |
| 6 | `mobileApi('/api/mobile/hazard/submit', body)` | `check.app.js:5049` |

### 3.2 H5 请求体全量键（submit，共 16 键：7 键恒发 / 9 键条件发）

| 键 | 类型 | 是否恒发 | 赋值处 |
|---|---|---|---|
| `category` | string | ✅ | `check.app.js:5029` |
| `level` | string | ✅ | `5030` |
| `description` | string | ✅ | `5031` |
| `location` | string（可为空串） | ✅ | `5032` |
| `find_time` | string | ✅ | `5033` |
| `client_request_id` | string | ✅ | `5034`（`newClientRequestId()`） |
| `ai_raw` | string | ✅（可为 `''`） | `5042` |
| `rectify_basis` | string | ⬜ 有值才发 | `5037` |
| `rectify_suggestion` | string | ⬜ | `5038` |
| `three_violation` | string | ⬜ | `5039` |
| `major_hazard` | string | ⬜ | `5040` |
| `risk_level` | string | ⬜ | `5041` |
| `latitude` | string(数字) | ⬜ 有 GPS 才发 | `5043-5044` |
| `longitude` | string(数字) | ⬜ | `5045` |
| `photo_tokens` | string[] | ⬜ 有照片才发 | `5047` |
| `rectify_photo_tokens` | string[] | ⬜ | `5048` |

> 注：`body` 字面量 6 键 + `ai_raw` 单独赋值（恒发）= **7 键恒发**；条件赋值 9 处 ⇒ 实发上限 **16 键**（与 B00 记「16 个入参」一致）。**无 `name` / `phone` / `department` / `position` / `grid` / `township` / `record_id`** —— 身份完全由会话决定。

### 3.3 Worker 侧接收与校验（`handleHazardSubmit`）

| 步 | 动作 | 行号 |
|---|---|---|
| 1 | `verifyWorkerSession(bearer)` → payload（HS256 + `iss/aud` 双校验） | 3203；`268-278` |
| 2 | `hazardGate`：`env.WORKER_SESSION_SECRET` 缺失 → 503；无 payload → 401；`payload.department !== '安环管理部'` → 403 `FORBIDDEN_NOT_HAZARD_DEPT` | 3204；`3103-3111` |
| 3 | 表 ID：`cfg.hazardSheetId` 空 → 503 `HAZARD_TARGET_NOT_CONFIGURED` | 3207-3208 |
| 4 | body ≤ 16 KiB（`HAZARD_BODY_LIMIT`） | 3210-3211；`2893` |
| 5 | `category` ∈ 11 项、`level` ∈ 2 项、`description` 非空 ≤500、`location` ≤100 | 3217-3227；`2895-2896` |
| 6 | `find_time` 空则服务端 UTC+8 补；格式 `YYYY-MM-DD HH:mm`、非假日期、不早于 2020、不超未来 24h（时区容差） | 3228-3234；`3080-3099` |
| 7 | 经纬度非法则**整段丢弃**（写空不写错） | 3241-3242 |
| 8 | `photo_tokens` ≤3、`^[A-Za-z0-9]{10,120}$`、去重 | 3244-3251 |
| 9 | `rectify_photo_tokens` 同上（存在即「登记即闭环」） | 3254-3260 |
| 10 | AI 字段：`three_violation`∈{是,否}、`major_hazard`∈{是,否}、`risk_level`∈4 档，不命中**丢弃**（防污染统计） | 3263-3271 |
| 11 | `client_request_id` `^[A-Za-z0-9_-]{8,64}$` | 3273-3276 |
| 12 | 幂等预查：isolate 缓存（5 min）→ 飞书 search（`备注 contains req:<cid>`）→ 在途表（30 s） | 3279-3304；`2909,2914` |
| 13 | `ensureHazardRectFields`（缺列则幂等补建 21 列） | 3307；`3015-3033` |
| 14 | 组装 `record`（见 §4） | 3310-3339 |
| 15 | `adapter.createRecords` → `record_id` | 3345；`feishuAdapter.js:154-180` |

### 3.4 关键设计：身份一律服务端定值

```js
// 索引 index.js:3309
// record 全部服务端定值：身份一律取 Session，前端传入的一律忽略
```

| 写入列 | 取值表达式 | 数据出处（跨系统） |
|---|---|---|
| `排查人ID` | `String(payload.sub)` | JWT `sub` = 登录时 `identity.phone` = 身份表 `tbl58t9kjyDlacSw`「手机号」（`index.js:941`） |
| `排查人姓名` | `patrolText(payload.name, 40)` | 身份表「姓名」（`index.js:707`） |
| `排查人部门` | `patrolText(payload.department, 40)` | 身份表「所属部门」（`index.js:709`）；且被 gate 强约束为 `安环管理部` |
| `排查人职位` | `patrolText(payload.position, 40)` | 身份表「职位」（`index.js:710`） |

> 结论：**Worker 不查花名册、不查 PG、不查任何组织表**。隐患排查链路的人员属性只依赖「H5移动端身份表」8 列：序号 / 姓名 / 直接上级 / 所属部门 / 职位 / 网格长等级 / 手机号 / 分级（`index.js:1208-1210`）。`网格长等级` **被采集进 JWT（`grid_level`）但隐患写入完全未使用**。

---

## 4. 字段完整映射矩阵

> 状态取值仅四类：`CONFIRMED` / `PARTIAL` / `NOT FOUND` / `UNKNOWN`。
> 「Worker 内部变量」列只为让 B03-01-C 能定位代码；不构成 PG 映射建议。

| # | 业务字段 | H5 字段 | Worker 接收参数 | Worker 内部变量 | Feishu 字段 | 值来源 | 转换 | 证据位置 | 状态 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 业务编号 | — | — | `record['隐患编号']` | **隐患编号**(t1) | `newHazardNo()` 服务端生成 | `YH`+yyyyMMddHHmmss+4 随机位 | `index.js:3311,3115-3120` | CONFIRMED |
| 2 | 记录主键 | — | — | `recs[0]` | **（record_id，非列）** | 飞书 batch_create 返回 | 无 | `feishuAdapter.js:178-179`；`index.js:3352` | CONFIRMED |
| 3 | 排查人标识 | — (Session) | — | `payload.sub` | **排查人ID**(t1) | 身份表「手机号」（11 位数字） | `String()` | `index.js:3312`；`941` | CONFIRMED |
| 4 | 排查人姓名 | — (Session) | — | `payload.name` | **排查人姓名**(t1) | 身份表「姓名」 | ≤40 | `index.js:3313` | CONFIRMED |
| 5 | 排查人部门 | — (Session) | — | `payload.department` | **排查人部门**(t1) | 身份表「所属部门」，**gate 恒为安环管理部** | ≤40 | `index.js:3314`；`3106` | CONFIRMED |
| 6 | 排查人职位 | — (Session) | — | `payload.position` | **排查人职位**(t1) | 身份表「职位」 | ≤40 | `index.js:3315` | CONFIRMED |
| 7 | 排查时间 | **无控件** | `find_time` | `findTime` | **排查时间**(t1) | H5 `nowLocalInspectTime()`；空则服务端 +8h 补 | 格式+未来时间双重校验 | `check.app.js:5033,101-104`；`index.js:3228-3234` | CONFIRMED |
| 8 | 隐患类别 | `hazardForm.category` | `category` | `category` | **隐患类别**(t3 单选 11 项) | 用户点选 / AI 回填 | 必须命中 `HAZARD_CATEGORIES` | `index.js:3217-3220,2952` | CONFIRMED |
| 9 | 隐患级别 | `hazardForm.level` | `level` | `level` | **隐患级别**(t3 单选 2 项) | 用户点选 | 必须 ∈{一般隐患, 重大隐患} | `index.js:3221-3224,2953` | CONFIRMED |
| 10 | 隐患位置 | `hz-location` 输入 / `hz-loc-grid` 16 静态项 / GPS 地址 | `location` | `location` | **隐患位置**(t1) | 用户手输 / 静态词表点选 / 高德逆地理地址 | ≤100，**无归一化** | `index.js:3227`；`check.app.js:4644,4573-4589` | CONFIRMED（非机器标识） |
| 11 | 隐患描述 | `hz-desc` | `description` | `description` | **隐患描述**(t1) | 用户输入 / AI 回填 | 必填 ≤500 | `index.js:3225-3226` | CONFIRMED |
| 12 | 纬度 | `gps.lat` | `latitude` | `lat` | **纬度**(t1) | 设备 GPS | 非法整段丢弃 | `index.js:3241,3324` | CONFIRMED |
| 13 | 经度 | `gps.lng` | `longitude` | `lng` | **经度**(t1) | 设备 GPS | 同上 | `index.js:3242,3325` | CONFIRMED |
| 14 | 现场照片 | `hazardForm.photos` → 上传 | `photo_tokens` | `photoTokens` | **现场照片**(t17 附件) | `/api/mobile/upload` → drive `upload_all` | `tokens.map(t=>({file_token:t}))` | `index.js:3244-3251,3326`；`feishuAdapter.js:320-348` | CONFIRMED |
| 15 | 整改后照片 | `hazardForm.rectPhotos` → 上传 | `rectify_photo_tokens` | `rectTokens` | **整改后照片**(t17 附件) | 同上 | 同上；**非空即触发「登记即闭环」** | `index.js:3254-3260,3328-3329` | CONFIRMED |
| 16 | 处理状态 | — | — | — | **处理状态**(t3 单选) | 服务端常量 | 三值，见 §9 | `index.js:3321` | CONFIRMED |
| 17 | 备注 | — | `client_request_id` | `cid` | **备注**(t1) | H5 `newClientRequestId()` | 拼为 `req:<cid>`，无 cid 则 `''` | `index.js:3273,3322` | CONFIRMED（**被幂等占用，非业务备注**） |
| 18 | 整改依据 | `hz-basis` | `rectify_basis` | `aiBasis` | **整改依据**(t1) | 用户手填 / AI 回填 | ≤1000，空不写 | `index.js:3263,3334` | CONFIRMED |
| 19 | 整改建议 | `hz-suggestion` | `rectify_suggestion` | `aiSuggestion` | **整改建议**(t1) | 同上 | ≤1000，空不写 | `index.js:3264,3335` | CONFIRMED |
| 20 | 三违判定 | `hz-tv-grid` | `three_violation` | `threeViolation` | **三违判定**(t1) | 用户/AI | ∈{是,否}，否则空 | `index.js:3265-3266,3336` | CONFIRMED |
| 21 | 重大事故隐患判定 | `hz-mj-grid` | `major_hazard` | `majorHazard` | **重大事故隐患判定**(t1) | 用户/AI | ∈{是,否} | `index.js:3267-3268,3337` | CONFIRMED |
| 22 | 风险等级 | `hz-rl-grid` | `risk_level` | `riskLevel` | **风险等级**(t1) | 用户/AI | ∈4 档（重大/较大/一般/低） | `index.js:3269-3270,3338` | CONFIRMED |
| 23 | AI 原始输出 | `hazardForm.aiRaw` | `ai_raw` | `aiRaw` | **AI识别原始输出**(t1) | `ai-fill` 返回的 `raw` | ≤4000 | `index.js:3271,3339,3489` | CONFIRMED |
| 24 | 整改人ID | 选人（`hz-assign-q`） | `assignee_id` | `rectifierId` | **整改人ID**(t1) | 身份表按手机号查人 → `person.phone` | `^\d{6,20}$` | `index.js:3648-3651,3691-3694` | CONFIRMED |
| 25 | 整改人姓名 | — | （同 24 查到的人） | `person.name` | **整改人姓名**(t1) | 身份表「姓名」 | ≤40 | `index.js:3695` | CONFIRMED |
| 26 | 整改人部门 | — | — | `person.department` | **整改人部门**(t1) | 身份表「所属部门」 | 必须=安环管理部，否则 403 | `index.js:3687,3696` | CONFIRMED |
| 27 | 指派人ID | — (Session) | — | `payload.sub` | **指派人ID**(t1) | Session 手机号 | 无 | `index.js:3697` | CONFIRMED |
| 28 | 指派人姓名 | — (Session) | — | `payload.name` | **指派人姓名**(t1) | Session 姓名 | ≤40 | `index.js:3698` | CONFIRMED |
| 29 | 指派时间 | — | — | `todoNowLocal()` | **指派时间**(t1) | Worker 时钟 UTC+8 | `YYYY-MM-DD HH:mm` | `index.js:3699,4049-4056` | CONFIRMED |
| 30 | 整改期限 | `hz-assign-deadline`（`<input type=date>`） | `deadline` | `deadline` | **整改期限**(t1) | 用户选日期 | `YYYY-MM-DD`、≥今天、≤365 天 | `check.html:1347`；`index.js:3652-3654,3042-3054` | CONFIRMED |
| 31 | 整改说明 | `hz-rectify-note` | `note` | `note` | **整改说明**(t1) | 整改人手填 | ≤500，空不写 | `index.js:3805,3838` | CONFIRMED |
| 32 | 整改提交时间 | — | — | `todoNowLocal()` | **整改提交时间**(t1) | Worker 时钟 | 同上 | `index.js:3836` | CONFIRMED |
| 33 | 验收人 | — (Session) | — | `payload.name` | **验收人**(t1) | Session 姓名 | ≤40 | `index.js:3905,3911` | CONFIRMED |
| 34 | 验收时间 | — | — | `now` | **验收时间**(t1) | Worker 时钟 | 同上 | `index.js:3912` | CONFIRMED |
| 35 | 验收结论 | `hz-reject-comment` / pass 无输入 | `comment` | `comment` | **验收结论**(t1) | 用户输入 + 固定前缀 | `通过：…` / `通过` / `打回：…` / `打回` | `index.js:3887,3914,3922` | CONFIRMED |
| 36 | 闭环时间 | — | — | `now` / `todoNowLocal()` | **闭环时间**(t1) | Worker 时钟 | 同上 | `index.js:3913,3330` | CONFIRMED |
| 37 | 打回次数 | — | — | `item.rejectCount+1` | **打回次数**(t1) | 读旧值 +1，上限 99 | `String()` | `index.js:3921,3940` | CONFIRMED |
| 38 | 创建时间 | — | — | —（Worker 0 写） | **创建时间**(t5 日期, `auto_fill:true`) | 飞书自动填 | — | `_scratch/hazard-table-create.mjs:82` | CONFIRMED（生成方=飞书） |
| 39 | 网格 ID | — | — | — | **无** | — | — | 全链 0 命中（§7） | NOT FOUND |
| 40 | 网格名称 | — | — | — | **无** | — | — | 同上 | NOT FOUND |
| 41 | 乡镇 | — | — | — | **无独立列** | 仅可能混在「隐患位置」自由文本里 | 无解析 | `check.app.js:5028-5048` | NOT FOUND |
| 42 | 区域 / area | — | — | — | **无** | — | — | 同上 | NOT FOUND |
| 43 | 班组 / 片区 | — | — | — | **无** | — | — | 同上 | NOT FOUND |
| 44 | 作业单元 | — | — | — | **无** | — | — | 同上 | NOT FOUND |
| 45 | 隐患类型（hazard_type） | — | — | — | **无**（只有「隐患类别」11 值） | — | — | `_scratch/hazard-table-create.mjs:65-69` | NOT FOUND |
| 46 | 来源 / source_channel | — | — | — | **无** | — | — | payload 无 source 键 | NOT FOUND |
| 47 | 附件（非图片） | — | — | — | **无**（仅 2 个图片附件列，`parent_type=bitable_image`） | — | — | `feishuAdapter.js:324` | NOT FOUND |
| 48 | 业务备注（人工填写） | — | — | — | 列存在但**被 `req:` 占用** | — | — | `index.js:3322`；`check.html` 隐患段无备注控件 | PARTIAL |
| 49 | 更新时间 | — | — | — | **无**（Worker 不写，adapter 不读 `last_modified_time`） | — | — | `feishuAdapter.js:76-78,110-112` | NOT FOUND |
| 50 | 撤销 / 作废 / 注销 | — | — | — | **无** | — | — | §13.5 | NOT FOUND |

### 4.1 统计

| 状态 | 数量 | 说明 |
|---|---:|---|
| CONFIRMED | **38** | 含 1 个非列对象（record_id）、1 个飞书自动列（创建时间） |
| PARTIAL | **1** | 备注（列在、语义被占） |
| NOT FOUND | **11** | 网格×2 / 乡镇 / 区域 / 班组 / 作业单元 / 隐患类型 / 来源 / 非图附件 / 更新时间 / 撤销 |
| UNKNOWN | **0** | 见 §16（UNKNOWN 集中在「值是否实际存在」，不在此矩阵） |
| 合计 | **50** | |

> 与 B00 的 38 列交叉验证：本矩阵含 36 个 Worker 可写列 + 1 个飞书自动列（创建时间）= **37 列**，B00 实测 38 列，差 1 列 = 建表默认「多行文本」（§16 G1）。

---

## 5. `record_id` 生命周期

### 5.1 五问五答

| 问题 | 答案 | 证据 |
|---|---|---|
| 是飞书系统生成？ | **是**。`batch_create` 响应 `data.records[].record_id` | `feishuAdapter.js:178-179` |
| Worker 是否自行生成？ | **否**。Worker 只做 `.map(r => r.record_id)` 透传 | `index.js:3352` |
| 是否保存到业务字段？ | **否**。「隐患编号」是另一套（`YH+…`），与 record_id 无关；表内**无 record_id 列** | `index.js:3311`；37 列清单无此列 |
| 是否只在 API 返回？ | **是**。仅出现在 `recordIds[]` 响应 + isolate 幂等缓存（5 min） | `index.js:3189,3353` |
| 更新时是否继续用同一个？ | **是**。assign / rectify / review 全以 `record_id` 为入参 `PUT` 同一条 | `index.js:3647,3804,3882` |

### 5.2 生命周期时序

```text
H5 提交（无 record_id）
   │
   ├─ Worker: 幂等预查（cid）  ──命中──▶ 直接返回既有 recordIds[0]（不新建）
   │
   ├─ Feishu batch_create → record_id   ← 唯一生成点
   │     └─ Worker: hazardCidPut(sub|cid → recordId)，TTL 5 min（isolate 内存）
   │
   ▼
H5 拿到 recordIds[0]，进入列表/详情
   │
   ├─ 指派  PUT records/{record_id}          （状态 待整改）
   ├─ 整改  PUT records/{record_id}          （状态 待验收）
   └─ 验收  PUT records/{record_id}          （状态 已闭环 / 回 待整改）
                                                ↑ 全程同一个 record_id，无副本、无版本号
```

### 5.3 三类编号并存，用途互不重叠

| 标识 | 生成方 | 格式 | 用途 | 是否业务主键 |
|---|---|---|---|---|
| `record_id` | 飞书 | 字母数字 10~64（正则 `^[A-Za-z0-9]{10,64}$`） | 技术主键，全部读写路径 | 技术主键，非业务键 |
| `隐患编号` | Worker `newHazardNo()` | `YH`+14 位时间+4 位随机 | 展示、人工检索、微信推送文案 | **无唯一约束、无查重、4 位随机可撞**（`index.js:3115-3120`，注释亦承认「幂等由 cid 兜底，编号仅作展示」） |
| `client_request_id` | H5 | 8~64 位 `[A-Za-z0-9_-]` | 幂等键，落「备注」`req:<cid>` | 幂等事实键（但只在备注文本里） |

> **B03 影响**：PG 侧若要接收，`record_id` 是唯一稳定可回指的键；`隐患编号` 不可作唯一约束（撞号无检测）；`cid` 可作「一次提交」的追踪号但会被清理语义稀释。

---

## 6. 人员字段

### 6.1 三侧人员字段对照

| 侧 | 字段 | 是否主键级 | 说明 |
|---|---|---|---|
| H5 请求体 | **无任何人员字段** | — | 身份全由 Session 决定，前端传了也忽略（`index.js:3309` 注释明文） |
| Worker 会话 | `sub`（手机号）、`name`、`department`、`position`、`grid_level`、`role` | `sub` 是稳定业务身份 | `index.js:938-951` |
| Feishu 隐患表 | `排查人ID` / `排查人姓名` / `排查人部门` / `排查人职位` | 无外键 | 4 列全部为文本（t1） |
| Feishu 隐患表（整改侧） | `整改人ID` / `整改人姓名` / `整改人部门` / `指派人ID` / `指派人姓名` / `验收人` | 无外键 | 全部文本 |

### 6.2 关键判断（逐条只写证据支持的部分）

| 问题 | 答案 | 证据 |
|---|---|---|
| H5 提交姓名 / 手机号 / employee_id / employee_code？ | **一个都没提交**。提交的是「空」——身份从 token 解出 | `check.app.js:5028-5048` |
| Worker 实际接收什么？ | JWT `payload`：`sub`=手机号、`name`、`department`、`position`（`grid_level`/`role` 被签发但隐患链路未使用） | `index.js:268-278`；签发 `938-951` |
| Worker 实际写入 Feishu 什么？ | `排查人ID`=手机号；`排查人姓名`；`排查人部门`；`排查人职位` | `index.js:3312-3315` |
| 是否存在 `inspector_employee_id`？ | **不存在**。全链无该名（PG 侧 `grid_inspection_records.inspector_employee_id` 属另一链路，与隐患无关） | 隐患链路 0 命中 |
| 是否存在 `inspector_name`？ | **不存在该名**，等价语义为 `排查人姓名` | — |
| 是否存在其他人员标识？ | 仅手机号。**无身份证、无工号、无 employee.id** | `index.js:941`；`mapLedgerRecord`（`703-718`）仅 8 列 |
| 「姓名就是排查人主键」是否成立？ | **不成立**。主键是手机号；姓名仅展示。重名风险由「手机号唯一账号」兜住（登录即用手机号） | `index.js:941`；`1153` 注释「手机号=账号」 |

### 6.3 三个人员字段的信息量差异（对 B03 很重要）

| 列 | 值域 | 信息量 |
|---|---|---|
| `排查人ID` | 手机号，与身份表 1:1 | **高**：可唯一回指到 H5 身份表账号 |
| `排查人姓名` | 中文姓名 | 中：可读、不可作键（重名） |
| `排查人部门` | **恒为「安环管理部」** | **≈0**：gate 硬约束所致（`index.js:3106`），不是组织归属 |
| `排查人职位` | 身份表「职位」自由文本 | 低-中：非枚举 |
| `整改人部门` | 恒为「安环管理部」 | ≈0（`index.js:3687` 同样强校验） |

> **对 B03 的直接含义**：隐患表里**没有任何一列能回答「这条隐患属于哪个乡镇 / 哪个作业单元」**。若要按单位统计隐患，只能靠 `隐患位置` 文本 + 前端 16 项词表做字符串匹配，而该词表本身与实际作业单元清单不一致（§7.3）。

---

## 7. 区域字段

### 7.1 全链逐位置检索结果（三处都查了）

| 检索面 | `grid` / `grid_id` / `grid_name` | `township` | `area` | `team` / 班组 | `operation_unit` / 作业单元 |
|---|---|---|---|---|---|
| H5 payload（`check.app.js:5028-5048`） | **0** | **0** | **0** | **0** | **0** |
| Worker 隐患 handler（3197-3945） | **0** | **0** | **0** | **0** | **0** |
| Feishu 列定义（3 个建列脚本） | **0** | **0** | **0** | **0** | **0** |
| 结论 | NOT FOUND | NOT FOUND | NOT FOUND | NOT FOUND | NOT FOUND |

> 反证（排除假零命中）：同一份 `check.app.js` 里 `patrolMeta` / `resolveGridForSubmit` 确实存在（`check.app.js:106-111,1977,1995-2006`），但**只服务于巡查提交（`/api/mobile/patrol/submit`），隐患提交一处都没引用**。即「网格」在 H5 里是有的，只是**没接进隐患链路**。

### 7.2 「展示名称」与「机器标识」的实际区分

| 列 | 是展示名称？ | 是机器标识？ | 可解析性 |
|---|---|---|---|
| `隐患位置` | ✅ 是（自由文本 / 地址 / 词表项） | ❌ 否 | 三种来源混写（手输 / 静态词表 / 高德逆地理地址），**无法可靠反解出乡镇** |
| `排查人部门` | ✅ 是 | ❌ 否（且恒为常量） | 无 |
| `纬度` / `经度` | — | 半（地理坐标） | 可空间反查，但**非组织编码**，且用户可不授权定位 |
| `排查人ID` | ❌ | ✅ 手机号 | 可唯一回指账号，但账号表本身不含乡镇机器码（只有「所属部门」文本） |

### 7.3 位置词表的三套并存（本轮新发现，B02 未记录）

| 词表 | 出处 | 项数 | 内容 |
|---|---|---|---|
| A. H5 隐患位置快捷项 | `check.app.js:4644` `HAZARD_LOCATIONS` | **16** | 12 个行政单元（大曹镇/保店镇/相衙镇/时集镇/刘营伍乡/张大庄镇/长官镇/大柳镇/杜集镇/柴胡店镇/宁城街道/津城街道）+ 4 个非行政点（康宁湖/中心公园/福宁河/新河公园） |
| B. 作业中心清单（巡查/派单口径） | `index.js:1211-1230` 注释实测 | **17** | 12 个乡镇/街道 + 3 个公园（康宁湖公园/新河公园/中心公园）+ 2 个作业中心（环卫/市政园林） |
| C. 考核对象 `township` 取值 | `hse_assessment_target`（B02-DEC-03 实测） | **16** | 但取值是**组织名**（「安环管理部」「保店镇作业中心」） |

**三套两两不一致，且有 4 处具体错位**：

1. A 用「康宁湖」，B 用「康宁湖公园」——同地不同名；
2. A 有「福宁河」，B/C 均无此项（A 独有的河流点位）；
3. B 有「环卫作业中心」「市政园林作业中心」，A 无（这两类单位的隐患无法用快捷项登记）；
4. C 的 16 个值是组织名，与 A/B 的行政/点位名不同名空间，**命中率极低**（B02-DEC-03 已实测 `risk_area_dict` 与 C 双向差集 16/17、命中 0）。

> 这说明：**「区域」在本系统不是「缺一张表」的问题，而是「没有统一词表」的问题**——三套并存且互不映射。B03 设计同步层时，若假设存在一个区域编码可用，会立刻踩空。

---

## 8. 隐患字段（事实面）

| 业务语义 | 是否写入 Feishu | 列名 / 说明 | 证据 | 状态 |
|---|---|---|---|---|
| 隐患描述 | ✅ | `隐患描述` t1，必填 ≤500 | `index.js:3225-3226,3320` | CONFIRMED |
| 隐患类别 | ✅ | `隐患类别` t3 单选 11 项（服务端权威清单，AI 不命中即丢弃） | `index.js:2952,3217-3220` | CONFIRMED |
| 隐患级别 | ✅ | `隐患级别` t3 单选 2 项 | `index.js:2953,3221-3224` | CONFIRMED |
| 风险等级 | ✅ | `风险等级` t1 文本，4 档（**注意：与「隐患级别」是两个独立概念，不可合并**） | `index.js:2974,3269-3270` | CONFIRMED |
| 发现位置 | ✅ | `隐患位置` t1 ≤100，**自由文本** | `index.js:3227` | CONFIRMED |
| 发现时间 | ✅ | `排查时间` t1 `YYYY-MM-DD HH:mm`（**H5 无控件，提交时自动取手机墙钟**） | `index.js:3228-3234`；`check.app.js:5033` | CONFIRMED |
| 来源 | ❌ | 无任何来源列；也无 `source_channel` 类入参 | payload 全量 16 键 | NOT FOUND |
| 图片 | ✅ | 两个附件列：`现场照片`（≤3）、`整改后照片`（≤3） | `index.js:3326,3329` | CONFIRMED |
| 附件（非图片） | ❌ | `parent_type=bitable_image` 硬编码，只能传图片；无通用附件列 | `feishuAdapter.js:324` | NOT FOUND |
| 备注 | ⚠️ | 列存在，但**被幂等键独占**（`req:<cid>`）；H5 隐患表单无备注输入控件 | `index.js:3322`；`check.html` 隐患段 | PARTIAL |
| 三违判定 | ✅ | `三违判定` t1 ∈{是,否}（**不是独立三违台账，只是隐患上的一个标记**） | `index.js:2971,3336` | CONFIRMED |
| 重大事故隐患判定 | ✅ | `重大事故隐患判定` t1 ∈{是,否} | `index.js:2972,3337` | CONFIRMED |
| AI 识别原始输出 | ✅ | `AI识别原始输出` t1 ≤4000（整段模型 JSON 留痕） | `index.js:3271,3489` | CONFIRMED |

> ⚠️ 语义陷阱（B03 必读）：「隐患级别」（一般/重大隐患，来自法规分级）× 「风险等级」（重大/较大/一般/低风险，来自风险分级管控）× 「重大事故隐患判定」（是/否）**是三个不同维度**，Feishu 里同表三列并存，任一列都不能替代另一列。B00 已记「三侧含义不同」，本轮从源码确认三者取值域完全独立、由三个不同枚举常量校验。

---

## 9. 状态字段

### 9.1 Worker 实际写入值（3 个，唯一来源是常量）

```js
const HAZARD_STATUS_PENDING = '待整改';   // index.js:2954
const HAZARD_STATUS_REVIEW  = '待验收';   // index.js:2962
const HAZARD_STATUS_CLOSED  = '已闭环';   // index.js:2963
```

| 写入点 | 写入值 | 触发条件 | 行号 |
|---|---|---|---|
| submit | `待整改` | 无整改后照片 | 3321 |
| submit | `已闭环` | **带整改后照片**（登记即闭环销号，跳过待验收） | 3321,3328-3332 |
| assign | `待整改` | 指派/改派（含从待验收之外的状态拉回） | 3701 |
| rectify | `待验收` | 整改人提交 | 3835 |
| review(pass) | `已闭环` | 验收通过 | 3910 |
| review(reject) | `待整改` | 打回 | 3918 |

### 9.2 飞书单选选项 vs 实际写入值

| 选项 | 建表脚本初始 | 扩容脚本追加 | Worker 是否为写入方 |
|---|---|---|---|
| 待整改 | ✅ | — | **✅ 是** |
| 整改中 | ✅ | — | ❌ **从不写入** |
| 已整改 | ✅ | — | ❌ **从不写入** |
| 已闭环 | ✅ | — | ✅ 是 |
| 待验收 | ❌ | ✅ | ✅ 是 |

证据：`_scratch/hazard-table-create.mjs:78-80`（初始 4 项）；`_scratch/hazard-fields-extend.mjs:61-72`（追加「待验收」「已闭环」）。

> 结论：**飞书设计态 5 选项，Worker 实际只用 3 个**；「整改中」「已整改」是历史/预留值，本链路永不产生。存量读到这两个值时会被 `hazardStatusNorm` 归一到「待整改」（`index.js:3056-3061`）——即**读取侧对历史值的兼容是「抹平」而非「区分」**。

### 9.3 状态机（源码硬编码，含守卫）

```text
                 ┌──────────── 打回（rejectCount+1，上限 99） ────────────┐
                 ▼                                                      │
  [新建] ──▶ 待整改 ──整改人提交(rectify)──▶ 待验收 ──验收通过──▶ 已闭环（唯一终点）
              │                                │
              │  指派(assign) 只允许此态        │  改派被拒 409
              │  （待验收/已闭环 → 409）        │
              └────────────────────────────────┘

  特例：submit 时若带「整改后照片」    → 直接 已闭环（跳过待验收，写 验收结论=「登记时已现场整改，直接闭环」）
```

| 守卫 | 规则 | 错误码 | 行号 |
|---|---|---|---|
| assign | 待验收 → 拒 | `HAZARD_STATUS_INVALID` 409 | 3666-3668 |
| assign | 已闭环 → 拒 | 同上 | 3669-3671 |
| rectify | 非本人（`rectifierId !== sub`） → 拒 | `FORBIDDEN` 403 | 3824-3826 |
| rectify | 非「待整改」 → 拒 | 409 | 3828-3831 |
| review | 非「待验收」 → 拒 | 409 | 3899-3902 |

---

## 10. 整改字段

### 10.1 源码中存在（15 列，全部由 Worker 写入）

| 列 | 类型 | 写入方 | 写入时机 | 行号 |
|---|---|---|---|---|
| 整改人ID | t1 | assign | 指派 | 3694 |
| 整改人姓名 | t1 | assign | 指派 | 3695 |
| 整改人部门 | t1 | assign | 指派（恒 安环管理部） | 3696 |
| 指派人ID | t1 | assign | 指派 | 3697 |
| 指派人姓名 | t1 | assign | 指派 | 3698 |
| 指派时间 | t1 | assign | 指派 | 3699 |
| 整改期限 | t1 | assign | 指派（用户选 `<input type=date>`） | 3700 |
| 整改说明 | t1 | rectify | 整改提交（空则不写） | 3838 |
| 整改提交时间 | t1 | rectify | 整改提交 | 3836 |
| 整改后照片 | **t17 附件** | submit / rectify | 登记即闭环 / 整改提交 | 3329 / 3839 |
| 验收人 | t1 | review（+ submit 不写） | 验收 | 3911 |
| 验收时间 | t1 | review | 验收 | 3912 |
| 验收结论 | t1 | **submit / review** | 登记即闭环 / 验收 | 3331 / 3914,3922 |
| 闭环时间 | t1 | **submit / review(pass)** | 登记即闭环 / 通过 | 3330 / 3913 |
| 打回次数 | t1 | review(reject) | 打回 | 3921 |

### 10.2 改派时的「清场」行为（容易被忽略，但影响历史可信度）

```js
// index.js:3703-3708
// 改派（重指）时清掉上一轮整改产物，避免验收看到前任留下的照片/说明
if (item.rectifierId) {
  fields[HAZARD_FIELDS.rectifyNote] = '';
  fields[HAZARD_FIELDS.rectifyAt]   = '';
  if (item.rectifyPhotoTokens.length) fields[HAZARD_FIELDS.rectifyPhotos] = [];
}
```

> **含义**：整改人被改派后，上一任的「整改说明 / 整改提交时间 / 整改后照片」**被物理清空**，且**不留任何历史痕迹**（无 audit、无旧值列）。而「验收人 / 验收时间 / 验收结论 / 打回次数」**不清**，会保留上一轮的值。
> 结果：一条经历过 1 次改派的记录，其 Feishu 现状可能是「整改说明空 + 验收结论=打回：xxx + 打回次数=1」的混合态，**无法从 Feishu 单表还原真实的操作序列**。

### 10.3 「源码中存在」≠「当前 2 条数据有值」

| 层次 | 本轮可否核验 | 结论 |
|---|---|---|
| A. Feishu 列存在 | 仅能引 B00 旧实测（38 列）+ 源码 37 列推导 | 存在（列级 CONFIRMED，见 §16 G1） |
| B. Worker 代码会写该字段 | ✅ 源码逐行确认 | 15 列全部会被写（视流程走到哪一步） |
| C. 当前 2 条实际数据有值 | ❌ **本轮禁止访问生产，未核验** | **UNKNOWN** |

> 严禁把 B 当成 C。B00 只记载了「隐患编号 2/2 有值」这一项，其余 36 列的实际填充率**尚无实测记录**。

---

## 11. 复查字段

### 11.1 源码结论：**没有独立的「复查」概念，只有「验收」**

| 任务书要求的复查语义 | 是否存在 | 对应实现 | 判定 |
|---|---|---|---|
| 复查人 | ⚠️ 近似 | `验收人`（= Session 姓名，**安环管理部**人员） | PARTIAL |
| 复查时间 | ⚠️ 近似 | `验收时间` | PARTIAL |
| 复查结果 | ⚠️ 近似 | `验收结论`（`通过…` / `打回…`） | PARTIAL |
| 复查意见 | ⚠️ 近似 | `验收结论` 的后半段（`通过：<comment>` / `打回：<comment>`，comment ≤200） | PARTIAL |
| 复查照片 | ❌ **无** | 无「复查照片」列；`整改后照片` 由**整改人**上传，不是复查人 | NOT FOUND |

### 11.2 为什么这**不是**复查（对 B03 至关重要）

| 维度 | 本系统的「验收」 | 制度意义的「复查」 |
|---|---|---|
| 主体 | 安环管理部内部人员（`hazardGate` 强制） | 通常为上级/第三方/属地监管 |
| 目的 | 判定整改是否完成 → 销号 | 判定隐患是否复发/是否真改 |
| 次数 | 一次性（通过即终点，`已闭环` 无出边） | 可周期性多次 |
| 证据 | 整改人自传的照片 + 安环部一次点击 | 独立取证 |
| 数据留痕 | 只有最后一轮（改派即清场，§10.2） | 需完整历史 |

> 对照 B02 已确认的另一条链路：PG 侧 `hse_reviews` 60 条 `closed` 记录「零复查证据」（`review(pass)` 从未触发）。**两条链路的「复查」都是空的，但空法不同**：PG 侧是表在流程不通；飞书侧是**根本没有复查表/列，只有一个验收字段位**。

---

## 12. 图片 / 附件

### 12.1 上传与落列

```text
H5: dataURL ──压缩──▶ File ──multipart──▶ POST /api/mobile/upload
                                             │ 门1 Session（employee_code=sub）
                                             │ 门2 ≤ UPLOAD_BODY_LIMIT
                                             │ 门3 ≤ UPLOAD_MAX_BYTES + magic bytes（仅 JPEG/PNG）
                                             │     扩展名与内容必须相符
                                             ▼
                                    drive/v1/medias/upload_all
                                      parent_type=bitable_image
                                      parent_node=<FS_APP_TOKEN>
                                             ▼
                                        file_token（字符串）
                                             ▼
                          提交时包成 [{ file_token }] 写入附件列（t17）
```

| 项 | 值 | 证据 |
|---|---|---|
| 上传接口 | `POST /api/mobile/upload` | `index.js:2045-2091`；路由 `4760` |
| 鉴权 | Session 必需（无 session → 401） | `2052-2055` |
| 类型限制 | JPEG / PNG（magic bytes 判定，不信 Content-Type） | `2070-2074` |
| 数量限制 | 每列 ≤3（`HAZARD_PHOTO_MAX`） | `index.js:2897`；`3247,3256` |
| token 校验 | `^[A-Za-z0-9]{10,120}$`，去重 | `3248,3258` |
| 落列格式 | `[{ file_token: 'xxx' }]` | `3326,3329` |
| 读取 | `hazardPhotoTokens()` 兼容 `[{file_token}]` 与扁平字符串 | `3124-3133` |
| 下载/代理 | `downloadMedia`（GET `/drive/v1/medias/{token}/download`） | `feishuAdapter.js:353-384` |
| 非图附件 | **不支持**（`parent_type` 硬编码 `bitable_image`） | `feishuAdapter.js:324` |

### 12.2 两个附件列的语义边界

| 列 | 上传者 | 时机 | 非空后果 |
|---|---|---|---|
| `现场照片` | 排查人 | 登记时 | 仅存档 |
| `整改后照片` | **排查人（登记时）** 或 **整改人（整改时）** | 登记 / 整改 | **登记时非空 ⇒ 直接 `已闭环`**（跳过验收） |

> 这是本链路最重要的一个隐式业务规则：**「附带整改后照片提交」= 自证自改自销，无人验收**。它把「排查人」和「整改人」合并成了同一个人（虽然制度上整改人是被指派的另一个人）。B03 设计同步时必须保留这个语义，否则会算错闭环率。

### 12.3 已知风险（只标记，不修）

| 编号 | 风险 | 等级 | 依据 |
|---|---|---|---|
| B03B-IMG-01 | 附件只有 `file_token`，**无 URL、无过期时间、无大小/哈希**；PG 若要落地必须保存 token 并持续用 tenant_access_token 换图 | P2 | `feishuAdapter.js:320-348` |
| B03B-IMG-02 | 「登记即闭环」使闭环率虚高（未经任何验收的关键控制点失效） | **P1** | `index.js:3253-3260,3321` |
| B03B-IMG-03 | 改派清空整改后照片，**图片资产变成孤儿 token**（飞书侧不删，但业务无引用） | P2 | `index.js:3703-3708` |

---

## 13. create / update / delete / revoke 行为

### 13.1 写入方式总表

| 操作 | 飞书 API | 调用点 | 字段集 | 备注 |
|---|---|---|---|---|
| create | `POST /records/batch_create`（body `{records:[{fields}]}`） | `feishuAdapter.js:154-180` ← `index.js:3345` | 11 基础 + 条件 2 坐标 + 条件 1 照片 + 条件 3 闭环 + 条件 6 AI（上限 23） | **一次只传 1 条**（`[record]`），未用批量能力 |
| update | `PUT /records/{id}`（body `{fields}`） | `feishuAdapter.js:186-211` ← `3710,3841,3926` | 分支各异，见 13.2 | 注释主张「只传要改的列，其余列不动」 |
| upsert | **无** | — | — | 无 merge/insert-or-update 语义 |
| delete | 存在 `batchDelete`，但**隐患链路 0 调用** | `feishuAdapter.js:214-234` | — | 唯一调用点是巡查主台账去重（`index.js:2449`） |
| revoke / 撤销 | **无** | — | — | 无路由、无状态、无列 |

### 13.2 update 的三处字段集（精确）

| handler | 字段集 | 行号 |
|---|---|---|
| **assign** | `整改人ID` `整改人姓名` `整改人部门` `指派人ID` `指派人姓名` `指派时间` `整改期限` `处理状态`（=待整改）＋ 改派时清 `整改说明` `整改提交时间` `整改后照片` | 3693-3708 |
| **rectify** | `处理状态`（=待验收）`整改提交时间` ＋ 条件 `整改说明` `整改后照片` | 3834-3839 |
| **review(pass)** | `处理状态`（=已闭环）`验收人` `验收时间` `闭环时间` `验收结论` | 3909-3915 |
| **review(reject)** | `处理状态`（=待整改）`验收人` `验收时间` `打回次数` `验收结论` | 3917-3923 |

### 13.3 是否存在状态迁移？

**是**，且是「读-改-写」三段式：`getRecord` → 本地判状态 → `PUT`。见 13.4 的并发问题。

### 13.4 并发与一致性（源码事实，非建议）

| 事实 | 说明 | 证据 |
|---|---|---|
| 无版本号 / ETag / CAS | 三个写接口都是 `getRecord` 后无条件 `PUT` | `3658,3816,3891` → `3710,3841,3926` |
| ⇒ 存在丢更新窗口 | 两人同时验收同一条时，后写覆盖前写（`打回次数` 尤甚：读了再 +1） | `3921` |
| PUT 语义依赖上游 | 「只更新传入列」是源码注释的主张，本轮**未调 API 验证**（禁止访问生产） | `feishuAdapter.js:183-185` → §16 G3 |
| 幂等仅覆盖 create | 只有 submit 有 cid 幂等；assign/rectify/review **无幂等键**，重试即重复写 | 3610 段落 |

### 13.5 「重新提交」与「重复提交」

| 场景 | 是否允许 | 防线 |
|---|---|---|
| 同一隐患重复 rectify | ❌ 拒 409（`处理状态` 已非待整改） | `3828-3831` |
| 打回后再次 rectify | ✅ 允许（回到待整改） | 状态机设计 |
| 同一 cid 重复 submit | ✅ 幂等返回既有 recordId（不新建） | `3279-3304` |
| 无 cid 重复 submit | ⚠️ **会新建两条**（cid 是唯一幂等键） | `3279`「if (cid)」 |
| 弱网重试造成重复 | 三重防线：isolate 缓存 5 min → 飞书 search `备注 contains req:<cid>` → 在途 Promise 30 s | `2909,2914` |
| 飞书 search 索引延迟风险 | 代码注释明确记载该表「新建记录有分钟级延迟」（15:28 提交 → 15:31 查不到 → ~15:33 可见），因此 list 走全表 scan 而非 search | `3528-3531` |
| ⇒ 由此推出的风险 | 幂等预查**恰恰用的是 search**（`storage/index.js:130-131`），索引延迟窗口内若 isolate 缓存也失效（如冷启动/换节点），理论上可落两条 | `storage/index.js:120-139` + `3279-3304` |

---

## 14. 已确认字段（38 项，可直接进入 B03-01-C）

> 「可写方」列：W = Worker；F = 飞书自动；— = 非列对象

| # | Feishu 列 | 类型 | 可写方 | 写入 handler |
|---|---|---:|---|---|
| 1 | 隐患编号 | t1 | W | submit |
| 2 | 排查人ID | t1 | W | submit |
| 3 | 排查人姓名 | t1 | W | submit |
| 4 | 排查人部门 | t1 | W | submit（常量） |
| 5 | 排查人职位 | t1 | W | submit |
| 6 | 排查时间 | t1 | W | submit |
| 7 | 隐患类别 | t3 | W | submit |
| 8 | 隐患级别 | t3 | W | submit |
| 9 | 隐患位置 | t1 | W | submit |
| 10 | 隐患描述 | t1 | W | submit |
| 11 | 纬度 | t1 | W | submit（条件） |
| 12 | 经度 | t1 | W | submit（条件） |
| 13 | 现场照片 | t17 | W | submit（条件） |
| 14 | 处理状态 | t3 | W | submit/assign/rectify/review |
| 15 | 备注 | t1 | W | submit（`req:<cid>`） |
| 16 | 整改人ID | t1 | W | assign |
| 17 | 整改人姓名 | t1 | W | assign |
| 18 | 整改人部门 | t1 | W | assign |
| 19 | 指派人ID | t1 | W | assign |
| 20 | 指派人姓名 | t1 | W | assign |
| 21 | 指派时间 | t1 | W | assign |
| 22 | 整改期限 | t1 | W | assign |
| 23 | 整改说明 | t1 | W | rectify |
| 24 | 整改提交时间 | t1 | W | rectify |
| 25 | 整改后照片 | t17 | W | submit / rectify |
| 26 | 验收人 | t1 | W | review |
| 27 | 验收时间 | t1 | W | review |
| 28 | 验收结论 | t1 | W | submit / review |
| 29 | 闭环时间 | t1 | W | submit / review |
| 30 | 打回次数 | t1 | W | review(reject) |
| 31 | 整改依据 | t1 | W | submit（条件） |
| 32 | 整改建议 | t1 | W | submit（条件） |
| 33 | 三违判定 | t1 | W | submit（条件） |
| 34 | 重大事故隐患判定 | t1 | W | submit（条件） |
| 35 | 风险等级 | t1 | W | submit（条件） |
| 36 | AI识别原始输出 | t1 | W | submit（条件） |
| 37 | 创建时间 | t5 | F | 飞书 auto_fill |
| 38 | （record_id） | — | F | 飞书生成，Worker 透传 |

**统计**：36 列 Worker 可写 + 1 列飞书自动 + 1 个技术主键 = 38 项。

> 注：其中「条件写」共 12 列（纬度/经度/现场照片/整改后照片/闭环时间/验收结论 + 6 AI 列），是否落值取决于用户当次操作路径，不是必然有值。

---

## 15. 未找到字段（11 项）

| # | 期望字段 | 检索面 | 结论 | 备注 |
|---|---|---|---|---|
| 1 | 网格 ID（`grid_id`） | H5 payload / Worker 入参 / Feishu 列 | **NOT FOUND** | H5 有 `patrolMeta.grids`，但隐患链路 0 引用 |
| 2 | 网格名称（`grid_name`） | 同上 | **NOT FOUND** | — |
| 3 | 乡镇（`township`） | 同上 | **NOT FOUND** | 只有 `隐患位置` 自由文本 |
| 4 | 区域（`area`） | 同上 | **NOT FOUND** | — |
| 5 | 班组 / 片区（`team`） | 同上 | **NOT FOUND** | — |
| 6 | 作业单元（`operation_unit`） | 同上 | **NOT FOUND** | — |
| 7 | 隐患类型（`hazard_type`） | 同上 | **NOT FOUND** | 「隐患类别」是 11 项业务分类，与 PG `hazard_type`（全空）不同源 |
| 8 | 来源 / `source_channel` | 同上 | **NOT FOUND** | 无入参、无列 |
| 9 | 通用附件（非图片） | Feishu 列 + adapter | **NOT FOUND** | `parent_type` 硬编码 `bitable_image` |
| 10 | 更新时间 | adapter + 列定义 | **NOT FOUND** | Worker 不写；adapter 只 map `record_id`+`fields`，丢弃 `last_modified_time` |
| 11 | 撤销 / 作废 / 注销 | 路由 + 状态 + 列 | **NOT FOUND** | 无路由、无状态值、无列 |

---

## 16. 无法确认字段 / 事项（5 项，均因「禁止访问飞书」）

| 编号 | 事项 | 为什么无法确认 | 缺什么证据 | 对 B03 的影响 |
|---|---|---|---|---|
| **G1** | 飞书实际列是否为 38 列，第 38 列是什么 | 本轮禁止调用 Feishu API；源码只能拼出 37 列 | 一次 `GET /tables/{id}/fields`（1 次只读 API） | 映射矩阵会缺 1 列，需在 B03-01-C 或授权后补 |
| **G2** | 「处理状态」单选实际选项集是否为 5 项 | 扩容脚本是否在生产执行过，无执行回执 | 同上（fields 接口返回 options） | 若只有 4 项，则「待验收」写入会失败或飞书自动加项；影响状态机可落地性 |
| **G3** | `PUT /records/{id}` 是否真为「仅更新传入列」 | 源码注释如此主张，未验证 | 飞书官方文档确认 或 1 次受控实验 | 若为全量覆盖，则 assign 会把无关列清空 —— 这是**高危假设** |
| **G4** | 生产实际生效的 hazard 表是否为 `tblnyMjxtxjpP08q` | `wrangler.toml:116` 是仓库侧配置；线上 var 可能不同（且缺省时会按**表名**反查，可能命中同名另一张表） | 线上 `wrangler deployments` / `vars` 或一次只读 listTables | 决定同步层读哪张表 |
| **G5** | 线上部署的 Worker 版本是否等于仓库 `deploy.js` | 仓库内 `index.js` 与 `deploy.js` 隐患段 md5 相同（`45dd03d3…`，行 2850-3960 逐字节一致），但线上版本无版本号可比对 | 部署时间戳与产物哈希 | 低（源码一致）；但「改了没发」类事故本仓已有先例（见 docs/191副 2026-10-20 交付报告标题） |

### 16.1 为什么不影响本轮结论

G1~G5 全部是**上游事实核验**问题，不影响「Worker 写了哪些列名、值从哪来」这一核心命题 —— 该命题已由源码 100% 覆盖（36 列可写 + 1 自动列，逐列有行号）。

---

## 17. 对未来 Feishu→PG 的影响（只陈述约束，不设计同步）

> 本节**只回答「已知事实对后续设计构成什么硬约束」**，不提出任何同步实现方案（Webhook / 定时拉取 / CDC / Queue / ETL 一律留到 B03 后续节点）。

### 17.1 七个硬约束

| # | 约束 | 事实依据 | 后果 |
|---|---|---|---|
| C-1 | **没有业务主键** | 「隐患编号」无唯一约束、4 位随机可撞（`index.js:3115-3120`）；`record_id` 只是飞书技术键 | PG 侧唯一可用键 = `record_id`（外来键）。若 PG 不能存飞书 record_id，则无可回指键 |
| C-2 | **没有组织外键** | 网格/乡镇/区域/班组/作业单元全 NOT FOUND（§15） | 「按单位统计隐患」在数据层**不可能**，除非先补词表 + 采集 |
| C-3 | **「排查人部门」是常量** | `hazardGate` 强制（`index.js:3106`） | 不能用它做部门维度分析；责任人维度只能用「排查人ID（手机号）」 |
| C-4 | **位置是自由文本，且来源三合一** | 手输 / 16 项静态词表 / 高德逆地理地址（§7.3） | PG 若需要 township，必须做文本归一 + 词表映射；而词表本身有三套且不一致 |
| C-5 | **状态词表两侧不兼容** | 飞书 5 选项 / 实际 3 值；PG `hazards.status` 为 `discovered` 等 Excel 词表（B02 已记） | 必须建映射表，且无法双向无损（「整改中」在飞书无来源，`discovered` 在飞书无对应） |
| C-6 | **无更新时间** | Worker 不写；adapter 丢弃 `last_modified_time` | 增量同步**没有可靠水位**，天然倾向全量比对（成本高） |
| C-7 | **无删除/撤销** | 无路由无状态（§13.5） | 同步侧不必处理「源删除」；但**人工在飞书里直接删行**仍会造成源端消失（不可观测） |

### 17.2 三个「看起来能用、实际不能用」的字段（B03 高频踩坑点）

| 字段 | 看起来是 | 实际是 |
|---|---|---|
| `隐患编号` | 业务编号、天然主键 | 展示用编号，无查重、可撞、无约束 |
| `排查人部门` | 组织归属 | 常量「安环管理部」 |
| `隐患位置` | 地点 | 三种来源混写的自由文本，且快捷词表与实际作业单元清单 4 处错位 |

### 17.3 一个 B02 未记录的、对 B03 有直接影响的语义

> **「带整改后照片提交 ⇒ 直接闭环」**（`index.js:3253-3260,3321`）意味着：**「已闭环」不等于「经过验收」**。
> PG 侧若用「是否闭环」派生考核扣分或闭环率，会把「自证自改」的记录计入「已整改」，而这类记录**没有任何第三方验收证据**。这与 B02 已发现的 PG `hse_reviews`「60 条 closed 零复查证据」在性质上同源 —— 两条链路的「闭环」都缺验收证据。

---

## 18. B03-01-B 最终状态

### 18.1 六项 PASS 判据逐条核对

| # | 判据 | 结果 | 依据 |
|---|---|---|---|
| 1 | H5 字段已追踪 | ✅ 满足 | §3.2（16 键全量，逐键有赋值行号） |
| 2 | Worker 接收字段已追踪 | ✅ 满足 | §3.3（15 步校验，逐步入参） |
| 3 | Worker 写 Feishu 字段已追踪 | ✅ 满足 | §4（38 项全部定位到写入行号） |
| 4 | `record_id` 生命周期已确认 | ✅ 满足 | §5（生成点、透传点、复用点、无副本） |
| 5 | create / update 行为已确认 | ✅ 满足 | §13（create 1 处、update 3 处，字段集精确） |
| 6 | 人员 / 区域字段来源已确认 | ✅ 满足 | §6（人员=Session→身份表手机号）；§7（区域=确认不存在，非「未查到」） |

### 18.2 但为什么不是 PASS

| 缺口 | 性质 | 影响面 |
|---|---|---|
| G1 飞书实际列 38 vs 源码 37 | 事实核验缺口 | 映射矩阵缺 1 列 |
| G2 状态选项是否 5 项 | 事实核验缺口 | 状态机可落地性 |
| G3 PUT 是否仅更新传入列 | **高危假设未验证** | 若为全量覆盖，assign 会清空无关列 |
| G4 生产实际表 ID | 配置核验缺口 | 同步层读哪张表 |
| G5 线上版本一致性 | 部署核验缺口 | 低 |

> **判定：`PASS WITH GAPS`。**
> 缺口全部指向「飞书侧现状」，不指向「Worker 侧代码」。Worker 侧证据链（H5 → proxy → Worker → adapter）**完整闭合、无断点**。

### 18.3 回执

```text
B03-01-B：PASS WITH GAPS

代码修改：0
DDL：0
DML：0
配置修改：0
部署：0
生产数据访问：0（未调用任何飞书 API、未连数据库、未运行 Worker）

H5 请求体键：16（7 恒发 + 9 条件位）
Worker 隐患接口：9（写 4 / 读 5）
Feishu 可追溯列：37（源码）+ 1（B00 实测差项，待核）
Worker 可写列：36
飞书自动列：1（创建时间）
技术主键：1（record_id）

CONFIRMED：38 项
PARTIAL：1 项（备注：列在、语义被幂等键占用）
NOT FOUND：11 项
UNKNOWN：5 项（G1-G5，均因禁止访问飞书）

已核验文件：
- grid-mobile-cloudflare/worker/index.js（4957 行，隐患段 2890-3945）
- grid-mobile-cloudflare/worker/deploy.js（隐患段 2850-3960 与 index.js 段内 md5 一致：45dd03d3fe1c86ebd192c506aef674ea；整文件 diff 148 行，均不在隐患段）
- grid-mobile-cloudflare/worker/storage/index.js（158 行）
- grid-mobile-cloudflare/worker/storage/feishuAdapter.js（386 行）
- grid-mobile-cloudflare/worker/wrangler.toml（表 ID 配置段 105-116）
- grid-mobile-cloudflare/worker/_scratch/hazard-table-create.mjs（152 行）
- grid-mobile-cloudflare/worker/_scratch/hazard-fields-extend.mjs（82 行）
- grid-mobile-cloudflare/worker/_scratch/hazard-ai-fields.mjs（字段定义段）
- grid-mobile-cloudflare/frontend/check.app.js（5797 行，隐患段 4550-5560）
- grid-mobile-cloudflare/frontend/check.html（1581 行，隐患表单段）
- grid-mobile-cloudflare/frontend/config.js（15 行，API_BASE 口径）
- grid-mobile-cloudflare/pages/functions/api/[[route]].js（4 行）
- grid-mobile-cloudflare/pages/functions/_workerProxy.js（66 行）
```

---

## 19. 下一节点

> **B03-01-C：Feishu 字段 → PG 目标字段映射矩阵**

### 19.1 C 节点可以直接用的输入（本报告已确认的部分）

| 输入 | 内容 |
|---|---|
| 源侧列清单 | 36 个 Worker 可写列（列名 + 类型 + 值域枚举 + 写入 handler） |
| 值域枚举 | 隐患类别 11 / 隐患级别 2 / 处理状态 3（写入值）/ 三违判定 2 / 重大判定 2 / 风险等级 4 |
| 人员标识 | 手机号（11 位数字）为唯一机器标识 |
| 位置语义 | 自由文本，三来源混合，无机器标识 |
| 主键 | `record_id`（飞书技术键）+ `隐患编号`（不可作键） |
| 闭环语义 | 「已闭环」≠「经验收」（登记即闭环可跳过验收） |

### 19.2 C 节点必须先解决的三件事（否则映射会写错）

1. **G3（PUT 语义）** —— 如果 PUT 是全量覆盖，则「当前 Feishu 列的实际填充率」不能作为映射依据（有些列可能被后续操作清空）。**建议在 C 节点开工前，由用户授权一次只读 `fields` + `records?page_size=10` 调用，一次解决 G1/G2/G4 三问。**
2. **G1/G2（列与选项实况）** —— 同上，一次只读调用可全部解决。
3. **区域词表口径** —— C 节点写「位置 → township」映射前，必须先有 B02-DEC-03（区域主数据）的裁决结果；否则映射目标不存在。**B02-DEC-03 仍是 C 节点的硬前置。**

### 19.3 本节点不做的事（边界声明）

| 不做 | 理由 |
|---|---|
| 不设计 Feishu→PG 同步方案 | 任务书 §八 明确禁止；留 B03 后续节点 |
| 不决定 PG 目标表结构 | 留 B03-01-C/D |
| 不合并 PG `hazards` 与飞书隐患 | B02-DEC-04/05 未裁 |
| 不修改任何代码 / 配置 / 飞书结构 | 任务书 §一 明令禁止 |

---

## 附录 A｜取证方法与自查

### A.1 检索式有效性验证（防「假零命中」）

本轮所有「0 命中」结论都先做了**正对照**：

| 检索 | 正对照（应命中） | 结果 | 结论 |
|---|---|---|---|
| `tblnyMjxtxjpP08q` 在代码中 | 已知该 ID 存在于 `wrangler.toml:116` | 仅 `wrangler.toml` 命中；`index.js`/`storage/*.js` 0 命中 | 有效：ID 走 env 注入 |
| `grid` / `township` 在隐患链路 | 同文件内 `patrolMeta.grids` 应命中 | 巡查段命中、隐患段 0 命中 | 有效：不是检索式问题，是链路确实没接 |
| `hazard` + `delete|revoke` | 已知 `batchDelete` 存在于 adapter | 命中 4 处，全部是 isolate Map `.delete()` | 有效：无业务删除 |

### A.2 本轮未做的事（合规声明）

- ❌ 未调用飞书任何 API（无 token 请求、无 bitable 读写、无 media 上传）
- ❌ 未连接任何数据库（无 psql、无 PG 查询）
- ❌ 未运行 Worker（无 wrangler dev / deploy / tail）
- ❌ 未修改任何文件（除本报告新增）
- ❌ 未改动 `server/routes/cost.js`

### A.3 引用的前序文档

| 文档 | 用途 |
|---|---|
| `docs/架构基线/B00-隐患H5-飞书-PG字段映射审计.md` | 飞书 38 列实测、PG `hazards` 46 列、三侧映射统计（本报告 D-1/D-2/D-3 差异对照源） |
| `docs/架构基线/B02-DEC-业务裁决包.md` | DEC-03（区域）/ DEC-04（隐患模型）/ DEC-05（PG-飞书归属）三项硬前置 |
| `docs/架构基线/B02-跨系统数据对象边界审计.md` | 跨系统对象分类口径 |
