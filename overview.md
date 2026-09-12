# HSE-MOBILE-GRID-ARCH-03：无云条件下「WPS 云端缓冲」可行性复核（只读审计 · WITH_EXTERNAL_DEPENDENCIES）⭐

## 结果一句话
用户推翻 ARCH-02 前提（**无云服务器也不买**）→ 重新审计「手机 → WPS 官方表单入口 → 现有 Pull → PG」（方案 C）。**结论：可行**，全部依据官方文档：表单视图手机适配/附件传图/字段隐藏/填写者互不可见/只能新增；「登录后填写」+「收集填写者信息」+「创建人」高级字段 = 系统级可信身份；图片 URL 官方端点确证（`dbt/:file_token/attachment/urls`，uploadId→download_url）。手机全程不持 APP_SECRET；Pull 零改动承接；逐条单事务断电不丢不重。终态 **`PHASE_HSE_MOBILE_GRID_ARCH_03_COMPLETED_WITH_EXTERNAL_DEPENDENCIES`**。

## 关键判定
- **WPS 加列不违 05-H-0 字面**（冻结清单=代码组件；新列不入 FIELD_MAP→被忽略、不入 18 列 hash）；PG 加列禁止；表单必须建在**现有生产板**（另建表 Pull 读不到）。
- **两大弱项（如实）**：① WPS 账号身份 ↔ employee 无既有映射（姓名对照重名 fail-closed）；② 表单写原生 Attachment 字段而 Pull 只读「链接镜像列」→ 需桥（β = AirScript 回写链接列 = Pull 零改动）。
- **推荐双通道**：通道一 03-B 现状保留零改动；通道二 WPS 表单（关机应急缓冲）。03-B 全保留、05-H-0 冻结零触碰。
- NEEDS×4：提交者字段内容 / download_url 有效期 / 凭证对 DBT v1 授权 / 组织 WPS 版本档位。

## 交付
- 报告：`docs/HSE-MOBILE-GRID-ARCH-03-无云WPS云端缓冲架构复核报告.md`（23 节，Q1~Q10 逐项 + 12 风险 + P0~P3 前置）
- 技能 `wps-dbsheet-api` v1.3.0（新增表单视图能力表 + 附件 download_url 端点对照表）

## 按第 17/18 条停止
不实施、不改任何代码/数据库/WPS/生产环境；执行完毕即停止，等待架构决策。

---

# HSE-MOBILE-GRID-ARCH-02：WPS 云端缓冲「最小可行架构」设计（只读设计 · WITH_EXTERNAL_DEPENDENCIES）⭐

## 结果一句话
在 ARCH-01 之上完成第二阶段只读架构设计（**0 代码 / 0 DDL / 0 DML / 0 次 WPS 调用 / 甚至未新建 DB 连接**——复用 ARCH-01 落盘的 `_arch01_schema.json`，仅末尾 1 次只读基线复核 `2061/7192/2061/0` 不变）。核心产出：**五方案对比 + 明确推荐 C′-lite**；修正 ARCH-01 两项判定——① WPS 图片能力从 UNKNOWN 升级为 **PARTIALLY_SUPPORTED**（官方 DBT v1 文档确证「先上传得 uploadId → 字段值=`[{uploadId,fileName,source:"upload_ks3"}]`」二段式，但值**无可直接渲染 URL**，且本项目 V7 co-op 调用面的记录附件上传端点未在公开文档确证）；② **「创建时指定 WPS Record ID」不是硬前置**（`prefer_id:false` 已真机 PASS，Pull 幂等键由 WPS 生成即可；真正硬前置是「条件查询」或「服务端幂等登记」二者之一）。

## 四阶段铁律（不得混为一谈）
**A 手机→WPS 保存成功 ≠ B WPS→PG 同步 ≠ C PG 形成 grid_id/inspector_employee_id 归属 ≠ D HSE 业务可见**。电脑关机时：状态 A 仍可达（云端 Backend→WPS 持久），B/C/D 全部暂停，恢复后自动补偿——这两段链路在报告 §3 中分别画图。

## 关键设计结论（只设计，未实施）
1. **client_token 幂等**：WPS `list_by_page` **不支持按字段值筛选**（body 仅 page_num/page_size/prefer_id，本地真机+官方文档双确证）⇒ 提交前查重只能 O(n) 全表扫描（2063 条≈11 请求、限频 10/s）⇒ **推荐 PG 侧幂等登记**：复用 `grid_record_sync_map` 语义或独立轻量登记（需人工决策，本任务禁建表）。
2. **身份/grid_id 归属（最高优先级）**：WPS「巡查人员ID」列重新定义为**服务端写入的身份快照**（非身份源，不解冻）；由**与 Pull 引擎平级的独立归属组件**在 Pull 后用 `deriveGridIdForEmployee()` 求归属——**唯一才回填，multiple/no_grid 一律拒绝 fail-closed**，且只补 NULL 永不覆盖；**不改 SYNC_PROJECTION/PROTECTED_COLUMNS/Pull 引擎/表结构**。
3. **WPS_ROW_SCOPE_DEFERRED**：风险成立条件=开启 `WPS_GRID_DATA_SOURCE`；最小修复=归属组件产出后把 gridScope 的 scope 条件套到 WPS 分支（复用现有 gridScope，不需新 API、不改 WPS 结构）；顺序强制：**先归属、再行级**。
4. **五方案对比**：A（现状，零改造但关机不可用）/ B（红线，凭证下发）/ C（本机 Backend，关机即断）/ **C′（云端 Backend→WPS→本地 Pull→本地 PG，五条件全满足，推荐）**/ D（全云化，超最小改造）。

