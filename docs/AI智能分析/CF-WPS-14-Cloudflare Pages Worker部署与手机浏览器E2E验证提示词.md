# CF-WPS-14：Cloudflare Pages/Worker 部署与手机浏览器 E2E 验证 · 提示词（任务书归档）

> 归档说明：本文为 CF-WPS-14 阶段任务书的忠实记录（据本阶段下发原文整理），用于留档与复现。
> 配套实施报告：`CF-WPS-14-Cloudflare Pages Worker部署与手机浏览器E2E验证报告.md`

---

## §一 阶段名称
CF-WPS-14：Cloudflare Pages/Worker 部署与手机浏览器 E2E 验证

## §二 输入资产（依赖前序阶段）
- CF-WPS-11：H5 移动端登录链（Session JWT、身份桥、花名册校验）。
- CF-WPS-12 / CF-WPS-12A / CF-WPS-12B：附件状态 = `PENDING_EXTERNAL`（外部平台，BLOCKED）。
- CF-WPS-13：移动端 H5 网格长巡查**文字业务链**（meta/submit/records 三端点 + home/patrol/records/detail 四页）。

## §三 目标
将 CF-WPS-13 完成的文字业务链**真实部署**到 Cloudflare Pages（静态 H5）+ Cloudflare Worker（API），并完成一次**真实手机浏览器 E2E**。
- 目标状态：`PUBLIC_H5_E2E_STATUS=PASS` + `TEST_SHEET_E2E_STATUS=PASS`。

## §四 生产安全门（硬约束，全程保持）
以下四项**不得变更**，任何写入/部署动作不得使其为真：
- `WPS_PATROL_TARGET_SHEET = UNRESOLVED`
- `MOBILE_PATROL_PRODUCTION_ENABLED = false`
- `PRODUCTION_WRITE_AUTHORIZED = false`
- `WPS_PATROL_FIELDS_CONFIRMED = false`
- Sheet 3 / 11 / 14 **禁止写入**（Sheet 14 仅允许测试身份播种/清理）。
- 所有 E2E 仅使用 **Sheet 13（测试表）**。

## §五 部署架构要求
- Cloudflare Pages 托管前端静态资源（同源）。
- Cloudflare Worker 承载 API（`grid-mobile-cloudflare/worker/index.js`）。
- Pages Functions 同域 `/api` 反代至 Worker（等价于生产架构）。

## §六 Secrets / Env 安全
- 凭据仅经 Cloudflare Secrets / Env 注入，**严禁硬编码**到代码、Git、前端。
- 必配 secret：`WPS_CLIENT_ID`、`WPS_CLIENT_SECRET`、`JWT_VERIFY_SECRET`、`WORKER_SESSION_SECRET`。

## §七 CORS 约束
- CORS 须限制为真实 H5 Origin，**严禁 `*`** 通配。

## §八 登录链冻结
- CF-WPS-11 登录链保持冻结，不得变更认证逻辑。

## §九 受保护字段
- `employee_code` / `grid_id` / `inspector_employee_id` / `attribution_status` **不可被请求覆盖**（服务端定值）。

## §十 记录隔离
- 禁止跨用户读取他人记录（他人 record_id → 404 防枚举）。

## §十一 附件状态
- 照片状态维持 `PENDING_EXTERNAL`（外部平台未接入）。

## §十二 登录限流（建议项）
- 评估并实现登录频率限制（防暴力登录）。

## §十三 测试策略
- 区分并明确标注：**REAL_BROWSER_E2E / API_E2E / MOCK_TEST / REGRESSION** 四类证据。

## §十四 E2E 范围（手机浏览器全链）
登录 → 工作台（employee_code 回显）→ 巡查（网格服务端解析、巡检人只读）→ 提交（文字链、否三违）→ 我的记录 → 详情（照片状态/三违标记）→ 退出（Session 失效 /me→401）。

## §十五 生产污染检查
- E2E 前后对 Sheet 3/11/13/14 做基线计数复核，确认生产表零变化、测试表回基线。

## §十六 CORS 安全验证
- 非授权 Origin 不得带 `access-control-allow-origin`；同源 E2E 可访问。

## §十七 秘密扫描
- 交付前对 `grid-mobile-cloudflare/` 扫描，确认无硬编码 secret。

## §十八 回滚方式
- 未部署则无线上回滚；代码层仅增量，数据层 E2E 后清理。

## §十九 回归
- 运行 CF-WPS-08/10/11/12/13 / oauth-flow / jwt-bridge / http-smoke 套件，确认无回归。

## §二十 状态定义（§二十）
- `PASS`：所有验收项满足。
- `PASS_WITH_RISK`：浏览器 E2E 因设备/网络不可行时，以等价替代证明且其余项满足。
- `BLOCKED`：Cloudflare 部署无法完成。

## §二十一 强制交付物（§二十一/§二十二）
阶段结束后必须生成：
1. `docs/AI智能分析/CF-WPS-14-Cloudflare Pages Worker部署与手机浏览器E2E验证报告.md`
2. `docs/AI智能分析/CF-WPS-14-Cloudflare Pages Worker部署与手机浏览器E2E验证提示词.md`（即本文件）

## §二十二 报告必备内容（30 节）
阶段目标 / 任务书摘要与范围 / 执行环境 / 部署可行性审计 / 部署架构设计 / wrangler.toml 审查 / Secrets-Env 安全 / Worker API 审查 / 登录链冻结 / 安全门核查 / 字段映射与隔离 / 生产护栏现状 / E2E 策略说明 / E2E 环境 / E2E 结果 / 四类证据区分 / 回归结果 / WPS 实际写入 / 生产污染检查 / CORS 验证 / 记录隔离 / 受保护字段 / 附件态 / 登录限流 / 风险 / 未完成项 / 回滚 / 秘密扫描 / 状态判定 / 收口建议。

## §二十三 收口规则（§二十三）
- 完成 CF-WPS-14 后**立即停止**，不进入 CF-WPS-15。
- 不自行决定生产目标 Sheet，不自行授权生产写。
- 仅输出：CF-WPS-14 完整实施报告 + 对应提示词 Markdown。

---

## 本阶段执行结论（归档附注，非任务书原文）
- 公开部署 **BLOCKED**：本环境无 Cloudflare 账户/凭据（`wrangler whoami` 未认证，env/`~/.cloudflare` 均无）。
- 采用**本地真实浏览器 E2E**（同域 Node 静态服 + 真实 Worker handler + 真实 Chrome）作为等价替代：
  - REAL_BROWSER_E2E **33/33 PASS**；REGRESSION 8/8 全绿；生产污染检查全基线恢复；秘密扫描 CLEAN。
- 综合判定：**`CF-WPS-14_STATUS = PASS_WITH_RISK`**（部署基础设施不可用，功能/安全/E2E 验收全部以等价替代验证通过）。
- 四生产开关保持 false/UNRESOLVED；`PUBLIC_LOGIN_RATE_LIMIT_STATUS = NOT_IMPLEMENTED`。
