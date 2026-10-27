# B00｜手机 H5 → 飞书隐患多维表格 → PG 全链路事实源核验

> 只读核验。基线 `ljt8825-hash/HSE` · 分支 `feat/hse-business-closure` · HEAD `9d503d2`。
> **CODE CHANGE = 0 / DDL = 0 / DML = 0 / CONFIG CHANGE = 0 / PRODUCTION CHANGE = 0**
> 飞书侧仅执行 list / get（只读），未写任何记录、未改任何字段、未改表结构。

---

## 1. 一句话结论

**手机 H5 → 飞书 这一段是真实、完整、正在生产运行的事实链；飞书 → PG 这一段不存在任何代码。**
PG 里的 110 条隐患不是同步来的，是 2026-08-24 一次性从 Excel 导入的历史数据。
两条链路之间没有断点可"修"，只有一段从未被建造的路。

```text
   手机 H5  ──────►  飞书隐患多维表格  ──╳──►  PostgreSQL.hazards
   （已上线）          （已上线）         （代码不存在）
                                        ↑
                          不是"断了"，是"从来没有"
```

---

## 2. 基线（核验开始时的实际状态）

| 项 | 实测值 | 取证方式 |
|---|---|---|
| Repository | `ljt8825-hash/HSE` | `git remote -v` |
| Branch | `feat/hse-business-closure` | `git rev-parse --abbrev-ref HEAD` |
| HEAD | `9d503d210bb24e3a60cf8e66fbdff2dcbf3f79cb` | `git rev-parse HEAD` |
| upstream | `b212b8de2ac896509b650d96168119294d106dae`（本地领先 2） | `git rev-parse @{u}` |
| 近 4 提交 | `9d503d2` / `fa525d7`（A02-06）/ `b212b8d` / `a6a81a3`（A02-05） | `git log --oneline -4` |
| `server/routes/cost.js` | `A ` 暂存态，md5 `e88ae2b0b275346dfc1431408aa00bff` | `git status --porcelain` + `md5sum` |
| 审计库（PG） | `safety_dashboard_dev`（写入盘问全部落此库） | `current_database()` |
| 生产库（PG） | `safety_dashboard`，**仅 SELECT**（`BEGIN READ ONLY`） | `current_database()` |
| 飞书生产 base | `WX9TbTqJKa7sywsgrU4cVoKdnXb`，**仅 list/get** | 探针见 §9 |

---

## 3. 第一段：H5 → 飞书（PASS）

### 3.1 真实链路

```text
浏览器（grid-mobile-cloudflare/frontend/check.app.js）
  │  mobileApi("/api/mobile/hazard/submit", body)
  ▼
Pages Functions  pages/functions/api/[[route]].js   →  反代
  ▼
Cloudflare Worker  grid-mobile-cloudflare/worker/index.js
  │  index.js:4779   if (p === '/api/mobile/hazard/submit') return handleHazardSubmit(...)
  ▼
storage adapter   worker/storage/index.js:15   export const getAdapter = () => feishuAdapter
  ▼
飞书开放平台  https://open.feishu.cn/open-apis
  │  feishuAdapter.js:157  POST /bitable/v1/apps/{app_token}/tables/{table_id}/records/batch_create
  ▼
飞书多维表格   base WX9TbTqJKa7sywsgrU4cVoKdnXb / 表 tblnyMjxtxjpP08q「H5隐患排查台账表」
```

### 3.2 逐箭头核验

| 链路 | 是否存在 | 实现位置 | 当前状态 | 证据 |
|---|---|---|---|---|
| H5 页面 → Worker | ✅ 存在 | `frontend/check.app.js:5049` `mobileApi("/api/mobile/hazard/submit", body)` | 已上线 | 前端 9 个 hazard 接口调用点（:4834/:5049/:5114/:5182/:5313/:5335/:5398/:5426/:5516） |
| Worker → 飞书 | ✅ 存在 | `worker/index.js:3197 handleHazardSubmit`；`worker/storage/feishuAdapter.js:154 createRecords` | 已上线 | `records/batch_create`；失败映射 429→`WPS_RATE_LIMITED`、其它→502 |
| 飞书 → PG | ❌ **不存在** | 无 | **NOT FOUND** | 见 §4（三重独立验证） |
| PG → Web | ⚠️ 存在但与飞书无关 | `server/services/hazardService.js:788` 读 `hazards` | 读的是导入的历史数据 | 页面显示的 110 条不会随飞书变化 |

