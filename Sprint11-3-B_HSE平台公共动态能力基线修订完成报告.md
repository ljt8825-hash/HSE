# Sprint11-3-B HSE平台公共动态能力基线修订完成报告

**报告版本**: v1.0  
**生成日期**: 2026-07-25  
**所属项目**: HSE安全看板系统  
**修订周期**: Sprint11-3-B  
**基线版本**: Sprint11-3-A → Sprint11-3-B

---

## 一、数据库调整（基线修订）

### 1.1 调整总览

| 表名 | 调整类型 | 新增字段数 | 修订说明 |
|------|----------|-----------|----------|
| `assessment_rule` | 字段新增 | 4 | 增加版本追溯字段 + 知识库关联 |
| `assessment_rule_detail` | 字段新增 | 1 | 增加知识库关联 |
| `hse_filter_config` | 字段新增 | 1 | 增加知识库关联 |
| `hse_dashboard_card_config` | 字段更名+新增 | 2 | color_scheme→semantic_color + help_code |

### 1.2 assessment_rule（规则主表）修订

**调整字段（新增3个+保留已有version）**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `parent_version_id` | BIGINT | 父版本ID，用于版本追溯链 |
| `version_note` | TEXT | 版本说明，描述该版本的变更内容 |
| `change_log` | JSONB | 详细变更日志数组 |
| `help_code` | VARCHAR(128) | 关联hse_business_help的帮助编码 |

**版本追溯链示例**：
```
v1.0.0 (id=1, parent_version_id=NULL) → 初始版本
   ↓
v1.1.0 (id=2, parent_version_id=1)  → 修订版本
   ↓
v2.0.0 (id=3, parent_version_id=2)  → 重大升级
```

### 1.3 assessment_rule_detail（规则明细表）修订

| 字段 | 类型 | 说明 |
|------|------|------|
| `help_code` | VARCHAR(128) | 关联知识库，说明该扣分项的业务逻辑 |

### 1.4 hse_filter_config（筛选配置表）修订

| 字段 | 类型 | 说明 |
|------|------|------|
| `help_code` | VARCHAR(128) | 关联知识库，说明该筛选字段的用途和数据来源 |

### 1.5 hse_dashboard_card_config（卡片配置表）修订

**字段更名（重大修订）**：

| 旧字段 | 新字段 | 说明 |
|--------|--------|------|
| `color_scheme` | `semantic_color` | 语义化颜色，禁止直接存储颜色值 |

**新增字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `help_code` | VARCHAR(128) | 关联知识库，说明该卡片指标的计算方式和数据来源 |

**语义化颜色允许值**（由Ant Design Vue主题统一渲染）：

| 值 | 含义 | 对应Ant Design主题色 | 适用场景 |
|----|------|---------------------|----------|
| `danger` | 危险/严重 | #ff4d4f（红色） | 高风险、严重三违、重大隐患 |
| `warning` | 警告/待处理 | #faad14（橙色） | 待处理、一般风险、逾期 |
| `success` | 成功/安全 | #52c41a（绿色） | 安全天数、已完成、低风险 |
| `info` | 信息/普通 | #1890ff（蓝色） | 普通统计、趋势、排名 |
| `default` | 默认 | #8c8c8c（灰色） | 未分类、默认状态 |
| `processing` | 进行中 | #1890ff（蓝色闪烁） | 整改中、审核中 |

**校验逻辑**：
```javascript
const SEMANTIC_COLORS = ['danger', 'warning', 'success', 'info', 'default', 'processing'];
function validateSemanticColor(color) {
  if (!color) return 'info';
  return SEMANTIC_COLORS.includes(color) ? color : 'info';
}
```

### 1.6 新增索引

| 表名 | 索引名 | 字段 | 用途 |
|------|--------|------|------|
| assessment_rule | idx_assessment_rule_version | version | 版本查询优化 |
| hse_dashboard_card_config | idx_hse_dashboard_card_dashboard | dashboard_code | 按仪表盘查询卡片 |

---

## 二、API调整（基线修订）

### 2.1 API清单保持不变

路由前缀：`/api/hse/dynamic`  
共16个接口，接口数量和路径保持与Sprint11-3-A一致。

### 2.2 响应字段调整

**规则API响应新增字段**：

| 字段 | 说明 |
|------|------|
| `parentVersionId` | 父版本ID |
| `versionNote` | 版本说明 |
| `changeLog` | 变更日志数组 |
| `helpCode` | 知识库关联编码 |
| `isFrozen` | 规则冻结标记（固定为true） |
| `frozenNote` | 冻结说明文字 |

**卡片API响应字段更名**：

| 旧字段 | 新字段 | 说明 |
|--------|--------|------|
| `colorScheme` | `semanticColor` | 语义化颜色 |

### 2.3 规则冻结说明（写入API响应）

