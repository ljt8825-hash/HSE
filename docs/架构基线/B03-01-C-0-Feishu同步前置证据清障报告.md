# B03-01-C-0 Feishu同步前置证据清障报告

> 节点：B03 / B03-01 / C-0
> 前置：B03-01-B = PASS WITH GAPS（`docs/架构基线/B03-01-B-Worker-Feishu隐患字段核验报告.md`，commit `d045abf`）
> 性质：只读证据清障，**不是**同步实现、不是表结构改造、不是生产链修改
> 结论：**PASS WITH GAPS**（见 §15）

---

## 1. 执行范围

### 1.1 本轮做了什么

上一节点留下 5 个 UNKNOWN（G1–G5）。本轮在**完全只读**前提下，把其中 4 个（G1/G2/G3/G4）清到可判定，并核验区域（DEC-03）能否支撑同步目标字段。

| 动作 | 范围 | 说明 |
|---|---|---|
| 源码只读检索 | 7 个文件 | `worker/index.js`(4957 行)、`storage/index.js`、`storage/feishuAdapter.js`、`wrangler.toml`、`frontend/check.app.js`、`frontend/check.html`、`_scratch/hazard-table-create.mjs` |
| 飞书只读 API | 6 个脚本轮次 | 数据面**全部 GET**（`tables` / `fields` / `records`）；另每轮 1 次 `auth/v3/tenant_access_token/internal` 取 token（POST，但非数据面、不写任何业务对象） |
| PostgreSQL 只读查询 | 3 组 | 仅 `SELECT`，仅 `safety_dashboard_dev` |
| 官方文档核验 | 1 篇 | 飞书「更新记录」API 文档（增量更新语义） |
| 代码修改 / DDL / DML / 配置 / 部署 / 生产写入 | **0** | 见 §16 与回执 |

### 1.2 本轮没有做什么（边界）

- 未新增 / 修改任何 sync service、cron、queue、migration、表、字段
- 未向飞书写入任何记录，未改任何字段 / 选项 / 视图
- 未修改 H5、Worker、`wrangler.toml`、`.dev.vars`
- 未碰 `server/routes/cost.js`
- 未决定 PG 目标表结构、未做 110 条历史合并、未把飞书 2 条写入 PG

---

## 2. 生产冻结边界

### 2.1 冻结链路（本轮零触碰）

```text
手机 H5 (frontend/check.app.js)
  → Cloudflare Worker (worker/index.js)
  → Feishu Bitable (base WX9TbTqJKa7sywsgrU4cVoKdnXb)
  → 表 tblnyMjxtxjpP08q「H5隐患排查台账表」
```

### 2.2 本轮触碰方式

| 对象 | 触碰方式 | 是否改 |
|---|---|---|
| H5 源码 | 只读 grep / sed 阅读 | 否 |
| Worker 源码 | 只读 grep / sed 阅读 | 否 |
| `wrangler.toml` | 只读 grep 阅读（未写入） | 否 |
| `.dev.vars` | 只读读取凭证（文件本身 gitignored、未入库） | 否 |
| Feishu 生产表 | 只读 GET（2 条记录、38 列 schema、6 张表清单） | 否 |
| Feishu 生产数据 | **只读**，0 写入 | 否 |
| Cloudflare 部署 | 未部署、未 `wrangler dev`、未调 Worker 生产端点 | 否 |
| PostgreSQL | 只读 `SELECT`（`safety_dashboard_dev`） | 否 |

### 2.3 关于「生产只读访问」的合规说明

本轮读取了生产 base 的 2 条隐患记录。**落盘与本文档的全部人员字段均已脱敏**：手机号统一按 `1**********` 形式处理（仅保留首位，长度 11），姓名仅在「是否与身份表一致」的布尔判断中使用，未输出身份证 / 密码哈希 / 微信 UID 等任何凭据类字段。

---

## 3. G1 实际隐患表定位

### G1_STATUS = **CONFIRMED**

### 3.1 定位链（三级）

| 级 | 位置 | 内容 | 结论 |
|---|---|---|---|
| ① 显式 env | `worker/wrangler.toml:116` | `FS_HAZARD_TABLE_ID = "tblnyMjxtxjpP08q"` | 已配置 |
| ② 读取 | `worker/storage/index.js:55` | `hazardSheetId = await tableIdFor(env, 'FS_HAZARD_TABLE_ID', ROLE_TABLE_NAMES.hazard)` | 显式优先 |
| ③ 兜底 | `worker/storage/index.js:42-46` | `tableIdFor()`：显式为空则 `resolveTableIdByName()` | 按**表名**反查 |
| ④ 表名契约 | `worker/storage/index.js:18-24` | `hazard: 'H5隐患排查台账表'` | 冻结契约（注释：勿改） |
| ⑤ 反查实现 | `worker/storage/index.js:27-38` | `listTables()` → `Map(name → tableId)`，**模块级缓存** | 同 isolate 内只解析一次 |

### 3.2 生产 base 实测（GET /tables）

base `WX9TbTqJKa7sywsgrU4cVoKdnXb`，名称 **「9月台账」**，共 6 张表：

| table_id | name |
|---|---|
| `tbl5QiCv5Qbal044` | H5员工日常不安全行为台账 |
| `tbl58t9kjyDlacSw` | H5移动端身份表 |
| `tbl2ZHdXX5d8R12a` | H5花名册表 |
| `tbldxrUusDYuqdno` | 规则表 |
| `tbl5hz1RyHlO3C3l` | 表格视图 |
| **`tblnyMjxtxjpP08q`** | **H5隐患排查台账表** |

**判定**：`tblnyMjxtxjpP08q` 存在，且**全 base 内只有 1 张表叫「H5隐患排查台账表」**（`NAME_COLLISION = 1`）。

### 3.3 四个必答问题

**A. 生产 Worker 实际使用哪个 table_id？**
= `tblnyMjxtxjpP08q`。三重证据：
1. env 显式配置即此值（`wrangler.toml:116`）；
2. 名称兜底解析出的也是此值（唯一同名表）；
3. **数据面反证**：该表 38 列含 `隐患编号` / `隐患位置`；主台账 `tbl5QiCv5Qbal044` **33 列、无这两列**。而 Worker 创建记录时首字段即写 `隐患编号`（`index.js:3311`），若写错表必然 `1254045 FieldNameNotFound`。故落点只能是本表。

**B. 是否存在 env 缺失时按表名查找？**
存在。`storage/index.js:42-46`：`explicit` 为空 → `resolveTableIdByName(env, 'H5隐患排查台账表')`。

**C. fallback 是否可能命中同名其他表？**
- **同 base 内**：不会。全 base 唯一同名（`NAME_COLLISION=1`）。
- **跨 base 会**。本机存在第二个 base（`.dev.vars` 的 `FS_APP_TOKEN`，值已脱敏），其 6 张表**名称与生产完全同名、table_id 全不同**：

| 表名 | 生产 base | 第二 base（dev） |
|---|---|---|
| H5员工日常不安全行为台账 | `tbl5QiCv5Qbal044` | `tbl4dxmxT7k7sBIG` |
| H5移动端身份表 | `tbl58t9kjyDlacSw` | `tblxBEnaRFBOklqj` |
| H5花名册表 | `tbl2ZHdXX5d8R12a` | `tblZbF2YUsoVN2st` |
| 规则表 | `tbldxrUusDYuqdno` | `tbldKZ4XNMOjNQBE` |
| 表格视图 | `tbl5hz1RyHlO3C3l` | `tblKF1cP3xZeq1VP` |
| **H5隐患排查台账表** | `tblnyMjxtxjpP08q` | `tblxTdsCT9v3YY03` |

⇒ **`storage/index.js` 注释自己写的「换 base 只改 FS_APP_TOKEN」（第 3 行）是一个静默改指向的开关**：一旦 `FS_APP_TOKEN` 换成另一 base，即使所有 `FS_*_TABLE_ID` 仍然显式配置，**显式 ID 在新 base 里不存在 ⇒ 写入报 `1254041 TableIdNotFound`**；若删掉显式 ID 走兜底，则**静默写到新 base 的同名表**。两种都不是报错即停的安全失败模式。

**D. 当前生产配置是否可唯一确定目标表？**
可以，且实测吻合：`tblnyMjxtxjpP08q` / 「H5隐患排查台账表」/ base 「9月台账」/ 38 列 / 2 条记录。

### 3.4 残留（不阻塞 C）

`wrangler.toml` 是**仓库侧**配置，无法在不部署、不调 Worker 端点的前提下证明**线上 isolate 实际加载的 env 与之逐字一致**。本轮据「数据落点反证」判定二者等价（见 A.3）——因为无论走显式还是兜底，目标都唯一指向同一张表。故不降级。

---

## 4. G2 Feishu字段实际结构

### G2_STATUS = **CONFIRMED**

GET `/bitable/v1/apps/WX9TbTqJKa7sywsgrU4cVoKdnXb/tables/tblnyMjxtxjpP08q/fields` → **38 列**，`code=0`。

