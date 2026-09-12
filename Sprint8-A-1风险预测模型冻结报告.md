# Sprint8-A-1 风险预测模型冻结报告

> 文档版本：v1.0
> 生成日期：2026 年 7 月
> 所属阶段：HSE Dashboard Sprint8-A-1
> 关联文档：《Sprint8-A HSE智能分析中心设计报告》、《HSE预测模型版本管理设计》、《预测预警联动设计》

---

## 一、冻结概述

### 1.1 冻结背景

Sprint8-A 智能分析中心设计完成后，风险预测模型进入最终冻结修订阶段。本次冻结以"可开发"为目标，将预测模型的核心算法、参数、输出等级、版本管理机制和预警联动机制固化为 v1.0 标准版本，形成稳定、可追溯、可扩展的风险预测能力。

### 1.2 冻结目标

形成可开发的 HSE 风险预测模型 v1.0，冻结预测周期、算法、置信度、风险等级四项核心配置，同时新增预测模型版本管理和预测预警联动两项配套设计。

### 1.3 冻结项清单

| 序号 | 冻结项 | 冻结状态 |
|------|--------|----------|
| 1 | 预测周期冻结（默认3个月，支持月度滚动） | ✅ 已冻结 |
| 2 | 预测算法冻结（线性回归 + 三种异常检测） | ✅ 已冻结 |
| 3 | 置信度计算冻结（R² 0-100%） | ✅ 已冻结 |
| 4 | 预测等级冻结（4级风险分） | ✅ 已冻结 |
| 5 | 预测模型版本管理（新增设计） | ✅ 已冻结 |
| 6 | 预测预警联动（新增设计） | ✅ 已冻结 |

### 1.4 版本与前置

| 项目 | 说明 |
|------|------|
| 冻结版本 | 预测模型 v1.0 |
| 前置文档 | Sprint8-A HSE智能分析中心设计报告（已完成） |
| 前置冻结基线 | 员工风险模型（Sprint6.1 冻结版）、考核模型 v1.1、预警规则 v1.1 |

### 1.5 当前冻结基线

| 冻结项 | 版本 | 说明 |
|--------|------|------|
| 员工风险模型 | Sprint6.1 冻结版 | 风险评分公式、岗位风险权重、扣分规则 |
| 考核模型 | v1.1 | 考核维度、指标权重、红黄牌判定规则 |
| 预警规则 | v1.1 | 预警规则、升级机制、超时处理 |

> ⚠️ 上述基线在本 Sprint 内一律视为只读，预测模型仅读取其数据，不允许回写或二次计算。

---

## 二、冻结内容详情

### 2.1 预测周期冻结

#### 2.1.1 冻结配置

| 配置项 | 冻结值 | 说明 |
|--------|--------|------|
| 默认预测周期 | 3 个月 | 从预测基准日期起向后推算 3 个月 |
| 最小预测周期 | 1 个月 | 支持单月滚动预测 |
| 最大预测周期 | 12 个月 | 年度预测上限 |
| 滚动粒度 | 月度 | 每月更新一次预测 |

#### 2.1.2 周期计算规则

```
预测基准日期 = 数据最新日期 + 1 天
预测结束日期 = 预测基准日期 + prediction_cycle 个月
```

#### 2.1.3 周期参数存储

周期参数存储于 `hse_prediction_model_version` 表的 `prediction_cycle` 字段，默认值为 3。

---

### 2.2 预测算法冻结

#### 2.2.1 主算法：线性回归趋势预测

| 配置项 | 冻结值 | 说明 |
|--------|--------|------|
| 算法名称 | linear_regression | 线性回归 |
| 输入数据 | 历史 12 个月风险数据 | employee_risk/driver_risk 月度评分 |
| 输出结果 | 未来 N 个月预测值 | N = prediction_cycle |
| 趋势方向 | up / down / stable | 基于斜率阈值判定 |

#### 2.2.2 趋势判定规则