所有规则API的响应中自动包含以下冻结标记：

```json
{
  "isFrozen": true,
  "frozenNote": "当前版本：config/hseRules作为唯一业务计算来源，assessment_rule仅为未来规则中心预留，不参与当前业务计算"
}
```

创建规则时的响应消息中也明确提示：

```
"创建成功（注：当前版本assessment_rule不参与业务计算，规则来源为config/hseRules）"
```

### 2.4 请求参数调整

所有写接口（POST/PUT）的请求参数中均支持以下新字段：

- 规则：`parentVersionId`, `versionNote`, `helpCode`
- 规则明细：`helpCode`
- 筛选器：`helpCode`
- 卡片：`semanticColor`（替代原`colorScheme`）, `helpCode`

---

## 三、规则能力调整

### 3.1 冻结决策（基线确认）

```
当前阶段（v1.0 基线）：
  ✅ config/hseRules/*.json  →  唯一业务计算来源
  ⚠️ assessment_rule         →  仅作为未来规则中心预留，不参与业务计算

业务模块（三违/考核/培训）：
  ├── 计算扣分：读取 config/hseRules/violation-rule.json
  ├── 展示规则详情：读取 config/hseRules/violation-rule.json
  └── 不读取 assessment_rule（v2.0 之后再切换）
```

### 3.2 规则升级路径（不变）

```
v1.0（当前基线）：config/hseRules/*.json  硬编码规则
                      ↓  配置文件同步
v2.0（影子数据源）：assessment_rule 表     与配置文件双写双读
                      ↓  全面切换
v3.0（规则中心）：  规则中心                可视化配置，动态生效
```

### 3.3 三违规则（保持不变）