### 4.1 38 列的构成（B03-01-B 的「37 vs 38」差额一次钉死）

| 分组 | 列数 | 说明 |
|---|---:|---|
| 源码写入（业务基础） | 15 | 隐患编号…备注 |
| 源码写入（闭环） | 15 | 整改人ID…打回次数（`HAZARD_FIELDS`，`index.js:2982-2998`） |
| 源码写入（AI 回填） | 6 | 整改依据…AI识别原始输出（`HAZARD_AI_FIELDS`，`index.js:3003-3010`） |
| **源码写入小计** | **36** | |
| 表主字段 `多行文本` | 1 | `is_primary=true`、`property=null`、**源码 0 引用**、生产 2 条全空 |
| 自定义日期列 `创建时间` | 1 | `type=5 DateTime`、`property.auto_fill=true`、`date_formatter=yyyy/MM/dd HH:mm`；由建表脚本创建（`_scratch/hazard-table-create.mjs:82`），**Worker 不写** |
| **合计** | **38** | |

**结论**：源码定义 36 列**全部存在，0 缺失**；`多行文本` 与 `创建时间` 是「源码不写但表里有」的两列。B03-01-B 把差额归因为「建表默认多行文本」**方向正确但基数多算 1**（把 `创建时间` 当成了 Worker 可写列）。本轮以实测取代推断。

### 4.2 关键发现：`创建时间` 不是飞书系统字段

`property = {"auto_fill": true, "date_formatter": "yyyy/MM/dd HH:mm"}` —— 这是**业务自定义的「自动填写创建时间」日期列**，不是 `type=1001` 的系统「创建时间」。主台账的「日期」才是 `type=1001` 只读列（`index.js:334` 注释已明示）。二者语义不同，同步时不能等同处理。

### 4.3 类型与枚举实际值

| 列 | type / ui_type | 选项（生产实测，含 option_id 顺序） |
|---|---|---|
| 隐患类别 | 3 / SingleSelect | 设备设施、消防安全、用电安全、危化品、作业安全、高处作业、交通运输、公共设施、环境卫生、违规操作、其他（**11**） |
| 隐患级别 | 3 / SingleSelect | 一般隐患、重大隐患（**2**） |
| 处理状态 | 3 / SingleSelect | 待整改、整改中、已整改、已闭环、待验收（**5**） |
| 现场照片 | 17 / Attachment | — |
| 整改后照片 | 17 / Attachment | — |
| 创建时间 | 5 / DateTime | auto_fill=true |
| 其余 32 列 | 1 / Text | —（文本列，值域**无表级约束**） |

### 4.4 与源码枚举的逐项对照

| 枚举 | 源码常量 | 长度 | 与生产选项 |
|---|---|---:|---|
| 隐患类别 | `HAZARD_CATEGORIES`（`index.js:2952`） | 11 | **完全一致** |
| 隐患级别 | `HAZARD_LEVELS`（`:2953`） | 2 | **完全一致** |
| 处理状态（Worker 实际写） | `HAZARD_STATUS_PENDING/REVIEW/CLOSED`（`:2954,2962,2963`） | 3 | 生产选项 **5**，`整改中`/`已整改` **Worker 永不产出** |
| 三违判定 | `HAZARD_THREE_VIOLATION = ['是','否']`（`:2971`） | 2 | 文本列，**无表级约束** |
| 重大事故隐患判定 | `HAZARD_MAJOR = ['是','否']`（`:2972`） | 2 | 文本列，**无表级约束** |
| 风险等级 | `HAZARD_RISK_LEVELS = ['重大风险','较大风险','一般风险','低风险']`（`:2974`） | 4 | 文本列，**无表级约束** |

**风险**：`三违判定` / `重大事故隐患判定` / `风险等级` 三列在飞书侧是**自由文本**，合法值仅由 Worker 的 `includes()` 前置校验保证。任何**绕过 Worker 的写入口**（人工改表、飞书自动化、未来 Sync 回写）都能写入非法值，且表本身不会拒绝。

### 4.5 系统字段 / 业务字段判定

| 类别 | 列 |
|---|---|
| 飞书系统自动（不可写） | **无**（本表未用 `type=1001` 系统列） |
| 建表生成的主字段（不可用于业务） | `多行文本`（`is_primary=true`，必须存在，无法删除） |
| 业务自定义 + 自动填充 | `创建时间` |
| 业务自定义（Worker 写） | 其余 36 列 |

---

## 5. G3 PUT更新语义

### G3_STATUS = **CONFIRMED**（局部更新）

### 5.1 源码侧：三个写接口的 PUT 载荷

适配器唯一写路径（`storage/feishuAdapter.js:186-211`）：

```js
export async function updateRecord(env, appToken, tableId, recordId, fields) {
  ...
  method: 'PUT',
  body: JSON.stringify({ fields }),      // ← 只有 fields，无 record 包装、无全量记录
  ...
}
```

三个 handler 传入的 `fields` **都是局部字典**：

| 接口 | 位置 | 是否先 getRecord | fields 键数 | 键清单 |
|---|---|---|---:|---|
| `assign` | `index.js:3627-3746` | 是（`:3658`） | **8**（+3 条件） | 整改人ID/姓名/部门、指派人ID/姓名、指派时间、整改期限、处理状态；**改派时**追加 整改说明=`''`、整改提交时间=`''`、整改后照片=`[]`（`:3704-3708`） |
| `rectify` | `index.js:3784-3858` | 是（`:3816`） | **2**（+2 条件） | 处理状态、整改提交时间；条件追加 整改说明、整改后照片（`:3834-3839`） |
| `review`(pass) | `index.js:3908-3915` | 是（`:3891`） | **4** | 处理状态、验收人、验收时间、闭环时间、验收结论 |
| `review`(reject) | `index.js:3916-3923` | 是 | **5** | 处理状态、验收人、验收时间、打回次数、验收结论 |

**关键**：`assign` 的 8 键里**不含** `隐患编号`、`隐患描述`、`隐患位置`、`排查人*`、`现场照片`、`纬度`、`经度`、`备注`。若 PUT 是全量覆盖，这些列会被清空 —— 这正是本轮必须排除的高危假设。

### 5.2 官方文档侧（决定性证据）

飞书「更新记录」API 文档（`PUT /open-apis/bitable/v1/apps/:app_token/tables/:table_id/records/:record_id`，文档最后更新 2025-07-21）**注意事项**原文：

> **更新记录为增量更新，仅更新传入的字段。如果想对记录中的某个字段值置空，可将字段设为 null，例如：**
> ```json
> { "fields": { "文本字段": null } }
> ```

⇒ **`assign` 不会清空无关列**。B03-01-B 的 G3 高危假设**已排除**。

### 5.3 但没有版本号 / CAS / 幂等键

| 检查项 | 结论 | 证据 |
|---|---|---|
| 请求体是否含版本号 / revision | **否** | `feishuAdapter.js:193` 仅 `{ fields }` |
| 是否有 CAS / If-Match | **否** | 无相关 header |
| 是否有幂等键 | **否**（assign/rectify/review 全部无） | handler 内无 cid 参数 |
| 是否有并发保护 | **仅表级串行**，非行级 | 文档错误码 `1254291 Write conflict`：「同一个数据表(table) 不支持并发调用写接口」 |

⇒ **丢更新窗口客观存在**：`assign`/`review` 都是「getRecord → 判断 → PUT」，两人同时操作同一条时后写覆盖前写。`review(reject)` 的 `打回次数 = item.rejectCount + 1`（`:3921`）是典型 read-modify-write，并发下会少计。

### 5.4 两处未文档化的边界（降级为残留风险，不影响 G3 结论）

| # | 行为 | 源码 | 官方文档 | 判定 |
|---|---|---|---|---|
| a | 用**空字符串** `''` 清空文本列 | `index.js:3705-3706` | 文档只说用 `null` 置空；`''` 未提及 | **未验证**。若被拒（如 `1254007 EmptyValue` / `1254062`），改派将整体 502 |
| b | 用**空数组** `[]` 清空附件列 | `index.js:3707` | 文档说附件「填写附件 token」，未明确 `[]` 语义 | **未验证**（但 `[]` 是业界通用「清空」写法） |

这两项**不得靠生产实验验证**（红线）。已记为风险项 R4。

---

## 6. G4 生产记录抽样

### G4_STATUS = **CONFIRMED**

GET `/records?page_size=10` → `total = 2`，`has_more=false`。**不是抽样，是全量**（生产隐患表当前仅 2 条）。

### 6.1 两条记录概览（已脱敏）

| # | record_id | 隐患编号 | 排查时间 | 创建时间(CN) | 处理状态 | 隐患位置 |
|---|---|---|---|---|---|---|
| 1 | `reczz28PsTEGOjRC` | `YH202610210122321680` | 2026-10-21 09:22 | 2026-10-21 09:22:34 | 待整改 | 大柳镇 |
| 2 | `reczz28PsVJrMvi5` | `YH202610210124317843` | 2026-10-21 09:24 | 2026-10-21 09:24:32 | 待整改 | 大柳镇 |