```
趋势上升 (up):   预测斜率 > 趋势上升阈值 (5%)
趋势下降 (down): 预测斜率 < 趋势下降阈值 (-5%)
趋势稳定 (stable): 其他情况
```

#### 2.2.3 异常检测算法

**算法一：标准差检测（standard deviation）**

| 配置项 | 冻结值 |
|--------|--------|
| 检测方法 | 标准差检测 |
| 异常阈值 | > 2σ（标准差倍数） |
| 检测对象 | 历史评分分布 |
| 判定规则 | 预测值偏离均值超过 2σ 时标记异常 |

**算法二：趋势突变检测（trend mutation）**

| 配置项 | 冻结值 |
|--------|--------|
| 检测方法 | 趋势突变检测 |
| 异常阈值 | 斜率变化率 > 50% |
| 检测对象 | 连续两个月预测斜率 |
| 判定规则 | 相邻月斜率变化率超过 50% 时标记突变 |

**算法三：事故激增检测（accident surge）**

| 配置项 | 冻结值 |
|--------|--------|
| 检测方法 | 事故激增检测 |
| 异常阈值 | 月均事故数 > 5 起 |
| 检测对象 | 月度事故数量 |
| 判定规则 | 预测月事故数超过阈值时标记激增 |

#### 2.2.4 算法参数存储

所有算法参数统一存储于 `hse_prediction_model_version` 表：

| 字段 | 说明 | 默认值 |
|------|------|--------|
| algorithm | 主算法名称 | linear_regression |
| anomaly_stddev_threshold | 标准差异常阈值 | 2 |
| anomaly_slope_threshold | 斜率异常阈值 | 1 |
| anomaly_accident_surge | 事故激增阈值 | 5 |
| trend_up_threshold | 趋势上升阈值（%） | 5 |
| trend_down_threshold | 趋势下降阈值（%） | -5 |

---

### 2.3 置信度计算冻结

#### 2.3.1 计算方法

| 配置项 | 冻结值 | 说明 |
|--------|--------|------|
| 置信度方法 | R²（决定系数） | 衡量预测值与实际值的拟合优度 |
| 输出范围 | 0 - 100% | 映射 R² 值到百分比 |
| 最低阈值 | 30% | 低于此值的预测结果标记为低置信度 |

#### 2.3.2 R² 计算公式

```
R² = 1 - Σ(实际值 - 预测值)² / Σ(实际值 - 均值)²
```

映射为置信度百分比：`置信度% = R² × 100`

#### 2.3.3 置信度标签

| 置信度范围 | 标签 | 说明 |
|------------|------|------|
| 80-100% | 高置信 | 预测可靠度高 |
| 50-79% | 中置信 | 预测可靠度中等 |
| 30-49% | 低置信 | 预测可靠度较低，需人工复核 |
| <30% | 不可用 | 预测结果不可用于决策 |

#### 2.3.4 置信度参数存储

| 字段 | 说明 | 默认值 |
|------|------|--------|
| confidence_method | 置信度计算方法 | r2 |
| confidence_min | 最低置信度阈值（%） | 30 |

---

### 2.4 预测等级冻结

#### 2.4.1 风险等级划分

| 风险等级 | 风险分范围 | 颜色标识 | 处置建议 |
|----------|------------|----------|----------|
| critical | ≥ 80 | 红色 | 立即处置，24 小时内响应 |
| major | 65 - 79 | 橙色 | 尽快处置，72 小时内响应 |
| minor | 50 - 64 | 黄色 | 关注处理，7 天内响应 |
| info | < 50 | 绿色 | 持续监控 |

#### 2.4.2 等级判定规则

```javascript
function determineLevel(score) {
  if (score >= 80) return 'critical';
  if (score >= 65) return 'major';
  if (score >= 50) return 'minor';
  return 'info';
}
```

#### 2.4.3 等级阈值存储

| 字段 | 说明 | 默认值 |
|------|------|--------|
| level_critical | critical 阈值 | 80 |
| level_major | major 阈值 | 65 |
| level_minor | minor 阈值 | 50 |