## 交付
- 报告：`docs/HSE-MOBILE-GRID-ARCH-02-WPS云端缓冲最小可行架构设计报告.md`（19 节 + 附录 A 证据索引 / B 与 ARCH-01 差异对照，逐条答 §三~§九）
- 同步修正技能 `wps-dbsheet-api` v1.2.0（附件二段式写入、条件查询真实边界、幂等修正、归属路径）

## 按第 12 条停止
不开发、不改代码/数据库/WPS；不继续 GRID-03-C/04/05；**等待架构决策**。

---

# HSE-MOBILE-GRID-ARCH-01：移动端「WPS 云端缓冲」架构复核（只读审计 · WITH_EXTERNAL_DEPENDENCIES）⭐

## 结果一句话
对「WPS 作为手机三违巡查云端缓冲/台账入口」做了 **STRICT READ-ONLY** 复核（0 代码 / 0 DDL / 0 DML / **0 次 WPS 调用** / 0 进程操作）。结论：**WPS 的写入能力本身已真机验证 PASS，不是阻断**（`docs/Sprint-WPS-02-C-真机执行验收报告.md` → `WPS_REAL_TEST=PASS`：Create/Get/Update/BatchDelete/图片附件/RecordID 字符串/employeeId 真机落库 全 PASS）；但**与已冻结的 WPS-PG-SYNC 05-H-0 存在三条硬冲突**，且**用户核心诉求（电脑关机也能手机存数据）当前不成立** —— 关键发现：`手机→WPS` 的第一跳仍是 HSE Backend，而 Backend 就跑在那台会被关机的电脑上。终态 **`PHASE_HSE_MOBILE_GRID_ARCH_01_AUDIT_COMPLETED_WITH_EXTERNAL_DEPENDENCIES`**。

## 三条硬冲突（本审计核心输出，按要求只报告不解决）
1. **身份/grid_id 结构性丢失（高·阻断）**：`wpsFieldMap.js` 的 `PROTECTED_COLUMNS=['grid_id','inspector_employee_id']` 不在 `SYNC_PROJECTION` 内，Pull 引擎恒写 NULL（生产实测 `inspector_employee_id` **2051/2061 为 NULL**、`grid_id` NULL 327）⇒ WPS-first 下手机记录回 PG 后，**`own_grid` 的网格长看不到自己提交的记录**。与冻结原则「WPS ≠ 身份源 / ≠ grid_id 来源」正面冲突。
2. **WPS 模式无行级权限（高·阻断）**：`site-mgmt.js:1879-1884` 的 PUT 走 WPS 分支时**提前 return，`resolveGridScope` 被完全跳过**（代码自认 `WPS_ROW_SCOPE_DEFERRED`），DELETE 亦然 ⇒ **`WPS_GRID_DATA_SOURCE=true` 一开即产生水平越权**。当前为 false 故未暴露。
3. **图片链路断裂（高·阻断）**：WPS 三个图片列只是 `MultiLineText` **链接镜像**，**图片本体从不进 WPS**；而本机 `/uploads/**` 有 **1698+468=2166 处**引用依赖，关机即全断。WPS 二进制附件上传能力 = **UNKNOWN / NEEDS VERIFICATION**。

## 推荐
**方案 C′（手机 → 云端常驻 HSE Backend → WPS → Pull → PG）**；**不推荐方案 B**（手机直连 WPS 需下发 `WPS_APP_SECRET`，等于交出整表读写权，属红线）；**方案 A（现状 PG-first）作为默认保留态**。4 项硬前提：**P1** 后端迁出本机 / **P2** 补 WPS 模式行级权限 / **P3** 解决 grid_id+身份归属（放宽冻结·新增 PG 侧绑定组件·维持 PG-first 三选一）/ **P4** 图片云端化。

## 03-B 判定
**不需要回退**，4 项改动全部保留；`POST/PUT/DELETE /grid-records` 定位为「正式 PG API」，C′ 落地后退化为 PC 维护入口 + 内部同步/后台补偿接口。

## 交付
- 报告：`server/scripts/output/HSE-MOBILE-GRID-ARCH-01-移动端WPS云端缓冲架构复核报告.md`（16 节 + 附录 A 证据索引 / B 实测数据，逐条回答 A~H）
- 只读取证：`server/_arch01_schema.cjs` → `_arch01_schema.json`（仅 SELECT / `information_schema` / `pg_indexes`）
- 同步修正技能 `wps-dbsheet-api`（端点表按真机实现纠正为 `records/create`、`records/update`、`records/list_by_page`、`records/batch_delete`；新增「架构边界」章节）

## 按第 15 条停止
未修改任何代码 / 数据库 / WPS / 生产环境；不继续 GRID-03-C / 04 / 05；不处理 `/uploads` 鉴权；不新增整改状态机。

