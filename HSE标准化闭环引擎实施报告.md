# HSE标准化闭环引擎实施报告

## 一、项目概述

### 1.1 项目背景

本项目是宁津环卫HSE安全管理系统数字化升级的第四阶段，旨在构建HSE标准化闭环引擎，实现安全生产标准化闭环管理。

### 1.2 阶段目标

基于已有的7张业务表（hse_events、hse_event_links、hse_event_timeline、hse_risk_factors、hse_control_measures、hse_rectifications、hse_reviews），建立完整的闭环追溯体系：

- **风险对象 → 危险因素 → 控制措施 → 检查计划 → 隐患 → 整改 → 复查**

### 1.3 实施原则

严格遵守增量原则，**不修改已有46张业务表**，仅通过新增表、视图和扩展字段实现功能。

---

## 二、数据库新增

### 2.1 新增表结构

#### 2.1.1 hse_inspection_plans（检查计划表）

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | BIGSERIAL | 主键 |
| plan_code | VARCHAR(64) | 计划编号（唯一） |
| plan_name | VARCHAR(255) | 计划名称 |
| risk_source_id | BIGINT | 关联风险源ID |
| department_id | BIGINT | 关联部门ID |
| cycle_type | VARCHAR(32) | 周期类型（daily/weekly/monthly/quarterly/annual） |
| start_date | DATE | 开始日期 |
| end_date | DATE | 结束日期 |
| status | VARCHAR(32) | 状态（active/inactive） |
| created_by | BIGINT | 创建人 |
| created_at | TIMESTAMPTZ | 创建时间 |
| updated_at | TIMESTAMPTZ | 更新时间 |
| is_deleted | BOOLEAN | 删除标记 |

**索引设计：**
- `idx_hse_inspection_plans_source`：risk_source_id
- `idx_hse_inspection_plans_dept`：department_id
- `idx_hse_inspection_plans_status`：status

#### 2.1.2 hse_risk_objects（风险对象表）

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | BIGSERIAL | 主键 |
| object_name | VARCHAR(255) | 对象名称 |
| object_type | VARCHAR(64) | 对象类型（facility/equipment/process/area/person） |
| department_id | BIGINT | 关联部门ID |
| location | VARCHAR(255) | 位置 |
| description | TEXT | 描述 |
| risk_level | VARCHAR(16) | 风险等级 |
| is_active | BOOLEAN | 是否激活 |
| created_by | BIGINT | 创建人 |
| created_at | TIMESTAMPTZ | 创建时间 |
| updated_at | TIMESTAMPTZ | 更新时间 |
| is_deleted | BOOLEAN | 删除标记 |

**索引设计：**
- `idx_hse_risk_objects_type`：object_type
- `idx_hse_risk_objects_dept`：department_id

### 2.2 新增视图

#### 2.2.1 hse_event_chain_view（闭环查询视图）

**功能：** 用于查询完整的闭环链路，支持风险→措施→检查→隐患→整改→复查的完整追溯。

**查询逻辑：**

```sql
WITH recursive event_chain AS (
    -- 起始节点：当前事件
    SELECT e.*, 0 AS depth, ARRAY[e.id] AS path FROM hse_events e
    
    UNION ALL
    
    -- 递归关联：子事件链
    SELECT e.*, ec.depth + 1, ec.path || e.id 
    FROM hse_events e
    JOIN event_chain ec ON e.parent_event_id = ec.event_id
)
SELECT 
    ec.*,
    rf.factor_code, rf.name AS risk_factor_name,
    cm.measure_code, cm.name AS measure_name,
    ip.plan_code, ip.plan_name,
    ro.object_name, ro.object_type,
    r.source_id AS risk_source_code, r.name AS risk_source_name,
    d.name AS department_name
FROM event_chain ec
LEFT JOIN hse_risk_factors rf ON ec.risk_source_id = rf.risk_source_id
LEFT JOIN hse_control_measures cm ON rf.id = cm.risk_factor_id
LEFT JOIN hse_inspection_plans ip ON cm.inspection_plan_id = ip.id
LEFT JOIN hse_risk_objects ro ON rf.risk_object_id = ro.id
LEFT JOIN risk_sources r ON ec.risk_source_id = r.id
LEFT JOIN departments d ON ec.department_id = d.id
ORDER BY ec.depth ASC, ec.occurred_at ASC;
```

