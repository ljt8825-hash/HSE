# Sprint11-2-A HSE人员管理业务归属修订报告

**报告版本**: v1.0  
**生成日期**: 2026-07-25  
**所属项目**: HSE安全看板系统  
**修订依据**: 《Sprint11-2 HSE系统人员管理业务模块开发完成报告》

---

## 一、超龄人员迁移情况

### 1.1 页面归属调整

| 项目 | 调整前 | 调整后 |
|------|--------|--------|
| **页面路径** | `views/insurance/over-age/index.vue` | `views/hse/employee/over-age/index.vue` |
| **路由路径** | `/insurance/over-age`（引用） | `/personnel/over-age`（人员管理下） |
| **业务归属** | 保险管理模块 | 人员管理模块 |
| **一级菜单** | 保险管理 | 人员管理 |

### 1.2 迁移操作

1. **新建页面文件**：[views/hse/employee/over-age/index.vue](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/employee/over-age/index.vue)
2. **更新路由引用**：[hse-07-personnel.ts](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules/hse-07-personnel.ts#L76-L85) 组件引用路径从 `#/views/insurance/over-age/index.vue` 改为 `#/views/hse/employee/over-age/index.vue`
3. **原文件保留**：`views/insurance/over-age/index.vue` 保留（不主动删除，避免影响其他潜在引用）
4. **API调用保持不变**：继续使用 `#/api/hse/employee` 的超龄识别API

### 1.3 前端页面同步更新

迁移过程中同步更新了以下内容：

- **规则提示文本**：女性阈值从"55岁"更新为"50岁"
- **计算函数提取**：新增 `getGenderThreshold()` 和 `getGenderThresholdText()` 函数，统一阈值展示
- **规则说明动态化**：使用 `computed` 的 `ruleDescription` 动态生成规则描述，显示规则配置文件来源

---

## 二、路由调整

### 2.1 人员管理路由（调整后）

文件：[hse-07-personnel.ts](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules/hse-07-personnel.ts)

```
人员管理 (/personnel)
├── 员工列表        /personnel/employee
├── 组织管理        /personnel/departments
├── 岗位管理        /personnel/positions
├── 员工档案        /personnel/profile
├── 花名册导入      /personnel/import
├── 批量导入        /personnel/batch-import
└── 超龄人员        /personnel/over-age   ← 组件路径已更新
```

### 2.2 保险管理路由（保持不变）

文件：[hse-10-insurance.ts](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules/hse-10-insurance.ts)

```
保险管理 (/insurance)
├── 车辆保险        /insurance/vehicle
└── 人员保险        /insurance/personnel
```

**确认**：保险管理模块下不再包含超龄人员，只保留车辆保险和人员保险两个二级菜单。

---

## 三、菜单调整

### 3.1 菜单结构（最终冻结版）

| 一级菜单 | 二级菜单 | 路由路径 | 业务归属 |
|----------|----------|----------|----------|
| **人员管理** (order:7) | 员工列表 | `/personnel/employee` | 人员管理 |
| | 组织管理 | `/personnel/departments` | 人员管理 |
| | 岗位管理 | `/personnel/positions` | 人员管理 |
| | 员工档案 | `/personnel/profile` | 人员管理 |
| | 花名册导入 | `/personnel/import` | 人员管理 |
| | 批量导入 | `/personnel/batch-import` | 人员管理 |
| | **超龄人员** | `/personnel/over-age` | **人员管理** ✅ |
| **保险管理** (order:10) | 车辆保险 | `/insurance/vehicle` | 保险管理 |
| | 人员保险 | `/insurance/personnel` | 保险管理 |

### 3.2 菜单映射原则

- **禁止调整顺序**：order值保持原样（人员管理order=7，保险管理order=10）
- **禁止修改名称**：所有菜单项标题保持冻结版本
- **禁止新增菜单**：严格按已有结构执行
- 本次修订仅涉及超龄人员的**业务归属和组件路径**

---

## 四、API影响

### 4.1 API模块归属

| API路径 | 所属路由文件 | 业务归属 | 本次变更 |
|---------|-------------|----------|----------|
| `/api/hse/employee/*` | [hse-employee.js](file:///F:/deploy/hse-dashboard/server/routes/hse-employee.js) | 人员管理 | ✅ 规则来源调整 |
| `/api/insurance/overage` | `over-age-personnel.js` | 保险管理（保留兼容） | 无变更 |
| `/api/insurance/*` | `insurance-*.js` | 保险管理 | 无变更 |

### 4.2 超龄识别API规则来源调整

**调整前**：硬编码散落在 [hse-employee.js](file:///F:/deploy/hse-dashboard/server/routes/hse-employee.js) 中，共11处：

```javascript
// 之前的硬编码示例
const OVER_AGE_THRESHOLDS = { '男': 60, '女': 55 };  // 硬编码
// SQL中直接写死数字
(e.gender = '男' AND EXTRACT(YEAR FROM age(e.birth_date))::INT > 60)  // 硬编码
(e.gender = '女' AND EXTRACT(YEAR FROM age(e.birth_date))::INT > 55)  // 硬编码
```

**调整后**：统一从 [config/hseRules/employee-age-rule.json](file:///F:/deploy/hse-dashboard/server/config/hseRules/employee-age-rule.json) 加载

```javascript
// 引入规则
const { getOverAgeThresholds, getEmployeeAgeRule } = require('../config/hseRules');

// 加载配置
const OVER_AGE_THRESHOLDS_CONFIG = getOverAgeThresholds();
const OVER_AGE_THRESHOLDS = {
  '男': OVER_AGE_THRESHOLDS_CONFIG.male || 60,
  '女': OVER_AGE_THRESHOLDS_CONFIG.female || 50,  // 已从55更新为50
};

// 封装为可复用的SQL构建函数
function buildOverAgeCondition(tableAlias = 'e') { ... }
function buildOverAgeYearsExpr(tableAlias = 'e') { ... }
function buildAgeThresholdExpr(tableAlias = 'e') { ... }
```

### 4.3 API测试验证

| 测试项 | 调整前（女>55） | 调整后（女>50） | 验证 |
|--------|----------------|----------------|------|
| 超龄总人数 | 1074 | **1136** | +62人 ✅ |
| 男性超龄 | 460 | 460 | 无变化 ✅ |
| 女性超龄 | 614 | **676** | +62人 ✅ |
| 新增51-55岁 | 0 | **62** | 正好62人 ✅ |
| 阈值配置返回 | `{男:60,女:55}` | `{男:60,女:50}` | 正确 ✅ |
| API状态码 | 200 | 200 | 正常 ✅ |

---

## 五、数据库影响

### 5.1 数据库表保持不变

| 表名 | 用途 | 本次操作 |
|------|------|----------|
| `employee` | 员工主表 | 无变更 ✅ |
| `hse_employee_org` | 员工组织关系表 | 无变更 ✅ |
| `department` | 部门表 | 无变更 ✅ |
| `position` | 岗位表 | 无变更 ✅ |
| `over_age_personnel` | 原超龄人员表 | **保留不使用** ✅ |

**说明**：
- 超龄人员通过实时查询`employee`表的`birth_date`计算，不创建新表
- 原`over_age_personnel`表保留，不主动删除（防止数据丢失）
- 禁止重复创建超龄人员表

### 5.2 规则配置新增

| 文件 | 说明 |
|------|------|
| [config/hseRules/employee-age-rule.json](file:///F:/deploy/hse-dashboard/server/config/hseRules/employee-age-rule.json) | **新增** 员工年龄规则配置 |

### 5.3 规则配置文件结构

```json
{
  "ruleCode": "employeeAgeRule",
  "ageCalculation": {
    "method": "postgres_age_function",
    "sql": "EXTRACT(YEAR FROM age(birth_date))::INT"
  },
  "overAgeThresholds": {
    "male": 60,
    "female": 50,
    "default": 60
  },
  "ageGroups": { ... },
  "autoIdentification": { ... },
  "businessRules": [ ... ],
  "futureUpgrade": {
    "stage1": "配置文件（当前版本）",
    "stage2": "数据库规则表（assessment_rule）",
    "stage3": "规则中心（可视化配置）"
  }
}
```

---

## 六、超龄规则调整

### 6.1 规则变更明细

| 项目 | 原规则 | 新规则 |
|------|--------|--------|
| **男性阈值** | 年龄 > 60岁 | 年龄 > 60岁（无变化） |
| **女性阈值** | 年龄 > 55岁 | **年龄 > 50岁**（下调5岁） |
| **规则来源** | 硬编码（散落11处） | **config/hseRules/employee-age-rule.json**（统一管理） |
| **未来升级路径** | 无 | 配置文件 → 数据库规则表 → 规则中心 |

### 6.2 规则统一入口

文件：[config/hseRules/index.js](file:///F:/deploy/hse-dashboard/server/config/hseRules/index.js)

新增导出函数：

```javascript
// 加载员工年龄规则
function getEmployeeAgeRule() { return hseRules.employeeAgeRule || {}; }

// 获取超龄阈值（最常用）
function getOverAgeThresholds() {
  const rule = hseRules.employeeAgeRule || {};
  return rule.overAgeThresholds || { male: 60, female: 55, default: 60 };
}

module.exports.getEmployeeAgeRule = getEmployeeAgeRule;
module.exports.getOverAgeThresholds = getOverAgeThresholds;
```

### 6.3 SQL构建函数（消除硬编码）

在 [hse-employee.js](file:///F:/deploy/hse-dashboard/server/routes/hse-employee.js) 中封装3个函数：

| 函数 | 用途 | 调用点 |
|------|------|--------|
| `buildOverAgeCondition(alias)` | 构建超龄判断WHERE条件 | auto-list / auto-stats（4处） |
| `buildOverAgeYearsExpr(alias)` | 构建超龄年数计算表达式 | auto-list / auto-detail（2处） |
| `buildAgeThresholdExpr(alias)` | 构建年龄阈值表达式 | auto-detail（1处） |

**效果**：彻底消除SQL中硬编码的`> 60`、`> 55`等数字。

---

## 七、保险模块边界确认

### 7.1 最终业务边界

```
┌─────────────────────────────────────────────────────────┐
│                        人员管理                            │
│  负责：员工基础信息维护                                    │
│  ├── 员工档案（姓名/身份证/出生日期/性别/年龄/...）       │
│  ├── 组织关系（部门/中心/乡镇作业中心/岗位）              │
│  ├── 超龄人员（自动识别，基于员工档案）                   │
│  └── 导入能力（员工批量导入）                              │
└─────────────────────────────────────────────────────────┘
                        ↓ employee_id 关联
┌─────────────────────────────────────────────────────────┐
│                        保险管理                            │
│  负责：保险业务管理                                        │
│  ├── 车辆保险（车辆投保/续保/理赔）                       │
│  └── 人员保险（员工投保/续保/理赔）                       │
│      （通过 employee_id 关联人员档案，不维护人员信息）    │
└─────────────────────────────────────────────────────────┘
```

### 7.2 边界规则

| 规则 | 说明 |
|------|------|
| **人员管理只维护基础信息** | 员工姓名/身份证/出生日期/组织关系等 |
| **人员管理包含超龄识别** | 超龄是人员属性的自动判断，属于人员管理 |
| **保险管理不维护人员信息** | 保险模块只维护保险业务，通过employee_id关联 |
| **禁止跨界维护** | 保险模块不能修改员工基础信息，人员模块不能办理保险 |

### 7.3 保险模块菜单确认

路由文件：[hse-10-insurance.ts](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules/hse-10-insurance.ts)

确认只包含两个二级菜单：
1. **车辆保险**：`/insurance/vehicle`
2. **人员保险**：`/insurance/personnel`

---

## 八、组件规范确认

### 8.1 EmployeeSelector组件规范

| 规范 | 要求 | 本次状态 |
|------|------|----------|
| **基于Ant Design Vue** | Select / TreeSelect / Modal | ✅ 符合 |
| **禁止自建组件库** | 不创建独立的组件库包 | ✅ 符合 |
| **禁止替换Ant Design Vue** | 不使用Element Plus或其他UI库 | ✅ 符合 |
| **禁止自定义基础UI组件** | 不重新实现Button/Input/Table等基础组件 | ✅ 符合 |
| **允许业务封装** | 在业务组件中组合Ant Design Vue组件实现业务逻辑 | ✅ 允许 |

### 8.2 组件封装示例（正确方式）

```typescript
// ✅ 正确：基于Ant Design Vue组合业务逻辑
import { Select, Modal, TreeSelect } from 'ant-design-vue';

// 业务组件：员工选择器
const EmployeeSelector = defineComponent({
  setup() {
    // 使用Ant Design Vue的Select + Modal组合实现
    // 业务逻辑：按组织筛选、按岗位筛选、多选/单选模式等
  }
});
```

### 8.3 本次涉及的组件

| 组件 | 基础组件来源 | 说明 |
|------|-------------|------|
| EmployeeEditModal | Ant Design Vue Modal + Form | 员工编辑弹窗 |
| OrgTransferModal | Ant Design Vue Modal + TreeSelect | 组织调岗弹窗 |
| EmployeeImportModal | Ant Design Vue Modal + Upload | 导入弹窗 |
| ImportButtonGroup | Ant Design Vue Button + Dropdown | 导入按钮组 |

全部基于Ant Design Vue，符合规范。

---

## 九、变更文件清单

| 类型 | 文件路径 | 变更类型 | 说明 |
|------|----------|----------|------|
| **后端配置** | [config/hseRules/employee-age-rule.json](file:///F:/deploy/hse-dashboard/server/config/hseRules/employee-age-rule.json) | ✨ 新增 | 员工年龄规则配置 |
| **后端配置** | [config/hseRules/index.js](file:///F:/deploy/hse-dashboard/server/config/hseRules/index.js) | ✏️ 修改 | 新增规则加载函数 |
| **后端路由** | [routes/hse-employee.js](file:///F:/deploy/hse-dashboard/server/routes/hse-employee.js) | ✏️ 修改 | 规则统一从config加载，女性阈值50 |
| **前端路由** | [hse-07-personnel.ts](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules/hse-07-personnel.ts) | ✏️ 修改 | 组件路径更新 |
| **前端页面** | [views/hse/employee/over-age/index.vue](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/employee/over-age/index.vue) | ✨ 新增 | 迁移后的超龄人员页面 |

**变更统计**：新增2个文件，修改3个文件。

---

## 十、验证结论

| 验证项 | 结果 |
|--------|------|
| 超龄人员页面已迁移到人员管理 | ✅ 通过 |
| 路由组件引用路径已更新 | ✅ 通过 |
| 保险模块只含车辆+人员保险 | ✅ 通过 |
| 规则已进入config/hseRules | ✅ 通过 |
| 女性阈值已从55调整为50 | ✅ 通过（超龄女性+62人） |
| SQL中无硬编码阈值数字 | ✅ 通过（使用函数构建） |
| API测试返回正确阈值 | ✅ 通过（{男:60,女:50}） |
| 组件规范符合要求 | ✅ 通过（全部基于Ant Design Vue） |
| 数据库无重复建表 | ✅ 通过 |

---

**报告结束**

*所有变更已验证通过，等待审核。*