### 3.3 后端不是 WPS，是飞书（重要澄清）

代码里大量出现 `CF-WPS-xxx` 与 `/wps/records/create`，极易被误读为"写金山 WPS"。逐个核实：

| 疑点 | 实际事实 | 证据 |
|---|---|---|
| `CF-WPS-100/102/103` | **内部工单编号**（第 N 号变更单），不是 WPS 产品 | `index.js:2956` 注释「CF-WPS-100 隐患整改闭环状态机」 |
| `storageConfig().backend` | `'feishu'` | `worker/storage/index.js:57` |
| `getAdapter()` | 硬编码返回 `feishuAdapter` | `worker/storage/index.js:15` |
| `wpsAdapter` | **已删除**（2026-09-18 放弃 WPS） | `worker/storage/index.js:4` 注释；`worker/storage/` 下只有 `feishuAdapter.js` + `index.js` |
| `/wps/records/create` | **历史路径名保留**，后端写飞书主台账 | `index.js:9`「历史路径名保留的最小 records create 代理（同样写飞书主台账）」 |
| `pages/functions/wps/[[route]].js` | 仅反代 `/wps/*` 到 Worker（照片上传历史通道） | 文件全文 5 行，`proxyToWorker` |
| `wrangler.toml` 残留 `WPS_*` | POC 阶段配置未清理，**当前无消费方** | `STORAGE_BACKEND = "feishu"` 覆盖；Worker 内无 wpsAdapter |

→ **手机端不存在 `H5 → WPS` 生产链路。PASS（未发现错误复用 WPS 的代码）。**

### 3.4 写入契约（服务端定值，不接受前端指定）

`index.js:3310-3323`：

```js
const record = {
  '隐患编号': newHazardNo(),                                  // YH + yyyymmddHHmmss + 4 位随机
  '排查人ID': String(payload.sub || ''),                       // 取 Session，不信前端
  '排查人姓名': patrolText(payload.name, 40),
  '排查人部门': patrolText(payload.department, 40),
  '排查人职位': patrolText(payload.position, 40),
  '排查时间': findTime,
  '隐患类别': category,                                        // 必须命中 11 项服务端枚举
  '隐患级别': level,                                           // 必须命中 2 项枚举
  '隐患位置': location,
  '隐患描述': description,                                     // 非空，≤500
  '处理状态': rectTokens.length ? '已闭环' : '待整改',
  '备注': cid ? `req:${cid}` : '',
};
```

附加上限：描述 ≤500 / 位置 ≤100 / 照片 ≤3 / 请求体 ≤16KB；经纬度非法则整段丢弃（写空不写错坐标）。

### 3.5 9 个接口与读写性质

| 接口 | handler | 远端动作 | 权限 |
|---|---|---|---|
| `/api/mobile/hazard/submit` | `handleHazardSubmit` | `createRecords`（batch_create） | `hazardGate` 限安环管理部 |
| `/api/mobile/hazard/ai-fill` | `handleHazardAiFill` | 调外部视觉模型，**不写飞书** | 仅需登录 |
| `/api/mobile/hazard/list` | `handleHazardList` | `scanRecords(..., 3)` 只读 | 登录 + 归属过滤 |
| `/api/mobile/hazard/detail` | `handleHazardDetail` | `getRecord` 单条只读 | 登录 + 归属校验 |
| `/api/mobile/hazard/assignable` | `handleHazardAssignable` | 读花名册/身份表 | `hazardGate` |
| `/api/mobile/hazard/assign` | `handleHazardAssign` | `getRecord` → `updateRecord` | `hazardGate` + 改密守卫 |
| `/api/mobile/hazard/todos` | `handleHazardTodos` | `scanRecords(..., 3)` 只读 | `hazardGate` |
| `/api/mobile/hazard/rectify` | `handleHazardRectify` | `getRecord` → `updateRecord` | `hazardGate` + 改密守卫 |
| `/api/mobile/hazard/review` | `handleHazardReview` | `getRecord` → `updateRecord` | `hazardGate` + 改密守卫 |

