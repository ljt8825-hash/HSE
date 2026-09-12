# Sprint11-3-A HSE平台动态能力基础设计报告

**报告版本**: v1.0  
**生成日期**: 2026-07-25  
**所属项目**: HSE安全看板系统  
**设计周期**: Sprint11-3-A  

---

## 一、动态规则模型（assessment_rule）

### 1.1 设计目标

为未来「规则中心」升级准备数据模型和基础API，支持：
- 规则版本管理（多版本并存、历史追溯）
- 规则明细配置（可扩展的扣分项定义）
- 适用岗位绑定（按岗位差异化规则）
- 生效时间控制（定时生效、自动过期）
- 模块隔离（不同业务模块独立规则）

### 1.2 主表结构（assessment_rule）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | BIGSERIAL | PK | 主键 |
| `rule_code` | VARCHAR(128) | UNIQUE NOT NULL | 规则编码，如 `violation_score_v1` |
| `rule_name` | VARCHAR(255) | NOT NULL | 规则名称 |
| `module_code` | VARCHAR(64) | NOT NULL | 所属模块：violation/employee/hazard/assessment |
| `rule_type` | VARCHAR(64) | DEFAULT 'score' | 规则类型：score/deduct/bonus/threshold |
| `version` | VARCHAR(32) | DEFAULT '1.0.0' | 语义化版本号 |
| `description` | TEXT | | 规则说明 |
| `status` | VARCHAR(32) | DEFAULT 'draft' | 状态：draft/active/expired/archived |
| `effective_date` | DATE | | 生效日期 |
| `expiry_date` | DATE | | 失效日期 |
| `applicable_positions` | JSONB | DEFAULT '[]' | 适用岗位编码列表 |
| `applicable_depts` | JSONB | DEFAULT '[]' | 适用部门编码列表 |
| `config` | JSONB | DEFAULT '{}' | 扩展配置（如重复违章倍率） |
| `created_by` | BIGINT | | 创建人ID |
| `updated_by` | BIGINT | | 更新人ID |
| `is_active` | BOOLEAN | DEFAULT TRUE | 是否启用 |
| `is_deleted` | BOOLEAN | DEFAULT FALSE | 软删除标记 |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | 创建时间 |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | 更新时间 |

### 1.3 明细表结构（assessment_rule_detail）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | BIGSERIAL | PK | 主键 |
| `rule_id` | BIGINT | FK NOT NULL | 关联主规则ID |
| `detail_code` | VARCHAR(128) | UNIQUE(rule_id, code) | 明细编码 |
| `detail_name` | VARCHAR(255) | NOT NULL | 明细名称 |
| `violation_type` | VARCHAR(64) | | 三违类型（违章指挥/作业/纪律） |
| `violation_level` | VARCHAR(32) | | 严重程度（严重/一般/轻微） |
| `score_deduct` | INTEGER | DEFAULT 0 | 扣分值 |
| `score_add` | INTEGER | DEFAULT 0 | 加分值（正向激励） |
| `description` | TEXT | | 说明 |
| `conditions` | JSONB | DEFAULT '{}' | 触发条件（可扩展） |
| `sort_order` | INTEGER | DEFAULT 0 | 排序 |
| `is_active` | BOOLEAN | DEFAULT TRUE | 是否启用 |
| `is_deleted` | BOOLEAN | DEFAULT FALSE | 软删除 |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | |

### 1.4 版本管理机制

```
规则版本演进：
  v1.0.0 (draft) → v1.0.0 (active) → v1.1.0 (draft) → v1.1.0 (active)
                           ↓                                    ↓
                        历史版本                              历史版本

规则查询优先级：
  1. 指定 rule_code + 版本号 → 精确查找
  2. 指定 rule_code + status=active → 当前生效版本
  3. 指定 module_code → 该模块所有规则
```

### 1.5 数据库索引

```sql
idx_assessment_rule_module ON assessment_rule(module_code)
idx_assessment_rule_status ON assessment_rule(status)
idx_assessment_rule_detail_rule_id ON assessment_rule_detail(rule_id)
```

---

## 二、三违规则模型（violation_score）

### 2.1 三违规则在系统中的定位

```
config/hseRules/violation-rule.json  ← 当前版本（配置文件）
          ↓ （数据同步）
assessment_rule + assessment_rule_detail  ← 未来规则中心（数据库）
          ↓ （API输出）
业务模块（三违记录 / 考核 / 培训）
```

### 2.2 三违规则初始化数据

