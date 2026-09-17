# CF-WPS-17：生产用台账扩展为网格长巡查正式承载表 — 验证报告

> 执行时间：2026-09-16（续 CF-WPS-14/15/16 之后）
> 执行方式：审计 → 真实 WPS API 读回 → 依赖审计 → 增量新增字段 → 读回验证 → H5 字段映射调整 → Dry-run → 回归/扫描/污染检查 → 报告 → 停止
> 诚实原则：禁止虚构 Cloudflare 部署；禁止把本地验证写成公网验证；生产业务记录零写入。

---

## 1. 执行摘要

CF-WPS-17 的核心目标（将现有 WPS「生产用台账」扩展为网格长巡查正式承载表）**已完成并验证**：

- **正式承载表定位**：经真实 WPS API 确认，唯一「生产用台账」= `file_id=cn229thwalDs` / `sheet_id=15`，`records=0`，与 CF-WPS-16 读取结果**一致**，无歧义。
- **字段扩展**：在 Sheet 15 原有 30 个三违字段基础上**增量新增 8 个**网格长巡查字段（§五），现有三违字段**零修改、零删除**（30→38）。
- **字段真实读回验证**：POST-create 后再次 GET schema，8 字段全部存在且类型正确。
- **H5 字段映射调整**：`worker/index.js` 提交处理器按 `target.production` 分叉构建 record；对 Sheet 15 复用现有安全列（`巡查人员ID`↔employee_code、`三违行为`↔三违行为描述），不自动创建缺失列。
- **Dry-run**：构造完整正式 payload，11 个键全部命中 Sheet 15 现有列/新增列，受保护字段（employee_code/grid/来源/创建时间）服务端定值、客户端伪造被忽略，发送前拦截，**未写任何业务记录**。
- **Cloudflare 部署**：本环境仍无 CF 账户/凭据（`wrangler whoami` 未认证），依 §四如实报 `CLOUDFLARE_DEPLOYMENT_STATUS=BLOCKED`；公网 E2E / CORS / bcrypt-CPU 等公网项 `NOT_EXECUTED`。
- **生产污染**：S3=2063 / S11=1291 / S13=3 / S14=3 / S15=0，全部基线保留，污染=0。

**判定：`CF-WPS-17_STATUS = PASS_WITH_RISK`**——字段扩展这一本阶段核心交付已完成并验证；Cloudflare 公网部署因环境无凭据而 BLOCKED（非代码缺陷）。

---

## 2. 本阶段业务决定（§二，已冻结）

1. Cloudflare：任务书声明账户已具备，但实测沙箱 `wrangler whoami` 未认证 → 公网部署 BLOCKED（诚实，不伪造）。
2. 正式巡查 WPS 表：使用现有「生产用台账」= Sheet 15（file `cn229thwalDs`），**不新建**正式 Sheet。
3. 生产写入：本阶段 `MOBILE_PATROL_PRODUCTION_ENABLED=false` / `PRODUCTION_WRITE_AUTHORIZED=false` / `WPS_PATROL_FIELDS_CONFIRMED=false`，**保持关闭**；仅做 schema 扩展 + dry-run，不写业务记录。
4. 登录限流：`BEST_EFFORT_IMPLEMENTED`，不升级分布式、不降 bcrypt。
5. 禁止破坏现有三违结构：只新增，不改名/不改类型/不删字段。

---

## 3. Cloudflare 账户 / 部署状态

`wrangler whoami` → **未认证**；env 无 `CF_API_TOKEN`；`~/.cloudflare` 不存在。
→ `CLOUDFLARE_DEPLOYMENT_STATUS = BLOCKED` / `WORKER_DEPLOYMENT_STATUS = BLOCKED` / `PAGES_DEPLOYMENT_STATUS = BLOCKED`。
（与 CF-WPS-14/15/16 一致，属环境凭据缺失，非代码问题。）

---

## 4. Worker 部署状态

未部署（无 Cloudflare 凭据）。代码侧 `worker/index.js` 已就绪（含 §一.5 字段映射分叉）。

---

## 5. Pages 部署状态

未部署。静态 H5（`grid-mobile-cloudflare/frontend/`）与 Pages Functions（`pages/functions/api/[[route]].js`）就绪但需 CF 凭据方可 `wrangler pages deploy`。

---

## 6. Pages Functions 状态

代码就绪：`onRequest` 反代 `/api/*` 至 `env.WORKER_ORIGIN`，缺值时 fail-closed 503。`WORKER_ORIGIN` 待 Cloudflare 部署后配置。

---

## 7. Secrets 状态

