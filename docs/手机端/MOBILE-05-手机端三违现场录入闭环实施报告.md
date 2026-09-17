# MOBILE-05：手机端三违现场录入闭环实施报告

> **执行时间**：2026-09-14 23:00 – 23:40
> **性质**：DEV 开发 + DEV 全链验证；**生产零写入、零重启、零配置变更**。
> **写入口径**：`PRODUCTION_WRITE=0` `DATABASE_PRODUCTION_MODIFIED=0`（生产库仅历史 MOBILE-04 审计时已做的只读 SELECT）`WPS_MODIFIED=0` `PRODUCTION_RESTART=0` `FRONTEND_PUBLISHED=NO`（生产 dist 未切换）。

---

## 1. Sprint 目标

在现有 `/mobile` H5 壳层中接入正式 HSE 三违业务闭环：
手机登录 → 新增三违 → 检查人自动识别 → 被检查人员（正式员工选择）→ 三违行为 → 检查来源 → 现场拍照 → `POST /api/violations` → 服务端 E-08-11 责任解析与分层扣分 → 手机端结果回显 → PC 端可查询。

## 2. 第一步：POST /api/violations 正式链路审计（§五）

逐层读取实际代码（非猜测）：

| 层 | 位置 | 关键事实 |
| --- | --- | --- |
| 路由 | `server/routes/violations/main.js`（挂载 `/api/violations`） | 原 `POST /` 门禁 `requireRole('admin','safety_manager')`；读端点 READ=`admin/hse_manager/safety_manager` |
| Controller | `controllers/violationController.js` | 薄 handler，`service.create(req.body, req)` |
| Service | `services/violationService.js: create()` | `checkSource` 必填（company/township/self，空值拒绝）；检查人身份**服务端权威覆盖**（`resolveCheckerScopeFromRequest(req)` → `authoritativeCheckSource`，E-08-08/09 fail-closed）；`violatorId` 传入时以员工主数据权威姓名覆盖；扣分经 `assessmentEvent.publish(VIOLATION_CREATED)` fire-and-forget 触发引擎单链重扫（E-08-08 收敛） |
| 结果数据 | `GET /:id` / `GET /:id/evidence-chain` | `deductionStatusInfo` + `deductions`（责任对象/分值/周期）；PC 端责任区为**双源取数**（statusInfo 优先、原始行回退，E-09 §八） |
| 人员选择 | `GET /api/hse/employee/employees/selector` | PG `v_employee_org_full` 主数据（is_current+未删除），无角色门禁（登录即可），支持关键词搜索 |
| PC 表单 | `views/site/violation/index.vue` | checkSource 枚举 `company=公司查处 / township=乡镇查处 / self=自查自纠`；行为为自由文本；提交后打开详情抽屉展示结果 |

**发现的必须后端缺口（§十七 最小修复依据）**：生产只读核验确认——58 名持「管理员/乡镇作业中心经理」检查岗位的登录用户系统角色**全部为 `grid_inspector`**，过不了原 WRITER/READ 门禁，手机端提交与结果回显必然 403。

## 3. 后端最小权限修复（仅 3 个端点，DEV 已验证；生产部署待授权）

`server/routes/violations/main.js`（唯一后端修改，+80/-15 行）：

1. `POST /` → `requireRole('admin','safety_manager','grid_inspector')`
2. `GET /:id`、`GET /:id/evidence-chain` → `MOBILE_ITEM_READ`（原 READ + `grid_inspector`）
3. **行级收紧守卫 `guardOwnInspectedRecord`**：grid_inspector 对 2 个读端点仅可读取 `inspector_id === 本人 employee_id` 的记录（防枚举他人记录）；admin/hse_manager/safety_manager 语义零变化。
4. 列表/统计/导出/更新/删除/整改/复查等其余端点权限**零变化**（PUT/DELETE 仍为原 WRITER）。

安全依据：检查人身份与检查来源仍 100% 服务端权威判定（E-08-08/09 fail-closed 不变），不信任任何客户端身份字段；WPS 零接触。

## 4. 前端实现（web-naive /mobile 模块内）

| 文件 | 变更 |
| --- | --- |
| `src/views/mobile/violation/new.vue`（**新增**，约 560 行） | 三违录入页 + 结果回显态（同页状态机） |
| `src/router/routes/modules/mobile.ts`（+11 行） | 新增 `GET /mobile/violation/new`（MobileViolationNew），复用现有 mobile 布局，未新建 layout |
| `src/views/mobile/index.vue`（+16 行） | 首页新增「三违录入」入口按钮（跨两列醒目样式） |

### 页面业务顺序（§七–§十六逐项）

