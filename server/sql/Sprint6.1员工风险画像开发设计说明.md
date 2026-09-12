# Sprint6.1 员工风险画像开发设计说明

## 一、开发目标

建设员工HSE风险画像中心，以 `employee_id` 为核心，聚合以下数据域，实现员工风险的全景可视化与量化评估：

| 数据域 | 来源表/视图 | 说明 |
|--------|------------|------|
| 组织信息 | hse_org_unit | 员工所属组织单元 |
| 作业单元 | hse_operation_unit | 员工所属作业单元 |
| 岗位信息 | position | 员工岗位 |
| 责任信息 | hse_responsibility | 网格/生产管理等责任 |
| 三违记录 | violations | 违章指挥/违章作业/违反劳动纪律 |
| 培训状态 | employee_training_status | 培训完成率与逾期情况 |
| 事故记录 | accidents | 参与或责任事故 |
| 隐患记录 | hazard_record | 隐患发现与整改 |
| 交通安全 | grid_areas | 驾驶员交通相关数据 |

---

## 二、数据模型设计

### 2.1 hse_risk_score_config — 风险评分配置表

存储各风险维度的指标权重与评分规则，支持动态调整评分策略。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT PK AUTO_INCREMENT | 主键 |
| risk_dimension | VARCHAR(32) | 风险维度（violation/training/accident/hazard/traffic/patrol） |
| risk_indicator | VARCHAR(128) | 风险指标名称 |
| indicator_code | VARCHAR(64) | 指标编码，唯一标识 |
| weight | DECIMAL(5,4) | 权重（0~1，维度内各指标权重之和=1） |
| score_rule | JSON | 评分规则定义（扣分规则、区间映射等） |
| max_score | INT | 该指标最大可扣分数 |
| enabled | TINYINT DEFAULT 1 | 是否启用 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

```sql
CREATE TABLE IF NOT EXISTS hse_risk_score_config (
  id              BIGINT PRIMARY KEY AUTO_INCREMENT,
  risk_dimension  VARCHAR(32)  NOT NULL COMMENT '风险维度',
  risk_indicator  VARCHAR(128) NOT NULL COMMENT '风险指标名称',
  indicator_code  VARCHAR(64)  NOT NULL UNIQUE COMMENT '指标编码',
  weight          DECIMAL(5,4) NOT NULL DEFAULT 0 COMMENT '权重',
  score_rule      JSON         NOT NULL COMMENT '评分规则',
  max_score       INT          NOT NULL DEFAULT 100 COMMENT '最大可扣分数',
  enabled         TINYINT      NOT NULL DEFAULT 1 COMMENT '是否启用',
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_dimension (risk_dimension)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='风险评分配置表';
```

### 2.2 hse_employee_risk_snapshot — 员工风险评分快照表

存储每次批量计算后的员工风险评分快照，支持历史追溯。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT PK AUTO_INCREMENT | 主键 |
| employee_id | BIGINT | 员工ID |
| snapshot_date | DATE | 快照日期 |
| total_score | INT | 综合评分（0~100，满分100=零风险） |
| risk_level | VARCHAR(10) | 风险等级（低/中/高/极高） |
| dimension_scores | JSON | 各维度得分，如 `{"violation":85,"training":70,...}` |
| dimension_details | JSON | 各维度扣分明细 |
| calculated_at | DATETIME | 计算时间 |

```sql
CREATE TABLE IF NOT EXISTS hse_employee_risk_snapshot (
  id               BIGINT PRIMARY KEY AUTO_INCREMENT,
  employee_id      BIGINT      NOT NULL COMMENT '员工ID',
  snapshot_date    DATE        NOT NULL COMMENT '快照日期',
  total_score      INT         NOT NULL COMMENT '综合评分',
  risk_level       VARCHAR(10) NOT NULL COMMENT '风险等级',
  dimension_scores JSON        NOT NULL COMMENT '各维度得分',
  dimension_details JSON       COMMENT '各维度扣分明细',
  calculated_at    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_employee_date (employee_id, snapshot_date),
  INDEX idx_snapshot_date (snapshot_date),
  INDEX idx_risk_level (risk_level)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='员工风险评分快照表';
```

