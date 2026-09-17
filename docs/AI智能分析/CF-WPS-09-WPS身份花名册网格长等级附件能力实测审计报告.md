# CF-WPS-09：WPS 移动端身份、花名册、网格长等级及附件能力实测审计报告

> 阶段：CF-WPS-09 ｜ 日期：2026-09-15 ｜ 执行：WorkBuddy（AI 审计与最小验证）
> 性质：【先审计 → 实测验证 → 输出判断】。本阶段无生产部署授权，未执行任何生产操作。

---

## 1. 执行摘要

本阶段对「手机 H5 → Cloudflare Pages → Worker → WPS 多维表 → 现有 WPS→PG Pull → PG → HSE/PC」目标架构的三项关键能力做了**实测审计**（WPS 只读 + Mock 验证，零生产写入）：

| # | 关键问题 | 实测结论 |
|---|---|---|
| 1 | WPS 花名册能否承载移动端身份（含手机号）？ | **半可行**：员工编码/姓名/部门/职位/用工状态齐全且唯一；**无手机号列**（加列=生产写，待授权） |
| 2 | 手机号唯一性 | **PG users.phone 62/62 格式化、0 重复**，且 62 个 employee_code 100% 落在 WPS 花名册内 |
| 3 | 网格长等级权威来源 | **PG `grid_areas`（personnel_id + grid_level）**，非 WPS（WPS 无该字段，Sheet 3 的「网格等级」是巡查快照） |
| 4 | WPS Attachment 照片能力 | **ATTACHMENT_BLOCKED（证据再加固）**：全部 2063 条历史记录 Attachment 列与链接列 **100% 为 null** |
| 5 | records/create 白名单 | **发现并修正字段-目标表错位**：「员工编码」列在 Sheet 11 而非目标 Sheet 3；Sheet 3 身份快照列 =「巡查人员ID」 |

**CF-WPS-09_STATUS=PASS_WITH_RISK**（审计目标全部达成、结论明确、零生产污染；但三项后续实现均存在待授权 BLOCKER，见 §20）。

## 2. 本阶段目标

1. 实测 WPS 多维表（三违巡查台账 cn229thwalDs）真实结构（schema + 全量记录统计）；
2. 验证手机号唯一性与 WPS↔PG employee_code 映射；
3. 判定网格长等级权威来源；
4. 验证 password_hash 存储于 WPS 的可行性（设计级 + 安全分析）；
5. 再验证 WPS 附件官方能力（上传→URL）；
6. Mock 验证 Worker records/create 字段白名单（对齐实测 schema）。

## 3. 架构边界（本阶段严格遵守）

- ❌ 未开发 Cloudflare Tunnel / 内网穿透；H5 未接触本地 HSE 与 PostgreSQL；
- ❌ 未生产 WPS 写入、未生产 DDL/DML、未 Cloudflare 部署；
- ❌ 未动 PC 登录、HSE JWT、WPS→PG Pull、CF-WPS-07 迁移、三违业务；
- ✅ WPS 全部调用为只读（schema / list_by_page）；代码修改仅限非生产 Worker POC 与测试。

## 4. 数据源盘点

| 数据源 | 位置 | 作用 |
|---|---|---|
| PG `employee` | safety_dashboard（生产 3401 行活跃） | 花名册权威：employee_code/name/phone(密文)/roster_department/roster_position/employment_relation/leave_date |
| PG `grid_areas` | 同上 | **网格长等级权威**：personnel_id→employee.id，grid_level |
| PG `users` | 同上 | **唯一可用手机号源**：users.phone（明文），users.employee_id→employee.id |
| WPS Sheet 11「员工信息维护」 | cn229thwalDs | 全公司花名册快照（1291 人） |
| WPS Sheet 3「表格视图」 | 同上 | 巡查记录缓冲目标表（2063 条历史） |

## 5. WPS 实际结构（实测，2026-09-15 只读探针）

