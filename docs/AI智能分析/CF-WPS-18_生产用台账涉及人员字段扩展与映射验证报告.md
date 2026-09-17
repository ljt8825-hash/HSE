# CF-WPS-18：生产用台账增加「涉及人员」字段 + 完整映射回归验证报告

> 执行时间：2026-09-16（CF-WPS-17 之后）
> 执行方式：审计 → 真实 WPS API 读回 Sheet 15 → 增量新增「涉及人员」→ 读回验证 → 39 字段完整性 → Worker 生产映射接入 → 数据链/多人/空值/长度/employee_code round-trip 验证 → 受保护字段 → dry-run → 回归/污染/安全扫描 → Git 检查 → 报告 → 停止
> 诚实原则：禁止虚构 Cloudflare 部署；禁止把本地验证写成公网验证；生产业务记录零写入（MOBILE_PATROL_PRODUCTION_ENABLED=false）。

---

## 1. 执行摘要

CF-WPS-18 的**唯一业务目标**（为正式承载表 Sheet 15 增加「涉及人员」字段并完成完整映射回归验证）**已完成并验证**：

- **字段新增**：经真实 WPS API 为 `file_id=cn229thwalDs` / `sheet_id=15`「生产用台账」增量新增 `涉及人员`（MultiLineText），实际 fieldId = **[B0]**；原 30 个三违字段与 CF-WPS-17 的 8 个字段**零修改、零删除**，Sheet 15 由 38 → **39 字段**。
- **数据链验证**：通过已批准的**测试 Sheet 13**（与 Sheet 15 同字段名机制、同 MultiLineText 类型）完成真实 WPS 写→读往返：涉及人员 = 张三 / 张三、李四 / 张三、李四、王五 / 空值 / 200 字符边界 全部 round-trip 一致；201 字符超长被 Worker 校验拒绝。
- **employee_code round-trip**：以 Sheet 13 `employee_code` 列（MultiLineText，与 Sheet 15「巡查人员ID」[X] 同类型）验证 `00369234` / `A12B` / `0000123` / `X9-0` 往返无损——证明「巡查人员ID」安全保存 employee_code（含前导 0、含字母，无数值化/截断/科学计数法）。
- **Worker 映射接入**：`worker/index.js` 生产分支 record 已加入 `'涉及人员': values.violationPeople`（来自允许的 H5 输入），受保护字段仍全部服务端定值。
- **Dry-run**：构造完整 Sheet 15 生产 record，全部字段名命中实时 Schema（39 字段），发送前拦截，**未写任何业务记录**。
- **Cloudflare 部署**：本环境仍无 CF 凭据（`wrangler whoami` 未认证）→ `CLOUDFLARE_DEPLOYMENT_STATUS=BLOCKED`（与 CF-WPS-14/15/16/17 一致，属环境凭据缺失，非代码缺陷）。
- **生产污染**：S3=2063 / S11=1291 / S13=3（测试表清理回基线）/ S14=3 / **S15=0（仅加字段，零业务记录）**，污染=0。

**判定：`CF-WPS-18_STATUS = PASS_WITH_RISK`**——本阶段核心交付（涉及人员 扩展 + 完整映射验证）已完成并验证；Cloudflare 公网部署因环境无凭据而 BLOCKED（不影响本阶段字段/映射目标）。

---

## 2. 本阶段范围

- 仅解决「涉及人员」字段缺口（§二）。
- 严禁事项（§三 26 条）逐条遵守：未删除/重命名/改类型任何现有字段；未新建 Sheet；未改 Sheet 3/11/13/14；未改 PostgreSQL / 三违业务 / 责任链 / 扣分 / PC 台账 / WPS→PG Pull / 网格归因；未引入第三方存储 / 破解 Attachment；未开启生产写入；未降 bcrypt；未引入分布式限流；未用 WPS user_id 作业务身份；未做姓名/手机号模糊匹配。

## 3. 用户授权事项

- 用户明确授权：在 Sheet 15 增加「涉及人员」（MultiLineText，≤200 字符）。
- 唯一剩余字段缺口（`涉及人员`）由本阶段闭环，正式承载表 39 字段结构完成。

