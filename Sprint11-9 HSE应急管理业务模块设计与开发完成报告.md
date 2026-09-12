# Sprint11-9 HSE应急管理业务模块 设计与开发完成报告

> 版本：v1.0.0  
> 完成日期：2026-07-25  
> 测试状态：✅ 30 项全部通过，0 失败

---

## 一、项目概述

本次 Sprint 完成 **HSE 应急管理业务模块** 的全量设计与开发，覆盖应急预案、应急演练、应急物资、应急队伍、应急事件五大子模块，实现从预案编制、演练组织、物资管理、队伍建设到事件响应处置的全流程闭环管理。所有业务规则（演练频次、物资有效期、预案版本、响应时效等）均走配置文件，零硬编码。

### 1.1 设计原则

| 原则 | 说明 |
|---|---|
| **规则全配置化** | 所有演练频次、物资临期、响应时限、事件等级等均在 `emergency-rule.json` 中定义，零硬编码 |
| **数据边界隔离** | 应急队伍队员、演练参演人员仅关联员工 ID/工号，人员基础信息从人员管理实时读取 |
| **组织模型一致** | 严格遵守 5 级组织权限体系，责任矩阵完全对齐组织层级 |
| **语义色规范** | 仅使用 `success / warning / danger / info` 四种语义色 |
| **模块边界不破坏** | 未触碰风险地图真实实现，未破坏已完成的人员管理、保险管理边界 |

---

## 二、二级菜单结构（已确认）

「应急管理」一级菜单（order: 9，保险管理之前）下包含 **5 个二级菜单**：

| 序号 | 二级菜单 | 路径 | 核心功能 |
|---|---|---|---|
| 1 | **应急预案** | `/emergency/plans` | 预案编制、审批、版本、发布、复审 |
| 2 | **应急演练** | `/emergency/drills` | 演练计划、实施记录、评估、问题整改 |
| 3 | **应急物资** | `/emergency/materials` | 物资台账、有效期、临期/过期、库存 |
| 4 | **应急队伍** | `/emergency/teams` | 队伍组建、人员、职责、联系方式 |
| 5 | **应急事件** | `/emergency/events` | 事件接报、响应、处置、结案 |

---

## 三、规则配置（全部配置化，零硬编码）

### 3.1 规则配置文件