文件：`cn229thwalDs`（与 kdocs 链接 https://www.kdocs.cn/l/cn229thwalDs 一致，即 .env `WPS_DBSHEET_FILE_ID`）。

**Sheet 3「表格视图」（30 字段，2063 条记录）**：昵称2/分组名称/姓名/所属岗位/网格等级/日期/**三违照片：图片1-3（Attachment，J/K/L）**/三违行为/违章人姓名/违章人性别/违章人年龄/整改后照片：图片1（Attachment，Q）/当日是否报名/标记/是否补交/提交时间/编号/来源日期/**巡查人员ID（X，MultiLineText）**/上报状态/车辆类型/违章类型结果/是否需要整改/整改人/**三违照片链接（d）/整改后照片链接（e）/示意图链接（f）**/查询数据编号。

**Sheet 11「员工信息维护」（16 字段，1291 条记录）**：员工编码（BA）/姓名（BB）/所属部门（BC）/职位（BD）/性别/年龄/身份证号码/出生日期/入职日期/直接上级/用工关系状态（BK）/入司日期/离职日期（BM）/完整度百分比/负责区域（在职/离职）。

**决定性缺口**：
- Sheet 11 **无手机号列**（全键扫描 phone-like keys = []）、**无网格长等级列**；
- Sheet 3 的「网格等级」是巡查记录快照字段，「巡查人员ID」2063 条历史 **100% 空**；
- Sheet 3 无「员工编码」列（该列在 Sheet 11）。

## 6. PG 实际结构（只读审计）

- `employee`（22 列）：employee_code/name/**phone（`ENC:` 前缀密文！非明文）**/roster_department/roster_position/employment_relation/leave_date/is_deleted/id_card_hash/phone_hash…；
- `grid_areas`（17 列）：grid_code/grid_level/name/**personnel_id（→employee.id）**/township/status/is_deleted…。

**§三A 回答**：PG 通过 employee_code/employee.id 可达：姓名✅、手机号✅（**密文**，需解密组件）、部门✅（roster_department）、职位✅（roster_position）、网格长等级✅（经 grid_areas）、在职状态✅（employment_relation + leave_date + is_deleted）。

## 7. employee_code 映射（WPS↔PG 对照实测）

| 指标 | 结果 |
|---|---|
| WPS 花名册员工编码 | 1291 条，**100% 非空、1291 distinct、0 重复** |
| PG 网格长（绑定 grid_areas 的活跃员工） | 61 人，61 个唯一编码 |
| PG 网格长编码 ∈ WPS 花名册 | **61/61（100%）**，姓名 0 错配 |
| WPS 有 PG 网格长无 | 1230 人（全公司花名册，正常超集） |
| PG 有 WPS 无 | **0** |
| 手机号绑定用户（LOGIN-02 链路） | 62 人：phone 62/62 格式化、**0 重复**、employee_code **62/62 ∈ WPS 花名册** |

**§七 回答**：WPS 花名册是 PG 网格长集合的完美超集；employee_code 唯一、双向映射无冲突；姓名 fallback 不需要且禁止。

## 8. 手机号唯一性（§四.5 / §五.1 实测统计）

| 数据源 | 总量 | 格式化手机号 | 重复 | 空 | 结论 |
|---|---|---|---|---|---|
| PG `users.phone`（绑定 employee_id 的活跃用户） | 62 | **62（100%）** | **0** | 0 | ✅ 唯一可用登录凭据源 |
| PG `employee.phone`（全量 3401 活跃） | 3401 | **0** | — | 2013 | ❌ 密文存储且无格式化数据，不可用 |
| WPS 花名册 | 1291 | **无此字段** | — | — | ❌ 无手机号列 |

**§五.1 回答**：手机号唯一性成立的前提是用 `users.phone`（62 人 0 重复，fail-closed 条件天然满足）。**若移动端身份表建在 WPS，手机号列需新增（生产写，待授权）**；新增后必须以同规则校验唯一性。

## 9. 网格长等级权威来源（§三B / §八）

