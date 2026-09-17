# CF-WPS-17 提示词（任务书归档 · 未执行）

> 本文件为 CF-WPS-16 完成后、依 §二十二 生成的「下一阶段提示词存档」。
> **状态：NOT_EXECUTED —— CF-WPS-16 已停止，未自动进入 CF-WPS-17。**
> 仅当业务方完成下方「前置解锁条件」后方可执行本任务书。

---

## 前置解锁条件（必须全部满足，否则 CF-WPS-17 不可开始）
1. **Cloudflare 凭据到位**：业务方提供 CF 账户并授权 `wrangler login`（或注入 `CF_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`）。→ 解 `CLOUDFLARE_DEPLOYMENT_STATUS=BLOCKED`。
2. **正式「生产用台账」(sheet 15) 字段决策落地**（二选一，须业务方书面确认）：
   - (A) WPS 管理员在 sheet 15 增加缺失字段：网格、问题描述、问题类型、是否三违、client_request_id；并确认「巡查时间」类型（建议 Date）；或
   - (B) 业务方改选一个**已具备网格巡查结构**的正式 Sheet 作为目标（不得是 Sheet 3）。
   → 解 `FORMAL_SHEET_FIELD_STATUS=BLOCKED`。
   - 注意：CF-WPS-16 严格「不自动创建字段」。字段变更须由 WPS 侧/业务方执行，不在本链代码内臆造。
3. 上线前：确认分布式登录限流方案（Workers KV / Rate Limiting 规则）与 bcrypt `cpu_ms` 实测计划（须付费计划）。

---

## 一、阶段目标
在 CF-WPS-16 解锁后，完成：
- 真实 Cloudflare Pages + Worker + Pages Functions 部署（同源 `/api`）。
- 配置 Cloudflare Secrets（WPS_CLIENT_ID/SECRET、JWT_VERIFY_SECRET、WORKER_SESSION_SECRET），secret scan 通过。
- 真实公网 HTTPS + 真实手机浏览器（Android Chrome / iPhone Safari）E2E。
- 真实公网 CORS、bcrypt CPU、第二身份隔离、登录限流验证。
- **仍保持** `MOBILE_PATROL_PRODUCTION_ENABLED=false`、`PRODUCTION_WRITE_AUTHORIZED=false` 直到字段映射 PASS 且业务二次确认。

## 二、生产安全硬约束（继承 CF-WPS-16）
- WPS_PATROL_TARGET_SHEET = 生产用台账（sheet 15，已定位；或业务改选表）。
- 禁止写 Sheet 3 / Sheet 11 / PostgreSQL / 触发正式 Pull / 改三违业务。
- 仅 Sheet 13（隔离测试）+ Sheet 14（身份播种/清理）+ 经授权且字段就绪后的 sheet 15 **只读 dry-run 优先**，正式 create 必须业务二次确认。

## 三、Cloudflare 正式部署
- `wrangler whoami` 确认账户 → `wrangler deploy`（worker）→ `wrangler secret put` ×4 → `wrangler pages deploy frontend/` → Pages Functions `WORKER_ORIGIN` 配置。
- 验证 Pages→Worker→WPS 全链；验证默认 `*.pages.dev` 或自定义域名 HTTPS。

## 四、Secrets 安全
- 四 secret 仅 Cloudflare Secrets；前端 bundle / Network / console / 响应 / 报告正文均不得出现任何 secret 值。

## 五、正式 Sheet 字段映射（接续 CF-WPS-16 §10）
- 基于解锁后的 sheet 15 schema，建立 `WPS_PATROL_FORMAL_FIELD_MAP`，逐字段核对 OK/PARTIAL/MISSING。
- `FORMAL_SHEET_FIELD_STATUS=PASS` 后方可谈 dry-run→正式 create。

## 六、真实公网 E2E（§九/§十一/§十二/§十三）
- 公网 URL 打开、HTTPS、静态资源、/api/mobile/auth/login、Sheet14 身份、bcrypt、employee_code、Sheet11 映射、Session、/me、首页、巡查页、meta、网格选择、表单、正式台账 dry-run、记录列表、详情、logout、logout 后 401。
- 第二身份隔离：若 Sheet14 有第二个合法身份 → A/B 互不可见彼此记录（404）；否则 `NOT_EXECUTED`。

## 七、CORS / bcrypt CPU / 限流 / 幂等 / 照片
- CORS 公网：同源 PASS、非授权 Origin 无 ACAO、无 `*`、无反射。
- bcrypt CPU：cost 10 真实 Worker runtime 实测；超限 → `BLOCKED` 且**不降 cost**。
- 限流：保持 best-effort；如需分布式须单独授权。
- 幂等：LIMITED；sheet 15 须有 `client_request_id` 字段方可落预查。
- 照片：`PENDING_EXTERNAL` 不变。

## 八、生产污染检查 / 安全扫描 / 回归
- 部署前后 S3/S11/S13/S14/S15 count 对比，要求零生产污染。
- secret scan、前端 bundle scan、Git diff scan 全过。
- 回归 8 套件全绿。

## 九、最终验收（§二十 对齐）
- 仅当：Cloudflare 实际部署成功 + 公网 HTTPS + Secrets 未泄露 + 公网登录成功 + 手机真实 E2E PASS + bcrypt CPU PASS + CORS 公网 PASS +（隔离 PASS 或 NOT_EXECUTED）+ 限流保持 + 正式 Sheet 唯一定位 + 字段核验 PASS + 仅 dry-run + 四开关 false + S3/11 零污染 + 照片 PENDING_EXTERNAL + 回归全 PASS → `CF-WPS-17_STATUS=PASS_WITH_RISK`。
- 任一硬条件不满足 → `BLOCKED` 或 `PASS_WITH_RISK`，**不得为 PASS 降低标准**。

## 十、停止条件
- 完成后停止；不得自动进入 CF-WPS-18；不得自行开生产写入、自行建字段、自行接存储、自行降 bcrypt、自行实现限流。
- 正式生产写入须留到业务再次明确确认后。

---

> 本提示词仅为存档。执行须由业务方在解锁条件满足后显式发起 CF-WPS-17。