---

## 三、新增设计

### 3.1 预测模型版本管理

#### 3.1.1 设计目标

为预测模型提供版本管理能力，支持模型创建、更新、冻结、删除全生命周期管理，确保模型变更可追溯、生产模型稳定可靠。

#### 3.1.2 数据表设计

**hse_prediction_model_version**（预测模型版本表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGSERIAL | 主键 |
| model_code | VARCHAR(64) | 模型编码：HSE-RISK-PREDICT |
| version | VARCHAR(32) | 版本号：v1.0 |
| algorithm | VARCHAR(64) | 主算法：linear_regression |
| prediction_cycle | INTEGER | 预测周期（月）：默认 3 |
| parameters | JSONB | 模型参数（完整配置） |
| confidence_method | VARCHAR(32) | 置信度方法：r2 |
| confidence_min | NUMERIC(5,2) | 最低置信度（%）：默认 30 |
| level_critical | NUMERIC(10,2) | critical 阈值：80 |
| level_major | NUMERIC(10,2) | major 阈值：65 |
| level_minor | NUMERIC(10,2) | minor 阈值：50 |
| anomaly_stddev_threshold | NUMERIC(5,2) | 标准差异常阈值：2 |
| anomaly_slope_threshold | NUMERIC(10,4) | 斜率异常阈值：1 |
| anomaly_accident_surge | INTEGER | 事故激增阈值：5 |
| trend_up_threshold | NUMERIC(5,2) | 趋势上升阈值（%）：5 |
| trend_down_threshold | NUMERIC(5,2) | 趋势下降阈值（%）：-5 |
| status | VARCHAR(20) | 状态：active/inactive/deprecated |
| is_frozen | BOOLEAN | 是否已冻结：默认 TRUE |
| change_log | TEXT | 变更说明 |
| created_by | BIGINT | 创建人 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |
| is_deleted | BOOLEAN | 软删除标记 |

#### 3.1.3 版本状态机

```
创建 → active（生效中）
         ↓
      freeze → is_frozen=true（冻结，不可修改）
         ↓
      deprecated → 停止使用
```

- 冻结后的版本**不可修改、不可删除**
- 新建版本默认为 active 状态，冻结操作将 `is_frozen` 置为 TRUE
- 废弃（deprecated）版本可作为历史版本保留，不参与生产预测

#### 3.1.4 API 设计

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | /model-versions | 模型版本列表 | 全局只读 |
| GET | /model-versions/:id | 模型版本详情 | 全局只读 |
| GET | /model-versions/active | 获取当前生效模型 | 全局只读 |
| POST | /model-versions | 创建模型版本 | admin / safety_manager |
| PUT | /model-versions/:id | 更新模型版本 | admin / safety_manager |
| PUT | /model-versions/:id/freeze | 冻结模型版本 | admin / safety_manager |
| DELETE | /model-versions/:id | 删除模型版本 | admin |

#### 3.1.5 业务规则

1. 模型编码（model_code）唯一约束：一个模型编码只能有一个 active 状态的版本
2. 版本号（version）唯一约束：同一模型编码下版本号不可重复
3. 冻结保护：`is_frozen=true` 的版本禁止任何修改操作
4. 配置完整性校验：冻结前必须配置完整的等级阈值和周期参数
5. 软删除：删除仅标记 `is_deleted=true`，不物理删除

---

### 3.2 预测预警联动

#### 3.2.1 联动流程

```
预测风险持续升高
        ↓
  趋势判定 (predicted_trend = up)
  + 等级判定 (predicted_level ≥ major)
        ↓
  生成预测预警
        ↓
  写入 hse_warning_record
  (source_type = 'prediction')
        ↓
  通知相关人员
```

#### 3.2.2 联动触发条件

