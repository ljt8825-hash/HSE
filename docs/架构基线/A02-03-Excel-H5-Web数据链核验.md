# A02-03-03｜Excel / H5 / Web 数据链核验

> 审计对象：隐患数据的全部写入与读取通道
> 审计方式：**只读**。原始 Excel 逐列比对 + 导入器新旧版本对照（`git show`）+ 前端页面检索 + 数据库写入痕迹核对
> 目的：把「数据从哪进、进了哪些列、丢了哪些列、谁还能补」钉死。
> CODE CHANGE = 0 / DDL = 0 / DML = 0 / CONFIG CHANGE = 0 / PRODUCTION CHANGE = 0。

---

## 1. 一句话结论

> **隐患数据只有一条真实通道：Excel 导入。H5 明确排除隐患，Web 通道代码完整但从未写入。**
> **导入器在 2026-08-24 那次导入时，白名单是"全部列"且 `statusMap` 生效；2026-10-24 之后才改成 8 列白名单 + 服务端注入。**
> **换言之：现在库里的 60 条 `closed`，是旧版导入器把 Excel 的「是」写成「已完成」后又被迁移脚本改名的结果。新版导入器不会再产生这个值。**

---

## 2. 数据链全图（实测，含时间点）

```text
【1】8 份月度原始台账（.xlsx / .xls）
     2月4 / 3月9 / 4月4 / 4月清明14 / 5月2 / 6月66 / 7月11 / 1月0
        │  ← 本机仅存 6 月那 1 份（8 列 66 行）
        │  ← 加工环节：合并 + 新增「月份」「来源文件」「备注」3 列 + 剔除 17 行模板占位
        ▼
【2】汇总表 2026年安全生产隐患排查登记表.xlsx（11 列 110 行 + 分析摘要 + 数据来源清单）
        │  ← 8 个副本并存，5 个有 file_records（311~315）
        │  ← 22 条「是否整改完成」在此环节由「是」变为空
        ▼
【3】POST /api/import/parse → services/importShared.js parseExcelNative()
        │  ← fieldMapping 9 列（序号/隐患描述/整改措施/检查时间/检查人员/整改人员/整改时间/是否整改完成/备注）
        │  ← 2026-08-24 时点：无 dbColumns 白名单 + statusMap{'是':'已完成'} 生效
        ▼
【4】POST /api/import/confirm → services/importExcelService.js confirmImportNative()
        │  ← conflictKey='description' 判重
        │  ← INSERT 110 行（2026-08-24 23:36:23，跨度 0.17 秒）
        ▼
【5】hazards 110 行
        │  status = 「已完成」60 / NULL 50
        ▼
【6】2026-10-24  脚本 p3-04-02-migrate-legacy-status.js（不写 updated_at）
        │  「已完成」→ closed  60
        │  NULL → discovered   50
        ▼
【7】hazards 终态：closed 60 / discovered 50
```

---

## 3. 关键证据：导入器的版本差异（本轮最重要的发现）

A02-02 曾记录「`statusMap` 已移除」。本轮通过 `git show` 确认**移除时间晚于导入时间**，因此必须区分版本：

### 3.1 旧版（2026-08-24 导入时，提交 `69c0d18` 及之前）

```js
// git show 69c0d18:server/services/importShared.js:460-479
hazards: {
  targetTable: 'hazards',
  conflictKey: 'description',
  fieldMapping: {
    '序号': 'no', '隐患描述': 'description', '整改措施': 'measure',
    '检查时间': 'hazard_date', '检查人员': 'checker', '整改人员': 'fixer',
    '整改时间': 'fix_date', '是否整改完成': 'status', '备注': 'remark',
  },
  statusMap: { '是': '已完成', '否': '未完成' },   // ← 生效中
}
```

| 特征 | 旧版 |
|---|---|
| `dbColumns` 白名单 | ❌ **不存在**（`Object.keys(firstItem)` 全列落库） |
| `status` 是否落库 | ✅ **落库**，且经 `statusMap` 转换 |
| Excel「是」的结果 | `status = '已完成'` |
| Excel 空的结果 | `status = NULL`（未传值） |
| `updated_at` 是否被写入 | 否（INSERT 默认） |

### 3.2 新版（2026-10-24 之后，提交 `d0066c4`）

```js
// 当前 importShared.js:460-491
dbColumns: ['no','hazard_date','description','measure','checker','fixer','fix_date','remark'],
// 注释原文：「隐患生命周期状态严禁由 Excel 决定」
// statusMap 已整体删除
```

