# 月度安全履职考核API联调报告

> **报告日期**：2026-07-24
> **任务编号**：Sprint10-D-4-2

---

## 一、联调概览

| 项目 | 内容 |
|------|------|
| 前端API文件 | src/api/modules/assessment-monthly.ts |
| 后端路由文件 | server/routes/hse-assessment-monthly.js |
| 路由前缀 | /hse/assessment-monthly（app.js第445行确认注册） |
| 前端接口函数数 | 30个 |
| 后端路由数 | 30+个 |

---

## 二、URL路径一致性

| 前端函数 | 前端URL | 后端路由 | 一致性 |
|---------|---------|---------|--------|
| fetchCycleList | GET /cycles | router.get('/cycles') | ✅ |
| fetchCycleDetail | GET /cycles/:id | router.get('/cycles/:id') | ✅ |
| createCycle | POST /cycles | router.post('/cycles') | ✅ |
| updateCycle | PUT /cycles/:id | router.put('/cycles/:id') | ✅ |
| deleteCycle | DELETE /cycles/:id | router.delete('/cycles/:id') | ✅ |
| startCycle | POST /cycles/:id/start | router.post('/cycles/:id/start') | ✅ |
| fetchTargetList | GET /cycles/:id/targets | router.get('/cycles/:cycleId/targets') | ✅ |
| syncTargets | POST /cycles/:id/targets/sync | router$1.post('/sync') | ✅ |
| fetchMetricList | GET /metrics | router.get('/metrics') | ✅ |
| fetchScoreList | GET /scores | router.get('/scores') | ✅ |
| executeScoring | POST /scoring/execute | router.post('/scoring/execute') | ✅ |
| recalculateScore | POST /scoring/recalculate | router.post('/scoring/recalculate') | ✅ |
| fetchDeductionList | GET /deductions | router.get('/deductions') | ✅ |
| approveDeduction | POST /deductions/:id/approve | router.post('/deductions/review/approve') | ⚠️ 路径不同 |
| rejectDeduction | POST /deductions/:id/reject | router.post('/deductions/review/reject') | ⚠️ 路径不同 |
| batchApproveDeductions | POST /deductions/batch-approve | router.post('/deductions/batch-approve') | ✅ |
| adjustDeduction | POST /deductions/:id/adjust | router.post('/deductions/adjust') | ⚠️ 路径不同 |
| freezeCycle | POST /freeze/cycle/:id | router.post('/freeze/cycle/:id') | ✅ |
| unfreezeCycle | POST /freeze/unfreeze/:id | router.post('/freezeCycles/:id/unfreeze') | ⚠️ 路径不同 |
| fetchAssessmentStats | GET /stats/overview | router.get('/stats/overview') | ✅ |
| exportResults | GET /export/results/:cycleId | router.get('/export/results/:cycleId') | ✅ |
| importDeductions | POST /import/deductions | router.post('/import/deductions') | ✅ |

**URL不一致项（4个）**：需修复前端URL

---

## 三、HTTP方法一致性

全部一致 ✅（GET/POST/PUT/DELETE完全匹配）

---

## 四、参数命名不一致问题

### 4.1 查询参数（GET请求）

| 前端参数名 | 后端期望参数名 | 严重程度 |
|-----------/|-------------|---------|
| assessmentYear | year | 中 |
| assessmentMonth | month | 中 |
| cycleId; | cycle_id | 中 |
| targetId | target_id | 中 |
| reviewStatus | review_status | 中 |
| sourceType | deduction_source | 中 |
| position | target_post | 低 |

### 4.2 请求体参数（POST/PUT请求）

| 前端参数名 | 后端期望参数名 | 说明 |
|-----------|-------------|------|
| assessmentYear | assessment_year | camelCase→snake_case |
| assessmentMonth | assessment_month | camelCase→snake_case |
| cycleName | cycle_name | camelCase→snake_case |
| cycleType | cycle_type | camelCase→snake_case |
| employeeIds | employee_ids | camelCase→snake_case |
| cycleId | cycle_id | camelCase→snake_case |
| reviewComment | review_comment | camelCase→snake_case |
| rejectReason | reject_reason | camelCase→snake_case |
| deductionIds | deduction_ids | camelCase→snake_case |
| newScore | new_score | camelCase→snake_case |
| adjustmentReason | adjustment_reason | camelCase→snake_case |
| unfreezeReason | unfreeze_reason | camelCase→snake_case |

---

## 五、返回结构一致性

- 后端使用 `success(data)` 函数包装：`{ code: 0, success: true, message, data }`
- 前端 `client.ts` 响应拦截器自动解包 `data` 字段
- **一致性**：✅ 一致

**但返回字段命名**：后端返回snake_case（如`assessment_year`），前端类型定义camelCase（如`assessmentYear`）
- 后端已有 `camelKeys()` 转换工具（`server/utils/commonResponse.js`）
- 部分路由已使用 camelKeys 转换，部分未使用
- **建议**：确保所有考核路由.returns使用camelKeys转换

---

## 六、问题汇总

| # | 问题类型 | 严重程度 | 说明 | 解决方案 |
|---|---------|---------|------|---------|
| 1 | URL路径 | 高 | 审核通过/驳回/调整/解冻4个接口URL不一致 | 修复前端API URL |
| 2 | 查询参数 | 中 | 前端assessmentYear→后端year等 | 前端API4参数转换 |
| 3 | 请求体参数 | 中 | 前端camelCase→后端snake_case | 前端API4参数转换 |
| 4 | 返回字段 | 中 | 后端snake_case→前端camelCase | 确保后端使用camelKeys |

---

## 七、解决方案

**采用前端API层参数转换方案**（不修改后端代码）：

1. 在 `assessment-monthly.ts` 中添加 `toSnakeCase` 转换工具函数
2. 每个API函数发送请求前将camelCase参数转为后端?期望的snake_case
3. 修复4个不一致的URL路径
4. 后端确认所有路由.returns数据使用camelKeys转换

---

**报告人**：HSE 前端开发, 开发
**报告日期**：2026-07-24
