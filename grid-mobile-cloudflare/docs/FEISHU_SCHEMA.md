# 飞书多维表格迁移规范（Phase B：WPS → 飞书 全量切换）

> 目标：保留 Cloudflare 部署，把存储后端从 WPS 多维表格换成飞书多维表格，
> 消除 WPS 出海「写出口挂死」（读通写挂），全量跑通公网 E2E。
> 已在 CF 海外边缘实测飞书 token 309ms / create 200 / delete 200（roundtrip 全绿）。

---

## 1. 切换原理（零行为变更）

`worker/index.js` 的业务逻辑（登录/身份/网格/巡查校验/白名单/Session）**一行不改**，
所有存储调用统一走 `worker/storage/` 适配层：

- `wpsAdapter.js`：现有 WPS 逻辑原样搬入（默认后端）。
- `feishuAdapter.js`：新写，接口与 wpsAdapter 同构
  （`scanRecords` / `createRecords` / `batchDelete`）。
- `storage/index.js`：`getAdapter(env)` 按 `STORAGE_BACKEND` 选择；
  `storageConfig(env)` 按后端返回 `fileId` + 四个 `sheetId`。
- 列名用「中文列名」做归一化桥 —— 因此飞书表的**列名必须与下面规范完全一致**，
  handler 的 mapper 才能直接复用。

后端差异（适配器内部消化，handler 无感）：

| 维度 | WPS | 飞书 |
|---|---|---|
| fileId | `WPS_DBSHEET_FILE_ID`（文件 id） | `FS_APP_TOKEN`（base app_token） |
| sheetId | `WPS_DBSHEET_*_SHEET_ID`（数字 sheet id） | `FS_*_TABLE_ID`（table id） |
| 写鉴权 | `client_credentials` → Bearer | `tenant_access_token`（app_id+app_secret） |
| 写格式 | `{records:[{fields_value: JSON字符串}]}` | `{records:[{fields: 对象}]}` |
| 列类型 | 任意（值 JSON 串） | **全部用「文本」列**，值即字符串，无需类型转换 |

---

## 2. 飞书表结构（共 3 张表，列名严格对齐）

> 全部建在同一个多维表格（base）里，base app_token = `FS_APP_TOKEN`。
> 每个表都是「文本」列（飞书叫 单行文本 / 多行文本均可，值为字符串）。
> 照片列本阶段不建（照片状态 PENDING_EXTERNAL）。
>
> **⚠️ 2026-09-17 更新：此节已被「类型化重建」取代**——巡查测试表/生产表已统一重建为
> Excel 21 列类型化结构 + H5 链路列（日期/提交时间=日期型、三违照片/整改后照片=附件型、
> 序号=数字、分组名称/网格等级/所属岗位/违章人性别/当日是否报名/是否补交=单选型），
> 旧「巡查时间/创建时间」文本列已删除。Worker 端 `feishuTypedRecord` 做日期→毫秒变换，
> 照片经 `/wps/upload/image`（飞书 drive media）上传返回 file_token，
> 巡查提交携带 `photo_tokens` 落入「三违照片」附件列。下文 2.3a/2.3b 列清单仅为 WPS 后端历史参考。

### 2.1 身份表（`FS_IDENTITY_TABLE_ID`）
对应 WPS 身份 Sheet（原 `WPS_DBSHEET_IDENTITY_SHEET_ID=14`）。

| 列名 | 类型 | 说明 |
|---|---|---|
| 姓名 | 文本 | |
| 手机号码 | 文本 | 仅存纯数字（11 位）；登录按手机号唯一命中 |
| password_hash | 文本 | bcrypt 哈希（`$2a$10$...`）；绝不明文 |
| 部门 | 文本 | |
| 职位 | 文本 | |
| 网格长等级 | 文本 | |
| 身份状态 | 文本 | 激活值 = `正常`（由 `IDENTITY_ACTIVE_STATUS` 控制） |
| employee_code | 文本 | 业务身份主键（登录后签发 Session 的 sub） |

### 2.2 花名册表（`FS_ROSTER_TABLE_ID`）
对应 WPS 员工信息维护 Sheet（原 `IDENTITY_ROSTER_SHEET_ID=11`）。

| 列名 | 类型 | 说明 |
|---|---|---|
| 员工编码 | 文本 | 登录后按此列精确命中 |
| 姓名 | 文本 | |
| 用工关系状态 | 文本 | 非空且不含「离职」方可登录 |
| 负责区域（在职） | 文本 | 网格来源。形态如 `八里堂村+惠宁` / `专业队`；分隔符 `+，、/;；|` 拆分；`0`/空=无效 |

### 2.3 巡查目标表（测试表 / 生产表 —— **两表列名不同**，以 worker/index.js handlePatrolSubmit 真实输出为准）

> ⚠️ 重要：测试目标与生产目标的记录字段键**不一致**（CF-WPS-17 §六/§七 分叉构建），
> 建表必须分别对应该目标的真实写出键，否则 Feishu 会因字段不存在而写失败。

#### 2.3a 巡查测试表（`FS_PATROL_TEST_TABLE_ID`，对应 WPS 隔离测试 Sheet）
测试开关未放开时 Worker 走此表；使用 `employee_code` 作身份列、`三违行为描述` 承载三违说明。

