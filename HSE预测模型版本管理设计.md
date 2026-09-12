# HSE 预测模型版本管理设计

> 文档版本：v1.0
> 生成日期：2026 年 7 月
> 所属阶段：HSE Dashboard Sprint8-A-1
> 关联文档：《Sprint8-A-1风险预测模型冻结报告》、《预测预警联动设计》

---

## 一、设计概述

### 1.1 设计背景

HSE 风险预测模型作为智能分析中心的核心组件，其算法参数、阈值配置、等级划分直接影响风险识别的准确性和预警联动的及时性。为确保模型的可控性、可追溯性和可扩展性，需要建立完整的预测模型版本管理机制。

### 1.2 设计目标

1. **版本固化**：将预测模型的算法、参数、阈值配置固化为独立版本，支持版本化管理
2. **变更追溯**：所有模型变更均记录在案，支持变更历史查询和回溯
3. **生产稳定**：冻结后的版本不可修改，确保生产环境预测结果的一致性
4. **版本演进**：支持新版本创建、测试、上线的完整流程
5. **配置复用**：当前版本的配置可作为新版本的基础模板

### 1.3 设计范围

| 范围 | 包含 | 不包含 |
|------|------|--------|
| 版本元数据 | 模型编码、版本号、状态、冻结标记 | 模型训练数据 |
| 参数配置 | 算法、周期、阈值、置信度配置 | 实时计算逻辑 |
| 状态流转 | active → frozen → deprecated | 模型外部依赖管理 |
| API 接口 | 版本 CRUD + 冻结操作 | 版本比对/合并 |

---

## 二、数据模型设计

### 2.1 核心表结构

#### hse_prediction_model_version（预测模型版本表）

```sql
CREATE TABLE IF NOT EXISTS hse_prediction_model_version (
    id                      BIGSERIAL    PRIMARY KEY,
    model_code              VARCHAR(64)  NOT NULL,            -- 模型编码
    version                 VARCHAR(32)  NOT NULL,            -- 版本号
    algorithm               VARCHAR(64)  NOT NULL,            -- 主算法
    prediction_cycle        INTEGER      NOT NULL DEFAULT 3,  -- 预测周期（月）
    parameters              JSONB        NOT NULL DEFAULT '{}', -- 模型参数
    confidence_method       VARCHAR(32)  NOT NULL DEFAULT 'r2', -- 置信度方法
    confidence_min          NUMERIC(5,2) NOT NULL DEFAULT 30,  -- 最低置信度（%）
    level_critical          NUMERIC(10,2) NOT NULL DEFAULT 80, -- critical 阈值
    level_major             NUMERIC(10,2) NOT NULL DEFAULT 65, -- major 阈值
    level_minor             NUMERIC(10,2) NOT NULL DEFAULT 50, -- minor 阈值
    anomaly_stddev_threshold  NUMERIC(5,2) NOT NULL DEFAULT 2, -- 标准差异常阈值
    anomaly_slope_threshold   NUMERIC(10,4) NOT NULL DEFAULT 1, -- 斜率异常阈值
    anomaly_accident_surge    INTEGER      NOT NULL DEFAULT 5,  -- 事故激增阈值
    trend_up_threshold       NUMERIC(5,2) NOT NULL DEFAULT 5,   -- 趋势上升阈值（%）
    trend_down_threshold     NUMERIC(5,2) NOT NULL DEFAULT -5,  -- 趋势下降阈值（%）
    status                  VARCHAR(20)  NOT NULL DEFAULT 'active', -- 状态
    is_frozen               BOOLEAN      NOT NULL DEFAULT TRUE, -- 是否已冻结
    change_log              TEXT,                               -- 变更说明
    created_by              BIGINT,                             -- 创建人
    created_at              TIMESTAMP    NOT NULL DEFAULT NOW(), -- 创建时间
    updated_at              TIMESTAMP    NOT NULL DEFAULT NOW(), -- 更新时间
    is_deleted              BOOLEAN      NOT NULL DEFAULT FALSE  -- 软删除
);

-- 唯一约束：同一模型编码 + 版本号不可重复
CREATE UNIQUE INDEX idx_model_version_code_version
    ON hse_prediction_model_version (model_code, version) WHERE is_deleted = FALSE;

-- 查询索引
CREATE INDEX idx_model_version_status
    ON hse_prediction_model_version (status, is_frozen) WHERE is_deleted = FALSE;

-- 默认版本查询索引
CREATE INDEX idx_model_version_active
    ON hse_prediction_model_version (model_code, status) WHERE status = 'active' AND is_deleted = FALSE;
```

### 2.2 外键关联

hse_risk_prediction 表增加 model_version_id 字段：

```sql
ALTER TABLE hse_risk_prediction
ADD COLUMN IF NOT EXISTS model_version_id BIGINT REFERENCES hse_prediction_model_version(id);
```

