# 考核分析中心域三层化拆分完成（hse-assessment-analysis，Phase B 第 12 单）

> 类别：②交付报告 · 日期：2026-09-13 · 归属对话：当前会话

## 一句话结论
`routes/hse-assessment-analysis.js`（原约 983 行，集团 HSE 考核分析中心 Sprint6.5-A，5 个只读统计端点）三层化拆分完成：父路由收敛为 **7 行纯聚合入口**，业务全部下沉，对外 API 契约逐字节不变。独立复核三绿：**语法 0 错误、冒烟 100% 通过、新旧对比 5+1 全部 IDENTICAL**。

## 前置说明
用户指令「从 hse-employee.js 开始」的 `routes/hse-employee.js` 已在更早的 Phase A 收官时完成三层化（原 284KB 收敛为 53 行父路由 + `routes/hse-employee/` 子目录）。按既定惯例跳转到下一个最大未拆文件 `hse-assessment-analysis.js`。

## 拆分范围与本层职责

| 文件 | 职责 |
|------|------|
| `routes/hse-assessment-analysis.js` | 纯聚合入口（挂载 `./hse-assessment-analysis/main`，7 行） |
| `routes/hse-assessment-analysis/main.js` | 纯绑定子路由（5 端点按原顺序，无鉴权中间件） |
| `controllers/hseAssessmentAnalysisController.js` | 薄 handler + `respond()`（原生态 `__t:'json'/body`）+ 统一 `run()` 包裹（500 错误） |
| `services/hseAssessmentAnalysisService.js` | 全部业务 + SQL + 评分模型 + 辅助计算（约 1050 行） |

## 端点覆盖（5 条，均公开只读）
`/overview`（集团总览）、`/department-ranking`（部门排名）、`/township-ranking`（乡镇排名）、`/goals`（目标达成）、`/deduction`（考核扣分）。

## 关键技术决策
1. **原生态响应契约（区别于前几单的 success/error 体系）**：本域 5 端点均直接 `res.json({code:0, data})`，错误为 `res.status(500).json({code:1, message:e.message})`——**消息是真实 error message，非固定文案**，且成功/错误都用 500 状态码彰显「计算型查询」。service 返回 `{ __t:'json', body }`（body 即最终对象），controller success 直接 `res.json(r.body)`，catch 归一 `res.status(500).json({code:1, message:err.message})`。
2. **无 `success()/error()` 包装、无 `camelKeys`**：视图直接消费原始 `code/data`，避免多余封装。
3. **无内存降级、无鉴权中间件**：5 端点全部直接 `pool.query` 只读 SELECT，安全边界只需守住只读即可。
4. **辅助函数/常量下沉**：`ACCIDENT_LEVEL_WEIGHT`、`GRID_CHIEF_INSPECTION_REQUIREMENT`、`calculateGridCompliance`、`calculateDeptGridCompliance` 均在 service 层，评分权重与口径逐字节保留。
5. **写保护**：本域无任何写端点，无 `DELETE/UPDATE/INSERT`，不触碰生产表写边界。

## 独立复核（本单自查）
- **语法**：`node --check` 四文件全过。
- **冒烟**（`_smoke_hse_assessment_analysis.cjs`）：5 只读端点真实执行 + 形状断言（overview 含 actual/completionRates/trend、rankings/goals/reasonAnalysis 数组、deduction 含 rectificationStatus）+ 不存在路径 404 —— **全部通过**，零写库。
- **新旧对比**（`_compare_hse_assessment_analysis.cjs`，对照 git HEAD 原始版）：5 组响应**逐字节 IDENTICAL**、不存在路径**双 404** —— 全部一致。

## 约定
- 冒烟/对比脚本为临时验证件（`_smoke_*`、`_compare_*`，gitignore），保留于 `server/` 供回归。
- 本单未触碰任何生产表 / 端口 / WPS 边界；全部验证为只读 + 404。