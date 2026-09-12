# HSE安全生产管理系统 V2.0.2 全量扫描审计报告

## 审计日期
2026-07-21

## 审计范围
- 前端：安全看板vben/apps/web-antd/src/
- 后端：server/
- 数据库：server/sql/
- 路由：所有router配置

---

## 一、项目结构扫描

### 1.1 当前模块清单

| 模块名称 | 路由文件 | 视图目录 | 状态 |
|----------|----------|----------|------|
| 人员主数据 | hse-employee.ts | views/hse/employee/ | ✅ 完整 |
| 岗位安全画像 | 整合在人员模块 | views/hse/employee/positions.vue | ✅ |
| 员工安全能力中心 | 整合在人员模块 | views/hse/employee/ | ✅ |
| 检查管理中心 | hse-inspection.ts | views/inspection/ | ✅ |
| 隐患整改闭环中心 | hse-hazards.ts | views/hazards/ | ✅ |
| 安全生产标准化评价 | hse-standard.ts | views/hse/standard/ | ✅ |
| 培训管理 | hse-training.ts | views/training/ | ✅ |
| 保险管理 | hse-insurance.ts | views/insurance/ | ✅ |
| 事故管理 | hse-accidents.ts | views/accidents/ | ✅ |
| 应急管理 | hse-emergency.ts | views/emergency/ | ✅ |
| 风险管控 | hse-risk-control.ts | views/risk-control/ | ✅ |
| 目标职责 | hse-objectives.ts | views/objectives/ | ✅ |
| 规章制度 | hse-regulations.ts | views/regulations/ | ✅ |
| 文档管理 | hse-documents.ts | views/hse/documents/ | ✅ |
| 批量导入 | hse-batch-import.ts | views/hse/batch-import/ | ✅ |
| 告警中心 | hse-center.ts | views/hse/alerts/ | ✅ |
| 工作流引擎 | hse-center.ts | views/hse/workflow/ | ✅ |
| 通知中心 | hse-center.ts | views/hse/notifications/ | ✅ |
| HSE驾驶舱 | hse-advanced.ts | views/hse/cockpit/ | ✅ |
| BI数据看板 | hse-advanced.ts | views/hse/bi/ | ✅ |
| AI智能分析 | hse-advanced.ts | views/hse/ai-analysis/ | ✅ |
| IoT物联网 | hse-advanced.ts | views/hse/iot/ | ⚠️ 待完善 |
| 供应链安全 | hse-advanced.ts | views/hse/supply-chain/ | ⚠️ 待完善 |
| 报表中心 | hse-advanced.ts | views/hse/reports/ | ✅ |

### 1.2 页面清单

**人员主数据中心**（4个页面）：
- 员工列表（index.vue）
- 组织管理（departments.vue）
- 岗位管理（positions.vue）
- 人事变动记录（EmployeeHistoryDrawer.vue - 抽屉组件）

**培训管理**（4个页面）：
- 培训计划（index.vue）
- 培训台账（ledger/index.vue）
- 新员工培训（new-employee/index.vue）
- 驾驶员实操（driver/index.vue）

**现场管理**（3个页面）：
- 三违管理（index.vue）
- 消防设施管理（fire-facility/index.vue）
- 网格管理（grid/index.vue）

**保险管理**（3个页面）：
- 人员保险（personnel/index.vue）
- 车辆保险（vehicle/index.vue）
- 超龄人员管控（over-age/index.vue）

**标准化评价**（3个页面）：
- 标准条款库（index.vue）
- 条款资料关联（relation/index.vue）
- 匹配建议（relation/suggestions.vue）

**文档管理**（2个页面）：
- 文档库（library/index.vue）
- 文档审核（review/index.vue）

**高级分析**（6个页面）：
- HSE驾驶舱（cockpit/index.vue）
- BI数据看板（bi/index.vue）
- AI智能分析（ai-analysis/index.vue）
- IoT物联网（iot/index.vue）
- 供应链安全（supply-chain/index.vue）
- 报表中心（reports/index.vue）