| 列名 | 类型 | 说明 |
|---|---|---|
| 测试编号 | 文本 | 服务端定值 `CF-WPS-13-TEST-{ts}` |
| employee_code | 文本 | 业务身份主键（测试表允许写入，区别于生产表） |
| 姓名 | 文本 | 取自 Session 快照 |
| 巡查时间 | 文本 | `YYYY-MM-DD` 或 `YYYY-MM-DD HH:MM` |
| 网格 | 文本 | 由花名册「负责区域（在职）」解析 |
| 问题描述 | 文本 | |
| 问题类型 | 文本 | 候选见 `MOBILE_PATROL_PROBLEM_TYPES` |
| 是否三违 | 文本 | 仅 `是` / `否` |
| 三违行为描述 | 文本 | 仅 is_violation=是 时填（注意：测试表用「三违行为**描述**」） |
| 涉及人员 | 文本 | 多人逗号分隔，≤200 字 |
| 照片状态 | 文本 | PENDING_EXTERNAL / 未拍摄 |
| 来源 | 文本 | 固定 `h5-mobile` |
| 测试状态 | 文本 | submitted |
| client_request_id | 文本 | 幂等键 |
| 创建时间 | 文本 | `YYYY-MM-DD` |

#### 2.3b 巡查生产表（`FS_PATROL_PRODUCTION_TABLE_ID`，对应 WPS 生产用台账 Sheet15）
三生产开关全放开时 Worker 走此表；身份列复用 `巡查人员ID`、三违说明用 `三违行为`。

| 列名 | 类型 | 说明 |
|---|---|---|
| 巡查人员ID | 文本 | 复用列；值=employee_code（CF-WPS-17 §六 安全复用） |
| 姓名 | 文本 | |
| 巡查时间 | 文本 | `YYYY-MM-DD` 或 `YYYY-MM-DD HH:MM` |
| 网格 | 文本 | |
| 问题描述 | 文本 | |
| 问题类型 | 文本 | 候选见 `MOBILE_PATROL_PROBLEM_TYPES` |
| 是否三违 | 文本 | 仅 `是` / `否` |
| 三违行为 | 文本 | 仅 is_violation=是 时填（注意：生产表用「三违行为」，无「描述」） |
| 涉及人员 | 文本 | 多人逗号分隔，≤200 字 |
| 来源 | 文本 | 固定 `h5-mobile` |
| client_request_id | 文本 | 幂等键 |
| 创建时间 | 文本 | `YYYY-MM-DD` |

> 实测建表：`setup-feishu-tables.mjs` 已按上述两表真实键在 base 内建好并 `verify-feishu-tables.mjs` 校验通过。

---

## 3. 部署切换步骤（用户侧，AI 不可代做）

1. **飞书应用**：已开 `bitable:app`（读写），已发布；应用已加为该 base 的**可编辑/可管理**协作者
   （文档页「⋯ → 更多 → 添加文档应用」）。✅ 已完成。
2. **建表**：按 §2 在 base 内建 3 张表（身份/花名册/巡查生产）+ 复用测试表并补齐列，列名严格对齐 handler 真实键。
   ✅ 已完成：`setup-feishu-tables.mjs` 真实建表，`verify-feishu-tables.mjs` 校验 4 表全通过。
   表 ID（已写入 `wrangler.toml`）：身份 `tblCyjmcA8XAVTdn` / 花名册 `tblO3A9wDnA9Lm74` /
   测试 `tblYa9aQD1lhDV8s` / 生产 `tblh1MHy3yjJIyiO`，app_token `WX9TbTqJKa7sywsgrU4cVoKdnXb`。
   ⬜ 仍待你做：**导入数据**（至少 1 个测试登录账号：手机号 + bcrypt 密码哈希 + employee_code + 花名册命中 + 负责区域）。
3. **凭据**：`cd grid-mobile-cloudflare/worker && wrangler secret put FS_APP_ID` / `wrangler secret put FS_APP_SECRET`
   （App ID `cli_aa23e52bccb8dbeb`；Secret 用轮换后的新值，**旧 Secret 已暴露须重置**）。
4. **表 ID**：✅ 已预先填入 `wrangler.toml`（见上）。如要改 base/表，重跑 `setup-feishu-tables.mjs`。
5. **切换后端**：`wrangler var put STORAGE_BACKEND feishu`（Worker 项目
   `grid-mobile-cloudflare-worker`）。
6. **部署**：`wrangler deploy`（会重新构建并上传 index.js + storage/*）。
7. **验证**：先跑本地 adapter 冒烟（§4），再跑公网 E2E
   （登录 → meta → submit → records → 清理）。

---

## 4. 本地 adapter 冒烟（无需部署，直接用真实飞书凭据）

```bash
cd grid-mobile-cloudflare/worker
FS_APP_ID=cli_xxx FS_APP_SECRET=xxx \
FS_APP_TOKEN=WX9TbTqJKa7sywsgrU4cVoKdnXb \
FS_PATROL_TEST_TABLE_ID=tblYa9aQD1lhDV8s \
node test/cfwpsB-feishu-adapter-smoke.mjs
```

> 该脚本导入 `feishuAdapter`，对指定表做 scan → create 1 条 → 读回 → batch_delete，
> 创建即删零污染。证明适配器在真实飞书 API 上正确。

---

## 5. 回退

`wrangler var put STORAGE_BACKEND wps` 即回退到 WPS 后端（wpsAdapter 完整保留）。
两后端并存于代码，切换无风险。

---

## 6. 安全收尾

- 飞书 App Secret 曾暴露于对话 → 切换前先在飞书后台**重置并轮换**。
- 临时探针项目 `feishu-edge-probe` 使命已完成，可 `wrangler pages project delete feishu-edge-probe --yes` 并删除其 secrets。
- 所有 secret 仅经 `wrangler secret put` 注入，不落文件/Git/前端/报告。