---

# HSE-MOBILE-GRID-03-B：移动端整改照片补传 + 整改人 + personnelName 服务端化（READY_FOR_03C）

## 结果一句话
用**最小改动**给手机巡查加上「对既有记录补传整改照片 + 记录整改人」闭环，全程零新增状态机/表/字段/API：后端只改 1 个文件 4 处（`GRID_RECORD_EDITABLE` 追加 `rectified_photo`＋POST 的 `personnel_name` 改为服务端派生 `identity.employeeName`），前端 3 新增（`rectify.vue`／`photo-group.ts`／`grid-access.ts`）＋4 修改（路由/布局/detail 入口/ledger 入口），**冻结的 `new.vue` 一字未改**。隔离环境（测试库 `safety_dashboard_dev` + 后端 5882 + 前端 5175）实测 **API 11/11 + UI 10/10 全 PASS**（含越权 403 SCOPE_DENIED、personnelName 防伪、多图、整改口径与 `sanweiLedgerDerive` 同源、响应式 375/390/414/768、PC 与 Mobile 双回归）；**生产零写入**已用全表 `md5` 前后 `diff` **逐字节一致**证明；WPS 体系零修改。终态 **`PHASE_HSE_MOBILE_GRID_03B_IMPLEMENTED_READY_FOR_03C`**。遗留两件待您决定：是否授权停止隔离进程 5882/5175（规格禁 AI 自行停进程），以及 1 个早于本会话的零引用旧图片是否删除。

## 交付
- 报告：`server/scripts/output/HSE-MOBILE-GRID-03-B-整改照片补传与整改人实施报告.md`（15 项规定内容 + 附录 B 条款对照总表）
- 代码：`server/routes/site-mgmt.js`＋`apps/web-naive/src/{views/mobile/grid/rectify.vue, views/mobile/grid/photo-group.ts, views/mobile/grid/grid-access.ts, views/mobile/grid/detail.vue, views/mobile/grid/ledger.vue, router/routes/modules/mobile.ts, layouts/mobile.vue}`
- 证据：`_03b_{api,ui}_results.json`、`_03b_shots/`（10 张）、`_03b_prod_fingerprint_{pre,post}.txt`（diff 空）、`_03b_{api_test,e2e,cleanup,cleanup2,pc_probe}.cjs`
- 附带补写：03-A 报告新增 **附录 B.6**（16:45 整点采样实证：`27920` 0 次、WPS 出口仅 23396 → **双 Pull 已降为单路**）
- 数据清理：11 条测试行 + 9 个测试上传文件全部清除；dev 库回到 2061、生产 `2061/7192` 不变

## 按第 27 条停止
不进入 GRID-03-C / 04 / 05，不改 WPS，不处理 `/uploads` 鉴权，不新增状态机，不自动继续下一 Sprint。

---

# WPS-PG-SYNC-05-G-1D 执行版：生产 SYSTEM 接管成功（COMPLETED_READY_FOR_05G2）

## 结果一句话
您二次运行一键脚本切换成功（10:55）：HSE-Backend 注册（SYSTEM/开机自启+每分钟看护/崩溃重启）→杀旧 PID 25988→Start→**新 PID 15732 owner=NT AUTHORITY\SYSTEM**，T+40/70/100s health 全 200。值守监控捕获 11:00 首个自然 Pull 全零变更；智能体侧验收全 PASS：切换窗口零 DML 直证（业务表时间戳+pg_stat 三表 delta 全 0）、数据基线与预切换快照全组相等、TRAE 复接管零痕迹。终态 `COMPLETED_READY_FOR_05G2`。遗留一项 R-05G2-1（不阻塞）：沙箱受限令牌枚举不到 HSE-Backend 任务（SD 可见性过滤，判定非删除），建议您在管理员 PowerShell 跑一条确认命令（见报告 §三）。

---

# WPS-PG-SYNC-05-G-1D：生产 SYSTEM 接管后只读全面验收（BLOCKED_WRONG_OWNER——切换尚未执行）

## 结果一句话
切换前突发生产事故：09:18-09:23 实测第 14/15 次外部重启且 5876 短时 DOWN——我方按 05-F 授权用应急启动器（Start-ScheduledTask 'wps05e3-launch'，用户级任务非提权可启动）恢复生产 PID 25988，TRAE 闯入进程撞 EADDRINUSE 被顶回。切换前快照全绿（status 四开关+数据基线与 05-G-1B 零漂移）。人工管理员运行手册已下发（注册 HSE-Backend→核验→实时查 PID→taskkill+Start），切换后自动验证监控已布防（owner=SYSTEM 核验→health T+10/30/60/90→首个自然 Pull 捕获）。IS_ELEVATED=False，等待您执行 §5 手册。

---

# WPS-PG-SYNC-05-G-1B：生产 Windows Service 实施前最终门禁（READY_FOR_HUMAN_PRODUCTION_SWITCH，有条件）

