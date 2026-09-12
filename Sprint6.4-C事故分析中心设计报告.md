# Sprint6.4-C 事故分析中心设计报告

> 版本：v1.0
> 日期：2026-07-22
> 模块：HSE 事故风险分析中心
> Sprint：Sprint6.4-C
> 关联模块：Sprint6.1（风险模型）、Sprint6.4-A（员工风险画像）

---

## 一、建设背景

### 1.1 业务背景
在完成 Sprint6.1 风险模型、Sprint6.2 风险等级计算、Sprint6.3 HSE 综合驾驶舱、Sprint6.4-A 员工风险画像、Sprint6.4-B 驾驶员专项风险中心之后，集团 HSE 体系已经具备以员工为主体的多维度风险视图。

但在事故维度，目前仍存在以下缺口：
- 事故数据散落在 `accidents` 表中，缺乏统一的统计与可视化视图
- 集团/部门/乡镇/片区四个层级无法快速查看自己范围内的事故分布与责任分布
- 事故与员工风险画像之间未建立跳转通道，难以做"事故—画像"的关联追踪

### 1.2 建设目标
建立 HSE 事故风险分析中心，实现：
1. 事故统计（总数、涉及人数、责任人数、重大事故数量）
2. 事故趋势（年度 / 月度）
3. 责任分析（TOP 责任人员、岗位分布、部门分布）
4. 事故与员工风险画像关联跳转

### 1.3 设计原则
- **复用优先**：沿用 Sprint6.4-A/B 的组件设计模式（主页面 index.vue + 子组件），保持代码风格一致
- **只读分析**：本中心为查询/可视化模块，不写入事故数据
- **风险主体不变**：所有责任人员统计仍然以 `employee_id` 为主体，禁止以车辆作为主体
- **数据范围隔离**：前端不传范围参数，由后端根据用户角色统一控制

---

## 二、业务范围

### 2.1 事故分类
| 分类 | 判定规则 | 说明 |
| --- | --- | --- |
| 生产安全事故 | `accident_type <> '交通事故'` | 包含职业伤害、设备、火灾等 |
| 交通事故 | `accident_type = '交通事故'` | 含车辆相关事故 |

> 环境污染事故：在 `accidents` 表中保留 `accident_type='环境污染'` 字段，但暂不纳入本中心生产管理模块统计维度，仅作为类型明细展示。

### 2.2 数据来源
- 主表：`accidents`
- 关联链路：
  ```
  accidents.personnel_id  ──>  employee.id
  accidents.involved_person ──> employee.name (辅助)
  ```
- 衍生关联（仅用于岗位/部门分布）：
  ```
  employee ─ employee_assignment(is_current=true) ─ position / hse_org_unit
  ```

### 2.3 角色权限矩阵
| 角色 | 数据范围 | 说明 |
| --- | --- | --- |
| 集团领导 (group_leader) | 全集团 | 查看所有事故 |
| 部门经理 (department_manager) | 本部门 | 部门下属员工的事故 |
| 乡镇作业中心经理 (township_manager) | 本中心 | 中心下属员工的事故 |
| 片区长 (area_manager) | 本片区 | 片区下属员工的事故 |
| 安全管理员 (safety_manager) | 全集团 | 同集团领导，无写入权限 |
| 管理员 (admin) | 全集团 | 全部权限 |

> 实际数据范围过滤在后端中间件层实现，前端仅展示后端返回数据。

---

## 三、功能模块设计

### 3.1 模块概览
| 序号 | 模块 | 子组件 | 数据接口 |
| --- | --- | --- | --- |
| 1 | 事故总览 | AccidentOverview.vue | `GET /api/hse/accident-analysis/overview` |
| 2 | 事故分类分析 | AccidentClassification.vue | `GET /api/hse/accident-analysis/classification` |
| 3 | 事故趋势 | AccidentTrend.vue | `GET /api/hse/accident-analysis/trend` |
| 4 | 责任人员分析 | ResponsibleAnalysis.vue | `GET /api/hse/accident-analysis/responsible` |
| 5 | 事故关联风险画像 | ResponsibleAnalysis.vue 内跳转 | 跳转 Sprint6.4-A 员工风险画像详情 |

### 3.2 事故总览 (AccidentOverview)
**展示内容**
- 主要指标（4 个卡片）：
  - 事故总数 `totalCount`
  - 涉及人数 `involvedCount`
  - 责任人数 `responsibleCount`
  - 重大事故数量 `majorCount`