**权威来源 = PG `grid_areas`**（真实表名/字段名/关联：`grid_areas.personnel_id → employee.id`，等级字段 `grid_areas.grid_level`）。

实测分布（生产）：三级网格长 45、二级 11、一级 5、空 1；61 个绑定员工**全部**有等级；**无一人绑定多格**（fail-closed 条件当前不触发）。

代码佐证：`gridScope.deriveGridIdForEmployee()`（严格单格 fail-closed）、`currentEmployeeContext.js`（注释明确「网格等级属巡查快照，由巡查业务另记」）、assessmentMonthlyExportService（`grid_level IN ('二级网格长','三级网格长')`）。

**裁定**：WPS Sheet 3 的「网格等级」列只能是**展示缓存/快照**，不可为权威。若 WPS 身份表出现等级列，必须视为只读镜像，业务判定一律回 PG。

## 10. 登录模型可行性（§六 / §十三 Q2）

**设计级结论：Worker + WPS 可以实现手机号+密码登录（方案 B'），但有 5 项风险与 2 项授权前置。**

链路：手机号+密码 → Worker → 读 WPS 身份表（手机号列）→ bcrypt/PBKDF2 比对 → Worker 签发 JWT。

1. **password_hash 列可建立**：fields create 端点经 Sprint-WPS-02-C 真机校准（`POST /v7/coop/dbsheet/{file_id}/sheets/{sheet_id}/fields`）；但对生产文件加列=生产写 → **NEEDS_AUTHORIZATION**。独立新文件创建端点实测 404（CF-WPS-02）→ 只能在现有文件加列（Sheet 11 加手机号+password_hash 列，或新 Sheet——**建 Sheet 端点亦 404**）。
2. **Worker 哈希验证可行**：WebCrypto 原生 PBKDF2；bcryptjs 纯 JS 可跑（Workers 兼容）。密码不明文保存✅、不写日志（CF-WPS-08 已有脱敏纪律）✅。
3. **风险 R1（可见性）**：WPS 管理员/协作者在表格 UI 可直接看到 password_hash 列值。bcrypt 单向但弱密码可离线爆破 → 必须（a）强密码策略 +（b）高 cost +（c）限制该列可见权限（产品面操作，非 API）。
4. **风险 R2（查询面）**：`list_by_page` **无条件筛选能力**（实测确证）→ 每次登录全表扫 1291 行≈7 页请求；限频 10 req/s（按 app_id）→ **必须 Worker 侧缓存身份表**（建议 15-60 min TTL），登录时先查缓存。
5. **风险 R3（离职判定缺口）**：WPS 花名册「用工关系状态」1291/1291 全为「正式员工」、离职日期 100% 空 → **该表当前无离职/停用区分力**。若 WPS 成为登录资料源，离职禁登依赖花名册维护流程（数据治理），或定期从 PG 快照回写（回写=生产写，待授权）。
6. **风险 R4（双 token 体系）**：Worker 自签 JWT 与现有 HSE JWT 并存 → 需业务确认移动端 token 语义（建议：移动端 token 只作 Worker 域内会话，不冒充 HSE JWT）。
7. **风险 R5（审计日志）**：WPS OpenAPI 侧审计可见「谁在何时读表」，不记录字段值内容 → 泄露面可控。

**§六.13 回答**：不应污染花名册——但受「新建文件/Sheet 端点 404」限制，现实路径只有 Sheet 11 加列（手机号 + password_hash + 状态），以列语义隔离；若未来文件创建端点开放，再迁独立表。

## 11. password_hash 安全性小结

- 明文密码：仅经 HTTPS 到 Worker，内存即焚；不落 WPS、不落日志 ✅
- Worker 侧：哈希比对（bcrypt/PBKDF2）；登录失败计数可用 Worker 内存/KV（免费额度）实现 ✅
- 密码修改：update records 写 hash 列（端点真机校准）✅
- 最大风险：R1 可见性 + R3 离职缺口（见上）。