`hazardGate`（`index.js:3103`）：`payload.department === '安环管理部'`，否则 `403 FORBIDDEN_NOT_HAZARD_DEPT`。判定在服务端，前端隐藏入口可被绕过。

---

## 4. 第二段：飞书 → PG（NOT FOUND，三重独立验证）

任务书 §七要求严格区分"存在代码"与"已经打通"。这里不是"存在但没跑"，是**代码根本不存在**。用三条互不依赖的路径分别验证：

### 4.1 验证一：服务端源码零命中

```text
$ grep -rli "feishu|lark|bitable" server/ --include=*.js --include=*.mjs --include=*.cjs
（空）

$ grep -rli "feishu" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.git ...
命中文件全部位于 grid-mobile-cloudflare/**（H5 侧）与 docs/**（审计报告）/ server/backups/**（历史备份）
server/ 运行代码：0
```

### 4.2 验证二：服务端依赖零飞书

`server/package.json` 完整依赖清单：

```text
bcrypt bcryptjs compression cors dayjs dotenv express express-rate-limit helmet
jsonwebtoken mammoth morgan multer node-cron pdf-parse pg uuid winston
winston-daily-rotate-file ws xlsx
```

无 `feishu` / `lark` / `@larksuiteoapi` / `bitable` / 任何飞书 SDK。服务端要调飞书只能手写 `fetch`，而全仓无此类调用。

### 4.3 验证三：环境变量零飞书凭据

```text
$ grep -c "^FS_" server/.env
0
$ grep -E "^(SCHEDULER_ENABLED|WPS_GRID_SYNC|DB_NAME|NODE_ENV)=" server/.env
DB_NAME=safety_dashboard
NODE_ENV=development
WPS_GRID_SYNC=true
SCHEDULER_ENABLED=true
```

服务端有 8 个 `WPS_*` 键、**0 个 `FS_*` 键**。即使想调飞书也无凭据。

### 4.4 验证四：数据库零飞书痕迹

```sql
-- 生产库，BEGIN READ ONLY
SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema='public'
  AND (column_name ILIKE '%feishu%' OR column_name ILIKE '%bitable%' OR column_name ILIKE '%record_id%');
```

返回 15 行，全部是 `*_record_id`（业务外键，如 `hazard_record_id`、`wps_record_id`、`generation_record_id`），**无一处与飞书相关**。
`pg_namespace` 中 `ILIKE '%feishu%'` 命中 0 行。

### 4.5 结论

| 分类（任务书 §七） | 判定 | 依据 |
|---|---|---|
| A. 已实现 | ❌ | 无代码 |
| B. 已配置但未运行 | ❌ | 无配置、无凭据 |
| C. 有同步函数但无入口 | ❌ | 无函数 |
| D. 有入口但无法完成 | ❌ | 无入口 |
| **E. 完全不存在** | ✅ | 三条验证全部为 0 |

---

## 5. 当前断点

```text
H5 页面
  ↓  ✅ mobileApi()                                        frontend/check.app.js:5049
H5 API / Pages Functions
  ↓  ✅ proxyToWorker                                     pages/functions/api/[[route]].js
Cloudflare Worker
  ↓  ✅ getAdapter() → feishuAdapter                       worker/storage/index.js:15
飞书 API
  ↓  ✅ POST records/batch_create                          feishuAdapter.js:157
飞书隐患多维表格
  ↓  ❌ ──────────────────  断在这里  ──────────────────
PG hazards
  ↓  ✅ SELECT（但只读到 2026-08-24 导入的历史 110 条）     hazardService.js:788
Web 页面
```

断点的性质：**不是链路中断，是这一段路从未被建造。**

---

## 6. 同步责任主体：未发现

任务书 §八要求逐个排查，不允许猜测。逐项结果：

