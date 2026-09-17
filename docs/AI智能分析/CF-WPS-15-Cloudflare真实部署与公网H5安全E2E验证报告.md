# CF-WPS-15：Cloudflare 真实部署与公网 H5 安全/E2E 验证 实施报告

> 生成时间：2026-09-16（审计+本地 E2E 复跑+回归复跑，本轮实跑）
> 阶段归属：HSE 网格长巡查 · Cloudflare 移动端链（CF-WPS-11/12/12A/12B/13/14 → **CF-WPS-15**）
> **诚实总判定：`CF-WPS-15_STATUS = BLOCKED`** —— 本环境无任何 Cloudflare 账户/Token，真实公网部署与公网浏览器 E2E 均不可执行；功能/安全属性以**本地真实浏览器 E2E + 回归**等价验证（明确区分 LOCAL / 公网）。

---

## 1. 执行时间
- 2026-09-16（§一 审计、§四 凭据复验、本地 E2E 复跑、8 套件回归复跑均在本轮完成）。

## 2. Cloudflare 环境
- `wrangler whoami` → `You are not authenticated. Please run \`wrangler login\`.`
- 环境变量无 `CF_API_TOKEN` / `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`；`~/.cloudflare` 不存在。
- `wrangler` 4.132.0 仅装于隔离 node workspace（可行性探测），未授权。
- **结论：本沙箱无 Cloudflare 账户/凭据 → 真实 Pages/Worker 部署、真实公网域名、真实公网浏览器 E2E 均不可完成。**

## 3. Pages
- 无 Pages 项目、无 `*.pages.dev`、未 `wrangler pages deploy`。
- 本地资产：`frontend/`（静态 H5，`API_BASE=''` 同源）+ `pages/functions/api/[[route]].js`（同源反代设计稿）。
- 部署前置（待授权）：`wrangler pages deploy frontend/ --project-name=...` + Pages 环境变量 `WORKER_ORIGIN`。

## 4. Worker
- `worker/wrangler.toml`：`name=grid-mobile-cloudflare-worker`、`main=index.js`、ESM、`compatibility_date=2024-09-23`。
- `[vars]` 仅非敏感（WPS 端点、`CF_ALLOWED_ORIGINS=""`、`ALLOW_WPS_WRITE`/`MOBILE_LOGIN_ENABLED` 注释=禁写）。
- 未 `wrangler deploy`（无账户）。

## 5. Secrets
- 敏感项：`WPS_CLIENT_ID` / `WPS_CLIENT_SECRET` / `JWT_VERIFY_SECRET` / `WORKER_SESSION_SECRET`。
- 交付方式：仅 `wrangler secret put`（注释列于 wrangler.toml），不进 `[vars]`、不进前端、不进 Git、不进响应、不进浏览器存储、不进 console、不进截图/报告正文。
- 本轮 secret scan（src + frontend）：**CLEAN** —— 源码无字面 secret 赋值；前端无 `sk-`/`AKID`/`access_token`/`client_secret` 暴露；`DUMMY_BCRYPT_HASH` 为防时序枚举的测试常量（非真实凭据）。

## 6. WPS Sheet
- Sheet 14（测试身份）：播种/清理，bcrypt `password_hash`，字段 employee_code/姓名/手机号码/部门/职位/身份状态/创建时间（无测试编号）。
- Sheet 13（隔离测试巡查表）：写记录，`client_request_id` 幂等预查。
- **Sheet 3（生产三违）/ Sheet 11（花名册）零写入**（基线复核见 §17）。

## 7. 浏览器
- 本地 E2E 驱动**真实 Google Chrome**（Chromium，viewport 390×844 + Android UA，headless），走完整手机链（见 §8）。
- 真实公网浏览器 E2E：**未执行**（无公网部署）→ `REAL_PUBLIC_BROWSER_E2E = NOT_EXECUTED`。

## 8. E2E（本地真实浏览器，明确标注 LOCAL，非公网）
- 测试：`worker/test/cfwps14-e2e.mjs`（同域 Node 静态服 PORT8788 跑真实 `worker.fetch` handler + 真实 Chrome；secrets 仅进内存）。
- **结果：33/33 PASS**（本轮复跑）。
- 覆盖：登录(刘胜彬 00369234)→工作台 employee_code 回显→网格服务端解析(八里堂村惠宁)→提交写 Sheet13 记录(CLf 类)→记录/详情(PENDING_EXTERNAL/未拍摄)→退出 `/me`401→CORS 非授权 Origin 无 ACAO→零 JS 异常→清理回基线。
- ⚠️ 该 E2E 为**本地同源等价替代**，**不等于**真实公网部署 E2E；禁止据此声称 `REAL_PUBLIC_BROWSER_E2E=PASS`。