**主规则**：
- rule_code: `violation_score_v1`
- rule_name: `三违扣分规则 v1.0`
- module_code: `violation`
- version: `1.0.0`
- status: `active`
- config: `{ repeatOffenseMultiplier: 1.5 }`

**扣分明细**（3条）：

| detail_code | 名称 | 三违类型 | 严重程度 | 扣分 |
|-------------|------|----------|----------|------|
| serious_violation | 严重三违 | 违章指挥 | 严重 | 5 |
| general_violation | 一般三违 | 违章作业 | 一般 | 3 |
| minor_violation | 轻微三违 | 违反劳动纪律 | 轻微 | 1 |

### 2.3 三违规则API

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/hse/dynamic/rules` | 规则列表（分页+筛选） |
| GET | `/api/hse/dynamic/rules/:id` | 规则详情（含明细） |
| POST | `/api/hse/dynamic/rules` | 创建规则 |
| PUT | `/api/hse/dynamic/rules/:id` | 更新规则 |
| DELETE | `/api/hse/dynamic/rules/:id` | 软删除规则 |
| POST | `/api/hse/dynamic/rules/:id/details` | 新增规则明细 |
| PUT | `/api/hse/dynamic/rules/details/:id` | 更新规则明细 |
| DELETE | `/api/hse/dynamic/rules/details/:id` | 软删除规则明细 |

### 2.4 与config配置文件的关系

- **当前版本**：业务代码优先读取 `config/hseRules/violation-rule.json`
- **升级路径**：配置文件 → 数据库表（assessment_rule）→ 规则中心（可视化配置）
- **过渡期**：两者并存，数据库表作为「影子数据源」，API层可选择读取来源

---

## 三、动态筛选模型（hse_filter_config）

### 3.1 设计目标

解决「每个页面硬编码大量筛选项」的问题，支持：
- 新增筛选字段通过配置完成，无需修改前端代码
- 不同模块独立配置筛选器
- 支持多种控件类型（输入框、下拉、日期、树选择等）
- 支持动态数据来源（字典/API/静态选项）

### 3.2 表结构（hse_filter_config）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | BIGSERIAL | PK | 主键 |
| `module_code` | VARCHAR(64) | UNIQUE(module,field) | 模块编码 |
| `field_name` | VARCHAR(128) | UNIQUE(module,field) | 字段名（对应查询参数） |
| `label` | VARCHAR(128) | NOT NULL | 显示标签 |
| `control_type` | VARCHAR(64) | DEFAULT 'input' | 控件类型 |
| `data_source` | VARCHAR(255) | | 数据来源标识 |
| `data_options` | JSONB | DEFAULT '[]' | 静态选项列表 |
| `placeholder` | VARCHAR(255) | | 占位提示文字 |
| `sort_order` | INTEGER | DEFAULT 0 | 排序（越小越靠前） |
| `width` | INTEGER | DEFAULT 200 | 控件宽度（px） |
| `is_visible` | BOOLEAN | DEFAULT TRUE | 是否显示 |
| `is_required` | BOOLEAN | DEFAULT FALSE | 是否必填 |
| `status` | VARCHAR(32) | DEFAULT 'active' | 状态 |
| `remark` | TEXT | | 备注 |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | |

### 3.3 控件类型（control_type）

| 类型 | 说明 | 适用场景 |
|------|------|----------|
| `input` | 文本输入框 | 关键词搜索、姓名、编号 |
| `select` | 下拉选择 | 三违类型、严重程度、状态 |
| `multiSelect` | 多选下拉 | 多条件并列筛选 |
| `rangePicker` | 日期范围 | 违章日期、入职日期 |
| `datePicker` | 单日期 | 具体某一天 |
| `treeSelect` | 树选择 | 组织部门、岗位层级 |
| `cascader` | 级联选择 | 省市区、多层分类 |
| `inputNumber` | 数字输入 | 年龄、数量范围 |
| `radio` | 单选按钮组 | 少量互斥选项 |

### 3.4 数据来源（data_source）

| 格式 | 示例 | 说明 |
|------|------|------|
| `dict:xxx` | `dict:violationType` | 从前端字典表获取 |
| `api:/path` | `api:/api/hse/org-center/dept/tree` | 从指定API获取 |
| `static` | （配合data_options） | 使用静态配置选项 |

### 3.5 初始化数据（7条）

**三违模块（5条）**：

| field_name | label | control_type | sort |
|------------|------|--------------|------|
| keyword | 关键词 | input | 0 |
| violationType | 三违类型 | select | 1 |
| violationLevel | 严重程度 | select | 2 |
| status | 处理状态 | select | 3 |
| dateRange | 日期范围 | rangePicker | 4 |

**人员模块（2条）**：

| field_name | label | control_type | sort |
|------------|------|--------------|------|
| riskLevel | 风险等级 | select | 1 |
| deptId | 所属部门 | treeSelect | 2 |

### 3.6 筛选器API

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/hse/dynamic/filters` | 获取筛选配置（支持moduleCode筛选） |
| POST | `/api/hse/dynamic/filters` | 新增筛选配置 |
| PUT | `/api/hse/dynamic/filters/:id` | 更新筛选配置 |
| DELETE | `/api/hse/dynamic/filters/:id` | 删除筛选配置 |

