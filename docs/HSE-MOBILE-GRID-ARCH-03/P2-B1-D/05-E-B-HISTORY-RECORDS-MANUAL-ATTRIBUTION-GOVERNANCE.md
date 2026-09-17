# P2-B1-D-05-E-B：历史 WPS 记录人工归属治理准备与实施报告

- 日期：2026-09-13
- 状态：**`PHASE_P2_B1_D_05_E_B_MANUAL_ATTRIBUTION_GOVERNANCE_PREP: COMPLETED`**
- 生产业务数据变化：**零**（327 pending 集合未动）；WPS 写操作：**零**

## 一、审计范围
1. 生产 `safety_dashboard` 只读复核（`default_transaction_read_only=on`）
2. 后端归属链路代码审查（router/service/gridScope，零修改冻结面）
3. 生产 API 只读权限矩阵（GET）
4. 前端 `web-naive` attribution 页面检查 + 最小 UI 改进
5. DEV `safety_dashboard_dev` 独立端口(5899) API 闭环测试 + 完整还原

## 二、327 条历史记录现状（规格 §二严格条件复核）
严格 SQL（`attribution_status='pending' AND inspector_employee_id IS NULL AND grid_id IS NULL AND EXISTS(sync_map.pg_record_id=id)`）：

- **count = 327 ✅**（与 05-C stamping 集合严格一致；id 6797–7123）
- 全部存在 `grid_record_sync_map` 对应（wps_file_id=cn229thwalDs，wps_record_id 为短字符串形态）
- 全字段明细导出：`.workbuddy/artifacts/05EB-pending-327-audit-full.csv`（33 gir 列 + wps 双 id + sync 元数据）

## 三、是否确认全部属于 WPS 历史真实记录
**是**。依据（不重新判断业务真实性，仅确认来源与形态）：
- 327/327 在 `grid_record_sync_map`，为 WPS→Pull Engine 正常回流产物
- 业务字段完整率：inspection_date/area_team/personnel_name/violation_behavior/image_content/serial_no 均 **327/327 非空**（serial_no 327 distinct）
- 巡查日期 09-01~09-06（每日 51–56 条）、13 个乡镇、58 名巡查人员文本、85 条含 violator_name、84 条含 rectified_photo
- 处置口径：不删除 / 不重导 / 非脏数据 / 非异常数据（符合规格 §一.3）

## 四、admin 人工归属流程现状
- 后端 `routes/hse-grid-attribution.js` + `services/gridAttributionService.js`（04-B 产物）**与规格 §四逐条一致，零修改**：
  - 输入白名单：仅读 `record_id` + `candidate_employee_id`（T7 污染测试实证：伪造 grid_id=999/inspector_employee_id/attribution_status/source_channel/client_token 全被忽略）
  - 服务端校验 employee 存在/未删除 → `deriveGridIdForEmployee` fail-closed（no_grid/multiple → 409）
  - 状态机守卫：条件 UPDATE 仅命中 pending+双 NULL（rowCount≠1 → 409 RECORD_NOT_PENDING）
  - operator 仅取 `req.user`（admin.employee_id 可 NULL）；audit 直写同事务
  - revoke：FOR UPDATE + 仅 manual_confirmed → pending + 清空身份
- 本阶段操作人 = admin（不建 hse_manager/safety_manager、不改 users/auth/权限体系；代码中两角色保留）

## 五、前端是否满足人工判断（发现的问题）
原页面（04-C）骨架合规：pending 列表、远程 employee 搜索、仅提交两字段、成功重拉、无前端 grid_id 注入面。但：
1. **列标题错误**：`personnel_name` 被标为"违规人员"（实为巡查人员；真正违规人员 `violator_name` 未展示）——误导归属判断
2. **信息面不足**：缺 serial_no / violator_name / grid_level / position / upload_time
3. 归属确认弹窗只显示记录 ID，无业务摘要

## 六、UI 最小调整（本阶段唯一代码改动）
1. **后端** `services/gridAttributionService.js` `getPendingRecords`：SELECT 扩展 5 个展示列（serial_no/grid_level/position/violator_name/upload_time）；WHERE 严格条件与状态机**零改动**
2. **前端** `api/hse/grid-attribution.ts`：`PendingAttributionRecord` 类型补 5 字段 + 修正 personnel_name 注释
3. **前端** `views/site/grid/attribution/index.vue`：修正列标题（巡查人员/违规人员）、新增 5 展示列、归属弹窗增加记录业务摘要
- 均为"只增加必要的信息展示"（规格 §六）；继续使用 HsePageLayout/HseDataGrid/NModal/NSelect 等现有组件，未新建通用组件
- ⚠️ **生效条件**：生产 5876 按规格未重启，后端新列将在用户下次重启后端时生效；前端 vite dev 热更新即时生效

