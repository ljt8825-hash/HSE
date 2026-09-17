# HSE综合驾驶舱域三层化拆分完成（hse-dashboard，Phase B 第 20 单）

> 类别：②交付报告 · 日期：2026-09-13 · 归属对话：当前会话

## 一句话结论
`routes/hse-dashboard.js`（原 524 行，Sprint6.3-B-1 HSE 综合驾驶舱 7 个只读查询端点）三层化拆分完成：父路由收敛为 **纯聚合入口**，业务全部下沉，对外 API 契约不变。独立复核全绿：**语法 0 错误、冒烟 100%、新旧对比 9 组读取逐字节 IDENTICAL**。

## 拆分范围与本层职责

| 文件 | 职责 |
|------|------|
| `routes/hse-dashboard.js` | 纯聚合入口（挂载 `./hse-dashboard/main`） |
| `routes/hse-dashboard/main.js` | 纯绑定子路由（7 只读 GET 端点，按原顺序） |
| `controllers/hseDashboardController.js` | 薄 handler + `run()` 包装，复刻原始响应形状 |
| `services/hseDashboardService.js` | 全部 7 个业务函数 + SQL（原文件几乎全部逻辑） |

## 端点覆盖（7 条，挂载 **`/api/hse/dashboard`**）
> 全部只读 GET，原文件**无 requireRole**（仅全局 authMiddleware），照旧不追加鉴权。
| 端点 | 说明 |
|------|------|
| `GET /overview` | 驾驶舱总览（员工/已评估/等级分布/改善率/高危比） |
| `GET /level-distribution` | 风险等级分布（含占比） |
| `GET /risk-type-analysis` | 风险类型分析（三违/驾驶/事故/培训/管理履职） |
| `GET /risk-top?limit=` | 风险 TOP（员工/部门/作业单元） |
| `GET /risk-trend?period=&metric=` | 风险趋势（daily/weekly/monthly × 多指标） |
| `GET /management-execution?days=` | 管理履职分析（巡查完成/问题发现/整改闭环） |
| `GET /risk-level-config` | 风险等级配置 |

## ⚠️ 响应形状差异处理（关键，区别于已拆域）
本域**不套用** middleware/response 的 `success()/error()` 标准封装，忠实复刻原文件：
- **成功**：`res.json({ success:true, data, message })` —— **不含 `code` 字段**；
- **失败**：未捕获异常 → `res.status(500).json({ success:false, message: err.message })`（不走全局 errorHandler）。

为此引入 hse-dash 专用描述符（`ok(data,message)` / `boom(httpStatus,message)`），controller 的 `run()` 按该形状输出；service 对预期分支返回描述符、对 DB/内部异常 throw → controller 兜底 500（等价原文件逐端点 try/catch → status(500)）。

## 独立复核（本单自查）
- **语法**：`node --check` 四文件全过；require 图加载 OK。
- **冒烟**（`_smoke_hse_dashboard.cjs`）：9 只读端点全部 `200 + success:true + message:查询成功 + data 存在 + 无 code 字段`；404 —— 全部通过。
- **新旧对比**（`_compare_hse_dashboard.cjs`，对照 git HEAD 原始版）：9 组读取（含 limit/days/period/metric 参数组合）**双 200 逐字节 IDENTICAL**；不存在路径 **双 404** —— 全部一致。
- **回归**：`npm test` 23 套件通过 / 3 套失败（**insurance-file、import-personnel-behavior、personnel-insurance**，22 处）——与拆分前基线一致，**未引入新回归**。
- **引用核查**：外部对 `routes/hse-dashboard` 的引用仅 `app.js` 一处（`/api/hse/dashboard`）；另有 `test/hse-dashboard-test.js` 手动验证脚本仅 `require` 该路由作 router 使用，聚合化后仍兼容；无单测直读其源码。

## 约定
- 冒烟 `_smoke_hse_dashboard.cjs` 与对比 `_compare_hse_dashboard.cjs` 为临时验证件，保留于 `server/` 供回归。
- 本单 7 端点全为 SELECT 只读查询，未触碰任何写库；未触碰生产端口/WPS 边界。
- 连续性：Phase B 累计规整拆分 20 单（roster-import、hazard-rectification、position-responsibility、regulations、training-ocr、hse-dashboard 等）。