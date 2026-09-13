# 事故管理域三层化拆分完成（accidents，Phase B 试点）

> 类别：②交付报告 · 日期：2026-09-13 · 归属对话：当前会话

## 一句话结论
`routes/accidents.js`（2107 行 / 104.8KB 巨无霸）三层化拆分完成：父路由收敛为 **23 行纯聚合入口**，业务全部下沉，对外 API 契约逐字节不变，smoke 全绿，已推送远端。

## 拆分范围与本层职责
| 文件 | 职责 |
|------|------|
| `routes/accidents.js` | 纯聚合入口（仅挂载 `./accidents/main` 子路由，无业务，23 行） |
| `routes/accidents/main.js` | 纯绑定子路由（方法+路径+中间件 → controller，仅 50 行） |
| `controllers/accidentController.js` | 薄 handler：req 解析 + 调 service + `respond()` 统一解释描述符 |
| `services/accidentService.js` | 全部业务+SQL+内存降级+建表启动 IIFE（18 端点 service 函数） |

## 端点覆盖（18 个 / 19 条路由）
- **GET**：`/`（列表/筛选/分页）、`/stats/all`、`/stats/yearly`、`/unsettled`、`/stats`（旧版兼容）、`/export`（CSV）、`/teams`、`/personnel-search`、`/suggest-team`、`/category-nature`、`/suggest-party`、`/:id`、`/:id/attachments`、`/:id/versions`
- **POST**：`/`（创建）、`/:id/attachments`（上传，`uploadDocument.single('file')`）
- **PUT**：`/:id`（更新）
- **DELETE**：`/:id`（软删）、`/:id/attachments/:aid`

## 关键技术决策
1. **服务层返回统一描述符**（`__t: json / list / csv / not-found / validation-error`），controller 的 `respond()` 统一解释——复用 insurance 域样板，行为与原路由一致。
2. **内存降级 + 建表启动 IIFE 原位迁入 service**：`initMemoryData` / `ensureTables` / `ensureTablesOnStartup` 逻辑一字不差搬入 `accidentService.js`，模块加载即自检，状态在 service 模块内，依赖池隔离正确。
3. **CSV 重构**：原 `sendCsvExport(res, data)` 依赖 `res`，改为 service 内 `buildCsvExport(data)` 返回 `{writeHeaders, content}`，由 controller 落响应头——描述符契约统一。
4. **审计上下文注入**：create/update/delete/上传/删附件 的 `auditLog` 由 controller 装配 `{userId, username, ip}` 传入 service，维持 fire-and-forget 语义。
5. **顺序一致防遮蔽**：`main.js` 严格保持原注册顺序（`/stats/all` 等固定路径优先于 `/:id`），避免参数路由遮蔽。
6. **同步副作用保留**：`hseEventSync.syncAccident` + `assessmentEvent.ACCIDENT_CREATED`（月度考核事故否决项）触发点原样保留在 create 内。

## 行为等价的验证
- smoke `_smoke_accidents.cjs`（本地临时，gitignored）：
  - 19 条端点可达性（非 404）全部 OK；
  - 6 个无鉴权 GET 响应形状校验（真实执行 DB 模式、无 ReferenceError）全部 OK；
  - 6 个受保护端点未登录 → 401 OK；
  - 未匹配路径 `aaa/bbb/ccc` → 404 正常。
- `node --check` 四个文件语法通过。

## 交付与收尾
- 提交：`96c12aa refactor(accidents): 拆分 /api/accidents 路由三层化 route/controller/service`
- 已推送 `origin/main`（`7b1733a..96c12aa`）
- 兼容说明：原 `routes/accidents.js` 模块级仅导出 `router`，无内部符号被外部引用，故聚合无需符号转发。

## 遗留与下一步
- 待收敛清单仍缺（按 Phase B 优先级）：`emergency.js(104.2KB)`、`site-mgmt.js(101.3KB)`、`objectives.js(101.2KB)`、`hse-warning-center.js(85.2KB)` 等。accidents 本次作为「事故/应急/预警域」试点，可衔接同域 `emergency.js` 继续。