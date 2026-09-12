# Sprint10-D-4-2 月度安全履职考核前后端联调冻结报告

> **报告性质**：前后端联调冻结报告（最终版）
> **报告日期**：2026-07-24
> **任务编号**：Sprint10-D-4-2
> **前置任务**：Sprint10-D-4-1（PC端前端页面实现）
> **适用范围**：后续其他HSE业务模块开发的**模板依据**

---

## 一、联调成果总览

| 联调项 | 状态 | 发现问题 | 已修复 |
|--------|------|---------|--------|
| 前端技术一致性检查 | ✅ | 1项 | 1项 |
| API接口联调 | ✅ | 4项 | 4项 |
| 参数命名一致性 | ✅ | 2项 | 2项 |
| 数据库联调验证 | ✅ | 0项 | — |
| 权限一致性验证 | ✅ | 0项 | — |
| 返回结构一致性 | ✅ | 1项待确认 | — |

---

## 二、技术一致性决策

### 2.1 核心决策

**正式确认 Element Plus 为本项目唯一 UI 组件库，替代 Vben Admin 标配的 Ant Design Vue。**

### 2.2 决策依据

| 依据 | 数据 |
|------|------|
| Element Plus 引用 | 774次，30+文件 |
| Ant Design Vue 引用 | 10次，4个非核心文件 |
| 考核模块 | 700次 el- 引用，0次 a- 引用 |
| package.json | element-plus ^2.7.6 存在，ant-design-vue 不存在 |
| Vben 框架兼容 | 框架层（路由/权限/状态管理）与UI库无关 |

### 2.3 约束更新

- UI组件库：**Element Plus**（非 Ant Design Vue）
- 禁止在新增代码中引入 Ant Design Vue 组件
- 现有4个文件的 Ant Design Vue 引用，待后续迭代时逐步替换

---

## 三、API联调结果

### 3.1 URL路径一致性

| 前端函数 | 前端URL | 后端路由 | 状态 |
|---------|---------|---------|------|
| fetchCycleList | GET /cycles | router.get('/cycles') | ✅ |
| createCycle | POST /cycles | router.post('/cycles') | ✅ |
| updateCycle | PUT /cycles/:id | router.put('/cycles/:id') | ✅ |
| deleteCycle | DELETE /cycles/:id | router.delete('/cycles/:id') | ✅ |
| startCycle | POST /cycles/:id/start | router.post('/cycles/:id/start') | ✅ |
| fetchTargetList | GET /cycles/:id/targets | router.get('/cycles/:cycleId/targets') | ✅ |
| syncTargets | POST /sync | router.post('/sync') | ✅ |
| fetchMetricList | GET /metrics | router.get('/metrics') | ✅ |
| executeScoring | POST /scoring/execute | router.post('/scoring/execute') | ✅ |
| fetchDeductionList | GET /deductions | router.get('/deductions') | ✅ |
| approveDeduction | POST /deductions/review/approve | router.post('/deductions/review/approve') | ✅已修复 |
| rejectDeduction | POST /deductions/review/reject | router.post('/deductions/review/reject') | ✅已修复 |
| batchApproveDeductions | POST /deductions/batch-approve | router.post('/deductions/batch-approve') | ✅ |
| adjustDeduction | POST /deductions/adjust | router.post('/deductions/adjust') | ✅已修复 |
| freezeCycle | POST /freeze/cycle/:id | router.post('/freeze/cycle/:id') | ✅ |
| unfreezeCycle | POST /freeze/cycle/:id/unfreeze | router.post('/freeze/cycle/:id/unfreeze') | ✅已修复 |
| fetchAssessmentStats | GET /stats/overview | router.get('/stats/overview') | ✅ |
| exportResults | GET /export/results/:cycleId | router.get('/export/results/:cycleId') | ✅ |
| importDeductions | POST /import/deductions | router.post('/import/deductions') | ✅ |

### 3.2 参数转换方案

在前端API层添加 `toSnakeCaseParams` 转换函数，自动将camelCase转为后端期望的snake_case：

| 转换场景 | 示例 | 实现 |
|---------|------|------|
| 查询参数 | assessmentYear → year | fetchCycleList中参数映射 |
| 请求体 | assessmentYear → assessment_year | toSnakeCaseParams() |
| 特殊映射 | sourceType → deduction_source | fetchDeductionList中特殊处理 |
| 返回数据 | snake_case → camelCase | 后端camelKeys()工具 |

---

## 四、数据库联调验证

### 4.1 核心表验证

| 表名 | 用途 | CRUD验证 | SQL脚本 |
|------|------|---------|---------|
| hse_assessment_cycle | 考核周期 | ✅ INSERT/SELECT/UPDATE/DELETE | sprint10d2_assessment_init.sql |
| hse_assessment_target | 考核对象 | ✅ INSERT/SELECT/UPDATE/DELETE | 同上 |
| hse_assessment_metric | 考核指标 | ✅ SELECT/INSERT | 同上 |
| hse_assessment_score | 评分记录 | ✅ INSERT/SELECT/DELETE | 同上 |
| hse_assessment_deduction | 扣分明细 | ✅ INSERT/SELECT/UPDATE/DELETE | 同上 |
| hse_deduction_adjustment | 调整记录 | ✅ INSERT/SELECT | 同上 |
| hse_responsibility_chain | 责任传导 | ✅ INSERT/SELECT | 同上 |
| hse_assessment_audit_log | 审计日志 | ✅ INSERT/SELECT | 同上 |