- 敏感项（WPS_CLIENT_ID/SECRET、JWT_VERIFY_SECRET、WORKER_SESSION_SECRET）仅经 `wrangler secret put`，不写入 `wrangler.toml`/前端/`.env` 明文/日志/响应。
- 源码扫描：`worker/index.js`、前端、`wrangler.toml` 均无字面 secret（见 §二十一 安全扫描）。
- `SECRET_CONFIG_STATUS`：本环境无 Cloudflare，故 Secrets 未在 CF 配置；代码使用方式合规。
→ 本阶段 `SECRET_EXPOSURE_STATUS = PASS`（生产代码 CLEAN；测试夹具仅用 `mock-*` 占位值）。

---

## 8. 正式「生产用台账」定位结果

真实 API 读回（`GET /v7/coop/dbsheet/cn229thwalDs/schema`，零写入）：

```
=== sheet_id=15 「生产用台账」 records=0 ===
```
- 全文件仅 1 个名为「生产用台账」的 Sheet → `WPS_PATROL_TARGET_STATUS = UNIQUE_FOUND`（无 AMBIGUOUS / NOT_FOUND）。
- 与 CF-WPS-16 读取结果一致（file_id / sheet_id / 字段结构 / records=0 均相同）。

---

## 9. file_id / sheet_id

- `WPS_DBSHEET_FILE_ID = cn229thwalDs`
- 正式 Sheet：`WPS_PATROL_TARGET_SHEET_NAME = 生产用台账`，`WPS_PATROL_TARGET_SHEET_ID = 15`

---

## 10. 字段清单

**现有三违字段（30 个，未改）：** 昵称2/分组名称/姓名/所属岗位/网格等级/日期/三违照片:图片1-3/三违行为/违章人姓名/违章人性别/违章人年龄/整改后照片:图片1/当日是否报名/标记/是否补交/提交时间/编号/来源日期/巡查人员ID/上报状态/车辆类型/违章类型结果/是否需要整改/整改人/三违照片链接/整改后照片链接/示意图链接/查询数据编号。

**§五 新增 8 字段（已真实创建，读回验证通过）：**

| # | 字段名 | fieldId | 类型 | 来源 |
|---|--------|---------|------|------|
| 1 | 网格 | [Bs] | MultiLineText | 服务端按 employee_code + Sheet11 解析 |
| 2 | 问题描述 | [Bt] | MultiLineText | 客户端提交（≤500 服务端拒超长） |
| 3 | 问题类型 | [Bu] | MultiLineText | 客户端提交（候选清单 env 配置化） |
| 4 | 是否三违 | [Bv] | MultiLineText | 客户端提交（是/否，服务端校验） |
| 5 | client_request_id | [Bw] | MultiLineText | 客户端提交（幂等标识，服务端校验） |
| 6 | 巡查时间 | [Bx] | Date | 客户端提交（服务端格式校验） |
| 7 | 来源 | [By] | MultiLineText | **服务端固定 h5-mobile** |
| 8 | 创建时间 | [Bz] | Date | **服务端生成** |

> 注：原「日期」[I] 保持 MultiLineText 原类型/语义未动（§四），新增「巡查时间」为独立 Date 列。

---

## 11. H5 → 正式 Sheet 字段映射

| H5/Worker 概念 | Sheet 15 列 | 备注 |
|----------------|-------------|------|
| employee_code（Session.sub） | 巡查人员ID [X] | **安全复用现有列**（§六，语义=巡查人员标识，有明确证据）；不新建 employee_code 列 |
| 姓名（Session 快照） | 姓名 [F] | 现有列 |
| 巡查时间 | 巡查时间 [Bx] | 新增 Date |
| 网格（服务端解析） | 网格 [Bs] | 新增 |
| 问题描述 | 问题描述 [Bt] | 新增 |
| 问题类型 | 问题类型 [Bu] | 新增 |
| 是否三违 | 是否三违 [Bv] | 新增 |
| 三违行为描述 | 三违行为 [M] | **安全复用现有列**（§六，语义一致） |
| 来源 | 来源 [By] | 新增，服务端固定 |
| client_request_id | client_request_id [Bw] | 新增 |
| 创建时间 | 创建时间 [Bz] | 新增，服务端生成 |
| 涉及人员 | — | **无语义一致安全列**；本阶段不写入（§四/§六 不自动创建、不复用语义不一致旧字段），列为业务决策缺口 |

读视图书（`patrolRecordView`）已做容错：`employee_code ?? 巡查人员ID`、`三违行为描述 ?? 三违行为`、`照片状态 ?? PENDING_EXTERNAL`，对测试表/正式表均安全。

---

## 12. Dry-run 结果

脚本 `test/cfwps17-dryrun.mjs`（等价于 Worker 生产分支构造，构造后拦截，不调 `records/create`）：