| 候选责任主体 | 检查方式 | 结果 |
|---|---|---|
| Cloudflare Worker | 全文件搜 `INSERT` / `pg` / `postgres` / `hazardSheetId` 周边 | ❌ Worker 明确不连 PG（`wrangler.toml` 注释「本 POC 不连接 PG / HSE / JWT，不写库」） |
| Node/Express server | §4.1–4.3 三重验证 | ❌ 零飞书代码、零飞书依赖、零飞书凭据 |
| Cron | `server/app.js:649` 只注册 5 个调度器，无飞书相关 | ❌ |
| GitHub Actions | `.github/workflows/` 6 个文件，`grep -l "feishu\|bitable"` = 0 | ❌ |
| Windows Task Scheduler | 仓库内无引用飞书的计划任务脚本 | ❌ 未发现 |
| 数据库 Job | PG 侧无 `pg_cron` 扩展使用痕迹 | ❌ |
| 第三方自动化 | 未发现任何 Zapier/Make/飞书自动化配置入库 | ❌ |
| 飞书 Webhook | 全仓无 webhook 注册/接收端点 | ❌ |
| 定时拉取 | 无 feishu pull 实现 | ❌ |
| 人工导入 | 存在，但**只到 2026-08-24 为止** | ⚠️ 见 §7 |

> **同步责任主体未发现。** 这不是"责任人失职"，是"从未指派"——因为要同步的那段代码不存在。

---

## 7. 唯一存在过的通道：人工 Excel 导入（已停）

`importShared.js:460-483` 定义了 `hazards` 导入模块：

```js
hazards: {
  targetTable: 'hazards',
  moduleName: '隐患排查治理',
  conflictKey: 'description',                                  // ← 以描述去重
  fieldMapping: {
    '序号':'no', '隐患描述':'description', '整改措施':'measure',
    '检查时间':'hazard_date', '检查人员':'checker',
    '整改人员':'fixer', '整改时间':'fix_date',
    '是否整改完成':'status',                                    // 仅用于识别表头
    '备注':'remark',
  },
  dbColumns: ['no','hazard_date','description','measure','checker','fixer','fix_date','remark'],
  //  ← status 被显式排除：Excel 的"是否整改完成"永远进不了 hazards.status
}
```

导入日志（生产库）：

```sql
SELECT to_char(started_at,'YYYY-MM') mon, COUNT(*) jobs, SUM(total_rows) rows_sum
FROM import_logs GROUP BY 1 ORDER BY 1 DESC;
```

| 月份 | 作业数 | 行数合计 |
|---|---|---|
| 2026-08 | 2 | 114 |
| 2026-07 | 31 | 2268 |

**2026-09 与 2026-10 均为 0 条。** 也就是说：人工导入通道在 8 月之后也停了。

---

## 8. PG `hazards` 110 条的真实来源（已证实 + 待核）

### 8.1 已证实：一次性批量导入

```sql
SELECT to_char(created_at,'YYYY-MM-DD HH24:MI:SS') sec, COUNT(*) n FROM hazards GROUP BY 1;
```

| sec | n |
|---|---|
| 2026-08-24 23:36:23 | **110** |

**110 行全部落在同一秒**（dev 库实测微秒差 0.17 秒内）→ 单次批量 INSERT，不是逐条业务录入。
`id` 连续 `125..234`；`hazard_date` 跨 `2026-02-17 ~ 2026-07-10`（早于导入日半年）→ 历史回填。

### 8.2 已证实：66 条可精确溯源到仓库内 Excel

| 源文件 | 有效数据行 | 描述在 PG 中精确命中 |
|---|---|---|
| `数据源/10_隐患排查治理/6月安全生产隐患排查登记表.xlsx` | 66 | **65 / 66** |
| `数据源/10_隐患排查治理/隐悦排查登记表_2026-06-21.xlsx` | 52 | 48 / 52 |

暂存表交叉验证：

```sql
-- 两张 t_10_ 暂存表并集去重后 71 条描述，其中 66 条能对上 hazards
```

`import_logs.target_table` 中存在 `t_10_隐患排查治理_6月安全生产隐患排查登记表`（total_rows 最大 66）与 `t_10_隐患排查治理_隐悦排查登记表_2026_06_21`（54 行），与 Excel 行数量级一致。

### 8.3 待核：44 条在仓库内找不到源文件

```sql
-- 用两张 t_10_ 暂存表的描述并集做反连接
SELECT COUNT(*) FROM hazards h WHERE NOT EXISTS (...);
-- 44
```

