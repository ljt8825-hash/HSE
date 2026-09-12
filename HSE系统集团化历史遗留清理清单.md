# HSE系统集团化历史遗留清理清单

> **版本**：v1.0
> **生成日期**：2026-07-25
> **任务编号**：Sprint10-E-7-B

## 一、前端代码清理（apps/web-antd/src）

| 序号 | 位置（文件:行） | 原内容 | 修改内容 | 状态 |
|------|----------------|-------|---------|------|
| 1 | [api/hse/executive-cockpit.ts:2](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/api/hse/executive-cockpit.ts#L2) | HSE 集团智能驾驶舱 API | HSE 安全总览 API | ✅ 已修改 |
| 2 | [api/hse/executive-cockpit.ts:40](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/api/hse/executive-cockpit.ts#L40) | 集团HSE总体态势 | 公司HSE安全态势 | ✅ 已修改 |
| 3 | [api/hse/executive-cockpit.ts:271](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/api/hse/executive-cockpit.ts#L271) | 集团HSE总体态势 | 公司HSE安全态势 | ✅ 已修改 |
| 4 | [api/hse/assessment.ts:200](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/api/hse/assessment.ts#L200) | 集团HSE考核总览 | 公司HSE考核总览 | ✅ 已修改 |
| 5 | [locales/langs/zh-CN/hse.json:1014](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/locales/langs/zh-CN/hse.json#L1014) | 集团汇报材料 | 公司汇报材料 | ✅ 已修改 |
| 6 | [views/hse/executive-cockpit/index.vue:8](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/executive-cockpit/index.vue#L8) | 集团HSE智能驾驶舱 | 公司HSE安全总览 | ✅ 已修改 |
| 7 | [views/hse/executive-cockpit/index.vue:25](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/executive-cockpit/index.vue#L25) | 集团HSE总体态势 | 公司HSE安全态势 | ✅ 已修改 |
| 8 | [views/hse/assessment-analysis/index.vue:5](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/assessment-analysis/index.vue#L5) | 集团HSE考核分析中心 | 公司HSE考核分析中心 | ✅ 已修改 |
| 9 | [views/hse/assessment-analysis/index.vue:10](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/assessment-analysis/index.vue#L10) | 全集团 | 全公司 | ✅ 已修改 |
| 10 | [views/hse/assessment-analysis/TargetProgress.vue:112](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/assessment-analysis/TargetProgress.vue#L112) | 集团 | 公司 | ✅ 已修改 |
| 11 | [views/hse/driver-risk-center/index.vue:10](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/driver-risk-center/index.vue#L10) | 集团驾驶员安全风险管理 | 公司驾驶员安全风险管理 | ✅ 已修改 |
| 12 | [views/hse/reports/index.vue:42](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/reports/index.vue#L42) | 集团汇报材料 | 公司汇报材料 | ✅ 已修改 |
| 13 | [views/hse/reports/index.vue:44](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/reports/index.vue#L44) | 生成集团/区域汇报材料 | 生成公司汇报材料 | ✅ 已修改 |
| 14 | [views/hse/employee/departments.vue:4](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/employee/departments.vue#L4) | 表: department (层级: 集团/区域/企业/项目/班组) | 表: department (层级: 公司/部门/乡镇/班组) | ✅ 已修改 |
| 15 | [views/hse/employee/departments.vue:234](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/employee/departments.vue#L234) | 集团、区域公司、项目公司 | 公司、部门中心、乡镇作业中心 | ✅ 已修改 |
| 16 | [views/hse/employee/departments.vue:366](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/employee/departments.vue#L366) | 1: 集团、2: 区域公司、3: 项目公司 | 1: 公司、2: 部门中心、3: 乡镇作业中心 | ✅ 已修改 |
| 17 | [router/routes/modules/hse-advanced.ts:61](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules/hse-advanced.ts#L61) | 集团智能驾驶舱 | 安全总览首页 | ✅ 已修改 |

## 二、安全总览入口统一调整

| 序号 | 位置（文件:行） | 调整内容 | 状态 |
|------|----------------|---------|------|
| 18 | [router/routes/modules/hse-01-overview.ts:18](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules/hse-01-overview.ts#L18) | 标题 "HSE驾驶舱" → "安全总览首页" | ✅ 已修改 |
| 19 | [router/routes/modules/hse-01-overview.ts:31](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules/hse-01-overview.ts#L31) | `/overview/executive-cockpit` 新增 `hideInMenu: true`，隐藏独立入口 | ✅ 已修改 |

## 三、MD文档清理（记录，待后续修改）

| 序号 | 文档位置 | 典型原描述 | 修改建议 | 状态 |
|------|---------|-----------|---------|------|
| D1 | 各类设计文档（约30+份） | 集团、集团领导、集团HSE、集团驾驶舱 | 公司、公司总经理、公司HSE、安全总览 | ⏳ 待清理 |
| D2 | hse-employee-master-data-*.md（多版） | 集团/区域/企业/项目/班组、group_id | 公司/部门/乡镇/班组、company_id | ⏳ 待清理 |
| D3 | 驾驶舱接口文档.md | 集团HSE总体态势 | 公司HSE安全态势 | ⏳ 待清理 |

> 注：MD文档中的"集团"描述未在本次任务中批量修改，仅记录清理范围，待后续文档更新时逐步清理。

## 四、常见替换速查表

| 原描述 | 修改为 | 说明 |
|-------|-------|------|
| 集团 | 公司 | 最常见 |
| 集团领导 | 公司总经理 | 最高管理者 |
| 集团HSE | 公司HSE | 系统前缀 |
| 集团驾驶舱 | 安全总览首页 | 统一入口 |
| 集团智能驾驶舱 | 安全总览首页 | 同驾驶舱 |
| 全集团 | 全公司 | 数据范围 |
| 集团级 | 公司级 | 层级描述 |
| 集团/区域/企业 | 公司/部门/乡镇 | 组织层级 |
| 集团汇报 | 公司汇报 | 报告类型 |
| group_id | company_id（或移除） | 数据字段 |
| group_leader | general_manager | 角色字段 |

---

**清理验证状态**：前端 `apps/web-antd/src` 目录下已无"集团"字样（Grep验证通过）。
