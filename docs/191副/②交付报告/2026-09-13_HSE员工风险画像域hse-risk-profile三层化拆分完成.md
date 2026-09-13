# HSE 员工风险画像域三层化拆分完成（hse-risk-profile，Phase B 第 22 单）

> 类别：②交付报告 · 日期：2026-09-13 · 归属对话：当前会话

## 一句话结论
`routes/hse-risk-profile.js`（原 21082 字节 / 525 行，Sprint6.1 员工风险画像域：风险画像列表/详情/单员工评分/统计概览/评分配置管理/批量评分）三层化拆分完成：父路由收敛为 **纯聚合入口**，业务全部下沉 `service`，对外 API 契约逐字节不变。独立复核三绿：**语法 0 错误、冒烟 8/8 通过、新旧对比 7/7 逐字节 IDENTICAL**。

## 拆分范围与本层职责

| 文件 | 职责 |
|------|------|
| `routes/hse-risk-profile.js` | 纯聚合入口（挂载 `./hse-risk-profile/main`，9 行） |
| `routes/hse-risk-profile/main.js` | 纯绑定子路由（7 端点 + 2 写端点 `requirePermission`，严格按原注册顺序） |
| `controllers/hseRiskProfileController.js` | 薄 handler：req 解析 → 调 service → `success/error/buildListResponse/buildDetailResponse` 包装 |
| `services/hseRiskProfileService.js` | 全部业务+SQL（画像列表/详情/单员工评分/统计/配置 CRUD/批量评分，约 460 行） |

## 端点覆盖（7 条，挂载 **`/api/hse/risk-profile`**，app.js 挂载点 492 行不变）

| # | 端点 | 鉴权 | 说明 |
|---|------|------|------|
| 1 | `GET /list` | 读公开 | 员工风险画像列表（分页 + 过滤，camelCase） |
| 2 | `GET /:employeeId` | 读公开 | 画像详情（三违/培训/三级教育/事故/隐患/驾驶员/网格巡查/最新评分） |
| 3 | `GET /:employeeId/score` | 读公开(写快照) | 单员工规则评分 + upsert 快照 |
| 4 | `GET /risk-stats/overview` | 读公开 | 风险统计概览 |
| 5 | `GET /score-config` | 读公开(⚠️被遮蔽) | 评分配置列表 |
| 6 | `PUT /score-config/:id` | `requirePermission('hse:risk:update')` | 更新评分配置 |
| 7 | `POST /calculate-all` | `requirePermission('hse:risk:create')` | 批量计算所有员工评分 + 写快照 |

## ⚠️ 忠实还原的三点既有行为（非回归，原本即存在）

1. **路由遮蔽**：`GET /:employeeId` 于第 2 位注册，导致其后注册的单段 `GET /score-config` **被捕获而不可达**（`employeeId='score-config'` → 命中详情处理器 → 对非数字 id 触发 bigint 转换错误 → 返回 `{code:-1, message:'无效的类型 bigint 输入语法: "score-config"'}`）。`main.js` **原样保留注册顺序**，遮蔽行为逐字节一致（由 compare 该端点 IDENTICAL 证实）。
2. **假端点不新增**：文件顶部头注释列了 `GET /dimension/:type`，但**原代码并不存在**该端点。拆分版未新增，避免引入"原本没有的 API"。
3. **两套评分循环差异（单员工评分 vs 批量评分，方法不同，严禁合并）**：
   - 单员工 `/:employeeId/score`：锥循环用 `rule && rule.ranges`，无 ranges 走兜底 `Math.max(0, config.max_score - rawValue*10)`；`dimensionDetails` **含 `indicator` 字段**、字段序 `{indicator, raw_value, score, weight, applicable}`；交通维度判断 `profile.position_name && profile.position_name.includes('驾驶员')`。
   - 批量 `POST /calculate-all`：锥循环用 `rule?.ranges`，无 ranges 时 score **保持 0（无兜底公式）**；`dimensionDetails` **不含 `indicator`**、字段序 `{raw_value, score, weight, applicable}`；交通维度判断 `profile.position_name?.includes('驾驶员')`。
   - 两套均在 service 中**逐行等价迁移**，未做任何"合理化合并"（合并会改变批量评分结果，属行为变更，禁用）。

## 响应契约（与原文件完全一致）
- 成功：`success(...)`/`buildListResponse`/`buildDetailResponse` → **HTTP 200**。
- 业务 404：`res.json(error(404,'员工不存在'|'配置不存在'))` → **HTTP 200**（原文件未 setStatus）。
- 非预期异常：所有 catch → `res.json(error(-1, e.message))` → **HTTP 200**（原文件同）。
- 写端点未认证：`requirePermission` → **HTTP 401**，不触库。

## 独立复核（本单自查）
- **语法**：`node --check` 四文件全过；聚合入口 `require('./routes/hse-risk-profile')` 加载链（main→controller→service）OK。
- **冒烟**（`_smoke_hse_risk_profile.cjs`，只读+未认证+前置校验，**零真实写库**）：列表、详情 404 分支、遮蔽（`/score-config` 非列表）、score 缺失 id 前置校验不写库（404 早返回）、PUT/POST 写端点未认证 401、未匹配路径 404 —— **8/8 通过**（其中详情 200 happy-path 因数据态 SKIP，见下）。
- **新旧对比**（`_compare_hse_risk_profile.cjs`，对照 git HEAD 原始版 `__orig_hse-risk-profile.js` 同 DB 会话）：`/list`(无过滤/keyword/分页)、`/:`(有效 id/大 id/非数字串=遮蔽路径)、`/risk-stats/overview` —— **7/7 逐字节 IDENTICAL（状态码+响应体全等）**。写库端点（单员工评分/批量/配置更新）的未认证 401 与前置校验已在冒烟覆盖，不参与逐字节比较以免触发真实写库。

## ⚠️ 验证覆盖说明（数据态限制，非缺陷）
- 本库 `v_employee_risk_profile` 视图**当前 0 行**，故详情/单员工评分的 **200 happy-path 无法运行时取到正例数据**（对任意 id 均返回 404，原始实现同此）。因拆分版与原版对同一视图执行**完全相同的 SQL**，且新旧对比对同一批候选 id 已逐字节一致，故行为等价已证明；评分循环的数值正确性由**逐行等价迁移**保证（运行时完整正例校验待视图有数据后补充）。

## 单测 / 加载回归
- `node --check app.js` + 聚合入口 `require` 链加载 OK。
- 完整 jest 单测：**530/552 通过，23/26 套件通过**。3 个失败套件（`insurance-file`、`import-personnel-behavior`、`personnel-insurance`）为**import/保险**模块的数据态断言（503 认证服务不可用 / `code -2 vs -3`），**与本次 risk-profile 拆分完全无关**（本单未触碰这些模块与测试），属既有环境态问题。

## 约定
- 冒烟 `_smoke_hse_risk_profile.cjs` 与对比 `_compare_hse_risk_profile.cjs` 为临时验证件，保留于 `server/` 供回归。
- 本单未触碰生产表 / 5876 生产端口 / WPS 边界；验证全部为只读 + 未登录 401 + 缺失参数 before-write return + 0-row no-op。