```js
// importExcelService.js:1276
const insertConstants = (moduleType === 'hazards') ? { status: HAZARD_STATUS.DISCOVERED } : {};
```

| 特征 | 新版 |
|---|---|
| `dbColumns` 白名单 | ✅ 8 列，**显式排除 `status`** |
| `status` 来源 | **服务端常量 `discovered`** |
| Excel「是」的结果 | **无影响**（值在清洗阶段删除，仅用于识别表头） |
| UPDATE 分支 | 仍只用白名单，**不注入 status** ⇒ 重导入不会把 `closed` 打回初始态 |

### 3.3 时间线对照

| 时间 | 事件 | 证据 |
|---|---|---|
| 2026-08-24 23:36:10 | 315 上传 | `file_records.created_at` |
| 2026-08-24 23:36:23 | 110 行 INSERT | `hazards.created_at`（仅 2 个不同值） |
| （8-24 ~ 10-24 之间） | `p3-04-02` 迁移执行 | 表内已无「已完成」，全部为 `closed`/`discovered` |
| 2026-10-24 | F-03 修复提交（`d0066c4`） | `git log -- server/services/importShared.js` |

> **结论：8-24 那次导入走的是旧版代码，`status` 由 Excel 决定。**
> **这是 60 条 `closed` 唯一的产生路径，且该路径已于 2026-10-24 被代码封堵。**

### 3.4 迁移脚本的护栏数字印证了这一点

`p3-04-02-migrate-legacy-status.js` 在跑之前做硬断言：

```js
if (fpBefore.done_zh !== EXPECTED_DONE) fail(...)      // 预期 60
if (fpBefore.null_status !== EXPECTED_NULL) fail(...)   // 预期 50
if (distBefore.length !== 2) fail('出现第三种状态取值')
```

| 断言 | 要求 | 现状 |
|---|---|---|
| `done_zh`（`status='已完成'` 行数） | **60** | 与原始台账 60 个「是」**精确相等** |
| `null_status` | **50** | 与原始台账 50 个空值**精确相等** |
| 状态取值种类 | 恰好 2 种 | 「已完成」+ NULL |

> **迁移前的状态分布 = Excel「是否整改完成」的值的 1:1 投影。**
> 这从第三方向证明：`status` 当时完全由 Excel 决定，**服务端没有任何判断**。

---

## 4. Excel 导入链逐层核验

### 4.1 入口

| 层 | 实现 | 证据 |
|---|---|---|
| 前端 | `views/hazards/index.vue:255` `useGenericImport('hazards')` | 已接线 |
| API | `api/import.ts` → `POST /api/import/parse`、`/confirm` | — |
| 挂载 | `app.js:409` `app.use('/api/import', importRoutes)` | 已挂载 |
| 解析 | `importShared.js` `parseExcelNative()` | 表头识别 `findHeaderRow` |
| 落库 | `importExcelService.js` `confirmImportNative()` | 批量 100/批 + 逐条降级 |

### 4.2 原始列 → 数据库列（110 行逐行验证）

| Excel 列 | `fieldMapping` | 旧版落库 | 新版落库 | 实测一致率 |
|---|---|---|---|---|
| 月份 | ❌ 无映射 | ❌ | ❌ | — |
| 来源文件 | ❌ 无映射 | ❌ | ❌ | — |
| 序号 | `no` | ✅ | ✅ | 110/110 |
| 隐患描述 | `description` | ✅ | ✅ | 109/110（1 条被改写） |
| 整改措施 | `measure` | ✅ | ✅ | 110/110 |
| 检查时间 | `hazard_date` | ✅ | ✅ | 110/110 |
| 检查人员 | `checker` | ✅ | ✅ | 110/110 |
| 整改人员 | `fixer` | ✅ | ✅ | 97 非空，值原样 |
| 整改时间 | `fix_date` | ✅ | ✅ | 69 非空，0 不一致 |
| 是否整改完成 | `status` | ✅ **经 statusMap** | ❌ **丢弃** | 60「是」→ closed |
| 备注 | `remark` | ✅ | ✅ | **36 非空 → DB 0 条有效值** |

### 4.3 被丢弃的字段（任务书要求逐项说明）

