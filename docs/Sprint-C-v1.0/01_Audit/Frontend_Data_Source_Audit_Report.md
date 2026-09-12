# Sprint-C Step 3：前端数据源检查报告

> **报告版本**: v1.0
> **编制日期**: 2026-07-28
> **项目**: Sprint-C v1.0 人员中心新模型稳定化与旧模型治理
> **审计范围**: Vue/Vben 前端 API、Store、Types、Components
> **扫描路径**: `安全看板vben/apps/web-antd/src/`

---

## 一、审计概述

本报告检查前端代码对旧模型（hse_employee_relation、hse_employee_org）的依赖情况，确认前端是否直接引用旧表，评估迁移影响。

**扫描结果概要**：
- 前端 **未直接引用** `hse_employee_relation` 或 `hse_employee_org` 表名
- 前端通过 **4 个 API 函数** 间接依赖后端对旧表的操作
- 员工档案模块已使用 `employee_assignment`（通过 `v_employee_current` 视图）
- **无 legacy store**、**无 legacy types**

---

## 二、前端 API 层依赖分析

### 2.1 API 定义文件

| 文件 | 路径 | 说明 |
|------|------|------|
| employee.ts | `src/api/hse/employee.ts` | 员工模块 API 定义 |

### 2.2 涉及旧模型的 API 函数

| # | 函数名 | 行号 | API 路径 | 后端依赖 | 风险 |
|---|--------|------|---------|---------|------|
| 1 | `getEmployeeOrg(employeeId)` | 413 | `GET /org/employee/:id` | 后端 SELECT hse_employee_org | Medium |
| 2 | `getEmployeeOrgHistory(employeeId)` | 418 | `GET /org/employee/:id/history` | 后端 SELECT hse_employee_org | Medium |
| 3 | `assignOrg(data)` | 425 | `POST /org/assign` | 后端 INSERT/UPDATE hse_employee_org | **High** |
| 4 | `updateOrgStatus(orgId, data)` | 430 | `PUT /org/:id/status` | 后端 UPDATE hse_employee_org | **High** |

### 2.3 API 函数被引用情况

| 函数 | 引用文件 | 使用方式 |
|------|---------|---------|
| `getEmployeeOrg` | **无引用** | 仅在 API 文件中定义，无组件调用 |
| `getEmployeeOrgHistory` | **无引用** | 仅在 API 文件中定义，无组件调用 |
| `assignOrg` | `views/hse/employee/components/OrgTransferModal.vue:84,219` | **实际使用**：调岗弹窗提交 |
| `updateOrgStatus` | **无引用** | 仅在 API 文件中定义，无组件调用 |

**关键发现**：`assignOrg` 是唯一被前端实际调用的旧模型 API 函数。其余 3 个函数（`getEmployeeOrg`、`getEmployeeOrgHistory`、`updateOrgStatus`）均已定义但未被任何组件引用，属于"死代码"。

---

## 三、前端组件依赖分析

### 3.1 使用旧模型 API 的组件

| 组件 | 路径 | 使用的 API | 功能 |
|------|------|-----------|------|
| OrgTransferModal.vue | `views/hse/employee/components/OrgTransferModal.vue` | `assignOrg` | 员工调岗弹窗 |

**OrgTransferModal.vue 分析**：
- 功能：员工调岗/组织分配
- 表单字段：目标部门（team_id）、岗位、生效日期、变更原因、备注
- 调用方式：`assignOrg(payload)` → `POST /org/assign`
- 提交载荷：`{ employee_id, team_id, position_id, start_date, change_reason, remark }`
- 后端需接收 5 级组织结构参数（group/region/enterprise/project/team），但前端仅传递 `team_id`

### 3.2 引用新模型的组件

| 组件 | 路径 | 数据来源 | 说明 |
|------|------|---------|------|
| employee-profile/index.vue | `views/hse/employee-profile/index.vue` | `employee + employee_assignment` (v_employee_current) | 已使用新模型 |

### 3.3 已清理的旧引用

