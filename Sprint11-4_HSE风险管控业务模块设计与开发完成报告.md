# Sprint11-4 HSE风险管控业务模块设计与开发完成报告

> 版本: v1.0.0
> 日期: 2026-07-25
> 模块: 风险管控（HSE核心业务模块）

---

## 一、页面设计

### 1.1 一级菜单结构
- **一级菜单**: 风险管控（order: 4，冻结）
- **图标**: `lucide:shield-alert`
- **二级菜单**: 风险清单（唯一子菜单）

### 1.2 页面组成（前端路由）

| 路由路径 | 页面组件 | 说明 |
|---|---|---|
| `/risk/list` | `views/risk-control/index.vue` | 风险清单主页面 |

### 1.3 页面功能分区
- **顶部统计区**: 8张统计卡片（风险总数 / 四级风险分类统计 / 临期 / 过期 / 关联隐患数）
- **动态筛选区**: 8个筛选器（关键词、等级、类别、区域、部门、责任人、评价方法、时效状态）
- **数据列表区**: 风险清单列表（支持分页、排序）
- **详情弹窗**: 风险详情（基本信息 / 评价信息 / 管控措施 / 附件 / 版本履历 / 关联隐患）

---

## 二、菜单映射

| 菜单层级 | 菜单名称 | 路由路径 | 组件路径 | 权限 |
|---|---|---|---|---|
| 一级 | 风险管控 | `/risk` | - | admin |
| 二级 | 风险清单 | `/risk/list` | `views/risk-control/index.vue` | admin |

> 菜单约束：严格遵循冻结菜单，一级菜单名称和顺序未做任何修改。