### 3.7 前端使用方式

```javascript
// 页面加载时获取该模块的筛选配置
const { data: filters } = await get('/api/hse/dynamic/filters', {
  params: { moduleCode: 'violation' }
});

// 动态渲染筛选表单
filters
  .sort((a, b) => a.sortOrder - b.sortOrder)
  .filter(f => f.isVisible)
  .forEach(filter => {
    // 根据 filter.controlType 渲染对应组件
    renderFilterComponent(filter);
  });
```

---

## 四、卡片交互模型（hse_dashboard_card_config）

### 4.1 设计目标

解决「统计卡片点击跳转 + 自动筛选」的通用化问题，支持：
- 卡片点击行为配置化（跳转/筛选/无操作）
- 跳转路由和筛选条件通过配置定义
- 卡片数据源API可配置
- 不同仪表盘（dashboard）独立配置

### 4.2 表结构（hse_dashboard_card_config）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | BIGSERIAL | PK | 主键 |
| `card_code` | VARCHAR(128) | UNIQUE NOT NULL | 卡片编码 |
| `card_title` | VARCHAR(255) | NOT NULL | 卡片标题 |
| `module_code` | VARCHAR(64) | | 所属模块 |
| `dashboard_code` | VARCHAR(64) | DEFAULT 'overview' | 仪表盘编码 |
| `card_type` | VARCHAR(64) | DEFAULT 'stat' | 卡片类型 |
| `icon` | VARCHAR(128) | | 图标（lucide图标名） |
| `color_scheme` | VARCHAR(64) | DEFAULT 'blue' | 配色方案 |
| `data_source_api` | VARCHAR(255) | | 数据来源API路径 |
| `data_source_params` | JSONB | DEFAULT '{}' | API请求参数 |
| `click_action` | VARCHAR(64) | DEFAULT 'none' | 点击行为 |
| `target_route` | VARCHAR(255) | | 目标路由（前端路径） |
| `filter_conditions` | JSONB | DEFAULT '{}' | 跳转后自动筛选的条件 |
| `sort_order` | INTEGER | DEFAULT 0 | 排序 |
| `width` | INTEGER | DEFAULT 1 | 占用宽度（栅格数） |
| `is_visible` | BOOLEAN | DEFAULT TRUE | 是否显示 |
| `status` | VARCHAR(32) | DEFAULT 'active' | 状态 |
| `remark` | TEXT | | 备注 |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | |

### 4.3 卡片类型（card_type）

| 类型 | 说明 | 典型场景 |
|------|------|----------|
| `stat` | 数值统计卡 | 高风险人数、待处理三违数 |
| `chart` | 图表卡 | 三违趋势折线图 |
| `ranking` | 排名卡 | 部门违章排名Top5 |
| `list` | 列表卡 | 最新三违记录 |
| `indicator` | 指标卡 | 安全天数、合规率 |

### 4.4 点击行为（click_action）

| 行为 | 说明 | 跳转后效果 |
|------|------|------------|
| `none` | 无操作 | 纯展示卡片 |
| `route` | 页面跳转 | 跳转到 target_route，不携带筛选 |
| `route_with_filter` | 跳转+筛选 | 跳转到 target_route，自动应用 filter_conditions |
| `modal` | 弹窗详情 | 在当前页弹出详情面板 |
| `fullscreen` | 全屏图表 | 进入全屏模式查看 |

### 4.5 初始化数据（5张卡片）