**其他独立页面**（7个页面）：
- 事故管理（accidents/index.vue）
- 应急管理（emergency/index.vue）
- 风险管控（risk-control/index.vue）
- 目标职责（goals/index.vue）
- 规章制度（regulations/index.vue）
- 隐患排查治理（hazards/index.vue）
- 告警中心（alerts/index.vue）

### 1.3 API清单

**人员模块**（hse-employee.js）：
- GET /api/hse/employee/list - 员工列表
- GET /api/hse/employee/:id - 员工详情
- POST /api/hse/employee - 新增员工
- PUT /api/hse/employee/:id - 更新员工
- DELETE /api/hse/employee/:id - 删除员工
- POST /api/hse/employee/import - 员工导入
- GET /api/hse/department/tree - 部门树
- POST /api/hse/department - 新增部门
- PUT /api/hse/department/:id - 更新部门
- GET /api/hse/position/list - 岗位列表

**隐患模块**（hazards.js + hse-hazard-rectification.js）：
- GET /api/hazards - 隐患列表
- GET /api/hazards/:id - 隐患详情
- POST /api/hazards - 新增隐患
- PUT /api/hazards/:id - 更新隐患
- DELETE /api/hazards/:id - 删除隐患
- POST /api/hse/hazard/:id/rectification - 创建整改
- PUT /api/hse/rectification/:id - 更新整改
- POST /api/hse/rectification/:id/review - 创建复查

**培训模块**（training.js）：
- GET /api/training - 培训列表
- GET /api/training/:id - 培训详情
- POST /api/training - 新增培训
- PUT /api/training/:id - 更新培训

**标准化评价模块**（hse-standard.js + hse-standard-evaluation.js）：
- GET /api/hse/standard/tree - 条款树
- GET /api/hse/standard/stats - 条款统计
- GET /api/hse/standard/:id - 条款详情
- POST /api/hse/standard - 新增条款
- PUT /api/hse/standard/:id - 更新条款
- POST /api/hse/standard/import - 导入条款
- POST /api/hse/standard/export - 导出条款
- POST /api/hse/evaluation/task - 创建评价任务
- GET /api/hse/evaluation/task/:id - 评价任务详情
- POST /api/hse/evaluation/item/ai - AI评价

**文档模块**（hse-documents.js）：
- GET /api/hse/documents - 文档列表
- POST /api/hse/documents/upload - 上传文档
- POST /api/hse/documents/:id/analyze - AI分析

**报告模块**（hse-report.js）：
- GET /api/hse/reports - 报告列表
- POST /api/hse/reports/generate - 生成报告
- GET /api/hse/reports/:id - 报告详情

**批量导入模块**（hse-batch-import.js + import.js）：
- POST /api/hse/batch-import/task - 创建导入任务
- GET /api/hse/batch-import/task/:id - 任务详情
- POST /api/hse/batch-import/task/:id/confirm - 确认导入
- POST /api/hse/batch-import/task/:id/retry - 重试任务

**其他API**：
- /api/accidents - 事故管理
- /api/emergency - 应急管理
- /api/risk-control - 风险管控
- /api/insurance - 保险管理
- /api/notifications - 通知管理
- /api/alerts - 告警管理
- /api/workflow - 工作流管理
- /api/ai - AI服务
- /api/bi - BI统计

### 1.4 文件数量统计

| 分类 | 数量 | 说明 |
|------|------|------|
| 后端路由文件 | 48 | server/routes/ |
| 后端SQL迁移 | 23 | server/sql/ |
| 前端路由模块 | 19 | router/routes/modules/ |
| 前端页面组件 | 42 | views/hse/ + views/ |
| 前端API模块 | 20 | api/hse/ |
| 前端自定义组件 | 7 | components/hse/ |
| 前端Store | 5 | store/ |

### 1.5 重点检查结果

**重复模块**：
- ✅ 无重复模块

**废弃代码**：
- ⚠️ `personnel.js` 路由仍存在（旧人员模块）
- ⚠️ `hse-hazard-baseline.js` 路由可能已废弃
- ⚠️ `security/` 目录下有测试和废弃文件