## 4. Sheet15 基线（§四，真实只读 API 读回）

`GET /v7/coop/dbsheet/cn229thwalDs/schema`（零写入）：

```
=== sheet_id=15 「生产用台账」 records=0 ===
  [C]..[g] 原 30 个三违字段（含 [X] 巡查人员ID MultiLineText / [M] 三违行为 / [N] 违章人姓名 / [F] 姓名）
  [Bs] 网格 [Bt] 问题描述 [Bu] 问题类型 [Bv] 是否三违 [Bw] client_request_id
  [Bx] 巡查时间(Date) [By] 来源 [Bz] 创建时间(Date)   ← CF-WPS-17 八字段
  涉及人员 = 不存在（基线确认）
```

- 唯一「生产用台账」= sheet 15，file `cn229thwalDs`，与 CF-WPS-16/17 读取一致，无歧义。
- records=0（无生产业务数据）。

## 5. 新增字段信息

| 字段名 | 类型 | fieldId | 用途 |
|---|---|---|---|
| 涉及人员 | MultiLineText | **[B0]** | 承载手机端网格长巡查填写的涉及人员（多人逗号分隔，≤200 字符）；不映射到 违章人姓名/姓名/三违行为/巡查人员ID |

## 6. 实际 fieldId

- `WPS_SHEET15_INVOLVED_PERSON_FIELD_ID = B0`

## 7. 最终 39 字段结构

- 原 30 个三违字段（[C]–[g]，含附件列 [J][K][L][Q] 与 [X] 巡查人员ID 等）：**100% 保留，类型/语义未变**。
- CF-WPS-17 新增 8 个（[Bs]–[Bz]，巡查时间/创建时间 为 Date）：**100% 保留**。
- CF-WPS-18 新增 1 个（[B0] 涉及人员）：**新增**。
- 合计 **39 字段**（实测 schema 读回确认；创建前 38 → 创建后 39，+1，零删除/重命名/改类型）。

## 8. H5 → Worker → WPS 映射表

| H5/业务语义 | Worker 服务端定值来源 | Sheet 15 列 | fieldId | 类型 |
|---|---|---|---|---|
| employee_code（业务身份） | Session.sub（非 body） | 巡查人员ID | [X] | MultiLineText |
| 姓名 | Session 快照 | 姓名 | [F] | MultiLineText |
| 巡查时间 | 校验后的 H5 输入 | 巡查时间 | [Bx] | Date |
| 网格 | 服务端按 employee_code + Sheet11 解析 | 网格 | [Bs] | MultiLineText |
| 问题描述 | H5 输入（≤500） | 问题描述 | [Bt] | MultiLineText |
| 问题类型 | 配置化清单（H5 输入） | 问题类型 | [Bu] | MultiLineText |
| 是否三违 | H5 输入（是/否） | 是否三违 | [Bv] | MultiLineText |
| 三违行为描述 | H5 输入（是否三违=是时必填，≤300） | 三违行为 | [M] | MultiLineText |
| **涉及人员** | **H5 输入（≤200，本阶段新增）** | **涉及人员** | **[B0]** | **MultiLineText** |
| 来源 | 硬编码 `h5-mobile` | 来源 | [By] | MultiLineText |
| client_request_id | H5 输入（幂等） | client_request_id | [Bw] | MultiLineText |
| 创建时间 | 服务端生成 | 创建时间 | [Bz] | Date |

受保护字段（客户端伪造一律忽略）：employee_code（来自 Session.sub）、grid_id、inspector_employee_id、attribution_status、responsibility、deduction、review。

## 9. 涉及人员测试（§七）

经测试 Sheet 13 真实 WPS 往返（机制等同 Sheet 15，类型一致）：

| 案例 | 输入 | 读回 | 结果 |
|---|---|---|---|
| B 单人 | 张三 | 张三 | PASS |
| C 双人 | 张三、李四 | 张三、李四 | PASS |
| D 三人 | 张三、李四、王五 | 张三、李四、王五 | PASS |
| D-empty（是否三违=否） | 空 | 空 | PASS |