| card_code | 标题 | 类型 | 点击行为 | 目标路由 | 自动筛选 |
|-----------|------|------|----------|----------|----------|
| high_risk_employees | 高风险人员 | stat | route_with_filter | /employee/list | riskLevel=高 |
| pending_violations | 待处理三违 | stat | route_with_filter | /site/violation | status=待处理 |
| serious_violations_month | 本月严重三违 | stat | route_with_filter | /site/violation | level=严重, 本月 |
| violation_trend | 三违趋势 | chart | route | /site/violation | - |
| dept_violation_ranking | 部门违章排名 | ranking | none | - | - |

### 4.6 卡片API

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/hse/dynamic/cards` | 获取卡片配置（支持moduleCode/dashboardCode筛选） |
| POST | `/api/hse/dynamic/cards` | 新增卡片配置 |
| PUT | `/api/hse/dynamic/cards/:id` | 更新卡片配置 |
| DELETE | `/api/hse/dynamic/cards/:id` | 删除卡片配置 |

### 4.7 前端使用示例

```javascript
// 点击卡片时的统一处理
function handleCardClick(card) {
  switch (card.clickAction) {
    case 'route':
      router.push(card.targetRoute);
      break;
    case 'route_with_filter':
      router.push({
        path: card.targetRoute,
        query: card.filterConditions
      });
      break;
    case 'modal':
      openCardDetailModal(card);
      break;
    default:
      // none - 不做任何操作
  }
}
```

---

## 五、数据库设计总览

### 5.1 4张核心表

| 表名 | 中文名 | 用途 | 记录数（初始化后） |
|------|--------|------|---------------------|
| `assessment_rule` | 规则主表 | 存储规则版本信息 | 1 |
| `assessment_rule_detail` | 规则明细表 | 存储扣分明细 | 3 |
| `hse_filter_config` | 筛选配置表 | 存储动态筛选器配置 | 7 |
| `hse_dashboard_card_config` | 卡片配置表 | 存储卡片交互配置 | 5 |

### 5.2 表关系ER图

```
assessment_rule (1) ──── (N) assessment_rule_detail
         │
         │ module_code
         │
         ├─────────────────── hse_filter_config (module_code)
         │
         └─────────────────── hse_dashboard_card_config (module_code)
```

### 5.3 与现有模块的关系

| 模块 | 关联表 | 关联字段 | 说明 |
|------|--------|----------|------|
| 三违管理 | assessment_rule | module_code='violation' | 三违扣分规则 |
| 人员管理 | hse_filter_config | module_code='employee' | 人员筛选器 |
| 三违管理 | hse_filter_config | module_code='violation' | 三违筛选器 |
| 安全总览 | hse_dashboard_card_config | dashboard_code='overview' | 首页卡片 |

---

## 六、API设计总览

### 6.1 路由前缀

```
/api/hse/dynamic
```

### 6.2 API清单（共17个）

#### 规则管理（8个）

| # | 方法 | 路径 | 功能 |
|---|------|------|------|
| 1 | GET | `/rules` | 规则列表（分页+筛选） |
| 2 | GET | `/rules/:id` | 规则详情（含明细） |
| 3 | POST | `/rules` | 创建规则 |
| 4 | PUT | `/rules/:id` | 更新规则 |
| 5 | DELETE | `/rules/:id` | 软删除规则 |
| 6 | POST | `/rules/:id/details` | 新增规则明细 |
| 7 | PUT | `/rules/details/:id` | 更新规则明细 |
| 8 | DELETE | `/rules/details/:id` | 软删除规则明细 |

#### 筛选器管理（4个）

| # | 方法 | 路径 | 功能 |
|---|------|------|------|
| 9 | GET | `/filters` | 获取筛选配置 |
| 10 | POST | `/filters` | 新增筛选配置 |
| 11 | PUT | `/filters/:id` | 更新筛选配置 |
| 12 | DELETE | `/filters/:id` | 删除筛选配置 |

#### 卡片管理（4个）

| # | 方法 | 路径 | 功能 |
|---|------|------|------|
| 13 | GET | `/cards` | 获取卡片配置 |
| 14 | POST | `/cards` | 新增卡片配置 |
| 15 | PUT | `/cards/:id` | 更新卡片配置 |
| 16 | DELETE | `/cards/:id` | 删除卡片配置 |

### 6.3 后端路由文件

- [hse-dynamic-capability.js](file:///F:/deploy/hse-dashboard/server/routes/hse-dynamic-capability.js)
- 注册位置：[app.js](file:///F:/deploy/hse-dashboard/server/app.js#L472-L474)

---

## 七、后续模块使用方式

### 7.1 新增一个业务模块的动态能力

以「隐患治理」模块为例：

**步骤1：配置筛选器**
```sql
INSERT INTO hse_filter_config (module_code, field_name, label, control_type, ...)
VALUES 
  ('hazard', 'hazardType', '隐患类型', 'select', ...),
  ('hazard', 'riskLevel', '风险等级', 'select', ...),
  ('hazard', 'status', '治理状态', 'select', ...);