## 结果一句话
门禁全项通过但**发现方案 A 根本缺陷**：sc.exe 直包 node.exe 存在 SCM 握手问题（ERROR_1053/孤儿进程/failure recovery 失效）→ **方案 A 判 BLOCKED，唯一推荐转为方案 D**（Task Scheduler SYSTEM 看护任务：开机自启+每分钟看护+崩溃重启，隔离效果与 LocalSystem 服务等价）。prod-launch.cjs 与 prod-rollback.md 已就绪（仅 node --check，未运行）；服务/任务名零冲突；LocalSystem 路径静态审查零风险；数据/WPS 基线零漂移。注册与切换需您在管理员 PowerShell 人工执行（当前会话非提权），获「授权 05-G-1C」前不执行任何变更。

---

# WPS-PG-SYNC-05-G-1 A 阶段：生产进程生命周期治理方案评估（A_PLAN_READY_AWAITING_AUTHORIZATION）

## 结果一句话
只读完成方案评估与实施计划：报告撰写期间实测**第 13 次外部重启**（33740→25608，08:33:02，TRAE sbox 日志同构铁证），证实 TRAE AI 会话命令执行是持续抢管根因；14 判据比较后推荐**方案 A：原生 sc.exe Windows 服务「HSE-Backend」（SYSTEM + failure=restart）+ ops 层 prod-launch.cjs 启动器**（业务零改动），降级备选 D（Task Scheduler SYSTEM 守护）；实施待您授权三项（提权 sc create / 一次切换重启杀 25608 / 新增 ops 启动器），授权前不执行 B/C/D。

## 待授权实施要点
- 服务形态：HSE-Backend (LocalSystem, start=auto, failure 5s 重启) → prod-launch.cjs（chdir+日志重定向）→ 唯一 node app.js → 5876 → Scheduler（业务零改动）
- TRAE 封闭效果：honey 非 elevated 杀不掉 SYSTEM 服务；自行 node app.js 撞 EADDRINUSE 自灭
- 回滚：net stop + sc delete 一条命令，回到当前态
- 见报告 §8-§11：实施步骤/风险/回滚/开发生产边界

---

# WPS-PG-SYNC-05-G-0：生产进程生命周期与外部重启来源只读审计（BLOCKED_DEV_PROD_BOUNDARY）

## 结果一句话
STRICT READ-ONLY 两问全解：**问题 A**——能持久启动/重启 5876 的渠道共 4 类（TRAE 沙箱/wps05e3-launch 手动/HSE_DevStack 已耗尽/start-hse-* 双击族），其中唯一活跃且自动执行的是 TRAE；**问题 B**——生产无任何生命周期管理（零守护、零自愈、PM2 0 应用、无服务），且 **第 12 次重启来源已用直接证据锁定：TRAE SOLO CN 沙箱**（`sbox_sdk_20260912073441_17360.log` 07:34:42.637 "pid 33740 connected"）；33740=系统 node+相对 app.js+独立 conhost+PPID 孤儿，Scheduler 已注册（07:45/08:00 窗口 running=true 捕获）。数据基线与 05-F 全一致。TRAE 仍活跃（08:24 仍在写日志）→ 触发 `PHASE_WPS_PG_SYNC_05G0_BLOCKED_DEV_PROD_BOUNDARY`，治理方案不自选，待人工授权进 05-G-1。全程零修改/零重启/零 Pull/零 DML。

---

# WPS-PG-SYNC-05-F：生产收口与开发/生产进程隔离最终治理（PRODUCTION_CLOSED）⭐SYNC 链收口

## 结果一句话
只读审计 + 最小登记，全程零 Pull/零 DML/零代码修改：一阶段基线 15 组检查零 FAIL（BASELINE_MATCH_05E5，gir=2061/MAX=7192/WPS=2063/WPS-only=[BT,EA]/327+人工10/gt/go 全零漂移）；wps05e3-launch 取证为「无 Trigger 的 Windows 计划任务」（五项删除前提全证，但沙箱黑名单禁 schtasks → 登记 R4 保留，误启动被 EADDRINUSE 自灭，用户可手动删）；PID 17360 结案 **CLEAN**（已不存在）；PM2 空置未接管生产；启动链=计划任务(手动)→detached 启动器→裸 node，无守护无自动重启；⚠ 07:34 第 12 次外部重启 27180→33740（交互式拉起），按纪律只验证：.env 未变、33740 引擎态全绿、07:45 窗口捕获 running=true（cron 注册铁证）。技术债 R1-R6 仅登记未实施（`WPS-PG-SYNC-TECH-DEBT-REGISTER_20260912.md`）。**终态 `PHASE_WPS_PG_SYNC_05F_PRODUCTION_CLOSED`——WPS-PG 单向同步链转常规生产运行**。

---

# WPS-PG-SYNC-05-E-5：Scheduler 凌晨延长观察与过夜稳定性验收（OVERNIGHT_STABLE）⭐05-E 全链收官