**重复组件**：
- ✅ 无重复组件

---

## 二、Vben Admin架构检查

### 2.1 禁止修改区域检查

| 目录 | 状态 | 说明 |
|------|------|------|
| packages/@core/ | ✅ | 未修改 |
| packages/effects/ | ✅ | 未修改 |
| packages/themes/ | ✅ | 未修改 |

### 2.2 自定义代码位置

| 位置 | 内容 | 状态 |
|------|------|------|
| src/api/hse/ | HSE业务API调用 | ✅ 规范 |
| src/views/hse/ | HSE业务页面 | ✅ 规范 |
| src/components/hse/ | HSE公共组件 | ✅ 规范 |
| src/store/hse/ | HSE状态管理 | ⚠️ 部分缺失 |
| src/router/routes/modules/hse*.ts | HSE路由配置 | ✅ 规范 |

### 2.3 Vben最佳实践检查

| 检查项 | 结果 | 说明 |
|--------|------|------|
| 路由meta.authority数组 | ✅ | 所有路由使用数组格式 |
| 权限控制使用access.ts | ✅ | 通过路由守卫控制 |
| useVbenForm/useVbenVxeGrid | ✅ | 使用官方composables |
| i18n国际化 | ⚠️ | 部分页面缺少国际化 |
| 主题适配 | ✅ | 使用CSS变量 |
| 暗黑模式支持 | ⚠️ | 部分组件未适配 |

### 2.4 重复封装检查

- ✅ 无重复封装组件
- ✅ 统一使用Ant Design Vue组件
- ✅ 统一使用@vben/icons图标库

---

## 三、HSE业务模块完整性分析

### 3.1 数据链路分析

```
employee → hse_employee_org → department/position
     ↓
position_safety_profile（岗位安全画像）
     ↓
training_records（培训记录）
     ↓
hse_inspection_plans → inspection_record
     ↓
hazard_record → rectification_task → review_record
```

### 3.2 数据关联完整性

| 链路节点 | 关联字段 | 完整性 | 问题 |
|----------|----------|--------|------|
| employee → department | department_id | ✅ | 完整 |
| employee → position | position_id | ✅ | 完整 |
| employee → hse_employee_org | employee_id | ✅ | 完整 |
| position → position_safety_profile | position_id | ⚠️ | 缺少关联表 |
| training_records → employee | personnel_id | ❌ | 应使用employee_id |
| inspection_record → employee | inspector_id | ✅ | 完整 |
| hazard_record → employee | checker_id | ⚠️ | 缺少外键约束 |
| hazard_record → rectification_task | hazard_id | ⚠️ | 缺少外键约束 |
| rectification_task → review_record | rectification_id | ⚠️ | 缺少外键约束 |

### 3.3 断链问题

| 断链点 | 影响 | 严重程度 |
|--------|------|----------|
| training_records使用personnel_id | 无法关联employee主表 | 高 |
| hazard_record无外键 | 数据完整性无法保证 | 高 |
| position与风险源无关联 | 无法实现岗位风险评估 | 中 |
| inspection_plans与hazard_record无关联 | 检查计划与隐患无法追踪 | 中 |

### 3.4 孤立数据

| 表 | 孤立原因 | 建议 |
|----|----------|------|
| hse_risk_factors | 无业务模块使用 | 需开发风险管控模块 |
| hse_control_measures | 无业务模块使用 | 需开发风险管控模块 |
| hse_risk_objects | 无业务模块使用 | 需开发风险管控模块 |

### 3.5 重复字段

| 重复字段 | 涉及表 | 问题 |
|----------|--------|------|
| name | personnel, employee, training_records | 姓名冗余存储 |
| id_card | personnel, employee, over_age_personnel | 身份证号冗余存储 |
| dept | personnel, training_records, hazards | 部门名称冗余存储 |
| position | personnel, training_records | 岗位名称冗余存储 |

---

## 四、数据库架构审计

（详见 database-analysis.md）

---

## 五、API接口审计

