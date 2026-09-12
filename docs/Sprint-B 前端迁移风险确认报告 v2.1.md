# Sprint-B 前端迁移风险确认报告（v2.1）

> **版本**: v1.0
> **分析日期**: 2026-07-28
> **分析范围**: OrgTransferModal.vue、employee.ts
> **分析目标**: 确认旧字段业务含义，给出修改建议

---

## 一、OrgTransferModal.vue 分析

### 1.1 team_id 使用位置

| 行号 | 代码 | 上下文 |
|------|------|--------|
| L22 | `v-model:value="form.team_id"` | 模板绑定：目标部门选择器 |
| L116 | `team_id?: number;` | 类型定义：form 接口 |
| L121 | `team_id: undefined,` | 初始值：表单初始化 |
| L200 | `if (!form.value.team_id)` | 校验：部门必填检查 |
| L213 | `team_id: form.value.team_id,` | 提交：payload 组装 |
| L238 | `team_id: undefined,` | 重置：表单重置 |

### 1.2 team_id 业务含义分析

#### 数据来源追踪

```typescript
// L168: 部门树数据来源
const data = await getDeptTree();
deptTree.value = data || [];  // DeptNode[]

// L139-145: 转换为 TreeSelect 格式
const item = {
    value: node.id,        // DeptNode.id → TreeSelect.value
    title: node.short_name || node.name,
};
```

#### 业务流程

```
用户操作: 选择目标部门
    ↓
组件: a-tree-select (v-model:value="form.team_id")
    ↓
数据绑定: form.team_id = DeptNode.id
    ↓
提交: payload.team_id → API assignOrg(payload)
    ↓
后端: 接收 team_id，写入员工组织关系
```

#### 字段映射分析

**team_id 代表的业务含义**：
- 用户选择的是"目标部门"（组件 label="目标部门"）
- 数据来源是部门树（DeptNode），每个节点代表一个部门/组织单元
- DeptNode.id 对应数据库中的部门ID

**hse_employee_relation 表结构对应**：
- `org_unit_id`：组织单元ID（部门）—— **主要对应字段**
- `operation_unit_id`：作业单元ID（可选，更细粒度的工作位置）

### 1.3 修改建议

#### ✅ 推荐方案：team_id → org_unit_id

**理由**：
1. **语义准确**：team_id 代表"部门"，对应 org_unit_id（组织单元）
2. **数据一致**：DeptNode.id 对应 hse_org_unit.id
3. **后端兼容**：assignOrg API 已支持 org_unit_id

**修改清单**：

```typescript
// 1. 类型定义修改（L116）
const form = ref<{
  org_unit_id?: number;  // 改名：team_id → org_unit_id
  position_id?: number;
  change_reason: string;
  remark?: string;
}>({
  org_unit_id: undefined,  // 改名
  position_id: undefined,
  change_reason: '调岗',
  remark: '',
});

// 2. 模板绑定修改（L22）
<a-tree-select
  v-model:value="form.org_unit_id"  // 改名
  :tree-data="deptTreeData"
  placeholder="请选择目标部门"
  ...
/>

// 3. 校验修改（L200）
if (!form.value.org_unit_id) {  // 改名
  message.warning('请选择目标部门');
  return;
}

// 4. 提交修改（L213）
const payload: EmployeeApi.OrgAssignFormData = {
  employee_id: props.employeeId,
  org_unit_id: form.value.org_unit_id,  // 改名
  position_id: form.value.position_id,
  start_date: startDate.value.format('YYYY-MM-DD'),
  change_reason: form.value.change_reason,
  remark: form.value.remark,
};

// 5. 重置修改（L238）
form.value = {
  org_unit_id: undefined,  // 改名
  position_id: undefined,
  change_reason: '调岗',
  remark: '',
};
```

#### ⚠️ 可选增强：增加 operation_unit_id

**适用场景**：
- 需要更细粒度的工作位置信息（如：某个班组、工位）
- hse_employee_relation 表中 operation_unit_id 有数据

