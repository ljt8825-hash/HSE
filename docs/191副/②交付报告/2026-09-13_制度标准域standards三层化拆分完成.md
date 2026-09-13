# 制度标准域三层化拆分完成（standards，Phase B 第 14 单）

> 类别：②交付报告 · 日期：2026-09-13 · 归属对话：当前会话

## 一句话结论
`routes/standards.js`（原约 770 行，规章制度/文件库/文件审核/条款库/条款关联/匹配建议六大域 CRUD+统计+导出+总览）三层化拆分完成：父路由收敛为 **7 行纯聚合入口**，业务全部下沉，对外 API 契约逐字节不变。独立复核三项全绿：**语法 0 错误、冒烟 100% 通过、新旧对比 23+1 全部 IDENTICAL**。本单未发现需单独立档的既有故障。

## 拆分范围与本层职责

| 文件 | 职责 |
|------|------|
| `routes/standards.js` | 纯聚合入口（挂载 `./standards/main`，7 行） |
| `routes/standards/main.js` | 纯绑定子路由（40 端点按原顺序；本域**无鉴权中间件**，全公开） |
| `controllers/standardsController.js` | 薄 handler + `respond()`（json 描述符）+ 统一 `run()` 包裹（约 100 行） |
| `services/standardsService.js` | 全部业务+SQL+建表保障+内存降级（约 950 行） |

## 端点覆盖（40 条）
`/rules`、`GET/POST /:bizType/:id/attachments`、`DELETE /:bizType/:id/attachments/:aid`（通用附件）；`/regulations`(list/stats/export/:id CRUD)、`/library`(list/stats/export/:id CRUD)、`/reviews`(list/stats/:id 增改)、`/clauses`(list/stats/export/:id CRUD)、`/relations`(list/批量POST/删除)、`/suggestions`(list/stats/generate/:id/handle)、`/stats/overview`、`/stats`、`/`(模块信息)。

## 关键技术决策与本单特殊处理
1. **统一 `run()` 包裹（同 violations 而非 hazards）**：核对原文件**全部端点外层 catch 均为 `res.json(error(-1, e.message))`（真实错误信息，非固定文案）**，无任何 `next(err)` 调用，故 controller 只用单一 `run()`，catch 归一为 `error(-1, err.message)`。
2. **全 200 响应契约**：原文无任何 `res.status()` 调用，所有响应恒 HTTP 200，区别仅在 body 的 `code` —— `-2` 记录不存在、`-1` 校验/通用失败。service 错误描述符不带 httpStatus，controller 不覆写状态。
3. **本域无鉴权中间件（全公开）**：与 violations（requireRole 保护）不同，本域 40 端点一律无 `requirePermission/requireRole`，`main.js` 仅做路径→方法→controller 绑定，不引入任何鉴权；保持与原行为一致。
4. **条款库「复用已有表」双路径完整下沉**：`clauses` 域优先查 `safety_standard_clauses`（既有表），失败时降级到 `hse_clauses` 建表兜底；list/export 失败返回「暂无数据」成功占位——所有内部 try/catch 降级分支均在 service 层处理返回描述符，不抛到 `run()`。
5. **通用附件路由注册在最前**：`/:bizType/:id/attachments` 系列紧跟 `/rules` 注册，保持与原文件顺序，避免被后续各域参数路由干扰；同时各域 `/stats`、`/export` 必须注册在 `/:id` 之前（原结构约束），拆分版经「路由遮蔽回归」用例逐条验证未遮蔽。
6. **内存降级完整保留**：mem 六域数据 + 计数器 + `nowISO()`/`paginate()`，DB 不可用时全量回退，含匹配建议内存态随机生成逻辑不变。

## 独立复核（本单自查）
- **语法**：`node --check` 四文件全过。
- **冒烟**（`_smoke_standards.cjs`）：23 读端点可达 + 路由遮蔽回归（/export /stats 未被 /:id 捕获）、20 形状断言、15 组 service 错误码（**0-row/0-insert no-op，不触写库**）、不存在路径 404 —— **全部通过**。
- **新旧对比**（`_compare_standards.cjs`，对照 git HEAD 原始版）：23 组读端点（含缺失 id 业务码 `-2`、导出、stats、overview、通用附件）响应**逐字节 IDENTICAL**、不存在路径**双 404** —— 全部一致。

## 约定
- 冒烟脚本 `_smoke_standards.cjs` 与对比脚本 `_compare_standards.cjs` 为临时验证件，保留于 `server/` 供回归。
- 本单未触碰任何生产表 / 端口 / WPS 边界；全部验证为只读 + 0-row no-op + 0-insert no-op。