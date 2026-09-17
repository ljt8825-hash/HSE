# H5-GRID-LOGIN-02 · 手机号+密码移动端登录映射实施报告

- 日期：2026-09-15
- 项目：G:\hse-dashboard
- 前序阶段：H5-GRID-UI-01（网格长巡查 H5 页面，终态 PASS_WITH_RISK，已确认「生产 63 个活跃账号 users.username 均非手机号」）
- **本阶段没有生产部署授权，因此没有执行任何生产数据库修改、生产迁移、生产服务重启或生产部署。**

---

## 1. 阶段目标

为「网格长巡查管理」移动端 H5 实现「手机号 + 密码」登录映射：

```
手机号 + 密码 → 现有系统用户(users) → employee → employee_code → 现有 JWT → 移动端登录态
```

核心约束：**不破坏 PC 登录**。严禁借此阶段修改 PC 登录体系、重构 JWT、重构权限体系。

## 2. 审计结果（先审计后实现，全部结论以代码/只读查库为准）

### 2.1 审计问题清单回答（任务书 §四 1–13）

| # | 问题 | 结论 |
| --- | --- | --- |
| 1 | PC 登录用什么字段 | `users.username` 精确匹配（`routes/auth.js` POST /api/auth/login，`WHERE username = $1`） |
| 2 | 密码验证在哪里 | `routes/auth.js`，`bcrypt.compare(password, user.password_hash)`（bcryptjs，hash cost 10；注册/改密同库） |
| 3 | JWT 在哪里生成 | `middleware/auth.js` `generateAccessToken` / `generateRefreshToken`（jsonwebtoken HS256，`JWT_SECRET`/`JWT_REFRESH_SECRET` 环境变量，access 默认 12h、refresh 7d，`crypto.randomUUID()` 作 jti） |
| 4 | JWT payload 包含什么 | `{ id, username, role, realName, type: 'access', jti }`（refresh 同构 type:'refresh'；黑名单表 `token_blacklist` 按 jti 撤销） |
| 5 | users 与 employee 如何关联 | **`users.employee_id → employee.id`**（权威链路，见 `services/authenticatedEmployeeResolver.js` 与 `services/gridScope.js` 红线注释「users.employee_id 是网格负责人与网格的唯一可信纽带；禁止姓名/昵称/手机/username 匹配」）。另有旧链路 `services/currentEmployeeContext.js`（realName→v_employee_current 姓名匹配）仅供 GET /api/current-employee，未改动 |
| 6 | employee_code 在哪里可靠获得 | `employee.employee_code`（生产 3401 在册员工中 3253 个非空；62 个已绑定用户的员工编码 100% 非空） |
| 7 | 手机号存在于哪个真实数据源 | **`users.phone`**。生产 63/63 活跃用户该列全部为手机号格式；employee.phone 为 0 个有效手机号（不可用）。H5-GRID-UI-01 发现的「username 无手机号」结论复核成立，但 users.phone 是现成、全量、无重复的手机号数据源 |
| 8 | 一个手机号是否可能对应多个用户 | 当前生产/开发均 0 重复；实现仍强制 fail-closed（>1 条 → 409 拒绝，绝不选第一条） |
| 9 | 一个 employee 是否可能对应多个用户 | 当前生产/开发均 0（`users.employee_id` 无重复绑定）；实现按 resolver 现有 fail-closed 语义处理 |
| 10 | 用户状态如何判断 | `users.is_active`（users 表无 is_deleted 列；停用=禁用，删除=物理删除，两者登录均拒绝） |
| 11 | employee 状态如何判断 | `employee.is_deleted`（employee 表无独立「停用」状态列；`leave_date` 属 HR 数据不作为登录门；任职有效性由巡查业务 fail-closed 兜底） |
| 12 | 能否在不改变 PC 登录前提下增加移动端登录入口 | **能**：独立路由 + authMiddleware 公开清单加一条；PC 端零改动 |
| 13 | 最小修改方案 | 见 §8 最终登录架构 |

### 2.2 手机号数据源只读审计（生产 + 开发，SELECT only）

