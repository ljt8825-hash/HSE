# 考核分析域三层化拆分完成（assessment，Phase B 第 8 单）

> 类别：②交付报告 · 日期：2026-09-13 · 归属对话：当前会话

## 一句话结论
`routes/hse-assessment.js`（原约 1362 行，HSE 考核综合分析/排名/指标分析只读域）三层化拆分完成：父路由收敛为 **16 行纯聚合入口**，业务全部下沉，对外 API 契约逐字节不变。本单是公开只读域（6 个 GET、无鉴权、无 cron），等价性通过**新旧状态码 + top-level code 字段对照**实证，且发现并正确保留了一种**不同于其它域的裸 JSON 响应契约**。

## 拆分范围与本层职责

| 文件 | 职责 |
|------|------|
| `routes/hse-assessment.js` | 纯聚合入口（挂载 `./hse-assessment/main`，16 行） |
| `routes/hse-assessment/main.js` | 纯绑定子路由（20 行，6 端点按原顺序，根路由 `/` 在最后） |
| `controllers/assessmentController.js` | 薄 handler + `run()` + `respond()`（64 行，输出裸 JSON 契约） |
| `services/assessmentService.js` | 全部业务+SQL+常量与私有辅助（1355 行） |

## 端点覆盖（6 条，全部公开 GET）
`/overview`、`/ranking`、`/indicator-analysis`、`/target-progress`、`/deduction-detail`、`/`（根路由注册在最后）。

## 关键技术决策与本单特殊处理
1. **裸 JSON 响应契约（区别于其它域）**：本文件首部只 `require('express')` + `require('../config/db')`，**未引入 `middleware/response` 的 success/error 包装**。成功= `res.json({code:0,data})`(200)、异常= `res.status(500).json({code:1,message})`(500)。故 controller 的 `respond()` **跳过 success()/error()**（避免附加 success:true/false 字段破坏字节契约），逐字输出原 shape。这是与参考模板的唯一有意偏差，已实证。
2. **错误语义为 500 型（与 employee-import-v2 相反）**：6 个 handler 的 catch 全部 `res.status(500).json({code:1,message})`，成功分支全 `code:0` 200——不存在默认 200 的错误分支。service 错误描述符统一带 `httpStatus:500`，controller respond() 还原为 500/`{code:1,message}`。
3. **模块级常量与辅助整体下沉**：`ACCIDENT_LEVEL_WEIGHT`、`GRID_CHIEF_INSPECTION_REQUIREMENT`、`DEPT_SCORING_WEIGHTS`、`TOWNSHIP_SCORING_WEIGHTS` 常量，`getPermissionScope`（req.user 未定义兜底 admin）、`calculateGridCompliance`、`getGrade`、`getIndicatorStatus`、`getYearRange`、`getFiveYearAgoStr`、`computeOverallScores`，以及 target-progress 内联的 `calcStatus/calcCompletionRate` 全部迁入 service。
4. **内置非致命兜底保留**：overview 的模型版本 42P01 静默降级 + 部门排名吞异常、target-progress 责任书表缺失用默认数据，均以 service 内局部 try/catch 原样保留，不触发顶层 catch。
5. **注册顺序逐条保持**：尤其根路由 `/` 保持注册在最后（Express 按序匹配，若提前会遮蔽 `/:id` 类路径——本文件无其它路径，但顺序仍与原文一致）。

## 行为等价验证（本人复核）
- `node --check` 5 文件全过；`node -e require(聚合)/require(service)` 正常加载。
- 冒烟 `_smoke_assessment.cjs`（本地 gitignored）：6 端点全部 200 真实执行、响应形状正常、404 对照组正确。
- **新旧对照冒烟（决定性）**：从 `git HEAD` 提取原始文件挂临时前缀，与拆分后新聚合跑同一组 7 用例（6 端点 + 404 对照），断言 HTTP 状态码 + top-level `code` 字段逐条一致 —— **7/7 EQ，全等**（成功均 200/`{code:0,...}`，未匹配 404）。
- 本域只读，全程未写库。

## 交付与收尾
- 提交：`refactor(hse-assessment): ...` + `docs(191副): ...`（本单，待推送远端）

## 遗留与下一步
- 本单收口后，Phase B 剩余仍需拆分的大文件（按体积）：`risk-control.js`、`hazards.js`、`violations.js`、`hse-assessment-analysis.js`、`hse-executive-cockpit.js` 等。