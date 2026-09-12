# HSE Dashboard 现场管理模块优化 - WorkBuddy 执行指令

> **版本**: v1.0  
> **日期**: 2026-08-04  
> **审核人**: 项目架构师  
> **执行优先级**: P0 (最高)

---

## ⚠️ 强制工作流程（必须遵守）

### 第二条规则（最高优先级）
**每次完成任何代码修改动作后，必须生成一份 Markdown 格式的总结报告，保存到 `g:\hse-dashboard\docs\sprint-reports\` 目录下，文件命名格式为 `Sprint_YYYYMMDD_HHMM_动作摘要.md`**。

报告必须包含以下章节：
1. **本次修改概述** - 200字以内说明做了什么
2. **修改文件清单** - 列出所有改动的文件路径及改动内容摘要
3. **关键代码变更** - 粘贴核心变更代码片段（不超过50行）
4. **测试验证结果** - 说明如何验证功能正常
5. **待确认问题** - 列出需要用户决策的问题（如有）
6. **下一步建议** - 建议接下来做什么
7. **风险评估** - 本次改动可能引入的风险点

**注意**：完成报告后停止工作，等待审核指令后再继续下一步。不要一次性做完所有功能！

---

## 项目技术栈概览

| 层级 | 技术选型 | 关键文件位置 |
|------|---------|-------------|
| 前端框架 | Vue 3 + TypeScript + Vite | `安全看板vben/apps/web-antd/` |
| UI框架 | Ant Design Vue + Vben Admin v5.7.0 | `安全看板vben/apps/web-antd/src/` |
| 状态管理 | Pinia + Composition API | `安全看板vben/apps/web-antd/src/composables/` |
| 表格方案 | VXE-Table适配器 + 自定义useDataTable | `src/composables/hse/useDataTable.ts` |
| 后端 | Node.js + Express + PostgreSQL | `server/` |
| Excel处理 | xlsx (SheetJS) | `server/utils/excel.js` |
| 包管理器 | pnpm (monorepo) | 根目录 `pnpm-workspace.yaml` |

---

## 任务一：网格管理页面表格列调整

### 需求描述
修改 `安全看板vben/apps/web-antd/src/views/inspection/grid/index.vue`

### 具体要求

1. **隐藏表头三列**：
   - 隐藏"所属乡镇" (`township`) 列
   - 隐藏"风险等级" (`riskLevel`) 列
   - 隐藏"联系电话" (`phone`) 列
   - **注意**：只是表格列不显示，数据字段保留，新增/编辑表单中这些字段仍保留
   - 详情抽屉（Drawer）中这些字段仍正常显示

2. **表格scroll宽度调整**：
   - 由于减少了3列，`scroll.x` 从1700调整为合适值（估算：1700 - 320 = 1380左右）

3. **参考实现**：
   - 三违管理页面使用了 `useTableColumnSettings` 支持列拖拽和显示/隐藏，但网格管理暂不需要这么复杂
   - 直接从 `columns` 数组中移除这三列的定义即可（最简单方案）
   - 如后续需要列显示设置，可参考三违管理的实现方式

---

## 任务二：筛选器优化 - 增加年月筛选 + 动态选项

### 需求描述
升级网格管理的筛选器，参考三违管理（`views/violations/index.vue`）的实现模式。

### 具体要求

1. **重构筛选器架构**（重要！）：
   - 将网格管理从旧的手动 `ref/reactive` 模式升级为使用项目标准 composables：
     - `useDataTable` - 管理分页和数据获取
     - `useSearchForm` - 管理搜索表单状态
   - **参考三违管理页面的实现方式**（`views/violations/index.vue` 第531-576行）

2. **新增筛选字段**：
   - 增加"年"筛选器：Select下拉，选项动态生成
   - 增加"月"筛选器：Select下拉，选项动态生成
   - 年月筛选逻辑：根据导入的检查记录数据，提取已有数据的年份和月份，作为下拉选项
   - 默认不选择（查询全部）

3. **筛选器选项动态化**：
   - "网格级别"：从表格现有数据中提取去重值作为选项（不要硬编码）
   - "所属乡镇"：从表格现有数据中提取去重值作为选项（不要硬编码`['宁津镇', '柴胡店镇', '时集镇', '保店镇']`）
   - "状态"：从表格现有数据中提取去重值作为选项
   - **实现方式参考**：三违管理的 `fetchFilterOptions()` + `getViolationFilterOptions()` API模式

4. **后端API支持**：
   - 新增后端接口 `GET /api/site-mgmt/grid-areas/filter-options`
   - 返回格式：`{ gridLevels: string[], townships: string[], statuses: string[], years: number[], months: number[] }`
   - 从数据库/内存数据中动态聚合出这些选项

5. **API层更新**：
   - 更新 `src/api/hse/site.ts` 中的 `GridAreaListParams` 接口，增加 `year?`、`month?` 参数
   - 新增 `getGridAreaFilterOptions()` API函数

---

## 任务三：下载模板定制

### 需求描述
根据用户即将上传的Excel表格，定制网格管理的导入模板。

### 前置依赖
- 用户会上传一个Excel文件给你
- **收到文件后，首先读取该Excel文件，解析其表头结构**
- 使用 `xlsx` 库读取文件的Sheet名和第一行（表头行）

### 具体要求

1. **模板字段定义**：
   - 严格按照用户上传的Excel表格的列顺序、列名来定义模板
   - 模板格式：CSV或XLSX（优先XLSX，参考 `server/utils/excel.js`）
   - 注意处理中文编码（CSV需加BOM头 `\uFEFF`）

2. **后端模板下载接口**：
   - 接口路径：`GET /api/import/template/grid`
   - 返回：正确格式的模板文件blob
   - 文件命名：`网格管理导入模板_YYYYMMDD.xlsx`

3. **前端兜底模板更新**：
   - 更新 `src/components/hse/ImportButtonGroup.vue` 中 `moduleHeaders.grid` 的字段列表
   - 与后端模板保持一致
   - 后端接口失败时仍能生成正确的兜底模板

4. **注意**：
   - 模板中必须包含"姓名"列（用于完成率计算）
   - 必须包含"检查日期"或类似日期字段（用于年月筛选和完成率计算）
   - 必须包含能关联到网格/人员的字段

---

## 任务四：导入数据与完成率计算（核心业务逻辑）

### 需求描述
导入检查记录数据后，根据每个人员的实际检查次数与巡查频率，自动计算完成率。

### 业务规则理解

**巡查频率映射表**（来自网格表的 `patrolFrequency` 字段）：

| 巡查频率 | 月应检查次数 | 日应检查次数 | 说明 |
|---------|------------|------------|------|
| 每日一次 | 约30次/月 | 1次/天 | 按当月实际天数 |
| 每日两次 | 约60次/月 | 2次/天 | 按当月实际天数×2 |
| 每周一次 | 约4次/月 | - | 每月4次 |
| 每周两次 | 约8次/月 | - | 每月8次 |
| 每月一次 | 1次/月 | - | 每月1次 |

> **待确认**：上述频率对应次数如与实际业务不符，需在报告中提出，等待用户确认。

### 完成率计算公式

```
完成率 = (该人员在筛选时间范围内的实际检查记录条数 / 该时间段内应检查次数) × 100%

