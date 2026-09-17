# CF-WPS-15：Cloudflare 真实部署与公网 H5 安全/E2E 验证 · 提示词（任务书归档）

> 归档说明：本文为 CF-WPS-15 阶段任务书的忠实记录（据本阶段下发原文整理），用于留档与复现。
> 配套实施报告：`CF-WPS-15-Cloudflare真实部署与公网H5安全E2E验证报告.md`

---

## 一、先读文档，禁止直接修改
先读取并审计 `docs/AI智能分析/CF-WPS-11*`～`CF-WPS-14*` 与 `grid-mobile-cloudflare/`，先输出 10 项：
1. 当前 Cloudflare Pages 配置
2. 当前 Worker 配置
3. 当前 Pages Functions 代理配置
4. 当前 Worker secrets/env 使用方式
5. 当前登录链
6. 当前 WPS Sheet 13/14 使用方式
7. 当前生产安全四开关
8. 当前 Attachment PENDING_EXTERNAL 状态
9. 当前幂等 LIMITED 状态
10. 当前登录限流状态

## 二、核心目标
真实 Cloudflare 环境完成 Pages → Pages Functions → Worker → WPS Sheet14/13 → H5，并完成真实公网浏览器 E2E。**绝对不能进入生产巡查 Sheet。**

## 三、生产安全硬约束（全程保持）
- `WPS_PATROL_TARGET_SHEET=UNRESOLVED`
- `MOBILE_PATROL_PRODUCTION_ENABLED=false`
- `PRODUCTION_WRITE_AUTHORIZED=false`
- `WPS_PATROL_FIELDS_CONFIRMED=false`
- 禁止：写 Sheet 3 / 改 Sheet 3 / 改 Sheet 11 / 改 WPS→PG Pull / 改 PG 生产数据 / 改三违业务 / 改责任归属 / 改扣分 / 改审核 / 改整改 / 改 PC 台账 / 改 HSE 登录 JWT / 开生产写入 / 自决正式 Sheet / 自建生产字段。
- 允许：Sheet 13（测试巡查）、Sheet 14（测试身份），仅用于线上 E2E。

## 四、Cloudflare 部署
- 若具备 CF API Token + Account ID：wrangler 登录→查 account→查 Pages/Worker→部署 Worker→配 Secrets→部署 Pages→配 Functions→配 WORKER_ORIGIN→验证 Pages→Worker→WPS。
- 若无凭据：**必须明确 `CLOUDFLARE_DEPLOYMENT_STATUS=BLOCKED`**；不得伪造部署；不得改代码制造"模拟部署成功"。

## 五、Secrets 安全
- `WPS_CLIENT_ID`/`WPS_CLIENT_SECRET`/`JWT_VERIFY_SECRET`/`WORKER_SESSION_SECRET` 只存在 Cloudflare Secret；不进前端/wrangler.toml 明文/git/API 响应/localStorage/sessionStorage/console/错误响应/截图/报告正文。
- 浏览器 DevTools/Network/源码/JS bundle 不得出现 APPSECRET/CLIENT_SECRET/access_token/refresh_token/JWT secret/WORKER_SESSION_SECRET/password_hash。

## 六、Pages → Worker 同源验证
- `/api/mobile/auth/login|me`、`/api/mobile/patrol/meta|submit|records` 全部经真实 Pages 域名访问；禁止前端直连 WPS、禁止暴露 WPS 凭据。

## 七、CORS
- 验证正常 Pages Origin / 非授权 Origin / OPTIONS 预检 / 非授权不返回 ACAO / 不允许 `*` / 不允许任意反射。`REAL_PUBLIC_CORS_STATUS=PASS/FAIL`。

## 八、登录真实公网验证
- 用 Sheet 14 测试身份验证：正确密码/错误密码/不存在手机号/停用身份/employee_code 无效/Sheet11 无对应/过期/logout/logout 后 /me 401。
- 严禁短信/微信/WPS OAuth 登录；业务身份仍 = employee_code。

## 九、bcrypt + Cloudflare CPU
- 真实线上测量 `PUBLIC_LOGIN_BCRYPT_STATUS`：响应时间/cost=10 是否正常/CPU 是否超限/1101-1102/连续登录稳定性。
- 若免费计划 CPU 限制失败：**不得降低密码安全等级、不得偷偷改 bcrypt cost**；报告 `BCRYPT_CLOUDFLARE_CPU_STATUS=BLOCKED` 并停止进一步生产上线。

## 十、登录限流
- 已知 `PUBLIC_LOGIN_RATE_LIMIT_STATUS=NOT_IMPLEMENTED`（注：CF-WPS-15 审计修正为 best-effort 已实现的每隔离实例限速，非完全未实现）。
- 先验证现状；若无/弱实现，保持状态并评估公网前是否必须增加；若认为必须修改，**先报告 `LOGIN_RATE_LIMIT_CHANGE_REQUIRED=true` 等待授权**，不直接改。

## 十一、真实公网巡查 E2E
- 仅 Sheet 13 + Sheet 14 测试身份；完整执行登录→工作台→开始巡查→employee_code→网格解析→问题类型→描述→是否三违→三违信息→照片 PENDING_EXTERNAL→提交→Sheet13→列表→详情→退出。
- 优先 Android Chrome，其次 iPhone Safari；设备不可用可用 Chrome Mobile emulation，但必须标注 `REAL_PUBLIC_BROWSER_E2E` 或 `REAL_BROWSER_MOBILE_EMULATION`，**不得把普通 API 测试标成手机 E2E**。

