# HSE COST BROWSER ACCEPTANCE V2 — 安全生产费用域第二轮完整业务浏览器验收（基线 5e8b052）

> 判定顺序：真实浏览器操作 → 实际 Network/API → 实际 Service → 实际数据库 → 刷新重读 → 结论。
> 本轮纪律：**只验收，不修改**。未改任何业务代码/测试/SQL/配置；未 commit、未 push、未 merge、未执行迁移、未碰生产库。
> 原始证据存档：`.accept2/evidence-ui.json`（UI+Network 层）、`.accept2/evidence-api.json`（分摊 API 层+逐步 DB 验证）、`.accept2/evidence-final.json`（TEST-15 三方对账）。

---

## 1. 环境

| 项 | 实际值 |
|---|---|
| HEAD | `5e8b0524ccd69369e59857024f0640cadec5f4cb`（开测前 `git rev-parse HEAD` 实测，与要求一致） |
| 分支 | `feat/hse-business-closure` |
| 开测前 `git status --short` | ` M cost/index.vue`（P0-02 修复）+ `?? server/routes/cost.js`（P0-01 修复）+ 上轮两份报告 + `acl-out/` + `test-write.txt`（均为既往未跟踪文件） |
| Frontend | `vite 8.1.4` dev server **5176**（`/api` 代理 5882；为避开 safe-delete 护栏对 vite 优化器缓存的误杀，本轮用一次性临时配置指定独立 cacheDir，**测后已删除**，未改任何项目配置） |
| Browser | 无头 Chrome（Playwright 1.61.1 + chromium_headless_shell-1223，UA `HeadlessChrome/148.0.7778.96`；本机缓存仅有 1223 构建，显式 executablePath 指定） |
| Backend | **完整 `node app.js`**（非模块级 require）：`PORT=5882 DB_NAME=safety_dashboard_dev SCHEDULER_ENABLED=false WPS_GRID_SYNC=false WPS_GRID_DATA_SOURCE=false NODE_ENV=development`；日志实测 `HSE 后端服务启动成功 {"port":"5882"}`，进程全程存活 |
| Database | `safety_dashboard_dev`（psql 实测 `current_database()`；10 张成本表 + `uq_cost_commitment_active_per_request` + `uq_hse_safety_budget_bizkey` 齐备；开测前 marker 数据全 0，既有 dev 预算 339 条） |
| 登录 | 与前端 devAutoLogin **同一真实登录接口** `POST /api/auth/login`（admin），浏览器经 devAutoLogin 自动登录；API 层补测用同一接口获取的 token |
| 生产库 | **零接触**（全程只连 `safety_dashboard_dev`；用户既有 5876/5888/5173 进程未动） |

---

## 2. 每项测试结果（UI / API / DB / Refresh 四层）