### 6.2 字段真值与形态

| 字段 | 记录1 | 记录2 | 形态判定 |
|---|---|---|---|
| 隐患编号 | YH202610210122321680 | YH202610210124317843 | 文本，21 位，规则见 §7.3 |
| 排查人ID | `1**********`（11 位，仅保留首 1 位） | 同 | **11 位手机号明文**（脱敏显示） |
| 排查人姓名 | 刘**（已脱敏） | 同 | 文本 |
| 排查人部门 | 安环管理部 | 同 | 文本，**恒为该值**（见 §8.3） |
| 排查人职位 | 经理 | 同 | 文本 |
| 排查时间 | 2026-10-21 09:22 | 2026-10-21 09:24 | **文本** `YYYY-MM-DD HH:mm` |
| 隐患类别 | 设备设施 | 设备设施 | 单选，**记录2 与 AI 判定不一致**（见 §6.4） |
| 隐患级别 | 一般隐患 | 一般隐患 | 单选 |
| 隐患位置 | 大柳镇 | 大柳镇 | **自由文本**，恰为词表项 |
| 隐患描述 | 隐患描述：设备操作区玻璃门旁的白色安全警示牌… | 隐患描述：二层平台临边虽设有钢制防护栏杆… | 文本，**自带「隐患描述：」前缀**（AI 输出原样） |
| 纬度 / 经度 | 37.722734 / 116.8334687 | 完全相同 | 文本，两记录坐标一致 |
| 现场照片 | 1 个附件（`file_token` + `name=hazard.jpg` + `size` + `tmp_url` + `url` + `type`） | 1 个附件 | 附件列 = 对象数组 |
| 处理状态 | 待整改 | 待整改 | 单选，命中 Worker 3 值之一 |
| 备注 | `req:mvhfghd4nvmg57ffbhmqlb66mi2mml` | `req:mvhfj0uswv3dr8w15w9kin7n31nbo` | **cid 持久化位置**，`req:` + 32 位 |
| 创建时间 | 1792545754211 | 1792545872937 | epoch ms（auto_fill） |
| 整改依据 / 整改建议 | 有（长文本，含法规条款） | 有 | AI 回填 |
| 三违判定 / 重大事故隐患判定 | 否 / 否 | 否 / 否 | 文本 |
| 风险等级 | 一般风险 | 一般风险 | 文本 |
| AI识别原始输出 | 有（JSON 串） | 有 | 文本 |
| **15 个闭环列** | **全部缺失** | **全部缺失** | 状态为「待整改」，尚未指派 ⇒ Worker 从未写过 |

### 6.3 「字段存在 / 代码会写 / 当前有值」三态严格区分

以「整改人ID」为例：

| 判定 | 结论 |
|---|---|
| A. Feishu 字段存在？ | **是**（`fldiSFfNmS`） |
| B. Worker 代码会写？ | **是**（`index.js:3694`） |
| C. 当前 2 条有值？ | **否**（0/2） |

⇒ 正确表述是「**字段存在、代码会写、当前 2 条为空**」，**不是**「系统没有该字段」。

### 6.4 生产数据里发现的 3 处真值异常

**(1) `隐患类别` 与 AI 判定冲突（1/2）**
记录 2 的 `AI识别原始输出.category = "高处作业"`，但 `隐患类别` 列 = `设备设施`。同一张卡上「AI 说是高处作业、台账记成设备设施」。
⇒ 同步时若以 `隐患类别` 为类别权威，则 AI 结论丢失；若以 `ai_raw.category` 为准，则与用户在 H5 的选择冲突。**这两者谁是权威，B02-DEC 未覆盖，需新增裁决项**。

**(2) `隐患描述` 自带前缀「隐患描述：」**
两条记录的值都以「隐患描述：」开头。这不是人为输入，是 AI 输出被整段回填（AI prompt 要求返回 `description` 字段，模型把标签也写进了正文）。
⇒ 同步到 PG 的 `description` 会携带这个前缀，做文本检索/去重/相似度时会污染。

**(3) 两条记录经纬度完全相同（37.722734 / 116.8334687）**
即同一物理点位，09:22 与 09:24 间隔 2 分钟连报 2 条不同隐患（玻璃门警示牌褪色 / 二层平台缺挡脚板）。数据本身合理，但说明**位置字段不携带精度**：一旦同乡镇多条，靠经纬度无法区分具体点位。

### 6.5 与「2 条」这个数字本身相关的判断

生产隐患表**只有 2 条**，且都停在「待整改」，意味着：

- 闭环 15 列**在生产从未被写过一次**（assign/rectify/review 三个接口**生产零调用**）
- 因此「整改→验收→闭环」整条状态机在生产**只有代码证据，没有运行证据**
- 同步设计中**不能假设闭环列已有数据形态**，只能按源码写法规格推断（这一点必须写进 C 节点的验收口径）

---

## 7. record_id 生命周期

### 7.1 全链路

```text
H5 submitHazard()
  ├─ client_request_id = newClientRequestId()            check.app.js:5034
  ├─ POST /api/mobile/hazard/submit  {…, client_request_id}
  │
Worker handleHazardSubmit                                index.js:3197
  ├─ 幂等① isolate 缓存 hazardCidGet(sub, cid)            :3280
  ├─ 幂等② 飞书 search 备注 contains req:<cid>           :3288 → findExistingByClientRequestId
  ├─ 幂等③ inflight 合并（同 cid 并发只建一条）           :3299-3304
  ├─ 记录体：'备注' = `req:${cid}`                        :3322
  ├─ createRecords → POST records/batch_create           feishuAdapter.js:154-163
  ├─ recordIds = recs.map(r => r.id)   ← **Feishu 生成** :3352
  └─ 响应 { recordIds:[recid], hazardNo, closed }        :3185-3194
  │
H5 后续动作（list/detail 拿到 record_id）
  ├─ POST hazard/assign   { record_id, assignee_id, deadline }
  ├─ POST hazard/rectify  { record_id, note, photo_tokens }
  └─ POST hazard/review   { record_id, action, comment }
      → 三者都先 getRecord(recordId) 再 PUT 同一 recordId
```

### 7.2 七问逐条

| # | 问题 | 结论 | 证据 |
|---|---|---|---|
| 1 | cid 是否持久保存 | **是**，存在 `备注` 列 `req:<cid>` | 生产 2/2 记录实测 |
| 2 | record_id 是否由 Feishu 生成 | **是**，Worker 不生成 | `feishuAdapter.js:154-183` 取 `r.id`；源码无 recid 构造函数 |
| 3 | Worker 是否返回 record_id | **是**，`recordIds: []` | `index.js:3189` |
| 4 | 后续动作用哪个 ID | H5 回传的 `record_id`（= list/detail 返回值） | `index.js:3646,3803,3881` 三处均 `body.record_id` |
| 5 | record_id 是否稳定 | **是**。无 delete 路由 ⇒ 不存在 delete/recreate 换 ID | 见下 7.4 |
| 6 | delete/recreate 是否产生新 ID | **本链路不可能**（无删除能力） | 同上 |
| 7 | 是否有重复 create 防护 | **有**，三重（见 7.1）；但**仅覆盖 create** | `:3280,3288,3299` |

### 7.3 隐患编号 ≠ 主键（重要）

`newHazardNo()`（`index.js:3115-3120`）：

```js
return 'YH' + d.getFullYear() + p(d.getMonth()+1) + p(d.getDate())
     + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds())
     + String(Math.floor(1000 + Math.random() * 9000));
```

- 格式 `YH` + `yyyyMMddHHmmss` + 4 位随机 = 21 位
- **用的 `new Date()` 是 Worker 的 UTC 时钟，未 +8h** —— 而 `todoNowLocal()`（`:4049`）是 +8h 的。

实测印证（两条记录）：

| 记录 | 隐患编号时间段 | 排查时间(CN) | 差 |
|---|---|---|---|
| 1 | `20261021` **`012232`** | 2026-10-21 **09:22** | **8 小时** |
| 2 | `20261021` **`012431`** | 2026-10-21 **09:24** | **8 小时** |

⇒ **任何人把隐患编号当时间戳解析，都会得到比业务时间早 8 小时的值**。这是 B03-01-B 未记录的缺陷（记为 R1）。

- **无唯一约束**：同秒 + 同 4 位随机 ⇒ 碰撞概率 1/9000（同秒内两次提交）。Worker 无查重。
- **不可作 PG 主键**：无唯一保证；`record_id` 才是稳定标识。

### 7.4 删除 / 撤销 / 重新提交

