# 规章制度域三层化拆分完成（regulations，Phase B 第 18 单）

> 类别：②交付报告 · 日期：2026-09-13 · 归属对话：当前会话

## 一句话结论
`routes/regulations.js`（原 537 行，规章制度 CRUD + 附件管理 + 版本履历，PG + 内存降级双模式）三层化拆分完成：父路由收敛为 **纯聚合入口**，业务全部下沉，对外 API 契约不变。独立复核全绿：**语法 0 错误、冒烟 100% 通过、新旧对比只读端点逐字节 IDENTICAL + 写端点形状一致**。本单先完成性质确认：demo-data.js 判定为工具类路由暂不拆（详见下）。

## 拆分范围与本层职责

| 文件 | 职责 |
|------|------|
| `routes/regulations.js` | 纯聚合入口（挂载 `./regulations/main`） |
| `routes/regulations/main.js` | 纯绑定子路由（10 端点，严格按原注册顺序） |
| `controllers/regulationsController.js` | 薄 handler + `respond()`（json 描述符）+ `next(err)` 转发 + CSV 渲染 |
| `services/regulationsService.js` | 全部业务 + SQL + 双模式降级 + 时效状态计算（约 500 行） |

## 端点覆盖（10 条，挂载 **`/api/regulations`**）
> 本域注册在 `/api` 全局 `authMiddleware` 之后，**原文件无 requireRole 写保护**，故不追加鉴权，忠实复刻（已认证角色即可读写）。
| 端点 | 说明 |
|------|------|
| `GET /` | 列表（分页/搜索/状态过滤，PG + 内存降级） |
| `GET /stats` | 统计（total/byStatus/byCategory） |
| `GET /export` | 导出制度清单（CSV，兼容 xlsx 工具） |
| `GET /:id` | 详情（附加时效状态字段） |
| `POST /` | 创建（兼容 camelCase/snake_case） |
| `PUT /:id` | 更新（COALESCE 局部更新，自动版本履历） |
| `DELETE /:id` | 软删除（is_deleted=true） |
| `GET /:id/attachments` | 附件列表（可版本过滤） |
| `POST /:id/attachments` | 上传附件（`uploadDocument.single('file')`） |
| `DELETE /:id/attachments/:aid` | 删除附件 |
| `GET /:id/versions` | 版本履历 |

## 与既有拆分的差异处理
- **错误处理路径不同**：原文件未捕获异常走 `next(err)` → 全局 `errorHandler`（鉴别 PG 错误码/生产化消息），而非已拆域惯用的 controller `run()` catch→`error(-1,msg)`。为**忠实复刻**，本单 controller 用 `next(err)` 转发，service 对「未连接/记录不存在/参数校验/上传缺文件」等预期分支返回描述符、对 DB/内部异常 throw，交由全局 errorHandler 生成与原始完全一致的响应（含 httpStatus）。
- **描述符语义规范**：`ok` / `notFound(code:-2)` / `validation(code:-1)`，与原始 `sendNotFound` / `sendValidationError` 一一对应。
- **导出端点特殊化**：success 时由 controller 直接渲染 CSV 并结束响应（不经 `respond()`），避免重复 res.json；内存错误分支走统一 respond。
- **端点顺序**：列表 `/`、`/stats`、`/export` 均注册在 `/:id` 之前，避免被参数路由遮蔽（原文件即如此，保持原序）。

## ⚠️ 性质确认结论：demo-data.js 判定「工具类路由，暂不拆分」
响应本轮前置问题，对下一个候选 `demo-data.js`（642 行）做性质核查后**跳过**：
1. 它是「演示数据管理工具」（`GET /status`、`POST /generate`、`POST /clear`），**直接写 10 张生产表**（training_records/violation_records/hazards 等），属生产写边界敏感区；
2. 存在单测 `__tests__/personnel-insurance.unit.test.js` **`fs.readFileSync` 直接读其源码内容**（断言 `key: 'personnel_insurance'`、`disabled: true` 等），若按常规下沉 MODULES 会破坏断言、需联动改测试；
3. 业务高度自包含（随机生成器），不具备 CRUD 域那种可复用拆分价值。

→ 搁置为「工具类路由」；后续候选改为规章制度域（本单）与 standards/judgment 之外的常规业务域。

## 独立复核（本单自查）
- **语法**：`node --check` 四文件全过。
- **冒烟**（`_smoke_regulations.cjs`）：6 只读端点可达 + 契约形状（list/stats/export CSV/detail notFound/attachments/versions）、service 层 5 组「校验提前返回/0-row no-op」描述符（create 空、update/remove/removeAttachment 不存在、upload 缺文件）、404 —— 全部通过；create(仅title) 联机模式跳过（避免落库）。
- **新旧对比**（`_compare_regulations.cjs`，对照 git HEAD 原始版）：只读端点 `/`、`/stats`、`/:id`、`/:id/attachments`、`/:id/versions` **双 200 逐字节 IDENTICAL**；`/export` CSV body 逐字节 IDENTICAL + 结构前缀校验；写端点 service 层 5 组形状一致；不存在路径 **双 404** —— 全部一致。
- **回归**：`npm test` 26 套件中 3 套失败（insurance-file / import-personnel-behavior / personnel-insurance，22 处），经 `git stash` 还原 regulations.js 复跑**结果相同（22 fails）**，判定为**预存在的环境/保险导入域问题，与本单无关**；拆分未引入新回归。
- **引用核查**：外部对 `routes/regulations` 的引用仅 `app.js` 一处（作为路由挂载），结构不变。

## 约定
- 冒烟 `_smoke_regulations.cjs` 与对比 `_compare_regulations.cjs` 为临时验证件，保留于 `server/` 供回归。
- 本单未触碰生产表 / 端口 / WPS 边界；验证全部为只读 + 缺失参数 before-write return + 0-row no-op，未真实落库。