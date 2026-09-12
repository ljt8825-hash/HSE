# HSE 数据基础层实施报告

> **阶段名称**：HSE数据基础层落地实施
> **执行日期**：2026-07-11
> **版本**：v4.2
> **状态**：已完成

---

## 阶段名称

**HSE数据基础层落地实施**

---

## 完成内容

### 一、数据库新增（7张核心表）

| # | 表名 | 用途 | 状态 |
|---|------|------|------|
| 1 | `hse_events` | 统一安全事件中心表 | ✅ 已创建 |
| 2 | `hse_event_links` | 事件关联关系表 | ✅ 已创建 |
| 3 | `hse_event_timeline` | 事件处置时间线表 | ✅ 已创建 |
| 4 | `hse_risk_factors` | 危险因素表 | ✅ 已创建 |
| 5 | `hse_control_measures` | 控制措施表 | ✅ 已创建 |
| 6 | `hse_rectifications` | 整改记录表 | ✅ 已创建 |
| 7 | `hse_reviews` | 复查记录表 | ✅ 已创建 |

### 二、接口开发

| # | 接口 | 方法 | 功能 | 状态 |
|---|------|------|------|------|
| 1 | `/api/hse/events` | GET | 事件列表查询（支持多维度筛选） | ✅ 已完成 |
| 2 | `/api/hse/events/:id` | GET | 事件详情查询（含源数据+时间线） | ✅ 已完成 |
| 3 | `/api/hse/events/stats` | GET | 事件统计接口（按类型/严重度/状态） | ✅ 已完成 |
| 4 | `/api/hse/events/sync` | POST | 手动触发事件同步 | ✅ 已完成 |
| 5 | `/api/hse/events/batch-sync` | POST | 批量同步（hazards/accidents） | ✅ 已完成 |
| 6 | `/api/hse/events/:id/timeline` | POST | 创建时间线记录 | ✅ 已完成 |
| 7 | `/api/hse/events/:id/link` | POST | 创建事件关联 | ✅ 已完成 |

### 三、数据同步服务

| 模块 | 同步方向 | 实现方式 | 状态 |
|------|----------|----------|------|
| hazards | → hse_events | 应用层异步同步 | ✅ 已集成 |
| accidents | → hse_events | 应用层异步同步 | ✅ 已集成 |

### 四、前端页面

| 页面 | 路径 | 功能 | 状态 |
|------|------|------|------|
| HSE事件中心 | `/hse/events` | 事件列表+统计+详情+筛选 | ✅ 已完成 |

---

## 修改文件

### 后端文件（6个）

| 文件 | 操作 | 说明 |
|------|------|------|
| `server/sql/hse_core_v1_migration.sql` | 新增 | 数据库迁移脚本（7张表） |
| `server/services/hseEventSyncService.js` | 新增 | 事件同步服务（hazards/accidents） |
| `server/routes/hse-events.js` | 新增 | HSE事件中心路由（7个接口） |
| `server/routes/hazards.js` | 修改 | 集成事件同步（创建时触发） |
| `server/routes/accidents.js` | 修改 | 集成事件同步（创建时触发） |
| `server/app.js` | 修改 | 注册新路由 |

### 前端文件（3个）

| 文件 | 操作 | 说明 |
|------|------|------|
| `apps/web-antd/src/api/hse/events.ts` | 新增 | HSE事件API封装 |
| `apps/web-antd/src/views/hse/events/index.vue` | 新增 | HSE事件中心页面 |
| `apps/web-antd/src/router/routes/modules/hse-events.ts` | 新增 | 路由模块 |

### 测试文件（1个）

| 文件 | 操作 | 说明 |
|------|------|------|
| `server/tests/hse-events.test.js` | 新增 | 集成测试（隐患同步、事故同步、事件关联） |

---

## 数据库变化

### 新增表结构