---

## 三、关联关系完善

### 3.1 闭环链路结构

```
风险对象 (hse_risk_objects)
    ↓ (risk_object_id)
危险因素 (hse_risk_factors)
    ↓ (risk_factor_id)
控制措施 (hse_control_measures)
    ↓ (inspection_plan_id)
检查计划 (hse_inspection_plans)
    ↓ (source_id)
隐患事件 (hse_events[event_type='hazard'])
    ↓ (parent_event_id)
整改记录 (hse_rectifications)
    ↓ (rectification_id)
复查记录 (hse_reviews)
```

### 3.2 字段扩展

| 表名 | 新增字段 | 类型 | 说明 |
|------|----------|------|------|
| hse_events | business_area | VARCHAR(64) | 业务领域 |
| hse_events | risk_level_snapshot | VARCHAR(16) | 风险等级快照 |
| hse_risk_factors | risk_object_id | BIGINT | 关联风险对象 |
| hse_control_measures | inspection_plan_id | BIGINT | 关联检查计划 |
| hse_rectifications | inspection_plan_id | BIGINT | 关联检查计划 |
| hse_reviews | risk_source_id | BIGINT | 关联风险源 |

---

## 四、闭环接口开发

### 4.1 接口列表

| 接口路径 | HTTP方法 | 功能描述 |
|----------|----------|----------|
| `/api/hse/chain/:eventId` | GET | 获取事件完整闭环链路 |
| `/api/hse/chain/link` | POST | 建立事件关联关系 |
| `/api/hse/chain/view` | GET | 查询闭环视图 |
| `/api/hse/chain/risk/:riskSourceId` | GET | 获取风险源完整闭环信息 |

### 4.2 接口详情

#### GET /api/hse/chain/:eventId

**功能：** 获取事件完整闭环链路，包括向上追溯和向下延伸。

