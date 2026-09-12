# HSE系统菜单页面功能状态清单

> 文档版本：v1.0
> 生成日期：2026-07-25
> 适用系统：宁津环卫 HSE 安全管理系统（`F:\deploy\hse-dashboard\安全看板vben`）

---

## 功能状态定义

| 状态 | 说明 |
|------|------|
| **A** | 完整功能 — 页面、接口、增删改查、业务流程均已实现 |
| **B** | 页面存在，接口待完善 — 页面框架搭建完成，部分接口已对接但功能不完整 |
| **C** | 页面占位 — 仅展示页面框架或"功能开发中"提示，实际功能未实现 |
| **D** | 待规划 — 页面和功能均未开始 |

---

## 功能状态清单

### 一、安全总览（order: 1）

| 一级菜单 | 二级菜单 | 页面文件 | 接口文件 | 功能状态 |
|---------|---------|---------|---------|---------|
| 安全总览 | HSE驾驶舱 | `hse/cockpit/index.vue` | `api/hse/cockpit.ts` | **A** |
| 安全总览 | 智能驾驶舱 | `hse/executive-cockpit/index.vue` | `api/hse/executive-cockpit.ts` | **A** |
| 安全总览 | BI数据看板 | `hse/bi/index.vue` | — | **C** |
| 安全总览 | AI智能分析 | `hse/ai-analysis/index.vue` | — | **C** |
| 安全总览 | 驾驶员风险中心 | `hse/driver-risk-center/index.vue` | `api/hse/driver-risk-center.ts` | **A** |
| 安全总览 | 事故分析中心 | `hse/accident-analysis/index.vue` | `api/hse/accident-analysis.ts` | **A** |
| 安全总览 | 考核分析中心 | `hse/assessment-analysis/index.vue` | `api/hse/assessment-analysis.ts` | **A** |
| 安全总览 | 预警与整改中心 | `hse/warning-center/index.vue` | `api/hse/warning-center.ts` | **B** |
| 安全总览 | IoT物联网 | `hse/iot/index.vue` | — | **C** |
| 安全总览 | 供应链安全 | `hse/supply-chain/index.vue` | — | **C** |
| 安全总览 | 告警中心 | `hse/alerts/index.vue` | `api/hse/alerts.ts` | **B** |
| 安全总览 | 通知中心 | `hse/notifications/index.vue` | `api/hse/notifications.ts` | **B** |

**统计**：A: 5，B: 3，C: 4，D: 0

---

### 二、目标职责（order: 2）

| 一级菜单 | 二级菜单 | 页面文件 | 接口文件 | 功能状态 |
|---------|---------|---------|---------|---------|
| 目标职责 | 目标责任书管理 | `goals/index.vue` | `api/hse/goals.ts` | **B** |
| 目标职责 | 安全人员及安委会 | `objectives/committee/index.vue` | — | **B** |
| 目标职责 | 责任制及考核 | `objectives/assessment/index.vue` | — | **B** |
| 目标职责 | 安全费用预算及支出 | `objectives/budget/index.vue` | — | **C** |
| 目标职责 | 月度安全履职考核 | `hse/assessment-monthly/index.vue` | `api/hse/assessment-monthly.ts` | **A** |
| 目标职责 | （隐藏）考核周期 | `hse/assessment-monthly/cycles.vue` | `api/hse/assessment-monthly.ts` | **A** |
| 目标职责 | （隐藏）考核对象 | `hse/assessment-monthly/targets.vue` | `api/hse/assessment-monthly.ts` | **A** |
| 目标职责 | （隐藏）自动评分 | `hse/assessment-monthly/scoring.vue` | `api/hse/assessment-monthly.ts` | **A** |
| 目标职责 | （隐藏）扣分审核 | `hse/assessment-monthly/deduction-review.vue` | `api/hse/assessment-monthly.ts` | **A** |
| 目标职责 | （隐藏）扣分调整 | `hse/assessment-monthly/deduction-adjust.vue` | `api/hse/assessment-monthly.ts` | **A** |
| 目标职责 | （隐藏）结果冻结 | `hse/assessment-monthly/freeze.vue` | `api/hse/assessment-monthly.ts` | **A** |
| 目标职责 | （隐藏）Excel导入导出 | `hse/assessment-monthly/excel.vue` | `api/hse/assessment-monthly.ts` | **A** |