### 2.3 v_employee_risk_profile — 员工风险画像聚合视图

聚合员工基础信息与各风险数据域，作为画像查询的数据源。

```sql
CREATE OR REPLACE VIEW v_employee_risk_profile AS
SELECT
  e.id                                                            AS employee_id,
  e.name                                                          AS employee_name,
  e.employee_no,
  o.name                                                          AS org_name,
  ou.name                                                         AS operation_unit_name,
  p.name                                                          AS position_name,
  r.responsibility_type,
  r.grid_level,
  r.grid_role,
  -- 三违统计
  COALESCE(v.cnt, 0)                                              AS violation_count,
  -- 培训统计
  COALESCE(t.total, 0)                                            AS training_total,
  COALESCE(t.completed, 0)                                        AS training_completed,
  COALESCE(t.overdue, 0)                                          AS training_overdue,
  -- 事故统计
  COALESCE(a.cnt, 0)                                              AS accident_count,
  -- 隐患统计
  COALESCE(h.cnt, 0)                                              AS hazard_count,
  -- 交通安全（仅驾驶员）
  COALESCE(g.traffic_flag, 0)                                     AS traffic_flag,
  -- 网格巡查（仅grid_leader）
  COALESCE(g.patrol_count, 0)                                     AS patrol_count
FROM employee e
  LEFT JOIN hse_employee_relation er ON er.employee_id = e.id
  LEFT JOIN hse_org_unit o          ON o.id = er.org_unit_id
  LEFT JOIN hse_operation_unit ou   ON ou.id = er.operation_unit_id
  LEFT JOIN position p              ON p.id = er.position_id
  LEFT JOIN hse_responsibility r    ON r.employee_id = e.id
  LEFT JOIN (SELECT employee_id, COUNT(*) AS cnt FROM violations GROUP BY employee_id) v ON v.employee_id = e.id
  LEFT JOIN (SELECT employee_id, COUNT(*) AS total, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed, SUM(CASE WHEN status='overdue' THEN 1 ELSE 0 END) AS overdue FROM employee_training_status GROUP BY employee_id) t ON t.employee_id = e.id
  LEFT JOIN (SELECT employee_id, COUNT(*) AS cnt FROM accidents GROUP BY employee_id) a ON a.employee_id = e.id
  LEFT JOIN (SELECT employee_id, COUNT(*) AS cnt FROM hazard_record GROUP BY employee_id) h ON h.employee_id = e.id
  LEFT JOIN grid_areas g ON g.grid_leader_id = e.id
WHERE e.deleted = 0;
```

---

## 三、六类风险维度

| 维度 | 编码 | 适用范围 | 数据来源 | 核心指标 |
|------|------|---------|---------|---------|
| 三违风险 | violation | 全体员工 | violations | 三违次数、严重程度、近期频率 |
| 培训风险 | training | 全体员工 | employee_training_status | 培训完成率、逾期数、关键培训缺失 |
| 事故风险 | accident | 全体员工 | accidents | 责任事故数、事故等级、受伤情况 |
| 隐患责任风险 | hazard | 全体员工 | hazard_record | 隐患发现数、整改逾期数、重大隐患 |
| 交通安全风险 | traffic | 仅驾驶员 | grid_areas + 车辆管理 | 交通违章、事故记录 |
| 网格巡查责任风险 | patrol | 仅grid_leader | grid_areas | 巡查完成率、巡查频次达标率 |

> **注意**：traffic 维度仅当员工具有驾驶员身份时参与评分；patrol 维度仅当员工为 grid_leader 时参与评分。非适用范围内的员工，对应维度不参与评分，权重自动重新分配到其他维度。

---

## 四、责任展示规则

根据 `hse_responsibility.responsibility_type` 决定前端责任模块展示内容：

| 责任类型 | 展示内容 | 说明 |
|---------|---------|------|
| grid_leader | 网格等级 + 网格角色 + 巡查频次 | 显示所负责网格的层级、角色及应巡查/已巡查频次 |
| production_manager | 生产管理责任 | 显示所负责的生产区域与管理范围 |
| none | 不显示责任模块 | 无责任角色时不展示责任区域 |

