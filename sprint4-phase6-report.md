# HSE V2 Sprint4 Phase6 开发报告 — 安全生产标准化自评报告生成

## 一、阶段概述

**阶段目标**：基于人工确认后的标准化评价结果，生成安全生产标准化自评报告。

**严格约束**：
- ✅ 报告必须基于人工确认后的评价结果（`compliance_status != 'pending'`）
- ✅ 禁止直接读取 `ai_verdict`（AI 判定结果不进入报告）
- ✅ pending 条款不会进入报告
- ✅ 禁止自动认证
- ✅ 禁止生成企业达标/不达标最终结论
- ✅ 复用 `reportService.js`、`hse_reports`、`hse_report_templates`，禁止创建新的报告系统

---

## 二、数据库迁移

**文件**：`server/sql/hse_self_assessment_report_v57_migration.sql`

### 扩展 CHECK 约束

两张表的 `template_category` CHECK 约束均扩展，新增 `'self_assessment'`：

| 表 | 原 CHECK | 新 CHECK |
|---|---|---|
| `hse_report_templates` | `('statistical','monthly_report','group_report')` | `('statistical','monthly_report','group_report','self_assessment')` |
| `hse_reports` | 同上 | 同上 |

### 预置模板

插入 1 条 `self_assessment` 模板记录：
- 模板名称：`安全生产标准化自评报告模板`
- `ai_enabled = FALSE`（自评报告不调用 AI，基于人工确认结果）
- `section_config` 包含 7 个章节配置
- `data_sources = ["standard_evaluation_items"]`

**设计原则**：仅扩展 CHECK 约束，不修改现有字段，不影响 V1/V2 既有报告。

---

## 三、后端实现

### 3.1 reportService.js 扩展

**文件**：`server/services/reportService.js`

#### 扩展映射方法（3 处）

| 方法 | self_assessment 映射值 |
|---|---|
| `_getDefaultReportName` | `安全生产标准化自评报告 - ${period}` |
| `_categoryToReportType` | `monthly` |
| `_categoryToKeywords` | `[]`（不基于关键词检索资料） |

#### 新增方法（5 个）

| 方法 | 功能 |
|---|---|
| `generateSelfAssessmentReport(params)` | **公开方法**。创建 pending 状态报告记录，异步触发生成。参数：taskId / generatedBy / customTitle / enterpriseInfo |
| `_doGenerateSelfAssessment(reportId, taskId, enterpriseInfo)` | 异步执行：采集数据 → 构建 reportData → 生成 HTML → 更新 completed 状态 |
| `_collectSelfAssessmentData(taskId)` | **核心数据采集**。从 `standard_evaluation_items` 读取 `compliance_status != 'pending'` 的记录，**禁止读取 ai_verdict** |
| `_generateSelfAssessmentHtml(reportData)` | 生成 7 章节报告 HTML |
| `_complianceStatusLabel(status)` | compliance_status 中文标签 |

### 3.2 数据源约束（关键）

```sql
-- _collectSelfAssessmentData 中的查询
SELECT id, clause_id, clause_code, clause_title, clause_content,
       compliance_status, manual_remark, checked_by, checked_at,
       matched_file_summary
FROM standard_evaluation_items
WHERE task_id = $1
  AND compliance_status != 'pending'    -- 排除 pending
  AND is_deleted = FALSE
ORDER BY clause_code
```

**关键约束**：
- SELECT 字段列表**不包含** `ai_verdict`、`ai_check_result`、`ai_evidence`、`ai_suggestion` 等 AI 字段
- WHERE 条件强制 `compliance_status != 'pending'`
- 统计 SQL 使用 `COUNT(*) FILTER (WHERE compliance_status ...)` 按 `compliance_status` 分组

### 3.3 报告内容（7 章节）

| 章节 | 内容 | 数据来源 |
|---|---|---|
| 一、企业安全管理基本信息 | 企业名称、信用代码、负责人等 | 前端传入的 enterpriseInfo |
| 二、评价任务信息 | 任务名称、轮次、创建/完成时间、确认进度 | standard_evaluation_tasks |
| 三、标准条款完成情况 | 总数/已确认/待确认统计 | standard_evaluation_items 统计 |
| 四、符合项统计 | 合规/部分合规/不合规/缺失 数量与占比 | compliance_status 分组统计 |
| 五、缺项分析 | 资料缺失条款明细（编号、名称、备注） | compliance_status='missing' |
| 六、整改建议 | 基于 statistics 自动整理的建议清单 | statistics 数据 |
| 七、人工确认记录 | 条款编号、名称、合规状态、确认时间、备注 | compliance_status != 'pending' |

### 3.4 路由扩展

**文件**：`server/routes/hse-report.js`

新增 2 个端点：

| 方法 | 路径 | 功能 |
|---|---|---|
| POST | `/api/hse/report/v2/self-assessment/generate` | 生成自评报告（异步） |
| GET | `/api/hse/report/v2/self-assessment/list` | 自评报告列表（支持 taskId 过滤） |

复用既有端点：
- `GET /api/hse/report/v2/:id` — 报告详情
- `GET /api/hse/report/v2/:id/status` — 生成状态
- `POST /api/hse/report/v2/:id/confirm` — 确认/驳回
- `GET /api/hse/report/v2/:id/export/html` — 导出 HTML
- `GET /api/hse/report/v2/:id/export/word` — 导出 Word

---

## 四、前端实现

### 4.1 API 层

**文件**：`src/api/modules/report.ts`

封装自评报告 API，复用 `client` 实例。

