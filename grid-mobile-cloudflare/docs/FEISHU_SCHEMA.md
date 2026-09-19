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
   表 ID（已写入 `wrangler.toml`）：
   - 身份 `tblCyjmcA8XAVTdn`
   - 花名册 `tbl2ZHdXX5d8R12a`（**1291 人，正式花名册**）
   - 网格长信息台账 `tbl58t9kjyDlacSw`（**68 人，登录唯一来源 + 转派乡镇推导数据源**）
   - 巡查测试 `tblYa9aQD1lhDV8s` / 巡查生产 `tblh1MHy3yjJIyiO`
   - app_token `WX9TbTqJKa7sywsgrU4cVoKdnXb`

   ⚠️ 历史坑：同 base 内另有 `tblO3A9wDnA9Lm74`「H5花名册表」**只有 1 条测试数据，不是花名册**，勿再指向它。

3. **凭据**：`cd grid-mobile-cloudflare/worker && wrangler secret put FS_APP_ID` / `wrangler secret put FS_APP_SECRET`
   （App ID `cli_aa23e52bccb8dbeb`；Secret 经 `secret put` 注入，**不落文件/Git/前端**）。
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

## 5b. 网格长信息台账结构（`tbl58t9kjyDlacSw`）—— 2026-09-17 实测

> 这是**登录唯一事实源**，也是「转给责任乡镇」的数据源。共 **68 人**，8 列：
> 序号 / 姓名 / 直接上级 / 所属部门 / 职位 / 网格长等级 / 手机号 / 分级

### 分级（决定角色）

| 分级 | 人数 | 应用角色 |
|---|---|---|
| 公司管理 | 6 | `公司管理`（可用「转给责任乡镇」） |
| 乡镇作业中心经理 | 11 | `经理` |
| 管理员 | 51 | `管理员` |

### 所属部门写法（⚠️ **不含「作业中心」三字**，勿按旧假设解析）

| 类别 | 写法 | 例 |
|---|---|---|
| 乡镇经理 | `XX镇/乡/街道` + **片区** | `宁城街道片区`、`柴胡店镇片区`、`刘营伍乡片区` |
| 乡镇管理员 | `XX镇/乡/街道` + **N班** | `宁城街道一班`、`杜集镇三四班`、`杜集镇六七班`、`杜集镇十班` |
| 公司本部 | 部门名（**排除**） | `项目管理层`、`安环管理部`、`生产管理部`、`环卫作业中心`、`市政园林作业中心` |
| 公园 | 公园名（**排除**） | `康宁湖公园`、`新河公园`、`中心公园`（是管理员但不属乡镇） |

### 推导出的 12 个责任乡镇（与业务口径一致）

| # | 乡镇 | 经理 | 管理员 |
|---|---|---|---|
| 1 | 保店镇 | 杨清华 | 4 |
| 2 | 柴胡店镇 | 王臣祥 | 6 |
| 3 | 大曹镇 | 孙建栋 | 3 |
| 4 | 大柳镇 | 谢俊章 | 3 |
| 5 | 杜集镇 | 张卫新 | 8 |
| 6 | 津城街道 | ⚠️ **未配经理** | 3 |
| 7 | 刘营伍乡 | 张和祥 | 3 |
| 8 | 宁城街道 | 张万恒 | 1 |
| 9 | 时集镇 | 郭志强 | 4 |
| 10 | 相衙镇 | 李振恒 | 3 |
| 11 | 张大庄镇 | 靳洪刚 | 3 |
| 12 | 长官镇 | 张华平 | 4 |

合计：**经理 11 人 / 管理员 45 人**。

### 解析规则（`worker/index.js`）

```js
// 乡镇名 = 所属部门剥掉「片区」/「N班」后缀
const TOWN_DEPT_SUFFIX_RE = /(片区|[\d一二三四五六七八九十百]+班)$/u;
// 行政区划锚点：剥完后缀后必须以 镇/乡/街道 结尾 —— 这是排除公司本部与公园的关键
const TOWN_ANCHOR_RE = /(镇|乡|街道)$/u;
```

**两条必须遵守的约束**：

1. **不能只按「经理部门」推导乡镇** —— 津城街道只有 3 个管理员、**未配经理**，
   若只扫 `分级=乡镇作业中心经理` 的部门会整镇漏掉。必须按「所属部门归镇」。