| ID | 测试项 | UI | API | DB | Refresh | Result |
|---|---|---|---|---|---|---|
| TEST-01 | 页面加载 | ✅ h2 标题/3 卡/2 表/3 统计/分页正常 | ✅ 5 个 `/api/cost` 全 200，无 404/405/500 | —（只读） | — | **PASS** |
| TEST-02 | 新增（页面实际流程） | ✅ 弹窗填写/必填/成功提示/列表出现 | ✅ `POST /api/cost/requests` 200（id=83） | ✅ request 83 + 计划归因 77 落库 | ✅ 列表即时显示 | **PASS**（见 GAP-01） |
| TEST-03 | 搜索/筛选 | ⚠️ 页面**无任何**搜索筛选控件（0 输入框/0 下拉/0 重置） | ✅ keyword 命中 total=2 / 未命中 total=0 | ✅ 未被修改 | — | **PASS**（缺口见 GAP-02） |
| TEST-04 | 分摊新增（正常） | —（无分摊 UI，见 GAP-03；按任务允许的 API 方式触发） | ✅ `POST /api/cost/allocations` 200 创建 id=79 | ✅ SUM=1600.00 == 实际 1600.00 | — | **PASS** |
| TEST-05 | 超额/不足拦截 | —（无 UI 按钮可禁；以后端+DB 为准） | ✅ 两次均拒绝（body code=-1，逐字见 §3） | ✅ ACT-1 仍 1 条/1600.00；ACT-2 仍 0 条 | — | **PASS** |
| TEST-06 | 分摊修改 | —（API 方式） | ✅ 计划归因 1600→1800 成功；实际归因改备注成功 | ✅ DB 均为新值 | — | **PASS** |
| TEST-07 | 修改为超额 | —（API 方式） | ✅ 拒绝：「分摊修改后总额校验失败…必须完全一致」 | ✅ 原值 1600.00 与备注**保持不变**，SUM 仍 1600.00 | — | **PASS** |
| TEST-08 | 分摊删除 | —（API 方式） | ✅ 计划归因删除成功；实际归因删除被拒 | ✅ 软删除 `is_deleted=true`（非物理 DELETE）；实际归因未动 | — | **PASS** |
| TEST-09 | 不存在/已删除 ID | —（API 方式） | ✅ 不存在→`-2 分摊记录不存在`；已删→`-2 分摊记录已删除` | ✅ 无新记录、无副作用；列表只返回有效行 | — | **PASS** |
| TEST-10 | Excel 正常导入 | ✅ 选文件/预览/标签/确认/结果 alert/表格出现 4 行 | ✅ preview 200（batch `IMP-BUDGET-20261023-195368`, total=4, dup=0）；confirm 200 inserted=4 | ✅ 4 条落库（1600/2400.50/800/3200）；批次 done+指纹+操作人 | ✅ 表格显示 | **PASS** |
| TEST-11 | 完全相同文件重复导入 | ✅ 再预览：`alreadyImported=true`+previousBatchNo+「重复 4 行」+**确认按钮禁用** | ✅ 强制确认 inserted=0/skipped=4；同批次二次确认 `duplicateConfirm=true` 返回首次结果 | ✅ 导入前 4 条 = 导入后 4 条 | ✅ 表格不变 | **PASS** |
| TEST-12 | 错误 Excel | ✅ 预览 2 可导入/4 错误（每行带逐字原因）；确认后结果 alert 含失败原因 | ✅ preview 200 errorCount=4；confirm 200 inserted=2/failed=4 | ✅ M01/M02 落库；4 条非法行不存在 | — | **PASS** |
| TEST-13 | 错误导入后 DB 状态 | — | — | ✅ 批次 `209964` done：total=6/inserted=2/failed=4/error_detail 4 条逐字留痕；**逐行跳过+有效行落库（部分成功）**，与 `costService.js:1105-1130` 一致 | — | **PASS** |
| TEST-14 | 失败修正后重新导入 | ✅ 新预览 4 可导入/2 重复；确认成功 | ✅ confirm 200 inserted=4/skipped=2，新批次 `214345` | ✅ M03~M06 修正行全部落库；上次失败批次未阻止重试 | ✅ 表格显示修正行 | **PASS** |
| TEST-15 | 刷新一致性 | ✅ F5 后预算表 marker=10、申请表=2、统计卡 3200/3200/0 | ✅ keyword total=10/2；stats 3200/3200/0 | ✅ DB 10/2/3200/3200/0 | ✅ UI=API=DB 全等 | **PASS** |
| TEST-16 | 重复点击/重复提交 | ✅ 双击「提交」→ 仅 1 次 POST；双击「确认导入」→ 仅 1 次 POST | ✅ 分摊同 payload 连 POST 两次：首次 200、第二次总额校验拒绝；二次审批承诺数不增 | ✅ 无任何重复数据 | — | **PASS** |
| TEST-17 | 数据库清理 | — | — | ✅ 按唯一标识定向删除（先子后父）：分摊 4/实际 2/承诺 1/申请 2/预算 10/批次 4；清理后 marker 与成本交易表全部 =0，总预算回到 339 基线；无 TRUNCATE、未碰生产 | — | **PASS** |

**Console：全程 console error = 0、pageerror = 0**（TEST-15 复测仍为 0）。

---

## 3. 关键证据（逐字）

### TEST-02 新增（页面实际存在的流程）

页面**没有**「新增预算」按钮（实测 `budgetCreateEntryExists=0`）；源码级确认后端也无 `POST /api/cost/budgets`。页面实际提供的新增流程是「新建申请」。实测：

```text
POST /api/cost/requests  HTTP 200
payload: {"budgetId":null,"title":"HSE_BROWSER_ACCEPT_20261023_费用申请A","sourceType":"hazard",
          "applicantName":"验收机器人","applyAmount":1600,"purpose":"第二轮浏览器验收-计划归因1600",
          "allocations":[{"bizDomainId":null,...,"amount":1600}]}
response: {"code":0,"success":true,"message":"创建成功","data":{"id":"83","requestNo":"CR-20261023-186666",
           "applyAmount":"1600.00","status":"draft",...}}
DB: hse_cost_request id=83 apply_amount=1600.00；hse_cost_allocation id=77（request_id=83, cost_actual_id=NULL,
    amount=1600.00, record_type=normal）——申请与计划归因同一事务原子写入
```