计算规则：
1. 按"姓名"字段汇总该人员的检查记录条数
2. 根据筛选的年月确定时间范围：
   - 年仅选：如2026年 → 全年12个月的应检查次数总和
   - 年仅选+月选：如2026年8月 → 当月应检查次数
   - 年均未选：默认计算当月（当前系统月份）
3. 应检查次数 = 根据巡查频率 × 时间跨度
4. 完成率上限100%（超过100%按100%显示）
5. 无检查记录的完成率为0%
```

### 具体实现要求

1. **数据库设计**：
   - 新建数据表 `grid_inspection_records`（网格检查记录表）存储导入的检查数据
   - 字段参考用户上传的Excel表头设计
   - 必须字段：`id`, `personnel_name`(姓名), `inspection_date`(检查日期), `grid_id`(关联网格,可空), `created_at`, `updated_at`
   - 编写SQL迁移脚本保存到 `server/sql/`

2. **后端导入逻辑**：
   - 扩展网格导入功能，支持将检查记录导入到 `grid_inspection_records` 表
   - 导入时进行数据校验：姓名非空、日期格式正确
   - 导入完成后，触发完成率重算

3. **完成率计算服务**：
   - 新建 `server/services/gridCompletionService.js`
   - 函数 `calculateCompletionRate(gridId, year, month)`：
     - 查询该网格负责人的巡查频率
     - 统计该人员在指定年月的检查记录数
     - 根据频率计算应检查次数
     - 返回完成率数值
   - 批量重算函数 `recalculateAllCompletionRates(year, month)`

4. **列表API改造**：
   - 获取网格列表时，动态计算每个网格的完成率（不要读静态字段）
   - 支持按年月筛选时，返回该时间范围的完成率
   - 平均完成率统计值也需根据筛选条件动态计算

5. **前端展示**：
   - 表格中"完成率"列使用Progress组件展示（保持现状）
   - 进度条颜色：<60%红色，60-80%橙色，80-100%绿色（如未实现请加上）
   - 统计卡片"平均完成率"显示筛选范围内的平均值

---

## 任务五：网格管理与三违管理数据交互预留接口

### 需求描述
在网格管理和三违管理之间预留数据交互接口，供后期优化使用。本次不需要实现完整交互，只预留扩展点。

### 具体要求

1. **人员关联字段确认**：
   - 确认三违表中 `violator_name`/`violator_id` 与网格表中负责人姓名字段的对应关系
   - 确认两者是否通过员工主数据表（`employees`表）关联

2. **预留后端接口**：
   - 新建接口 `GET /api/site-mgmt/grid-violation-summary`
   - 参数：`gridId?`, `year?`, `month?`
   - 返回：指定网格/人员在指定时间范围内的三违统计
     ```json
     {
       "gridId": 1,
       "gridName": "xxx网格",
       "personnelName": "张三",
       "violationCount": 3,
       "violationByType": { "违章指挥": 1, "违章作业": 2 },
       "highRiskCount": 1
     }
     ```
   - 本次先写接口框架，返回mock数据即可，注释中标记 `// TODO: 后期实现真实数据关联`