对这 44 条做了全量反查：扫描 `数据源/` 下**全部 103 个表格文件**（.xlsx/.xls/.csv），关键词包括
`杜集转运站灭火器箱破损`、`大柳转运站配电箱跨接线脱落`、`收运车C0374警示标贴褪色` —— **均未命中**。
规范化比对（去空格/括号/标点）后仍无法匹配，不是"文本差异"问题。

| 项目 | 值 |
|---|---|
| 条数 | 44 |
| 含「转运站」 | 34 |
| 含「收运车」 | 10 |
| 日期跨度 | 2026-02-17 ~ 2026-07-10 |
| `created_at` | 与另外 66 条同一秒 |
| id 分布 | **散布于 125..234 之间**（非连续块），说明与 66 条在同一次 INSERT 中按日期混排 |

→ **结论：44 条的源文件不在本仓库。** 可能是导入当时存在、事后未提交的文件，或来自生产环境的另一份台账。
**这是本报告唯一未闭环的来源问题，标记为待核，不做推测。**

### 8.4 已证实：110 条中有 3 个字段是"列默认值"，不是业务数据

```sql
SELECT column_name, column_default FROM information_schema.columns
WHERE table_name='hazards' AND column_name IN ('hazard_source','level','status','is_deleted');
```

| 列 | 默认值 | 实际分布 | 判定 |
|---|---|---|---|
| `hazard_source` | `'daily_check'` | 110/110 全为 `daily_check` | **默认值填充**，非真实来源 |
| `level` | `'一般'` | 110/110 全为 `一般` | **默认值填充**，非真实分级 |
| `status` | `'discovered'` | `discovered` 50 / `closed` 60 | 默认值 + 后续流转 |
| `is_deleted` | `false` | 110/110 false | 默认值 |

对照：飞书侧真实提交的记录是 `隐患级别 = 一般隐患`（不是 `一般`），`处理状态 = 待整改`。
**词表不一致 → 即便将来做同步，这两列也不能直接搬。**

### 8.5 已证实：110 条的业务字段填充率（决定能不能迁移）

| 字段 | 填充 | 说明 |
|---|---|---|
| `description` | 110/110 | 有 |
| `measure` | 110/110 | 有 |
| `checker` | 110/110 | 有（姓名字符串，非 ID） |
| `fixer` | 97/110 | 88% |
| `fix_date` | 69/110 | 63% |
| `deadline` / `deadline_date` | **0/110** | 无整改期限 |
| `review_result` | **0/110** | 无复查结论 |
| `verify_date` | **0/110** | 无验收日期 |
| `rectify_date` | **0/110** | 无整改完成日期 |
| `township` | **0/110** | 无乡镇 |
| `hazard_category` | **0/110** | 无类别 |
| `finder_id` / `checker_id` / `responsible_id` | **0/110** | 无人员 ID |
| `grid_id` | **0/110** | 无网格 |

→ 60 条 `status='closed'` 里，**没有一条带复查/验收证据**。这与 A02-05 的 C1 结论一致（review 才是唯一正式关闭）。

---

## 9. 飞书侧真实数据（只读实测，已突破"无权限"）

任务书 §十与 §二十二预设了"可能无权限"。实际核验发现：**生产 base 可读**，因此完成了数据级重叠核验，无需降级为 BLOCKED。

### 9.1 凭据来源与使用边界

| 项 | 值 |
|---|---|
| 凭据文件 | `grid-mobile-cloudflare/worker/.dev.vars`（已被 `grid-mobile-cloudflare/.gitignore:6` 忽略，**未入库**） |
| 使用方式 | 仅 `POST /auth/v3/tenant_access_token/internal` 换票 + `GET /bitable/v1/apps/{app}/tables|fields|records` |
| 写操作 | **0 次**（无 create / update / delete / field create） |
| 生产 base | `WX9TbTqJKa7sywsgrU4cVoKdnXb`（取自 `worker/wrangler.toml`，非 .dev.vars） |

> 说明：`.dev.vars` 自身指向**测试 base**（注释明写「目标 base = 测试台账…非生产」，其隐患表 `tblxTdsCT9v3YY03` 仅 3 条记录）。生产 base 是用同一 app 凭据直接寻址读取的，两者 base 不同、数据不同。