| 能力 | 有无 | 证据 |
|---|---|---|
| hazard 删除路由 | **无** | `index.js` 中 `hazard` 与 `delete\|revoke\|cancel` 同现的 6 处全为 isolate 缓存清理（`:2920,2928,2931,2938,2946,3363`） |
| 撤销 / 撤回 | **无** | 分发表（`:4779-4788`）9 条 hazard 路由中无撤销 |
| 重新提交 | **有**，但受状态机限制 | `rectify` 仅允许 `待整改`（`:3828`）；被 reject 打回后状态回 `待整改` 才可再提交 |
| 适配器 `batchDelete` | 存在**但不服务隐患** | `feishuAdapter.js:214`；唯一调用点在 `index.js:2449`（主台账去重清理） |

⇒ record_id **全生命周期稳定**，可作同步的外部键。

### 7.5 幂等结论（对 C 的意义）

- `备注 = req:<cid>` 是**唯一跨重启持久的幂等锚点**
- 但 `备注` 同时也是**唯一**存放 cid 的列 ⇒ 任何人工改备注都会破坏幂等
- assign/rectify/review **无幂等键** ⇒ 若未来 Sync Layer 反向写回（本设计不做），必然重复

---

## 8. 人员身份来源

### 8.1 结论：唯一机器标识 = 手机号

| 环节 | 值 | 证据 |
|---|---|---|
| H5 请求体 | **不含**任何人员字段 | `check.app.js:5028-5048`（全量 16 键无 name/phone/employee_id） |
| Worker 取值 | JWT `payload.sub` / `payload.name` / `payload.department` / `payload.position` | `index.js:3312-3315` |
| 写入 Feishu | `排查人ID = payload.sub`（= **手机号**） | `index.js:3312` |
| 身份表 | `H5移动端身份表`（`tbl58t9kjyDlacSw`）`手机号` 列 | 实测 73 行、73 行有手机号 |

### 8.2 生产实测匹配（2/2 命中）

以两条记录的 `排查人ID`（11 位手机号）在身份表 73 行中查找：

| record | 手机号长度 | 命中 | 姓名一致 | 所属部门一致 | 职位一致 | 身份表分级 |
|---|---:|:---:|:---:|:---:|:---:|---|
| `reczz28PsTEGOjRC` | 11 | **是** | 是 | 是（安环管理部） | 是（经理） | 公司管理 |
| `reczz28PsVJrMvi5` | 11 | **是** | 是 | 是（安环管理部） | 是（经理） | 公司管理 |

⇒ **人员映射 = 手机号精确等值匹配，2/2 命中，无需姓名模糊匹配**。

### 8.3 重要：`排查人部门` 不是组织归属

`hazardGate`（`index.js:3103-3111`，部门判断在 `:3106`）硬校验 `payload.department === '安环管理部'`，非该部门一律 403。⇒ 能写进这张表的记录，`排查人部门` **恒为「安环管理部」**，生产 2/2 印证。

**这意味着**：该列**不能**用来回答「这条隐患属于哪个乡镇/作业中心」。B03-01-B 已记，本轮实测确认。

### 8.4 身份表 vs 花名册（两套人员数据并存）

| 表 | 行数 | 关键列 | 用途 |
|---|---:|---|---|
| `H5移动端身份表` `tbl58t9kjyDlacSw` | **73** | 序号、姓名、直接上级、所属部门、职位、网格长等级、手机号、分级、微信推送UID、密码哈希 | H5 登录唯一来源；隐患人员字段来源 |
| `H5花名册表` `tbl2ZHdXX5d8R12a` | **1369** | 员工编码、姓名、所属部门、职位、性别、年龄、身份证号码、出生日期、入职日期、直接上级、用工关系状态、入司日期、离职日期、完整度百分比、负责区域（在职）、负责区域（离职） | B01 认定的花名册唯一权威 |

- 73 条的 `所属部门` 取值分布：**部门 6 类**（项目管理层 1 / 安环管理部 4 / 生产管理部 1 / 环卫作业中心 2 / 市政园林作业中心 1 …）+ **片区/班组 60 余类**（保店镇一班、杜集镇三四班…）+ **公园 3 类**（新河公园 3 / 康宁湖公园 2 / 中心公园 1）
- `分级`：公司管理 9 / 乡镇作业中心经理 12 / 管理员 52
- 花名册有 `员工编码`，身份表**没有** ⇒ **手机号是二者唯一可用的桥**

**对 C 的含义**：Feishu→PG 的人员映射必须是 `手机号 → phone_hash → employee.id`（B01 已证 `phone` 列全 ENC，需走 hash）。**不得**用姓名匹配。

### 8.5 PII 现状（必须写进 C 的安全边界）

- Feishu 隐患表 `排查人ID` / `整改人ID` / `指派人ID` **均存明文手机号**
- 身份表 `手机号` **明文**、`密码哈希` 存在
- ⇒ 同步落 PG 时**禁止**把明文手机号写入业务列；只能写 `phone_hash`（与 `employee.phone_hash` 同算法），或写 `employee_id`

---

## 9. 区域来源

### 9.1 现状：隐患表**没有任何结构化区域列**

三处检索面（Worker 隐患字段常量 / 38 列 schema / H5 请求体 16 键）**均无** `grid` / `grid_id` / `grid_name` / `township` / `area` / `team` / `operation_unit`。

唯一与位置相关的是 **`隐患位置`（文本列）+ `纬度` / `经度`（文本列）**。

### 9.2 `隐患位置` 是**完全自由文本**（比 B03-01-B 记录的更严重）

| 事实 | 证据 |
|---|---|
| H5 控件是普通 `<input maxlength="100">`，非只读、非下拉 | `check.html:1292` |
| 有 16 项快捷网格（仅写入 input 值） | `check.app.js:4644,4794-4804` |
| **用户可直接改写** | `check.app.js:4573-4575` 的 `input` 事件把任意输入写入 `hazardForm.location` |
| **「定位」按钮会把 GPS 反查地址整段写入** | `check.app.js:4578-4587`（`gps.addr` 直接赋给输入框），注释原文：「定位暂不可用，请手动输入位置」 |
| **H5 提交前不校验非空** | `check.app.js:4989-4991` 只校验 category / level / description |
| **Worker 也不校验非空** | `index.js:3227` `location = patrolText(body.location, …)`，无 `if (!location)` |
| 源码注释自己承认 | `check.app.js:4643`：「位置仍是自由文本字段」 |

⇒ 生产 2 条恰好都是纯乡镇名（`大柳镇`），但**这不是约束保证，只是操作习惯**。

### 9.3 16 项 H5 词表的映射实测（本轮新增）

H5 词表（`check.app.js:4644`，16 项）= 10 镇 + 2 街道 + 4 公园/河。

对各候选落点逐项实测（dev 库，`COUNT(*)` 精确计数）：

| H5 原始值 | `hse_org_unit.org_name` 精确 | +「作业中心」 | `hse_assessment_target.township` 精确 | +「作业中心」 | `risk_area_dict.area_name` 精确 | +「公园」 | `violations.township` 精确 |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 保店镇 | 0 | **1** | 0 | 74 | 0 | 0 | 120 |
| 柴胡店镇 | 0 | **1** | 0 | 109 | 0 | 0 | **0** |
| 大曹镇 | 0 | **1** | 0 | 64 | 0 | 0 | 96 |
| 大柳镇 | 0 | **1** | 0 | 56 | 0 | 0 | 97 |
| 杜集镇 | 0 | **1** | 0 | 137 | 0 | 0 | 219 |
| 津城街道 | 0 | **1** | 0 | 46 | 0 | 0 | 107 |
| 刘营伍乡 | 0 | **1** | 0 | 56 | 0 | 0 | **0** |
| 宁城街道 | 0 | **1** | 0 | 35 | 0 | 0 | 45 |
| 时集镇 | 0 | **1** | 0 | 70 | 0 | 0 | 123 |
| 相衙镇 | 0 | **1** | 0 | 68 | 0 | 0 | 82 |
| 张大庄镇 | 0 | **1** | 0 | 59 | 0 | 0 | **0** |
| 长官镇 | 0 | **1** | 0 | 70 | 0 | 0 | 113 |
| 康宁湖 | 0 | 0 | 0 | 0 | 0 | **1** | 0 |
| 中心公园 | 0 | 0 | 0 | 0 | **1** | 0 | 0 |
| 福宁河 | 0 | 0 | 0 | 0 | 0 | **1** | 0 |
| 新河公园 | 0 | 0 | 0 | 0 | **1** | 0 | 0 |

**结论**：

1. **12 个行政单元 → `hse_org_unit`（level 3）+「作业中心」后缀 = 100% 唯一命中（1 行）**；同一规则在 `hse_assessment_target.township` 也 100% 命中（多行 = 多周期/多指标行）
2. **4 个非行政单元 → `risk_area_dict`：`康宁湖`/`福宁河` 需 +「公园」，`中心公园`/`新河公园` 精确命中** ⇒ 4/4 可映射，但需**两条规则**
3. `violations.township` 有 3 项为 0（柴胡店镇 / 刘营伍乡 / 张大庄镇）—— 因为该表用**简称** `柴胡店` / `刘营伍` / `张大庄`（合计 **423** 行），与 B02-DEC 记录一致