**返回结构：**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "current_event": { ... },
    "upstream_chain": [...],      // 上游追溯（原因链）
    "downstream_chain": [...],    // 下游处置（措施链）
    "risk_source": { ... },
    "risk_factors": [...],
    "control_measures": [...],
    "inspection_plans": [...],
    "risk_objects": [...],
    "rectifications": [...],
    "reviews": [...],
    "department": { ... },
    "links": [...],
    "chain_summary": {
      "total_nodes": 5,
      "risk_level": "红色",
      "department_name": "作业中心",
      "has_closed": true,
      "is_complete": true
    }
  }
}
```

#### POST /api/hse/chain/link

**功能：** 建立事件关联关系

**请求参数：**

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| from_event_id | BIGINT | 是 | 源事件ID |
| to_event_id | BIGINT | 是 | 目标事件ID |
| link_type | VARCHAR | 是 | 关联类型 |
| description | TEXT | 否 | 关联说明 |

**关联类型：**

| 类型 | 说明 |
|------|------|
| triggered_by | 由...触发 |
| led_to | 导致... |
| caused_by | 根因是... |
| related_to | 相关联 |
| derived_from | 派生自 |

---

## 五、前端新增功能

### 5.1 HSE闭环追踪页面

**页面路径：** `/hse/chain`

**功能模块：**

#### 5.1.1 搜索栏

- 输入事件编号或标题搜索
- 支持按事件编号、标题、风险源三种类型搜索

#### 5.1.2 当前事件信息

展示当前事件的详细信息：
- 事件编号、类型、严重等级、状态
- 发生时间、责任部门、风险等级快照
- 业务领域、关联风险源

#### 5.1.3 流程图展示

可视化展示闭环链路：
- 上游追溯（原因链）：从当前事件向上追溯
- 当前节点：高亮显示
- 下游处置（措施链）：从当前事件向下延伸

#### 5.1.4 详细信息

- **风险源信息**：风险源编号、名称、等级、位置
- **责任部门**：部门名称、简称
- **危险因素**：编号、名称、类别、风险等级、管控状态
- **控制措施**：编号、名称、类型、责任人
- **整改记录**：编号、整改措施、状态、责任人、超期状态
- **复查记录**：编号、复查人、结果、评分、复发状态

#### 5.1.5 链路统计

- 节点总数
- 风险等级
- 责任部门
- 闭环状态（已闭环/未闭环）

---

## 六、测试验证

### 6.1 测试结果

| 测试项 | 结果 |
|--------|------|
| hse_inspection_plans 表存在 | ✓ 通过 |
| hse_risk_objects 表存在 | ✓ 通过 |
| hse_event_chain_view 视图存在 | ✓ 通过 |
| hse_events.business_area 字段存在 | ✓ 通过 |
| hse_events.risk_level_snapshot 字段存在 | ✓ 通过 |
| hse_risk_factors.risk_object_id 字段存在 | ✓ 通过 |
| hse_control_measures.inspection_plan_id 字段存在 | ✓ 通过 |
| 风险对象→危险因素 关联有效 | ✓ 通过 |
| 危险因素→控制措施 关联有效 | ✓ 通过 |
| 控制措施→检查计划 关联有效 | ✓ 通过 |
| 事故→隐患 追溯有效 | ✓ 通过 |
| 隐患→风险源 追溯有效 | ✓ 通过 |
| 风险源→控制措施 追溯有效 | ✓ 通过 |
| 闭环视图查询有效 | ✓ 通过 |

**测试结论：** 所有14项测试全部通过，闭环引擎功能正常。

### 6.2 验证要点

1. **事故追溯到隐患**：通过 `risk_source_id` 关联，可从事故事件追溯到同一风险源下的隐患事件
2. **隐患追溯到风险**：通过 `risk_source_id` 关联，可从隐患事件追溯到对应的风险源及危险因素
3. **风险追溯到控制措施**：通过 `risk_source_id → risk_factor_id → control_measures` 关联链，可从风险源追溯到控制措施

---

## 七、实施文件清单

### 7.1 后端文件

| 文件路径 | 说明 |
|----------|------|
| `server/routes/hse-chain.js` | 闭环引擎路由 |
| `server/app.js` | 路由注册（新增引用） |
| `server/sql/hse_chain_v42_migration.sql` | SQL迁移脚本 |

### 7.2 前端文件

| 文件路径 | 说明 |
|----------|------|
| `安全看板vben/apps/web-antd/src/api/hse/chain.ts` | 闭环API接口定义 |
| `安全看板vben/apps/web-antd/src/views/hse/chain/index.vue` | 闭环追踪页面 |
| `安全看板vben/apps/web-antd/src/router/routes/modules/hse-chain.ts` | 路由配置 |

### 7.3 测试文件

| 文件路径 | 说明 |
|----------|------|
| `server/test/hse-chain-test.js` | 闭环引擎测试脚本 |
| `server/test/migrate-full.js` | 完整迁移脚本 |

---

## 八、总结

### 8.1 完成内容

1. **数据库层**：新增2张表（hse_inspection_plans、hse_risk_objects），创建1个闭环查询视图（hse_event_chain_view），扩展6个关联字段
2. **关联关系**：建立完整的闭环链路（风险对象→危险因素→控制措施→检查计划→隐患→整改→复查）
3. **接口层**：开发4个闭环接口，支持链路查询和关系建立
4. **前端层**：新增HSE闭环追踪页面，支持流程图可视化展示
5. **测试验证**：编写测试脚本，验证闭环追溯能力

### 8.2 技术特点

- **增量设计**：严格遵守不修改已有表的原则，仅通过新增和扩展实现
- **递归查询**：使用PostgreSQL递归CTE实现完整链路追溯
- **索引优化**：为关键关联字段添加索引，提升查询性能
- **可视化展示**：前端采用流程图形式直观展示闭环链路

### 8.3 后续建议

1. **数据初始化**：需要批量导入历史风险对象、检查计划等数据
2. **自动化流程**：考虑实现检查计划自动生成、隐患自动关联等功能
3. **统计分析**：基于闭环视图开发统计报表，分析闭环率、整改周期等指标
4. **移动端适配**：开发移动端闭环追踪功能

---

**版本：** v4.2  
**日期：** 2026-07-11  
**状态：** 已完成