### 9.2 生产 base 表清单（6 张）

| 表名 | table_id | 记录数 | 时间范围 |
|---|---|---|---|
| H5员工日常不安全行为台账 | `tbl5QiCv5Qbal044` | **1608** | 2026-09-29 17:11 ~ 2026-10-27 17:00 |
| H5移动端身份表 | `tbl58t9kjyDlacSw` | 73 | — |
| H5花名册表 | `tbl2ZHdXX5d8R12a` | 1369 | — |
| 规则表 | `tbldxrUusDYuqdno` | 未统计 | — |
| 表格视图 | `tbl5hz1RyHlO3C3l` | 未统计 | — |
| **H5隐患排查台账表** | `tblnyMjxtxjpP08q` | **2** | 2026-10-21 09:22 ~ 09:24 |

### 9.3 隐患表只有 2 条记录（关键发现）

```text
隐患编号           排查时间              隐患类别   隐患级别   隐患位置   处理状态   照片
YH202610210122321680  2026-10-21 09:22   设备设施   一般隐患   大柳镇     待整改     1
YH202610210124317843  2026-10-21 09:24   设备设施   一般隐患   大柳镇     待整改     1
```

两条的 `排查人部门` 均为「安环管理部」，`整改期限`、`闭环时间`、`验收结论` **全为空**。
两条描述均以「隐患描述：」开头 —— 与 `buildHazardPrompt()` 的 AI 输出字段名一致，**形态上是 AI 识别回填后提交的联调/试用数据**（此判断标注为观察，不作定性结论）。

### 9.4 隐患表字段结构（38 列，实测）

```text
多行文本(1) / 隐患编号(1) / 排查人ID(1) / 排查人姓名(1) / 排查人部门(1) / 排查人职位(1)
排查时间(1) / 隐患类别(3 单选) / 隐患级别(3 单选) / 隐患位置(1) / 隐患描述(1)
纬度(1) / 经度(1) / 现场照片(17 附件) / 处理状态(3 单选) / 备注(1) / 创建时间(5 日期)
整改人ID / 整改人姓名 / 整改人部门 / 指派人ID / 指派人姓名 / 指派时间
整改期限 / 整改说明 / 整改提交时间 / 整改后照片(17) / 验收人 / 验收时间
验收结论 / 闭环时间 / 打回次数 / 整改依据 / 整改建议 / 三违判定
重大事故隐患判定 / 风险等级 / AI识别原始输出
```

其中闭环 15 列由 `ensureHazardRectFields()`（`index.js:3015`）在首次写入前**幂等补建**，AI 6 列同理 —— 即表结构由代码自动演进，无 DDL 脚本管理。

### 9.5 Feishu 与 PG 的数据重叠（已证实：零重叠）

| 维度 | 飞书隐患表 | PG `hazards` | 重叠 |
|---|---|---|---|
| 记录数 | 2 | 110 | — |
| 时间范围 | 2026-10-21 | 2026-02-17 ~ 2026-07-10 | **无交集** |
| 业务编号 | `YH+yyyymmddHHmmss+4随机` | **无该列**（只有整型 `no` 序号） | **无法比对** |
| 唯一标识 | `record_id` + 隐患编号 | `id` (bigint) | **无共同键** |
| 描述重合 | 2 条 | 110 条 | **0 条** |
| PG 有飞书无 | — | **110 条全部** | — |
| 飞书有 PG 无 | **2 条全部** | — | — |

→ **飞书与 PG 是两套完全独立、互不知晓的隐患数据。**
→ 还有一个更硬的障碍：**PG `hazards` 连"隐患编号"这一列都不存在**，即使明天写同步代码，也没有可用于 upsert 的业务主键（详见字段映射文档 §5）。

---

## 10. 唯一标识与幂等（只读核验，未做任何修改）

### 10.1 H5 侧幂等键