⇒ **16/16 可确定性归一**，但归一是「**词表 + 规则**」，不是「外键」。

### 9.4 组织与考核表的缺口（新发现）

- `hse_org_unit` level 3 = **恰好 12 个**作业中心（12 个乡镇/街道），**没有「环卫作业中心」，也没有「市政园林作业中心」**
- 但考核表 `hse_assessment_target.township` 的 16 个取值里**有**「环卫作业中心」，另有「安环管理部 / 生产管理部 / 项目管理层」3 个**部门**值
- 身份表 `所属部门` 里也有「环卫作业中心」2 人、「市政园林作业中心」1 人

⇒ **组织主数据 `hse_org_unit` 比考核口径和身份表口径都少**。任何「按组织聚合」的统计都会丢环卫/市政园林两个作业中心。

### 9.5 REGION 判定

**REGION_MAPPING = PARTIAL**（词表内 16/16 可映射；词表外自由文本不可映射）

不判 BLOCKED 的理由：同步的**目标字段**可以设计为「`location_raw`（原样保留，永不失真）+ `township_norm`（可空，仅当命中 16 词表/可识别前缀时填充）」。这个设计**不需要 region master 表**就能落地，且不会造假数据。

仍属未决：**谁有权决定「区域」是实体表还是词表**（B02-DEC-03），以及**无法归一时是置 NULL 还是回填上级**（业务口径）。

---

## 10. H5→Worker→Feishu字段链闭合度

### 10.1 三端字段一一对应（36 个写入列）

| 环节 | 键数 | 说明 |
|---|---:|---|
| H5 `body`（submit） | **16** | 7 恒发（category/level/description/location/find_time/client_request_id/ai_raw）+ 9 条件（rectify_basis/rectify_suggestion/three_violation/major_hazard/risk_level/latitude/longitude/photo_tokens/rectify_photo_tokens） |
| Worker 读取 `body.*` | **16** | `index.js:3217-3276` 逐一对应，**无遗漏、无多余** |
| Worker 组装 `record` | **15 恒发 + 条件** | `index.js:3310-3339` |
| Feishu 业务列 | **36** | 15 基础 + 15 闭环 + 6 AI |
| **链路闭合** | **✓** | 6 个闭环列不来自 H5 而是 Worker 生成（`todoNowLocal()`），符合状态机设计 |

### 10.2 身份来源闭合

| 字段 | 来源 | 是否被 H5 污染 |
|---|---|---|
| 排查人ID | JWT `sub` | 否（H5 无此键） |
| 排查人姓名 | JWT `name` | 否 |
| 排查人部门 | JWT `department` | 否 |
| 排查人职位 | JWT `position` | 否 |
| 隐患编号 | Worker `newHazardNo()` | 否 |
| 排查时间 | H5 `nowLocalInspectTime()`（设备时钟） | **是**（客户端时钟，可被设备时间影响） |
| 创建时间 | Feishu auto_fill | 否 |
| 备注 | Worker `req:${cid}` | 否 |
| 处理状态 | Worker 常量 | 否 |

⇒ **除「排查时间」外，全部为服务端/平台定值，H5 无法伪造**。这是本链路最健康的部分。

### 10.3 闭合度缺口（4 处）

| # | 缺口 | 影响 |
|---|---|---|
| 1 | `location` 无约束、无必填 | 区域维度不可靠（§9） |
| 2 | `排查时间` 取设备时钟 | 手机时间被改则时间错，且无服务端校验 |
| 3 | `隐患编号` 用 UTC 且无唯一约束 | 时间语义错 8h、理论可撞号（§7.3） |
| 4 | `整改中` / `已整改` 两个选项**永不产生** | 表里存在但代码永不写 ⇒ 任何「整改中」计数在真实链路中恒为 0（除非人工改表） |

---

## 11. B03-01-B差异复核

| # | B03-01-B 原结论 | 本轮实测 | 判定 |
|---|---|---|---|
| 1 | 「源码可追溯 37 列（16+15+6）vs B00 实测 38，差 1 = 多行文本」 | 源码写 **36** 列；38 = 36 + `多行文本` + `创建时间`(auto_fill) | **差额归因正确，基数多算 1**（把 `创建时间` 当成 Worker 可写列） |
| 2 | 「`创建时间` 由飞书自动」 | 是**业务自定义 DateTime 列 + auto_fill=true**，非 `type=1001` 系统字段 | **细化**（不是系统字段，是建表脚本建的） |
| 3 | 「附件 = 两个附件列（现场照片 + 整改后照片）」 | 生产确认：`fld2zIwhkm` / `fldwstfIuN`，均 type=17 | **确认无误** |
| 4 | 「`tblnyMjxtxjpP08q` 不在代码里，走 env；缺省按表名反查」 | 生产 base 实测：表存在、名称唯一、38 列吻合 | **确认无误，且落点反证** |
| 5 | 「处理状态 5 选项，Worker 只写 3 值」 | 生产选项实测 5 个（含 option_id）、Worker 常量 3 个、生产中 2 条均为 `待整改` | **确认无误** |
| 6 | G2「飞书侧现状本轮禁止实测」 | 本轮实测 = 38 列全清单 + 选项全集 | **G2 已闭合** |
| 7 | G3「PUT 是否仅更新传入列 = 高危假设」 | 官方文档明示「增量更新，仅更新传入的字段」 | **G3 已闭合，假设排除** |
| 8 | 「`隐患排查台账表` 若 env 缺失按表名反查，可能命中同名其他表」 | 同 base 唯一同名 ⇒ 不可能；但**跨 base 会**（两 base 6 张表全部同名） | **细化**：风险从「同 base 内」改为「跨 base」 |
| 9 | 未记录 | **隐患编号时间段 = UTC，比排查时间早 8 小时** | **新增缺陷 R1** |
| 10 | 未记录 | **`隐患位置` 非必填、可被 GPS 反查地址整段覆盖** | **新增风险 R2**（原记「自由文本」不足） |
| 11 | 未记录 | **`隐患类别` 与 `AI识别原始输出.category` 冲突 1/2** | **新增 R9** |
| 12 | 未记录 | **`隐患描述` 自带「隐患描述：」前缀 2/2** | **新增 R13** |
| 13 | 未记录 | **生产隐患表只有 2 条，闭环 15 列从未被写过** | **新增**：状态机无运行证据 |

---

## 12. DEC-03阻塞分析

### 12.1 DEC-03 是什么（B02-DEC 原题）

> 区域主数据：区域 ≠ 组织。当前独立区域主数据缺失。

### 12.2 本轮补强的事实

| 事实 | 本轮证据 |
|---|---|
| 无独立区域主数据表 | `public` 下 `township`/`town`/`area_name` 共 31 列（B02-DEC 已测），语义至少 3 种 |
| `risk_area_dict`(17) **不是**乡镇词典 | 本轮新增：其取值为「X镇镇驻地」「X镇驻地」「乡村区域（…）各村道路」等**驻地/作业单元**语义；与 H5 16 词表只命中 4 项（全为公园），12 个行政单元**全部不命中** |
| `hse_org_unit` 可承接 12 行政单元 | 本轮实测：12/12「+作业中心」唯一命中，但**缺环卫/市政园林** |
| `hse_assessment_target.township` 装的是**组织名** | 16 个取值全为「X作业中心」或部门名，无一个裸乡镇名 |
| `violations.township` 是唯一存裸乡镇名的列 | 15 个取值 = 12 行政单元（其中 3 个用简称，423 行）+ 3 个部门值；**但该表已停写**（B02 定局） |
| H5 隐患位置 | 自由文本，词表 16 项仅作快捷输入（§9.2） |

### 12.3 DEC-03 对 C 节点的阻塞判定

| 问题 | 是否阻塞「同步落库」 | 是否阻塞「按乡镇统计」 |
|---|:---:|:---:|
| 没有区域主数据表 | **否** | 是 |
| 16 词表可确定性归一（12 + 4 规则） | 提供依据 | 提供依据 |
| 自由文本无法归一 | **否**（落 `location_raw` + 可空 `township_norm`） | 是（会有一批 NULL） |
| `hse_org_unit` 缺环卫/市政园林 | **否** | 是（组织聚合口径缺失） |

**结论**：

- **DEC-03 仍为 BLOCKED**（业务未裁决「区域」的实体形态，本轮无权也无法替裁）
- **但 DEC-03 不再阻塞「同步目标字段」**：只要目标字段设计为「原样 + 可空归一」，同步可以实现且不造假
- **仍阻塞的是「乡镇维度统计口径」**（考核排名、乡镇对比），这部分本来就在 D 阶段之后

### 12.4 需要新增的裁决项（B02-DEC 未覆盖）

