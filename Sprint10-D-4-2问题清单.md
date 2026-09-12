# Sprint10-D-4-2 问题清单

> **报告日期**：2026-07-24
> **任务编号**：Sprint10-D-4-2

---

## 问题汇总

| # | 问题类型 | 严重程度 | 状态 | 说明 | 修复方式 |
|---|---------|---------|------|------|---------|
| 1 | 技术一致性 | 高 | ✅已关闭 | 项目使用Element Plus而非Ant Design Vue | 正式确认Element Plus为UI组件库 |
| 2 | API URL不一致 | 高 | ✅已修复 | 审核/驳回/调整/解冻4个接口URL与后端不一致 | 修复前端API URL |
| 3 | API参数命名 | 高 | ✅已修复 | 前端camelCase vs 后端snake_case | 添加toSnakeCaseParams转换 |
| 4 | API查询参数 | 中 | ✅已修复 | 前端assessmentYear→后端year等简写差异 | fetchCycleList中参数映射 |
| 5 | API返回字段 | 中 | ⚠️待确认 | 后端部分路由未使用camelKeys转换返回 | 需后端确认所有路由返回 |
| 6 | 数据库表 | 低 | ✅已验证 | 8张核心表DDL与代码引用一致 | - |
| 7 | 权限一致性 | 低 | ✅已验证 | 前端权限码与后端requirePermission一致 | - |

---

## 详细说明

### 问题1：技术一致性（Element Plus vs Ant Design Vue）

**发现**：项目使用Element Plus（774次引用）而非Vben Admin标配的Ant Design Vue（10次引用）。

**风险评估**：Element Plus已成为项目实际UI标准，回退成本极高，Vben框架层不受影响。

**决策**：正式确认Element Plus为本项目UI组件库。

### 问题2：API URL不一致

**前端URL** → **后端URL**（已修复）：
- `/deductions/:id/approve` → `/deductions/review/approve`
- `/deductions/:id/reject` → `/deductions/review/reject`
- `/deductions/:id/adjust` → `/deductions/adjust`
- `/cycles/:id/unfreeze` → `/freeze/cycle/:id/unfreeze`

### 问题3：参数命名不一致

**解决方案**：在前端API层添加 `toSnakeCaseParams` 转换函数，发送请求前自动将camelCase转为snake_case。

### 问题5：返回字段命名

**说明**：后端已有 `camelKeys()` 工具函数（`server/utils/commonResponse.js`），部分路由已使用，部分未使用。需确认所有考核路由返回数据均使用camelKeys转换。

---

**报告人**：HSE 前端开发
**报告日期**：2026-07-24
