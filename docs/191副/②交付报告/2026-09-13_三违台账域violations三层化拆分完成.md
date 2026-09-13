# 三违台账域三层化拆分完成（violations，Phase B 第 11 单）

> 类别：②交付报告 · 日期：2026-09-13 · 归属对话：当前会话

## 一句话结论
`routes/violations.js`（原约 1339 行，三违台账 CRUD + 统计 + CSV 导出 + 整改闭环 + 违规人身份解析 + 月度考核事件联动）三层化拆分完成：父路由收敛为 **7 行纯聚合入口**，业务全部下沉，对外 API 契约逐字节不变。独立复核三项全绿：**语法 0 错误、冒烟 100% 通过、新旧对比 9+6+1 全部 IDENTICAL**。另发现并忠实复现一处**既有故障**（CSV 导出裸中文文件名触发 Node `ERR_INVALID_CHAR`），已在风险待办单独立档，见文末。

## 拆分范围与本层职责

| 文件 | 职责 |
|------|------|
| `routes/violations.js` | 纯聚合入口（挂载 `./violations/main`，7 行） |
| `routes/violations/main.js` | 纯绑定子路由（15 端点按原顺序 + `requireRole('admin','safety_manager')` 留绑定层） |
| `controllers/violationController.js` | 薄 handler + `respond()`（json/csv 描述符）+ 统一 `run()` 包裹（约 90 行） |
| `services/violationService.js` | 全部业务+SQL+内存降级+身份解析+CSV 导出+事件联动（约 1270 行） |

## 端点覆盖（15 条）
`/`(list)、`/stats`、`/filter-options`、`/:id`(GET)、`POST /`(写)、`PUT /:id`(写)、`DELETE /batch`(写,先于 `/:id`)、`DELETE /:id`(写)、`/export/csv`、`/:id/rectify`(写)、`/:id/review`(写)、`/statistics/employee-count`、`/statistics/high-risk`、`/statistics/department-ranking`、`/statistics/position-ranking`。

## 关键技术决策与本单特殊处理
1. **统一 run() 包裹（区别于 hazards 的 run/runNext 双包裹）**：核对原文件**全部端点（含 export/csv）的 catch 均为固定文案 `res.json(error(-1, '操作失败，请稍后重试'))`**，无任何 `next(err)` 调用，故 controller 只用单一 `run()`，catch 归一为该固定文案。
2. **全 200 响应契约**：原文无任何 `res.status()` 调用，所有响应恒 HTTP 200，区别仅在 body 的 `code` —— `-2` 记录不存在/状态不可操作、`-1` 校验/失败。service 错误描述符不带 httpStatus，controller 不覆写状态。
3. **CSV 导出特殊契约（既有故障复现）**：原文 `Content-Disposition: attachment; filename=三违记录.csv` 含裸中文文件名，Node `setHeader` 抛 `ERR_INVALID_CHAR`，被 catch 收编为 **200 + error(-1) JSON，且因 `res.json` 不覆盖已设 content-type 而仍为 text/csv**。拆分版逐字节复现（对比验证 IDENTICAL）。**注意：这与 hazards/risk-control 用 ASCII 文件名（正常导出）不同，是三违域的历史遗留故障。**
4. **违规人身份解析/权威姓名同步完整下沉**：`resolveViolatorId`（id_card hash→employee，name 唯一匹配降级）、`resolveViolatorName`（v_employee_org_full 优先，employee 兜底）均在 service 层，阶段2/阶段2a 查处来源（checkSource 必填校验、company/township/self 字典）逻辑不变。
5. **内存降级**：三违 memory 24 列 CSV / DB 20 列 CSV 两套，`buildCsvFromRows(rows, useMemoryShape)` 保持原逐字节输出。

## 独立复核（本单自查）
- **语法**：`node --check` 四文件全过。
- **冒烟**（`_smoke_violations.cjs`）：9 读端点可达、6 写端点未登录 401、8 形状断言 + CSV 既有故障契约、7 组 service 错误码（0-row no-op，不触写库）、不存在路径 404 —— **全部通过**。
- **新旧对比**（`_compare_violations.cjs`，对照 git HEAD 原始版）：9 组 JSON/导出响应**逐字节 IDENTICAL**、6 处受保护写端点**双 401**、不存在路径**双 404** —— 全部一致。

## 既有故障留档（见④风险待办）
`GET /api/violations/export/csv` 因原始裸中文文件名 `filename=三违记录.csv` 触发 Node `ERR_INVALID_CHAR`，恒返回 200+error(-1)，**CSV 文件从未能正常导出**。逐字节复现而非越权修复（遵循"旧新行为一致"约束）。已立档 `2026-09-13_三违CSV导出裸中文文件名故障`，待用户决策后独立修复（建议 RFC 5987 `filename*=UTF-8''…` 或 ASCII 兜底文件名）。

## 约定
- 冒烟脚本 `_smoke_violations.cjs` 与对比脚本 `_compare_violations.cjs` 为临时验证件，保留于 `server/` 供回归。
- 本单未触碰任何生产表 / 端口 / WPS 边界；全部验证为只读 + 0-row no-op + 401。