- 次要指标（3 个统计项）：
  - 死亡人数 `totalCasualties`
  - 受伤人数 `totalInjuries`
  - 经济损失 `totalLoss`

**数据结构**
```typescript
interface OverviewData {
  totalCount: number;
  involvedCount: number;
  responsibleCount: number;
  majorCount: number;
  totalCasualties: number;
  totalInjuries: number;
  totalLoss: number;
  typeDistribution: TypeDistributionItem[];
  levelDistribution: LevelDistributionItem[];
  statusDistribution: StatusDistributionItem[];
}
```

### 3.3 事故分类分析 (AccidentClassification)
**展示内容**
- 两大分类汇总卡片：生产安全事故 / 交通事故（数量、责任数、伤亡、损失、重大数）
- ECharts 柱状图：按 `accident_type` 类型明细对比
- ECharts 环形图：按事故等级（重大/较大/一般/轻微）分布
- 乡镇/单位 TOP20 分布列表

**分类规则 SQL**
```sql
CASE
  WHEN accident_type = '交通事故' THEN '交通事故'
  ELSE '生产安全事故'
END AS category
```

### 3.4 事故趋势 (AccidentTrend)
**展示内容**
- 周期切换：年度（近 5 年）/ 月度（指定年份 12 个月）
- ECharts 折线图：事故总数 + 责任事故数双线对比
- ECharts 柱状图：分类趋势对比（生产安全 vs 交通事故）
- 年份选择器（月度趋势时显示）

**关键参数**
```typescript
interface TrendParams {
  period: 'year' | 'month';
  year?: number; // period=month 时使用
}
```

### 3.5 责任人员分析 (ResponsibleAnalysis)
**展示内容**
- ECharts 横向柱状图：责任人员岗位分布 TOP20
- ECharts 横向柱状图：责任人员部门分布 TOP20
- TOP 责任人员列表：按责任事故次数排序，TOP20
- 关联员工列表：分页展示与事故关联的员工，支持跳转风险画像

**跳转风险画像逻辑**
```typescript
function handleEmployeeClick(employeeId: number) {
  router.push(`/hse-advanced/risk-profile/${employeeId}`);
}
```

> 关联条件：`accidents.personnel_id::bigint = employee.id`，并对 `personnel_id` 做正则校验 `^[0-9]+$` 避免非法字符串转换报错。

---

## 四、技术架构