**相关文件:**
- 前端路由: [hse-04-risk.ts](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules/hse-04-risk.ts)
- 后端注册: [app.js](file:///F:/deploy/hse-dashboard/server/app.js#L318-L318)

---

## 三、数据模型

### 3.1 主表：risk_sources（风险源表）

**核心字段**（已有 + 新增）：

| 字段 | 类型 | 说明 |
|---|---|---|
| id | BIGSERIAL | 主键 |
| name | VARCHAR | 风险名称 |
| type | VARCHAR | 风险类型 |
| category | VARCHAR | 风险类别 |
| location | VARCHAR | 风险位置 |
| area | VARCHAR | 所属区域 |
| level | VARCHAR | 风险等级（一级/二级/三级/四级） |
| measures | TEXT | 管控措施（文本） |
| emergency | TEXT | 应急措施 |
| **responsible_dept** | VARCHAR(128) | 责任部门（新增） |
| **responsible_dept_id** | BIGINT | 责任部门ID（新增） |
| **responsible_person** | VARCHAR(64) | 责任人（新增） |
| **responsible_person_id** | BIGINT | 责任人ID（新增，关联EmployeeSelector） |
| **job_name** | VARCHAR(128) | 所属作业名称（新增） |
| **job_type** | VARCHAR(64) | 作业类型（新增） |
| **post_name** | VARCHAR(128) | 岗位名称（新增） |
| **assessment_method** | VARCHAR(64) | 评价方法（LEC/矩阵/专家）（新增） |
| **assessment_score** | NUMERIC(10,2) | 评价分值（新增） |
| **control_measures** | JSONB | 管控措施分类（工程/管理/培训/应急）（新增） |
| assessment_date | DATE | 评估日期 |
| review_cycle | INT | 复评周期（月） |
| status | VARCHAR | 状态 |
| hazard_count | INT | 关联隐患数 |

### 3.2 关联表
- **risk_attachments**: 风险附件表
- **risk_versions**: 风险版本履历表
- **risk_hazard_links**: 风险-隐患关联表（多对多）

**相关文件:**
- 表结构迁移: [risk-control.js](file:///F:/deploy/hse-dashboard/server/routes/risk-control.js#L33-L116)

---

## 四、API接口（共20个）

### 4.1 核心CRUD（7个）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/risk-control/` | 风险列表查询（含分页、多条件筛选、时效状态） |
| GET | `/api/risk-control/:id` | 风险详情 |
| POST | `/api/risk-control/` | 创建风险（自动记录版本履历） |
| PUT | `/api/risk-control/:id` | 更新风险（自动记录版本履历） |
| DELETE | `/api/risk-control/:id` | 软删除 |
| GET | `/api/risk-control/export` | 导出CSV |
| POST | `/api/risk-control/import` | 批量导入（复用统一导入能力） |

### 4.2 统计API（3个）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/risk-control/stats/all` | 全部统计（总数/按等级/按类型/按区域/临期/过期/关联隐患） |
| GET | `/api/risk-control/stats/level` | 按等级统计 |
| GET | `/api/risk-control/stats/type` | 按类型统计 |

### 4.3 附件与版本（4个）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/risk-control/:id/attachments` | 附件列表 |
| POST | `/api/risk-control/:id/attachments` | 上传附件 |
| DELETE | `/api/risk-control/:id/attachments/:aid` | 删除附件 |
| GET | `/api/risk-control/:id/versions` | 版本履历 |

### 4.4 风险↔隐患联动（2个）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/risk-control/:id/related-hazards` | 关联隐患列表 |
| POST | `/api/risk-control/:id/generate-hazard` | 从风险点生成隐患 |

### 4.5 规则API（6个）✅ 新增

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/risk-control/rules/levels` | 风险等级规则（4级） |
| GET | `/api/risk-control/rules/assessment-methods` | 评价方法（3种） |
| GET | `/api/risk-control/rules/control-measures` | 管控措施分类（4类） |
| GET | `/api/risk-control/rules/categories` | 风险类别（10类） |
| GET | `/api/risk-control/rules/responsibility-matrix` | 责任矩阵 |
| GET | `/api/risk-control/rules/all` | 全部规则聚合 |

**相关文件:**
- 后端主路由: [risk-control.js](file:///F:/deploy/hse-dashboard/server/routes/risk-control.js)
- 前端API封装: [risk-control.ts](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/api/hse/risk-control.ts)

---

## 五、权限设计

| 角色 | 权限范围 |
|---|---|
| 管理员 | 风险全模块增删改查 + 规则查看 |
| 部门负责人 | 本部门风险管理 + 一级/二级风险审批 |
| 班组长 | 本班组风险管理 + 三级风险审批 |
| 普通员工 | 风险查看 + 四级风险自管 |

权限规则集中管理在 `config/hseRules/permissions.json`。

---

## 六、导入能力

- **模板下载**: 复用统一导入能力
- **Excel导入**: 支持批量导入风险数据
- **错误记录**: 导入错误支持追溯和下载
- **跳过错误行**: 支持批量跳过错误行

导入配置在 [import-config.json](file:///F:/deploy/hse-dashboard/server/config/hseRules/import-config.json)

---

## 七、动态筛选器（8个）✅ 已配置

| 字段 | 控件类型 | 数据源 | 联动帮助 |
|---|---|---|---|
| keyword | 输入框 | - | hse_risk_list |
| level | 下拉选择 | 枚举（4级） | hse_risk_level_rule |
| type | 下拉选择 | API | hse_risk_list |
| area | 下拉选择 | API | hse_risk_list |
| responsibleDept | 下拉选择 | API | hse_risk_responsibility |
| responsiblePerson | 下拉选择 | API（EmployeeSelector） | hse_risk_responsibility |
| assessmentMethod | 下拉选择 | API | hse_risk_assessment |
| expiryStatus | 下拉选择 | 枚举（4种状态） | hse_risk_expiry |

> 所有筛选器通过 `hse_filter_config` 表动态管理，禁止页面硬编码。

**相关文件:**
- 动态能力路由: [hse-dynamic-capability.js](file:///F:/deploy/hse-dashboard/server/routes/hse-dynamic-capability.js#L376-L423)

---

## 八、统计卡片（8张）✅ 已配置

| 卡片编码 | 标题 | 语义色 | 点击动作 | 联动筛选 |
|---|---|---|---|---|
| risk_total | 风险总数 | info | route→ 跳转列表 | - |
| risk_level1 | 重大风险 | danger | filter→ 筛选列表 | level=一级 |
| risk_level2 | 较大风险 | warning | filter→ 筛选列表 | level=二级 |
| risk_level3 | 一般风险 | info | filter→ 筛选列表 | level=三级 |
| risk_level4 | 低风险 | success | filter→ 筛选列表 | level=四级 |
| risk_expiring | 临期风险 | warning | filter→ 筛选列表 | expiryStatus=expiring |
| risk_expired | 过期风险 | danger | filter→ 筛选列表 | expiryStatus=expired |
| risk_linked_hazards | 关联隐患数 | info | none | - |

**卡片联动说明：**
- 点击统计卡片自动跳转风险清单并自动应用筛选条件
- 语义色统一使用 danger/warning/info/success，支持主题一致性
- 所有卡片关联 `help_code`，支持上下文帮助

**相关文件:**
- 卡片配置表: [hse-dynamic-capability.js](file:///F:/deploy/hse-dashboard/server/routes/hse-dynamic-capability.js#L425-L481)

---

## 九、帮助知识库（10篇）✅ 已配置

| menu_code | 标题 | 分类 |
|---|---|---|
| hse_risk_control | 风险管控模块概述 | 模块说明 |
| hse_risk_list | 风险清单说明 | 页面说明 |
| hse_risk_level_rule | 风险等级划分规则 | 计算规则 |
| hse_risk_assessment | 风险评价方法 | 计算规则 |
| hse_risk_control_measures | 管控措施分类说明 | 生成规则 |
| hse_risk_responsibility | 责任落实机制 | 关联规则 |
| hse_risk_expiry | 时效状态说明 | 计算规则 |
| hse_risk_import | 风险清单导入说明 | 操作说明 |
| hse_risk_hazard_link | 风险与隐患联动 | 关联规则 |
| hse_risk_data_source | 数据来源说明 | 模块说明 |

每篇帮助文档包含：**内容、字段说明、计算规则、生成规则、关联规则、权限规则** 6大字段。

**相关文件:**
- 知识库表结构: [sprint11_1_p0_foundation_migration.sql](file:///F:/deploy/hse-dashboard/server/sql/sprint11_1_p0_foundation_migration.sql#L15-L51)

---

## 十、与安全总览关系

### 10.1 统计数据联动
风险管控的 8 张统计卡片统一挂接至安全总览仪表盘（`dashboard_code: 'overview'`）：
- `risk_total` 风险总数
- `risk_level1` ~ `risk_level4` 四级风险分类统计
- `risk_expiring` / `risk_expired` 时效状态统计
- `risk_linked_hazards` 联动数据统计

### 10.2 数据流向
```
风险管控模块 → 风险统计API → 统计卡片 → 安全总览展示
```

### 10.3 隐患双向联动
- 风险点可生成隐患，隐患可关联风险点
- 形成 **"风险识别 → 风险管控 → 隐患排查 → 整改闭环"** 的完整业务链

### 10.4 责任关联
- 风险责任部门/责任人复用人员管理模块的 **EmployeeSelector** 组件
- 禁止重新开发人员选择

---

## 规则体系说明

### 规则配置文件
- **风险分级规则**: [risk-level-rule.json](file:///F:/deploy/hse-dashboard/server/config/hseRules/risk-level-rule.json)
  - 风险等级（4级）：一级(重大)/二级(较大)/三级(一般)/四级(低)
  - 评价方法（3种）：LEC法/风险矩阵法/专家评议法
  - 管控措施分类（4类）：工程/管理/培训/应急
  - 风险类别（10类）：机械/电气/坠落/火灾/化学/车辆/坍塌/中毒/淹溺/其他
  - 责任矩阵、自动升级规则

### 规则注册入口
- [hseRules/index.js](file:///F:/deploy/hse-dashboard/server/config/hseRules/index.js)

> **规则冻结声明：** 业务规则集中管理于 `config/hseRules`，`assessment_rule` 仅作为规则中心影子数据，不直接参与计算。当前版本使用配置文件，未来升级路径：配置文件 → assessment_rule 表 → 规则中心。

---

## 测试验证结果

**58 / 58 ✅ 全部通过**

测试项覆盖：
1. 规则配置文件（7项）
2. risk_sources 表字段（13项）
3. 动态筛选器配置（9项）
4. 统计卡片配置（13项）
5. 帮助知识库配置（11项）
6. 菜单与路由（4项）
7. API接口清单（1项，共20个API）

**相关文件:**
- 测试脚本: [test-risk-module.js](file:///F:/deploy/hse-dashboard/server/test-risk-module.js)

---

## 文件清单

| 文件 | 说明 |
|---|---|
| [risk-control.js](file:///F:/deploy/hse-dashboard/server/routes/risk-control.js) | 风险管控后端主路由（含规则API） |
| [risk-level-rule.json](file:///F:/deploy/hse-dashboard/server/config/hseRules/risk-level-rule.json) | 风险分级管控规则配置 |
| [index.js](file:///F:/deploy/hse-dashboard/server/config/hseRules/index.js) | 规则注册入口（新增风险规则） |
| [risk-control.ts](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/api/hse/risk-control.ts) | 前端API封装 |
| [hse-04-risk.ts](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules/hse-04-risk.ts) | 前端路由配置 |
| [init-risk-module.js](file:///F:/deploy/hse-dashboard/server/init-risk-module.js) | 模块初始化脚本（筛选器/卡片/帮助） |
| [migrate-risk-fields.js](file:///F:/deploy/hse-dashboard/server/migrate-risk-fields.js) | 数据库字段迁移脚本 |
| [test-risk-module.js](file:///F:/deploy/hse-dashboard/server/test-risk-module.js) | 测试验证脚本 |

---

**报告完成，等待审核。**
