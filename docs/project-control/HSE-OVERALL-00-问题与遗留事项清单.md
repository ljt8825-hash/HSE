# HSE-OVERALL-00｜问题与遗留事项清单

> 分级：P0=数据/权限/生产安全重大阻断；P1=影响核心闭环或数据一致性；P2=功能完整性与模块集成；P3=优化/测试/文档。
> 每项含：编号 / 模块 / 证据 / 影响 / 是否阻断整体建设 / 是否阻断当前模块 / 是否须立即解决 / 推荐处理批次（对应主报告 B-1~B-10）。
> 原则：不为了清零而扩大范围；未在本次只读盘点中重新实测的项标注（沿用审计）。

## P0（重大阻断）

| 编号 | 模块 | 问题与证据 | 影响 | 阻断整体 | 阻断模块 | 立即 | 批次 |
|---|---|---|---|---|---|---|---|
| P0-1 | 安全底座 | DB 口令/FS_APP_SECRET 曾明文入库，待轮换（沿用 B02-DEC 定局；仓库 PUBLIC） | 凭据泄漏风险 | 是 | 全局 | 是（轮换动作） | B-1 前置 |
| P0-2 | 驾驶舱 | `server/routes/overview.js:44,49` 直读 Excel 迁移残留表 `t_08_现场管理_消防器材管理台账_无照片` / `t_05_事故管理_历史未完成案件`，`.catch()` 静默返 0 | 驾驶舱数字失真且依赖即将不存在的表 | 否 | 驾驶舱 | 是 | B-9（顺手 B-1） |
| P0-3 | 人员底座 | A-02B 全部改动 + 大量历史工作仅存本地工作区（73 M/199 未跟踪，当前分支无 upstream），无远端备份 | 工作区损毁即丢失 | 是 | 人员域 | 是（仅指提交动作） | 立即 |

## P1（核心闭环/一致性阻断）

| 编号 | 模块 | 问题与证据 | 影响 | 阻断整体 | 阻断模块 | 立即 | 批次 |
|---|---|---|---|---|---|---|---|
| P1-1 | 人员主数据 | 双主表：employee(v59 权威) vs personnel(legacy)，`personnel_insurance` 同时留两列（unified_schema.sql:196）；新链 employee_id / 旧链 personnel_id 无桥接 | 8+ 业务域身份分裂，跨模块集成地基不稳 | 是 | 全局 | 否 | **B-1** |
| P1-2 | 隐患域 | 四通道+11 表并行栈：hazards(110 无业务主键) / hazard_record 等 8 表 / hse_rectifications+hse_reviews / H5→飞书（PG 零接收）（B00/B02 定局） | 同一隐患多入口、统计口径不可信 | 是 | 隐患/考核/驾驶舱 | 否 | **B-3** |
| P1-3 | 全局 schema | 运行时 DDL 110 条 + 迁移双轨建表，同名表多处定义（training_records 三处、sys_operation_log 两处口径冲突、assessment_rule 裸名双套） | schema drift 持续扩大，迁移不可信 | 是 | 全局 | 否 | **B-1** |
| P1-4 | 组织主数据 | departments → department(is_deprecated) → hse_org_unit 三表并存；乡镇无主表仅文本列（依赖文档 B01/B02-DEC-03-D 待裁） | 组织树/区域匹配靠字符串 | 是 | 组织/网格/考核 | 否 | **B-1** |
| P1-5 | 考核域 | 总分上限设计失效（manager195/admin200>100⇒归零，67 人 E 档）、排名结构性不存在（B02-DEC 定局）；指标行扣分不进总分 | 考核结果不可用 | 否 | 考核 | 否 | **B-7**（需业务裁决） |
| P1-6 | 检查域 | hse_inspection_*/inspection_* 8 表全 0 行，真检查在 grid_inspection_records(2069)；巡查→隐患断链（B02 断链 #2） | 检查模块空转 | 否 | 检查/隐患 | 否 | **B-5** |
| P1-7 | 数据链 | H5→飞书 PASS 但飞书→PG NOT FOUND（B00 四重验证）；生产 H5 数据不进 PG | 移动端数据游离于系统之外 | 否 | 移动/网格 | 否 | B-5/集成（冻结域，需专项裁决） |

## P2（功能完整性/集成）