| 丢弃项 | 条数/列数 | 原因 | 代码/证据 |
|---|---:|---|---|
| 「月份」列 | 110 行 | **`hazards` 表无对应字段**，`fieldMapping` 也未映射 | 46 列清单中无 month 类字段 |
| 「来源文件」列 | 110 行 | 同上 | — |
| 「是否整改完成」列 | 110 行 | 新版：`dbColumns` 排除 status，值在清洗阶段删除 | `importShared.js:483` + 注释 |
| 备注 `[含现场照片]` | 34 条 | 清洗后为空 / 未保留 | 见 §4.4 |
| 备注 `不使用，收纳库房` | 1 条 | 同上 | id=154 |
| 备注 `暂时无法整改` | 1 条 | 同上 | id=212 |

### 4.4 备注为什么消失（本轮新查证）

| Excel 备注 | 条数 | DB 实际值 |
|---|---:|---|
| `[含现场照片]` | 34 | `NULL` |
| `不使用，收纳库房` | 1 | `NULL` |
| `暂时无法整改` | 1 | `NULL` |
| 空 | 74 | 72 条 `NULL` + 2 条 `''`（空串，id=233/234） |

> **观测到的模式：有值的 36 条全部变 `NULL`，无值的 74 条中有 2 条反而是空串。**
> 这说明备注列在清洗/写入阶段被**统一置空**，而不是"按值过滤"。
> 具体实现路径未能在代码中定位到单一函数（`remark` 在 `dbColumns` 内，理论上应原样写入）⇒ **标 UNKNOWN，不推断**。
> 但**结果确定**：`hazards.remark` 无法承载原始台账的备注信息。

### 4.5 幂等与重复导入风险

| 项 | 值 | 风险 |
|---|---|---|
| `conflictKey` | **`description`**（长文本） | 描述轻微改写即产生新行 |
| 唯一描述数 | 109 / 110 | 1 组重复（id 152/209，跨 4 月/6 月） |
| 已发生的人为改写 | 1 条（`卸料口平台警示标识老化` → `...围栏警示标识老化`） | 用原始措辞重导会重复插入 |
| 无业务唯一键 | `no` 月内重置（66 个不同值） | 无法与外部台账行号对齐 |
| 无导入批次列 | 无 `import_job_id` 落到 hazards | 无法区分哪行来自哪次导入 |

**10 次上传记录（`file_records.module_type='hazards'`）：**

| id | 原始文件名 | 大小 | status | 时间 | 盘 |
|---:|---|---:|---|---|---|
| 81 | 6月安全生产隐患排查登记表.xlsx | 15,577 | imported | 2026-07-18 10:07:25 | F |
| 82 | 6月安全生产隐患排查登记表.xlsx | 15,577 | imported | 2026-07-18 10:07:35 | F |
| 83 | 6月安全生产隐患排查登记表.xlsx | 15,577 | imported | 2026-07-18 10:12:00 | F |
| 93 | 6月安全生产隐患排查登记表.xlsx | 15,577 | parsed | 2026-07-19 16:31:36 | F+G |
| 103 | 6月安全生产隐患排查登记表.xlsx | 15,577 | imported | 2026-07-19 16:47:32 | F+G |
| 311 | hazards_test.xlsx | 17,330 | parsed | 2026-08-24 23:29:09 | G |
| 312 | 2026年安全生产隐患排查登记表.xlsx | 17,330 | parsed | 2026-08-24 23:32:08 | G |
| 313 | hazards_test.xlsx | 17,330 | parsed | 2026-08-24 23:33:53 | G |
| 314 | _hazards_demo.xlsx | 17,330 | parsed | 2026-08-24 23:34:54 | G |
| **315** | **2026年安全生产隐患排查登记表.xlsx** | 17,330 | **imported** | **2026-08-24 23:36:10** | G |

**关键差异：7 月那 5 次上传的是「6月表」（15,577 B / 8 列 / 66 行），8-24 那 5 次上传的是「全年版」（17,330 B / 11 列 / 110 行）。**

| 问题 | 事实 | 能否定论 |
|---|---|---|
| 7 月导入的 66 条去哪了 | 表内 110 行 `created_at` 全部 8-24，无 7 月痕迹 | ❌ 无法区分"删除重建"与"冲突键判重后 UPDATE"（`import_logs` 33 行无写入方） |
| 7 月导入时 status 是什么 | 若走旧版且「是」→「已完成」 | ✅ 逻辑可推，但无 7 月数据残留可验 |
| 8-24 的 4 次 `parsed` 为何未入库 | 只解析未确认 | 正常流程 |
| 文件名含 `hazards_test` / `_hazards_demo` | 2 次是测试文件 | 均 `parsed`，未入库 |