写入值 === 读取值，无丢失、无错位；均未写入「违章人姓名」「姓名」「三违行为」「巡查人员ID」。

## 10. 多人测试（§八）

案例 A/B/C/D 见上表，多人逗号分隔完整保留；非三违时可为空；是否三违=是 时按 CF-WPS-13 规则校验；长度 ≤200；无字段错位。

## 11. 空值测试（§八）

是否三违=否 时 涉及人员 可空，round-trip 为空，PASS。

## 12. 长度边界测试（§八 E/F）

- E：200 字符（「张」×200）→ 校验通过、round-trip 一致，PASS。
- F：201 字符 → `validatePatrolBody` 判定 `violation_people` 超长，返回校验错误（`errors.push('violation_people')`），**拒绝提交**，PASS。
- 注：长度上限由 `PATROL_PEOPLE_MAX=200`（worker/index.js:1145）强制，前端输入不可绕过。

## 13. employee_code round-trip（§九）

以 Sheet 13 `employee_code` 列（MultiLineText，与 Sheet 15「巡查人员ID」[X] 同类型）验证「巡查人员ID 保存 employee_code」的类型安全性：

| 值 | 读回 | 结果 |
|---|---|---|
| 00369234（含前导0） | 00369234 | PASS（前导 0 无损） |
| A12B（含字母） | A12B | PASS |
| 0000123（全前导0） | 0000123 | PASS |
| X9-0（含连字符） | X9-0 | PASS |

无数值化、截断、格式化、科学计数法、类型转换。`EMPLOYEE_CODE_FIELD_COMPATIBILITY = PASS`。

## 14. 前导 0 测试（§九 H）

见 §13：`00369234` / `0000123` 均往返无损，证明「巡查人员ID」[X]（MultiLineText）安全保存前导 0 employee_code。

## 15. protected fields 测试（§十二）

构造恶意 body（employee_code=ATTACK / inspector_employee_id=999999 / grid_id=999999 / attribution_status=confirmed / responsibility=ATTACK / deduction=9999 / review=approved / 涉及人员=张三、李四），按 Worker 生产分支构建 record：

- employee_code → 来自 Session.sub（00369234），非 body.ATTACK；record 无 `employee_code` 键（映射为 巡查人员ID）。
- record 中**不存在** inspector_employee_id / grid_id / attribution_status / responsibility / deduction / review 任一受保护键。
- 涉及人员 → 正常写入（来自允许的 H5 输入）。
- 全部 PASS。

## 16. dry-run（§八 J）

构造完整 Sheet 15 生产 record（含 涉及人员），逐键比对实时 Sheet 15 Schema（39 字段）：全部字段名命中，无未知列；构造后**不调用任何 WPS 写接口**（仅构造+校验），发送前拦截。`DRY_RUN_STATUS = PASS`。

## 17. Cloudflare 状态（§十四）

`wrangler whoami` → **未认证**；env 无 `CF_API_TOKEN`；`~/.cloudflare` 不存在。
→ `CLOUDFLARE_DEPLOYMENT_STATUS = BLOCKED` / `WORKER_DEPLOYMENT_STATUS = BLOCKED` / `PAGES_DEPLOYMENT_STATUS = BLOCKED`。
任务书 §二① 声明「账户已具备」，但实测沙箱未认证，依 §四如实报 BLOCKED，**未伪造部署、未使用虚假 pages.dev 地址、未声称公网 E2E 通过**。
→ `PUBLIC_H5_E2E_STATUS = NOT_EXECUTED`（无公网环境）。

## 18. bcrypt 状态（§十六）

本环境无真实 Cloudflare Worker runtime，无法实测 cost=10 CPU。
→ `BCRYPT_CLOUDFLARE_CPU_STATUS = NOT_EXECUTED`（不推测 PASS；保持 cost=10 未降）。

## 19. 登录限流状态（§十五）

保持用户已确认决策：`PUBLIC_LOGIN_RATE_LIMIT_STATUS = BEST_EFFORT_IMPLEMENTED`（每隔离实例内存限速，非分布式，不作硬保证）。本阶段未升级、未降 bcrypt。

