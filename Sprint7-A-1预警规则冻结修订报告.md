# Sprint7-A-1 预警规则冻结修订报告

> 文档版本：v1.0
> 生成日期：2026 年 7 月
> 所属阶段：HSE Dashboard Sprint7-A-1
> 关联文档：《Sprint7 HSE 智能预警中心设计报告》、《预警规则字典 v1.1》

---

## 一、修订概述

### 1.1 修订背景

Sprint7 HSE 智能预警中心设计报告完成后，在进入开发冻结阶段前，经评审发现存在三项需修订事项：

1. WR-DRV-001 驾驶证扣分预警统计周期与 Sprint6.5-A-1 已统一的驾驶风险评分公式周期不一致（评分已统一为近 5 年，预警规则仍为近 12 个月）；
2. 预警中心权限模型缺少一线网格管理员角色，导致"人工班长"无法在系统内完成整改任务处理与下发；
3. 预警缺乏超时升级机制，重大 / 较大预警长期未处理时无法触发自动升级与提醒。

本次修订为 Sprint7 开发前的最终规则冻结，修订完成后进入规则冻结状态。

### 1.2 修订目标

完成 Sprint7 开发前最终规则冻结，确保预警规则周期与风险模型周期一致、权限模型覆盖一线操作场景、建立预警超时升级机制。

### 1.3 修订项清单

| 序号 | 修订项 | 修订状态 |
|------|--------|----------|
| 1 | WR-DRV-001 驾驶风险预警规则修订（12 个月 → 5 年滚动周期） | ✅ 已完成 |
| 2 | 增加管理员（administrator）角色权限 | ✅ 已完成 |
| 3 | 增加预警升级机制（critical 24h / major 48h） | ✅ 已完成 |

### 1.4 版本与前置

| 项目 | 说明 |
|------|------|
| 修订版本 | 规则字典 v1.0 → v1.1 |
| 前置文档 | Sprint7 HSE 智能预警中心设计报告（已完成） |
| 前置冻结基线 | 员工风险模型（Sprint6.1 冻结版）、考核模型 v1.1、指标字典 v1.1、岗位风险权重（冻结版）、组织权限模型（Sprint6.1 版） |

### 1.5 当前冻结基线

| 冻结项 | 版本 | 说明 |
|--------|------|------|
| 员工风险模型 | Sprint6.1 冻结版 | 风险评分公式、岗位风险权重、扣分规则 |
| 考核模型 | v1.1 | 考核维度、指标权重、红黄牌判定规则 |
| 指标字典 | v1.1 | 集团 HSE 考核指标字典 v1.1 |
| 岗位风险权重 | 冻结版 | 岗位风险权重最终矩阵 |
| 组织权限模型 | Sprint6.1 版 | 三层组织（部门 / 中心 / 片区）数据范围隔离 |

> ⚠️ 上述基线在本 Sprint 内一律视为只读，所有预警规则仅引用其计算结果，不允许回写或二次计算。

---

## 二、修订内容详情

### 2.1 修订 1：驾驶风险预警规则修订（WR-DRV-001）

#### 2.1.1 修订信息

| 项目 | 内容 |
|------|------|
| 规则编号 | WR-DRV-001 |
| 规则名称 | 驾驶证扣分异常预警 |
| 修订前 | 驾驶证扣分近 12 个月（condition_config.period_months: 12） |
| 修订后 | 驾驶证扣分近 5 年滚动周期（condition_config.period_months: 60） |
| 修订原因 | 与 Sprint6.5-A-1 已冻结的驾驶风险评分公式统一采用 5 年滚动周期，与驾驶证扣分周期对齐 |
| 影响版本 | 规则版本 v1.0 → v1.1 |

#### 2.1.2 触发条件对比

**修订前（v1.0）**：

```json
{
  "field": "demerit_points",
  "operator": ">=",
  "value": 6,
  "period_months": 12
}
```

**修订后（v1.1）**：

```json
{
  "field": "demerit_points",
  "operator": ">=",
  "value": 6,
  "period_months": 60
}
```

#### 2.1.3 影响范围

| 影响位置 | 修订前 | 修订后 |
|----------|--------|--------|
| SQL 迁移文件 `sprint7_warning_center_migration.sql` 中 WR-DRV-001 的 condition_config | `"period_months": 12` | `"period_months": 60` |
| SQL 迁移文件中 WR-DRV-001 的 description | "近 12 个月驾驶证累计扣分" | "近 5 年驾驶证累计扣分" |
| 后端扫描逻辑 `hse-warning-center.js` 中 WR-DRV-001 的 SQL 查询 | `INTERVAL '12 months'` | `INTERVAL '5 years'` |
| 预警原因描述（risk_reason 字段） | "近 12 个月驾驶证累计扣分" | "近 5 年驾驶证累计扣分" |
| 预警数据快照 `risk_data.period` | `"12months"` | `"5years"` |

