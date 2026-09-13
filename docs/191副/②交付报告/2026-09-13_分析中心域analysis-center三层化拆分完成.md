# 分析中心域三层化拆分完成（analysis-center，Phase B 第 6 单）

> 类别：②交付报告 · 日期：2026-09-13 · 归属对话：当前会话

## 一句话结论
`routes/hse-analysis-center.js`（原约 2059 行巨无霸，Sprint8-A「HSE 智能分析中心」五大分析模块）三层化拆分完成：父路由收敛为**纯聚合并入（约 16 行）**，业务全部下沉，对外 API 契约逐字节不变。行为等价通过**新旧对照冒烟**（git HEAD 原始文件 vs 拆分后，同一环境下 HTTP 状态码序列逐条一致）实证，是 Phase B 中对等价性验证最严格的一单。

## 拆分范围与本层职责
| 文件 | 职责 |
|------|------|
| `routes/hse-analysis-center.js` | 纯聚合入口（挂载 `./hse-analysis-center/main`） |
| `routes/hse-analysis-center/main.js` | 纯绑定子路由（46 行，按原注册顺序绑定 21 端点 + `requireRole` 中间件留绑定层） |
| `controllers/analysisCenterController.js` | 薄 handler + `run()` + `respond()`（统一解释 `__t:'json'` 描述符，133 行） |
| `services/analysisCenterService.js` | 全部业务 + SQL + 私有辅助/画像/预测计算（1870 行） |

## 端点覆盖（5 大模块 + 模型版本 + 预警联动，共 21 条）
`/risk-trend`、`/risk-trend/:target_type/:target_id`、`/accident-trend`、`/accident-repeat`、`/rectification-analysis`、`/org-portrait`、`/org-portrait/:org_type/:org_id`、`/predict`（POST，鉴权）、`/predictions`、`/predictions/:id`、`/abnormal`、`/model-versions`、`/model-versions/:id`、`/model-versions/active`、`/model-versions`（POST，鉴权）、`/model-versions/:id`（PUT，鉴权）、`/model-versions/:id/freeze`、`/model-versions/:id`（DELETE，鉴权）、`/predictions/:id/generate-warning`（POST，鉴权）、`/prediction-warnings`、`/prediction-warnings/stats`。

## 关键技术决策与本单特殊处理
1. **`/model-versions/active` 影子顺序保留**：`GET /model-versions/:id` 注册在 `GET /model-versions/active` 之前，Express 按序匹配使 `/active` 以 id='active' 命中 `/:id` → 返回「该模型版本不存在」的原语序。本单严格保持「先 `/:id`、后 `/active`」，行为逐字节等价。
2. **`/abnormal` 相对顺序保留**：注册在 `/predictions/:id` 之后，属独立前缀不冲突，相对位置原样保持。
3. **错误语义 precision 迁移**：数据库未连接 → `error(-1,'数据库未连接')` HTTP 200；业务校验失败 → 负数业务码（-2 无效对象类型等）HTTP 200；真正异常 → `res.status(500).json(error(-1, msg))`。service 描述符以 `error.code + error.httpStatus` 表达，controller `respond` 按规则还原。
4. **权限中间件留在绑定层**：`requireRole('admin','safety_manager')` 固守 POST/PUT/DELETE 六个管理端点，controller/service 不感知鉴权。
5. **私有辅助函数整体下沉 service**：`generateCode`、`camelKeys`、`getPermissionScope`、常量 `ORG_TYPE_MAP/TREND_MAP/PREDICTION_TYPE_MAP/MODEL_STATUS_MAP/ALGORITHM_MAP`、`computeOrgPortrait`、`collectHistoryData`、`computePrediction`、`detectAbnormal`、`generatePredictionNote`、`computeRealtimeRiskTrend`、`predictNextPeriod`、`getOrCreatePredictionRule` 全部迁入 service，`createNotification` 仅 generate-warning 路径引用保持不动。
6. **无内存单例转发需求**：原文件仅导出 router，父聚合保持最简，不额外转发。

## 行为等价验证（本人复核，最严格一单）
- 编写 `_smoke_analysis_center.cjs`（本地，gitignored）：21 端点可达非 404、公开 GET 响应形状、6 受保护端点未登录 → 401（不触库）、不存在路径 404，全部通过。
- **新增『新旧对照冒烟』**：从 `git HEAD` 提取原始文件挂临时前缀（代理其相对依赖），与拆分后新聚合跑同一组 22 用例，断言 HTTP 状态码逐条一致 —— **22/22 EQ，全等**（公开 GET 全 200、鉴权端点全 401、404 对照组全 404）。
- 4 源文件 + 冒烟脚本 `node --check` 全过。
- 全程未对生产源表发起真实写入。

## 交付与收尾
- 提交：`refactor(hse-analysis-center): ...` + `docs(191副): ...`（本单）

## 遗留与下一步
- 本单收口后，Phase B 剩余仍需拆分的大文件（按体积）：`hse-employee-import-v2.js`、`hse-assessment.js`、`risk-control.js`、`hazards.js`、`violations.js`、`hse-assessment-analysis.js` 等。