## 9. API
- Worker 端点经本地真实 handler 验证：login/meta/submit/records/me/logout 全链可用；受保护字段服务端定值（见 §13）；他人记录 404 防枚举（继承 CF-WPS-13 真机结论，单浏览器难构造第二身份，见 §12）。

## 10. CORS
- `CF_ALLOWED_ORIGINS=""` → 非授权 Origin 无 `access-control-allow-origin`；OPTIONS 预检非授权 Origin 204 无 ACAO；同源访问可通。
- 无 `Access-Control-Allow-Origin: *`、无任意 Origin 反射。
- `CORS_PUBLIC_STATUS`：本地验证 = PASS（架构与公网同源一致）；公网实测 = NOT_EXECUTED。

## 11. bcrypt CPU
- bcryptjs 纯 JS（cost 10 校验约 50–150ms CPU）。
- `BCRYPT_CLOUDFLARE_CPU_STATUS = NOT_EXECUTED`：**未实测**（无 Cloudflare 部署，无法测量公网 Worker CPU / 1101/1102 / CPU exceeded）。
- 不降低密码安全等级、不偷偷改 bcrypt cost；公网部署前须用付费计划并配 `[limits] cpu_ms` 实测（待授权）。

## 12. 登录限流（修正 CF-WPS-14 旧注）
- 源码实际含 `loginRateLimited(ip)`（内存级 `loginFailCounter`，10min 窗口 / 30 次失败 → 429 `TOO_MANY_ATTEMPTS`），**best-effort 每隔离实例**限速，非持久/分布式（isolate 重建即清零）。
- `PUBLIC_LOGIN_RATE_LIMIT_STATUS = BEST_EFFORT_IMPLEMENTED`（非「完全未实现」，亦非生产级防暴力）。
- `LOGIN_RATE_LIMIT_CHANGE_REQUIRED = true`：公网暴露前建议升级为分布式限速（如 Workers KV / Rate Limiting 规则）。**本阶段未改代码。**

## 13. 第二身份隔离
- 真实公网双身份隔离测试：**未执行**（仅一个测试身份，且无论证公网）→ `CROSS_USER_RECORD_ISOLATION = NOT_EXECUTED`。
- 代码层：他人 record_id → 404（CF-WPS-13 真机已覆盖）；records 仅返回当前 Session employee_code 所属记录。继承结论，不伪造成 PASS。

## 14. Protected Fields
- 恶意提交 `employee_code`/`grid_id`/`inspector_employee_id`/`attribution_status`/`responsibility`/`deduction`/`review`：服务端**忽略**——`employee_code` 取自 Session(`payload.sub`)，`grid` 由 Sheet11 服务端解析，其余受保护字段不展开请求体。
- 代码结构保证「受保护字段不可由客户端覆盖」（CF-WPS-13/14 真机 + 本轮回显验证）。

## 15. 幂等
- `IDEMPOTENCY_STATUS = LIMITED`：基于 `client_request_id` 对测试 Sheet `list_by_page` 扫描预查（O(n)），重复提交返回 `deduplicated:true`；不声称强一致/分布式幂等。
- 公网竞态（双击提交）实测：NOT_EXECUTED（无公网）；本阶段未设计复杂分布式幂等。

## 16. Attachment
- `PHOTO_STATUS = PENDING_EXTERNAL`（有照片）/ `未拍摄`（无照片），严格保持。
- CF-WPS-12B 终局未改：不接第三方对象存储、不接 Tunnel、不破解 WPS Attachment、不假装页面可预览。拍照 UI 存在，状态明示。

## 17. 生产污染（基线复核）
| 表 | 基线 | 终态 | 结论 |
|---|---|---|---|
| S3 生产三违巡查表 | 2063 | 2063 | 零变化 |
| S11 花名册 | 1291 | 1291 | 零变化 |
| S13 测试表 | 3 | 3 | 回基线 |
| S14 身份表 | 3 | 3 | 回基线 |
- `PRODUCTION_WPS_POLLUTION = 0`。