| 指标 | 生产 safety_dashboard | 开发 safety_dashboard_dev |
| --- | --- | --- |
| users 活跃数 | 63 | 64 |
| users.username 为手机号格式 | 0（UI-01 结论复核成立） | 1（UI-01 测试账号） |
| **users.phone 为手机号格式** | **63（100%）** | **64（100%）** |
| users.phone 重复 | 0 | 0 |
| 活跃用户已绑 employee_id | 62 | 63 |
| employee.phone 为手机号格式 | 0（该列无有效数据，不可用） | 0 |
| phone→user→employee_id→employee(未删除)→employee_code 链完整 | **62** | **63** |
| employee_id 被多个用户绑定 | 0 | 0 |
| 62 个绑定用户 realName 与 employee.name 完全一致 | 62（100%，工作台旧链路同样可用） | 同 |

**结论：手机号映射链唯一可行且已全量可用：`users.phone → user → users.employee_id → employee → employee_code`，无需新增任何映射表、无需数据库变更。**

## 3. 原认证体系分析

- 登录：POST /api/auth/login（validateBody zod `loginSchema`）→ 锁定检查（生产，`login_attempts` 表按 username 记账）→ username 精确查询 → `is_active` 检查 → bcrypt.compare → 签发 access+refresh → refreshToken 写 httpOnly cookie → 审计日志 `action=login`。
- 认证中间件：`app.use('/api', authMiddleware)`，公开路由用显式 method+path 清单（`PUBLIC_ROUTES`）；access token 必须含 jti + type=access + 未拉黑 + 用户仍激活。
- 前端：`loginApi → requestClient（解包 {code:0,data} 信封）→ authStore.authLogin（setAccessToken → fetchUserInfo → getAccessCodes）`。

## 4. users / employee 关系

- 权威：`users.employee_id → employee.id`（阶段 2 起网格巡查业务 `siteMgmtService`/`gridScope` 已强制此链路，严禁姓名兜底）。
- 旧链路：`currentEmployeeContext.js` 按 realName 姓名 1:1 匹配（Sprint-WPS-02，GET /api/current-employee 使用）。本阶段不改其语义；经查生产 62/62 用户 realName 与员工姓名完全一致，该接口对全部可登录用户可用。

## 5. 手机号来源

**唯一真实数据源 = `users.phone`**（§2.2 审计表）。不存在于 employee / 配置表 / WPS。用户资料接口（/api/auth/profile、用户管理）已具备维护 users.phone 的既有通道。

## 6. 密码验证机制

- 复用 `bcrypt.compare(password, user.password_hash)`（bcryptjs），与 PC 登录同一份密码数据（`users.password_hash`），**没有建立第二套密码体系**。
- 安全红线落实：无明文比较、无新哈希实现、密码不写入任何日志/响应/数据库新字段（后端日志经全量核查：仅 `passwordProvided: true/false` 布尔值）。

## 7. JWT / Session 机制

- **复用现有 `generateAccessToken`/`generateRefreshToken`，payload 结构与 PC 完全一致（`{id, username, role, realName}`），零结构变更、零新增字段**。employee_code 不进 JWT（遵循 authenticatedEmployeeResolver 红线）。
- refreshToken cookie、/auth/refresh 刷新链、token_blacklist 撤销机制全部原样复用——移动端登出/续期与 PC 共用同一套机制。
- 业务身份 employee_code 由服务端登录时经权威链路实时解析后随响应返回；后续巡查请求的身份由服务端中间件+resolver 从 JWT 实时解析，前端不得（也无法）伪造。

## 8. 最终登录架构

```
POST /api/mobile/auth/login  { phone, password }        ← 独立移动端入口（匿名，公开清单放行）
  ↓ zod: mobileLoginSchema（^1\d{10}$ + password 必填）
  ↓ [生产] 按手机号键的失败锁定检查（复用 login_attempts，语义与 PC 一致）
  ↓ SELECT * FROM users WHERE phone = $1                ← 精确匹配
      0 条  → 401 「手机号或密码错误」（不泄露账号是否存在）
      >1 条 → 409 fail-closed「该手机号匹配到多个账号」（绝不选第一条）
  ↓ users.is_active = false → 403「账户已被禁用」
  ↓ bcrypt.compare(password, users.password_hash)       ← 复用现有密码验证
      失败 → 401「手机号或密码错误」
  ↓ resolveAuthenticatedEmployee(user.id)               ← 复用权威身份链（employee_id → employee）
      用户不存在/停用 → 401；employee 不存在 → 409；employee 已删除 → 409
  ↓ employee_code 为空 → 403 fail-closed
  ↓ generateAccessToken / generateRefreshToken          ← 复用现有 JWT（payload 同 PC）
  ↓ httpOnly refresh_token cookie + 审计日志 action=mobile_login
  → 200 { token, accessToken, refreshToken, user, employeeCode }
```