**实现方式**：
- 增加"作业单元"下拉框（可选）
- 数据来源：根据 org_unit_id 查询关联的 hse_operation_unit

---

## 二、employee.ts 分析

### 2.1 旧字段清单

#### EmployeeDetail.org 接口（L55-64）

| 行号 | 字段 | 类型 | 说明 | 是否需清理 |
|------|------|------|------|-----------|
| L55 | `group_id?: number;` | 群组ID | 旧组织模型字段 | ✅ 需清理 |
| L56 | `group_name?: string;` | 群组名称 | 旧组织模型字段 | ✅ 需清理 |
| L57 | `region_id?: number;` | 区域ID | 旧组织模型字段 | ✅ 需清理 |
| L58 | `region_name?: string;` | 区域名称 | 旧组织模型字段 | ✅ 需清理 |
| L59 | `enterprise_id?: number;` | 企业ID | 旧组织模型字段 | ✅ 需清理 |
| L60 | `enterprise_name?: string;` | 企业名称 | 旧组织模型字段 | ✅ 需清理 |
| L61 | `project_id?: number;` | 项目ID | 旧组织模型字段 | ✅ 需清理 |
| L62 | `project_name?: string;` | 项目名称 | 旧组织模型字段 | ✅ 需清理 |
| L63 | `team_id?: number;` | 班组ID | 旧组织模型字段 | ✅ 需清理 |
| L64 | `team_name?: string;` | 班组名称 | 旧组织模型字段 | ✅ 需清理 |

#### OrgAssignFormData 接口（L168-172）

| 行号 | 字段 | 类型 | 说明 | 是否需清理 |
|------|------|------|------|-----------|
| L168 | `group_id?: number;` | 群组ID | 调岗表单字段 | ✅ 需清理 |
| L169 | `region_id?: number;` | 区域ID | 调岗表单字段 | ✅ 需清理 |
| L170 | `enterprise_id?: number;` | 企业ID | 调岗表单字段 | ✅ 需清理 |
| L171 | `project_id?: number;` | 项目ID | 调岗表单字段 | ✅ 需清理 |
| L172 | `team_id?: number;` | 班组ID | 调岗表单字段 | ✅ 需清理 |

### 2.2 修改建议

#### ✅ 推荐方案：替换为新字段

**保留字段**：
- `org_unit_id?: number;` —— 组织单元ID（对应原 team_id）
- `org_unit_name?: string;` —— 组织单元名称
- `operation_unit_id?: number;` —— 作业单元ID（可选）
- `operation_unit_name?: string;` —— 作业单元名称（可选）

**删除字段**：
- `group_id`, `group_name`
- `region_id`, `region_name`
- `enterprise_id`, `enterprise_name`
- `project_id`, `project_name`
- `team_id`, `team_name`

**修改后接口**：

```typescript
export interface EmployeeDetail extends EmployeeItem {
  org?: {
    id: number;
    org_path?: string;
    position_id?: number;
    position_name?: string;
    start_date?: string;
    status?: OrgStatus;
    supervisor_id?: number;
    // 新字段
    org_unit_id?: number;
    org_unit_name?: string;
    operation_unit_id?: number;
    operation_unit_name?: string;
  } | null;
}

export interface OrgAssignFormData {
  employee_id: number;
  // 新字段
  org_unit_id?: number;
  operation_unit_id?: number;
  position_id?: number;
  start_date: string;
  supervisor_id?: number;
  change_reason?: string;
  remark?: string;
}
```

---

## 三、全项目旧字段扫描

### 3.1 扫描结果

**已确认需修改的文件**：
1. `OrgTransferModal.vue` —— team_id 残留
2. `employee.ts` —— 5 个旧字段残留

**已确认无需修改的文件**：
1. `EmployeeSelector.vue` —— 已使用 org_unit_id
2. `employee-selector.ts` —— 已使用 org_unit_id/operation_unit_id

### 3.2 扫描命令