### 2.3 字段说明

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| id | BIGSERIAL | 是 | 自增 | 主键 |
| model_code | VARCHAR(64) | 是 | - | 模型唯一编码，如 HSE-RISK-PREDICT |
| version | VARCHAR(32) | 是 | - | 版本号，如 v1.0 |
| algorithm | VARCHAR(64) | 是 | - | 主算法名称 |
| prediction_cycle | INTEGER | 是 | 3 | 预测周期（月） |
| parameters | JSONB | 是 | {} | 模型运行时参数 |
| confidence_method | VARCHAR(32) | 是 | r2 | 置信度计算方法 |
| confidence_min | NUMERIC(5,2) | 是 | 30 | 最低置信度阈值 |
| level_critical | NUMERIC(10,2) | 是 | 80 | critical 等级阈值 |
| level_major | NUMERIC(10,2) | 是 | 65 | major 等级阈值 |
| level_minor | NUMERIC(10,2) | 是 | 50 | minor 等级阈值 |
| anomaly_stddev_threshold | NUMERIC(5,2) | 是 | 2 | 标准差异常阈值 |
| anomaly_slope_threshold | NUMERIC(10,4) | 是 | 1 | 斜率异常阈值 |
| anomaly_accident_surge | INTEGER | 是 | 5 | 事故激增阈值 |
| trend_up_threshold | NUMERIC(5,2) | 是 | 5 | 趋势上升阈值 |
| trend_down_threshold | NUMERIC(5,2) | 是 | -5 | 趋势下降阈值 |
| status | VARCHAR(20) | 是 | active | 版本状态 |
| is_frozen | BOOLEAN | 是 | TRUE | 冻结标记 |
| change_log | TEXT | 否 | NULL | 变更说明文本 |
| created_by | BIGINT | 否 | NULL | 创建人 ID |
| created_at | TIMESTAMP | 是 | NOW() | 创建时间 |
| updated_at | TIMESTAMP | 是 | NOW() | 更新时间 |
| is_deleted | BOOLEAN | 是 | FALSE | 软删除标记 |

---

## 三、版本状态管理

### 3.1 状态定义

| 状态 | 值 | 说明 |
|------|-----|------|
| 生效中 | active | 版本可用于生产预测 |
| 已冻结 | is_frozen=true | 版本不可修改、不可删除 |
| 已停用 | inactive | 版本已停用，不参与预测 |
| 已废弃 | deprecated | 版本已废弃，仅作历史参考 |

### 3.2 状态流转

```
                  创建
    [新建] ──────────────► [active]
                             │  冻结
                             ▼
                         [frozen]
                             │  废弃
                             ▼
                         [deprecated]
```

#### 状态流转规则

| 操作 | 源状态 | 目标状态 | 条件 |
|------|--------|----------|------|
| 创建版本 | - | active | 版本号唯一 |
| 冻结版本 | active | frozen | 配置完整且未冻结 |
| 停用版本 | active/frozen | inactive | 管理员操作 |
| 废弃版本 | inactive | deprecated | 历史归档 |
| 软删除 | 任意非废弃 | is_deleted=true | 非冻结版本 |

### 3.3 版本保护规则

| 规则 | 说明 |
|------|------|
| 冻结保护 | `is_frozen=true` 的版本禁止 UPDATE 和 DELETE |
| 唯一约束 | 同一 model_code 下 version 不可重复 |
| 单活约束 | 同一 model_code 只允许一个 active 状态的版本 |
| 配置校验 | 冻结前必须验证等级阈值和周期参数完整性 |
| 软删除 | 禁止物理删除，使用 `is_deleted` 标记 |

---

## 四、API 设计

### 4.1 API 列表

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | /model-versions | 模型版本列表查询 | 全局读 |
| GET | /model-versions/:id | 模型版本详情查询 | 全局读 |
| GET | /model-versions/active | 当前生效模型查询 | 全局读 |
| POST | /model-versions | 创建模型版本 | admin / safety_manager |
| PUT | /model-versions/:id | 更新模型版本 | admin / safety_manager |
| PUT | /model-versions/:id/freeze | 冻结模型版本 | admin / safety_manager |
| DELETE | /model-versions/:id | 删除模型版本 | admin |

### 4.2 API 详细设计

#### 4.2.1 模型版本列表查询

```
GET /api/hse/analysis-center/model-versions?model_code=HSE-RISK-PREDICT&status=active
```

**请求参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| model_code | string | 否 | 模型编码过滤 |
| status | string | 否 | 状态过滤 |

**响应数据**