| 关键词 | 扫描结果 | 说明 |
|--------|---------|------|
| `employeeRelation` | 无匹配 | 已清理 |
| `employeeOrg` | 仅在 API 定义中 | 仅函数名，非表名引用 |
| `hse_employee_relation` | 无匹配 | 已清理 |
| `hse_employee_org` | 无匹配 | 已清理 |
| `legacy` | 无匹配 | 无 legacy store |

---

## 四、前端数据流向图

```
用户操作 → OrgTransferModal.vue
              │
              ├── 加载部门树: getDeptTree() → GET /departments/tree
              ├── 加载岗位列表: getPositionList() → GET /positions/list
              │
              └── 提交调岗: assignOrg() → POST /org/assign
                                              │
                                              ▼
                                    后端 hse-employee.js
                                              │
                                              ▼
                                    INSERT/UPDATE hse_employee_org  ← 旧模型
```

**迁移后目标**：
```
用户操作 → OrgTransferModal.vue
              │
              └── 提交调岗: assignOrg() → POST /org/assign
                                              │
                                              ▼
                                    后端 hse-employee.js (重构后)
                                              │
                                              ▼
                                    INSERT/UPDATE employee_assignment  ← 新模型
```

---

## 五、前端迁移影响评估

### 5.1 无影响项

| # | 描述 | 原因 |
|---|------|------|
| 1 | `getEmployeeOrg` 函数 | 无组件调用，后端迁移后可安全删除 |
| 2 | `getEmployeeOrgHistory` 函数 | 无组件调用，后端迁移后可安全删除 |
| 3 | `updateOrgStatus` 函数 | 无组件调用，后端迁移后可安全删除 |
| 4 | employee-profile 模块 | 已使用 employee_assignment |

### 5.2 有影响项

| # | 描述 | 影响范围 | 应对措施 |
|---|------|---------|---------|
| 1 | `OrgTransferModal.vue` 中的 `assignOrg` 调用 | 员工调岗功能 | 保持前端 API 调用不变，后端实现切换到新模型 |
| 2 | API 类型定义 `EmployeeApi.OrgAssignFormData` | employee.ts | 需确认新模型是否兼容 `team_id` 传递方式 |

### 5.3 风险评估

| 风险 | 等级 | 描述 |
|------|------|------|
| 接口契约变更 | Low | 前端仅传递 `team_id` + `position_id` + `start_date`，不涉及 5 级组织字段，接口契约可保持 |
| 前端组件改动 | Low | 仅 1 个组件涉及旧模型（OrgTransferModal），其余已完成迁移 |
| 类型定义变更 | Low | `EmployeeApi` 类型定义可复用，只需后端适配 |

---

## 六、结论

### 6.1 前端依赖总结

| 维度 | 状态 | 详情 |
|------|------|------|
| 直接引用旧表 | ✅ 无 | 前端未直接引用 hse_employee_relation 或 hse_employee_org |
| 间接依赖旧模型 | ⚠️ 存在 | 4 个 API 函数通过后端间接依赖旧表 |
| 实际使用的旧 API | ⚠️ 1 个 | 仅 `assignOrg` 被实际调用 |
| 已清理的 legacy 代码 | ✅ 完成 | 无 legacy store、legacy types、legacy components |
| 已迁移到新模型 | ✅ 部分 | employee-profile 已使用 employee_assignment |

### 6.2 关键结论

1. **前端迁移成本极低**：仅 1 个组件（OrgTransferModal）涉及旧模型 API 调用
2. **接口契约可保持**：前端 API 路径和参数结构不需要变更
3. **3 个"死代码"API 可清理**：`getEmployeeOrg`、`getEmployeeOrgHistory`、`updateOrgStatus` 无组件调用
4. **员工档案模块已完成迁移**：employee-profile 已使用 employee_assignment

### 6.3 下一步行动

1. **后端完成迁移后**：前端 `assignOrg` 调用自动适配，无需修改
2. **可选清理**：删除 `getEmployeeOrg`、`getEmployeeOrgHistory`、`updateOrgStatus` 三个未使用的 API 函数
3. **保持监控**：后端迁移后验证调岗功能正常工作

---

> **报告结束**
>
> 本报告基于 2026-07-28 前端代码扫描结果。前端对旧模型的依赖极少，主要迁移工作集中在后端。
