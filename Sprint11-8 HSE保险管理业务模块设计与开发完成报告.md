# Sprint11-8 HSE保险管理业务模块 设计与开发完成报告

> 版本：v1.0.0  
> 完成日期：2026-07-25  
> 测试状态：✅ 16 项全部通过，0 失败

---

## 一、项目概述

本次 Sprint 完成 **HSE 保险管理业务模块** 的全量设计与开发，覆盖人员保险、车辆保险、其他保险三大子模块。核心特性包括：可配置规则引擎（年龄/性别/五险条件匹配）、动态菜单结构、数据边界隔离、安全总览统计卡片集成等。

### 1.1 设计原则

| 原则 | 说明 |
|---|---|
| **规则全配置化** | 所有超龄阈值、保额、临期天数、匹配逻辑均在 `insurance-rule.json` 中定义，零硬编码 |
| **数据边界隔离** | 保险模块仅关联员工 ID/工号，人员基础信息从人员管理模块实时读取，禁止重复维护 |
| **组织模型一致** | 严格遵守 5 级组织权限体系，数据按组织范围过滤 |
| **语义色规范** | 仅使用 `success / warning / danger / info` 四种语义色 |

---

## 二、用户 6 项确认需求落实

### ✅ 需求 1：超龄人员菜单归位

