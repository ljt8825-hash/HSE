# Sprint5.13 隐患管理深化开发报告

## 一、开发概述

**项目**：HSE 安全管理系统
**阶段**：Sprint5.13
**主题**：隐患管理深化开发
**目标**：建立隐患治理闭环

---

## 二、需求分析

### 2.1 核心目标

建立隐患治理闭环流程：

```
隐患发现 → 责任分配 → 整改 → 复查 → 关闭
```

### 2.2 需求要点

| 序号 | 需求点 | 描述 | 优先级 |
|:---:|--------|------|:---:|
| 1 | 人员关联规范 | 所有人员字段必须使用 employee_id，关联来源 v_employee_current | 高 |
| 2 | 数据模型完善 | 完善 hse_hazard_records 表结构，新增隐患类型、位置、网格、整改结果等字段 | 高 |
| 3 | 业务流程开发 | 发现→整改中→待复查→关闭的完整流程 | 高 |
| 4 | 联动功能 | 重大隐患自动提醒、责任人超期统计、重复隐患分析 | 高 |
| 5 | 统计分析 | 部门隐患排行、岗位隐患排行、区域隐患排行、重复隐患排行 | 高 |

---

## 三、技术实现

### 3.1 数据模型完善

**修改文件**：`server/routes/hazards.js`

**新增字段**：

| 字段名 | 类型 | 说明 |
|--------|------|------|
| hazard_type | VARCHAR(64) | 隐患类型（设施设备、作业环境、管理体系、人员行为、其他） |
| location | VARCHAR(255) | 隐患位置 |
| grid_id | BIGINT | 网格ID |
| rectification | TEXT | 整改结果 |
| reviewer_id | BIGINT | 复查人ID |
| rectify_date | DATE | 整改日期 |
| review_date | DATE | 复查日期 |
| review_result | VARCHAR(32) | 复查结果（pass/fail） |
| deadline_days | INT | 整改期限天数，默认30天 |

**新增索引**：

- `idx_hazards_hazard_type` - 隐患类型索引
- `idx_hazards_responsible_id` - 责任人ID索引
- `idx_hazards_grid_id` - 网格ID索引
- `idx_hazards_status` - 状态索引
- `idx_hazards_risk_level` - 风险等级索引

### 3.2 API接口开发

#### 3.2.1 隐患治理闭环流程接口

| 接口路径 | 方法 | 功能 | 状态流转 |
|----------|------|------|----------|
| `/api/hazards/:id/rectify` | PUT | 整改提交 | discovered → processing |
| `/api/hazards/:id/submit-review` | PUT | 提交复查 | processing → pending_review |
| `/api/hazards/:id/review` | PUT | 复查确认 | pending_review → closed / processing |
| `/api/hazards/:id/close` | PUT | 直接关闭 | 任意状态 → closed |

**整改提交接口** (`PUT /api/hazards/:id/rectify`)：

| 参数 | 类型 | 必填 | 说明 |
|------|------|:---:|------|
| correctorId | number | 否 | 整改人ID |
| rectification | string | 是 | 整改结果描述 |
| rectifyDate | string | 否 | 整改日期（YYYY-MM-DD） |

**复查确认接口** (`PUT /api/hazards/:id/review`)：

| 参数 | 类型 | 必填 | 说明 |
|------|------|:---:|------|
| reviewerId | number | 否 | 复查人ID |
| reviewResult | string | 是 | 复查结果（pass/合格 或 fail/不合格） |
| reviewNote | string | 否 | 复查意见 |
| reviewDate | string | 否 | 复查日期（YYYY-MM-DD） |

**直接关闭接口** (`PUT /api/hazards/:id/close`)：

| 参数 | 类型 | 必填 | 说明 |
|------|------|:---:|------|
| closeNote | string | 否 | 关闭说明 |

#### 3.2.2 联动功能接口

| 接口路径 | 功能 |
|----------|------|
| `GET /api/hazards/reminders/high-risk` | 重大隐患提醒（风险等级为重大/一级） |
| `GET /api/hazards/reminders/overdue` | 超期隐患统计 |
| `GET /api/hazards/analysis/repeated` | 重复隐患分析（按描述分组，出现>1次） |
| `GET /api/hazards/analysis/responsible-overdue` | 责任人超期统计 |

#### 3.2.3 统计分析接口

**路径**：`GET /api/hazards/stats`

**返回数据**：

| 字段 | 类型 | 说明 |
|------|------|------|
| total | number | 隐患总数 |
| discovered | number | 待整改数量 |
| processing | number | 整改中数量 |
| pendingReview | number | 待复查数量 |
| closed | number | 已关闭数量 |
| highRiskCount | number | 重大隐患数量 |
| overdueCount | number | 超期隐患数量 |
| byDepartment | array | 部门隐患排行 |
| byPosition | array | 岗位隐患排行 |
| byRegion | array | 区域隐患排行 |
| repeatedHazards | array | 重复隐患排行 |

#### 3.2.4 列表筛选增强

**路径**：`GET /api/hazards`

**新增筛选参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| status | string | 隐患状态（discovered/processing/pending_review/closed） |
| hazardType | string | 隐患类型 |
| riskLevel | string | 风险等级 |

### 3.3 前端页面更新

**修改文件**：`安全看板vben/apps/web-antd/src/views/hazards/index.vue`

**更新内容**：

