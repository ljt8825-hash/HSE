# 应急管理域三层化拆分完成（emergency，Phase B 第 2 单）

> 类别：②交付报告 · 日期：2026-09-13 · 归属对话：当前会话

## 一句话结论
`routes/emergency.js`（约 2550 行 / 104.2KB 巨无霸）三层化拆分完成：父路由收敛为 **26 行纯聚合入口**，业务全部下沉，对外 API 契约逐字节不变，smoke 全绿，已推送远端。

## 拆分范围与本层职责
| 文件 | 职责 |
|------|------|
| `routes/emergency.js` | 纯聚合入口（仅挂载 `./emergency/main`，26 行） |
| `routes/emergency/main.js` | 纯绑定子路由（82 行） |
| `controllers/emergencyController.js` | 薄 handler + `respond()` 统一解释描述符（316 行） |
| `services/emergencyService.js` | 全部业务+SQL+内存降级+建表（2686 行，46 端点 service 函数） |

## 端点覆盖（8 组，约 46 条）
- **/plans**：GET stats·list·export·:id·:id/attachments·:id/versions；POST /；PUT·DELETE :id；POST·DELETE :id/attachments
- **/drills**：GET stats·list·export·:id；POST /；PUT·DELETE :id
- **/stats、/stats/overview**：总览与兼容统计
- **/materials**：GET list·stats·export·:id；POST /；PUT·DELETE :id
- **/teams**：GET list·stats·export·:id·:id/members；POST /·/generate；PUT·DELETE :id
- **/events**：GET list·stats·export·:id；POST /；PUT·DELETE :id
- **通用附件 /:bizType/:id/attachments**：GET/POST/DELETE（置于所有固定路径之后）

## 关键技术决策（对齐 accidents 样板）
1. **服务层返回统一描述符**（`__t: json / list / csv / not-found / validation-error`），controller 的 `respond()` 统一解释。
2. **通用附件 plan 分支保留**：`:bizType==='plans'` 时改写 `req.url` + `next('route')` 委派回固定 `/plans/:id/attachments` 路由——这是路由层逻辑，留在 controller 而非 service。
3. **顺序防遮蔽**：`main.js` 严格固定路径（`/plans/stats`、`/teams/generate`、`/materials/list` 等）于 `:id` 之前，通用 `:bizType` 置于最后；`POST /teams/generate` 因无 `POST /teams/:id` 而不会被遮蔽。
4. **CSV 拆分为 service 返回 `{writeHeaders, content}`**，teams/events 保持无引号 filename、plans/drills/materials 保持带引号，控制器落响应头。
5. **无需启动 IIFE**：emergency 原实现无 accidents 那样的 setInterval 启动自检，各端点按需 `ensureTables/ensureAllTables`，service 相应不加 IIFE。
6. **原未挂 requireRole 的端点保持不放**（/plans/:id/attachments GET/POST/DELETE、/:id/versions、通用附件 GET）。

## 行为等价验证
- smoke `_smoke_emergency.cjs`（本地，gitignored），本人复跑全绿：
  - 47 端点可达性（非 404）全过；
  - 8 无鉴权 GET 形状、无 ReferenceError 全过；
  - 受保护端点未登录→401 14/14；
  - 未匹配路径 404 正常。
- 4 源文件 `node --check` 通过；service 内 0 处 `res.`/`req.` 引用，三层边界干净。
- 复核修正：controller 本地影子函数 `buildListResponse` 改为从 `commonResponse` 引入，消除与 accidents 样板的偏离。

## 交付与收尾
- 提交：`174aa86 refactor(emergency): 拆分 /api/emergency 路由三层化 route/controller/service`
- 已推送 `origin/main`（`2081423..174aa86`）
- 兼容说明：原模块级仅导出 router，无内部符号被外部引用，聚合无需符号转发。

## 遗留与下一步
- 事故/应急域已收口两单（accidents + emergency）。按 Phase B 剩余：`site-mgmt.js(101.3KB)`、`objectives.js(101.2KB)`、`hse-warning-center.js(85.2KB)`、`hse-analysis-center.js(72.4KB)`、`hse-employee-import-v2.js(71.4KB)` 等。