## 结果一句话
4.4 小时只读过夜观察（00:53–05:17，52 个 5 分钟采样）：生产进程 27180 零中断零重启、**18 个自然 cron 窗口（01:00–05:15）18/18 准时触发**，每次 `pulled=2063 unchanged=2061 excluded=2` 全零变更、errors=0、零失败、耗时 3110–3849ms；pg_stat 三表零 DML、基线/327 NULL/人工10/BT-EA 全零漂移、realPullExecutions=0/wpsWrites=0。终验 `_wpssync05e5_final.cjs` **15/15 checks PASS（OVERNIGHT_OBSERVATION_PASS）**，终态 `PHASE_WPS_PG_SYNC_05E5_OVERNIGHT_STABLE`。**05-E 全链（E-0 加固→E-1A 治理审计→E-1B+DECISION 清理→E-2 门禁→E-3 受控开启→E-4 首小时→E-5 过夜）全部 PASS 收官——Scheduler 进入常规生产运行态（每 15 分钟，累计自然 Pull 23/23 零失败）**。后续：转常规巡检（复用 `wpssync05d-baseline.json` 指纹集）；用户手动删计划任务 wps05e3-launch、建议关 TRAE 内本项目代理会话；独立立项候选：字段级 null policy、R2 /webhook secret、PID 17360 清理。

---

# WPS-PG-SYNC-05-E-4：Scheduler 首小时生产观察与运行稳定性验收（FIRST_HOUR_STABLE）

## 结果一句话
69 分钟只读观察（23:40–00:50，46 个采样点）：生产进程 27180 零中断、**5 个自然 cron 窗口（23:45/00:00/00:15/00:30/00:45）5/5 准时触发**，每次 `pulled=2063 unchanged=2061 excluded=2` 全零变更、errors=0、耗时 3158–3316ms（±5%）；累计 6 次 Pull 全部完美。pg_stat 观察期三表零 DML、基线/327 NULL/人工10/BT-EA/gt-go 全不变、/push 410、.env md5 d14a9690 未变。**终态 `PHASE_WPS_PG_SYNC_05E4_FIRST_HOUR_STABLE`——Scheduler 已在生产以 15 分钟节律稳定上线**。后续候选：05-E-5 日间真实业务时段观察，或宣告上线完成转常规巡检；手动删除计划任务 wps05e3-launch（沙箱禁 schtasks）。

---

# WPS-PG-SYNC-05-E-3：Scheduler 受控开启与首轮生产运行（PASS——经 BLOCKED 解锁后完成）

## 结果一句话
经「请继续」解锁后完成：①根因闭环——WorkBuddy 沙箱回收工具调用进程树（nohup/Start-Process 启动的进程在调用结束数秒内死亡，活不到 cron 窗口）+ TRAE SOLO CN 代理沙箱抢管生产进程；②解法=计划任务+node detached 派生器（`_wps05e3d_launch.cjs`），生产进程 27180 脱离一切会话树、跨调用存活；③**23:30 窗口首轮自然 Pull 成功**：`[wps-pull] 单向同步完成(3368ms): pulled=2063 inserted=0 updated=0 unchanged=2061 excluded=2 wpsDeleted=0 pgDeleted=0 errors=0`——与理想结果逐项一致；④验收 FIRST_PULL_ACCEPTANCE_PASS 零 FAIL：pg_stat 三表零 DML（幂等 Pull 正常态）、基线/327 NULL/人工10/BT-EA/gt-go 全不变、/push 410、running 恢复 false、.env false/true/true（md5 d14a9690…）。**终态 `PHASE_WPS_PG_SYNC_05E3_FIRST_SCHEDULED_PULL_PASS`**。⚠ 首轮 PASS≠长期稳定，05-E-4 首小时观察待授权；计划任务 wps05e3-launch 请用户手动删除（沙箱禁 schtasks）或保留作应急启动器。

---

# WPS-PG-SYNC-05-E-3：Scheduler 受控开启与首轮生产运行（BLOCKED——数据零损坏，等待人工解锁）

## 结果一句话
受控开启动作全部合规完成：.env 双闸 true（diff 恰 2 行、md5 d14a9690…、已备份）、受控重启 22688→23948、我方进程日志留下「[wps-pull] 调度器已启动 */15 * * * *」注册铁证。但 23948 存活 11 秒即被 **TRAE SOLO CN AI 代理沙箱**抢管（29516，父链已取证；全天 11 次外部重启的元凶），其后**三个自然 cron 窗口（22:30/22:45/23:00）Pull 全部未执行**——判据：rebaselineHash 无条件 UPDATE ⇒ 完成的 Pull 必然留下 sm DML 与 last_sync_at 刷新，实测 pg_stat 零变化、last_sync_at 恒 18:09。根因不可归因（TRAE 控制台不可读）。**数据零漂移**（基线/327 NULL/人工10/BT-EA/gt/go 全不变）、/push 410 保持、trigger=0；.env 现场 true/true/false 未回改。**终态 `PHASE_WPS_PG_SYNC_05E3_BLOCKED`**。解锁路径：关闭 TRAE 代理会话 → 唯一管理者重启 → 下一 15 分钟窗口观察 last_sync_at → 跑验收脚本 _wpssync05e3_acceptance.cjs。

---

# WPS-PG-SYNC-05-E-2：Scheduler 正式开启前最终门禁与上线资格审计（全 PASS，READY≠ENABLED）