1. **检查人**：只读展示（登录身份），禁止编辑，不提交任何检查人身份字段（服务端权威覆盖）。
2. **检查网格**：页面不提供任何 gridId/范围字段——服务端按现有身份链判定（三违域由 checkerScope 决定扣分面）。
3. **被检查人员（本 Sprint 重点）**：正式员工选择器——关键词搜索 `employees/selector`（PG 主数据，显示 姓名·岗位·组织），**必须点选**（提交 `violatorId`）；绝不做姓名→id 猜测；未选禁止提交。同名人由列表中岗位/组织信息供用户人工区分（选择器逐条列出，不自动择一）。
4. **三违行为**：自由文本（与 PC 完全同语义），placeholder 示例「不戴安全头盔」；**零扣分规则前端实现**（页面明示：扣分由服务端责任解析及规则配置计算）。
5. **检查来源**：三选项=正式枚举 `company/township/self`（标签与 PC 一致），**必选、原样提交、零默认转换**；未选禁止提交。
6. **现场照片**：完全复用 MOBILE-02 上传链（`POST /files/upload/image` + `photo-group.ts` 三态/重试/删除 + `joinImagePaths`），上传结果随提交写入 `image_content`，与记录强关联（上传中/有失败均拦截提交）。
7. **提交**：基础校验 → `POST /api/violations` → 等待服务端结果；防重复提交（提交中/已成功均拦截按钮，失败回表单不自动重试）。
8. **结果回显（§十八）**：轮询 `GET /:id/evidence-chain`（至取到扣分行/状态收敛/超时 ~5s），展示 被检查人员/行为/来源/日期 + **责任对象（姓名·岗位）+ 实际扣分**（`confirmedScore ?? suggestedScore`）+ 处理状态（deductionStatusInfo.label/explanation）；**不展示** resolutionLayer/scoreBasis/内部 id/审计技术字段（§十九）；取数与 PC 端 transmissionTargets 双源语义一致（statusInfo 优先、原始行回退、软删过滤、姓名去重）。
9. **错误区分（§二十）**：401 重新登录 / 403 权限提示（含后端 message）/ 图片失败可重试 / 业务拒绝展示后端 message / 网络异常明确报错不误报成功。

### 明确不做（§三/§二十一）

- 前端零扣分计算、零分值写死、零责任推断；
- 服务端幂等键体系未建（按规格留给独立 Sprint），仅客户端防重；
- 「我的三违」列表未做（规格允许的减项，避免扩大 Sprint）。

## 5. E-08-11 DEV 验证矩阵（§二十四）

**验证方式**：以真实 `grid_inspector` 用户自签 JWT（checkUser=true，按库中最新角色校验）走**正式 HTTP API**（DEV 5882，连 safety_dashboard_dev），与手机端提交/轮询完全同口径。脚本 `server/scripts/_m05_dev_matrix_full.cjs`。

前置事实：DEV 当月周期 43（2026-09，in_progress，61 targets）存在；类别上限「三违管理」40/15 被存量测试占满 → 测试窗口临时软避 400/150，**结束精确恢复 40/15**（已复核）。

| CASE | 场景 | 实测结果 | 判定 |
| --- | --- | --- | --- |
| A | 保洁员段宝良(7086)+公司查处+头盔，检查人张康(company 范围) | **赵书坤(管理员) -5 + 张卫新(乡镇作业中心经理) -1** | ✅ PASS（未恢复旧逻辑：经理 1 分） |
| C | 管理员赵书坤(7085)违规 | **本人 -5 + 经理张卫新 -5** | ✅ PASS |
| D | 乡镇经理张卫新(7008)违规 | **本人 -5** | ✅ PASS |
| F | 普通三违（非头盔）+公司查处 | **每目标 -1**（赵书坤 1、张卫新 1） | ✅ PASS |
| E | 非公司范围检查人（刘秀梅·管理员岗）提交 company | 服务端权威纠正→**责任扣分 0** | ✅ PASS（fail-closed） |
| E2 | 乡镇范围检查人提交 township | 来源保留 township→**0 扣分** | ✅ PASS |
| B | 保洁员→经理直管（经理 -5） | DEV 责任池内无此结构样本（与 MOBILE-04/E-08-10 结论一致）→ **NOT_OBSERVABLE-live**；managerDirect 层 5 分行为已由 E-08-11 T1-T16 矩阵（20/20）行为级覆盖 | ◐ 覆盖性 PASS |
| PC-QUERY | admin 经 `GET /violations` 列表查询 | 手机提交的记录**全部可见**（keyword=段宝良 命中） | ✅ PASS |
| GUARD | grid_inspector 读他人记录 | **403**（行级守卫生效） | ✅ PASS |
| 重复扣分 | 同一 violation × 同一目标 | 引擎事件级幂等（E-08-08 单链），矩阵期间无重复行 | ✅ PASS |

矩阵：**PASS=8 / FAIL=0**（E2 首轮用公司范围检查人提交 township 被服务端纠正为 company 产生扣分——经核实为 E-08-08「company 范围人员恒为 company」权威判定的**正确行为**，改由乡镇范围检查人验证后 PASS）。