```

**步骤2：配置卡片**
```sql
INSERT INTO hse_dashboard_card_config (card_code, card_title, module_code, ...)
VALUES 
  ('pending_hazards', '待治理隐患', 'hazard', ...);
```

**步骤3：前端页面接入**
```javascript
// 页面 mounted 时加载筛选配置
const filters = await getFilters('hazard');
renderDynamicFilters(filters);
```

### 7.2 新增一条扣分规则

以「隐患治理逾期」为例：

```sql
-- 1. 如果模块还没有主规则，先创建
INSERT INTO assessment_rule (rule_code, rule_name, module_code, ...)
VALUES ('hazard_score_v1', '隐患扣分规则 v1.0', 'hazard', ...);

-- 2. 添加扣分明细
INSERT INTO assessment_rule_detail 
  (rule_id, detail_code, detail_name, score_deduct, ...)
VALUES 
  (ruleId, 'overdue_hazard', '隐患治理逾期', 3, ...);
```

### 7.3 卡片点击跳转的扩展路径

当前支持 `route` 和 `route_with_filter`，未来可扩展：

```javascript
// 未来支持的点击行为
click_action: {
  'none',           // 已实现
  'route',          // 已实现
  'route_with_filter', // 已实现
  'modal',          // 下一阶段
  'fullscreen',     // 下一阶段
  'download',       // 未来：点击下载报表
  'send_email',     // 未来：点击发送邮件通知
}
```

### 7.4 与现有硬编码的过渡方案

```
页面加载流程：

  1. 尝试从 /api/hse/dynamic/filters?moduleCode=xxx 获取配置
  2. 如果返回数据 → 使用动态配置渲染（新方式）
  3. 如果返回空 → 使用页面内置的硬编码筛选项（旧方式，兜底）
  4. 逐步将硬编码迁移到数据库配置
```

---

## 八、测试验证结果

| 测试项 | 结果 | 说明 |
|--------|------|------|
| 规则表自动创建 | ✅ 通过 | assessment_rule + detail 正常建表 |
| 三违规则创建 | ✅ 通过 | 创建1条主规则 |
| 三违扣分明细 | ✅ 通过 | 创建3条明细（严重5/一般3/轻微1） |
| 规则详情查询 | ✅ 通过 | 返回主规则+3条明细 |
| 筛选器表创建 | ✅ 通过 | hse_filter_config正常建表 |
| 三违筛选器创建 | ✅ 通过 | 创建5条筛选配置 |
| 人员筛选器创建 | ✅ 通过 | 创建2条筛选配置 |
| 筛选器按模块查询 | ✅ 通过 | 三违模块返回5条，人员模块返回2条 |
| 卡片表创建 | ✅ 通过 | hse_dashboard_card_config正常建表 |
| 卡片配置创建 | ✅ 通过 | 创建5张卡片配置 |
| 卡片按dashboard查询 | ✅ 通过 | overview返回5张卡片 |
| API响应格式 | ✅ 通过 | 统一使用success/error中间件 |

---

## 九、代码变更清单

| 文件 | 类型 | 变更说明 |
|------|------|----------|
| [hse-dynamic-capability.js](file:///F:/deploy/hse-dashboard/server/routes/hse-dynamic-capability.js) | ✨ 新增 | 动态能力综合路由（16个API+4张表） |
| [app.js](file:///F:/deploy/hse-dashboard/server/app.js#L472-L474) | ✏️ 修改 | 注册 `/api/hse/dynamic` 路由 |

---

## 十、技术约束合规检查

| 约束项 | 要求 | 状态 |
|--------|------|------|
| 前端框架 | Vben Admin | ✅ 未修改 |
| UI组件 | Ant Design Vue | ✅ 未使用Element Plus |
| 后端 | Node.js + Express | ✅ |
| 数据库 | PostgreSQL | ✅ |
| 主题 | 系统默认 | ✅ 未修改 |
| 左侧菜单 | 冻结57个 | ✅ 未修改，未新增菜单 |
| 基础组件 | 系统内置 | ✅ 未自定义替代 |

---

**报告结束**

*设计完成，等待审核。*
