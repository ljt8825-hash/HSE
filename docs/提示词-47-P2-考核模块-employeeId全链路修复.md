# 提示词 47：P2 考核模块 — employeeId 全链路修复 + EmployeeName 统一

> 编号：提示词-47
> 日期：2026-07-30
> 状态：待执行
> 前置：提示词-46 语义确认报告 ✅（`考核模块-语义确认与修复方案.md`）
> 关联：`跨模块-人员字段模式统一审计报告.md`（§2.8）、`提示词-46-P2-考核模块语义确认.md`

---

## 0. 背景

语义确认报告结论：考核模块的「考核对象」确认为**个人（员工）**，适用 EmployeeName 统一模式。但实勘发现两个问题须一并修复：

1. **写入链路完全失效**：前端 camelCase 字段名（`person/year/quarter/score/level`）与后端 snake_case 列名（`employee_name/period_year/period_quarter/score_total/grade`）无映射，`b[k]` 动态透传直接报 SQL 错误，导致表恒为 0 行。
2. **employeeId 全链路未启用**：数据库 `employee_id` 列存在，后端 `SELECT *` 已返回，但前端类型/表单/详情从未使用。

**目标**：修复写入链路（字段名映射）+ 补全 employeeId 全链路 + 展示层 EmployeeName 统一。三合一。

---

## 1. 现状总结

| 层次 | 当前状态 | 应改为 |
|------|---------|--------|
| 前端表单 | `<Input v-model="person">` 纯文本 | `<EmployeeSelector v-model:employeeId>` + @change 同步 person/position/department |
| 前端提交 | camelCase `person/year/quarter/score/level` | 经映射层转为 snake_case，并增 `employeeId` |
| 后端接收 | 动态 `b[k]` 无映射，SQL 直接报错 | 参照 goals 处理（L939-981）增加映射层 |
| 前端 API 类型 | `AssessmentItem` 无 `employeeId` | 补 `employeeId?: number \| null` |
| 前端详情/列表 | `person` 文本 | EmployeeName + 文本兜底 |

---

## 2. 任务 A：后端修复 — 字段名映射层

### 2.1 修改文件：`server/routes/objectives.js`

**位置**：`responsibilities` 的 POST/PUT 处理（约 L461-485），在 `b[k]` 动态透传前增加映射。

**参照**：同文件 `goals` 处理（L939-981）已有显式映射 `responsiblePerson→responsible_person`、`responsiblePersonId→responsible_person_id`。

```diff
  // responsibilities POST/PUT —— 在 b[k] 透传前增加映射
+ // camelCase → snake_case 映射（前端字段 → 数据库列）
+ const FIELD_MAP = {
+   person: 'employee_name',
+   year: 'period_year',
+   quarter: 'period_quarter',
+   score: 'score_total',
+   level: 'grade',
+   employeeId: 'employee_id',
+   employeeNo: 'employee_no',
+   position: 'position',
+   department: 'department',
+   orgUnitId: 'org_unit_id',
+   status: 'status',
+   remark: 'remark',
+ };
+
+ // 映射字段名
+ const mapped = {};
+ for (const [k, v] of Object.entries(body)) {
+   if (v === undefined) continue;
+   const dbCol = FIELD_MAP[k] || k;  // 已映射或直通
+   mapped[dbCol] = v;
+ }
+
+ // 使用 mapped 替代原 body 做动态 SQL
```

### 2.2 验证

- `node --check server/routes/objectives.js` 语法通过
- 实时冒烟：`POST /api/objectives/responsibilities` 含 `person`/`year`/`quarter`/`score`/`level`/`employeeId` → HTTP 200，数据正确写入 `employee_name`/`period_year`/`period_quarter`/`score_total`/`grade`/`employee_id`
- 实时冒烟：`GET /api/objectives/responsibilities` → 返回含 `employee_id` 字段
- 回归：`goals` 的 POST/PUT 不受影响（仅改 responsibilities 区块）

---

## 3. 任务 B：前端 API 类型补全

