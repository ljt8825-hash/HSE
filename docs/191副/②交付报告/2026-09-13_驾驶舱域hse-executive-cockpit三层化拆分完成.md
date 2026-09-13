# 集团HSE智能驾驶舱域三层化拆分完成（executive-cockpit，Phase B 第 13 单）

> 类别：②交付报告 · 日期：2026-09-13 · 归属对话：当前会话

## 一句话结论
`routes/hse-executive-cockpit.js`（原约 1015 行，Sprint6.5-C 集团 HSE 智能驾驶舱 v1.1，6 个只读统计端点）三层化拆分完成：父路由收敛为 **7 行纯聚合入口**，业务全部下沉，对外 API 契约逐字节不变。独立复核三绿：**语法 0 错误、冒烟 100% 通过、新旧对比 9+1 全部 IDENTICAL**。另发现并忠实复现**一组既有 SQL 语病故障**（5/6 端点当前 schema 下恒 500，`org-ranking` 正常），已立风险待办单独立档。

## 拆分范围与本层职责

| 文件 | 职责 |
|------|------|
| `routes/hse-executive-cockpit.js` | 纯聚合入口（挂载 `./hse-executive-cockpit/main`，7 行） |
| `routes/hse-executive-cockpit/main.js` | 纯绑定子路由（6 端点按原顺序，无鉴权中间件） |
| `controllers/executiveCockpitController.js` | 薄 handler + `respond()`（原生态 `__t:'json'/body`）+ 统一 `run()`（500 错误） |
| `services/executiveCockpitService.js` | 全部业务 + SQL + 评分模型 + 权限/辅助计算（约 1100 行） |

## 端点覆盖（6 条，均公开只读）
`/overview`（总体态势）、`/org-ranking`（组织排名，支持 level 参数）、`/risk-trend`（风险态势）、`/indicator-completion`（指标完成）、`/major-risk-warning`（重大风险预警）、`/management-performance`（管理履职，支持 days 参数）。

## 关键技术决策
1. **原生态响应契约**：与上单 hse-assessment-analysis 同——均直接 `res.json({code:0, data})`，异常 `res.status(500).json({code:1, message:真实错误})`。service 返回 `{ __t:'json', body }`，controller catch 归一 500。
2. **无内存降级、无鉴权中间件**：6 端点均只读 SELECT；`/org-ranking` 内部 `getPermissionScope(req)` 在 req.user 缺失时默认 admin（安全），按原文赋值不参与 SQL 过滤。
3. **评分模型/辅助完整下沉**：`ACCIDENT_LEVEL_WEIGHT`、`GRID_CHIEF_INSPECTION_REQUIREMENT`、`DEPT_SCORING_WEIGHTS`、`computeOverallScores`、`getGrade/getRiskLevel/getStatusColor/getYearRange/getFiveYearAgoStr`、`calculateGridCompliance` 均在 service 层，权重与口径逐字节保留。service 各函数保留原 `[executive-cockpit] xxx error:` 的 console.error 前缀再抛错。

## 既有故障留档（本单关键发现，见④风险待办）
**5/6 端点当前 schema 下恒 500**（与拆分无关，逐字节复现）：
- `/overview`：`hse_assessment_model_version` 表不存在（42P01）
- `/risk-trend`：事故趋势 SQL 的 `accidents.accident_date` 未入 GROUP BY（42803）
- `/indicator-completion` & `/management-performance`：`hazard_record.inspector_id` 字段不存在（42703，应为 `employee_id`）
- `/major-risk-warning`：`employee.employee_name` 字段不存在（42703，应为 `name`）
- `/org-ranking` **正常 200**（三个 level 均验证通过）

## 独立复核（本单自查）
- **语法**：`node --check` 四文件全过。
- **冒烟**（`_smoke_executive_cockpit.cjs`）：6 端点路由可达（org-ranking 真 200 形状 + 既有 500 端点标注）+ 无拆分引入 ReferenceError + 404 —— **全部通过**，零写库。
- **新旧对比**（`_compare_executive_cockpit.cjs`，对照 git HEAD 原始版）：9 组（6 端点 + 3 级 level/days 变体）**逐字节 IDENTICAL**（含 5 端点的 500 body 逐字节一致）、不存在路径**双 404** —— 全部一致。

## 约定
- 冒烟/对比脚本为临时验证件（`_smoke_*`、`_compare_*`，gitignore），保留于 `server/` 供回归。
- 本单未触碰任何生产表 / 端口 / WPS 边界；全部验证为只读 + 404。