## 20. Attachment 状态（§十七）

`PHOTO_STATUS = PENDING_EXTERNAL` 保持不变；未修改 Attachment 方案、未猜 WPS Attachment API、未引入第三方对象存储/Tunnel、未改 Sheet3 三违照片。CF-WPS-12/12A/12B 结论继续有效。

## 21. 回归测试（§十八 N / §十九）

- 本地真实浏览器 E2E（明确标注 LOCAL，非公网）：**33/33 PASS**（S3/S11/S13/S14 基线恢复）。
- 既有 8 套回归全绿：cfwps08 8/8、cfwps10 8/8、cfwps11 38、cfwps12 25、cfwps13 46、oauth-flow（离线）、jwt-bridge 3/3、http-smoke 3/3。
- CF-WPS-18 验证脚本：27/27 PASS（A 字段完整性 / B–F 数据链 / G/H employee_code / I 受保护字段 / J dry-run / M 污染）。
→ `REGRESSION_STATUS = PASS`。

## 22. WPS 污染检查（§二十）

| Sheet | 名称 | 本阶段前 | 本阶段后 | 结论 |
|---|---|---|---|---|
| 3 | 表格视图（三违生产） | 2063 | 2063 | 零变化 |
| 11 | 员工信息维护 | 1291 | 1291 | 零变化 |
| 13 | H5提交测试 | 3 | 3 | 测试数据清理回基线 |
| 14 | H5移动端身份 | 3 | 3 | 零变化 |
| 15 | 生产用台账 | 0 | 0 | 仅加字段，零业务记录 |

→ `PRODUCTION_WPS_POLLUTION = 0`。

## 23. 安全扫描（§二十一）

- `worker/index.js`：`WPS_CLIENT_SECRET` / `JWT_VERIFY_SECRET` / `WORKER_SESSION_SECRET` / `access_token` 仅以**注释**或 `env.*` 服务端读取形式出现，**无字面密钥值**；access_token/refresh_token 绝不返回浏览器/日志/库。
- 前端（`frontend/` 全部 html/js）：**无** `sk-*` / `client_secret` / `access_token` 等暴露。
- `wrangler.toml`：敏感项仅以**注释**的 `wrangler secret put` 指令出现，无明文值。
- 测试脚本仅用 `mock-*` 占位值，不写入报告。
→ `SECURITY_SCAN_STATUS = PASS`（WPS_CLIENT_ID / WPS_CLIENT_SECRET / JWT_VERIFY_SECRET / WORKER_SESSION_SECRET 未出现在前端源码/bundle/console/API 响应/Git/报告）。

## 24. 风险清单

1. **Cloudflare 部署 BLOCKED**（环境无凭据）：公网 E2E / 真实 CORS / 真实 bcrypt-CPU 未能实测（NOT_EXECUTED）。需业务方提供 CF 账户/Token 后补验。
2. **Sheet 15 真实写回未实测**：因生产写入开关关闭（§十三），涉及人员/employee_code 的数据链与 round-trip 是在**测试 Sheet 13（同机制同类型）** + **Sheet 15 实时 Schema dry-run** 上验证，非对 Sheet 15 直接写读。放开生产写入后须以真实写读复核一次。
3. **「涉及人员」与「违章人姓名」语义边界**：已在映射层强制隔离（涉及人员→[B0]，绝不写 [N] 违章人姓名），但业务侧仍需明确两者录入规范。
4. **分布式登录限流缺失**：仍为每隔离实例 best-effort，公网暴露前建议升级（已多次标注，待授权）。
5. **bcrypt cost=10 在免费计划 CPU 实测缺失**：待 Cloudflare 部署后实测 cpu_ms 配置。

## 25. 未完成事项

- 真实 Cloudflare 部署 / 公网 HTTPS / 公网手机浏览器 E2E / 真实 CORS 公网验证 / 真实 bcrypt-CPU 实测：均 **NOT_EXECUTED**（依赖 CF 凭据，非本阶段代码缺陷）。
- Sheet 15 真实业务写读复核：待生产写入显式授权后执行。

## 26. 最终状态