---

## 五、评分模型

### 5.1 评分方式

采用**规则评分**（非AI），基于配置表中的权重和扣分规则进行计算。

### 5.2 权重分配（默认）

| 维度 | 权重 | 说明 |
|------|------|------|
| 三违风险 violation | 30% | 核心风险维度，权重最高 |
| 培训风险 training | 20% | 培训达标是安全基础 |
| 事故风险 accident | 25% | 事故直接反映安全表现 |
| 隐患责任风险 hazard | 15% | 隐患排查整改能力 |
| 交通安全风险 traffic | 10% | 仅驾驶员参与 |
| 网格巡查责任风险 patrol | 10% | 仅grid_leader参与 |

> **权重重分配规则**：当员工不适用于某维度时，该维度权重按比例分配至其他适用维度。例如非驾驶员+非grid_leader的员工，traffic(10%)和patrol(10%)的权重分配至其余4个维度。

### 5.3 风险等级

| 等级 | 综合评分范围 | 颜色标识 |
|------|------------|---------|
| 低风险 | 80 ≤ score ≤ 100 | 绿色 |
| 中风险 | 60 ≤ score < 80 | 黄色 |
| 高风险 | 40 ≤ score < 60 | 橙色 |
| 极高风险 | 0 ≤ score < 40 | 红色 |

### 5.4 评分计算公式

```
综合评分 = Σ(各维度得分 × 该维度实际权重)

其中：
  维度得分 = 100 - 该维度扣分合计（最低0分）
  实际权重 = 维度原始权重 / 适用维度权重之和
```

---

## 六、API设计

基础路径：`/api/hse/risk-profile`

| # | 方法 | 路径 | 说明 |
|---|------|------|------|
| 1 | GET | /list | 员工风险画像列表（分页、筛选） |
| 2 | GET | /:employeeId | 员工风险画像详情（6类风险明细） |
| 3 | GET | /:employeeId/score | 计算员工风险评分 |
| 4 | GET | /risk-stats/overview | 风险统计概览 |
| 5 | GET | /score-config | 评分配置列表 |
| 6 | PUT | /score-config/:id | 更新评分配置 |
| 7 | POST | /calculate-all | 批量计算所有员工评分 |
| 8 | GET | /dimension/:type | 维度明细查询 |

> 详细API设计见《员工风险画像API设计.md》

---

## 七、前端页面

### 7.1 员工风险画像中心页面

**页面结构：**

1. **统计概览区**（顶部卡片）
   - 总人数 / 低风险 / 中风险 / 高风险 / 极高风险 人数及占比
   - 各风险维度平均分趋势

2. **列表区**（中部表格）
   - 列：姓名、工号、组织、作业单元、岗位、责任类型、综合评分、风险等级、最近计算时间
   - 筛选：组织、作业单元、风险等级、责任类型
   - 支持分页与排序

3. **详情抽屉**（右侧滑出）
   - **基础信息**：姓名、工号、组织、作业单元、岗位、责任信息
   - **6类风险维度**：每个维度展示得分、扣分明细、趋势
   - **评分雷达图**：6维度雷达图可视化风险分布
   - **责任模块**：根据责任类型动态展示

---

## 八、数据安全

### 8.1 禁止修改的目录/文件

| 禁止项 | 路径 | 原因 |
|--------|------|------|
| 员工主数据 | employee / employee_assignment | 核心基础数据，修改影响全局 |
| 责任数据 | hse_responsibility | 已有业务逻辑依赖 |
| 认证鉴权 | auth / JWT | 安全关键模块 |
| 框架核心 | Vben核心目录 | 框架稳定性 |

### 8.2 禁止新增依赖

- 不新增 npm 依赖包
- 不新增第三方 SDK
- 使用项目已有依赖实现所有功能

### 8.3 数据操作规范

- 所有查询走视图 `v_employee_risk_profile`，不直接关联业务表
- 评分计算仅写入快照表 `hse_employee_risk_snapshot`，不回写业务表
- 配置修改仅操作 `hse_risk_score_config` 表