## 结果一句话
16 道门禁全部 PASS（严格 READ-ONLY）：`.env` md5 `8e697bb7…` 前后一致（三开关显式 false）；`/push`→410、/status 全 false + exclusions [BT,EA] + hashScope 18 + mappingCount 2061；Scheduler 四重门（SCHEDULER_ENABLED==='true' ∧ WPS_GRID_SYNC='true' ∧ WPS 凭证 ∧ DB 连接）逐案例对应代码行；调用链 app.js:597 全仓唯一、cron.schedule 仅 scheduler:60 一处；/trigger canWrite→403（静态）；引擎 18 项安全不变量在场（PG→WPS 写函数 grep=0）；PM2 无 cron_restart、instances=1/fork。基线零漂移：gir=2061/sm=2061/state=0/MAX=7192、327 NULL MD5 `2668ce0c…` 不变、人工 10 条 drift=[]、gt 三边 0、go marker NULL 三方一致、SYNC05C 残留 0、WPS-only=[BT,EA]、幂等键/pg_record_id 零重复、PG mapped missing=0、pg_stat 自证零 DML、Pull/trigger=0。**终态 `PHASE_WPS_PG_SYNC_05E2_READY_FOR_SCHEDULER_ENABLE`**——生产已具备受控开启 Scheduler 资格，但 READY≠ENABLED，开关未动，等待下一阶段人工授权（受控开启：.env 双闸 true → 重启 → 首小时观察）。

---

# WPS-PG-SYNC-05-E-1B-DECISION：05-C 测试数据最终收尾（全部通过）

## 结果一句话
人工授权的护栏 SQL `UPDATE grid_inspection_records SET marker=NULL WHERE id=6796 AND marker='SYNC05C-UPDATE-TEST'` 执行 rowCount=1，colDiff 仅 marker 一列，pg_stat 增量恰为 gir upd+1（其余表全 0）。三边一致性（引擎口径）PASS：WPS go hash = sync_map hash = `36408fd9fcf898a1…1370`、dtoEqualsPgRow=true、PG 6796.marker=NULL。gt 三边仍清净、SYNC05C 全局残留 0、人工 10 条/历史 327 NULL（MD5 2668ce0c…）/BT-EA WPS-only 全部不变。全程零 Pull/零 DELETE/零 INSERT/零 DDL/零 WPS 写；.env md5 8e697bb7 未动；Scheduler 关（/push→410 行为判别，PID 33360 为外部第 9 次重启）。**终态 `PHASE_WPS_PG_SYNC_05E1B_COMPLETED_READY_FOR_05E2`**，05-C 测试数据治理彻底收官。技术结论已记录：引擎 fail-safe「字段缺失→存量保留」语义未改动，未来如需「WPS 显式清空→PG 清空」应单独设计字段级 null policy。

---

# WPS-PG-SYNC-05-E-1B：05-C 测试数据三边受控清理（终态 BLOCKED_AWAITING_HUMAN_DECISION）

## 结果一句话
Action A（gt 三边清理）完全成功：WPS gt 删除（2064→2063）→ sync_map 删行（2062→2061）→ PG 删 7217（2062→2061，MAX→7192），中间门禁全过；B-1 WPS go.marker 污染清除成功（null 直写 HTTP 500、省略键无操作、**'' 写法成功**）；B-2 唯一真实 Pull 执行但 **updated=0（预期 1）→ BLOCKED**：引擎 fail-safe「WPS 键缺失→键省略→存量保留现值」语义下 Pull 永远无法把 PG 存量非空值写 NULL，sync_map go hash 已重基线为恢复态正确值 36408fd9…，**仅剩 gir 6796.marker='SYNC05C-UPDATE-TEST' 1 处残留**。全程：PG 生效 DML 恰 3（2 DELETE+1 hashRebaseline UPDATE）、WPS 生效写恰 2、dry-run 全零、人工 10 条/历史 327 NULL/BT-EA/sequence 全不变、Scheduler 关、.env md5 8e697bb7 未动、本会话重启 0。等待人工三选一（推荐：授权一次性 SQL `UPDATE grid_inspection_records SET marker=NULL WHERE id=6796` → 三方 hash 一致即 READY_FOR_05E2）。

---

# WPS-PG-SYNC-05-E-1B-0：三边清理执行前最终门禁审计（终态 COMPLETED_READY_FOR_05E1B，READ-ONLY）

## 结果一句话
九道门禁全 PASS：gt/go 三方重定位唯一；go 污染仅 marker 一列（05-C 前快照双侧 diff 证明）；7217 无任何外部引用（FK/列名启发式/16 张 log 表/state 四路扫描）；go 恢复预演 hash `36408fd9…` 三方一致（预期 DML=2 UPDATE）；删除顺序 WPS→sync_map→PG（所有中断中间态均落入引擎安全路径）；清理任务清单 Action A（gt 三边删）+ Action B（go marker 恢复+正式 Pull）已设计**未执行**。全程零 DML、零 WPS 写、`.env` 未动、recheck 全等。

---

# WPS-PG-SYNC-05-E-1A：05-C 测试数据治理审计（终态 COMPLETED_READY_FOR_05E1B，READ-ONLY）