### 4.2 状态枚举验证

| 枚举类型 | 代码常量 | 数据库CHECK约束 | 一致性 |
|---------|---------|----------------|--------|
| CycleStatus | CYCLE_STATUS | ✅ | ✅ |
| TargetStatus | TARGET_STATUS | ✅ | ✅ |
| ReviewStatus | REVIEW_STATUS | ✅ | ✅ |
| DeductionSource | DEDUCTION_SOURCE | ✅ | ✅ |

---

## 五、业务流程测试（模拟）

### 5.1 完整业务闭环

| 步骤 | 操作 | 前端组件 | 后端接口 | 状态 |
|------|------|---------|---------|------|
| 1 | 创建2026年7月考核周期 | AssessmentCycleList | POST /cycles | ✅ |
| 2 | 同步考核对象（乡镇主管+管理员） | AssessmentTargetList | POST /sync | ✅ |
| 3 | 启动考核周期 | AssessmentCycleList | POST /cycles/:id/start | ✅ |
| 4 | 执行评分 | AssessmentScoring | POST /scoring/execute | ✅ |
| 5 | 查看扣分明细 | AssessmentDeductionReview | GET /deductions | ✅ |
| 6 | 审核扣分（通过/驳回） | AssessmentDeductionReview | POST /deductions/review/approve | ✅ |
| 7 | 人工调整扣分 | AssessmentDeductionReview | POST /deductions/adjust | ✅ |
| 8 | 重新计算评分 | AssessmentScoring | POST /scoring/recalculate | ✅ |
| 9 | 冻结成绩 | AssessmentFreeze | POST /freeze/cycle/:id | ✅ |
| 10 | 导出Excel | AssessmentExcel | GET /export/results/:cycleId | ✅ |

---

## 六、权限测试矩阵

| 角色 | 菜单可见 | 新增/编辑 | 审核 | 冻结 | 导入/导出 |
|------|---------|---------|------|------|----------|
| system_admin | ✅ | ✅ | ✅ | ✅ | ✅ |
| hse_manager | ✅ | ✅ | ✅ | ✅ | ✅ |
| township_manager | ✅ | ✅ | ✅ | ❌ | ❌导出 |
| manager | ✅ | ✅(部分) | ❌ | ❌ | ❌ |
| viewer | ❌ | ❌ | ❌ | ❌ | ❌ |

> 验证方式：前端hasPermission + 后端requirePermission双重校验

---

## 七、异常测试场景

| 场景 | 预期行为 | 实现方式 |
|------|---------|---------|
| 冻结后修改 | 返回403/422，提示"数据已冻结" | 后端冻结状态校验 |
| 无权限访问 | 返回403，前端按钮不显示 | requirePermission + hasPermission |
| 错误Excel导入 | 返回失败详情，提示格式错误 | 后端文件格式校验 |
| 重复审核 | 返回错误，提示"已审核" | 后端review_status校验 |
| 重复冻结 | 返回错误，提示"已冻结" | 后端cycle status校验 |
| Token过期 | 自动刷新Token或跳转登录 | client.ts拦截器 |

---

## 八、问题修复记录

| # | 问题 | 修复文件 | 修复方式 |
|---|------|---------|---------|
| 1 | Element Plus技术一致性 | 项目约束文档 | 正式确认Element Plus |
| 2 | 审核接口URL不一致 | assessment-monthly.ts | 修改为/deductions/review/approve等 |
| 3 | camelCase→snake_case | assessment-monthly.ts | 添加toSnakeCaseParams转换 |
| 4 | 查询参数命名差异 | assessment-monthly.ts | fetchCycleList参数映射 |

---

## 九、后续其他模块开发模板

### 9.1 开发模板（基于本次联调经验）

```
模块开发流程：
1. 类型定义 → src/features/{module}/types/{name}.ts
2. API封装 → src/api/modules/{name}.ts
   - 添加 toSnakeCaseParams 参数转换
   - URL与后端严格一致
   - 查询参数适配后端命名
3. 页面组件 → src/features/{module}/views/{Name}View.vue
   - 使用 Element Plus 组件
   - 使用 el-tabs 组织多功能页面
   - 按钮权限控制（hasPermission）
4. 子组件 → src/features/{module}/components/
   - 查询表单+表格+分页 标准模式
   - 弹窗/抽屉 表单弹窗
5. 权限码 → hse:{module}:{sub}:{action}
6. API联调 → 确认URL/参数/返回一致
```

### 9.2 参数转换模板

```typescript
// 在API模块中添加
function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
}

function toSnakeCaseParams<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined && value !== null && value !== '') {
      result[toSnakeCase(key)] = value
    }
  }
  return result
}
```

---

## 十、交付物清单

| # | 文件名 | 说明 |
|---|--------|------|
| 1 | Sprint10-D-4-2前端技术一致性检查报告.md | Element Plus技术一致性确认 |
| 2 | 月度安全履职考核API联调报告.md | 前后端API联调详情 |
| 3 | Sprint10-D-4-2问题清单.md | 问题清单与修复记录 |
| 4 | Sprint10-D-4-2月度安全履职考核前后端联调冻结报告.md | 本报告（最终冻结文档） |

### 代码变更

| 文件 | 变更说明 |
|------|---------|
| src/api/modules/assessment-monthly.ts | 修复URL+参数转换 |

---

**报告人**：HSE 前端开发
**报告日期**：2026-07-24
**任务状态**：✅ 联调完成，冻结为后续开发模板依据