### 5.1 接口列表

| 模块 | 接口数 | 认证 | 权限 | 参数校验 |
|------|--------|------|------|----------|
| 人员 | 12 | ✅ | ✅ | ⚠️ |
| 隐患 | 8 | ✅ | ⚠️ | ⚠️ |
| 培训 | 4 | ✅ | ⚠️ | ⚠️ |
| 标准化评价 | 9 | ✅ | ✅ | ✅ |
| 文档 | 4 | ✅ | ✅ | ✅ |
| 报告 | 3 | ✅ | ✅ | ✅ |
| 批量导入 | 4 | ✅ | ✅ | ✅ |
| 事故 | 4 | ✅ | ⚠️ | ⚠️ |
| 应急 | 3 | ✅ | ⚠️ | ⚠️ |
| 保险 | 5 | ✅ | ⚠️ | ⚠️ |
| 通知 | 3 | ✅ | ⚠️ | ⚠️ |

### 5.2 REST规范检查

| 检查项 | 结果 | 说明 |
|--------|------|------|
| HTTP方法使用 | ✅ | GET/POST/PUT/DELETE正确使用 |
| 路径命名 | ⚠️ | 部分使用下划线（如hse-employee） |
| 版本控制 | ❌ | 无API版本控制 |
| 分页参数 | ⚠️ | 部分接口缺少分页 |
| 响应格式 | ✅ | 统一使用success/error响应 |

### 5.3 参数校验检查

| 检查项 | 结果 | 说明 |
|--------|------|------|
| Zod校验 | ⚠️ | 仅部分接口使用 |
| 必填校验 | ⚠️ | 部分接口缺少必填校验 |
| 格式校验 | ⚠️ | 部分接口缺少格式校验 |
| 长度校验 | ⚠️ | 部分接口缺少长度校验 |

### 5.4 权限控制检查

| 检查项 | 结果 | 说明 |
|--------|------|------|
| JWT认证 | ✅ | 所有接口需认证 |
| 角色权限 | ⚠️ | 部分接口缺少角色控制 |
| 数据隔离 | ⚠️ | 缺少企业/区域数据隔离 |
| 绕过权限 | ❌ | 无绕过权限接口 |

### 5.5 错误处理检查

| 检查项 | 结果 | 说明 |
|--------|------|------|
| 统一错误格式 | ✅ | 使用error中间件 |
| 错误日志记录 | ⚠️ | 部分接口缺少日志 |
| 异常捕获 | ⚠️ | 部分接口缺少try-catch |
| 友好错误信息 | ⚠️ | 部分错误信息不够友好 |

### 5.6 日志记录检查

| 检查项 | 结果 | 说明 |
|--------|------|------|
| 操作日志 | ✅ | 使用auditLog记录 |
| 错误日志 | ⚠️ | 部分接口缺少错误日志 |
| 性能日志 | ❌ | 无性能日志 |
| 访问日志 | ❌ | 无访问日志 |

---

## 六、安全生产标准化业务审查

### 6.1 当前支持能力

| 业务能力 | 支持状态 | 说明 |
|----------|----------|------|
| 安全生产标准化资料归档 | ✅ | 文档管理模块支持 |
| 集团检查 | ⚠️ | 部分支持，缺少集团维度统计 |
| 区域公司汇总 | ⚠️ | 部分支持，缺少区域维度统计 |
| 月报生成 | ✅ | 报表中心支持 |
| 年度自评 | ⚠️ | 部分支持，缺少完整自评流程 |
| 隐患闭环 | ✅ | 隐患排查治理模块支持 |
| 培训合规 | ⚠️ | 部分支持，缺少合规校验 |
| 人员风险识别 | ⚠️ | 部分支持，岗位安全画像 |

### 6.2 缺失能力

| 缺失能力 | 影响 | 优先级 |
|----------|------|--------|
| 集团/区域/企业三级数据汇总 | 无法满足集团化管理需求 | P0 |
| 培训合规自动校验 | 无法自动识别培训缺失人员 | P1 |
| 人员风险等级评估 | 无法自动识别高风险人员 | P1 |
| 年度自评报告生成 | 无法生成标准化自评报告 | P1 |
| 标准条款合规性监控 | 无法实时监控条款合规状态 | P2 |