2. **必须用行政区划锚点排除非乡镇** —— 公司本部（5 个）与公园（3 个）也是部门/有管理员，
   但都不是责任乡镇；只靠后缀剥离不足以区分，需 `镇|乡|街道` 结尾把关。

### 验证资产

```bash
cd grid-mobile-cloudflare/worker
node test/cfwps28-town-list.test.mjs      # 45 条离线单测（基于真实台账快照）
node test/cfwps28-e2e-real.mjs            # 真实台账端到端（模拟登录用户视角）
# 刷新快照（需凭据）：
FS_APP_ID=cli_xxx FS_APP_SECRET=xxx node test/_fetch-ledger-snapshot.mjs
```

---

## 5c. 两套字段模型与巡查链路（CF-WPS-29，第四轮 2026-09-17）

### 背景：H5 有**两类**记录，字段模型不同，不能直接映射到同一组列

| | 三违记录 | 普通巡查记录 |
|---|---|---|
| 触发入口 | 「是三违」→ 选三违行为 → 选人 → 整改 | 「不是三违」→ 选巡查结果 |
| `is_violation` | `是` | `否` |
| `problem_type` | `三违` | `一般问题` / `现场正常` |
| `violation_desc` | 三违库中的行为名（**必填**） | 不传 |
| `violation_people` | 人员串（必填） | 不传 |
| `description` | 行为名（+人员名） | `巡查结果：<结果>` |

前端映射层 = `frontend/check.html` 的 `toPatrolBody(rec)`；
后端校验层 = `worker/index.js` 的 `validatePatrolBody(body, problemTypes, violationLib)`。

### 三违标准库（业务方下发 20 条）

`patrol/meta.violation_types` 由后端**权威下发**，前端宫格不再硬编码 ——
保证「前端可选」与「后端可收」永远一致。可用 `MOBILE_PATROL_VIOLATION_TYPES` 覆盖
（逗号分隔；⚠️ 注意「脱岗、玩岗、替岗」本身含顿号，不能当分隔符）。

```
闯红灯 / 骑车不戴头盔 / 逆行 / 违章停车 / 超速行驶 / 违章掉头 / 违章变道 /
驾车时抽烟 / 打电话 / 破坏车内监控设施 / 未穿工作服 / 横穿马路 / 翻越护栏 /
不领取防暑物资 / 出车不三检 / 脱岗、玩岗、替岗 / 隐瞒身体不适状况上岗 /
危险作业未按要求采取保护措施 / 机动车道作业未摆放路锥 / 背向来车方向作业
```

### ⚠️ 白名单必须同时收三类取值（三个已修复的静默失败点）

`PATROL_DEFAULT_PROBLEM_TYPES` **必须**包含：

1. `三违` —— 否则三违记录恒 400（is_violation=是 才是真判据，但 problem_type 先被校验）；
2. `一般问题` / `现场正常` —— 否则**普通巡查主路径全断**（这是最常用入口）；
3. 常规类型 `环境卫生 / 设施设备 / 安全隐患 / 秩序管理 / 其他`。

`FEISHU_FIELD_WHITELIST` **必须**包含 `巡查时间` / `创建时间`（重映射源键）——
白名单判断先于重映射执行，漏收会导致时刻被静默丢弃（接口返回 success，但「日期/提交时间」列恒空）。

### 验证资产（新增）

```bash
cd grid-mobile-cloudflare/worker
node test/cfwps29-two-model.test.mjs      # 38 条：三违库 + 两模型校验不变量
node test/cfwps29b-contract.test.mjs      # 17 条：前端 toPatrolBody ↔ 后端校验 契约一致性
node test/cfwps30-feishu-typing.test.mjs  # 25 条：飞书字段变换（防时刻静默丢失）
node test/_t4-prod-probe.mjs              # 生产表列结构 ↔ 变换后写入键 比对（需凭据）
node test/_t4-timeloss-proof.mjs          # 线上记录时刻列核查（需凭据）
```

---

## 6. 安全收尾

- 飞书 App Secret 曾暴露于对话 → 切换前先在飞书后台**重置并轮换**。
- 临时探针项目 `feishu-edge-probe` 使命已完成，可 `wrangler pages project delete feishu-edge-probe --yes` 并删除其 secrets。
- 所有 secret 仅经 `wrangler secret put` 注入，不落文件/Git/前端/报告。
