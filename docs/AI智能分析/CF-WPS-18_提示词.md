# CF-WPS-18 提示词存档（未执行）

> 本文件为 CF-WPS-17 完成后生成的「下一阶段任务书」存档。
> **CF-WPS-17 已停止，CF-WPS-18 尚未启动、未执行。** 仅当业务方明确授权并具备前置条件后方可进入。

---

## 阶段名称
CF-WPS-18：Cloudflare 真实公网部署 + 公网手机 E2E + 生产写入受控放开

## 前置阶段
CF-WPS-11/12/12A/12B/13/14/15/16/17

## 前置已完成事实（来自 CF-WPS-17）
- 正式承载表已确定：`file_id=cn229thwalDs` / `sheet_id=15`「生产用台账」，records=0。
- Sheet 15 已增量新增 8 网格长巡查字段（网格/问题描述/问题类型/是否三违/client_request_id/巡查时间/来源/创建时间），现有 30 三违字段未改。
- H5→Sheet15 字段映射已就绪（employee_code→巡查人员ID、三违行为描述→三违行为，安全复用；涉及人员待决策）。
- Dry-run PASS（11 键全映射、受保护字段拦截、未写业务记录）。
- 本地真实浏览器 E2E 33/33；回归 8/8；生产污染 0。

## 启动前置条件（BUSINESS_DECISION_REQUIRED）
1. **提供 Cloudflare 账户/Token**（`wrangler whoami` 须通过）——解 CF-WPS-14/15/16/17 持续 BLOCKED 的部署缺口。
2. **决策「涉及人员」正式列**：新增独立列，或映射至「违章人姓名」[N]（须业务确认语义）。
3. **显式授权放开生产写入三开关**：`MOBILE_PATROL_PRODUCTION_ENABLED=true` + `MOBILE_PATROL_TARGET_SHEET_ID=15` + `WPS_PATROL_FIELDS_CONFIRMED=true`（三者齐备才落生产；CF-WPS-17 全程保持 false）。
4. 确认登录分布式限流策略（当前仅 BEST_EFFORT）与 bcrypt `cpu_ms`。

## 核心目标
1. `wrangler` 登录 → 部署 Worker → 配置 Secrets（WPS_CLIENT_ID/SECRET、JWT_VERIFY_SECRET、WORKER_SESSION_SECRET）→ 部署 Pages + Pages Functions → 配置 `WORKER_ORIGIN`。
2. 公网 HTTPS 验证：真实手机浏览器（Android Chrome 优先）跑完整链 登录→工作台→巡查→提交→列表→详情→退出。
3. CORS 公网验证（正常 Pages 同源 PASS；非授权 Origin 不返回 ACAO）。
4. bcrypt Cloudflare CPU 实测（cost 沿用，CPU 超限则 BLOCKED 并报告，不降 cost）。
5. Cross-user 隔离实测（需第二测试身份；否则 NOT_EXECUTED）。
6. 受控放开生产写入：先小批量/观察，确认 Sheet 15 仅增巡查记录、Sheet 3/11/PG 零污染。

## 生产安全硬约束（延续）
- 仍禁止写 Sheet 3（三违生产台账）、Sheet 11（花名册）、PostgreSQL 生产库、现有三违业务、责任链/扣分/审核/整改。
- 照片维持 PENDING_EXTERNAL。
- 受保护字段（employee_code/grid_id/inspector_employee_id/attribution_status 等）仍由服务端定值，客户端伪造忽略。
- 幂等维持 LIMITED（client_request_id 预查）。

## 验收（摘要）
- 真实 Cloudflare 部署成功 + 公网 HTTPS + 公网手机 E2E PASS + CORS PASS + bcrypt-CPU PASS + Secret 无泄露 + Sheet3/11 零污染 + 涉及人员决策落地 → `CF-WPS-18_STATUS=PASS_WITH_RISK`（或视公网 E2E/CPU 结果调整）。
- 任何一项不满足不得为 PASS 而降低标准。

## 停止条件
CF-WPS-18 完成后停止；不自动进入 CF-WPS-19；不自决超出本任务书的写入/字段/存储变更。

---
*本提示词为 CF-WPS-17 §二十二 要求的下一阶段存档，等待业务方授权与前置条件满足后执行。*
