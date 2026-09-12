# TRAE Step 11：前端录入字段打通 + 回填脚本安全加固

> **对应阶段**: Phase 2 · Step 11（Sprint D 功能修复第二步）  
> **执行时间**: 2026-07-28  
> **执行环境**: 开发环境（dev）  
> **前置**: Step 10 已完成后端写入时解析回填外键 + 回填脚本就绪  
> **铁律**: dev 环境；不得修改迁移 SQL 与 hse_employee_org；签字栏留空，TRAE 不代签。

---

## 一、环境与权限

| 项 | 值 |
|---|---|
| 执行环境 | dev（development） |
| 前端框架 | Vue 3 + Ant Design Vue（Vben Admin） |
| 后端 | Node.js + Express + PostgreSQL |
| 修改范围 | 前端 4 个组件 + API 类型定义 + 回填脚本 |
| 禁止修改 | Sprint-B-v2.1-Production-Package 下的 .sql / hse_employee_org 相关对象 |

---

## 二、前端改动

### 2.1 三违前端：新增 violator_id_card 字段

#### 2.1.1 API 类型定义

**文件**: [api/hse/violations.ts](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/api/hse/violations.ts)

```diff
  violatorName?: string;
  violatorId?: number;
+ violatorIdCard?: string;   // L18: 新增可选字段
  inspectorName?: string;
```

#### 2.1.2 表单组件

**文件**: [views/violations/index.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/violations/index.vue)

**模板 — 新增输入框（L258-266）**:

```html
<Col :span="12">
  <FormItem label="违章人身份证号" name="violatorIdCard">
    <Input
      v-model:value="violationForm.violatorIdCard"
      placeholder="可选；未选择人员时用于自动关联"
      :maxlength="18"
    />
  </FormItem>
</Col>
```

位置：紧接"违章人员" EmployeeSelector 之后。

**响应式表单状态（L543）**:

```diff
  violatorId: null as number | null,
+ violatorIdCard: '',
  inspectorId: null as number | null,
```

**handleCreate 重置（L876）**:

```diff
  violatorId: null,
+ violatorIdCard: '',
  inspectorId: null,
```

**handleEdit 回填（L901）**:

```diff
  violatorId: record.violatorId || null,
+ violatorIdCard: (record as any).violatorIdCard || '',
  inspectorId: record.inspectorId || null,
```

**handleSave 提交 payload（L956）**:

```diff
  violatorId: violationForm.violatorId,
+ violatorIdCard: violationForm.violatorIdCard || undefined,
  inspectorId: violationForm.inspectorId,
```

> **设计说明**: `violatorIdCard` 为可选字段。当用户通过 EmployeeSelector 选择了人员时，`violatorId` 已有值，后端 `resolveViolatorId` 直接返回该值，`violatorIdCard` 仅存储但不参与解析。当用户未选择人员但填写了身份证号时，后端用 `hashSensitive(violatorIdCard)` 匹配 `employee.id_card_hash` 自动解析。

### 2.2 培训前端：新增 idCard 字段

#### 2.2.1 调查结论

| 表单 | 是否已传 id_card | 是否已传 employeeId | 处理方式 |
|------|-----------------|-------------------|---------|
| 培训台账 (ledger) | ❌ 未传 | ✅ 已传（EmployeeSelector） | employeeId 已直接关联，无需 id_card |
| 驾驶员实操 (driver) | ❌ 未传 | ❌ 未传 | **新增 idCard 字段** |
| 新员工培训 (new-employee) | ❌ 未传 | ❌ 未传 | **新增 idCard 字段** |

> **证据**: Grep 检索 `id_card|idCard` 在 `views/training/` 目录下无匹配。Ledger 表单 [handleSave L650](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/training/ledger/index.vue) 发送 `employeeId`，后端 `resolveEmployeeId` 优先使用 `existingEmployeeId`，id_card 仅作降级。

#### 2.2.2 API 类型定义

**文件**: [api/hse/training.ts](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/api/hse/training.ts)

```diff
  export interface LedgerItem {
    id: number;
    employeeId?: number;
    trainerId?: number;
+   idCard?: string;          // L128: 新增可选字段
    name: string;
```

#### 2.2.3 驾驶员实操表单

**文件**: [views/training/driver/index.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/training/driver/index.vue)

**模板 — 新增输入框（L120-124）**:

```html
<Col :span="12">
  <FormItem label="身份证号" name="idCard">
    <Input v-model:value="driverForm.idCard" placeholder="可选；用于自动关联员工档案" :maxlength="18" />
  </FormItem>
</Col>
```