`CF-WPS-18_STATUS = PASS_WITH_RISK`

（核心目标「涉及人员 字段扩展 + 完整映射回归验证」= PASS；Cloudflare 公网部署 = BLOCKED 因环境无凭据。）

## 27. 下一阶段建议

- CF-WPS-19（如需）：在业务方提供 Cloudflare 凭据并**显式授权放开**三生产开关后，执行真实公网部署 + 公网手机 E2E + CORS + bcrypt-CPU 实测 + Sheet 15 真实写读复核。
- 决策项（`BUSINESS_DECISION_REQUIRED=true`）：①提供 CF 凭据；②显式授权 MOBILE_PATROL_PRODUCTION_ENABLED / PRODUCTION_WRITE_AUTHORIZED / WPS_PATROL_FIELDS_CONFIRMED；③分布式登录限流授权；④bcrypt cpu_ms 配置；⑤「涉及人员」vs「违章人姓名」录入规范。

---

## 最终输出（状态字段）

```
CF-WPS-18_STATUS                   = PASS_WITH_RISK
WPS_SHEET15_FIELD_STATUS           = PASS            (39 字段)
INVOLVED_PERSON_FIELD_STATUS       = PASS            (fieldId=B0, MultiLineText)
INVOLVED_PERSON_MAPPING_STATUS      = PASS            (测试 Sheet13 真实往返 + Sheet15 实时 Schema dry-run)
EMPLOYEE_CODE_FIELD_COMPATIBILITY  = PASS            (MultiLineText 无损，前导0/字母安全)
DRY_RUN_STATUS                     = PASS
CLOUDFLARE_DEPLOYMENT_STATUS       = BLOCKED         (wrangler whoami 未认证，无 CF 凭据)
PUBLIC_H5_E2E_STATUS                = NOT_EXECUTED    (无公网环境)
BCRYPT_CLOUDFLARE_CPU_STATUS       = NOT_EXECUTED    (无 CF runtime)
PUBLIC_LOGIN_RATE_LIMIT_STATUS      = BEST_EFFORT_IMPLEMENTED
PHOTO_STATUS                       = PENDING_EXTERNAL
REGRESSION_STATUS                  = PASS            (本地 E2E 33/33 + 8 套全绿 + CF-WPS-18 脚本 27/27)
PRODUCTION_WPS_POLLUTION           = 0
SECURITY_SCAN_STATUS               = PASS

实际新增「涉及人员」fieldId        = B0
Sheet15 最终字段数量                = 39
employee_code 可安全写入「巡查人员ID」 = 是（MultiLineText，无数值化/截断）
涉及人员是否完整进入 WPS           = 是（经测试 Sheet13 真实往返验证；Sheet15 经 dry-run 验证映射命中）
是否存在字段错位                   = 否
是否发生生产数据污染               = 否（S15=0，仅加字段）
仍须人工决策事项                   = 见 §27（CF 凭据 / 生产写入三开关授权 / 分布式限流 / bcrypt cpu_ms / 录入规范）

四生产开关（保持关闭）：
  MOBILE_PATROL_PRODUCTION_ENABLED = false
  PRODUCTION_WRITE_AUTHORIZED      = false
  WPS_PATROL_FIELDS_CONFIRMED       = false
  WPS_PATROL_TARGET_SHEET           = 生产用台账 (sheet 15, file cn229thwalDs)
```

---

## Git 检查（§二十四）

- `grid-mobile-cloudflare/` 目录为 **untracked**（未被 git 跟踪），本阶段全部改动位于该目录内（含新增脚本 `test/cfwps18-add-involved-field.mjs`、`test/cfwps18-verify.mjs` 与 `worker/index.js` 映射改动），故不出现在 `git diff`。
- 仓库工作树另有 **264 个 pre-existing 已修改文件**（`server/`、`安全看板vben/`、`docs/` 等），与本阶段无关，列为 `UNRELATED_EXISTING_CHANGES = YES`，**未做任何清理/改动**，避免误删其他工作。
- 本阶段仅新增/修改 `grid-mobile-cloudflare/` 内文件，未触碰上述无关变更。