### 4.2 类型定义

**文件**：`src/features/standard-report/types.ts`

定义 `TemplateCategory`（含 `self_assessment`）、`SelfAssessmentReportItem`、`ReportDetail` 等类型。

### 4.3 ReportViewerDrawer 组件

**文件**：`src/features/standard-report/components/ReportViewerDrawer.vue`

复用 Sprint3 ReportViewerDrawer 的设计逻辑（vben 版本），使用 Element Plus 重写：
- 状态栏（生成状态/AI状态/确认状态 3 个 Tag）
- 自评报告说明 Alert（含数据来源展开）
- iframe 渲染报告 HTML
- 导出下拉（HTML 打印 / Word 文档）
- 确认发布按钮

### 4.4 自评报告页面

**文件**：`src/features/standard-report/views/SelfAssessmentReportView.vue`

功能：
- 报告列表（按评价任务筛选、分页、3 秒轮询进度）
- 生成报告弹窗（选择评价任务、自定义标题、企业基本信息表单）
- 预览（打开 ReportViewerDrawer）
- 导出 HTML / 导出 Word
- 显示条款统计（总计/已确认/待确认）

### 4.5 路由注册

**文件**：`src/router/routes.ts`

在 `/standard-evaluation` 路由组下新增：
```
/standard-report/self-assessment   自评报告页面
```

---

## 五、测试验证

### 5.1 测试脚本

| 文件 | 测试内容 |
|---|---|
| `server/test/sprint4-phase6-test.js` | 数据库迁移、hse_reports 保存、HTML 生成、分类映射 |
| `server/test/sprint4-phase6-data-source-test.js` | 数据源约束（pending 排除、ai_verdict 不读取） |

### 5.2 测试结果

**测试 1（基础验证）**：22 项全部通过 ✅
- 数据库 CHECK 约束扩展正确
- hse_reports 可保存 self_assessment 类型
- HTML 不包含达标/不达标结论
- HTML 声明数据来源为 compliance_status
- HTML 不引用 ai_verdict
- 分类映射（self_assessment → monthly、默认报告名、关键词为空）

**测试 2（数据源约束）**：16 项全部通过 ✅
- 创建混合状态明细（2 pending + 1 compliant + 1 non_compliant + 1 missing）
- `_collectSelfAssessmentData` 返回 3 条明细（排除 2 条 pending）
- 返回对象不包含 `ai_verdict` 等 AI 字段
- 人工确认记录不包含 `ai_verdict`
- 统计一致性：total(5) = confirmed(3) + pending(2)
- HTML 包含不合规条款、资料缺项、免责声明

### 5.3 关键约束验证

| 要求 | 验证方式 | 结果 |
|---|---|---|
| 报告不能读取 AI 未确认结果 | SELECT 字段列表不含 ai_verdict | ✅ 通过 |
| pending 不会进入报告 | WHERE compliance_status != 'pending' | ✅ 通过 |
| self_assessment 正常生成 | 模板查询 + 报告记录插入 | ✅ 通过 |
| hse_reports 正常保存 | INSERT + 验证字段 | ✅ 通过 |
| 不生成达标/不达标结论 | HTML 内容检查 | ✅ 通过 |
| TypeScript 类型检查 | vue-tsc --noEmit | ✅ 通过 |

---

## 六、合规性保障

### 6.1 数据流图

```
standard_evaluation_items
  WHERE compliance_status != 'pending'    ← 排除未确认
  SELECT (不含 ai_verdict)                ← 禁止读取 AI 判定
        ↓
_collectSelfAssessmentData
  → statistics (按 compliance_status 分组)
  → compliantItems / partialItems / nonCompliantItems / missingItems
  → confirmationRecords (人工确认记录)
        ↓
_generateSelfAssessmentHtml
  → 7 章节 HTML
  → 包含免责声明：不构成达标/不达标最终结论
        ↓
hse_reports
  template_category = 'self_assessment'
  ai_status = 'none'                      ← 自评报告不使用 AI
```

### 6.2 复用清单

- ✅ `reportService.js` — 扩展（不重写）
- ✅ `hse_reports` — 复用现有表
- ✅ `hse_report_templates` — 复用现有表
- ✅ Sprint3 ReportViewerDrawer — 复用设计逻辑（Element Plus 版本）

---

## 七、未开发（按要求）

- ❌ 自动认证
- ❌ 评分模型
- ❌ 企业达标/不达标最终结论
- ❌ 最终等级评定

等待验收。

---

## 八、文件清单

### 新增文件
- `server/sql/hse_self_assessment_report_v57_migration.sql` — 数据库迁移
- `src/api/modules/report.ts` — 前端 API
- `src/features/standard-report/types.ts` — 类型定义
- `src/features/standard-report/components/ReportViewerDrawer.vue` — 报告查看抽屉
- `src/features/standard-report/views/SelfAssessmentReportView.vue` — 自评报告页面
- `server/test/sprint4-phase6-test.js` — 基础测试
- `server/test/sprint4-phase6-data-source-test.js` — 数据源约束测试

### 修改文件
- `server/services/reportService.js` — 扩展 self_assessment 支持
- `server/routes/hse-report.js` — 新增 2 个自评报告端点
- `src/router/routes.ts` — 注册前端路由

---

## 九、测试运行方式

```bash
# 基础测试
cd server
node test/sprint4-phase6-test.js

# 数据源约束测试
node test/sprint4-phase6-data-source-test.js

# TypeScript 类型检查
cd ..
npx vue-tsc --noEmit --project tsconfig.json
```