## 18. secret scan（§十八 全项）
- secret scan（src）：CLEAN；frontend bundle/html scan：CLEAN；source/wrangler.toml scan：CLEAN（仅非敏感 `[vars]` + `wrangler secret put` 注释）；browser Network/console scan：未执行公网（本地 E2E 已验证响应无 secret/token/password_hash/access_token 泄露）。
- `SECRET_EXPOSURE_STATUS = PASS`（本地验证；公网实测 NOT_EXECUTED）。

## 19. 回归
- 8 套件全绿（本轮复跑）：cfwps08:8/8、cfwps10:8/8、cfwps11:38、cfwps12:25、cfwps13:46、oauth-flow:9、jwt-bridge:3/3、http-smoke:3/3。
- 无回归（CF-WPS-15 零业务代码变更，仅新增本报告与提示词归档）。

## 20. 风险
1. **部署 BLOCKED（硬环境限制）**：无 CF 账户/Token → 真实公网部署与公网 E2E 不可完成。
2. **登录限流仅 best-effort**：per-isolate 内存，非分布式；公网暴露前须升级。
3. **bcrypt CPU 未实测**：免费计划 10ms CPU 上限下 cost 10 或超时，须付费计划 + `cpu_ms` 实测。
4. **第二身份隔离未实测**：需公网 + 双身份。
5. **幂等 LIMITED**：公网并发竞态未验证。
6. **生产落表 UNRESOLVED**：四生产开关保持 false/UNRESOLVED。

## 21. 未完成事项
- 真实 Cloudflare 部署（需业务方提供账户/Token）。
- 公网浏览器 E2E、CORS 公网实测、bcrypt CPU 实测、第二身份隔离实测。
- 登录分布式限流、问题类型清单确认、生产目标 Sheet/字段授权。

## 22. 回滚方式
- 未部署 → 无线上回滚。
- 代码层零修改（仅报告/提示词）；`grid-mobile-cloudflare/` 源码保持冻结。
- 数据层：本地 E2E 已 batch_delete 清理，基线复核通过（§17）。

## 23. 最终状态（§二十）
```
CF-WPS-15_STATUS                = BLOCKED
  （核心目标=真实 Cloudflare 部署+公网 E2E，因无账户不可完成；功能/安全以本地等价验证）
CLOUDFLARE_DEPLOYMENT_STATUS   = BLOCKED
PUBLIC_H5_E2E_STATUS            = BLOCKED      （无公网部署）
REAL_PUBLIC_BROWSER_E2E         = NOT_EXECUTED （无公网）
REAL_BROWSER_E2E                = PASS         （本地真实 Chrome，33/33，等价证据，非公网）
CROSS_USER_RECORD_ISOLATION     = NOT_EXECUTED
PUBLIC_LOGIN_RATE_LIMIT_STATUS  = BEST_EFFORT_IMPLEMENTED
  LOGIN_RATE_LIMIT_CHANGE_REQUIRED = true
BCRYPT_CLOUDFLARE_CPU_STATUS    = NOT_EXECUTED
CORS_PUBLIC_STATUS              = NOT_EXECUTED （本地 PASS；公网未测）
SECRET_EXPOSURE_STATUS          = PASS         （本地扫描/响应验证 CLEAN；公网未测）
PRODUCTION_WPS_POLLUTION        = 0
TEST_SHEET_E2E_STATUS           = PASS
IDEMPOTENCY_STATUS              = LIMITED
PHOTO_STATUS                    = PENDING_EXTERNAL
WPS_PATROL_TARGET_SHEET         = UNRESOLVED
MOBILE_PATROL_PRODUCTION_ENABLED = false
PRODUCTION_WRITE_AUTHORIZED     = false
WPS_PATROL_FIELDS_CONFIRMED     = false
```
- Seqs/凭据/密码/Token 在报告中**只标注状态，不出现任何值**。

## 24. 收口（§二十三）
- CF-WPS-15 完成后**立即停止**，不进入 CF-WPS-16。
- 不自决生产巡查 Sheet、不自建生产字段、不打开生产写入、不改 Sheet3/11、不接第三方图片存储、不破解 Attachment、不自实现登录限流（仅报告建议）、不降低 bcrypt cost。
- 业务决策缺口：`BUSINESS_DECISION_REQUIRED=true`（CF 账户、目标 Sheet、字段确认、分布式限流、cpu_ms 配置均须业务方授权）。
- 交付：本报告 + 提示词归档（见同名 `...验证提示词.md`）；本地 E2E 截图 7 张（`worker/test/_cfwps14_shots/`）。