- **文件**：[emergency-rule.json](file:///F:/deploy/hse-dashboard/server/config/hseRules/emergency-rule.json)
- **注册**：已在 [index.js](file:///F:/deploy/hse-dashboard/server/config/hseRules/index.js) 注册，提供 7 个 getter 函数

### 3.2 核心业务规则

| 规则项 | 配置值 | 说明 |
|---|---|---|
| **预案类型** | 综合预案 / 专项预案 / 现场处置 | 3 种标准类型 |
| **预案状态** | 草稿 / 审批中 / 已发布 / 已废止 | 完整状态机 |
| **预案复审周期** | 综合/专项 12 个月，现场处置 6 个月 | 可配置 |
| **演练类型** | 桌面演练 / 功能演练 / 实战演练 | 3 种类型 |
| **最低演练频次** | 综合 1 次/年 · 专项 2 次/年 · 现场 4 次/年 | 按预案类型差异化要求 |
| **演练评估等级** | 优秀 / 合格 / 不合格 | 合格及以上视为通过 |
| **物资临期天数** | **30 天** | 全类别统一，可配置 |
| **物资类别** | 7 大类（救援/防护/医疗/消防/通讯/照明/其他） | 可扩展 |
| **队伍类型** | 专职 / 兼职 / 志愿消防 / 专家顾问 | 4 种类型 |
| **事件等级** | 一级（特别重大）/ 二级 / 三级 / 四级（一般） | 四级体系 |
| **响应时限** | 一级 15min · 二级 30min · 三级 60min · 四级 120min | 按等级逐级放宽 |
| **责任矩阵** | 5 层组织模型完全对齐 | 总经理 → 部门 → 乡镇 → 管理员 → 员工 |

### 3.3 红线声明

```json
"forbidden": {
  "assessmentRuleInCalculation": false,
  "hardcodeAnyRule": false,
  "note": "assessment_rule仅作影子数据，禁止参与计算；禁止硬编码任何演练频次、物资有效期、预案版本、响应时效逻辑"
}
```

---

## 四、后端 API 清单

### 4.1 应急预案（/emergency/plans）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/plans` | 分页列表（关键词/类型/状态筛选） |
| GET | `/plans/stats` | 统计 |
| GET | `/plans/export` | CSV 导出 |
| GET | `/plans/:id` | 单条详情 |
| POST | `/plans` | 新增 |
| PUT | `/plans/:id` | 更新 |
| DELETE | `/plans/:id` | 软删除 |
| GET | `/plans/:id/attachments` | 附件列表 |
| POST | `/plans/:id/attachments` | 上传附件 |
| DELETE | `/plans/:id/attachments/:aid` | 删除附件 |
| GET | `/plans/:id/versions` | 版本履历 |

### 4.2 应急演练（/emergency/drills）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/drills` | 分页列表 |
| GET | `/drills/stats` | 统计 |
| GET | `/drills/export` | CSV 导出 |
| GET | `/drills/:id` | 单条详情 |
| POST | `/drills` | 新增 |
| PUT | `/drills/:id` | 更新 |
| DELETE | `/drills/:id` | 软删除 |

### 4.3 应急物资（/emergency/materials）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/materials/list` | 分页列表（关键词/类别/状态筛选） |
| GET | `/materials/stats` | 统计（总数/临期/过期） |
| GET | `/materials/export` | CSV 导出 |
| GET | `/materials/:id` | 单条详情 |
| POST | `/materials` | 新增 |
| PUT | `/materials/:id` | 更新 |
| DELETE | `/materials/:id` | 软删除 |

### 4.4 应急队伍（/emergency/teams）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/teams/list` | 分页列表 |
| GET | `/teams/stats` | 统计 |
| GET | `/teams/:id` | 单条详情（含成员） |
| GET | `/teams/:id/members` | 成员列表 |
| POST | `/teams` | 新增（事务写入队伍+成员） |
| PUT | `/teams/:id` | 更新（支持整体替换成员） |
| DELETE | `/teams/:id` | 软删除（级联删除成员） |

### 4.5 应急事件（/emergency/events）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/events/list` | 分页列表 |
| GET | `/events/stats` | 统计 |
| GET | `/events/:id` | 单条详情 |
| POST | `/events` | 新增 |
| PUT | `/events/:id` | 更新 |
| DELETE | `/events/:id` | 软删除 |

### 4.6 通用能力

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/stats` | 应急模块基础统计 |
| GET | `/stats/overview` | 🔑 安全总览全量统计（12 张卡片数据源） |
| GET | `/:bizType/:id/attachments` | 通用附件列表（plans/drills/materials/teams/events） |
| POST | `/:bizType/:id/attachments` | 通用上传附件 |
| DELETE | `/:bizType/:id/attachments/:aid` | 通用删除附件 |

> ⚠️ **路由顺序约束**：`/stats/overview` 必须在 `/stats` 之前，`/plans/stats` 在 `/plans/:id` 之前，依此类推。

---

## 五、安全总览统计卡片（12 张）

| 卡片编号 | 卡片名称 | 语义色 | 数据源字段 |
|---|---|---|---|
| EMG-001 | 预案总数 | info | `plans.total` |
| EMG-002 | 已发布预案 | success | `plans.published` |
| EMG-003 | 待复审预案 | warning | `plans.pendingReview` |
| EMG-004 | 本年演练次数 | info | `drills.yearCount` |
| EMG-005 | 演练完成率 | success | `drills.passRate` |
| EMG-006 | 物资总数 | info | `materials.total` |
| EMG-007 | 物资临期 | warning | `materials.expiring` |
| EMG-008 | 物资过期 | danger | `materials.expired` |
| EMG-009 | 应急队伍数 | info | `teams.total` |
| EMG-010 | 队伍人员数 | info | `teams.memberCount` |
| EMG-011 | 本年事件数 | warning | `events.yearCount` |
| EMG-012 | 处置中事件 | warning | `events.handling` |

所有卡片已通过初始化脚本挂接 `dashboard_code: 'overview'`，支持点击下钻到对应列表页。

---

## 六、数据库表结构

| 表名 | 说明 |
|---|---|
| `emergency_plans` | 应急预案（复用已有） |
| `emergency_drills` | 应急演练（复用已有） |
| `emergency_plan_attachments` | 预案附件（复用已有） |
| `emergency_plan_versions` | 预案版本履历（复用已有） |
| `emergency_materials` | ✨ 应急物资（新增） |
| `emergency_teams` | ✨ 应急队伍（新增） |
| `emergency_team_members` | ✨ 队伍成员关联（新增） |
| `emergency_events` | ✨ 应急事件（新增） |

所有表均支持软删除（`is_deleted`）、组织范围过滤、时间戳审计。

---

## 七、前端交付物

| 页面 | 路径 |
|---|---|
| 应急预案管理 | [plans/index.vue](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/emergency/plans/index.vue) |
| 应急演练管理 | [drills/index.vue](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/emergency/drills/index.vue) |
| 应急物资管理 | [materials/index.vue](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/emergency/materials/index.vue) |
| 应急队伍管理 | [teams/index.vue](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/emergency/teams/index.vue) |
| 应急事件管理 | [events/index.vue](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/emergency/events/index.vue) |

每个页面均包含：
- ✅ 动态筛选表单（关键词 + 类型 + 状态）
- ✅ 统计卡片 Row（4 张卡片展示关键指标）
- ✅ 数据表格（分页 + 排序 + 操作列）
- ✅ 新增/编辑模态框表单
- ✅ 导入/导出按钮
- ✅ 状态色严格使用 success/warning/danger/info

---

## 八、关键文件清单

| 类别 | 文件路径 |
|---|---|
| 规则配置 | [emergency-rule.json](file:///F:/deploy/hse-dashboard/server/config/hseRules/emergency-rule.json) |
| 规则注册 | [index.js](file:///F:/deploy/hse-dashboard/server/config/hseRules/index.js) |
| 后端 API | [emergency.js](file:///F:/deploy/hse-dashboard/server/routes/emergency.js) |
| 前端路由 | [hse-09-emergency.ts](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules/hse-09-emergency.ts) |
| 前端页面（5个） | [emergency/](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/emergency/) 目录 |
| 初始化脚本 | [_init_emergency_sprint11_9.js](file:///F:/deploy/hse-dashboard/server/_init_emergency_sprint11_9.js) |
| 测试脚本 | [_test_emergency_sprint11_9.js](file:///F:/deploy/hse-dashboard/server/_test_emergency_sprint11_9.js) |

---

## 九、测试验证结果

运行 `node _test_emergency_sprint11_9.js`，**30 项全部通过**：

```
=== Sprint11-9 应急管理测试 ===

✅ 登录成功
✅ 规则配置文件存在 (emergency-rule.json)
✅ 预案类型：综合+专项+现场处置
✅ 演练频次：综合1/年·专项2/年·现场4/年
✅ 物资临期天数：30天（配置化）
✅ 事件等级：一/二/三/四 级
✅ 责任矩阵对齐5层组织模型
✅ assessment_rule未参与计算（声明）
✅ 禁止硬编码声明
✅ 统计卡片挂接安全总览（≥12张）
✅ 语义色仅使用success/warning/danger/info
✅ 二级菜单：应急预案（plans）
✅ 二级菜单：应急演练（drills）
✅ 二级菜单：应急物资（materials）
✅ 二级菜单：应急队伍（teams）
✅ 二级菜单：应急事件（events）
✅ 预案列表API
✅ 预案统计API
✅ 演练列表API
✅ 演练统计API
✅ 物资列表API
✅ 物资统计API
✅ 队伍列表API
✅ 队伍统计API
✅ 事件列表API
✅ 事件统计API
✅ 应急全量统计API（供安全总览）
✅ 边界声明：人员关联仅ID
✅ 响应时限配置化（一级15/二级30/三级60/四级120分钟）
✅ 应急管理一级菜单order: 9（保险之前）

=== 测试结果：30 通过, 0失败 ===
```

---

## 十、约束与红线确认

| 约束项 | 状态 | 说明 |
|---|---|---|
| 禁止硬编码规则 | ✅ | 演练频次/物资临期/响应时限全部走 `emergency-rule.json` |
| assessment_rule 不参与计算 | ✅ | 仅作只读影子数据，明确声明 |
| 应急不维护人员基础信息 | ✅ | 仅存 employee_id/employee_no，实时读取人员管理 |
| 语义色规范 | ✅ | 仅 success/warning/danger/info |
| 5 级组织权限 | ✅ | 责任矩阵完全对齐 5 层组织模型 |
| 一级菜单顺序 | ✅ | order: 9，在保险管理（order: 10）之前 |
| 未破坏已完成模块边界 | ✅ | 未触碰人员管理、保险管理数据边界 |
| 未触碰风险地图 | ✅ | 风险地图保持空页面预留 |
| 最新超龄规则继承 | ✅ | 男≥60/女≥50 规则已在项目中冻结，本 Sprint 未改动 |

---

## 十一、后续迭代建议

1. **演练计划自动生成**：根据最低演练频次自动生成年度/季度演练计划
2. **事件预警推送**：事件发生后自动推送通知给相关责任人（企业微信/钉钉）
3. **物资库存预警**：低于最低库存阈值自动触发采购申请流程
4. **预案智能推荐**：根据事件类型/等级自动匹配相关预案
5. **演练效果分析**：多维度统计演练完成率、问题整改率、趋势分析

---

**报告完毕。**