| 建议编号 | 题 | 为什么必须裁 |
|---|---|---|
| **B02-DEC-16（新增）** | `隐患类别`（用户单选）与 `AI识别原始输出.category`（模型判定）冲突时，谁是权威？ | 生产实测 1/2 冲突。同步必须选定一列做类别字段，否则同一事实两种分类 |
| **B02-DEC-17（新增）** | `隐患位置` 无法归一时的处理：置 NULL / 回填上级乡镇 / 拒绝入库？ | 决定同步的 fail-closed 策略 |
| **B02-DEC-18（新增）** | `hse_org_unit` 是否补齐「环卫 / 市政园林」两个作业中心？ | 决定组织聚合能否覆盖全部作业中心 |

这三项**不阻塞 C 开工**（可用「保留原文 + 可空归一 + 不聚合」的保守设计绕过），但必须在 **D 阶段前**裁决。

---

## 13. 风险项

| # | 风险 | 等级 | 证据 | C 节点应对 |
|---|---|---|---|---|
| **R1** | `隐患编号` 时间段用 UTC，比业务时间早 8 小时；且无唯一约束（同秒 1/9000 碰撞） | **P2** | `index.js:3115-3120`；生产 2 条实测差 8h | 禁止用编号解析时间；PG 侧时间一律取 `创建时间` 或 `排查时间` |
| **R2** | `隐患位置` 自由文本、非必填、可被 GPS 地址覆盖 | **P1** | `check.html:1292`；`check.app.js:4573-4587,4989`；`index.js:3227` | 只落 `location_raw`；归一仅对命中词表的值填充，其余 NULL |
| **R3** | 「带整改后照片提交 ⇒ 直接已闭环」，跳过验收 | **P1** | `index.js:3253-3260,3321,3328-3332`；`验收结论='登记时已现场整改，直接闭环'` | 同步时须区分 `closed_by=submit` 与 `closed_by=review`，否则闭环率虚高 |
| **R4** | 改派用 `''` / `[]` 清空，官方文档只承认 `null` | **P2** | `index.js:3705-3707`；文档「可将字段设为 null」 | 不依赖该行为做业务判断（PG 侧自行记录改派痕迹） |
| **R5** | 飞书**表级**写串行，并发写报 `1254291 Write conflict` | **P2** | 官方错误码表 | 同步方向为 Feishu→PG（只读），不触碰此限 |
| **R6** | 无版本号 / CAS ⇒ 读-改-写丢更新（`打回次数` 尤甚） | **P2** | `index.js:3658/3816/3891` + `:3921`；`feishuAdapter.js:193` | 同上；但若未来双向同步，必须先解决 |
| **R7** | 两 base 六表全同名，换 `FS_APP_TOKEN` 静默改指向 | **P1** | 本轮双 base 实测（§3.3-C） | 同步配置必须**硬编码目标 base + 表 ID 双校验**，并在启动时校验表名与列数 |
| **R8** | `处理状态` 5 选项而 Worker 只写 3 值 | **P3** | 生产选项 5；`index.js:2954,2962,2963` | 同步需容错映射 `整改中/已整改`（这两值只可能来自人工改表） |
| **R9** | `隐患类别` 与 `ai_raw.category` 冲突（生产 1/2） | **P1** | 记录 2：AI=高处作业，列=设备设施 | 待 B02-DEC-16 裁决；暂以列值为准并保留 ai_raw |
| **R10** | `排查人部门` 恒为「安环管理部」，非真实组织 | **P2** | `index.js:3106` 硬校验；生产 2/2 | 禁止用该列做组织维度；组织归属须另行来源（身份表 `所属部门` 或花名册） |
| **R11** | `备注` 是 cid 的唯一载体 ⇒ 人工改备注即破坏幂等 | **P2** | `index.js:3322`；生产 2/2 均为 `req:<cid>` | 同步以 `record_id` 为主键，cid 仅作辅助核对 |
| **R12** | 类型错配：时间几乎全是**文本列**（排查/指派/整改提交/验收/闭环） | **P2** | 生产 38 列中仅 `创建时间` 为 DateTime | PG 侧需自行 `to_timestamp`，并接受脏值/空值 |
| **R13** | `隐患描述` 自带「隐患描述：」前缀（2/2） | **P3** | 生产实测 | 同步原样保留，展示层再剥；不要在同步层做清洗（会丢原文） |
| **R14** | 三违/重大/风险等级为**文本列**，值域无表级约束 | **P2** | 生产 4.3 + 源码 `includes()` 前置校验 | 同步需白名单校验，非法值落 NULL 并告警，不静默放行 |
| **R15** | 生产隐患表仅 2 条 ⇒ 闭环链路**无运行证据** | **P2** | `total=2`，闭环 15 列 0/2 有值 | C 节点验收口径只能按**源码规格**，不得按「已有数据形态」推断 |

---

## 14. 不允许通过修改生产链解决的问题

以下问题**必须修改 H5 / Worker / Feishu 才能根治**。本轮**只登记，不修**。

| # | 问题 | 需改谁 | 标记 |
|---|---|---|---|
| P-1 | `隐患位置` 需结构化（乡镇枚举 / 网格 ID） | H5 + Feishu 加列 + Worker 写列 | **PRODUCTION_CHAIN_CHANGE_REQUIRED** |
| P-2 | `排查人部门` 需真实组织归属（现在恒为常量） | Worker `hazardGate` + 字段语义 | **PRODUCTION_CHAIN_CHANGE_REQUIRED** |
| P-3 | `隐患编号` UTC 8h 偏移 + 无唯一约束 | Worker `newHazardNo()` | **PRODUCTION_CHAIN_CHANGE_REQUIRED** |
| P-4 | 改派用 `''` 清空（未文档化） | Worker `handleHazardAssign` | **PRODUCTION_CHAIN_CHANGE_REQUIRED** |
| P-5 | 丢更新 / 无 CAS | Worker + 飞书（无行级版本号能力） | **PRODUCTION_CHAIN_CHANGE_REQUIRED** |
| P-6 | 时间列应为 DateTime（现为文本） | Feishu 改列类型 + Worker 写 ms | **PRODUCTION_CHAIN_CHANGE_REQUIRED** |
| P-7 | `整改中`/`已整改` 选项与代码不一致 | Feishu 删选项 **或** Worker 补状态 | **PRODUCTION_CHAIN_CHANGE_REQUIRED** |
| P-8 | 「登记即闭环」跳过验收 | Worker 业务规则 | **PRODUCTION_CHAIN_CHANGE_REQUIRED** |
| P-9 | `隐患描述` 带 AI 前缀 | Worker / AI prompt | **PRODUCTION_CHAIN_CHANGE_REQUIRED** |
| P-10 | 隐患类别 vs AI 类别冲突 | 业务规则 + Worker | **PRODUCTION_CHAIN_CHANGE_REQUIRED** |

> 以上 10 项**全部不进入本轮**。C 节点设计必须**绕开**它们（只读 Feishu、独立 Sync Layer），而不是顺手修掉。

---

## 15. C节点准入判断

### 15.1 逐条对照准入条件（任务书 §十一）

| # | 条件 | 实测 | 判定 |
|---|---|---|---|
| 1 | G1 至少 CONFIRMED | `tblnyMjxtxjpP08q`，唯一同名，38 列吻合，落点反证 | ✅ |
| 2 | G2 至少 CONFIRMED | 38 列全清单 + 类型 + 选项全集 + option_id | ✅ |
| 3 | G4 至少 CONFIRMED | 全量 2 条逐字段真值（非抽样） | ✅ |
| 4 | record_id 生命周期 CONFIRMED | Feishu 生成 → 返回 → 三接口复用 → 无删除 ⇒ 稳定 | ✅ |
| 5 | 人员映射无不可控姓名硬匹配 | 手机号等值匹配 2/2，姓名/部门/职位全一致 | ✅ |
| 6 | 区域映射已有明确设计依据 | 16/16 词表确定性归一（12 + 4 规则）；词表外需降级 | ⚠️ **PARTIAL** |
| 7 | DEC-03 不再阻塞同步目标字段 | 采用「raw + 可空归一」即可落地 | ⚠️ **有条件满足** |
| 8 | 若 G3 未完全确认，Sync Layer 不复用生产 PUT | G3 已 CONFIRMED；且设计方向天然为 Feishu **READ** → PG，不调 Worker | ✅ |

### 15.2 最终判定

```text
B03-01-C-0 = PASS WITH GAPS
```

**为什么不是 PASS**：条件 6 / 7 只到 PARTIAL。区域是「词表 + 规则」而非外键；一旦 `隐患位置` 是自由文本（GPS 地址、手写补充点位），就无法唯一归一。这不是证据缺失，而是**系统现状本身的缺陷**，B03 无法在不改生产链的前提下消除。

**为什么不判 BLOCKED**：所有**阻塞性问题**（表、字段、record_id、人员）已全部 CONFIRMED；区域缺口可以用「raw 保真 + 归一可空」的保守设计容纳，不会导致同步写不出数据。

### 15.3 进入 C 节点的 4 条强制约束（建议写入 C 任务书）