## 12. WPS API 权限（实测）

| 能力 | 结果 |
|---|---|
| schema 读取 | ✅ 200（本次实测） |
| list_by_page 全量读取（Sheet 3=2063 条 / Sheet 11=1291 条） | ✅ 200（分页实测） |
| fields create（加列） | 端点真机校准过（Sprint-WPS-02-C）；**本次未调用**（生产写禁区） |
| records create/update/delete | 端点真机校准过；**本次未调用**（生产写禁区） |
| 新建文件 / 新建 Sheet | ❌ 实测 404（CF-WPS-02） |
| DBT v1 attachment/urls（附件→URL） | ❌ openapi.wps.cn 实测 404（CF-WPS-02/08） |

## 13. WPS records/create 验证（Mock，§十）

CF-WPS-08 已建 mock 全链（JWT 验签门→写开关→WPS create）。本阶段**用实测 schema 修正了白名单**：

- **修正**：从白名单移除「员工编码」（Sheet 3 不存在，写入必失败——踩坑 4 实证规则）；新增「巡查人员ID」（Sheet 3 身份快照列，恰为 CF-WPS-06 归因组件的读取列）；
- **保护字段**（§十）：`grid_id`/`inspector_employee_id`/`attribution_status`/`deduction`/`responsibility`/`review`/`employee_code` 无条件剥离，H5/Worker 永不接受；
- Attachment 列（图片1/2/3）显式不入白名单（二段式→URL 能力未验证）。

**§十 字段对照**：employee_code→`巡查人员ID`（Worker 端映射写入）；巡查时间→`日期`+`提交时间`；网格→`分组名称`/`所属岗位`；问题描述→`三违行为`；source_channel=mobile_h5→**板上无专用列**（可用「标记」或「上报状态」承载，需业务定名——BLOCKER B4）；图片→仅链接列（BLOCKED）。

真机写入验证：**未执行**（生产写禁区）→ 隔离测试文件无法创建（404）→ 留待授权（B3）。

## 14. WPS Attachment 验证（§九核心）

**ATTACHMENT_BLOCKED（证据链再加固）**：

1. 官方文档面：附件上传二段式（upload → 字段值 `[{uploadId, fileName, source:"upload_ks3"}]`）；
2. **URL 缺口（真机实证）**：DBT v1 `attachment/urls` 在 openapi.wps.cn 实测 404（CF-WPS-02/08）→ 「上传→可访问 URL」断链；
3. **本阶段新证据（生产数据只读统计）**：Sheet 3 全部 **2063 条**历史记录中，「三违照片：图片1」Attachment 字段值 **100% 为 null**（图片2/3 同形态）；对照「三违照片链接」列亦 100% 空 → **现有历史照片数据不经字段值 API 通道**（疑为单元格内嵌 DISPIMG 形态），且 Attachment 列在生产实践中零使用；
4. §九.9（Pull 保留）：Pull 引擎只映射链接镜像列（SYNC_URL_COLUMNS），Attachment 字段不在 18-hash 投影 → Attachment 数据本就进不了 PG。

**结论**：不发明方案、不引入第三方存储（遵守 §九禁令）。照片通道维持 501 显式语义。

## 15. Attachment URL 验证

见 §14.2：唯一官方「uploadId→URL」端点（DBT v1 attachment/urls）在当前应用凭证+V7 域实测 404。AirScript `Record.GetAttachmentURL` 属文档内脚本运行时，非服务端调用面。**下一步需要**：向 WPS 开放平台核实（a）正确的域/凭证面（developer.kdocs.cn 通道申请）、（b）download_url 有效期。在此之前照片链路 BLOCKED。

## 16. Worker 安全审计（§十二）