```bash
# 全项目扫描
grep -r "team_id\|group_id\|region_id\|enterprise_id\|project_id" \
  --include="*.vue" --include="*.ts" --include="*.js" \
  F:\hse-dashboard\安全看板vben\apps\web-antd\src

# 排除已确认文件
grep -r "team_id\|group_id" \
  --include="*.vue" --include="*.ts" \
  F:\hse-dashboard\安全看板vben\apps\web-antd\src \
  | grep -v "OrgTransferModal.vue" \
  | grep -v "employee.ts"
```

---

## 四、修改优先级与风险评估

### 4.1 优先级矩阵

| 文件 | 字段 | 风险等级 | 修改难度 | 优先级 |
|------|------|---------|---------|--------|
| OrgTransferModal.vue | team_id | 🟡 中 | 低（全局替换） | P1 |
| employee.ts | 5 个旧字段 | 🟡 中 | 低（类型定义） | P1 |

### 4.2 风险评估

#### OrgTransferModal.vue 风险

| 风险项 | 影响 | 缓解措施 |
|--------|------|---------|
| API 不兼容 | 调岗功能失败 | 确认后端 assignOrg API 支持 org_unit_id |
| 数据丢失 | 历史调岗记录无法查询 | 数据迁移时已将 team_id 映射到 org_unit_id |
| 用户界面异常 | 部门选择器显示错误 | 测试部门树加载功能 |

#### employee.ts 风险

| 风险项 | 影响 | 缓解措施 |
|--------|------|---------|
| 类型错误 | TypeScript 编译失败 | 修改后重新编译 |
| API 响应不兼容 | 前端解析失败 | 确认后端 API 已返回新字段 |
| 其他组件依赖 | 引用旧字段的组件报错 | 全项目扫描确认无其他依赖 |

---

## 五、修改执行清单

### 5.1 OrgTransferModal.vue 修改步骤

```
□ Step 1: 全局替换 team_id → org_unit_id
   - 使用编辑器全局替换功能
   - 确认 6 处全部替换成功

□ Step 2: 验证编译
   - 运行 npm run type-check
   - 确认无 TypeScript 错误

□ Step 3: 验证功能
   - 启动前端开发服务器
   - 打开调岗弹窗，选择部门
   - 确认提交成功，无报错
```

### 5.2 employee.ts 修改步骤

```
□ Step 1: 修改 EmployeeDetail.org 接口
   - 删除 group_id/group_name
   - 删除 region_id/region_name
   - 删除 enterprise_id/enterprise_name
   - 删除 project_id/project_name
   - 删除 team_id/team_name
   - 新增 org_unit_id/org_unit_name
   - 新增 operation_unit_id/operation_unit_name

□ Step 2: 修改 OrgAssignFormData 接口
   - 删除 group_id/region_id/enterprise_id/project_id/team_id
   - 新增 org_unit_id/operation_unit_id

□ Step 3: 验证编译
   - 运行 npm run type-check
   - 确认无 TypeScript 错误

□ Step 4: 验证 API
   - 测试员工列表查询
   - 测试调岗功能
   - 确认无报错
```

---

## 六、最终建议

### 6.1 修改结论

| 项目 | 结论 |
|------|------|
| team_id 业务含义 | **部门/组织单元**，对应 org_unit_id |
| 修改方案 | **team_id → org_unit_id**（全局替换） |
| 是否需增加 operation_unit_id | **可选**，视业务需求决定 |
| employee.ts 旧字段清理 | **必须清理**，删除 5 个旧字段 |

### 6.2 修改后验证

```
□ 前端编译通过（npm run type-check）
□ 调岗功能正常（选择部门 → 提交成功）
□ 员工列表查询正常
□ 员工详情显示正常
□ 无控制台报错
```

---

> **报告结束**
>
> OrgTransferModal.vue 的 team_id 应映射到 org_unit_id，employee.ts 的 5 个旧字段应全部清理。建议在迁移后统一修改前端代码，确保与新数据模型兼容。