1. **数据流方向**：`Feishu READ API → 独立 Sync Layer → PG`。**禁止**调用 `/api/mobile/hazard/*`（含 PUT 语义的生产写接口），**禁止**反向写 Feishu。
2. **幂等键**：`record_id` 为外部唯一键；`备注` 中 `req:<cid>` 仅作辅助核对，不作主键（人工可改）。
3. **区域字段**：`location_raw TEXT NOT NULL`（原样）+ `township_norm TEXT NULL`（仅命中 16 词表时填充，其余 NULL 并计入 `unmapped` 计数）。**禁止**模糊匹配、**禁止**按经纬度反推乡镇。
4. **人员字段**：只落 `employee_id`（经 `phone_hash` 桥接）或 `phone_hash`；**禁止**落明文手机号；匹配失败必须 fail-closed 计入 `unmatched`，不得用姓名兜底。

---

## 16. 证据索引

### 16.1 源码证据

| 路径 | 关键行 |
|---|---|
| `grid-mobile-cloudflare/worker/wrangler.toml` | `:110` FS_APP_TOKEN、`:116` FS_HAZARD_TABLE_ID |
| `grid-mobile-cloudflare/worker/storage/index.js` | `:15` getAdapter、`:18-24` ROLE_TABLE_NAMES、`:27-38` resolveTableIdByName、`:42-46` tableIdFor、`:49-63` storageConfig（`:55` hazardSheetId） |
| `grid-mobile-cloudflare/worker/storage/feishuAdapter.js` | `:89` getRecord、`:154-183` createRecords（batch_create）、`:186-211` updateRecord（PUT + `{fields}`）、`:214` batchDelete、`:238` listFields、`:265` ensureField |
| `grid-mobile-cloudflare/worker/index.js` | `:786-793` PWD_GUARDED_ROUTES（含 3 个隐患写接口）、`:1211-1230` 作业中心 17 项注释、`:2952-2977` 隐患枚举常量、`:2982-2998` HAZARD_FIELDS、`:3003-3011` HAZARD_AI_FIELDS、`:3103-3111` hazardGate（部门判断 `:3106`）、`:3115-3120` newHazardNo、`:3185-3194` hazardSubmitResponse、`:3197-3371` handleHazardSubmit、`:3280/3288/3299` 幂等三重、`:3310-3339` record 组装、`:3627-3746` assign、`:3784-3858` rectify、`:3862-3945` review、`:4049-4056` todoNowLocal、`:4779-4788` 隐患路由分发 |
| `grid-mobile-cloudflare/frontend/check.html` | `:1292` `#hz-location` 为普通 input |
| `grid-mobile-cloudflare/frontend/check.app.js` | `:101-104` nowLocalInspectTime、`:4573-4587` 位置 input + 定位写入、`:4643-4644` HAZARD_LOCATIONS 16 项、`:4794-4804` 快捷网格、`:4985-5049` submitHazard（校验 + body 16 键） |
| `grid-mobile-cloudflare/worker/_scratch/hazard-table-create.mjs` | `:57-82` 字段定义（`:82` 创建时间 type=5 + auto_fill） |

### 16.2 飞书只读 API 证据（全部 GET，1 次 auth POST）

| 调用 | 结果 |
|---|---|
| `POST auth/v3/tenant_access_token/internal` | `code=0` |
| `GET /bitable/v1/apps/WX9TbTqJKa7sywsgrU4cVoKdnXb` | `code=0`，name=「9月台账」 |
| `GET …/tables?page_size=100` | 6 张表（§3.2） |
| `GET …/tables/tblnyMjxtxjpP08q/fields?page_size=100` | 38 列，`code=0` |
| `GET …/tables/tblnyMjxtxjpP08q/records?page_size=10` | total=2，`code=0` |
| `GET …/tables/tbl58t9kjyDlacSw/fields` + `/records` | 73 行、10 列 |
| `GET …/tables/tbl2ZHdXX5d8R12a/fields` + `/records` | 1369 行、15 列 |
| `GET …/tables/tbl5QiCv5Qbal044/fields` | 33 列、无 `隐患编号`/`隐患位置`；total=1610 |

### 16.3 官方文档证据

- 飞书开放平台《更新记录》：`https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table-record/update`（最后更新 2025-07-21）。关键句：「**更新记录为增量更新，仅更新传入的字段。如果想对记录中的某个字段值置空，可将字段设为 null**」。错误码 `1254291 Write conflict`：「同一个数据表(table) 不支持并发调用写接口」。

### 16.4 数据库证据（dev 库，仅 SELECT）

| 查询 | 结果 |
|---|---|
| `hse_org_unit where level=3` | 12 个作业中心（无环卫/市政园林） |
| `hse_assessment_target` distinct township | 16 值（全为组织名） |
| `risk_area_dict` 全量 | 17 行，为驻地/作业单元语义 |
| 16 词表 × 4 落点交叉计数 | 见 §9.3 |
| `violations` distinct township | 15 值（12 行政 + 3 部门；3 个用简称，423 行） |

---

## 附录A：字段核验矩阵（38 列全量）

> 「生产有值」= 当前 2 条记录中的填充数。`ABSENT` 表示「列存在、代码会写、但当前无值」，**不等于**「没有该列」。

| # | field_id | 列名 | type/ui | 谁写 | 生产有值 | 状态 |
|---:|---|---|---|---|:---:|---|
| 1 | `fldPMfL7wZ` | 多行文本 | 1/Text（**primary**） | 无人 | 0/2 | **CONFIRMED**（主字段，业务无用） |
| 2 | `fld9Qcn8Zt` | 隐患编号 | 1/Text | Worker `newHazardNo()` | 2/2 | **CONFIRMED**（UTC 缺陷 R1） |
| 3 | `fldIhShxn1` | 排查人ID | 1/Text | JWT `sub`（手机号明文） | 2/2 | **CONFIRMED** |
| 4 | `fld89oRZUj` | 排查人姓名 | 1/Text | JWT `name` | 2/2 | **CONFIRMED** |
| 5 | `fldrnz29oS` | 排查人部门 | 1/Text | JWT `department`（恒为安环管理部） | 2/2 | **CONFIRMED**（无组织语义 R10） |
| 6 | `fld3EUM6Nf` | 排查人职位 | 1/Text | JWT `position` | 2/2 | **CONFIRMED** |
| 7 | `fldF4JmUeo` | 排查时间 | 1/Text | H5 设备时钟 | 2/2 | **CONFIRMED**（文本列 R12） |
| 8 | `fldq1F3Eu1` | 隐患类别 | 3/SingleSelect（11 选项） | Worker（枚举校验） | 2/2 | **CONFIRMED**（与 AI 冲突 R9） |
| 9 | `fldDaO3vor` | 隐患级别 | 3/SingleSelect（2 选项） | Worker（枚举校验） | 2/2 | **CONFIRMED** |
| 10 | `fldiUucXmF` | 隐患位置 | 1/Text | H5 自由文本 | 2/2 | **CONFIRMED**（自由文本 R2） |
| 11 | `fldPvIQkbL` | 隐患描述 | 1/Text | H5（含 AI 前缀） | 2/2 | **CONFIRMED**（前缀 R13） |
| 12 | `fldP6P2ihI` | 纬度 | 1/Text | H5（校验范围） | 2/2 | **CONFIRMED** |
| 13 | `fldxvPILb3` | 经度 | 1/Text | H5（校验范围） | 2/2 | **CONFIRMED** |
| 14 | `fld2zIwhkm` | 现场照片 | 17/Attachment | Worker（≤3 file_token） | 2/2（各 1 张） | **CONFIRMED** |
| 15 | `fldCt5DLbd` | 处理状态 | 3/SingleSelect（5 选项） | Worker（只写 3 值） | 2/2 | **CONFIRMED**（5 选项 R8） |
| 16 | `fldu3cHKz4` | 备注 | 1/Text | Worker `req:<cid>` | 2/2 | **CONFIRMED**（幂等锚 R11） |
| 17 | `fldOJxQKEn` | 创建时间 | 5/DateTime（auto_fill） | Feishu 自动填充 | 2/2 | **CONFIRMED**（非系统字段） |
| 18 | `fldiSFfNmS` | 整改人ID | 1/Text | `assign` | 0/2 | **CONFIRMED**（代码会写，生产 ABSENT） |
| 19 | `fldfwwoZhr` | 整改人姓名 | 1/Text | `assign` | 0/2 | **CONFIRMED**（ABSENT） |
| 20 | `fldiaRcKsc` | 整改人部门 | 1/Text | `assign` | 0/2 | **CONFIRMED**（ABSENT） |
| 21 | `fldl2zSfOI` | 指派人ID | 1/Text | `assign`（JWT sub） | 0/2 | **CONFIRMED**（ABSENT） |
| 22 | `fldLEBDHEt` | 指派人姓名 | 1/Text | `assign` | 0/2 | **CONFIRMED**（ABSENT） |
| 23 | `fldhphU1LH` | 指派时间 | 1/Text | `assign` `todoNowLocal()` | 0/2 | **CONFIRMED**（ABSENT） |
| 24 | `fld5pHrDuk` | 整改期限 | 1/Text | `assign`（≤365 天校验） | 0/2 | **CONFIRMED**（ABSENT） |
| 25 | `fldq3lJtOU` | 整改说明 | 1/Text | `rectify`（≤500） | 0/2 | **CONFIRMED**（ABSENT） |
| 26 | `fldKA9IbHl` | 整改提交时间 | 1/Text | `rectify` | 0/2 | **CONFIRMED**（ABSENT） |
| 27 | `fldwstfIuN` | 整改后照片 | 17/Attachment | `rectify` / `submit`（登记即闭环） | 0/2 | **CONFIRMED**（ABSENT） |
| 28 | `fld5bMJFxx` | 验收人 | 1/Text | `review` | 0/2 | **CONFIRMED**（ABSENT） |
| 29 | `fldeU25mz5` | 验收时间 | 1/Text | `review` | 0/2 | **CONFIRMED**（ABSENT） |
| 30 | `fldBZVPcGx` | 验收结论 | 1/Text | `review` / `submit`（`登记时已…`） | 0/2 | **CONFIRMED**（ABSENT，R3） |
| 31 | `fldpGGuLfg` | 闭环时间 | 1/Text | `review(pass)` / `submit` | 0/2 | **CONFIRMED**（ABSENT） |
| 32 | `fldDg13eF6` | 打回次数 | 1/Text | `review(reject)` read+1 | 0/2 | **CONFIRMED**（ABSENT，R6） |
| 33 | `flddIntX6r` | 整改依据 | 1/Text | Worker（AI 回填，≤1000） | 2/2 | **CONFIRMED** |
| 34 | `flddCusd9t` | 整改建议 | 1/Text | Worker（AI 回填，≤1000） | 2/2 | **CONFIRMED** |
| 35 | `fldLlOVfXP` | 三违判定 | 1/Text | Worker（是/否） | 2/2 | **CONFIRMED**（文本 R14） |
| 36 | `fldB3n7CQ5` | 重大事故隐患判定 | 1/Text | Worker（是/否） | 2/2 | **CONFIRMED**（文本 R14） |
| 37 | `fldEXjbtmo` | 风险等级 | 1/Text | Worker（4 档） | 2/2 | **CONFIRMED**（文本 R14） |
| 38 | `fldEEGJzWM` | AI识别原始输出 | 1/Text | Worker（≤4000） | 2/2 | **CONFIRMED** |