### 4.1 后端架构
- 框架：Node.js + Express
- 数据库：PostgreSQL
- 路由文件：[server/routes/hse-accident-analysis.js](file:///f:/deploy/hse-dashboard/server/routes/hse-accident-analysis.js)
- 路由前缀：`/api/hse/accident-analysis`
- 注册位置：[server/app.js](file:///f:/deploy/hse-dashboard/server/app.js)

### 4.2 前端架构
- 技术栈：Vue 3 + TypeScript + Vite + Ant Design Vue + ECharts
- 路由配置：[hse-advanced.ts](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules/hse-advanced.ts)
- API 封装：[accident-analysis.ts](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/api/hse/accident-analysis.ts)
- 页面目录：`src/views/hse/accident-analysis/`

**页面结构**
```
accident-analysis/
├── index.vue                    # 主页面（集成 4 个模块）
├── AccidentOverview.vue         # 事故总览
├── AccidentClassification.vue   # 事故分类分析
├── AccidentTrend.vue            # 事故趋势
└── ResponsibleAnalysis.vue      # 责任人员分析（含跳转画像）
```

### 4.3 数据加载策略
- 主页面 `onMounted` 并行加载 4 个接口数据
- 趋势模块通过 `@period-change` 事件触发重新加载
- 责任人员分页通过 `loadResponsible(params)` 重新请求

### 4.4 组件通信
```
index.vue
  ├── AccidentOverview    :data="overviewData"
  ├── AccidentClassification :data="classificationData"
  ├── AccidentTrend       :data="trendData" @period-change="handlePeriodChange"
  └── ResponsibleAnalysis :data="responsibleData" :loading="loading.responsible"
                           @employee-click="handleEmployeeClick"
```

---

## 五、数据库设计

### 5.1 复用现有表（无新增）
| 表名 | 用途 | 是否修改 |
| --- | --- | --- |
| `accidents` | 事故主表 | 否（只读） |
| `employee` | 员工主数据 | 否（只读） |
| `employee_assignment` | 员工岗位/部门归属 | 否（只读） |
| `position` | 岗位 | 否（只读） |
| `hse_org_unit` | 组织单元（部门） | 否（只读） |

### 5.2 关键字段说明
| 字段 | 来源表 | 用途 |
| --- | --- | --- |
| `accident_type` | accidents | 事故类型，决定分类（交通事故 vs 生产安全） |
| `level` | accidents | 事故等级（重大/较大/一般/轻微） |
| `responsibility_level` | accidents | 责任等级（"责任"判定） |
| `personnel_id` | accidents | 关联 employee.id（字符串需正则校验） |
| `involved_person` | accidents | 涉及人员姓名（辅助统计） |
| `casualties` / `injuries` | accidents | 伤亡/受伤人数 |
| `loss_amount` | accidents | 经济损失 |

---

## 六、接口清单

| 接口 | 方法 | 路径 | 说明 |
| --- | --- | --- | --- |
| 事故分析总览 | GET | `/api/hse/accident-analysis/overview` | 4 主指标 + 3 次要指标 + 分布数据 |
| 事故趋势 | GET | `/api/hse/accident-analysis/trend` | 支持 period=year/month |
| 事故分类 | GET | `/api/hse/accident-analysis/classification` | 分类 + 等级 + 乡镇分布 |
| 责任人员 | GET | `/api/hse/accident-analysis/responsible` | TOP20 + 岗位/部门分布 + 关联员工分页 |

> 详细接口字段见《事故分析接口文档.md》

---

## 七、限制与边界

### 7.1 禁止事项（沿用全局约束）
- ❌ 禁止修改风险评分模型
- ❌ 禁止修改岗位权重
- ❌ 禁止新增车辆绑定模型
- ❌ 禁止扩展环境管理模块（环境污染事故仅保留字段）
- ❌ 禁止修改 employee / employee_assignment / hse_responsibility 表

### 7.2 设计边界
- 本中心为只读分析模块，不提供事故录入、修改、删除功能
- 事故数据维护仍在原"事故管理"模块（`/api/accidents`）进行
- 事故分类规则固定为 2 类（生产安全/交通事故），不开放配置
- 责任人员 TOP 列表硬编码为 20 条，不支持自定义

---

## 八、验收要点

| 序号 | 验收项 | 验收标准 |
| --- | --- | --- |
| 1 | 路由可访问 | `/hse-advanced/accident-analysis` 正常加载 |
| 2 | 4 个接口可用 | overview/trend/classification/responsible 返回 code=0 |
| 3 | 4 个模块渲染 | 总览/分类/趋势/责任人员正常展示 |
| 4 | 趋势周期切换 | 年度/月度切换无报错，年份选择器正常 |
| 5 | 跳转风险画像 | 责任人员列表点击可跳转 `/hse-advanced/risk-profile/:id` |
| 6 | 权限控制 | 不同角色看到的数据范围符合预期 |
| 7 | 不修改既有表 | employee/employee_assignment/hse_responsibility 无变更 |

---

## 九、交付物

| 类型 | 文件 |
| --- | --- |
| 后端路由 | [server/routes/hse-accident-analysis.js](file:///f:/deploy/hse-dashboard/server/routes/hse-accident-analysis.js) |
| 路由注册 | [server/app.js](file:///f:/deploy/hse-dashboard/server/app.js) |
| 前端 API | [accident-analysis.ts](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/api/hse/accident-analysis.ts) |
| 前端页面 | [accident-analysis/](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/hse/accident-analysis/index.vue) |
| 路由配置 | [hse-advanced.ts](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules/hse-advanced.ts) |
| 设计报告 | Sprint6.4-C事故分析中心设计报告.md |
| 指标字典 | 事故风险指标字典.md |
| 接口文档 | 事故分析接口文档.md |
| 验收报告 | Sprint6.4-C验收报告.md |

---

## 十、后续规划

本 Sprint 完成后，Sprint6.4 系列（A 员工风险画像、B 驾驶员风险中心、C 事故分析中心）已全部交付。后续可考虑：

1. **事故深度归因分析**：结合隐患整改、培训记录、设备巡检等数据，做事故根因分析
2. **事故预警模型**：基于历史事故趋势 + 员工风险画像，预测高风险员工/岗位
3. **环境事故纳入**：当环境管理模块扩展时，将环境污染事故纳入本中心统计维度