#### 2.1.4 版本记录

- 规则版本：v1.0 → v1.1
- 版本写入：`hse_warning_rule_version` 表自动记录新版本快照
- 版本状态：v1.0 设为 `expired`，v1.1 设为 `active`
- 变更日志：`"WR-DRV-001 统计周期由 12 个月调整为 5 年滚动周期，与驾驶风险评分公式对齐"`

---

### 2.2 修订 2：增加管理员（administrator）角色权限

#### 2.2.1 新增角色定义

| 项目 | 内容 |
|------|------|
| 角色编码 | administrator |
| 角色名称 | 人工班长（管理员） |
| 角色定位 | 一线网格管理员，负责本网格内预警的查看、整改任务的处理与下发 |
| 权限层级 | grid（网格级，最低层级） |
| 数据范围 | 仅本网格数据 |

#### 2.2.2 权限范围

| 权限项 | 是否授予 | 说明 |
|--------|----------|------|
| 查看本网格预警 | ✓ | 仅查看本网格范围内的预警记录 |
| 处理整改任务 | ✓ | 可执行"开始处理"、"提交证明"操作 |
| 创建整改任务 | ✓ | 可手动创建整改任务 |
| 下发整改任务 | ✓ | 可将整改任务下发至本网格内人员 |
| 复核 | ✗ | 不具备复核权限 |
| 关闭预警 | ✗ | 不具备关闭权限 |
| 规则管理 | ✗ | 不具备规则管理权限 |

#### 2.2.3 影响范围

| 影响位置 | 修订内容 |
|----------|----------|
| 后端 `getPermissionScope` 函数 | 新增 `'administrator': { level: 'grid', canViewAll: false, filterType: 'grid' }` |
| 后端 `requireRole` 调用 - `POST /tasks` | 角色白名单新增 `'administrator'` |
| 后端 `requireRole` 调用 - `PUT /tasks/:id/dispatch` | 角色白名单新增 `'administrator'` |
| 前端路由 `hse-advanced.ts` 中 `HseWarningCenter` 路由 `authority` 数组 | 新增 `'administrator'` |

#### 2.2.4 权限矩阵更新（7 种角色）

修订后权限矩阵如下（v1.0 为 6 种角色，v1.1 新增 administrator 后为 7 种角色）：

| 角色 | 数据范围 | 查看预警 | 创建任务 | 下发任务 | 处理任务 | 提交证明 | 复核 | 关闭 | 规则管理 |
|------|----------|----------|----------|----------|----------|----------|------|------|----------|
| admin | 全部 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| safety_manager | 全部 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| group_leader | 全部 | ✓ | - | - | - | - | - | - | - |
| department_manager | 本部门 | ✓ | ✓(本部门) | ✓(本部门) | ✓ | ✓ | ✓(本部门) | - | - |
| township_manager | 本中心 | ✓ | ✓(本中心) | ✓(本中心) | ✓ | ✓ | ✓(本中心) | - | - |
| area_manager | 本片区 | ✓ | ✓(本片区) | ✓(本片区) | ✓ | ✓ | - | - | - |
| administrator | 本网格 | ✓(本网格) | ✓ | ✓ | ✓ | ✓ | - | - | - |

> 说明：administrator 仅新增为新增角色，不改变现有 6 种角色的权限范围与数据范围。

---

### 2.3 修订 3：增加预警升级机制

#### 2.3.1 升级规则

| 原始等级 | 超时阈值 | 升级后等级 | 升级处理说明 |
|----------|----------|------------|--------------|
| critical（重大） | 24 小时未处理 | critical（标记升级） | 重大已是最高等级，不升级等级，仅发送升级提醒通知 |
| major（较大） | 48 小时未处理 | critical（重大） | 较大预警升级为重大预警，同时发送升级通知 |
| minor（一般） | - | - | 暂不自动升级 |
| info（提示） | - | - | 暂不自动升级 |

#### 2.3.2 升级常量定义

```javascript
const ESCALATION_RULES = {
  critical: { hours: 24 },                       // 重大：24h 未处理 → 升级提醒
  major:    { hours: 48, escalateTo: 'critical' } // 较大：48h 未处理 → 升级为重大
};
```

#### 2.3.3 实现方式

| 实现项 | 说明 |
|--------|------|
| 新增 API | `POST /warnings/escalate` - 触发预警升级扫描 |
| 数据库变更 | `hse_warning_record` 表新增 4 个字段（详见 2.3.4） |
| 升级逻辑 | 查询超时未处理预警 → major 升级为 critical → 标记 `is_escalated` → 记录 `original_level` → 发送升级通知 |
| 统计增强 | `/warnings/stats` 接口新增 `escalated_count` 统计字段 |

#### 2.3.4 新增数据库字段

`hse_warning_record` 表新增 4 个字段：