1. **新增筛选条件** - 在查询表单中增加隐患类型、风险等级、状态筛选
2. **新增统计卡片** - 统计行增加待整改、整改中、待复查、重大隐患卡片
3. **新增操作按钮** - 根据状态显示整改、提交复查、复查确认、关闭按钮
4. **整改弹窗** - 新增整改提交弹窗，包含整改人选择、整改结果输入、整改日期选择
5. **复查弹窗** - 新增复查确认弹窗，包含复查人选择、复查结果选择（合格/不合格）、复查意见输入、复查日期选择
6. **关闭弹窗** - 新增关闭隐患弹窗，包含关闭说明输入
7. **统计分析抽屉** - 新增统计分析抽屉，包含五个Tab页：
   - 总体概览（统计卡片）
   - 部门排行
   - 岗位排行
   - 区域排行
   - 重复隐患
8. **隐患提醒抽屉** - 新增隐患提醒抽屉，包含三个Tab页：
   - 重大隐患
   - 超期隐患
   - 责任人超期统计
9. **详情抽屉增强** - 增加隐患类型、位置、整改期限、各角色人员、整改结果、复查结果等字段显示
10. **表单增强** - 增加隐患类型、风险等级、整改期限、四个人员选择器（发现人/责任人/整改人/复查人）、隐患位置等字段

### 3.4 API类型定义更新

**修改文件**：`安全看板vben/apps/web-antd/src/api/hse/insurance.ts`

**新增类型**：

- `HazardStatsEnhanced` - 增强版隐患统计类型
- `HighRiskReminderResult` - 重大隐患提醒结果类型
- `OverdueReminderResult` - 超期隐患提醒结果类型
- `RepeatedHazardItem` - 重复隐患项类型
- `RepeatedHazardResult` - 重复隐患分析结果类型
- `ResponsibleOverdueItem` - 责任人超期统计项类型
- `ResponsibleOverdueResult` - 责任人超期统计结果类型

**新增接口函数**：

- `rectifyHazard()` - 整改提交接口
- `submitReviewHazard()` - 提交复查接口
- `reviewHazard()` - 复查确认接口
- `closeHazard()` - 直接关闭接口
- `getHighRiskReminders()` - 重大隐患提醒接口
- `getOverdueReminders()` - 超期隐患统计接口
- `getRepeatedHazardAnalysis()` - 重复隐患分析接口
- `getResponsibleOverdueAnalysis()` - 责任人超期统计接口

---

## 四、业务流程

### 4.1 隐患治理流程图

```
┌─────────────┐
│  发现隐患   │
└──────┬──────┘
       ▼
┌─────────────┐
│ 发现        │
│ (选择责任人) │
└──────┬──────┘
       ▼
┌─────────────┐
│   整改中    │
│ (整改提交)   │
└──────┬──────┘
       ▼
┌─────────────┐
│   待复查    │
│ (提交复查)   │
└──────┬──────┘
       │
   ┌───┴───┐
   ▼       ▼
┌──────────┐ ┌──────────┐
│  合格    │ │  不合格  │
│ 已关闭   │ │ 整改中   │
└──────────┘ └──────────┘
```

### 4.2 状态流转

| 当前状态 | 操作 | 目标状态 |
|----------|------|----------|
| 发现 | 整改提交 | 整改中 |
| 整改中 | 提交复查 | 待复查 |
| 待复查 | 复查合格 | 关闭 |
| 待复查 | 复查不合格 | 整改中 |
| 任意状态 | 直接关闭 | 关闭 |

### 4.3 联动功能逻辑

#### 4.3.1 重大隐患自动提醒

- 创建隐患时，若风险等级为"重大"或"一级"，自动推送通知
- 通过通知中心发送提醒消息

#### 4.3.2 责任人超期统计

- 基于 `hazard_date + deadline_days` 计算整改期限
- 超过期限且未关闭的隐患计入超期统计
- 按责任人分组统计超期数量

#### 4.3.3 重复隐患分析

- 按隐患描述分组统计出现次数
- 显示首次发现和最近发现日期
- 统计已关闭数量

---

## 五、工程约束遵守

| 约束项 | 状态 | 说明 |
|--------|:---:|------|
| 禁止修改Vben核心目录 | ✅ | 未修改 |
| 禁止修改auth/JWT | ✅ | 未修改 |
| 禁止新增npm依赖 | ✅ | 未新增 |
| 人员字段使用employee_id | ✅ | 所有人员字段均使用employee_id，关联v_employee_current |
| 禁止新增人员表 | ✅ | 未新增 |

---

## 六、文件变更清单

| 文件路径 | 变更类型 | 说明 |
|----------|:-------:|------|
| `server/routes/hazards.js` | 修改 | 完善数据模型、新增流程API、联动API、统计API、列表筛选增强 |
| `安全看板vben/apps/web-antd/src/api/hse/insurance.ts` | 修改 | 新增类型定义和接口函数 |
| `安全看板vben/apps/web-antd/src/views/hazards/index.vue` | 修改 | 更新前端页面，新增流程弹窗、统计分析抽屉、隐患提醒抽屉 |

---

## 七、后续工作建议

1. **短信通知** - 重大隐患、超期隐患时发送短信提醒相关人员
2. **移动端适配** - 优化移动端隐患管理页面显示
3. **图表可视化** - 增加ECharts图表展示统计数据
4. **网格联动** - 完善网格管理，实现隐患与网格的深度联动
5. **预警规则配置** - 支持自定义预警规则和通知策略