| 编号 | 模块 | 问题与证据 | 批次 |
|---|---|---|---|
| P2-1 | 系统级 | 业务拒绝统一返回 HTTP 200 + JSON error（middleware/response.js 约定，03.31 P2-2 沿用） | B-9 |
| P2-2 | 隐患 | `hse_tasks` 0 行 ⇒ C 通道永不触发；`hseTasksService:144` 恒早退（沿用定局） | B-3 |
| P2-3 | 告警 | alerts 路由缺 is_deleted 过滤（沿用） | B-9 |
| P2-4 | 三违 | violations(1451 无写入) vs violation_records(2514 活) 双表并存 | B-6 |
| P2-5 | 事故 | accidents.status 5 值混存；accidentService:153-154 双向映射缺 pending | B-6 |
| P2-6 | 保险 | 三套存储并存（insurance_history / policies+other / vehicles 运行时 ALTER 16 列） | B-8 |
| P2-7 | 培训 | training_records(复数) vs training_record(v63 单数) 两张不同表并存 | B-7 |
| P2-8 | 权限 | 26 端点复用 hse:training:* 权限串（B02-DEC 定局） | B-9 |
| P2-9 | 前端 | web-antd 与 web-naive 双前端平行（约 86 vs 174 页面），重复实现与维护面翻倍；总控需裁决保留哪个 | B-9 前裁决 |
| P2-10 | 费用 | hse_safety_budget 双持有（objectiveService 运行时建 vs cost 域） | B-8 |
| P2-11 | 路由 | ~20 组 `X.js`+`X/main.js` 成对、3 个 `__orig_*` 残留，挂载关系未逐一核实（待核实） | B-9 |
| P2-12 | 风险 | risk_hazard_links 表在 0 回填；Risk02 业务回填 P3B-C blocker 链未清 | B-4 |

## P3（优化/测试/文档）

| 编号 | 模块 | 问题 | 批次 |
|---|---|---|---|
| P3-1 | 测试 | 全量 jest 基线 8 套件/3 用例既有失败（auth-gate/import-personnel/insurance-file OOM/personnel-insurance/routes-import/routes-vehicles/aiCapabilityLayer/violationAdapter），2026-10-30 实测确认 | B-10 前清 |
| P3-2 | 测试 | web-antd EmployeeEditModal 缺组件级 DOM 测试（03.35 GAP-B） | B-2 |
| P3-3 | 文档 | 历史报告 PASS 状态≠当前代码（73 个未提交改动之后全部需按模块复核）；03.35 报告 web-antd 结论已纠偏示范 | 持续 |
| P3-4 | 设计 | driver_profile / fire_equipment / 乡镇主表 等 doc-only 未落地 | B-1 |
| P3-5 | 残留 | 根目录大量 06/07/08/12_*.log/.cjs 调试残留文件与 risk02_err2.txt、test-write.txt | 随 B 批次清理（需授权） |
| P3-6 | 事故 | closed 血缘/整改数量统计口径问题（A02-03 系列） | B-6 |

## 冻结与保留事项（非问题，勿动）

| 事项 | 依据 |
|---|---|
| H5 生产链路 grid-mobile-cloudflare 全链冻结 | 红线 7 |
| cost.js staged A + md5 e88ae2b0… 保护态 | 红线 9 |
| 返聘功能冻结（已交付待统一启用） | 03.35 任务书 |
| P3-04-00.4 历史迁移路线保留不执行 | 本任务书 §16 |
| WPS 反向写 REVERSE_WRITE_ENABLED=false 硬锁 | B00.1 定局 |
| 18-hash 列冻结铁律 / 花名册唯一权威=飞书 tbl2ZHdXX5d8R12a | 红线 3/4 |
| DB DML/DDL 仅限 safety_dashboard_dev；require 前硬设 DB_NAME | 红线 1/2 |

## 需业务负责人决策的事项（汇总）

1. P1-1/P1-4：人员与组织主数据收敛的权威表与迁移窗口（B02-DEC-03-D 裁决单待签）。
2. P1-2：隐患 110 条存量清洗与四通道合并方向（B02-DEC 15 项裁决包 READY）。
3. P1-5：考核总分上限与排名规则重设计。
4. P1-7：H5 生产数据是否要求落 PG（涉及冻结链）。
5. P2-9：双前端（web-antd/web-naive）保留策略。
6. P0-3：工作区分批提交授权（本盘点无权执行）。