**统计**：CONFIRMED 38 / PARTIAL 0 / NOT FOUND 0 / UNKNOWN 0。
（B03-01-B 的 11 项 NOT FOUND 与 5 项 UNKNOWN，本轮全部转为有证据的 CONFIRMED / 风险项。）

---

## 附录B：生产记录抽样结果

> 全量 2 条（`total=2`），非抽样。PII 已脱敏。

| 项 | 记录 A `reczz28PsTEGOjRC` | 记录 B `reczz28PsVJrMvi5` |
|---|---|---|
| 隐患编号 | YH202610210122321680 | YH202610210124317843 |
| 排查人ID | `1**********`（11 位，仅保留首 1 位） | 同 |
| 排查人姓名 | 刘**（已脱敏） | 同 |
| 排查人部门 | 安环管理部 | 同 |
| 排查人职位 | 经理 | 同 |
| 排查时间 | 2026-10-21 09:22 | 2026-10-21 09:24 |
| 创建时间 | 1792545754211 → 2026-10-21 09:22:34 (CN) | 1792545872937 → 2026-10-21 09:24:32 (CN) |
| 隐患类别 | 设备设施 | 设备设施（**AI 判为高处作业**） |
| 隐患级别 | 一般隐患 | 一般隐患 |
| 隐患位置 | 大柳镇 | 大柳镇 |
| 隐患描述（截断） | 「隐患描述：设备操作区玻璃门旁的白色安全警示牌…」 | 「隐患描述：二层平台临边虽设有钢制防护栏杆…」 |
| 纬度 / 经度 | 37.722734 / 116.8334687 | 37.722734 / 116.8334687 |
| 现场照片 | 1 个（hazard.jpg，65,804 B） | 1 个（hazard.jpg，81,389 B） |
| 处理状态 | 待整改 | 待整改 |
| 备注 | `req:mvhfghd4nvmg57ffbhmqlb66mi2mml` | `req:mvhfj0uswv3dr8w15w9kin7n31nbo` |
| 三违判定 / 重大判定 | 否 / 否 | 否 / 否 |
| 风险等级 | 一般风险 | 一般风险 |
| 整改依据 / 建议 | 有 | 有 |
| AI识别原始输出 | 有（JSON） | 有（JSON，category=高处作业） |
| 整改 / 验收 / 闭环 15 列 | **全部 ABSENT** | **全部 ABSENT** |

**派生事实**：`创建时间 - 排查时间` = 34 秒 / 32 秒 ⇒ `排查时间` 由提交瞬间生成，**不是真实发现时刻**（H5 无时间控件，B03-01-B 已记，此处数据印证）。

---

## 附录C：API/源码证据

### C.1 updateRecord（局部更新的实现侧）

```js
// grid-mobile-cloudflare/worker/storage/feishuAdapter.js:186-195
export async function updateRecord(env, appToken, tableId, recordId, fields) {
  const token = await getFsToken(env);
  const res = await fetch(
    `${FS_BASE}/bitable/v1/apps/${...}/tables/${...}/records/${...}`,
    { method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ fields }) }   // ← 只发局部字段
  );
```

### C.2 assign 的 8 键（不含任何基础业务列）

```js
// index.js:3693-3702
const fields = {
  [HAZARD_FIELDS.rectifierId]: rectifierId,
  [HAZARD_FIELDS.rectifierName]: patrolText(person.name, 40),
  [HAZARD_FIELDS.rectifierDept]: patrolText(person.department || '', 40),
  [HAZARD_FIELDS.assignerId]: String(payload.sub || ''),
  [HAZARD_FIELDS.assignerName]: patrolText(payload.name, 40),
  [HAZARD_FIELDS.assignedAt]: todoNowLocal(),
  [HAZARD_FIELDS.deadline]: deadline,
  '处理状态': HAZARD_STATUS_PENDING,
};
```

### C.3 表定位（显式优先 → 名称兜底）

```js
// storage/index.js:42-46
async function tableIdFor(env, envKey, tableName) {
  const explicit = env && env[envKey] ? String(env[envKey]).trim() : '';
  if (explicit) return explicit;
  return resolveTableIdByName(env, tableName);   // ← 换 base 会静默改指向
}
```

### C.4 newHazardNo（UTC 缺陷）

```js
// index.js:3115-3120
function newHazardNo() {
  const d = new Date(), p = (n) => String(n).padStart(2, '0');   // ← UTC，未 +8h
  return 'YH' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate())
    + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds())
    + String(Math.floor(1000 + Math.random() * 9000));
}
```

对比 `todoNowLocal()`（`:4049-4056`）明确写了 `+ 8 * 3600 * 1000`。**同一文件内两套时钟口径**。

### C.5 创建时列清单（36 列来源）

```js
// index.js:3310-3339（节选）
const record = {
  '隐患编号': newHazardNo(),
  '排查人ID': String(payload.sub || ''),
  '排查人姓名': patrolText(payload.name, 40),
  '排查人部门': patrolText(payload.department, 40),
  '排查人职位': patrolText(payload.position, 40),
  '排查时间': findTime,
  '隐患类别': category, '隐患级别': level,
  '隐患位置': location, '隐患描述': description,
  '处理状态': rectTokens.length ? HAZARD_STATUS_CLOSED : HAZARD_STATUS_PENDING,
  '备注': cid ? `req:${cid}` : '',
};
// + 纬度/经度（条件）、现场照片（条件）
// + 整改后照片/闭环时间/验收结论（仅登记即闭环时）
// + 6 个 AI 列（条件）
```

---

## 最终状态矩阵

| 项目 | 状态 | 是否阻塞 C |
|---|---|---|
| G1 表ID | **CONFIRMED** | 否 |
| G2 字段 | **CONFIRMED** | 否 |
| G3 PUT语义 | **CONFIRMED**（增量更新，官方文档明示） | 否 |
| G4 记录真值 | **CONFIRMED**（全量 2 条） | 否 |
| record_id | **CONFIRMED**（Feishu 生成、稳定、无删除） | 否 |
| 人员映射 | **CONFIRMED**（手机号等值，2/2） | 否 |
| 区域映射 | **PARTIAL**（词表 16/16 可归一；自由文本不可） | 否（需降级规则） |
| DEC-03 | **BLOCKED**（业务未裁决区域实体形态） | 否（不阻塞同步落库，阻塞统计口径） |

```text
B03-01-C-0 = PASS WITH GAPS
进入 B03-01-C 的条件：全部满足（带 §15.3 四条强制约束）
```