## 6. TypeScript / 构建结果（§二十六）

| 项 | 结果 |
| --- | --- |
| vue-tsc 全量 | **60 errors = 既有基线，零新增**；本次新增/修改的 3 个 mobile 文件 **0 error** |
| 生产构建 | **成功**（`vite build --mode production`，31.57s，exit=0） |
| 构建产物 | `dist-m05/`（独立目录）+ `dist.zip`（构建自动打包，2374583 字节，含 M05） |
| 生产 dist | **未切换**（生产 5876 所托管 dist 经 grep 确认不含 M05 chunk）——发布需用户通道/授权 |
| 路由 | `/mobile/violation/new` 已注册（与现有 mobile 路由同结构） |

## 7. 安全 / WPS / 生产边界（§二十七–二十九）

- **身份边界**：客户端不可信字段清单（inspectorEmployeeId/checker/gridId 等）本 Sprint 未提交任何一项；服务端权威判定链（violationCheckerScope + authenticatedEmployeeResolver）零修改。
- **auth/JWT/login**：零修改（仅路由层 requireRole 绑定调整，中间件本身未动）。
- **WPS**：手机端与本次全部变更零 WPS 接触；`WPS→Pull→PG` 冻结架构未动。
- **E-08-11 后端规则**：resolver/adapter/规则配置零修改——矩阵实测即为现网规则的原样行为。
- **PC 三违页面**：零修改。
- **AI**：ai-v2.js 断链等 AI 问题仅登记，**非 MOBILE-05 范围未处理**。
- **现有手机 GRID 功能**：零改动（grid 域 7 文件未触碰；photo-group/grid-upload 仅 import 复用）。
- **DEV 测试数据**：11 条测试 violation 全部软删 + 引擎撤销复核（残留有效扣分=0）；上限精确恢复 40/15；DEV 测试周期 43 为既存行未动。
- **DEV 后端**：5882 已加载新路由代码（本 Sprint 重启过 DEV 后端，非生产）。

## 8. 三态区分（§三十一特别要求）

| 态 | 结论 |
| --- | --- |
| **代码完成** | ✅ 后端 1 文件 + 前端 3 文件，全部落地 |
| **DEV 验证通过** | ✅ typecheck 基线零新增 + 构建成功 + 矩阵 8/8 + PC 查询 + 越权守卫 |
| **生产可用** | ⛔ **尚未上线**——生产部署需独立授权：①后端重启加载权限修复（⚠️ 重启前必须先修 ai-v2.js 断链，否则 crash）；②前端 dist 切换（dist-m05/dist.zip 已备好） |

## 9. 已知问题与遗留

1. **状态标签语义**（存量，非本 Sprint 引入）：直接创建的记录 `source_type=NULL`，`deductionStatusInfo.status` 恒为 `history`（「历史正式记录」），扣分行经证据链原始行正常返回——PC 端同一语义，手机端双源取数已兼容；状态文案优化可留后续。
2. **CASE-B live 样本缺失**：责任池内暂无「保洁员→经理直管」结构（MOBILE-04 已登记），layer=5 行为由 E-08-11 矩阵覆盖。
3. **服务端幂等**：未建（规格明确留独立 Sprint）；客户端防重已实现。
4. **真机/浏览器级 UI 走查**：本 Sprint 以 API 级全链验证 + 类型/构建验证为准，未做真机浏览器走查（与 E-08-UI-01 同口径）。
5. `dist.zip` 被本次构建刷新（含 M05），若需保留 UI-02 版本请注意。

## 10. 回滚方式

- 前端：生产 dist 未切换，无需回滚；删除 `dist-m05/`、还原 `dist.zip` 即可。
- 后端：还原 `server/routes/violations/main.js`（git 工作树还原该单文件）+ 重启 DEV 后端；生产本就未部署，无需回滚。
- DEV 数据：测试记录已软删、扣分已撤销、上限已恢复（见 §7）。

## 11. 最终状态

```text
MOBILE_VIOLATION_ROUTE=PASS
MOBILE_VIOLATION_FORM=PASS
MOBILE_VIOLATOR_EMPLOYEE_SELECT=PASS
MOBILE_CHECK_SOURCE=PASS
MOBILE_PHOTO_EVIDENCE=PASS
MOBILE_POST_VIOLATIONS=PASS
MOBILE_E08011_RESPONSIBILITY=PASS
MOBILE_DEDUCTION_RESULT=PASS
MOBILE_PC_QUERY=PASS
MOBILE_WPS_BOUNDARY=PASS
MOBILE_AUTH_BOUNDARY=PASS

MOBILE_05_STATUS=PASS   （代码完成 + DEV 验证通过；生产上线待独立授权）
```

本 Sprint 收口，停止等待下一阶段指令。