| 项 | 值 | 证据 |
|---|---|---|
| 幂等键 | `client_request_id`（cid），8~64 位 `[A-Za-z0-9_-]` | `index.js:3273-3276` |
| 生成方 | 前端 `newClientRequestId()` | `check.app.js:5034` |
| 落地位置 | **飞书「备注」列**，格式 `req:<cid>` | `index.js:3322` |
| 存储键 | **无独立列**，靠文本前缀 | 同上 |
| 生命周期 | ① isolate 内 `cid→recordId` Map，TTL 5min；② 在途表 TTL 30s 合并并发；③ 飞书原生 search（持久兜底） | `index.js:2909-2948` / `storage/index.js:119` |
| 冷启动后 | 缓存全失，靠 `searchRecords(field:'备注', operator:'contains', value:'req:<cid>')` 找回 | `storage/index.js:135-143` |
| 失败处理 | 预查失败**不阻塞创建**（宁可重复一条，不让用户提交不上去） | `storage/index.js:100` |
| 飞书 `record_id` | **不作为业务唯一标识**，仅作技术主键 | 隐患编号由 `newHazardNo()` 另外生成 |

### 10.2 PG 侧幂等

**不存在。** 因为不存在写入路径。

### 10.3 唯一键风险评估（本任务只标记，不修）

| 风险 | 等级 | 说明 |
|---|---|---|
| PG 无"隐患编号"列 | **P0** | 同步无业务主键，只能靠描述文本匹配；而 PG 内已有 1 组重复描述（110 行 / 109 唯一） |
| 幂等键寄生在「备注」文本列 | P1 | 用户填写真实备注会被 `req:<cid>` 覆盖；且 `contains` 依赖文本索引语义 |
| 幂等状态存于 Worker isolate 内存 | P1 | 重启即失，仅靠 search 兜底；若飞书 search 索引有秒级延迟，重复窗口存在（代码注释已承认） |
| 隐患编号非唯一约束 | P2 | `YH+秒级时间+4位随机`，无数据库唯一索引兜底 |

> 按任务书 §十三要求：以上问题定位在 **「条件：Feishu → PG」** 这一段（PG 缺唯一键），
> **不得通过修改 H5 → Feishu 来实现**。H5 侧幂等机制本身是完整的、正在工作的。

---

## 11. 生产能力上限（提前暴露，供 B03 参考）

| 位置 | 限制 | 后果 |
|---|---|---|
| `handleHazardList` | `scanRecords(..., 3)` = 3 页 × 500 = **1500 条上限** | 超过 1500 条后"全部隐患"列表将静默截断 |
| `handleHazardTodos` | 同上 1500 上限 | 待办列表同理 |
| `HAZARD_LIST_LIMIT` | 100 | 单次返回条数 |
| 隐患表当前 2 条 | 距上限 1500 尚远 | 当前不构成实际问题 |

---

## 12. 未做与未验证

| 项 | 原因 |
|---|---|
| 未对飞书执行任何写操作 | 任务书 §十八禁止；且 H5→飞书为生产核心链路 |
| 未验证 Worker 是否正在被调用（无 CF Analytics 权限） | 只能由"飞书主台账 1608 条 / 隐患表 2 条"间接证明 Worker 在运行 |
| 未定位 44 条隐患的源文件 | 全仓 103 个表格文件扫描后仍无命中，标为待核 |
| 未逐条比对 PG 110 条与 t_10 暂存表的字段级一致性 | 仅比对描述（作为主键近似）；字段级差异可能影响后续迁移方案 |
| 未检查 `.dev.vars` 中的 `FS_APP_SECRET` 是否为生产应用同一 Secret | 只验证"能换到 token 且能读生产 base"，未核 app_id 归属 |
| 未验证生产 Worker 部署版本与仓库 `index.js` 是否一致 | 无 `wrangler deployments` 权限；仓库 `deploy.js` 为生成物 |

---

## 13. 判定

```text
H5 → Feishu      = PASS（代码完整 / 正在生产运行 / 1608 条主台账为证）
Feishu → PG      = NOT FOUND（三重独立验证，代码/依赖/凭据全为 0）
PG hazards 110条 = 已证实 66 条来自仓库 Excel + 待核 44 条（同批 INSERT，源文件不在仓库）
Feishu/GPG 重叠   = 已证实 0 重叠（2 vs 110，时间无交集，无共同键）
同步责任主体      = 未发现（不是失职，是从未指派）
```