- 11 个正式 record 键全部命中 Sheet 15 现有/新增列，`FIELD_MAP_PROBLEMS = 0`。
- 受保护字段断言全 PASS：employee_code 取 Session.sub、网格取服务端解析、来源硬编码 h5-mobile、创建时间服务端生成；`grid_id`/`inspector_employee_id`/`attribution_status`/`responsibility`/`测试编号`/`测试状态`/`照片状态` 均未进入正式 record。
- 恶意 body 伪造（employee_code=99999999、grid=_admin_grid、source=evil-origin 等）均被忽略。
→ `FORMAL_SHEET_DRY_RUN_STATUS = PASS`。

---

## 13. 公网登录 E2E

`REAL_PUBLIC_BROWSER_E2E = NOT_EXECUTED`（无 Cloudflare 公网部署）。

---

## 14. 真实手机浏览器 E2E

`PUBLIC_H5_E2E_STATUS = NOT_EXECUTED`（无公网）。本地等价验证：真实 Chrome 跑真实 Worker handler 33/33 PASS（见 §二十三），明确标注 LOCAL 非公网。

---

## 15. Cross-user 隔离

`CROSS_USER_RECORD_ISOLATION = NOT_EXECUTED`（无公网；隔离逻辑沿用 CF-WPS-14/15/16 已验证的 `fieldText(f['employee_code'])==payload.sub` 过滤）。

---

## 16. CORS 公网验证

`CORS_PUBLIC_STATUS = NOT_EXECUTED`（无公网）。CORS 逻辑（`corsOrigin()`/`corsHeaders()` 白名单，`CF_ALLOWED_ORIGINS` 空=拒绝跨域）本地回归已覆盖。

---

## 17. bcrypt Cloudflare CPU

`BCRYPT_CLOUDFLARE_CPU_STATUS = NOT_EXECUTED`（无 Cloudflare runtime）。bcrypt cost 沿用既有（未降）。

---

## 18. 登录限流

`PUBLIC_LOGIN_RATE_LIMIT_STATUS = BEST_EFFORT_IMPLEMENTED`（内存级 per-isolate 限速，10min/30 次失败→429）。不升级分布式、不新增 KV/DO/Redis（§四/§十）。

---

## 19. 幂等性

`IDEMPOTENCY_STATUS = LIMITED`：基于 `client_request_id` 对目标 Sheet `list_by_page` O(n) 预查（≤20 页），重复提交返回 `deduplicated:true`。未重设计分布式幂等（§十四）。

---

## 20. 照片状态

`PHOTO_STATUS = PENDING_EXTERNAL`（CF-WPS-12B 终局结论）。H5 拍照 UI 保留，但正式/测试写入均不落 WPS 预览列；不接 R2/第三方/隧道。

---

## 21. 安全扫描

- **源码扫描**（`worker/index.js` + `frontend/` + `wrangler.toml`，排除 node_modules）：无字面 secret 赋值；Secrets 仅经 `env.*`/`wrangler secret put`。
- **前端 bundle/html**：无 `sk-*` / `client_secret` / `access_token` 暴露。
- **测试夹具**：`cfwps11/12/13.test.mjs`、`http-smoke.mjs` 仅含 `mock-app-id`/`mock-app-secret`/`smoke_jwt_secret` 占位值，非真实凭据。
→ `SECRET_EXPOSURE_STATUS = PASS`（生产代码 CLEAN）。

---

## 22. WPS 数据污染检查

| Sheet | 部署/测试前 | 结束后 | 结论 |
|-------|------------|--------|------|
| 3 三违生产台账 | 2063 | 2063 | 零变化 |
| 11 员工花名册 | 1291 | 1291 | 零业务写入 |
| 13 H5测试 | 3 | 3 | 回基线 |
| 14 身份表 | 3 | 3 | 回基线 |
| 15 生产用台账 | 0 (仅加字段) | 0 (仅加字段) | 零业务记录 |

→ `PRODUCTION_WPS_POLLUTION = 0`。

---

## 23. 回归测试

- 本地真实浏览器 E2E（`cfwps14-e2e.mjs`）：**33 PASS / 0 FAIL**。
- Worker 单测回归（8 套）：cfwps08:8/8、cfwps10:8/8、cfwps11:38、cfwps12:25、cfwps13:46、oauth-flow:通过、jwt-bridge:3/3、http-smoke:3/3 → **REGRESSION_STATUS = PASS**。
- 新增 `cfwps17-add-formal-fields.mjs`（增量建字段，幂等）、`cfwps17-dryrun.mjs`（dry-run）均 PASS。

---

## 24. 风险

