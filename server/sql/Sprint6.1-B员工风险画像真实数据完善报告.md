# Sprint6.1-B 员工风险画像真实数据完善报告

## 一、任务概述

本任务为 Sprint6.1-B 阶段，目标是在 Sprint6.1-A 基础框架之上，完善员工风险画像的真实数据展示，实现：

- 员工基础信息
- 组织信息（含组织路径）
- 作业单元信息
- 岗位信息（含别名）
- 责任画像

的完整展示。

## 二、数据链路

员工查询链路严格遵循已有数据模型，禁止新建员工关系表：

```
employee
  ↓ (id)
hse_employee_relation (employee_id → org_unit_id / operation_unit_id / position_id)
  ↓
hse_org_unit (org_name, org_type, org_path)
  ↓
hse_operation_unit (unit_name, unit_type, unit_code)
  ↓
position (name)
  ↓
hse_position_alias (alias_name)
  ↓
hse_responsibility (responsibility_type, grid_level, grid_role, inspection_frequency)
```

## 三、API 优化

### 3.1 接口信息

- **方法**: `GET`
- **路径**: `/api/hse/risk-profile/employee/:employeeId`
- **文件**: `server/routes/hse-risk-profile-base.js`

### 3.2 返回结构

```json
{
  "code": 0,
  "data": {
    "employee": { "id", "employee_code", "name", "gender", "phone", "id_card", "birth_date", "person_type" },
    "organization": { "id", "org_name", "org_type", "org_code", "org_path", "status" },
    "operationUnit": { "id", "unit_name", "unit_type", "unit_code" },
    "position": { "id", "name", "alias" },
    "responsibility": { "responsibility_type", "grid_level?", "grid_role?", "inspection_frequency?" }
  }
}
```

### 3.3 关键优化点

| 优化项 | 说明 |
|--------|------|
| 组织路径 | 返回 `org_path` 完整路径（如 `/宁津项目公司/环卫作业中心/宁城街道作业中心`） |
| 岗位别名 | 通过 `hse_position_alias` 关联返回别名 |
| 责任数据 | 严格来自 `hse_responsibility`，禁止写死 |
| grid_leader | 展示 `grid_level` + `grid_role` + `inspection_frequency` |
| production_manager | 仅展示 `responsibility_type`，不展示网格相关字段 |
| none | 返回 `null` |

## 四、前端页面优化

### 4.1 页面路径

`/hse/risk-profile/employee` → `安全管理系统/src/views/hse-base/RiskProfileBase.vue`

### 4.2 新增卡片

| 卡片 | 内容 |
|------|------|
| 员工信息卡 | 头像、姓名、工号、人员类型、性别、手机号、脱敏身份证号 |
| 组织岗位卡 | 组织路径面包屑、所属组织、组织类型、作业单元（含类型标签）、标准岗位、岗位别名标签 |
| 责任画像卡 | 根据责任类型条件展示：网格长责任 / 生产管理责任 / 非责任岗位 |
| 风险指标占位 | 6个维度（三违/培训/事故/隐患/交通/巡查）待计算状态 |

### 4.3 组织路径展示

将 `org_path` 按 `/` 分割为面包屑形式，当前组织高亮显示：

```
宁津项目公司 → 环卫作业中心 → 宁城街道作业中心(高亮)
```

## 五、验证结果

### 5.1 4个重点场景全部通过

| 测试 | 员工 | 岗位 | 别名 | 责任类型 | 网格等级 | 网格角色 | 巡查频次 |
|------|------|------|------|----------|----------|----------|----------|
| 测试1 | 张万恒 | 乡镇作业中心经理 | 人工片区长 | grid_leader | grid3 | 二级网格长 | 1次/1天 |
| 测试2 | 马金华 | 管理员 | 人工班长 | grid_leader | grid4 | 三级网格长 | 1次/1天 |
| 测试3 | 验证_城区东片片区长 | 环卫作业中心片区长 | 片区长 | production_manager | - | - | - |
| 测试4 | 张风超 | 垃圾转运车驾驶员 | - | none | - | - | - |

### 5.2 数据链路统计

| 指标 | 数值 |
|------|------|
| 员工总数 | 1360 |
| 有组织关联 | 1304 / 1360 (95.9%) |
| 有岗位关联 | 1304 / 1360 (95.9%) |
| grid_leader 责任 | 121 |
| production_manager 责任 | 8 |

## 六、约束遵守情况

| 约束项 | 状态 |
|--------|------|
| 未修改 employee 表 | ✅ |
| 未修改 employee_assignment 表 | ✅ |
| 未修改 hse_responsibility 表 | ✅ |
| 未新增人员表 | ✅ |
| 未新增依赖 | ✅ |
| 未修改权限框架 | ✅ |
| 未修改 Vben 核心目录 | ✅ |

## 七、交付物

| 文件 | 说明 |
|------|------|
| `server/routes/hse-risk-profile-base.js` | 后端 API |
| `安全管理系统/src/views/hse-base/RiskProfileBase.vue` | 前端页面 |
| `安全管理系统/src/api/hse-risk-profile.ts` | API 客户端 |
| `server/sql/Sprint6.1-B员工风险画像真实数据完善报告.md` | 本报告 |
| `server/sql/员工画像责任展示验证报告.md` | 责任展示验证 |
| `server/sql/API优化测试报告.md` | API 测试报告 |

## 八、结论

Sprint6.1-B 任务已完成。员工风险画像真实数据展示功能已完善，4个重点场景验证全部通过，数据链路完整，约束全部遵守。