### TEST-05 超额拦截（后端拒绝的逐字证据）

```text
① ACT-2（1600 待归因）首笔分摊 1000：
HTTP 200，body {"code":-1,"success":false,"message":"分摊总额校验失败：该实际支出金额 ¥1600.00，已归因 ¥0.00，
本次新增 ¥1000.00 后合计 ¥1000.00，必须完全一致。独立追加分摊只能用于「补齐」归因（使合计恰好相等）…"}
② ACT-1（已归因 1600）再追加 700：
HTTP 200，body {"code":-1,"success":false,"message":"分摊总额校验失败：该实际支出金额 ¥1600.00，已归因 ¥1600.00，
本次新增 ¥700.00 后合计 ¥2300.00，必须完全一致。…"}
DB 复核：ACT-1 分摊数=1（SUM 1600.00 未变）；ACT-2 分摊数=0（未变）→ 无非法 allocation 落库
```

### TEST-07 修改超额（原值保持）

```text
PUT /api/cost/allocations/79 {"amount":1700}
HTTP 200，body {"code":-1,"success":false,"message":"分摊修改后总额校验失败：该实际支出金额 ¥1600.00，
本条原分摊 ¥1600.00，修改为 ¥1700.00 后合计 ¥1700.00，必须完全一致。"}
DB 复核：id=79 amount 仍 1600.00、remark 仍 TEST-06 写入值、SUM 仍 1600.00 → 事务回滚有效，原合法值未被破坏
```

### TEST-11 重复导入（UI + 服务端双层幂等）

```text
同文件再次预览：{"batchNo":"IMP-BUDGET-20261023-206641","total":4,"duplicateCount":4,
               "alreadyImported":true,"previousBatchNo":"IMP-BUDGET-20261023-195368"}
UI alert：「该文件与此前已成功导入的批次（IMP-BUDGET-20261023-195368）内容一致，重复预算将被跳过，不会覆盖既有数据。」
UI：「确认导入」按钮 disabled（total-error-duplicate = 0）
API 强制确认（该批次）：{"inserted":0,"skipped":4,"failed":0}
API 同批次（195368，已 done）二次确认：{"inserted":4,"skipped":0,"failed":0,"duplicateConfirm":true}
DB：重复导入前 = 4 条，重复导入后 = 4 条（预算表 marker 行数未变）
```

### TEST-12/13 错误导入（逐行语义 + 批次留痕）

```text
preview: total=6, errorCount=4, duplicateCount=0
错误原因（逐字）：
  第4行预算金额不是合法金额：仅支持非负数字且最多两位小数（如 1600、1600.00）；收到「-700」
  第5行预算金额不是合法金额：仅支持非负数字且最多两位小数（如 1600、1600.00）；收到「1,600.00」
  第6行缺少必填字段「事项名称」
  第7行预算年度格式应为4位数字（如 2026）
confirm: {"batchNo":"IMP-BUDGET-20261023-209964","total":6,"inserted":2,"skipped":0,"failed":4}
DB 批次行：status=done, total_rows=6, inserted=2, failed=4, file_fingerprint 非空,
          operator_name=管理员（取自 req.user，非 body）, error_detail=上述 4 条
→ 事务边界为「逐行跳过 + 有效行落库」（部分成功），与 costService.js:1105-1130 实际代码一致
```

### TEST-16 重复提交（三层防护实证）

```text
UI 双击「提交」：POST /api/cost/requests 次数 before=1 → after=2（delta=1），列表仅 1 条新申请
UI 双击「确认导入」：POST /api/cost/budgets/import 次数 before=0 → after=1（delta=1），inserted=4 无重复
API 分摊连 POST 两次同额：首次 200（id=80）；第二次 code=-1 总额校验拒绝；DB 该实际仅 1 条分摊
审批二次同额：承诺数 1 → 1（行锁 + ON CONFLICT DO NOTHING 双保险）
后端日志佐证（逐字节选）：
  {"method":"POST","url":"/api/cost/requests","statusCode":200,...}   ← 21:46:26（申请A）
  {"method":"POST","url":"/api/cost/requests","statusCode":200,...}   ← 21:46:28（双击后仅此一条）
  {"method":"POST","url":"/api/cost/budgets/import","statusCode":200,"contentLength":"168"}  ← 确认导入仅一次
```