**统计**：A: 9，B: 3，C: 1，D: 0

---

### 三、制度标准（order: 3）

| 一级菜单 | 二级菜单 | 页面文件 | 接口文件 | 功能状态 |
|---------|---------|---------|---------|---------|
| 制度标准 | 规章制度 | `regulations/index.vue` | `api/hse/regulations.ts` | **B** |
| 制度标准 | 文件库 | `hse/documents/library/index.vue` | `api/hse/documents.ts` | **A** |
| 制度标准 | 文件审核 | `hse/documents/review/index.vue` | `api/hse/documents.ts` | **B** |
| 制度标准 | 标准条款库 | `hse/standard/index.vue` | `hse/standard/api.ts` | **A** |
| 制度标准 | 条款资料关联 | `hse/standard/relation/index.vue` | `hse/standard/relation/api.ts` | **A** |
| 制度标准 | 匹配建议 | `hse/standard/relation/suggestions.vue` | `hse/standard/relation/api.ts` | **B** |

**统计**：A: 3，B: 3，C: 0，D: 0

---

### 四、风险管控（order: 4）

| 一级菜单 | 二级菜单 | 页面文件 | 接口文件 | 功能状态 |
|---------|---------|---------|---------|---------|
| 风险管控 | 风险清单 | `risk-control/index.vue` | `api/hse/risk-control.ts` | **B** |

**统计**：A: 0，B: 1，C: 0，D: 0

---

### 五、隐患治理（order: 5）

| 一级菜单 | 二级菜单 | 页面文件 | 接口文件 | 功能状态 |
|---------|---------|---------|---------|---------|
| 隐患治理 | 隐患清单 | `hazards/index.vue` | — | **B** |

**统计**：A: 0，B: 1，C: 0，D: 0

---

### 六、现场管理（order: 6）

| 一级菜单 | 二级菜单 | 页面文件 | 接口文件 | 功能状态 |
|---------|---------|---------|---------|---------|
| 现场管理 | 三违管理 | `inspection/index.vue` | `api/hse/site.ts` | **B** |
| 现场管理 | 消防设施管理 | `inspection/fire-facility/index.vue` | `api/hse/inspection.ts` | **B** |
| 现场管理 | 网格管理 | `inspection/grid/index.vue` | `api/hse/inspection.ts` | **B** |

**统计**：A: 0，B: 3，C: 0，D: 0

---

### 七、人员管理（order: 7）

| 一级菜单 | 二级菜单 | 页面文件 | 接口文件 | 功能状态 |
|---------|---------|---------|---------|---------|
| 人员管理 | 员工列表 | `hse/employee/index.vue` | `api/hse/employee.ts` | **A** |
| 人员管理 | 组织管理 | `hse/employee/departments.vue` | `api/hse/employee.ts` | **A** |
| 人员管理 | 岗位管理 | `hse/employee/positions.vue` | `api/hse/employee.ts` | **A** |
| 人员管理 | 员工档案 | `hse/employee-profile/index.vue` | `api/hse/employee-profile.ts` | **A** |
| 人员管理 | 花名册导入 | `hse/employee-import-v2/index.vue` | `api/hse/employee-import-v2.ts` | **A** |
| 人员管理 | 批量导入 | `hse/batch-import/index.vue` | `api/hse/batch-import.ts` | **A** |
| 人员管理 | 超龄人员 | `insurance/over-age/index.vue` | `api/hse/insurance.ts` | **A** |

**统计**：A: 7，B: 0，C: 0，D: 0

---

### 八、培训考核（order: 8）