- 规则来源：[config/hseRules/violation-rule.json](file:///F:/deploy/hse-dashboard/server/config/hseRules/violation-rule.json)（唯一计算来源）
- assessment_rule表：存储相同内容的「影子副本」，用于未来升级
- 三违模块代码中**禁止**直接查询 assessment_rule 进行扣分计算

### 3.4 版本追溯能力（新增）

assessment_rule表现在支持完整的版本追溯：

| 能力 | 字段 | 说明 |
|------|------|------|
| 版本号 | version | 语义化版本号（如1.0.0） |
| 父版本 | parent_version_id | 指向上一个版本，形成版本链 |
| 版本说明 | version_note | 简要说明该版本的变更 |
| 变更日志 | change_log | 详细的逐项变更记录 |

---

## 四、筛选能力调整

### 4.1 筛选能力模型（保持不变）

- 保留表：`hse_filter_config`
- 不建设：`hse_field_config`（字段配置中心作为后续专项任务）

### 4.2 筛选配置表（新增help_code）

所有筛选配置现在可以关联知识库：

```
hse_filter_config.help_code
        ↓ 关联
hse_business_help.menu_code / help_code
```

**前端使用方式**：
- 筛选字段旁边的「?」帮助按钮
- 点击后展示：字段说明、数据来源、可选值解释、业务逻辑

### 4.3 已配置的筛选器（基线数据）

**三违模块（5个）**：

| field_name | label | control_type | help_code |
|------------|------|--------------|-----------|
| keyword | 关键词 | input | hse-dynamic-filter-violation-keyword |
| violationType | 三违类型 | select | hse-dynamic-filter-violation-type |
| violationLevel | 严重程度 | select | hse-dynamic-filter-violation-level |
| status | 处理状态 | select | hse-dynamic-filter-violation-status |
| dateRange | 日期范围 | rangePicker | hse-dynamic-filter-violation-date |

**人员模块（2个）**：

| field_name | label | control_type | help_code |
|------------|------|--------------|-----------|
| riskLevel | 风险等级 | select | hse-dynamic-filter-employee-risk |
| deptId | 所属部门 | treeSelect | hse-dynamic-filter-employee-dept |

---

## 五、卡片能力调整

### 5.1 颜色字段更名（重大修订）

```
修订前（Sprint11-3-A）：
  color_scheme: 'red' | 'blue' | 'orange' | ...   ← 直接存颜色值，禁止

修订后（Sprint11-3-B 基线）：
  semantic_color: 'danger' | 'warning' | 'success' | 'info' | 'default' | 'processing'
                     ↓
                 Ant Design Vue 主题统一渲染
                     ↓
                 主题色可换，语义不变
```

**为什么使用语义化颜色**：
1. **主题一致性**：所有卡片颜色通过Ant Design主题渲染，确保视觉统一
2. **可维护性**：更换主题色时只需修改主题变量，无需修改业务数据
3. **语义清晰**：`danger`比`red`更准确地表达「危险/严重」的业务含义
4. **无障碍**：色盲友好，语义而非依赖颜色本身传递信息

### 5.2 已配置的卡片（基线数据）

| card_code | card_title | semantic_color | 适用场景 |
|-----------|------------|----------------|----------|
| high_risk_employees | 高风险人员 | `danger` | 高风险 → 红色警告 |
| pending_violations | 待处理三违 | `warning` | 待处理 → 橙色提醒 |
| serious_violations_month | 本月严重三违 | `danger` | 严重 → 红色警告 |
| violation_trend | 三违趋势 | `info` | 趋势图表 → 蓝色信息 |
| dept_violation_ranking | 部门违章排名 | `info` | 排名 → 蓝色信息 |

### 5.3 卡片知识库关联（新增）

所有卡片配置现在可以关联知识库：

```
hse_dashboard_card_config.help_code
        ↓ 关联
hse_business_help
```

**前端展示内容**：
- 指标名称和含义
- 计算方式（如：高风险人员 = 90天内累计2次及以上三违）
- 数据来源（如：来自violation_records表 + employee表关联）
- 业务逻辑说明

---

## 六、知识库关联情况

### 6.1 所有动态能力表均已增加help_code

| 表名 | help_code用途 | 关联知识库内容 |
|------|--------------|---------------|
| assessment_rule | 规则说明 | 规则版本说明、适用范围、升级路径 |
| assessment_rule_detail | 扣分项说明 | 该扣分标准的业务含义、触发条件 |
| hse_filter_config | 筛选字段说明 | 字段用途、数据来源、可选值解释 |
| hse_dashboard_card_config | 卡片指标说明 | 计算方式、数据来源、业务逻辑 |

### 6.2 关联机制

```
动态能力表.help_code
        ↓ 1:1
hse_business_help.menu_code 或 hse_business_help.help_code（未来扩展）
```

### 6.3 基线Help Code清单（14个）

**规则相关（4个）**：
- `hse-dynamic-rule-violation` — 三违扣分规则总说明
- `hse-dynamic-rule-violation-serious` — 严重三违扣分项
- `hse-dynamic-rule-violation-general` — 一般三违扣分项
- `hse-dynamic-rule-violation-minor` — 轻微三违扣分项

**筛选器相关（7个）**：
- `hse-dynamic-filter-violation-keyword` — 关键词搜索
- `hse-dynamic-filter-violation-type` — 三违类型
- `hse-dynamic-filter-violation-level` — 严重程度
- `hse-dynamic-filter-violation-status` — 处理状态
- `hse-dynamic-filter-violation-date` — 日期范围
- `hse-dynamic-filter-employee-risk` — 风险等级
- `hse-dynamic-filter-employee-dept` — 所属部门

**卡片相关（5个）**：
- `hse-dynamic-card-high-risk` — 高风险人员卡片
- `hse-dynamic-card-pending-vio` — 待处理三违卡片
- `hse-dynamic-card-safe-day` — 安全天数卡片
- `hse-dynamic-card-vio-trend` — 三违趋势卡片
- `hse-dynamic-card-dept-rank` — 部门违章排名卡片

---

## 七、与后续模块使用说明

### 7.1 后续模块接入动态能力的标准流程

以「隐患治理」模块为例：

**步骤1：配置筛选器**
```sql
INSERT INTO hse_filter_config 
  (module_code, field_name, label, control_type, data_source, help_code, ...)
VALUES 
  ('hazard', 'hazardType', '隐患类型', 'select', 
   'dict:hazardType', 'hse-dynamic-filter-hazard-type', ...);
```

**步骤2：配置卡片**
```sql
INSERT INTO hse_dashboard_card_config 
  (card_code, card_title, module_code, semantic_color, 
   data_source_api, click_action, target_route, filter_conditions, help_code)
VALUES 
  ('pending_hazards', '待治理隐患', 'hazard', 'warning',
   '/api/hazards/stats', 'route_with_filter', '/hazard/list',
   '{"status":"pending"}', 'hse-dynamic-card-pending-hazard');
```

**步骤3：（v2.0之后）配置规则**
```sql
INSERT INTO assessment_rule 
  (rule_code, rule_name, module_code, version, help_code, ...)
VALUES 
  ('hazard_score_v1', '隐患扣分规则 v1.0', 'hazard', '1.0.0',
   'hse-dynamic-rule-hazard', ...);
```

### 7.2 前端接入方式

```javascript
// 1. 获取筛选配置（页面mounted时）
const { data: filters } = await get('/api/hse/dynamic/filters', {
  params: { moduleCode: 'hazard' }
});

// 2. 动态渲染筛选表单
filters
  .sort((a, b) => a.sortOrder - b.sortOrder)
  .filter(f => f.isVisible)
  .forEach(filter => {
    renderFilterComponent(filter);  // 根据control_type渲染
  });

// 3. 卡片点击（统一处理）
function handleCardClick(card) {
  switch (card.clickAction) {
    case 'route_with_filter':
      router.push({
        path: card.targetRoute,
        query: card.filterConditions  // 自动携带筛选条件
      });
      break;
    // ...
  }
}

// 4. 知识库关联（帮助tooltip）
<template>
  <Tooltip v-if="filter.helpCode" :title="getHelpText(filter.helpCode)">
    <QuestionCircleOutlined />
  </Tooltip>
</template>
```

### 7.3 v1.0 基线的模块接入注意事项

| 注意事项 | 说明 |
|----------|------|
| **规则冻结** | v1.0阶段业务计算必须使用`config/hseRules`，禁止使用`assessment_rule` |
| **不新增菜单** | 动态能力通过配置完成，不在左侧菜单新增「规则中心/筛选配置」等菜单 |
| **语义化颜色** | 卡片颜色必须使用`semantic_color`，禁止传入`red/blue`等直接颜色值 |
| **知识库关联** | 新增筛选器/卡片时，建议同时配置`help_code`以提供用户帮助 |

---

## 八、测试验证结果

| 测试项 | 预期结果 | 实际结果 | 状态 |
|--------|----------|----------|------|
| 规则表版本字段 | parentVersionId/versionNote/changeLog正常存储 | ✅ 存储正常 | 通过 |
| 规则help_code | help_code正常关联和返回 | ✅ 正常返回 | 通过 |
| 规则冻结标记 | isFrozen=true，frozenNote文字正确 | ✅ 正确返回 | 通过 |
| 筛选器help_code | help_code正常存储和返回 | ✅ 正常 | 通过 |
| 卡片semantic_color合法值 | danger/warning/success/info正常 | ✅ 正常 | 通过 |
| 卡片semantic_color非法值校验 | 输入red自动修正为info | ✅ 自动修正 | 通过 |
| 卡片help_code | help_code正常存储和返回 | ✅ 正常 | 通过 |
| 创建规则提示 | 消息中明确提示规则冻结 | ✅ 明确提示 | 通过 |

---

## 九、代码变更清单

| 文件 | 变更类型 | 变更说明 |
|------|----------|----------|
| [hse-dynamic-capability.js](file:///F:/deploy/hse-dashboard/server/routes/hse-dynamic-capability.js) | ✏️ 重大修订 | 基线修订版：新增版本字段、help_code全表关联、color_scheme→semantic_color、规则冻结注释和响应标记 |

**本次修订的关键代码位置**：

- 规则冻结说明注释：[hse-dynamic-capability.js#L5-L23](file:///F:/deploy/hse-dashboard/server/routes/hse-dynamic-capability.js#L5-L23)
- 语义化颜色常量：[hse-dynamic-capability.js#L35](file:///F:/deploy/hse-dashboard/server/routes/hse-dynamic-capability.js#L35)
- 新增版本字段（建表）：[hse-dynamic-capability.js#L49-L51](file:///F:/deploy/hse-dashboard/server/routes/hse-dynamic-capability.js#L49-L51)
- help_code全表关联（建表）：[L59](file:///F:/deploy/hse-dashboard/server/routes/hse-dynamic-capability.js#L59) [L81](file:///F:/deploy/hse-dashboard/server/routes/hse-dynamic-capability.js#L81) [L101](file:///F:/deploy/hse-dashboard/server/routes/hse-dynamic-capability.js#L101) [L129](file:///F:/deploy/hse-dashboard/server/routes/hse-dynamic-capability.js#L129)
- semantic_color更名（建表）：[hse-dynamic-capability.js#L123](file:///F:/deploy/hse-dashboard/server/routes/hse-dynamic-capability.js#L123)
- 规则冻结标记（响应）：[hse-dynamic-capability.js#L177-L178](file:///F:/deploy/hse-dashboard/server/routes/hse-dynamic-capability.js#L177-L178)
- 语义化颜色校验函数：[hse-dynamic-capability.js#L440-L443](file:///F:/deploy/hse-dashboard/server/routes/hse-dynamic-capability.js#L440-L443)

---

## 十、技术约束合规检查

| 约束项 | 要求 | 状态 |
|--------|------|------|
| 前端框架 | Vben Admin | ✅ 未修改 |
| UI组件 | Ant Design Vue | ✅ 未使用Element Plus |
| 语义化颜色 | 使用semantic_color，禁止red/blue | ✅ 已更名+校验 |
| 规则冻结 | config/hseRules为唯一计算来源 | ✅ API响应带冻结标记 |
| 主题 | 系统默认 | ✅ 未修改 |
| 左侧菜单 | 冻结57个 | ✅ 未修改，未新增 |
| 字段配置中心 | 不建设hse_field_config | ✅ 仅保留hse_filter_config |
| 基础组件 | 系统内置 | ✅ 未自定义替代 |

---

**报告结束**

*基线修订完成，等待审核。*