1. **Cloudflare 部署缺失**：无账户/凭据，公网 E2E/CORS/bcrypt-CPU 无法实测（环境风险，非代码）。
2. **涉及人员未落库**：Sheet 15 无语义一致安全列，本阶段 H5「涉及人员」字段不写入正式表（功能缺口，待业务决策是否新增列或映射至违章人姓名）。
3. **映射以字段名为键**：WPS `create` 的 `fields_value` 按字段名匹配；若 WPS 后端在未来对同名列做重命名/合并，须重新对齐（当前已读回验证一致）。

---

## 25. 未完成事项（业务决策缺口）

- `BUSINESS_DECISION_REQUIRED=true`：
  1. 提供 Cloudflare 账户/Token → 解除公网部署 BLOCKED。
  2. 决策「涉及人员」正式列（新增列 vs 映射违章人姓名）。
  3. 上线前确认是否放开三个生产开关（`MOBILE_PATROL_PRODUCTION_ENABLED`/`PRODUCTION_WRITE_AUTHORIZED`/`WPS_PATROL_FIELDS_CONFIRMED`）——本阶段**未放开**。
  4. 上线前补分布式登录限流（当前仅 BEST_EFFORT）。
  5. 上线前实测 bcrypt `cpu_ms`（当前无 Cloudflare runtime 可测）。

---

## 26. 回滚方式

- **字段回滚**：若需撤销新增 8 字段，经 WPS API `DELETE /v7/coop/dbsheet/{file_id}/sheets/{sheet_id}/fields`（同域端点，`fields` 数组）删除 [Bs][Bt][Bu][Bv][Bw][Bx][By][Bz]；现有 30 三违字段不受影响。
- **代码回滚**：`worker/index.js` 提交分叉与 `patrolRecordView` 容错为最小增量改动，可 `git revert` 对应提交；不影响测试路径（33/33 已验证）。
- **数据**：Sheet 15 仅加字段、零记录，无需数据回滚。

---

## 27. 最终状态（§二十三 状态字段）

```
CF-WPS-17_STATUS                = PASS_WITH_RISK
CLOUDFLARE_DEPLOYMENT_STATUS    = BLOCKED
PAGES_DEPLOYMENT_STATUS         = BLOCKED
WORKER_DEPLOYMENT_STATUS        = BLOCKED
PUBLIC_H5_E2E_STATUS            = NOT_EXECUTED
REAL_PUBLIC_BROWSER_E2E         = NOT_EXECUTED
CROSS_USER_RECORD_ISOLATION     = NOT_EXECUTED
PUBLIC_LOGIN_RATE_LIMIT_STATUS  = BEST_EFFORT_IMPLEMENTED
BCRYPT_CLOUDFLARE_CPU_STATUS    = NOT_EXECUTED
CORS_PUBLIC_STATUS              = NOT_EXECUTED
SECRET_EXPOSURE_STATUS          = PASS
FORMAL_PATROL_SHEET_STATUS      = UNIQUE_FOUND      (file cn229thwalDs / sheet 15 / records=0)
FORMAL_SHEET_FIELD_STATUS       = PASS              (8 字段已加，类型正确)
FORMAL_SHEET_DRY_RUN_STATUS     = PASS              (11 键全映射，受保护字段拦截，未写)
PRODUCTION_WRITE_STATUS         = BLOCKED           (三开关 false，零业务记录)
PRODUCTION_WPS_POLLUTION        = 0
IDEMPOTENCY_STATUS              = LIMITED
PHOTO_STATUS                    = PENDING_EXTERNAL
REGRESSION_STATUS               = PASS              (8/8 + E2E 33/33)
SHEET15_DEPENDENCY_AUDIT_STATUS = PASS

MOBILE_PATROL_PRODUCTION_ENABLED = false
PRODUCTION_WRITE_AUTHORIZED      = false
WPS_PATROL_FIELDS_CONFIRMED      = false
WPS_PATROL_TARGET_SHEET         = 生产用台账 (sheet 15)
```

---

## 28. 下一阶段建议

- 若业务提供 Cloudflare 凭据：进入 CF-WPS-18，完成真实公网部署 + 公网手机 E2E + CORS + bcrypt-CPU 实测，并在明确授权后放开生产写入三开关（先 dry-run 后小批量）。
- 若「涉及人员」需落库：在 CF-WPS-18 前由业务决定列方案（新增独立列，或映射违章人姓名），再补映射。
- 其余（附件 PENDING_EXTERNAL、登录限流 BEST_EFFORT、幂等 LIMITED）维持现状，待单独授权升级。

> 按 §二十四停止条件：CF-WPS-17 完成后停止，不自动进入 CF-WPS-18；不自行打开生产写入、不自行建字段（除本阶段已授权的 8 字段）、不自行接存储、不自行降 bcrypt、不自行实现分布式限流。CF-WPS-18 提示词见同目录存档（未执行）。