#### hse_events（统一安全事件表）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | BIGSERIAL | PK | 主键 |
| event_code | VARCHAR(64) | UNIQUE NOT NULL | 事件编号 SE-YYYYMMDD-NNNNN |
| event_type | VARCHAR(32) | NOT NULL | 事件类型（hazard/accident/...） |
| source_table | VARCHAR(64) | NOT NULL | 源业务表名 |
| source_id | BIGINT | NOT NULL | 源业务表记录ID |
| title | VARCHAR(255) | NOT NULL | 事件标题 |
| severity | VARCHAR(16) | NOT NULL | 严重等级（critical/major/minor/info） |
| status | VARCHAR(32) | NOT NULL | 状态（open/processing/resolved/closed） |
| occurred_at | TIMESTAMPTZ | NOT NULL | 发生时间 |
| department_id | BIGINT | | 部门ID |
| personnel_id | BIGINT | | 人员ID |
| vehicle_id | BIGINT | | 车辆ID |
| risk_source_id | BIGINT | | 风险源ID |
| parent_event_id | BIGINT | | 上游事件ID |
| created_at | TIMESTAMPTZ | NOT NULL | 创建时间 |
| updated_at | TIMESTAMPTZ | NOT NULL | 更新时间 |
| is_deleted | BOOLEAN | NOT NULL DEFAULT FALSE | 软删除 |

**索引**：
- `idx_hse_events_type` - 按事件类型
- `idx_hse_events_status` - 按状态
- `idx_hse_events_severity` - 按严重等级
- `idx_hse_events_occurred` - 按发生时间
- `idx_hse_events_dept` - 按部门
- `idx_hse_events_person` - 按人员
- `idx_hse_events_vehicle` - 按车辆
- `uk_hse_events_source` - 源记录唯一约束

#### 其他表字段（见SQL文件）

- `hse_event_links`: from_event_id, to_event_id, link_type, description
- `hse_event_timeline`: event_id, action, actor_id, actor_name, from_status, to_status, comment
- `hse_risk_factors`: factor_code, risk_source_id, name, category, risk_value, risk_level
- `hse_control_measures`: measure_code, risk_factor_id, type, name, responsible_person_id
- `hse_rectifications`: rect_code, hazard_id, event_id, measure, status, deadline
- `hse_reviews`: review_code, rectification_id, result, is_recurred, new_hazard_id

### 索引创建（15个）

- hse_events: 9个索引（类型、状态、严重度、时间、部门、人员、车辆、父事件、源唯一）
- hse_event_links: 2个索引（from_event_id, to_event_id）
- hse_event_timeline: 1个索引（event_id）
- hse_risk_factors: 2个索引（risk_source_id, risk_level）
- hse_control_measures: 1个索引（risk_factor_id）

### 未修改现有表

✅ **遵守增量设计原则**：所有 46 张现有业务表保持不变，无字段修改、无外键添加、无数据迁移。

---

## API变化

### 新增接口（7个）

#### 1. GET /api/hse/events - 事件列表查询

**查询参数**：
- event_type: 事件类型
- severity: 严重等级
- status: 状态
- department_id: 部门ID
- personnel_id: 人员ID
- vehicle_id: 车辆ID
- risk_source_id: 风险源ID
- start_date: 开始日期
- end_date: 结束日期
- page: 页码
- page_size: 每页数量

**响应示例**：
```json
{
  "success": true,
  "data": {
    "list": [...],
    "pagination": { "page": 1, "page_size": 20, "total": 100 }
  }
}
```

#### 2. GET /api/hse/events/:id - 事件详情

**响应包含**：
- 事件基本信息
- source_data: 源业务表数据
- timeline: 处置时间线
- links: 关联事件列表

#### 3. GET /api/hse/events/stats - 事件统计

**响应包含**：
- total: 总数（含 open/processing/resolved/closed）
- by_type: 按事件类型统计
- by_severity: 按严重等级统计
- by_status: 按状态统计
- daily_trend: 近30天趋势

#### 4. POST /api/hse/events/sync - 手动同步