### 3.1 修改文件：`src/api/hse/goals.ts`

> 注意：考核模块的 API 类型在 `goals.ts` 的 `AssessmentApi` 命名空间，非 `assessment.ts`（`assessment.ts` 是考核分析系统，不相关）。

```diff
  export interface AssessmentItem {
    id: number;
    person: string;
+   /** 被考核人员工 ID */
+   employeeId?: number | null;
+   /** 员工编号 */
+   employeeNo?: string;
+   /** 岗位 */
+   position?: string;
    department: string;
    year: number;
    quarter: number;
    score: number;
    level: string;
    status: string;
    remark: string;
    // ... rest ...
  }
```

---

## 4. 任务 C：前端表单 + 展示层切换

### 4.1 修改文件：`src/views/objectives/assessment/index.vue`

#### 4.1.1 导入

```typescript
// 新增导入
import EmployeeSelector from '#/components/hse/EmployeeSelector.vue';
import { EmployeeName } from '#/composables/hse';
```

#### 4.1.2 表单字段声明

```diff
  const assessmentForm = reactive({
    // ... existing fields ...
+   employeeId: undefined as number | undefined,
    person: '',
    department: '',
    year: new Date().getFullYear(),
    quarter: 1,
    score: 0,
    level: '',
    status: 'pending',
    remark: '',
    // ... rest ...
  });
```

#### 4.1.3 模板：考核对象切换

```diff
- <FormItem label="考核对象">
-   <Input v-model:value="assessmentForm.person" placeholder="请输入被考核人姓名" />
- </FormItem>
+ <FormItem label="考核对象">
+   <EmployeeSelector
+     v-model:value="assessmentForm.employeeId"
+     placeholder="选择被考核人"
+     @change="onAssessmentPersonChange"
+   />
+ </FormItem>
```

#### 4.1.4 onChange 处理

```typescript
function onAssessmentPersonChange(item: EmployeeSelectorApi.SelectorItem | undefined) {
  assessmentForm.person = item?.name || '';
  assessmentForm.department = item?.org_name || '';
  assessmentForm.position = item?.position_name || '';
}
```

> 选人即自动带出部门、岗位，减少手动填写。

#### 4.1.5 编辑回填

```diff
  // 编辑考核记录时回填
  assessmentForm.employeeId = record.employeeId ?? undefined;
  assessmentForm.person = record.person || '';
  assessmentForm.department = record.department || '';
  assessmentForm.position = record.position || '';
```

#### 4.1.6 重置表单

```diff
  function resetAssessmentForm() {
    // ... existing resets ...
    assessmentForm.employeeId = undefined;
    assessmentForm.person = '';
    assessmentForm.department = '';
    assessmentForm.position = '';
  }
```

#### 4.1.7 保存提交

```diff
  const data = {
    // ... existing fields ...
    employeeId: assessmentForm.employeeId,
    person: assessmentForm.person,
    department: assessmentForm.department,
    position: assessmentForm.position,
    year: assessmentForm.year,
    quarter: assessmentForm.quarter,
    score: assessmentForm.score,
    level: assessmentForm.level,
    status: assessmentForm.status,
    remark: assessmentForm.remark,
  };
```

#### 4.1.8 详情展示切换

```diff
- <DescriptionsItem label="考核对象">{{ currentAssessment.person || '-' }}</DescriptionsItem>
+ <DescriptionsItem label="考核对象">
+   <EmployeeName v-if="currentAssessment.employeeId" :employee-id="currentAssessment.employeeId" />
+   <span v-else>{{ currentAssessment.person || '-' }}</span>
+ </DescriptionsItem>
```

#### 4.1.9 列表列切换

```diff
  <template v-else-if="column.key === 'person'">
-   {{ record.person || '-' }}
+   <EmployeeName v-if="record.employeeId" :employee-id="record.employeeId" />
+   <span v-else>{{ record.person || '-' }}</span>
  </template>
```

---

## 5. 验证清单

### 5.1 后端