## 七、API 测试结果（生产 5876，只读 GET）
| # | 用例 | 结果 |
|---|---|---|
| 1 | admin GET /pending | **200**，total=**327** |
| 2 | 真实 grid_inspector(id=75 h2660) GET /pending | **403**（另实证：伪造不存在用户 id=2 的 JWT → 401，auth 层查库校验生效） |
| 3 | anonymous GET /pending | **401**「未提供认证令牌」 |
| 4 | admin GET /hse/employee/employees/selector | **200**（camelCase 形态，前端双重归一化兼容正确） |

## 八、DEV 测试结果（safety_dashboard_dev + 5899 独立端口，全开关关闭）
测试记录：dev gir id=**7123**（快照后置 pending，模拟 stamping 产物）；候选 employee **6698 刘金涛**（未删除）。

| # | 用例 | 结果 |
|---|---|---|
| T1 | admin GET /pending | 200，total=1，**新展示列全部返回**（serial_no=L2826 等） |
| T2 | attribute 7123→6698 | **200**，inspector=6698，**grid_id=6**（服务端 derive 唯一网格，与 05-D-B 生产 E2E 结果一致） |
| T3 | 重复 attribute 同记录 | **409 RECORD_NOT_PENDING**（状态机幂等守卫） |
| T4 | attribute 不存在员工 99999999 | **409 EMPLOYEE_INVALID**（fail-closed） |
| T5 | revoke 7123 | **200**（manual_confirmed → pending + 双 NULL） |
| T6 | 二次 revoke | **409 NOT_REVOCABLE** |
| T7 | 污染请求体 attribute | **200 且 grid_id=6**：客户端 grid_id=999/inspector_employee_id=123/attribution_status='attributed'/source_channel/client_token **全部被忽略** |

**清理与还原**：revoke → SQL 还原 7123（attribution NULL / 双 NULL / updated_at=`2026-09-09 13:06:34.654` 原始字面量；⚠️ 该列为 timestamp without time zone，第一次按 ISO Z 串还原产生 8h 偏移已修正）→ 删除 4 行测试 audit（id 27–30）→ dev 基线复核 **2061/attr_null=2061/pending=0/mc=0 与测试前完全一致** → 5899 关停。

## 九、生产数据是否发生变化
**零变化**。证据：
- 生产基线终态：total=2061 / attr_null=1734 / **pending=327** / attributed=0 / manual_confirmed=0 / max_id=7192（与 05-E-A 完全一致）
- 生产 5876 未重启（PID 39616 不变）；`server/.env` mtime 2026-09-11 22:22:50 未变
- 生产写入仅只读连接；attribute/revoke POST/DELETE 仅对 5899（dev 库）执行

## 十、WPS 是否发生写操作
**零**。未调用任何 WPS 写端点；未改 WPS 配置 / Pull Engine / Scheduler（5899 启动即显式 `SCHEDULER_ENABLED=false`、`WPS_GRID_SYNC=false`、`WPS_GRID_DATA_SOURCE=false`，日志确认"调度器未启动"）。

## 十一、是否需要下一步人工业务确认
**需要，且这是归属推进的唯一路径**（规格 §五：禁自动批量归属）：
- admin 通过前端（或 API）**逐条**判读：结合巡查日期 + 作业区域（乡镇）+ 巡查人员姓名（历史业务字段，仅人工比对）+ 违章行为 + 违规人员，人工选择真实 employee
- 327 条中 262 条为"无三违行为"打卡记录，归属价值与证据密度低；建议业务侧先定优先级（如先处理 65 条含三违/整改记录）
- 当前 derive 能力：61 名网格 owner 每人恰 1 live 网格（multiple=0），归属路径 100% 可解；grid 126 无主（name=''）对应的区域记录无法归属到网格 owner，需业务先补齐负责人

## 十二、下一阶段建议
1. **不自动进入**任何批量归属；等待业务侧给出"逐条人工归属"的执行安排（可由 admin 在 5173 前端页面操作，每条产生同事务 audit）
2. 业务前置（非本工程可解）：
   - grid 126（无主网格）负责人补齐（否则相关记录 derive 失败 GRID_NONE）
   - 明确 262 条无三违打卡记录是否需要归属（或批量标记 not_required，需另立阶段决策）
3. 技术收尾项：
   - G2：`GET /pending` 真分页（limit=500 硬编码；327 暂无正确性问题，NON_BLOCKING_TECH_DEBT 维持）
   - 生产后端下次例行重启时加载 05-E-B 新展示列（无需为此专门重启）
   - 残留进程 24036/12680 待授权清理
4. 建议下一阶段编号候选：**05-F = admin 逐条人工归属试运行（生产，用户逐条授权或现场操作）**；在此之前任何 327 数据变更均需用户明确授权

---
### 附：本阶段文件变更清单
- `server/services/gridAttributionService.js`（getPendingRecords SELECT +5 列）
- `安全看板vben/apps/web-naive/src/api/hse/grid-attribution.ts`（类型扩展）
- `安全看板vben/apps/web-naive/src/views/site/grid/attribution/index.vue`（列修正/新增 + 弹窗摘要）
- 导出：`.workbuddy/artifacts/05EB-pending-327-audit-full.csv`