**请求体**：
```json
{ "type": "hazard", "source_id": 123 }
```

#### 5. POST /api/hse/events/batch-sync - 批量同步

**请求体**：
```json
{ "type": "all", "limit": 100 }
```

#### 6. POST /api/hse/events/:id/timeline - 创建时间线

**请求体**：
```json
{
  "action": "processed",
  "actor_id": 1,
  "actor_name": "张三",
  "from_status": "open",
  "to_status": "processing",
  "comment": "开始处理"
}
```

#### 7. POST /api/hse/events/:id/link - 创建关联

**请求体**：
```json
{
  "target_event_id": 456,
  "link_type": "caused_by",
  "description": "事故由隐患引发"
}
```

### 修改接口（2个）

#### hazards 路由（POST /api/hazards）

- **新增行为**：创建隐患后自动异步同步到 `hse_events`
- **无破坏性变更**：接口签名和响应格式不变

#### accidents 路由（POST /api/accidents）

- **新增行为**：创建事故后自动异步同步到 `hse_events`
- **无破坏性变更**：接口签名和响应格式不变

---

## 前端变化

### 新增页面

#### HSE事件中心（/hse/events）

**功能模块**：
1. **统计卡片**：总事件数、待处理、处理中、已闭环
2. **分类统计**：事件类型分布、严重等级分布（点击可筛选）
3. **筛选栏**：事件类型、严重等级、状态、日期范围
4. **事件列表**：表格展示，支持分页、排序
5. **详情弹窗**：事件详情 + 处置时间线 + 关联事件

**技术实现**：
- Vue 3 Composition API
- Ant Design Vue 组件
- 响应式数据流（ref/reactive）
- 日期格式化（dayjs）

### 新增路由

```typescript
{
  path: '/hse/events',
  name: 'HseEventCenter',
  component: () => import('#/views/hse/events/index.vue'),
  meta: { title: 'HSE事件中心', icon: 'ant-design:alert-outlined' }
}
```

### 新增API模块

- `events.ts`: 8个接口函数 + 3个常量映射（EVENT_TYPES/SEVERITY_LEVELS/STATUS_MAP）

---

## 测试结果

### 单元测试覆盖

| 测试项 | 用例数 | 通过 | 失败 |
|--------|--------|------|------|
| 隐患同步测试 | 2 | 2 | 0 |
| 事故同步测试 | 1 | 1 | 0 |
| 事件关联测试 | 2 | 2 | 0 |
| 事件统计测试 | 1 | 1 | 0 |
| **合计** | **6** | **6** | **0** |

### 集成测试验证

#### ✅ 验证项1：新增隐患后是否生成对应hse_event

**测试步骤**：
1. POST /api/hazards 创建隐患（level='重大'）
2. 等待500ms（异步同步）
3. GET /api/hse/events?source_table=hazards&source_id=xxx

**验证结果**：
- ✅ hse_events 表存在记录
- ✅ event_type = 'hazard'
- ✅ severity = 'critical'（'重大'映射正确）
- ✅ source_table = 'hazards'
- ✅ source_id = 隐患ID

#### ✅ 验证项2：事故是否可以关联风险

**测试步骤**：
1. POST /api/accidents 创建事故
2. 验证 hse_events 表存在记录
3. POST /api/hse/events/:id/link 创建关联（link_type='caused_by'）

**验证结果**：
- ✅ 事故同步到 hse_events
- ✅ severity = 'major'（'较大'映射正确）
- ✅ 可通过 link 接口创建事件关联
- ✅ 详情接口返回 source_data 和 timeline

#### ✅ 验证项3：事件统计接口

**测试结果**：
- ✅ 返回总数、按类型统计、按严重度统计
- ✅ 各维度数据与实际记录一致

### 手动验证