### TEST-15 刷新一致性（UI = API = DB）

```text
预算 marker 行：UI 10 = API keyword total 10 = DB 10
费用申请：UI 2 = API 2 = DB 2（A: approved ¥1600.00 / B: draft ¥800.00）
统计卡（UI 文案 = API = DB）：
  实际净支出合计 3200 = 3200 = 3200
  已归集分摊   3200 = 3200 = 3200
  待归因（无分摊）0 = 0 = 0
  领域：环卫作业 3200；类别：隐患整改 1600 + 未归集 1600
console error 0 / pageerror 0
```

---

## 4. BUG / 问题记录（**只记录，不修复**）

### GAP-01（P1）预算主体无手工新增入口
- **文件/位置**：`server/routes/cost/main.js:26-32`（仅 GET /budgets、POST /budgets/import-preview、POST /budgets/import，无 POST /budgets）；`src/views/objectives/cost/index.vue:389-400`（预算概览卡只有「导入预算」按钮）
- **现象**：浏览器无「新增预算」入口（实测 0）；预算只能通过 Excel 导入创建。
- **预期 vs 实际**：TEST-02 预设「点击新增→填写合法数据→保存」；实际不存在该流程，只能按页面实际存在的「新建申请」流程验收。
- **可复现**：是（打开成本页即可确认无该按钮）。

### GAP-02（P2）成本页面无搜索/筛选控件
- **现象**：页面无关键词/年度/状态任何筛选输入（实测 input/select/重置查询按钮全 0）；后端 `budgetFinancialOverview`/`costRequestList` 已支持 `keyword/budgetYear/status/sourceType`，前端未接。
- **影响**：TEST-03 只能在 API 层验证（结果正确：命中 2 / 未命中 0）。
- **可复现**：是。

### GAP-03（P1）分摊（成本归因）无管理 UI
- **现象**：`hse_cost_allocation` 的创建只能随「新建申请」（计划归因）或实际支出创建时提交；后端 `PUT/DELETE /api/cost/allocations/:id` 齐全（`main.js:55-57`），前端零入口。
- **影响**：TEST-04~09 只能经 API 触发；普通用户无法在页面修正/删除归因，归因错误只能回库改。
- **可复现**：是（页面无任何分摊区域）。

### OBS-01（P2）业务拒绝返回 HTTP 200 + body code=-1/-2
- **位置**：`server/controllers/costController.js:13`（`respond` 仅对 `error.code > 0` 设置 HTTP 状态）。
- **现象**：超额/不足/不存在/已删除/删除被拒等全部返回 **HTTP 200** + `{"success":false,"code":-1|-2}`。前端拦截器按 body 弹错（表现正常），但任何以 HTTP status 判成败的客户端/脚本会误判为成功。
- **可复现**：是（POST 一笔超额分摊，curl 可见 200 + success:false）。

### OBS-02（P2）实际支出创建不校验预算余额
- **现象**：TEST-04 中同一预算（1600）下建了两笔 1600 实际支出 → `balance=-1600`、`executionRate=200%`，接口与 UI 原样展示，无任何预警；`costService.actualCreate` 无余额检查。
- **可复现**：是。

### OBS-03（P2）计划归因金额无校验
- **现象**：TEST-06 将计划归因 1600→1800 成功，而申请金额仍为 1600，无任何一致性提示（计划归因可与申请金额不一致）。
- **可复现**：是。

### OBS-04（P2，P0-2 规则的设计后果）实际归因的「改金额」不可用
- **现象**：「追加后净额必须恰好等于实际净额」的刚性规则下，对已完整归因的实际支出，任何单条分摊的金额改动必被拒（TEST-07 实证）；要改金额只能对实际支出建 reversal 冲销后重建。PUT 的 amount 字段对实际归因实际不可操作（只能改备注等非金额字段）。
- **评价**：该规则从根本上杜绝了「半条归因/超额归因」，数据一致性优秀；但牺牲了归因修正的可用性。建议后续评估「同事务多分录联动修改」接口。

### OBS-05（P2，语义说明）删除为软删除
- 分摊删除实测为 `is_deleted=true` 软删除（非物理 DELETE）；计划归因可删，实际归因不可删（保护归因完整性）。与任务「不预设删除语义，以代码和数据库实际结果为准」一致。