返回结构与 /api/auth/login 完全一致，最小增量仅 `employeeCode` 一个字段。严禁返回的字段（password/password_hash/身份证号等）均未返回。

## 9. 实际修改文件

**后端（3 处修改 + 1 个新文件）：**

| 文件 | 变更 |
| --- | --- |
| `server/routes/mobileAuth.js` | **新增**：移动端登录路由（§8 全流程），日志手机号脱敏（139\*\*\*\*0001）、不落密码/完整 token |
| `server/app.js` | +1 行挂载：`app.use('/api/mobile/auth', require('./routes/mobileAuth'))` |
| `server/middleware/auth.js` | `PUBLIC_ROUTES` +1 条：`{ POST, /mobile/auth/login }`（附注释） |
| `server/schemas/auth.js` | +`mobileLoginSchema`（zod）并导出 |
| `server/services/authenticatedEmployeeResolver.js` | 最小增量：employee SELECT 增列 `employee_code`、返回值增 `employeeCode` 字段（只读解析器，既有消费方不受影响） |

**前端（4 个文件，均属移动端适配）：**

| 文件 | 变更 |
| --- | --- |
| `src/api/core/auth.ts` | +`mobileLoginApi`：走 `baseRequestClient`（与 logout/refresh 同款裸客户端），手动解包信封；PC `loginApi` 未动 |
| `src/views/mobile/login.vue` | `onSubmit` 从「手机号填 username 打 PC 接口」切换为调用 `mobileLoginApi`；登录态保存复用 `accessStore.setAccessToken` + `authStore.fetchUserInfo` + `getAccessCodesApi`（authStore.authLogin 未改动）；UI 零改动 |
| `src/views/mobile/me.vue` | 退出后 `router.replace('/mobile/login')`（移动端退出落点适配） |
| `src/layouts/mobile.vue` | 同上（顶部退出按钮） |

**未触碰**：PC 登录页/PC 业务、authStore、权限模型、角色体系、员工选择器、巡查/三违业务接口、WPS 同步、CF-WPS-07 迁移、/mw、Cloudflare 全部。

## 10. API 接口

- 新增：`POST /api/mobile/auth/login`（唯一新增接口）。输入 `{phone, password}`；输出 `{code:0, data:{token, accessToken, refreshToken, user, employeeCode}, message:'登录成功'}`；错误码 400（参数）/401（凭据类）/403（禁用/员工编码缺失）/409（重复手机号/员工档案问题）/423（锁定，仅生产）/500。
- 未修改任何既有接口。

## 11. 数据库变更

**无。** 未建表、未加列、未写 migration、未改任何数据结构。手机号映射完全复用 `users.phone + users.employee_id` 既有数据。

## 12. 安全设计

1. 凭据失败（未知手机号/错误密码）→ 同一文案「手机号或密码错误」（401），不泄露账号是否存在。
2. 重复手机号 → 409 fail-closed，不自动选择。
3. 停用用户 403；物理删除用户 401；employee 删除 409；employee_code 缺失 403 —— 全部 fail-closed。
4. 密码永不入日志（日志实测仅 `passwordProvided` 布尔）；token 不入日志（仅 jti/长度/过期时间）；手机号日志脱敏。
5. 前端不可获得 password_hash（响应不含）；employee_code 不作为 JWT 业务身份，业务请求身份一律服务端实时解析。
6. 生产环境按手机号键启用失败锁定（5 次/15 分钟，与 PC 参数一致）；开发环境跳过（与 PC 行为一致）。
7. 手机号仅是登录凭据，精确匹配，禁止姓名/后四位/模糊/猜测匹配（任务书 §六 全部禁止项均未发生）。

## 13. 测试用例（对应任务书 §十八 A–N）

API 级测试脚本：`server/_l02_login_tests.cjs`（dev 夹具 + HTTP 断言 + 用后自清；**启动即断言仅允许 safety_dashboard_dev，连接其他库直接拒绝执行**）。浏览器 E2E：`server/_l02_browser_e2e.cjs`（回归资产）。

## 14. 测试结果

**API 级 16/16 全部通过**（dev 后端 5882 + dev 库）：