| 检查项 | 结果 |
|---|---|
| JWT/session | HS256 只验签不签发；与本地 HSE 同密钥（jwt-bridge 3/3 实证）✅ |
| Secret 泄露 | T7：secret/token 不出现在任何响应 ✅；wrangler.toml 无明文 ✅ |
| CORS | 白名单 + 预检（T6）✅ |
| rate limit / body size | records ≤50 条上限；rate limit 未实现（免费版可用 Workers 内建或 KV 计数，留待部署阶段） |
| error normalization | 401/403/429/502/500 全归一化、不回传上游 body（T4/T8）✅ |
| 字段 allowlist | 本阶段按实测 schema 修正（§13）✅ |
| 写开关 | ALLOW_WPS_WRITE fail-closed（T2）✅ |

## 17. Cloudflare Pages 审计

无新增改动。CF-WPS-08 结论维持：生产构建 hash 路由（无需 history fallback）、资源根相对、`_app.config.js` 可注入 API URL、pages/functions 同源反代已设计交付。本阶段 production build 未重建（无前端改动）。

## 18. 测试结果（§十五对照）

| # | 验证项 | 结果 |
|---|---|---|
| 1 | WPS schema 实测 | ✅ PASS（30+16 字段全量 dump） |
| 2 | file_id/sheet_id | ✅ cn229thwalDs / 3 与 11 |
| 3 | 字段映射表 | ✅ §5/§13 |
| 4 | 手机号唯一性统计 | ✅ §8（62/62/0 dup） |
| 5 | employee_code 唯一性 | ✅ §7（1291 distinct） |
| 6 | WPS↔PG 对照 | ✅ §7（61/61、0 错配） |
| 7 | 网格长等级来源 | ✅ §9（grid_areas） |
| 8 | password_hash 可行性 | ⚠️ 设计级可行 + 5 风险；实测 NEEDS_AUTHORIZATION |
| 9 | WPS API 权限 | ✅ §12（读全通；写禁区未触） |
| 10 | records/create 验证 | ✅ Mock 8/8（白名单按实测 schema 修正）；真机未执行 |
| 11 | Attachment 官方能力 | ⛔ ATTACHMENT_BLOCKED |
| 12 | Attachment URL | ⛔ 404（既有实证） |
| 13 | Worker Secret 泄露检查 | ✅ T7 |
| 14 | Pages 构建验证 | ✅ CF-WPS-08 已验证（49.82s），本阶段无改动 |
| 15 | 既有 Worker 测试回归 | ✅ cfwps08 8/8 + oauth 9/9 + http-smoke 3/3 + jwt-bridge 3/3 |

## 19. 风险

1. **WPS 身份表无手机号**：加列是唯一路径且属生产写（B1）；
2. **WPS 花名册离职状态无区分力**（全「正式员工」）：离职禁登依赖数据治理流程；
3. **password_hash 可见性**：表格 UI 层可见，需权限产品面收紧 + 强密码策略；
4. **登录查询面**：无条件筛选 → 必须缓存，否则撞限频；
5. **双 JWT 体系**：Worker 移动端 token 与 HSE JWT 并存需业务定语义；
6. **Sheet 3 身份快照列空置**：巡查人员ID 2063 条全空 → 归因组件上线前无历史数据可试。

## 20. BLOCKER（下一步需要什么）

| # | 事项 | 需要的授权 |
|---|---|---|
| B1 | WPS 身份表加列（手机号/password_hash/状态，Sheet 11 或新列语义隔离） | 生产 WPS 写入授权（一次性、列级、幂等脚本） |
| B2 | 附件 uploadId→URL 能力 | 与 WPS 开放平台核实 developer.kdocs.cn 通道/凭证面 |
| B3 | records/create 真机联调 | 受控测试写入授权 + 隔离测试容器（或人工在 WPS UI 建测试 Sheet——UI 建表不经 API 404 端点，可行替代！） |
| B4 | source_channel 承载字段定名 | 业务负责人（标记/上报状态/新列） |
| B5 | 归因接线（enrichment 无生产调用方，CF-WPS-08 已发现） | 生产接线授权 |