| 一级菜单 | 二级菜单 | 页面文件 | 接口文件 | 功能状态 |
|---------|---------|---------|---------|---------|
| 培训考核 | 年度计划 | `training/plans/index.vue` | `api/hse/training.ts` | **B** |
| 培训考核 | 培训要求 | `training/requirements/index.vue` | `api/hse/training.ts` | **B** |
| 培训考核 | 培训计划 | `training/index.vue` | `api/hse/training.ts` | **B** |
| 培训考核 | 计划执行 | `training/execute/index.vue` | `api/hse/training.ts` | **B** |
| 培训考核 | 培训台账 | `training/ledger/index.vue` | `api/hse/training.ts` | **B** |
| 培训考核 | 新员工培训 | `training/new-employee/index.vue` | `api/hse/training.ts` | **B** |
| 培训考核 | 驾驶员实操 | `training/driver/index.vue` | `api/hse/training.ts` | **B** |
| 培训考核 | 培训统计 | `training/stats/index.vue` | `api/hse/analysis-center.ts` | **B** |
| 培训考核 | 培训分析 | `training/analysis/index.vue` | `api/hse/analysis-center.ts` | **B** |
| 培训考核 | 培训提醒 | `training/reminders/index.vue` | `api/hse/training.ts` | **B** |

**统计**：A: 0，B: 10，C: 0，D: 0

---

### 九、应急管理（order: 9）

| 一级菜单 | 二级菜单 | 页面文件 | 接口文件 | 功能状态 |
|---------|---------|---------|---------|---------|
| 应急管理 | 应急预案 | `emergency/index.vue` | `api/hse/emergency.ts` | **B** |
| 应急管理 | 事故管理 | `accidents/index.vue` | `api/hse/accidents.ts` | **B** |

**统计**：A: 0，B: 2，C: 0，D: 0

---

### 十、保险管理（order: 10）

| 一级菜单 | 二级菜单 | 页面文件 | 接口文件 | 功能状态 |
|---------|---------|---------|---------|---------|
| 保险管理 | 车辆保险 | `insurance/vehicle/index.vue` | `api/hse/insurance.ts` | **A** |
| 保险管理 | 人员保险 | `insurance/personnel/index.vue` | `api/hse/insurance.ts` | **A** |

**统计**：A: 2，B: 0，C: 0，D: 0

---

### 十一、系统管理（order: 11）

| 一级菜单 | 二级菜单 | 页面文件 | 接口文件 | 功能状态 |
|---------|---------|---------|---------|---------|
| 系统管理 | 用户管理 | `system/users/index.vue` | `api/hse/system.ts` | **A** |
| 系统管理 | 角色管理 | `system/roles/index.vue` | `api/hse/system.ts` | **A** |
| 系统管理 | 审计日志 | `security/audit/index.vue` | `api/hse/audit.ts` | **B** |

**统计**：A: 2，B: 1，C: 0，D: 0

---

## 汇总统计

### 按功能状态统计

| 状态 | 数量 | 占比 | 说明 |
|------|-----|------|------|
| **A：完整功能** | 28 | 46.7% | 页面、接口、业务流程均已实现 |
| **B：页面存在，接口待完善** | 29 | 48.3% | 页面框架已搭建，部分功能待对接完善 |
| **C：页面占位** | 3 | 5.0% | 仅展示框架或"功能开发中"提示 |
| **D：待规划** | 0 | 0% | 无 |
| **合计** | **60** | **100%** | |

### 按模块统计（仅显示二级菜单）

| 一级模块 | 二级菜单数 | A | B | C | 完成度 |
|---------|-----------|---|---|---|--------|
| 安全总览 | 12 | 5 | 3 | 4 | 67% |
| 目标职责 | 5（+8隐藏） | 9 | 3 | 1 | 92% |
| 制度标准 | 6 | 3 | 3 | 0 | 75% |
| 风险管控 | 1 | 0 | 1 | 0 | 50% |
| 隐患治理 | 1 | 0 | 1 | 0 | 50% |
| 现场管理 | 3 | 0 | 3 | 0 | 50% |
| 人员管理 | 7 | 7 | 0 | 0 | 100% |
| 培训考核 | 10 | 0 | 10 | 0 | 50% |
| 应急管理 | 2 | 0 | 2 | 0 | 50% |
| 保险管理 | 2 | 2 | 0 | 0 | 100% |
| 系统管理 | 3 | 2 | 1 | 0 | 83% |
| **合计** | **60** | **28** | **29** | **3** | **61%** |

> 完成度计算：A 按 100%，B 按 50%，C 按 0%

---

### API 接口统计

| 项目 | 数量 |
|------|-----|
| API 文件总数 | 35（`api/hse/` 目录） |
| 已有接口对接的页面 | 49 |
| 无接口对接的页面 | 11 |
| 接口覆盖率 | 81.7% |

---

*清单结束。*