3. **前端预留入口**：
   - 在网格管理表格操作列，增加一个"三违记录"按钮（使用 `lucide:alert-triangle` 图标）
   - 点击后弹出Modal或Drawer，调用上述预留接口展示数据
   - 本期展示简单文字："该功能正在开发中，敬请期待" + 显示mock的三违数量
   - 预留好扩展位置，后期可替换为真实统计图表

4. **代码标记**：
   - 所有预留代码处必须加注释 `// TODO[GRID_VIOLATION_INTERACT]: 预留网格-三违交互，后期实现`
   - 便于后期搜索定位

---

## 参考文件清单（请先阅读这些文件）

### 必读前端文件（按优先级）
1. `安全看板vben/apps/web-antd/src/views/violations/index.vue` - 三违管理（最佳实践参考）
2. `安全看板vben/apps/web-antd/src/composables/hse/useDataTable.ts` - 表格数据管理
3. `安全看板vben/apps/web-antd/src/composables/hse/useSearchForm.ts` - 搜索表单管理
4. `安全看板vben/apps/web-antd/src/components/hse/ImportModal.vue` - 通用导入弹窗
5. `安全看板vben/apps/web-antd/src/components/hse/ImportButtonGroup.vue` - 导入按钮组
6. `安全看板vben/apps/web-antd/src/api/hse/violations.ts` - 三违API封装（参考模式）
7. `安全看板vben/apps/web-antd/src/api/hse/site.ts` - 现场管理API

### 必读后端文件
1. `server/routes/violations.js` - 三违管理完整路由（含数据库操作、统计、导入导出）
2. `server/routes/site-mgmt.js` - 现场管理现有路由
3. `server/utils/excel.js` - Excel处理工具
4. `server/config/db.js` - 数据库连接
5. `server/middleware/response.js` - 统一响应格式

### 学习要点
- 观察三违管理如何使用 `useDataTable` + `useSearchForm` 简化代码
- 观察三违管理如何实现 `fetchFilterOptions` 动态筛选选项
- 观察三违管理如何实现导入功能（使用ImportModal组件）
- 观察后端如何实现PostgreSQL查询 + 内存降级双模式
- 代码风格：使用TypeScript类型定义，async/await，统一错误处理

---

## 开发规范

### 代码风格
- 前端：Vue 3 `<script setup lang="ts">` 风格，使用Composition API
- 后端：CommonJS模块，async/await，统一try/catch
- 命名：camelCase（JS/TS），snake_case（数据库字段）
- 注释：关键逻辑必须加注释，TODO标记格式统一

### Git提交规范
完成每个任务后提交：
```
feat(site): 任务简述

- 具体改动1
- 具体改动2
```

### 测试要求
1. 每个功能完成后，本地启动前端和后端验证
2. 前端启动：在 `安全看板vben/` 目录执行 `pnpm dev`
3. 后端启动：在 `server/` 目录执行 `npm run dev`（或查看package.json）
4. 测试网格管理页面：
   - 列是否正确隐藏
   - 年月筛选器是否出现
   - 筛选选项是否为动态值
   - 下载模板是否正确
   - 导入功能是否正常
   - 完成率是否正确计算
   - 三违记录按钮是否出现

---

## 分阶段执行建议（每阶段后生成报告等待审核）

| 阶段 | 任务内容 | 预计工时 |
|------|---------|---------|
| 阶段1 | 任务一（隐藏列）+ 任务二（筛选器升级框架） | 先做这个 |
| 阶段2 | 任务二（动态选项+API）+ 后端筛选选项接口 | 阶段1审核后 |
| 阶段3 | 任务三（模板定制，需等待用户上传Excel） | 用户给文件后 |
| 阶段4 | 任务四（数据表+导入逻辑+完成率计算核心） | 模板确认后 |
| 阶段5 | 任务四（前端展示+联调） | 后端完成后 |
| 阶段6 | 任务五（预留交互接口） | 最后做 |

**注意**：不要跨阶段开发！每个阶段完成后生成报告，等待审核指令再进入下一阶段。

---

## 需要用户确认的问题清单

开发过程中如遇到以下问题，请在报告中列出等待决策：

1. **巡查频率换算标准**：每周一次是按4次/月还是按实际周数计算？每日一次是否需要考虑节假日/周末？
2. **完成率计算时间范围默认值**：未选年月时，默认显示当月还是本年累计？
3. **导入数据是增量还是全量**：每次导入是追加数据还是覆盖？
4. **一个网格对应多个检查人员怎么办**：目前假设一个网格一个负责人，是否需要支持多人？
5. **三违交互预留接口的展示形式**：弹窗中需要展示哪些字段？是否需要图表？

---

## 报告提交要求

完成任何修改后，立即：
1. 生成Markdown报告到 `g:\hse-dashboard\docs\sprint-reports\` 目录
2. 报告中如实记录遇到的问题
3. 停止工作，等待下一步指令

**祝开发顺利！有不确定的地方及时在报告中提出，不要擅自做决定。**