---

## 5. 与任务预设的偏差说明（如实记录）

1. **TEST-02**：页面/后端均无「新增预算」流程，按页面实际存在的「新建申请」执行（GAP-01）。
2. **TEST-03**：页面无搜索筛选控件，UI 层记录缺口，API 层补充验证 keyword 行为（GAP-02）。
3. **TEST-04~09**：分摊无 UI，按任务允许的「实际 API 可触发的方式」执行，且每步均附数据库 SELECT 验证（GAP-03）。
4. **TEST-05「前端按钮禁用不是 PASS」**：本系统分摊无前端按钮；以后端拒绝 + DB 双重证据判定（超额/不足两次均拒绝，DB 零变化）。
5. **TEST-11**：重复文件预览后 UI 主动禁用「确认导入」（设计行为）；服务端幂等另以 API 强制确认 + 同批次二次确认证明。
6. **TEST-13**：未先验规定「部分成功 or 整批回滚」——以代码（逐行 continue）+ DB（2 条落库、4 条拒绝、批次留痕）判定为逐行部分成功语义。
7. **TEST-16**：UI 连点防护（loading/disabled）与后端幂等（总额校验/批次 done/唯一约束/行锁）分别实测，均无重复数据。
8. 测试脚本本身经历数次 harness 修正（token 读取方式、表格匹配列、截断 JSON 解析等），**未改任何产品代码**；最终证据轮次前后数据库均经 marker 计数核验为干净基线（成本交易表全 0、预算 339）。

---

## 6. 清理与范围确认

| 项 | 确认 |
|---|---|
| 本轮测试数据 | 全部按唯一标识（`HSE_BROWSER_ACCEPT_20261023_*` / `HBA-20261023-*` / `accept-*` / `IMP-BUDGET-20261023-*`）定向删除，先子后父；清理后 marker 与成本交易表计数全部 =0，`hse_safety_budget` 回到 339 条既有 dev 基线 |
| 是否 TRUNCATE / 批量清空 / 删真实数据 | **NO** |
| 上传的临时文件 | `server/uploads/excel/` 今日 15 个测试上传（按文件大小指纹 17555×11 / 18240×2 / 18281×2 与三个测试源文件逐一吻合后）已删 |
| 临时测试产物 | 临时 vite 配置、3 个验收脚本、独立 vite 缓存（629 文件）已删；`.accept2/evidence-*.json` 与 3 个测试 xlsx 源文件保留作证据档 |
| 生产库 safety_dashboard | **零接触**；用户既有 5876/5888/5173 进程未动 |
| 修改业务代码/SQL/测试/配置 | **NO**（仅创建后删除了一次性测试 harness 文件） |
| commit / push / merge / 迁移 | **NO / NO / NO / NO** |

---

## 7. 最终结论

# PASS WITH ISSUES

**核心业务闭环通过**：真实浏览器操作 → 真实 API → 真实 Service → 真实数据库 → F5 刷新重读，四层全部一致，具体包括：页面加载、费用申请新增（事务内含计划归因）、分摊新增（一次补齐）、分摊不足/超额拦截（后端拒绝 + DB 零变化）、分摊修改（计划归因改金额/实际归因改字段）、分摊修改超额（拒绝且原值保持）、分摊删除（软删除语义 + 归因完整性保护）、不存在/已删除 ID 拒绝、Excel 预览→确认全流程、重复导入双层幂等（UI 禁用 + 服务端跳过 + duplicateConfirm）、错误导入逐行拒绝与批次留痕、修正后重新导入、刷新一致性（UI=API=DB）、重复提交多层防护（UI loading + 总额校验 + 批次 done + 唯一约束 + 行锁）、测试数据完全清理。Console 全程零未捕获异常。

**存在明确非阻断问题（全部只记录未修复）**：2 个 P1 功能缺口（GAP-01 预算无手工新增入口、GAP-03 分摊无管理 UI）、1 个 P2 搜索筛选缺口（GAP-02）、HTTP 200 语义问题（OBS-01）、实际支出不校验预算余额（OBS-02）、计划归因金额无校验（OBS-03）、实际归因改金额不可用（OBS-04）。

**建议**：进入最终代码审查与合并评估前，优先拍板 GAP-01/GAP-03 是否属于本期范围（若属于，需补前端入口与 `POST /api/cost/budgets` 后再验收）；OBS-01 建议下轮将业务拒绝映射为 4xx，降低接入方误判风险。