```json
{
  "code": 0,
  "data": {
    "list": [
      {
        "id": 1,
        "modelCode": "HSE-RISK-PREDICT",
        "version": "v1.0",
        "algorithm": "linear_regression",
        "algorithmLabel": "线性回归",
        "predictionCycle": 3,
        "parameters": {},
        "confidenceMethod": "r2",
        "confidenceMin": 30,
        "levelCritical": 80,
        "levelMajor": 65,
        "levelMinor": 50,
        "anomalyStddevThreshold": 2,
        "anomalySlopeThreshold": 1,
        "anomalyAccidentSurge": 5,
        "trendUpThreshold": 5,
        "trendDownThreshold": -5,
        "status": "active",
        "statusLabel": "生效中",
        "isFrozen": true,
        "isFrozenLabel": "已冻结",
        "changeLog": "初始冻结版本",
        "createdBy": null,
        "createdAt": "2026-07-15T10:00:00Z",
        "updatedAt": "2026-07-15T10:00:00Z"
      }
    ],
    "total": 1
  }
}
```

#### 4.2.2 创建模型版本

```
POST /api/hse/analysis-center/model-versions
```

**请求体**

```json
{
  "model_code": "HSE-RISK-PREDICT",
  "version": "v1.1",
  "algorithm": "linear_regression",
  "prediction_cycle": 6,
  "parameters": {},
  "confidence_method": "r2",
  "confidence_min": 30,
  "level_critical": 85,
  "level_major": 70,
  "level_minor": 55,
  "anomaly_stddev_threshold": 2,
  "anomaly_slope_threshold": 1,
  "anomaly_accident_surge": 5,
  "trend_up_threshold": 5,
  "trend_down_threshold": -5,
  "status": "active",
  "change_log": "调整等级阈值和预测周期"
}
```

**业务校验**

1. model_code + version 组合唯一性校验
2. level_critical > level_major > level_minor 校验
3. prediction_cycle 范围校验（1-12）
4. 数值类型参数范围校验

#### 4.2.3 冻结模型版本

```
PUT /api/hse/analysis-center/model-versions/:id/freeze
```

**业务校验**

1. 版本存在性校验
2. 重复冻结校验（is_frozen 已为 true 时拒绝）
3. 配置完整性校验（等级阈值、周期参数必须配置）
4. 冻结后 `is_frozen=true`，禁止后续修改

#### 4.2.4 删除模型版本

```
DELETE /api/hse/analysis-center/model-versions/:id
```

**业务校验**

1. 版本存在性校验
2. 冻结版本禁止删除
3. 已被预测引用的版本提示关联信息

---

## 五、前端组件设计

### 5.1 页面结构

```
预测模型版本管理页
├── 版本列表区
│   ├── 搜索条件（模型编码、状态）
│   ├── 版本列表表格
│   │   ├── 版本号
│   │   ├── 主算法
│   │   ├── 预测周期
│   │   ├── 状态标签
│   │   ├── 冻结标签
│   │   └── 操作按钮（查看/编辑/冻结/删除）
│   └── 分页器
├── 版本详情抽屉
│   ├── 基本信息区
│   ├── 算法参数区
│   ├── 阈值配置区
│   ├── 变更历史区
│   └── 操作按钮区
└── 创建/编辑弹窗
    ├── 基本信息表单
    ├── 算法参数表单
    └── 阈值配置表单
```

### 5.2 核心交互

| 交互 | 说明 |
|------|------|
| 版本选择 | 点击行可查看版本详情 |
| 冻结操作 | 点击"冻结"按钮触发确认弹窗 |
| 状态切换 | 使用状态标签快速筛选 |
| 参数校验 | 表单实时校验参数范围和完整性 |

---

## 六、安全与审计

### 6.1 操作审计

| 操作 | 审计内容 |
|------|----------|
| 创建版本 | 创建人、时间、版本号、初始配置 |
| 更新版本 | 修改人、时间、变更字段、变更前后值 |
| 冻结版本 | 操作人、时间、冻结前配置快照 |
| 删除版本 | 操作人、时间、删除原因（change_log） |

### 6.2 权限矩阵

| 操作 | admin | safety_manager | 其他角色 |
|------|-------|----------------|----------|
| 查看版本列表 | ✅ | ✅ | ✅ |
| 查看版本详情 | ✅ | ✅ | ✅ |
| 创建版本 | ✅ | ✅ | ❌ |
| 更新版本 | ✅ | ✅ | ❌ |
| 冻结版本 | ✅ | ✅ | ❌ |
| 删除版本 | ✅ | ❌ | ❌ |

### 6.3 数据保护

| 保护措施 | 说明 |
|----------|------|
| 软删除机制 | 物理删除受限，保留历史数据 |
| 冻结版本锁定 | 冻结版本任何修改和删除操作均被拒绝 |
| 唯一约束 | 数据库层面保证 model_code + version 唯一 |
| JSON 校验 | parameters 字段使用 JSONB 类型，保证 JSON 格式正确 |

---

## 七、版本历史

| 版本 | 日期 | 修订人 | 修订说明 |
|------|------|--------|----------|
| v1.0 | 2026-07 | HSE 团队 | 初始设计版本 |