| 验证项 | 结果 | 备注 |
|--------|------|------|
| 数据库迁移脚本执行 | ✅ 通过 | 无错误 |
| 后端服务启动 | ✅ 通过 | 无错误 |
| 路由注册成功 | ✅ 通过 | /api/hse/events 可访问 |
| 前端页面渲染 | ✅ 通过 | 无编译错误 |
| API请求正常 | ✅ 通过 | 响应格式符合预期 |
| 现有功能无影响 | ✅ 通过 | 旧接口正常工作 |

---

## 存在问题

### 已知限制

| 问题 | 影响 | 计划 |
|------|------|------|
| hse_events 表未分区 | 大数据量下性能风险 | 下一阶段实现按年分区 |
| 未实现 PUT 更新事件接口 | 无法修改事件属性 | 下一阶段补充 |
| 前端页面未实现导出功能 | 无法导出事件列表 | 下一阶段补充 |
| 批量同步未做定时任务 | 需手动触发历史数据同步 | 下一阶段实现定时同步 |

### 待优化项

| 优化点 | 说明 | 优先级 |
|--------|------|--------|
| 增加事件状态变更通知 | 重大事件实时推送到WebSocket | P1 |
| 增加事件搜索索引 | 全文搜索事件标题/描述 | P2 |
| 优化批量同步性能 | 并行处理 + 批量插入 | P2 |
| 增加事件导出API | 导出PDF/Excel报告 | P2 |

### 遗留技术债

无。本阶段严格遵守增量设计原则，未引入破坏性变更。

---

## 下一步建议

### 第四阶段：风险闭环实现

**目标**：实现"风险源→危险因素→控制措施→检查计划→隐患→整改→复查"完整闭环

**工作内容**：

1. **数据模型完善**
   - 完善 `hse_risk_factors` 关联逻辑（risk_source_id → risk_sources.id）
   - 完善 `hse_control_measures` 关联逻辑（risk_factor_id → hse_risk_factors.id）
   - 建立 `hse_inspection_plans` 检查计划表（未创建）

2. **同步服务扩展**
   - 风险源同步到 `hse_risk_factors`
   - 隐患整改同步到 `hse_rectifications`
   - 复查记录同步到 `hse_reviews`

3. **闭环链路接口**
   - GET /api/hse/chain/:eventId - 获取完整闭环链路
   - POST /api/hse/chain/link - 建立闭环关联

4. **前端闭环可视化**
   - 闭环链路图（树形/流程图）
   - 闭环状态追踪面板

5. **定时任务**
   - 每日同步历史数据（hazards/accidents 未同步记录）
   - 每小时刷新事件统计物化视图

### 建议优先级

| 优先级 | 工作项 | 预计工时 |
|--------|--------|----------|
| P0 | 数据库分区（hse_events 按年分区） | 0.5人天 |
| P0 | PUT 更新事件接口 | 0.5人天 |
| P1 | 定时同步历史数据 | 1人天 |
| P1 | 风险闭环链路接口 | 2人天 |
| P2 | 闭环可视化前端 | 2人天 |
| P2 | 事件导出功能 | 1人天 |

---

## 附录：文件清单

### 后端文件（6个）

```
server/
├── sql/
│   └── hse_core_v1_migration.sql        # 数据库迁移脚本
├── services/
│   └── hseEventSyncService.js           # 事件同步服务
├── routes/
│   ├── hse-events.js                    # HSE事件中心路由
│   ├── hazards.js                       # 隐患路由（已修改）
│   └── accidents.js                     # 事故路由（已修改）
├── tests/
│   └── hse-events.test.js               # 集成测试
└── app.js                               # 主入口（已修改）
```

### 前端文件（3个）

```
apps/web-antd/src/
├── api/hse/
│   ├── events.ts                        # HSE事件API
│   └── index.ts                         # 已修改（导出events）
├── views/hse/events/
│   └── index.vue                        # HSE事件中心页面
└── router/routes/modules/
    └── hse-events.ts                    # 路由模块
```

---

**报告生成时间**：2026-07-11
**报告人**：高级软件架构师
**下一阶段**：第四阶段 — 风险闭环实现