## 十二、第二身份隔离测试
- 用户 A 建记录、用户 B 尝试访问 → 必须 404；B 的 records 只看到自己的。
- 若仅一个测试身份无法完成：明确 `CROSS_USER_RECORD_ISOLATION=NOT_EXECUTED`，**不得继承后写成 PASS**。

## 十三、Protected Fields
- 伪造 employee_code/grid_id/inspector_employee_id/attribution_status/responsibility/deduction/review → 服务器忽略/拒绝；最终 WPS 记录 employee_code=Session、grid=服务端解析、inspector_employee_id/attribution_status 不允许客户端覆盖。

## 十四、生产污染检查
- 部署前后读 Sheet3/Sheet11 baseline，必须相等；Sheet13/Sheet14 回基线；`PRODUCTION_WPS_POLLUTION=0`。

## 十五、幂等
- 保持 `IDEMPOTENCY_STATUS=LIMITED`；真实公网测连续双击/同 client_request_id 重复提交，如实报告竞态；不擅自设计复杂分布式幂等。

## 十六、Attachment
- 严格保持 `PHOTO_STATUS=PENDING_EXTERNAL`；不再破解 WPS Attachment、不猜 API、不接第三方存储/Tunnel、不改 CF-WPS-12B 结论；拍照 UI 可存在但不得假装可 WPS 预览。

## 十七、网络异常测试
- 测 Worker 不可达/WPS 超时/WPS 错误/重复点击/刷新/Session 失效/logout 后调用/无网络提交；错误须明确、可理解、不泄露 secret/内部堆栈/WPS token。

## 十八、安全扫描
- secret scan / frontend bundle scan / source scan / wrangler.toml scan / browser Network scan / console scan；重点查 WPS credentials/JWT secret/session secret/password_hash/access_token/refresh_token。

## 十九、代码变更限制
- 优先部署/配置/测试/验证；禁止无必要改业务代码。必须改只限 A 部署配置 / B 安全漏洞 / C E2E 测试缺陷；D 业务功能变更必须停止并报告。

## 二十、状态判定（分别输出）
CF-WPS-15_STATUS / CLOUDFLARE_DEPLOYMENT_STATUS / PUBLIC_H5_E2E_STATUS / REAL_PUBLIC_BROWSER_E2E / CROSS_USER_RECORD_ISOLATION / PUBLIC_LOGIN_RATE_LIMIT_STATUS / BCRYPT_CLOUDFLARE_CPU_STATUS / CORS_PUBLIC_STATUS / SECRET_EXPOSURE_STATUS / PRODUCTION_WPS_POLLUTION / TEST_SHEET_E2E_STATUS / IDEMPOTENCY_STATUS / PHOTO_STATUS / WPS_PATROL_TARGET_SHEET / MOBILE_PATROL_PRODUCTION_ENABLED / PRODUCTION_WRITE_AUTHORIZED / WPS_PATROL_FIELDS_CONFIRMED。

## 二十一、PASS 标准
- 须同时满足 19 项（真实部署成功/Pages 可访问/Worker 可访问/Pages→Worker→WPS/登录/bcrypt/Session/submit/records/detail/logout/protected fields/CORS/secret 无泄露/Sheet3 零变化/Sheet11 零变化/Sheet13 清理/Sheet14 清理/真实公网浏览器 E2E）。
- 否则 PASS_WITH_RISK 或 BLOCKED；**禁止为 PASS 修改验收标准**。

## 二十二、必须生成 Markdown
- `docs/AI智能分析/CF-WPS-15-Cloudflare真实部署与公网H5安全E2E验证报告.md`（23 节：执行时间/Cloudflare环境/Pages/Worker/Secrets/WPS Sheet/浏览器/E2E/API/CORS/bcrypt CPU/登录限流/第二身份隔离/protected fields/幂等/Attachment/生产污染/secret scan/回归/风险/未完成/回滚/最终状态）。
- `docs/AI智能分析/CF-WPS-15-Cloudflare真实部署与公网H5安全E2E验证提示词.md`。
- 真实值（Secret/Token/密码/Access/Refresh）不得写入报告。

## 二十三、最重要停止条件
- 完成后立即停止，不进 CF-WPS-16；不自决生产 Sheet/字段、不打开生产写入、不改 Sheet3/11、不接第三方图片存储、不破解 Attachment、不自实现登录限流、不降低 bcrypt cost。
- 必须业务决策：`BUSINESS_DECISION_REQUIRED=true` 并停止。

---

## 本阶段执行结论（归档附注，非任务书原文）
- **真实 Cloudflare 部署 BLOCKED**：本环境无 CF 账户/Token（`wrangler whoami` 未认证，env/`~/.cloudflare` 均无）→ `CLOUDFLARE_DEPLOYMENT_STATUS=BLOCKED`，未伪造部署。
- **等价验证（LOCAL，明确非公网）**：本地真实浏览器 E2E 33/33 PASS；回归 8/8 全绿；生产污染 0；secret scan CLEAN。
- **修正 CF-WPS-14 旧注**：登录限流非「完全未实现」，源码含 best-effort 每隔离实例限速（10min/30 次→429），故 `PUBLIC_LOGIN_RATE_LIMIT_STATUS=BEST_EFFORT_IMPLEMENTED` + `LOGIN_RATE_LIMIT_CHANGE_REQUIRED=true`。
- **未实测项（因无公网）**：REAL_PUBLIC_BROWSER_E2E / CROSS_USER_RECORD_ISOLATION / BCRYPT_CLOUDFLARE_CPU_STATUS / CORS_PUBLIC_STATUS = NOT_EXECUTED。
- **综合判定：`CF-WPS-15_STATUS = BLOCKED`**（核心目标=真实公网部署+公网 E2E 不可完成；功能/安全以本地等价验证）。四生产开关保持 false/UNRESOLVED。