| 字段名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| is_escalated | BOOLEAN | FALSE | 是否已升级 |
| escalated_at | TIMESTAMP | NULL | 升级时间 |
| original_level | VARCHAR(20) | NULL | 原始预警等级（升级前等级，便于回溯） |
| escalation_notified | BOOLEAN | FALSE | 是否已发送升级通知 |

#### 2.3.5 升级处理流程

```
预警生成（status=pending）
        │
        ▼
   定时扫描升级
        │
   ┌────┴────┐
   │         │
critical   major
(24h)      (48h)
   │         │
   ▼         ▼
发送升级   升级为 critical
提醒通知   + 标记 is_escalated=true
           + 记录 original_level='major'
           + escalated_at=NOW()
           + 发送升级通知
```

#### 2.3.6 前端影响

前端文件 `warning-center.ts` 新增内容：

| 新增项 | 说明 |
|--------|------|
| `EscalationResult` 类型 | 升级接口返回结果类型定义 |
| `checkEscalation` 函数 | 调用 `POST /warnings/escalate` 接口的封装函数 |
| 预警列表展示 | 预警记录展示中新增"已升级"标识、原始等级、升级时间字段 |

---

## 三、禁止修改确认

本次修订严格遵循 Sprint7 冻结基线，未对以下冻结项进行任何修改：

| 冻结项 | 修订前状态 | 修订后状态 | 说明 |
|--------|------------|------------|------|
| 员工风险模型 | Sprint6.1 冻结版 | ✅ 未修改 | 仅引用计算结果，未改公式、权重、扣分规则 |
| 考核模型 v1.1 | v1.1 | ✅ 未修改 | 仅引用考核结果，未改考核维度、权重、红黄牌规则 |
| 岗位风险权重 | 冻结版 | ✅ 未修改 | 不涉及 |
| 指标字典 | v1.1 | ✅ 未修改 | 仅引用指标计算结果，未改指标定义 |
| 组织权限模型 | Sprint6.1 版 | ✅ 未修改 | 仅新增 administrator 角色，未改变现有 6 种角色的权限范围与数据范围 |

---

## 四、修订影响文件清单

| 文件路径 | 变更类型 | 说明 |
|----------|----------|------|
| `server/sql/sprint7_warning_center_migration.sql` | 修改 | WR-DRV-001 规则更新（period_months: 12→60、description 文本）+ 新增 4 个升级字段 + 规则版本号写入 v1.1 |
| `server/routes/hse-warning-center.js` | 修改 | WR-DRV-001 扫描逻辑改为 5 年周期 + 新增 administrator 角色权限 + 新增 `POST /warnings/escalate` 升级 API + `/warnings/stats` 增加 escalated_count |
| `安全看板vben/.../api/hse/warning-center.ts` | 修改 | 新增 `EscalationResult` 类型 + 新增 `checkEscalation` 函数 + 预警记录类型新增升级相关字段 |
| `安全看板vben/.../router/routes/modules/hse-advanced.ts` | 修改 | `HseWarningCenter` 路由 `authority` 数组新增 `'administrator'` |

---

## 五、版本管理

### 5.1 规则版本

| 项目 | 说明 |
|------|------|
| 修订前版本 | v1.0 |
| 修订后版本 | v1.1 |
| 版本写入表 | `hse_warning_rule_version` |
| 版本写入方式 | 规则修改时自动生成版本快照 |
| 版本状态流转 | v1.0 → `expired`；v1.1 → `active` |

### 5.2 版本快照存储结构

每次规则修改时，`hse_warning_rule_version` 表自动写入一条记录，包含：

- 规则 ID（rule_id）
- 版本号（version）
- 完整 condition_config 快照
- 完整 action_config 快照
- 变更前状态（previous_status）
- 变更日志（change_log）
- 操作人（operator）
- 变更时间（changed_at）

### 5.3 版本管理约束

- 同一规则同一时间仅允许一个 active 版本
- 历史版本不可删除，仅可查询
- 版本号严格递增，不可回退
- 禁止通过直接修改 `hse_warning_rule_version` 表回滚规则

### 5.4 v1.1 变更日志

```
{
  "version": "v1.1",
  "change_log": [
    "WR-DRV-001 统计周期由 12 个月调整为 5 年滚动周期，与驾驶风险评分公式对齐",
    "新增 administrator 角色（人工班长），权限层级为 grid，支持本网格预警查看、整改任务处理与下发",
    "新增预警升级机制：critical 24h 未处理发送升级提醒，major 48h 未处理升级为 critical"
  ],
  "previous_version": "v1.0",
  "previous_status": "expired",
  "current_status": "active"
}
```

---

**文档版本**：v1.0
**生成日期**：2026 年 7 月
**所属阶段**：HSE Dashboard Sprint7-A-1
**关联文档**：《Sprint7 HSE 智能预警中心设计报告》、《预警规则字典 v1.1》