- **调整前**：保险管理 → 超龄人员（二级菜单）
- **调整后**：人员管理 → 超龄人员（二级菜单，第 8 项）
- **修改文件**：
  - [hse-07-personnel.ts](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules/hse-07-personnel.ts#L76-L85)（新增超龄人员路由）
  - [hse-10-insurance.ts](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules/hse-10-insurance.ts)（移除超龄人员路由）

### ✅ 需求 2：新增「其他保险」二级菜单

保险管理下包含 **3 个二级菜单**：

| 序号 | 二级菜单 | 险种 |
|---|---|---|
| 1 | 人员保险 | 五险 / 工伤险 / 雇主责任险 |
| 2 | 车辆保险 | 交强险 / 商业险 |
| 3 | **其他保险** ✨ | **公众责任险 / 财产一切险** |

- 不含「承运人责任险」（已在配置中排除）
- 前端页面：[other/index.vue](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/insurance/other/index.vue)
- 后端 API：[insurance.js](file:///F:/deploy/hse-dashboard/server/routes/insurance.js)

### ✅ 需求 3：默认保额（配置化）

| 人员分类 | 匹配条件 | 险种方案 | 默认保额 |
|---|---|---|---|
| 超龄人员 | 男≥60 或 女≥50 | 工伤险 + 雇主责任险 | **10 万** |
| 适龄·有五险 | 适龄 + has_five_ins=true | 五险 | — |
| 适龄·无五险 | 适龄 + has_five_ins=false | 雇主责任险 | **80 万** |

配置来源：[insurance-rule.json](file:///F:/deploy/hse-dashboard/server/config/hseRules/insurance-rule.json#L23-L78) → `personnelInsurance.rules`

### ✅ 需求 4：临期天数（配置化，全险种统一）

```json
"expiryRules": {
  "expiringDays": 30,
  "applyToAllTypes": true
}
```

- 所有保险类型（人员/车辆/其他）统一使用 **30 天** 临期阈值
- 状态判定：
  - **正常**：到期日 > 30 天以后（`success`）
  - **临期**：到期日 ≤ 30 天且未过期（`warning`）
  - **过期**：到期日 < 今日（`danger`）

### ✅ 需求 5：预算维度（配置化）

```json
"budgetConfig": {
  "dimensions": ["部门", "保险类型"],
  "note": "按部门+保险类型做预算vs实际对比"
}
```

- 预算维度：`部门` × `保险类型`
- 预算口径：`实缴`
- 支持对比维度：预算 vs 实际支出

### ✅ 需求 6：超龄规则（配置化）

```json
"overAgeThresholds": {
  "male": 60,
  "female": 50,
  "note": "男性≥60或女性≥50自动识别为超龄人员"
}
```

- 男性年龄 **≥ 60** 周岁 → 超龄
- 女性年龄 **≥ 50** 周岁 → 超龄
- 与 `employee-age-rule.json` 保持一致

---

## 三、菜单结构总览

### 3.1 人员管理（一级菜单，order: 7）

| 序号 | 二级菜单 | 路径 |
|---|---|---|
| 1 | 员工列表 | `/personnel/employee` |
| 2 | 组织管理 | `/personnel/departments` |
| 3 | 岗位管理 | `/personnel/positions` |
| 4 | 员工档案 | `/personnel/profile` |
| 5 | 花名册导入 | `/personnel/import` |
| 6 | 批量导入 | `/personnel/batch-import` |
| 7 | **超龄人员** ✨ | `/personnel/over-age` |

### 3.2 保险管理（一级菜单，order: 10）

| 序号 | 二级菜单 | 路径 |
|---|---|---|
| 1 | 人员保险 | `/insurance/personnel` |
| 2 | 车辆保险 | `/insurance/vehicle` |
| 3 | **其他保险** ✨ | `/insurance/other` |

---

## 四、规则引擎设计

### 4.1 匹配逻辑流程

```
人员信息（age, gender, has_five_ins, position, department）
                    │
                    ▼
         ┌───────────────────┐
         │  超龄判定          │
         │  男≥60 / 女≥50    │
         └─────────┬─────────┘
                   │
         ┌─────────┴─────────┐
         ▼                   ▼
    ┌─────────┐        ┌──────────────┐
    │ 超龄分支 │        │ 适龄分支      │
    └────┬────┘        └──────┬───────┘
         │                      │
         ▼                      ▼
  工伤险 + 10万       ┌───────────────────┐
  雇主责任险          │ has_five_ins?      │
                       └───────┬───────────┘
                               │
                     ┌─────────┴─────────┐
                     ▼                   ▼
              五险（已缴）          80万雇主责任险
```

### 4.2 规则配置结构

规则引擎核心位于 [insurance-rule.json](file:///F:/deploy/hse-dashboard/server/config/hseRules/insurance-rule.json)，支持：
- 优先级排序（`priority` 越小越优先）
- 启用/禁用开关（`enabled`）
- 条件维度扩展：年龄、性别、五险标记、岗位、部门
- 方案可配置：险种列表、保额、是否强制

---

## 五、后端 API 清单

### 5.1 人员保险

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/insurance/personnel/list` | 人员保险列表（分页+筛选） |
| GET | `/insurance/personnel/:id` | 单条详情 |
| POST | `/insurance/personnel` | 新增 |
| PUT | `/insurance/personnel/:id` | 更新 |
| DELETE | `/insurance/personnel/:id` | 删除 |
| GET | `/insurance/personnel/stats` | 统计概览 |
| GET | `/insurance/personnel/export` | CSV 导出 |
| **GET** | **`/insurance/personnel/rules/match`** | 🔑 规则匹配（单人员） |
| **GET** | **`/insurance/personnel/pending-list`** | 🔑 待缴人员名单 |
| **POST** | **`/insurance/personnel/generate-from-pending`** | 🔑 一键生成待缴保险 |

> ⚠️ **路由顺序约束**：`/rules/match`、`/pending-list`、`/generate-from-pending` 必须在 `/personnel/:id` 之前注册，否则会被参数路由 `/:id` 误匹配。

### 5.2 车辆保险

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/insurance/vehicle/list` | 列表 |
| GET | `/insurance/vehicle/:id` | 详情 |
| POST | `/insurance/vehicle` | 新增 |
| PUT | `/insurance/vehicle/:id` | 更新 |
| DELETE | `/insurance/vehicle/:id` | 删除 |
| GET | `/insurance/vehicle/stats` | 统计 |
| GET | `/insurance/vehicle/export` | CSV 导出 |

### 5.3 其他保险

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/insurance/other/list` | 列表 |
| GET | `/insurance/other/:id` | 详情 |
| POST | `/insurance/other` | 新增 |
| PUT | `/insurance/other/:id` | 更新 |
| DELETE | `/insurance/other/:id` | 删除 |
| GET | `/insurance/other/stats` | 统计 |

### 5.4 通用能力

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/insurance/:bizType/:id/attachments` | 附件列表（vehicle/personnel/other/overage） |
| POST | `/insurance/:bizType/:id/attachments` | 上传附件 |
| DELETE | `/insurance/:bizType/:id/attachments/:aid` | 删除附件 |
| GET | `/insurance/stats/overview` | 保险全量统计（供安全总览调用） |

---

## 六、安全总览统计卡片

通过初始化脚本 [_init_insurance_sprint11_8.js](file:///F:/deploy/hse-dashboard/server/_init_insurance_sprint11_8.js) 向 `hse_dashboard_card_config` 表插入 **11 张**保险相关统计卡片：

| 卡片编号 | 卡片名称 | 数据源 |
|---|---|---|
| INS-001 | 人员保险总数 | `/insurance/stats/overview` → `personnel.total` |
| INS-002 | 人员在保人数 | → `personnel.covered` |
| INS-003 | 人员保险临期 | → `personnel.expiring` |
| INS-004 | 人员保险过期 | → `personnel.expired` |
| INS-005 | 人员待缴保险 | → `personnel.pending` |
| INS-006 | 车辆保险总数 | → `vehicle.total` |
| INS-007 | 车辆在保数量 | → `vehicle.active` |
| INS-008 | 车辆保险临期 | → `vehicle.expiring` |
| INS-009 | 车辆保险过期 | → `vehicle.expired` |
| INS-010 | 其他保险总数 | → `other.total` |
| INS-011 | 其他保险临期 | → `other.expiring` |

---

## 七、关键文件清单

| 类别 | 文件路径 |
|---|---|
| 路由配置 | [hse-10-insurance.ts](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules/hse-10-insurance.ts) |
| 路由配置 | [hse-07-personnel.ts](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules/hse-07-personnel.ts) |
| 规则引擎配置 | [insurance-rule.json](file:///F:/deploy/hse-dashboard/server/config/hseRules/insurance-rule.json) |
| 后端 API | [insurance.js](file:///F:/deploy/hse-dashboard/server/routes/insurance.js) |
| 人员保险页面 | [personnel/index.vue](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/insurance/personnel/index.vue) |
| 车辆保险页面 | [vehicle/index.vue](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/insurance/vehicle/index.vue) |
| 其他保险页面 | [other/index.vue](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/insurance/other/index.vue) |
| 初始化脚本 | [_init_insurance_sprint11_8.js](file:///F:/deploy/hse-dashboard/server/_init_insurance_sprint11_8.js) |
| 测试脚本 | [_test_insurance_sprint11_8.js](file:///F:/deploy/hse-dashboard/server/_test_insurance_sprint11_8.js) |

---

## 八、测试验证结果

运行 `node _test_insurance_sprint11_8.js`，**16 项全部通过**：

```
=== Sprint11-8 保险管理测试 ===

✅ 登录成功
✅ 规则配置文件存在 (insurance-rule.json)
✅ 超龄规则：男性≥60 女性≥50
✅ 保险类型无承运人责任险
✅ 其他保险含公众责任险+财产一切险
✅ 其他保险列表API
✅ 其他保险统计API
✅ 人员保险规则匹配API
✅ 保险全量统计API（供安全总览）
✅ 人员保险待缴名单API
✅ assessment_rule未参与计算
✅ 边界声明：保险不维护人员基础信息
✅ 临期/过期规则配置化
✅ 语义色仅使用success/warning/danger/info
✅ 二级菜单结构：人员保险+车辆保险+其他保险
✅ 超龄人员在人员管理下（非保险管理）
✅ 默认保额：超龄10万、适龄80万

=== 测试结果：16 通过, 0失败 ===
```

---

## 九、约束与红线确认

| 约束项 | 状态 | 说明 |
|---|---|---|
| 禁止硬编码规则 | ✅ | 所有保额/年龄/临期天数均走 `insurance-rule.json` |
| 保险不维护人员基础信息 | ✅ | 仅存 `personnel_id`，展示时实时 JOIN 人员表 |
| assessment_rule 不参与计算 | ✅ | 仅作影子数据 |
| 语义色规范 | ✅ | 仅 success/warning/danger/info |
| 5 级组织权限 | ✅ | 数据按组织范围过滤 |
| 路由顺序正确 | ✅ | `/rules/match` 等在 `/:id` 之前注册 |

---

## 十、后续迭代建议

1. **预算执行看板**：增加预算 vs 实际支出对比图表
2. **续保提醒**：对接企业微信/钉钉机器人推送临期提醒
3. **保险到期自动触发流程**：与审批流联动
4. **历史版本回溯**：规则配置变更记录与一键回滚

---

**报告完毕。**
