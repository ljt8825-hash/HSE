# Sprint7-B HSE智能预警中心开发报告

## 一、项目概述

### 1.1 项目背景
本报告为HSE智能预警中心Sprint7-B阶段开发成果总结。基于Sprint7-A-1冻结的预警规则v1.1版本，完成了HSE智能预警中心的全功能开发，实现了从风险自动识别、预警生成、责任分派、整改处理、复核关闭到风险降低的完整HSE闭环管理。

### 1.2 开发目标
- 建设HSE智能预警中心，实现风险自动识别与预警
- 实现10条冻结预警规则的可执行化
- 建立预警升级机制，确保高风险预警及时处置
- 实现整改闭环全流程管理
- 完成与员工风险画像、驾驶员风险中心、事故分析中心、考核分析系统的跨模块联动

### 1.3 冻结版本
| 项目 | 版本 |
|------|------|
| 预警规则版本 | v1.1 |
| 权限模型 | v1.1 |
| 数据库模型 | v1.1 |

---

## 二、开发范围与成果

### 2.1 功能模块清单

| 序号 | 模块名称 | 功能说明 | 完成状态 |
|------|----------|----------|----------|
| 1 | 风险预警中心 | 预警列表、统计、详情、手动扫描 | ✅ 已完成 |
| 2 | 整改任务中心 | 任务创建、下发、处理、提交证明、复核、关闭 | ✅ 已完成 |
| 3 | 整改闭环分析 | 整改率、逾期率、重复风险率、趋势分析 | ✅ 已完成 |
| 4 | 预警规则管理 | 规则CRUD、版本管理、启停控制 | ✅ 已完成 |
| 5 | 预警升级机制 | critical 24h升级通知、major 48h升级为critical | ✅ 已完成 |
| 6 | 定时任务 | 每日预警扫描、每小时升级检查 | ✅ 已完成 |
| 7 | 权限控制 | 5级角色权限体系 | ✅ 已完成 |
| 8 | 跨模块联动 | 跳转员工画像/驾驶中心/事故分析/考核分析 | ✅ 已完成 |

### 2.2 技术栈
- **前端**：Vue 3 + TypeScript + Ant Design Vue + ECharts + Vben Admin v5.7.0
- **后端**：Node.js + Express + PostgreSQL
- **定时任务**：node-cron
- **通知服务**：notificationService

---

## 三、预警规则实现

### 3.1 规则清单（10条）

| 规则编号 | 规则名称 | 来源类型 | 预警等级 | 版本 | 数据来源 |
|----------|----------|----------|----------|------|----------|
| WR-EMP-001 | 高风险员工预警 | employee_risk | critical | v1.0 | employee_risk_snapshot |
| WR-EMP-002 | 风险持续升高员工预警 | employee_risk | major | v1.0 | employee_risk_snapshot |
| WR-DRV-001 | 驾驶证扣分异常预警 | driver_risk | major | v1.1 | license_demerit_records |
| WR-DRV-002 | 交通事故责任人员预警 | driver_risk | major | v1.0 | accidents |
| WR-ACC-001 | 重大事故预警 | accident | critical | v1.0 | accidents |
| WR-ACC-002 | 重复事故预警 | accident | major | v1.0 | accidents |
| WR-ASM-001 | 组织评分下降预警 | assessment | minor | v1.0 | hse_org_unit + 多维度计算 |
| WR-ASM-002 | 红黄牌组织预警 | assessment | major | v1.0 | hse_org_unit + accidents |
| WR-MGT-001 | 网格长巡查不足预警 | management | minor | v1.0 | hse_responsibility + hazard_record |
| WR-MGT-002 | 整改逾期预警 | management | major | v1.0 | rectification_task |

### 3.2 重点规则说明

#### WR-DRV-001 驾驶证扣分异常预警（v1.1修订）
- **周期**：近5年滚动周期（v1.0为12个月）
- **阈值**：累计扣分 ≥ 6分
- **数据来源**：license_demerit_records
- **SQL实现**：`WHERE ldr.demerit_date >= NOW() - INTERVAL '5 years'`