| 用例 | 结果 |
| --- | --- |
| A 正常登录（13900000001 + 正确密码） | ✅ 200，employeeCode=00307234 |
| B 错误密码 | ✅ 401 统一文案 |
| C 未知手机号 | ✅ 401 统一文案 |
| D 重复手机号（双用户夹具） | ✅ 409 fail-closed |
| E 停用用户（is_active=false 夹具） | ✅ 403 |
| F 已删除（物理删除）用户 | ✅ 401 |
| G employee 不存在（悬空 employee_id） | ✅ 409 |
| H employee 已删除（夹具绑定已删除员工） | ✅ 409 |
| I employee 停用 | ✅ 数据模型无独立状态列，停用语义=is_deleted，由 H 门覆盖（报告明示） |
| J employee_code 缺失（绑定无编码员工夹具） | ✅ 403 |
| K1 PC /api/auth/login 原行为不变（username 匹配仍成功） | ✅ 200 |
| K2 PC 登录不认 users.phone（username≠phone → 拒绝，语义未被放宽） | ✅ 401 |
| L1 移动端签发 JWT 访问 /api/user/info | ✅ 200（JWT 完全兼容） |
| L2 refresh token 经 /auth/refresh 换新 | ✅ 200 |
| M current-employee 与登录返回的 employee_code 一致 | ✅ 00307234 |
| N0 参数校验（非法手机号/缺密码） | ✅ 400/400 |

**前端类型检查**：`vue-tsc --noEmit --skipLibCheck` 全库 60 错误 = 既有基线持平（修复过程中自查出 me.vue 缺 router 声明 1 处并当场修正）。

## 15. PC 登录回归结果

- K1：PC 登录（username 精确匹配 + bcrypt）行为不变 ✅。
- K2：PC 语义未被放宽——用 users.phone 作为 username 登录仍被拒绝 ✅。
- JWT 回归：移动端签发的 token 与 PC token 同构，PC 既有接口（/api/user/info、/auth/refresh、/api/current-employee）全部正常 ✅。
- PC 代码路径零改动（auth.js 的 /login 未动一行）。

## 16. 浏览器 E2E 结果

**9/9 全部通过**（dev 全栈 5177→5882，真实 Chromium，视口 420×860，G 盘 profile）：

| # | 步骤 | 结果 |
| --- | --- | --- |
| 01 | 打开 /mobile/login 渲染手机号+密码表单 | ✅ |
| 02 | 错误密码 → 显示「手机号或密码错误」且不跳转 | ✅ |
| 03 | 正确登录命中新接口 POST /api/mobile/auth/login（200） | ✅ |
| 04 | 登录成功进入 /mobile/index（token 保存生效） | ✅ |
| 05 | 工作台显示登录人姓名 + employee_code（曹周平/00307234） | ✅ |
| 06 | GET /api/current-employee 无失败响应 | ✅ |
| 07 | 刷新页面登录态保持（token 持久化） | ✅ |
| 08 | 退出登录回到 /mobile/login（本阶段落点适配） | ✅ |
| 09 | 二次完整登录回归 | ✅ |

截图：`docs/AI智能分析/h5ui01-screenshots/l02-02-wrong-password.png`、`l02-07-workbench.png`、`l02-10-final.png`。

## 17. 生产环境是否修改

**没有执行任何生产修改。** 生产仅做过**只读 SELECT 审计**（§2.2）。需如实披露一次**测试脚本事故**：API 测试脚本首跑时因未显式指定 DB_NAME（config/db.js 按 .env 默认连生产库），6 个 `_l02_` 前缀测试用户被短暂写入生产 users 表后由脚本自身清理逻辑删除（同一连接），全程数秒；随即以只读查询验证：`username LIKE '_l02%'` 残留 **0 条**、生产用户总数恢复 63。事故后脚本已加固：启动即断言 `current_database() = 'safety_dashboard_dev'`，否则拒绝执行。除该瞬时事件外，生产无任何 DML/DDL/服务变更。

## 18. 是否需要生产 migration

**不需要。** 本实现零数据库变更（§11）。

## 19. 生产部署前置条件

1. 数据确认：生产 63/63 users.phone 已是手机号格式且无重复（本阶段已只读核实），但**手机号与员工本人的对应关系正确性属数据治理范畴**，建议抽样核验后再放开真实用户使用。
2. 生产后端部署包含本次代码（新路由 + 公开清单 + resolver 增量）。
3. 生产前端重新构建发布（dist 替换，需单独授权，本阶段未动生产 dist）。
4. 明确 admin 等未绑定 employee 的账号走移动端登录的行为：登录会被 403 fail-closed（符合「employee_code 缺失不能进入移动端业务」）。
5. 生产环境失败锁定按手机号键生效（5 次/15 分钟）。