---

## 七、数据中心分析

### 7.1 当前可统计指标

| 指标 | 数据来源 | 可统计性 |
|------|----------|----------|
| 人员数量 | employee表 | ✅ |
| 超龄人员 | over_age_personnel表 | ✅ |
| 保险情况 | personnel_insurance表 | ✅ |
| 培训完成率 | training_records表 | ⚠️ 需计算 |
| 三违次数 | inspection_record表 | ✅ |
| 隐患数量 | hazard_record表 | ✅ |
| 整改闭环率 | rectification_task表 | ⚠️ 需计算 |
| 高风险岗位人数 | 无对应表 | ❌ |

### 7.2 未来需要的数据

| 数据项 | 用途 | 优先级 |
|--------|------|--------|
| 违规记录 | 统计三违次数 | P0 |
| 证书管理 | 统计证书到期情况 | P0 |
| 岗位风险评估 | 统计高风险岗位人数 | P1 |
| 考核记录 | 统计人员安全考核 | P2 |
| 奖惩记录 | 统计奖惩情况 | P2 |

---

## 八、通知中心分析

### 8.1 当前支持的通知类型

| 通知类型 | bizType | 支持状态 |
|----------|---------|----------|
| 系统通知 | system | ✅ |
| 工作流任务 | workflow_task | ✅ |
| 文档分析 | document_analysis | ✅ |

### 8.2 缺失的通知类型

| 通知类型 | 用途 | 当前状态 |
|----------|------|----------|
| 隐患超期提醒 | 提醒隐患即将超期 | ❌ 未实现 |
| 培训到期提醒 | 提醒培训证书即将到期 | ❌ 未实现 |
| 证书到期提醒 | 提醒人员证书即将到期 | ❌ 未实现 |
| 检查任务提醒 | 提醒检查任务即将到期 | ❌ 未实现 |
| 待办提醒 | 提醒待处理任务 | ❌ 未实现 |

### 8.3 优化方案

1. **新增定时任务**：使用cron定时扫描到期数据
2. **扩展notificationService**：新增提醒类型常量
3. **新增提醒配置**：允许用户配置提醒规则
4. **WebSocket推送**：实时推送提醒到前端
5. **邮件推送**：支持邮件提醒（可选）

---

## 九、AI能力边界检查

### 9.1 AI能力现状

| AI能力 | Prompt模板 | 用途 | 合规性 |
|--------|-----------|------|--------|
| 隐患分析 | report_hazard | 隐患分析报告 | ✅ |
| 事故分析 | report_accident | 事故分析报告 | ✅ |
| 培训分析 | report_training | 培训效果分析 | ✅ |
| 巡检分析 | report_patrol | 巡检工作报告 | ✅ |
| 根因分析 | rca_analysis | 5W1H根因分析 | ✅ |
| 文档分析 | document_analysis | 文档辅助分析 | ✅ |
| 标准化评价 | standard_evaluation | 条款辅助评价 | ✅ |
| 安全生产月报 | report_monthly | 月报AI分析 | ✅ |
| 集团汇报 | report_group | 汇报材料AI分析 | ✅ |

### 9.2 AI约束合规性

| 约束项 | 合规状态 | 说明 |
|--------|----------|------|
| AI仅提供建议 | ✅ | 所有AI结论需人工确认 |
| 禁止自动认证 | ✅ | standard_evaluation明确禁止 |
| 禁止自动关闭隐患 | ✅ | 无自动关闭逻辑 |
| 禁止自动安全结论 | ✅ | 所有verdict需人工确认 |
| 禁止编造数据 | ✅ | 月报和汇报模板有强约束 |
| AI失败不影响主体 | ✅ | AI分析失败不影响报告生成 |

### 9.3 AI能力边界总结