---

## 5. H5 通道：明确排除隐患（不是"没找到"，是"设计上不做"）

### 5.1 检索结果

| 检索范围 | 命中数 | 内容 |
|---|---:|---|
| `views/mobile/**`（13 页） | **2** | 均为**排除声明**，无任何 API 调用 |
| `views/mw/**`（12 页 WPS 实验壳） | **0** | — |
| `views/mw/__tests__`（测试） | 3 | `submitRectify(..., '已整改')` 属 WPS 台账域，非 `hazards` |

**2 处命中的原文：**

```text
views/mobile/inspection/issue.vue:7
  * 其余问题类型（隐患/设备故障等）不在本阶段范围，走 PC 端 HSE 系统，

views/mobile/inspection/issue.vue:70
  <p class="others__label">其他问题类型（隐患、设备故障等）</p>
```

### 5.2 逐项回答

| 问题 | 回答 | 证据 |
|---|---|---|
| H5 是否读取 `hazards`？ | ❌ 否 | 13 页 0 处 API 调用 |
| H5 是否新增/更新 `hazards`？ | ❌ 否 | 同上 |
| H5 能否提供 `deadline`？ | ❌ 否 | — |
| H5 能否提供整改完成时间？ | ❌ 否 | — |
| H5 能否提供复查结果？ | ❌ 否 | — |
| H5 能否补充台账缺项？ | ❌ 否 | 明确"走 PC 端 HSE 系统" |

> **H5 当前不写该事实，且代码注释与页面文案都明确把隐患指向 PC 端。**
> H5 实际只有 2 个写接口：`POST /api/site-mgmt/grid-records`、`POST /api/violations`。

---

## 6. Web 通道：代码完整、权限齐备、**零写入**

### 6.1 写入端点 8 个（全量）

| # | 端点 | 权限 | 写入列 | 实际执行过 |
|---:|---|---|---|---|
| 1 | `POST /api/hazards` | `hse:hazard:create` | 20 列（含 status='discovered' 常量） | ❌ |
| 2 | `PUT /api/hazards/:id` | `hse:hazard:update` | 白名单 21 列；**禁写** status / review_* | ⚠️ 2 行 `updated_at` 变化，无法归因 |
| 3 | `DELETE /api/hazards/:id` | `hse:hazard:delete` | `is_deleted` | ❌（全 false） |
| 4 | `PUT /api/hazards/:id/rectify` | `hse:hazard:update` | status/`corrector_id`/`rectification`/`rectify_date` | ❌ |
| 5 | `PUT /api/hazards/:id/submit-review` | `hse:hazard:update` | status | ❌ |
| 6 | `PUT /api/hazards/:id/review` | `hse:hazard:review` | status/reviewer_id/review_result/review_date + `INSERT hse_reviews` | ❌ |
| 7 | `PUT /api/hazards/:id/close` | `hse:hazard:update` | status='closed'/rectification | ❌ |
| 8 | `POST /api/risk-control/:id/generate-hazard` | — | 11 列 + `risk_hazard_links` | ❌ |

### 6.2 零写入的六项硬证据

| 证据 | 观测值 | 推出的结论 |
|---|---|---|
| `hse_events` 中 `source_table='hazards'` | **0 条**（16 条全为 accidents） | `create()` 内的 `hseEventSync.syncHazard()` 从未执行 |
| `status='processing'` | **0 行** | `rectify()` 从未执行 |
| `status='pending_review'` | **0 行** | `submitReview()` 从未执行 |
| `rectification` 非空 | **2 / 110**（值均为「未整改」） | 非 `rectify()` 写入 |
| `rectify_date` / `corrector_id` / `reviewer_id` | **0 / 0 / 0** | 状态机从未启动 |
| `related_risk_id` | **0 / 110** | `generate-hazard` 从未执行 |

> **判定：Web 通道是"完整但空闲"的通道。110 行的所有字段值都能由 Excel + 迁移脚本解释，无需引入任何 Web 写入假设。**

### 6.3 Web 表单的结构性缺口