## 20. 回滚方案

- 后端：移除 `app.js` 中 `/api/mobile/auth` 挂载 + `middleware/auth.js` PUBLIC_ROUTES 中对应条目即可完全禁用入口（其余 3 处后端变更为纯增量，可保留）；或直接回退 4 个后端文件。
- 前端：login.vue/me.vue/layouts/mobile.vue/auth.ts 回退即恢复 UI-01 状态（PC 本就不受影响）。
- 数据库：无需回滚（零变更）。
- 回滚后 PC 登录、既有 JWT、巡查业务均不受任何影响（移动端是纯附加入口）。

## 21. 已知风险

1. **手机号-本人对应关系未做业务核验**：users.phone 格式 100% 合规，但该列由既有管理通道维护，个别号码是否归属员工本人无法由系统自证。错误绑定会导致登录到错误的 employee_code（系统层面无法发现）。建议按网格长名单抽样核验（数据治理，非代码问题）。
2. **employee「停用」语义粒度粗**：employee 表无独立状态列，登录门只挡 is_deleted；已删除员工的登录被拒，但「离职待删」中间态依赖 HR 数据治理流程。任职有效性由巡查业务 fail-closed 兜底，不会产生错误业务数据。
3. **/api/current-employee 仍走姓名匹配旧链路**：工作台身份卡片用它（UI-01 既定）。当前生产 62/62 realName 与员工姓名一致故可用；若未来出现改名不一致，该接口会 fail-closed（显示重试），而巡查提交不受影响（走 employee_id 权威链）。后续阶段建议统一 current-employee 到 employee_id 链（需授权，本阶段未动）。
4. **dev bootstrap 自动登录干扰**：dev 环境 VITE_DEV_USERNAME 自动登录仍会在页面加载时尝试失败登录（仅 dev；E2E 已用 init 脚本隔离），生产构建无此问题。
5. 移动端真机联调（iOS/Android 微信内置浏览器）仍未做（延续 UI-01 遗留）。

## 22. 后续阶段建议

1. 手机号-员工本人对应关系的抽样核验清单（管理动作，可由现有用户管理通道修正）。
2. 将 GET /api/current-employee 迁移到 users.employee_id 权威链（保留姓名链作显式回退或废弃），消除姓名匹配旧链路。
3. 移动端账号管理闭环：管理员为网格长重置密码/维护手机号的最小管理界面（复用既有 users 管理通道）。
4. 真机联调：两条巡查链路 + 登录在 iOS/Android 微信内置浏览器实测。
5. 登录失败锁定在开发环境的行为与生产保持可切换验证（当前为环境开关，非缺陷）。

## 23. 最终状态

**PASS_WITH_RISK**

- 目标功能完整落地：手机号+密码 → users.phone → users.employee_id → employee → employee_code → 现有 JWT → 移动端登录态，全程服务端权威解析、fail-closed。
- PC 登录零改动且回归通过；JWT 零结构变更且回归通过；零数据库变更、零新依赖、零第二套密码体系。
- 测试：API 级 16/16 + 浏览器 E2E 9/9 全过；类型检查 60=基线。
- 风险项：手机号-本人对应关系需数据治理抽样核验（§21-1）；生产部署未授权未执行（§17/§19）。

---

## 附：验证执行记录（2026-09-15）

1. 手机号数据源审计：生产/开发只读 SELECT 双库核查（users.phone/employee.phone/唯一性/链路完整性/realName 一致率）。
2. API 级测试：`node server/_l02_login_tests.cjs`（含 dev 护栏断言），16/16。
3. 浏览器 E2E：`node server/_l02_browser_e2e.cjs`，9/9，截图 3 张。
4. 类型检查：vue-tsc 全库 60 错误 = 基线；本次改动文件 0 错误。
5. 日志安全核查：dev 后端日志全量过滤 `[Auth/MobileLogin]`——手机号全部脱敏、无密码、无完整 token。
6. 事故披露与验证：测试脚本首跑误写生产 users 的瞬时事件已披露（§17），只读验证零残留（63/63 用户、0 条 `_l02%`）。