**响应式状态（L264）**: `idCard: ''`  
**handleSave payload（L448）**: `idCard: driverForm.idCard || undefined`

#### 2.2.4 新员工培训表单

**文件**: [views/training/new-employee/index.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/training/new-employee/index.vue)

**模板 — 新增输入框（L123-127）**:

```html
<Col :span="12">
  <FormItem label="身份证号" name="idCard">
    <Input v-model:value="recordForm.idCard" placeholder="可选；用于自动关联员工档案" :maxlength="18" />
  </FormItem>
</Col>
```

**响应式状态（L302）**: `idCard: ''`  
**handleSave payload（L531）**: `idCard: recordForm.idCard || undefined`

---

## 三、后端 guard diff

**文件**: [server/scripts/backfillEmployeeId.cjs](file:///F:/hse-dashboard/server/scripts/backfillEmployeeId.cjs)

**新增代码（L217-235）**:

```javascript
// Step 11 生产安全硬拦截: production 环境且非 dry-run 时禁止执行 UPDATE
if (process.env.NODE_ENV === 'production' && !isDryRun) {
  console.error('');
  console.error('╔══════════════════════════════════════════════════════════╗');
  console.error('║  ⚠️  生产环境安全拦截                                       ║');
  console.error('║  检测到 NODE_ENV=production 且未指定 --dry-run             ║');
  console.error('║  回填脚本禁止直接对生产库执行 UPDATE！                      ║');
  console.error('║                                                            ║');
  console.error('║  如需在生产环境执行回填：                                    ║');
  console.error('║  1. 先以 --dry-run 模式预估可回填数量                       ║');
  console.error('║  2. DBA 签字确认后，临时移除 NODE_ENV 或联系运维执行        ║');
  console.error('╚══════════════════════════════════════════════════════════╝');
  console.error('');
  process.exit(1);
}

if (process.env.NODE_ENV === 'production' && isDryRun) {
  console.log('⚠️ 生产环境 DRY RUN 模式：仅查询，不执行 UPDATE');
}
```

---

## 四、验证结果

### 4.1 脚本三态验证

| # | 测试条件 | 预期行为 | 实际结果 | exit code |
|---|---------|---------|---------|-----------|
| (a) | `NODE_ENV=production`，无 `--dry-run` | 中止，打印警告 | ✅ 打印安全拦截框，不执行 UPDATE | **1** |
| (b) | `NODE_ENV=production`，有 `--dry-run` | 允许运行（仅查询） | ✅ 打印"生产环境 DRY RUN"，执行查询，不执行 UPDATE | **0** |
| (c) | `NODE_ENV=development`（默认），无 `--dry-run` | 正常执行 | ✅ 执行查询 + UPDATE（dev 0 匹配，无数据变更） | **0** |

**测试 (a) 输出摘要**:
```
║  ⚠️  生产环境安全拦截                                       ║
║  检测到 NODE_ENV=production 且未指定 --dry-run             ║
║  回填脚本禁止直接对生产库执行 UPDATE！                      ║
EXIT_CODE=1
```

**测试 (b) 输出摘要**:
```
⚠️ 生产环境 DRY RUN 模式：仅查询，不执行 UPDATE
=== 培训记录回填 ===
[DRY RUN] 不执行 UPDATE
=== 三违记录回填 ===
[DRY RUN] 不执行 UPDATE
EXIT_CODE=0
```

**测试 (c) 输出摘要**:
```
环境: development
模式: 实际执行
培训记录: {"matched":0,"unmatched":100,"nameMatched":0,"nameAmbiguous":0,"total":100}
三违记录: {"matched":0,"ambiguous":0,"noName":673,"total":890}
EXIT_CODE=0
```

### 4.2 前端字段验证

| 组件 | 字段 | 渲染位置 | 提交 payload | 验证方式 |
|------|------|---------|-------------|---------|
| violations/index.vue | violatorIdCard | L258-266 FormItem | L956 handleSave | 代码审查确认 |
| training/driver/index.vue | idCard | L120-124 FormItem | L448 handleSave | 代码审查确认 |
| training/new-employee/index.vue | idCard | L123-127 FormItem | L531 handleSave | 代码审查确认 |
| training/ledger/index.vue | employeeId（已有） | EmployeeSelector | L650 handleSave | 已有，无需改动 |

> **注**: 前端 dev 服务器启动验证未执行（需手动启动 `pnpm dev` 并打开浏览器）。代码层已确认字段绑定（v-model）、表单状态声明（reactive）、提交 payload 组装（handleSave data 对象）三处一致。

---

## 五、证据索引

| 结论 | 证据位置 |
|------|---------|
| 三违 API 类型已加 violatorIdCard | [api/hse/violations.ts:18](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/api/hse/violations.ts) |
| 三违表单已加 violatorIdCard 输入框 | [views/violations/index.vue:258-266](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/violations/index.vue) |
| 三违表单状态已声明 violatorIdCard | [views/violations/index.vue:543](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/violations/index.vue) |
| 三违 handleSave 已发送 violatorIdCard | [views/violations/index.vue:956](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/violations/index.vue) |
| 培训 API 类型已加 idCard | [api/hse/training.ts:128](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/api/hse/training.ts) |
| 培训 ledger 表单已传 employeeId（无需 idCard） | [views/training/ledger/index.vue:650](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/training/ledger/index.vue) |
| 培训 driver 表单已加 idCard | [views/training/driver/index.vue:120-124,264,448](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/training/driver/index.vue) |
| 培训 new-employee 表单已加 idCard | [views/training/new-employee/index.vue:123-127,302,531](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/training/new-employee/index.vue) |
| 回填脚本生产硬拦截代码 | [scripts/backfillEmployeeId.cjs:217-235](file:///F:/hse-dashboard/server/scripts/backfillEmployeeId.cjs) |
| 脚本三态验证 (a) prod 无 dry-run → exit 1 | 本文档 §四.1 测试 (a) |
| 脚本三态验证 (b) prod + dry-run → exit 0 | 本文档 §四.1 测试 (b) |
| 脚本三态验证 (c) dev 默认 → exit 0 | 本文档 §四.1 测试 (c) |
| 后端 violations.js 已支持 violatorIdCard | [routes/violations.js:532,610,615,660](file:///F:/hse-dashboard/server/routes/violations.js) (Step 10) |
| 后端 training.js 已支持 id_card 解析 | [routes/training.js:375,377,379,381](file:///F:/hse-dashboard/server/routes/training.js) (Step 10) |

---

## 六、遗留 / 需决策项

| # | 遗留项 | 影响 | 建议 |
|---|--------|------|------|
| 1 | 前端 dev 服务器未启动验证（浏览器渲染） | 字段渲染未端到端验证 | 建议开发者启动 `pnpm dev` 后打开三违/培训表单确认 |
| 2 | violation_records 673 条无 violator_name 且无 id_card | 永久无法自动关联 | 业务流程改造，需现场补录违规人身份信息 |
| 3 | 培训 ledger 表单使用 EmployeeSelector 直接传 employeeId | idCard 对 ledger 冗余 | 无需改动，employeeId 优先级高于 idCard |
| 4 | 生产回填仍需 DBA 门控 | 回填时机受限 | 等 Sprint B 迁移完成 + DBA 签字 |

---

## 七、修改文件清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| [api/hse/violations.ts](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/api/hse/violations.ts) | 修改 | +1 行：violatorIdCard 字段 |
| [views/violations/index.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/violations/index.vue) | 修改 | +10 行：表单字段+状态+重置+回填+提交 |
| [api/hse/training.ts](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/api/hse/training.ts) | 修改 | +1 行：idCard 字段 |
| [views/training/driver/index.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/training/driver/index.vue) | 修改 | +5 行：表单字段+状态+提交 |
| [views/training/new-employee/index.vue](file:///F:/hse-dashboard/安全看板vben/apps/web-antd/src/views/training/new-employee/index.vue) | 修改 | +5 行：表单字段+状态+提交 |
| [scripts/backfillEmployeeId.cjs](file:///F:/hse-dashboard/server/scripts/backfillEmployeeId.cjs) | 修改 | +19 行：生产环境硬拦截 |
| docs/TRAE-Step11-前端打通与脚本加固.md | 新建 | 本文档 |

> ⚠️ 未修改任何迁移 SQL（Sprint-B-v2.1-Production-Package 下的 .sql）和 hse_employee_org 相关对象。

---

## 八、签字栏

> ⚠️ **禁止代签**：以下签字栏需由相关角色人工签字。TRAE 不代签任何角色。

| 角色 | 姓名 | 签字 | 日期 | 意见 |
|------|------|------|------|------|
| 前端开发 | | | | |
| 后端开发 | | | | |
| DBA | | | | |

---

**文档结束。**