| 缺口 | 证据 |
|---|---|
| 无"期限日期"输入项 | `views/hazards/index.vue` 只有 `deadlineDays`（默认 30），无绝对日期 |
| 后端从不写 `deadline`/`deadline_date` | `create()` 只写 `deadline_days` |
| 分类维表单字段无对应数据 | `hazard_type`/`grid_id`/`location` 有表单，但 110 行全空或近全空（`location` 2/110） |
| 责任人必须选 ID | 表单需 `responsibleId`，而导入路径永远不写 ⇒ 现网数据无法通过 Web 编辑补全责任人 |

---

## 7. B 模型与 C 模型的数据链（本轮只核可达性）

| 模型 | 后端路由 | 挂载 | 前端调用方 | 数据 |
|---|---|---|---|---|
| B `hazard_record` + 3 表 | `/api/hse/hazard-rectification` | ✅ `app.js:505` | **❌ 0 处**（`grep hazard-rectification` 在 `views/` 与 `api/` 均 0 命中） | 9 / 0 / 1 / 1 |
| C `hse_rectifications` | 无独立路由（经 `hse-tasks` 间接） | ⚠️ `app.js:459` | ❌ 0 处 | 0 |
| C `hse_reviews` | 经 `hazards/review` 事务 | ✅ | ✅ 已接线但从未执行 | 0 |

> **B 模型有后端 API、没有前端页面** —— 这是 A02-01「页面已建」表述的修正：B 模型的页面在当前前端仓库中**不存在调用**，只有后端路由存活。

---

## 8. 数据链问题清单（只记录，不修复）

| # | 问题 | 证据 | 影响 |
|---:|---|---|---|
| 1 | **加工环节清空 22 条「是」** | 原始 6 月表 66/66「是」vs 汇总表 44「是」+22 空 | 系统"未整改"被高估 22 条 |
| 2 | 备注列整体丢失 | Excel 36 非空 → DB 0 条有效值 | `暂时无法整改` 等关键说明不可见 |
| 3 | 「月份」「来源文件」未入库 | 11 列 → 8 列落库 | 无法追溯源文件；只能靠 `hazard_date` 反推月份 |
| 4 | `status` 曾由 Excel 决定 | 旧版 `statusMap{'是':'已完成'}`，10-24 才移除 | 已封堵，但历史 60 条的分类依据是 Excel |
| 5 | `conflictKey='description'` | 1 条描述被改写（加"围栏"2 字） | 重导会产生重复行 |
| 6 | `no` 月内重置 | 110 行仅 66 个唯一值 | 不能做业务键 |
| 7 | 7 月批次导入痕迹消失且无审计 | `import_logs` 33 行无写入方 | 无法追责/复盘 |
| 8 | 无导入批次字段落库 | `hazards` 无 `import_job_id` | 无法区分行来源批次 |
| 9 | `NULL` 与 `''` 混用 | `remark` 108 NULL + 2 空串 | `IS NOT NULL` 会误命中 |
| 10 | 7 个月份原件缺失 | 仅 6 月表在 F/G 盘 | 44 条无法回溯原始台账 |

---

## 9. 本章判定

```text
IMPORT PATH = 已核实
  入口 /api/import/{parse,confirm} → importShared.parseExcelNative → importExcelService.confirmImportNative
  实际落库 1 次（file_records.id=315，2026-08-24 23:36:10 → 23:36:23）
  原始 11 列 → 落库 8 列；丢弃 月份 / 来源文件 / 是否整改完成(新版)
  备注 36 非空 → 0 条有效值
  版本差异：8-24 导入用旧版（statusMap 生效、无白名单），10-24 后改新版（8 列白名单 + 服务端注入）

H5 READ/WRITE = 已核实（不存在）
  views/mobile 13 页 0 处 hazards 调用；2 处命中均为"隐患走 PC 端"的排除声明

WEB READ/WRITE = 已核实（读有、写零）
  8 个写入端点全部可达、前端已接线
  零写入六证：hse_events 0 条 / processing 0 / pending_review 0 / rectify_date 0 / reviewer_id 0 / related_risk_id 0

B 模型 = 后端路由已挂载（app.js:505），前端 0 处调用
C 模型 = 无独立路由，hse_reviews 仅经 hazards/review 事务（从未执行）

数据链定性 =
  唯一真实来源 = Excel 导入
  唯一状态来源 = Excel「是否整改完成」（旧版）→ 迁移改名
  服务端从未对任何一条隐患做过"整改/复查/关闭"判断

CODE CHANGE = 0   DDL = 0   DML = 0   CONFIG CHANGE = 0   PRODUCTION CHANGE = 0
```