- ✅ AI仅用于分析、建议、分类、提示
- ✅ AI结论需人工确认（confirmed_status字段）
- ✅ 无自动决策逻辑
- ✅ 符合安全合规要求

---

## 十、性能分析

### 10.1 数据库性能

| 检查项 | 状态 | 问题 |
|--------|------|------|
| 索引完整性 | ⚠️ | hazard_record表无索引 |
| 慢查询风险 | ⚠️ | 大数据量查询可能慢 |
| 分页使用 | ⚠️ | 部分接口未强制分页 |
| 缓存策略 | ⚠️ | 缺少静态数据缓存 |

### 10.2 接口性能

| 检查项 | 状态 | 问题 |
|--------|------|------|
| 大量数据查询 | ⚠️ | 部分列表查询无限制 |
| 文件上传 | ⚠️ | 大文件上传无分片 |
| 响应时间 | ⚠️ | 部分接口响应较慢 |
| 并发控制 | ✅ | 批量导入有并发控制 |

### 10.3 前端性能

| 检查项 | 状态 | 问题 |
|--------|------|------|
| 页面加载 | ⚠️ | 部分页面加载较慢 |
| 组件懒加载 | ✅ | 路由级懒加载 |
| 状态管理 | ⚠️ | 部分组件状态冗余 |
| 图片优化 | ⚠️ | 部分图片未压缩 |

### 10.4 文件上传性能

| 检查项 | 状态 | 问题 |
|--------|------|------|
| 大文件处理 | ⚠️ | 单文件100MB限制，无分片 |
| 文件预览 | ⚠️ | 大文件预览可能卡顿 |
| 上传进度 | ⚠️ | 部分上传无进度显示 |

### 10.5 优化建议

1. **数据库优化**：添加缺失索引，创建常用视图
2. **接口优化**：强制分页，添加缓存，优化查询
3. **前端优化**：添加骨架屏，优化图片加载，组件拆分
4. **文件上传优化**：实现分片上传，添加进度条

---

## 十一、合规性检查

### 11.1 约束遵守情况

| 约束项 | 遵守状态 | 说明 |
|--------|----------|------|
| 禁止修改packages/@core/ | ✅ | 未修改 |
| 禁止修改packages/effects/ | ✅ | 未修改 |
| 禁止修改packages/themes/ | ✅ | 未修改 |
| 禁止修改auth/JWT | ✅ | 未修改 |
| 业务代码隔离 | ✅ | 所有HSE代码在指定目录 |
| 禁止新增npm依赖 | ✅ | 无新增依赖 |
| AI只能辅助判断 | ✅ | 符合约束 |
| 评价任务异步执行 | ✅ | 使用异步队列 |
| 报告生成基于人工确认 | ✅ | 符合约束 |
| 禁止自动认证 | ✅ | 符合约束 |

### 11.2 代码审查点

| 检查项 | 结果 | 说明 |
|--------|------|------|
| !important | ✅ | 未发现 |
| ::v-deep | ✅ | 未发现 |
| deep | ✅ | 未发现 |
| 硬编码颜色 | ⚠️ | 少量存在 |
| 暗黑模式支持 | ⚠️ | 部分组件未适配 |

---

## 十二、综合评分

| 维度 | 评分 | 说明 |
|------|------|------|
| 项目结构完整性 | 85/100 | 模块齐全，结构清晰 |
| Vben架构合规性 | 90/100 | 符合官方规范 |
| 业务模块完整性 | 70/100 | 存在断链问题 |
| 数据库架构 | 71/100 | 已有详细分析 |
| API接口质量 | 75/100 | 部分缺少校验和权限 |
| 安全生产标准化 | 75/100 | 基本满足需求 |
| 数据中心能力 | 65/100 | 缺少部分统计数据 |
| 通知中心能力 | 50/100 | 功能不完善 |
| AI能力合规性 | 95/100 | 完全符合约束 |
| 性能优化 | 65/100 | 存在优化空间 |

**综合评分：74/100**

---

**审计日期**：2026-07-21
**审计范围**：HSE安全生产管理系统 V2.0.2
**审计人**：系统审计