---

## 四、预警升级机制

### 4.1 升级规则

| 初始等级 | 未处理时长 | 升级动作 | 通知方式 |
|----------|-----------|----------|----------|
| critical（重大） | 24小时 | 标记升级，发送升级通知 | 系统通知 |
| major（较大） | 48小时 | 等级升级为critical，发送升级通知 | 系统通知 |
| minor（一般） | - | 暂不升级 | - |
| info（提示） | - | 暂不升级 | - |

### 4.2 升级字段
- `is_escalated`： 是否已升级
- `escalated_at`：升级时间
- `original_level`：原始预警等级
- `escalation_notified`：是否已发送升级通知

### 4.3 定时任务配置
- **预警扫描**：每日凌晨2:00执行（Asia/Shanghai时区）
- **升级检查**：每小时整点执行（Asia/Shanghai时区）

---

## 五、权限体系

### 5.1 角色清单

| 角色编码 | 角色名称 | 权限范围 |
|----------|----------|----------|
| group_leader | 集团领导 | 查看全集团 |
| department_manager | 部门经理 | 查看本部门 |
| township_manager | 乡镇作业中心经理 | 查看本乡镇 |
| area_manager | 片区长 | 查看本片区 |
| administrator | 管理员（人工班长） | 查看本网格 |

### 5.2 权限配置
路由meta.authority已配置包含所有5种角色及admin、safety_manager。

---

## 六、跨模块联动

| 预警类型 | 跳转目标 | 跳转路径 |
|----------|----------|----------|
| 员工风险预警 | 员工风险画像详情 | /hse-advanced/risk-profile/:employeeId |
| 驾驶风险预警 | 驾驶员专项风险中心 | /hse-advanced/driver-risk-center |
| 事故预警 | 事故分析中心 | /hse-advanced/accident-analysis |
| 组织考核预警 | 集团HSE考核分析 | /hse-advanced/assessment-analysis |

---

## 七、核心代码文件

### 7.1 后端
- 主路由：[hse-warning-center.js](file:///f:/deploy/hse-dashboard/server/routes/hse-warning-center.js)
- 数据库迁移：[sprint7_warning_center_migration.sql](file:///f:/deploy/hse-dashboard/server/sql/sprint7_warning_center_migration.sql)

### 7.2 前端
- 主页面：[index.vue](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/warning-center/index.vue)
- API层：[warning-center.ts](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/api/hse/warning-center.ts)
- 路由配置：[hse-advanced.ts](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules/hse-advanced.ts)

---

## 八、约束遵循情况

| 约束项 | 遵循情况 | 说明 |
|--------|----------|------|
| 不修改员工风险模型 | ✅ 遵循 | 仅读取数据，未修改模型 |
| 不修改集团HSE考核模型v1.1 | ✅ 遵循 | 仅读取数据，未修改模型 |
| 不修改指标字典v1.1 | ✅ 遵循 | 未触碰指标字典 |
| 不修改岗位风险权重 | ✅ 遵循 | 未触碰岗位权重 |
| 不修改组织权限模型 | ✅ 遵循 | 仅扩展角色，不修改核心模型 |
| 所有规则读取hse_warning_rule_version | ✅ 遵循 | 规则版本化管理 |
| 不修改Vben核心目录 | ✅ 遵循 | 所有代码在业务目录下 |
| 不引入新依赖（除node-cron外） | ✅ 遵循 | node-cron为定时任务必需 |

---

## 九、总结

Sprint7-B HSE智能预警中心开发任务已全面完成，实现了：
1. **10条预警规则**全部可执行，含WR-DRV-001 v1.1版5年滚动周期
2. **预警升级机制**通过node-cron定时任务自动运行
3. **5级角色权限**体系，administrator权限已配置
4. **整改闭环全流程**：创建→下发→处理→提交证明→复核→关闭
5. **跨模块联动**：可跳转至员工画像、驾驶员风险中心、事故分析、考核分析
6. **5份交付文档**：开发报告、数据库设计、接口文档、页面设计、测试验收报告
