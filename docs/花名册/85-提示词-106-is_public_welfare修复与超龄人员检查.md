# 提示词-106：花名册导入 is_public_welfare 硬编码修复 + 超龄人员模块检查

## 背景

员工档案模块（提示词-101~105）已完成归档。归档报告中标注了 3 项残留事项，其中 **`is_public_welfare` 导入时硬编码为 `false`** 是最直接影响数据质量的：所有通过花名册导入创建的员工，`is_public_welfare` 永远为 `false`，详情页"是否公益岗"字段始终显示"否"。

同时，"人员管理"菜单下还有**超龄人员**模块尚未验证，需要检查其与花名册的数据交互是否正常。

## 影响范围

| 层级 | 文件 | 改动类型 |
|------|------|---------|
| 后端 | `server/routes/hse-employee-import-v2.js` 第 1037 行附近 | 修复 `is_public_welfare` 硬编码 |
| 前端 | `安全看板vben/apps/web-antd/src/views/hse/employee/over-age/index.vue` | 仅检查，发现问题才改 |
| 后端 | `server/routes/over-age-personnel.js` | 仅检查，发现问题才改 |

> **约束**：本次仅修复 `is_public_welfare` 硬编码 + 检查超龄人员模块。禁止修改菜单、路由、其他业务模块。

---

## Task 1：修复 is_public_welfare 硬编码（P1）

### 1.1 根因

`server/routes/hse-employee-import-v2.js` 第 1037 行，`INSERT INTO employee` 时 `is_public_welfare` 硬编码为 `false`：

```js
[..., false, null]  // is_public_welfare = false, id_address = null
```

### 1.2 修复方案

**方案 A（推荐）**：从 Excel 数据中读取"是否公益岗"列。

#### 步骤 1：在 `ROSTER_HEADER_MAP` 中增加字段映射

在 `server/routes/hse-employee-import-v2.js` 第 34-48 行的 `ROSTER_HEADER_MAP` 中添加：

```js
'是否公益岗': 'is_public_welfare',
```

#### 步骤 2：在 `HEADER_ALIASES` 中增加别名

在第 50-69 行的 `HEADER_ALIASES` 中添加：

```js
'公益岗': '是否公益岗',
'公益岗位': '是否公益岗',
```

#### 步骤 3：在 `parseExcelRow` 中处理该字段

在第 119 行附近（`is_driver` 解析之后），增加：

```js
if (result.is_public_welfare !== undefined) {
  const v = String(result.is_public_welfare).trim().toLowerCase();
  result.is_public_welfare = ['是', 'true', '1', 'yes', 'y'].includes(v);
}
```

#### 步骤 4：修改 INSERT 语句

将第 1037 行的 `false` 改为 `p.is_public_welfare || false`：

```js
[..., p.is_public_welfare || false, null]
```

#### 步骤 5：更新 Excel 模板（可选）

在花名册导入模板下载接口中，确认模板包含"是否公益岗"列。若模板通过 `download-template` 端点生成，需同步更新。

### 1.3 验证

1. 准备测试 Excel，包含"是否公益岗"列（值为"是"或"否"）
2. 导入后查询 `employee` 表：`SELECT name, is_public_welfare FROM employee WHERE name = '测试姓名'`
3. 确认 `is_public_welfare` 值与 Excel 一致
4. 员工档案详情页"是否公益岗"字段显示正确

---

## Task 2：检查超龄人员模块

### 2.1 检查点

1. **列表页字段显示**：超龄人员列表页各列是否正常显示（姓名、年龄、身份证号、岗位、所属组织等）
2. **与花名册数据交互**：超龄人员列表的数据来源是否与花名册导入一致（`employee` 表 + `employee_assignment` 表）
3. **筛选/搜索功能**：搜索、筛选是否正常
4. **详情页**：点击超龄人员详情是否正常展示
5. **字段映射**：是否存在与员工档案类似的 `camelKeys` 键名不匹配问题

### 2.2 检查方法

1. 访问超龄人员页面 → 确认列表有数据
2. 检查浏览器 Network 面板 → 确认 API 返回的字段名是否与前端 dataIndex 匹配
3. 对比后端 `over-age-personnel.js` 的 SQL 查询 → 确认是否使用 `camelKeys()` 或直接返回 snake_case
4. 如有问题，在最小范围内修复（优先改后端，不改前端）

### 2.3 验证

- 超龄人员列表：所有列正常显示数据
- 搜索/筛选：功能正常
- 详情（如有）：信息完整

---

## Task 3：回归验证

### 3.1 员工档案回归
确认提示词-101~104 的修复未被破坏：
- 列表页：11 列正常显示
- 详情页：基础信息 + 组织信息 + 任职历史 + 驾驶员信息正常
- 搜索/筛选/分页正常

### 3.2 花名册导入回归
- 导入新员工 → 确认 `is_public_welfare` 正确写入
- 导入已有员工 → 确认更新逻辑不影响 `is_public_welfare`

### 3.3 构建验证
```bash
cd f:\hse-dashboard\安全看板vben
pnpm run build:antd
```
确认 exit code 为 0。

---

## 修改清单

| 文件:行号 | 旧 | 新 |
|-----------|-----|-----|
| `hse-employee-import-v2.js:34-48` | `ROSTER_HEADER_MAP` 无 is_public_welfare | 增加 `'是否公益岗': 'is_public_welfare'` |
| `hse-employee-import-v2.js:50-69` | `HEADER_ALIASES` 无公益岗别名 | 增加 `'公益岗'`、`'公益岗位'` |
| `hse-employee-import-v2.js:119` | 无 is_public_welfare 解析 | 增加布尔值解析 |
| `hse-employee-import-v2.js:1037` | `false` | `p.is_public_welfare \|\| false` |
| （可能）`over-age-personnel.js` | 待检查 | 待定 |

---

## 注意事项

1. **端口**：后端运行在 5800
2. **is_public_welfare 修复仅对新导入生效**：历史已导入员工的 `is_public_welfare` 仍为 `false`，回填不在此范围
3. **超龄人员模块**：仅检查报告，发现问题最小修复，不重构
4. **若超龄人员模块无问题**：在验证报告中标注"检查通过，无字段映射问题"，无需修改代码