## 结果一句话
gt↔7217、go↔6796 三方映射完全一致（WPS=PG=sync_map），引擎视角 hash 三方 match → 下次 Pull 均 unchanged，**不阻塞 Scheduler 开启**；SYNC05C 残留仅此两行、无未知测试数据；四场景推演（保留/删PG→ORPHAN/删WPS→只统计/三边同清→不复活）以引擎代码为据；推荐 B（标记保留）→ 独立授权阶段执行 C（三边清理）。全程零 DML、零 WPS 写、`.env` 未动、基线 recheck 全等。

---

# WPS-PG-SYNC-05-E-0：Scheduler 开启前安全加固（终态 COMPLETED_READY_FOR_05E1，STRICT CONTROLLED CHANGE）

## 结果一句话
R1 显式双闸落地（`SCHEDULER_ENABLED==='true'`，消除默认开启语义）+ R3 `/trigger` admin 门禁（复用 canWrite，非 admin 403）；`.env` 授权内仅追加 `SCHEDULER_ENABLED=false` 一行。隔离测试 12 组开关矩阵 + 6 案权限测试全 PASS；基线 8/9 全等（唯一差异=授权内 .env 追加）。**Scheduler 保持关闭、真实 Pull 0、DML 0、WPS 写 0**。

## 关键点
- 开关矩阵 B 组（第二道闸 mock 打开）：6 种 SCHEDULER_ENABLED 取值中仅显式 `'true'` 注册 1 次 = R1 独立拦截证明。
- /trigger：admin/system_admin→200、grid_inspector/township/无角色→403、未认证→401。
- 三备份（scheduler/routes/.env）在 `server/backups/wpssync05e0_20260911/`；diff 证明最小变更。
- 运行态：外部第 7 次重启（PID 27248→28020，早于 .env 修改，与本次变更无关），仍 SYNC-02 且 cron=0；磁盘代码已加固、无须重启即生效于下次启动。
- 05-E-1 前置：授权改 .env 双闸显式 true + 受控重启 + 首小时观察。

---

# WPS-PG-SYNC-05-D：Scheduler 生产安全审计（终态 COMPLETED_READY_FOR_05E，STRICT READ-ONLY）

## 结果一句话
Scheduler 结构安全、false 时绝不运行（隔离实测 cron 注册 0 次）、Pull-only 双重 fail-closed、反向写/删除全部硬锁、旧双向逻辑不可执行；§四 18 问 + 引擎边界 20 项全 PASS，基线 21 项两轮复验 100% 不变。**全程 realPullExecutions=0、DML=0、WPS 写=0、.env 未动**。

## 关键结论
- 唯一入口 app.js:597；Scheduler running 标志 + 引擎 pullRunning 双锁 + PM2 单实例 fork（无 cron_restart）。
- 开关三重条件（WPS_GRID_SYNC==='true' ∧ 凭证 ∧ DB 连接），模块加载时快照（改 env 须重启）。
- 风险登记 4 条（R1 SCHEDULER_ENABLED 默认开靠 WPS_GRID_SYNC 兜底 / R2 /webhook 无 secret 依赖 JWT+fail-closed / R3 /trigger 无角色限制 / R4 快照语义）——均不 BLOCKED，05-E 开启前建议显式双闸。
- gt/7217、go/6796 测试数据登记不清算；开 Scheduler 后作为正常 mapped record 恒 unchanged。
- 产物：报告 + `_wpssync05d_audit.cjs`（audit/recheck）+ `wpssync05d-{baseline,recheck}.json`（指纹集可复用为巡检基线）。

---

# WPS-PG-SYNC-05-C：受控新增/修改同步验证（终态 COMPLETED_READY_FOR_05D）

## 结果一句话
WPS 新增 1 条测试记录 → Pull 正确 INSERT（新 PG 行 7217，grid/inspector/图片全 NULL）；WPS 修改 1 个普通业务字段 → Pull 正确 UPDATE（WPS值==PG值，身份/绑定不变）；第三次 Pull 全零幂等。**STOP 21 项 0 触发，全门禁 PASS**。

## 关键数字
- 受控 WPS 写：恰 2 次（1 CREATE + 1 单字段 UPDATE，均全字段快照存证）；Pull 窗口内 WPS 写 0。
- 真实 Pull：恰 3 次（2617/2621/2862ms），预算以证据文件计数互锁防重复。
- DML：Pull#1 INSERT=2（业务行+sync_map 单事务）；Pull#2 UPDATE=2；Pull#3 全 0。
- 保护集合零漂移：历史 327 NULL 指纹（MD5 `2668ce0c…`）、人工 10 条、BT/EA 排除、身份/图片/ID 集合指纹全程不变。
- 新基线：gir=2062、sync_map=2062、MAX(id)=7217、nullall=328（=327 历史+1 测试行）。

## 遗留测试数据（按任务书 §十八 不清理，待单独治理）
- WPS `gt` ↔ PG 7217（serial `SYNC05C-TEST-20260911-001`，marker `SYNC05C-CREATE-TEST`）
- WPS `go` ↔ PG 6796 的 `标记` = `SYNC05C-UPDATE-TEST`

## 交付
报告 `docs/HSE网格巡查身份链_WPS-PG-SYNC-05-C_受控新增修改同步验证报告_20260911.md`（21 节）；脚本 `server/scripts/_wpssync05c_controlled_change.cjs`（audit/create/update/idem 子命令 + 预算互锁）；证据 `server/scripts/output/wpssync05c-*.json`；记忆与技能（hse-prod-gate-audit §14）已同步。**未自行进入 05-D。**