| 条件 | 值 | 说明 |
|------|-----|------|
| predicted_trend | up | 预测趋势为上升 |
| predicted_risk_level | major 或 critical | 预测等级 ≥ major |
| 重复预警检测 | 7 天内无同类型预警 | 防止重复触发 |

#### 3.2.3 预警规则

**WR-PREDICT-001：预测风险升高预警**

| 配置项 | 值 |
|--------|-----|
| 规则编号 | WR-PREDICT-001 |
| 规则名称 | 预测风险升高预警 |
| 来源类型 | prediction |
| 预警等级 | major |
| 触发条件 | predicted_trend=up AND predicted_level>=major |
| 动作 | create_warning（创建预警记录） |

#### 3.2.4 预警记录结构

写入 `hse_warning_record` 表，关键字段：

| 字段 | 值 | 说明 |
|------|-----|------|
| source_type | prediction | 来源标记为预测 |
| rule_id | 关联 WR-PREDICT-001 | 预警规则 ID |
| warning_level | critical / major | 根据预测等级映射 |
| risk_reason | 预测风险等级+趋势+分+置信度 | 可读的风险描述 |
| risk_data | 完整预测数据 JSON | 包含预测分、趋势、因子 |

#### 3.2.5 API 设计

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | /predictions/:id/generate-warning | 手动触发预测预警 | admin / safety_manager |
| GET | /prediction-warnings | 预测预警列表 | 全局只读 |
| GET | /prediction-warnings/stats | 预测预警统计 | 全局只读 |

#### 3.2.6 联动业务规则

1. **自动触发**：预测任务完成后自动检测联动条件
2. **手动触发**：支持管理员手动触发生成预测预警
3. **幂等保护**：7 天内同一目标不重复生成相同预警
4. **通知发送**：生成预警后自动通知相关人员
5. **等级映射**：预测 critical → 预警 critical；预测 major → 预警 major

---

## 四、限制与约束

### 4.1 禁止修改项

| 禁止修改项 | 版本 | 说明 |
|------------|------|------|
| 员工风险模型 | Sprint6.1 冻结版 | 风险评分公式、岗位风险权重、扣分规则 |
| 考核模型 | v1.1 | 考核维度、指标权重、红黄牌判定规则 |
| 预警规则 | v1.1 | 预警规则、升级机制、超时处理 |

### 4.2 数据约束

1. 预测模型仅读取 `employee_risk`、`driver_risk`、`accident`、`assessment`、`warning`、`rectification` 表
2. 预测结果写入 `hse_risk_prediction` 表，不回写源数据表
3. 模型版本数据独立存储于 `hse_prediction_model_version` 表
4. 预测预警写入 `hse_warning_record` 表，来源标记为 `prediction`

### 4.3 权限约束

| 操作 | admin | safety_manager | department_manager | township_manager | area_manager |
|------|-------|----------------|---------------------|------------------|--------------|
| 查看预测结果 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 创建预测 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 管理模型版本 | ✅ | ✅ | ❌ | ❌ | ❌ |
| 冻结模型版本 | ✅ | ✅ | ❌ | ❌ | ❌ |
| 生成预测预警 | ✅ | ✅ | ❌ | ❌ | ❌ |

---

## 五、交付物清单

| 序号 | 交付物 | 类型 | 状态 |
|------|--------|------|------|
| 1 | 数据库迁移脚本 | SQL | ✅ 已交付 |
| 2 | 后端 API 路由 | JavaScript | ✅ 已交付 |
| 3 | 前端 API 接口层 | TypeScript | ✅ 已交付 |
| 4 | 本冻结报告 | 文档 | ✅ 已交付 |
| 5 | 《HSE预测模型版本管理设计》 | 文档 | ✅ 已交付 |
| 6 | 《预测预警联动设计》 | 文档 | ✅ 已交付 |

---

## 六、版本历史

| 版本 | 日期 | 修订人 | 修订说明 |
|------|------|--------|----------|
| v1.0 | 2026-07 | HSE 团队 | 初始冻结版本，完成预测模型核心配置冻结与配套设计 |