**新发现的可行替代（B3）**：API 建文件/Sheet 端点 404，但 **WPS 表格 UI 人工建 Sheet 不受限**——业务方可在 cn229thwalDs 内手工新建「H5提交测试」Sheet，把 sheet_id 配给 Worker 测试环境，即可获得隔离测试容器，无需生产记录表写入授权。

## 21. 后续建议

1. **CF-WPS-10（建议）**：业务方 UI 建隔离测试 Sheet（B3 替代）→ Worker 测试环境真机 records/create 联调（50 条上限/分批/限频实测）；
2. 同批申请 B1 加列授权 → 身份表手机号+password_hash 落地 → Worker 登录链路（含缓存与失败计数）真机验证；
3. B2 与 WPS 平台侧并行核实；
4. 数据治理：WPS 花名册离职状态维护流程（或 PG→WPS 定期快照，须授权）。

## 22. 回滚/清理说明

- 本次修改：`grid-mobile-cloudflare/worker/index.js`（白名单修正 + PROTECTED_FIELDS）、`test/cfwps08.test.mjs`（断言同步）、`test/jwt-bridge.test.mjs`（字段名同步）。回滚=git revert 该三文件；行为影响仅限 Worker POC（未部署）。
- 临时审计脚本 `server/_c09_*.cjs` 已删除。
- WPS/PG 无任何本次产生的持久数据（全程只读）。

## 23. 本阶段明确未执行的生产操作

- ❌ 生产 WPS 写入（含加列、建记录、上传附件）——**明确回答：没有**
- ❌ 生产 DDL/DML —— **没有**
- ❌ Cloudflare Tunnel / 内网穿透 —— **明确回答：没有**
- ❌ Cloudflare 生产部署 / H5 发布 —— **没有**
- ❌ 修改现有 HSE / PC 登录 / JWT / 三违体系 / WPS→PG Pull —— **没有**
- ❌ 真实用户密码写入任何位置 —— **没有**（全程无密码数据，无明文、无 hash）
- 生产数据库变化：**零**（全部 SELECT 只读，含生产库两次审计）

---

## 附：Q1-Q10 最终架构判断（§十三）

| # | 问题 | 判断 |
|---|---|---|
| Q1 | H5→Worker→WPS 完全不要 Tunnel？ | **能**（数据面成立；登录面见 Q2） |
| Q2 | 手机号+密码由 Worker+WPS 完成？ | **设计可行**，待 B1 加列授权 + R1-R5 风险处置 |
| Q3 | WPS 适合存 password_hash？ | **有条件适合**：技术可行；可见性风险需产品面收紧；离职判定缺口需数据治理 |
| Q4 | employee_code 作唯一业务身份？ | **是**（1291 唯一、61/61 覆盖、62/62 手机号用户命中） |
| Q5 | 网格长等级权威来源？ | **PG grid_areas（personnel_id+grid_level）**；WPS 列仅快照 |
| Q6 | WPS 作移动端巡查数据缓冲层？ | **能**（records/create 端点+Pull 幂等链就绪；字段错位已修正；真机联调待 B3） |
| Q7 | 官方附件完成 手机拍照→Worker→WPS→记录？ | **不能（现状）**：上传→URL 断链（404 实证） |
| Q8 | 照片 URL 如何获取？ | 现状**无可用调用面**；待 B2 核实 developer.kdocs.cn 通道 |
| Q9 | 现有 Pull 能否完整接收 H5 数据？ | **能**（业务字段进投影；grid_id/inspector_employee_id 由归因组件补 NULL，组件待 B5 接线） |
| Q10 | 全程不碰本地 HSE/PG/Tunnel？ | **能**（登录面在 B1 授权后同样成立） |

**CF-WPS-09_STATUS=PASS_WITH_RISK**

> 口径说明：本报告区分「已验证」（§18 标 ✅，全部真机/实测）、「Mock 验证」（records/create 白名单）、「设计级结论」（password_hash 链路）、「未验证/待授权」（B1-B5）、「生产未部署」。未把设计结果写成已完成。