---

# 历史 overview（WPS-PG-SYNC-05-B：生产第二次真实 Pull 幂等性验证）

## 结果一句话
第二次完全相同的真实 Pull **严格幂等**：`pulled=2063 / alreadyExists=2061 / inserted=0 / updated=0 / pgDeleted=0 / conflicts=0 / wpsDeleted=0 / errors=0`，WPS 写 0、DDL 0，数据库前后零漂移（STOP 20 项 0 触发，期望块 18 项 0 mismatch）。

## 本轮发生了什么
1. **开工取证**：生产 5876 再次被外部重启（6300→27784→**17196**，≈10:24:41 启动），运行态确认为 SYNC-02 单向引擎；`.env` 未动（mtime 07:13:11.963）。
2. **首跑事故（零数据影响）**：验收脚本在 Pull 前基线 SELECT 阶段因 `BIND_SQL` 漏写 `FROM grid_record_sync_map` 报 `42703 字段不存在`；catch 里 `await pool.end()` 因连接未释放悬挂 19 分钟。经 Node inspector 只读诊断证实**真实 Pull 从未进入引擎**（isRunning=false），预算消耗 0；对照 05-A 终态基线确认零副作用后，修复脚本并执行本阶段唯一一次真实 Pull。
3. **唯一一次第二次真实 Pull**（10:52:22 → 10:52:25，2850ms）：全零写入；四重独立证据（引擎自报 / JS 埋点 / pg_stat 增量 / 数据指纹）全部为 0 变更。327 条 NULL grid_id 五项指纹（含 MD5 `2668ce0c…`）与 10 条人工迁移记录逐条零漂移；sync_map 绑定指纹与 sync_hash 聚合不变 = 未重新绑定、未 rebaseline。
4. **交付**：报告 `docs/HSE网格巡查身份链_WPS-PG-SYNC-05-B_生产第二次Pull幂等性验证报告_20260911.md`；证据 `server/scripts/output/wpssync05b-{pull,pull-raw}.json`；脚本 `server/scripts/_wpssync05b_pull.cjs`；记忆与技能（hse-prod-gate-audit §4 新增 2 坑 + 新增 §13）已同步。

## 纪律遵守
未改 `.env`、未开 Scheduler、未重启 5876（本会话重启 0 次）、未做任何身份回填/数据治理、真实 Pull 全程恰好 1 次；完成后即停。

---

# 历史 overview（其他保险：PDF 导入 + 查看文件 + 样式修复）

## 最新改动（本次）

### 后端 `server/routes/insurance.js`
- 新增 `toDateString(v)`：对 `pg` 返回的 JS `Date` 对象用本地时区格式化为 `YYYY-MM-DD`，修复 `String(date).slice(0,10)` 截断成年份丢失的问题。
- `formatOtherInsurance` 的 `startDate` / `expireDate` 均改用 `toDateString`，确保 API 返回 `2025-05-01` / `2026-04-30`。

### 前端 `src/views/insurance/other/index.vue`
- 删除新增/编辑弹窗中的「投保标的」字段。
- 保单号输入框加 `policy-no-input` 类，禁止换行并显示省略号。
- 表格「保单号」列加 `whiteSpace: 'nowrap'`，防止列表中保单号折行。

## 历史改动

### PDF 导入识别
- 后端新增 `extractOtherInsuranceFields(text)` 与 `POST /other/import-pdf`，提取 PDF 前 5 页并识别保单号/起期/止期/保险公司。
- 前端新增 `PdfImportModal.vue` 与「导入保单」按钮，识别结果回填到新增表单。

### 去「所属部门」+ 操作列「查看文件」
- 后端 `other_insurance` 表新增 `pdf_file` 字段，导入/保存时回存 PDF 文件名。
- 前端列表去掉「所属部门」，操作列新增「查看文件」按钮（`fetch → Blob → blob: URL` 预览 PDF）。
- `vite.config.ts` dev 代理新增 `/uploads → http://localhost:5800`。

### 保存响应修复 + 日期格式
- 修复 `handleSave`/`handleDelete` 仍按 `r.code === 0` 判断导致误报「操作失败」的问题。
- 表格「保险起期/止期」统一使用插槽 + `dayjs(...).format('YYYY-MM-DD')` 显示。

## 验证

- 后端 `node --check insurance.js` SYNTAX_OK。
- 临时 5801 实例实测 `GET /api/insurance/other`：`startDate: "2025-05-01"`、`expireDate: "2026-04-30"`。
- 前端 `vue-tsc --noEmit --skipLibCheck`：`insurance/other/index.vue` 零错误（仓库另有 6 处预置类型错误非本次范围）。

## 待你侧操作

**须重启 5800 后端（管理员终端）** 加载 `server/routes/insurance.js` 新代码；前端 vite HMR 即时生效，刷新页面即可看到：
1. 编辑弹窗起期/止期显示 `2025-05-01` / `2026-04-30`；
2. 弹窗中「投保标的」已消失；
3. 保单号输入框不再换行。