- [ ] B-1 `node --check server/routes/objectives.js` 语法通过
- [ ] B-2 `POST /api/objectives/responsibilities` 创建考核记录（含 `employeeId`），`employee_id` 正确写入
- [ ] B-3 `POST` 创建考核记录，`person→employee_name`、`year→period_year`、`score→score_total` 等映射全部正确
- [ ] B-4 `GET /api/objectives/responsibilities` 返回含 `employee_id` 字段
- [ ] B-5 `PUT` 更新考核记录，字段映射正确、`employee_id` 正确更新
- [ ] B-6 goals 模块的 POST/PUT 不受影响（回归）

### 5.2 前端

- [ ] F-1 考核对象表单为 EmployeeSelector（非纯文本 Input）
- [ ] F-2 选择被考核人后，`person`/`department`/`position` 自动同步
- [ ] F-3 编辑考核记录时，`employeeId` 正确回填到 EmployeeSelector
- [ ] F-4 详情中考核对象显示为 EmployeeName（有 ID 时可点击）
- [ ] F-5 详情中无 ID 时显示文本兜底
- [ ] F-6 列表列考核对象显示为 EmployeeName + 文本兜底
- [ ] F-7 创建/编辑/删除考核记录功能正常（写入链路修复后）
- [ ] F-8 部门选择器不受影响（回归）
- [ ] F-9 其他字段（年份/季度/分数/等级/状态/备注）不受影响（回归）

### 5.3 红线

- [ ] 不修改路由定义
- [ ] 不修改菜单配置
- [ ] 不修改组件库
- [ ] 不修改数据库结构
- [ ] 不修改其他模块代码
- [ ] 不修改登录代码
- [ ] 不破坏 goals 模块功能（仅改 responsibilities 区块）

---

## 6. 执行顺序

```
1. 任务 A：后端字段名映射层（修复写入链路）
   ↓ 冒烟验证 POST/GET/PUT 全部正确
2. 任务 B：前端 API 类型补全（goals.ts AssessmentItem 增 employeeId）
   ↓
3. 任务 C：前端表单切换（EmployeeSelector）+ 展示层 EmployeeName
   ↓
4. 全链路回归验证（9 项前端 + 6 项后端）
```

---

## 7. 关键注意事项

1. **API 类型文件**：考核模块的真实 API 类型在 `src/api/hse/goals.ts`（`AssessmentApi` 命名空间），非 `assessment.ts`。`assessment.ts` 是考核分析系统，与责任考核无关。

2. **字段名映射参照**：同文件 `objectives.js` 的 goals 处理（L939-981）已有显式映射，responsibilities 区块直接参照该模式即可。

3. **EmployeeSelector 自动带出部门**：选人时 `@change` 回填 `department`/`position`，与表单已有的部门选择器逻辑需协调——若部门选择器为独立字段（非从 EmployeeSelector 派生），保留两个字段独立。

4. **表当前为空**：因写入链路失效，表无任何数据。修复后首次创建即生效，无需处理旧数据兼容。

5. **EmployeeSelector 组件注册**：确认 Vben 组件解析器是否自动注册 `EmployeeSelector`，若未注册需显式 import。

---

## 8. 统一度收口

实施完成后，EmployeeName 覆盖：

| 模块 | 状态 |
|------|------|
| 事故/隐患/应急/三违/目标/培训 | 🟢 6/8 |
| 考核 | 🔲 本次 → 🟢 7/8 |
| 保险 | P2 独立域待评估 |

---

## 9. 范围外（后续独立任务）

| # | 内容 | 优先级 |
|---|------|--------|
| 1 | 保险 over-age personnel↔employee 映射评估 | P2 |
| 2 | FK 补全（training/violations/goals/assessment 缺 FK 约束） | P2 |
| 3 | 全项目 TS 存量错误清零（576 处） | P2 |
| 4 | 回填策略增强 v1.2 | P2 |

---

> 编制：Senior Developer（高级开发工程师）
> 关联文档：`考核模块-语义确认与修复方案.md`、`跨模块-人员字段模式统一审计报告.md`