# Sprint11-5 HSE隐患治理业务模块设计与开发完成报告

> 版本: v1.0.0
> 日期: 2026-07-25
> 模块: 隐患治理（HSE核心业务模块，一级菜单第5位）

---

## 一、页面设计

### 1.1 一级菜单结构
- **一级菜单**: 隐患治理（order: 5，冻结）
- **图标**: `lucide:search-check`
- **二级菜单**: 隐患清单（当前唯一子菜单）

### 1.2 页面组成（前端路由）

| 路由路径 | 页面组件 | 说明 |
|---|---|---|
| `/hazards/list` | `views/hazards/index.vue` | 隐患清单主页面 |

### 1.3 页面功能分区
- **顶部统计区**: 11张统计卡片（总数/四级隐患分类/待整改/整改中/临期/超期/已闭环/关联风险数）
- **动态筛选区**: 10个筛选器（关键词、等级、状态、来源、类别、区域、部门、责任人、时效、日期范围）
- **数据列表区**: 隐患清单列表（支持分页、排序）
- **详情弹窗/页面**: 隐患详情（基本信息、整改信息、复查信息、附件、版本履历、关联风险）

---

## 二、菜单映射

| 菜单层级 | 菜单名称 | 路由路径 | 组件路径 | 权限 |
|---|---|---|---|---|
| 一级 | 隐患治理 | `/hazards` | - | admin |
| 二级 | 隐患清单 | `/hazards/list` | `views/hazards/index.vue` | admin |

> 菜单约束：严格遵循冻结菜单，一级菜单名称和顺序未做任何修改。
> 二级菜单当前为1个（隐患清单），总数从58更新为59（含风险管控下2个）。

**相关文件:**
- 前端路由: [hse-05-hazards.ts](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules/hse-05-hazards.ts)
- 后端注册: [app.js](file:///F:/deploy/hse-dashboard/server/app.js#L325-L325)

---

## 三、数据模型

### 3.1 主表：hazards（隐患表）

**核心字段**（已有 + 新增）：

| 字段 | 类型 | 说明 |
|---|---|---|
| id | BIGSERIAL | 主键 |
| no | INTEGER | 序号 |
| description | TEXT | 隐患描述 |
| measure | TEXT | 整改措施 |
| hazard_date | DATE | 检查日期 |
| checker | VARCHAR | 检查人 |
| fixer | VARCHAR | 整改人 |
| fix_date | DATE | 整改完成日期 |
| status | VARCHAR | 治理状态 |
| remark | TEXT | 备注 |
| **hazard_level** | VARCHAR(32) | 隐患等级（一级/二级/三级/四级） |
| **hazard_source** | VARCHAR(64) | 隐患来源（日常检查/专项/风险生成等） |
| **hazard_category** | VARCHAR(64) | 隐患类别（火灾/电气/机械等13类） |
| **responsible_dept** | VARCHAR(128) | 责任部门 |
| **responsible_dept_id** | BIGINT | 责任部门ID |
| **responsible_id** | BIGINT | 整改责任人ID（EmployeeSelector） |
| **finder_id** | BIGINT | 发现人ID |
| **corrector_id** | BIGINT | 复查人ID |
| **post_name** | VARCHAR(128) | 岗位名称 |
| **area** | VARCHAR(128) | 所属区域 |
| **location** | VARCHAR(255) | 具体位置 |
| **related_risk_id** | BIGINT | 关联风险点ID（Sprint11-4联动） |
| **related_risk_ids** | JSONB | 关联多个风险点ID数组 |
| **risk_level** | VARCHAR(32) | 同步风险等级 |
| **deadline_days** | INT | 整改期限天数 |
| **deadline_date** | DATE | 整改截止日期 |
| **rectify_date** | DATE | 实际开始整改日期 |
| **actual_rectify_date** | DATE | 实际完成整改日期 |
| **review_date** | DATE | 复查日期 |
| **review_result** | VARCHAR(32) | 复查结果 |
| is_deleted | BOOLEAN | 软删除标记 |

### 3.2 关联表
- **hazard_attachments**: 隐患附件表
- **hazard_versions**: 隐患版本履历表
- **risk_hazard_links**: 风险-隐患关联表（多对多，复用Sprint11-4）

---

## 四、API接口（共25个）

### 4.1 核心CRUD（6个）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/hazards/` | 隐患列表查询（分页、多条件筛选、时效状态） |
| GET | `/api/hazards/:id` | 隐患详情 |
| POST | `/api/hazards/` | 创建隐患（自动记录版本履历） |
| PUT | `/api/hazards/:id` | 更新隐患（自动记录版本履历） |
| DELETE | `/api/hazards/:id` | 软删除 |
| GET | `/api/hazards/export` | 导出CSV |

### 4.2 状态流转API（5个）

| 方法 | 路径 | 说明 |
|---|---|---|
| PUT | `/api/hazards/:id/rectify` | 提交整改（状态：→整改中） |
| PUT | `/api/hazards/:id/submit-review` | 提交复查申请（状态：→待复查） |
| PUT | `/api/hazards/:id/review` | 复查验收（通过：→已闭环 / 不通过：→整改中） |
| PUT | `/api/hazards/:id/close` | 强制闭环 |
| GET | `/api/hazards/stats` | 统计（总数/按等级/按状态/临期/超期/关联风险） |

### 4.3 风险联动API（1个）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/hazards/:id/related-risk` | 查询关联风险点 |

> 反向联动（风险→生成隐患）API已在 Sprint11-4 落地：
> - `POST /api/risk-control/:id/generate-hazard` 从风险点生成隐患

### 4.4 附件与版本（3个）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/hazards/:id/attachments` | 附件列表 |
| POST | `/api/hazards/:id/attachments` | 上传附件 |
| GET | `/api/hazards/:id/versions` | 版本履历 |

### 4.5 分析与提醒（3个）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/hazards/reminders/high-risk` | 高风险隐患提醒 |
| GET | `/api/hazards/reminders/overdue` | 超期隐患提醒 |
| GET | `/api/hazards/analysis/repeated` | 重复隐患分析 |

### 4.6 规则API（7个）✅ 新增

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/hazards/rules/levels` | 隐患等级规则（4级） |
| GET | `/api/hazards/rules/status-flow` | 状态流转规则（6状态+12流转） |
| GET | `/api/hazards/rules/sources` | 隐患来源分类（8类） |
| GET | `/api/hazards/rules/categories` | 隐患类别（13类） |
| GET | `/api/hazards/rules/expiry` | 时效规则（临期阈值7天） |
| GET | `/api/hazards/rules/responsibility-matrix` | 责任矩阵（5角色） |
| GET | `/api/hazards/rules/all` | 全部规则聚合 |

**相关文件:**
- 后端主路由: [hazards.js](file:///F:/deploy/hse-dashboard/server/routes/hazards.js)

---

## 五、权限设计（严格对齐组织层级）

| 组织层级 | 角色编码 | 隐患治理权限 |
|---|---|---|
| 公司总经理 | company_gm | 审批一级(重大)隐患整改方案，监督一级隐患治理，拥有最高权限 |
| 部门/中心负责人 | dept_manager | 审批二级(较大)隐患，监督本部门隐患治理 |
| 乡镇作业中心经理 | township_manager | 审批三级(一般)隐患，分配整改责任人，监督辖区内隐患 |
| 管理员 | admin | 隐患登记建档、数据维护、流程跟踪、复查验收 |
| 员工 | employee | 上报隐患线索，执行整改任务，落实个人防护 |

**按隐患等级审批矩阵：**
| 隐患等级 | 审批角色 | 监督角色 | 执行角色 |
|---|---|---|---|
| 一级(重大) | 公司总经理 | 部门负责人 | 管理员 |
| 二级(较大) | 部门负责人 | 乡镇主管 | 管理员 |
| 三级(一般) | 乡镇主管 | 管理员 | 员工 |
| 四级(轻微) | 管理员 | 管理员 | 员工 |

---

## 六、导入能力

- **模板下载**: 复用统一导入能力
- **Excel导入**: 支持批量导入隐患数据
- **错误记录**: 导入错误支持追溯和下载
- **跳过错误行**: 支持批量跳过错误行
- **人员关联**: 优先使用员工编号，禁止仅依赖姓名

导入配置在 [import-config.json](file:///F:/deploy/hse-dashboard/server/config/hseRules/import-config.json)

---

## 七、动态筛选器（10个）✅ 已配置

| 字段 | 控件类型 | 数据源 | 联动帮助 |
|---|---|---|---|
| keyword | 输入框 | - | hse_hazard_list |
| hazardLevel | 下拉选择 | 枚举（4级） | hse_hazard_level_rule |
| status | 下拉选择 | 枚举（6种状态） | hse_hazard_status_flow |
| hazardSource | 下拉选择 | API（8类） | hse_hazard_source |
| hazardCategory | 下拉选择 | API（13类） | hse_hazard_category |
| area | 下拉选择 | API | hse_hazard_list |
| responsibleDept | 下拉选择 | API | hse_hazard_responsibility |
| responsibleId | 下拉选择 | API（EmployeeSelector） | hse_hazard_responsibility |
| expiryStatus | 下拉选择 | 枚举（4种时效） | hse_hazard_expiry |
| checkDateRange | 时间范围 | 日期 | hse_hazard_list |

> 所有筛选器通过 `hse_filter_config` 表动态管理，禁止页面硬编码。

---

## 八、统计卡片（11张）✅ 已配置

| 卡片编码 | 标题 | 语义色 | 点击动作 | 联动筛选 |
|---|---|---|---|---|
| hazard_total | 隐患总数 | info | route→ 跳转列表 | - |
| hazard_level1 | 重大隐患 | danger | filter→ 筛选列表 | hazardLevel=一级 |
| hazard_level2 | 较大隐患 | warning | filter→ 筛选列表 | hazardLevel=二级 |
| hazard_level3 | 一般隐患 | info | filter→ 筛选列表 | hazardLevel=三级 |
| hazard_level4 | 轻微隐患 | success | filter→ 筛选列表 | hazardLevel=四级 |
| hazard_pending | 待整改 | warning | filter→ 筛选列表 | status=assigned |
| hazard_processing | 整改中 | info | filter→ 筛选列表 | status=processing |
| hazard_expiring | 临期隐患 | warning | filter→ 筛选列表 | expiryStatus=expiring |
| hazard_expired | 超期隐患 | danger | filter→ 筛选列表 | expiryStatus=expired |
| hazard_closed | 已闭环 | success | filter→ 筛选列表 | status=closed |
| hazard_related_risks | 关联风险数 | info | none | - |

**卡片联动说明：**
- 点击统计卡片自动跳转隐患清单并自动应用筛选条件
- 语义色统一使用 danger/warning/info/success，支持主题一致性
- 所有卡片关联 `help_code`，支持上下文帮助
- 所有卡片挂接至安全总览仪表盘（dashboard_code: 'overview'）

---

## 九、帮助知识库（11篇）✅ 已配置

| menu_code | 标题 | 分类 |
|---|---|---|
| hse_hazard_control | 隐患治理模块概述 | 模块说明 |
| hse_hazard_list | 隐患清单说明 | 页面说明 |
| hse_hazard_level_rule | 隐患等级划分规则 | 计算规则 |
| hse_hazard_status_flow | 状态流转规则 | 计算规则 |
| hse_hazard_source | 隐患来源分类 | 页面说明 |
| hse_hazard_category | 隐患类别说明 | 页面说明 |
| hse_hazard_expiry | 时效状态说明 | 计算规则 |
| hse_hazard_responsibility | 责任落实机制 | 关联规则 |
| hse_hazard_import | 隐患导入说明 | 操作说明 |
| hse_hazard_risk_link | 隐患与风险联动 | 关联规则 |
| hse_hazard_data_source | 数据来源说明 | 模块说明 |

每篇帮助文档包含：**内容、字段说明、计算规则、生成规则、关联规则、权限规则** 6大字段。

---

## 十、与安全总览及风险管控的关系

### 10.1 与安全总览关系
- 隐患治理的 11 张统计卡片统一挂接至安全总览仪表盘（`dashboard_code: 'overview'`）
- 数据流向：隐患治理模块 → 统计API → 统计卡片 → 安全总览展示
- 与风险管控卡片（8张）、三违卡片共同构成安全总览核心数据

### 10.2 与风险管控双向联动（Sprint11-4 兼容）

**风险 → 隐患（正向）：**
- `POST /api/risk-control/:id/generate-hazard` 从风险点生成隐患
- 自动预填描述、管控措施、风险等级
- 自动创建 risk_hazard_links 关联记录

**隐患 → 风险（反向）：**
- `GET /api/hazards/:id/related-risk` 查询关联风险点
- 隐患整改完成后自动更新关联风险点：
  - `risk_sources.last_hazard_check_date` = 最近整改完成日期
  - `risk_sources.hazard_count` = 未完成隐患数
- 支持关联多个风险点（`related_risk_ids` JSONB数组）

### 10.3 数据闭环
```
数据采集(检查/上报/导入) → 业务处理(登记/分配/整改/复查)
→ 规则计算(等级/时效/升级) → 统计分析(卡片/报表/分析)
→ 安全总览(仪表盘展示) ↔ 风险管控(双向联动)
```

---

## 状态机规则体系说明

### 状态定义（6种）
| 状态编码 | 状态标签 | 语义色 | 说明 |
|---|---|---|---|
| discovered | 待登记 | info | 隐患已发现，待登记建档 |
| assigned | 待整改 | warning | 已登记并分配整改责任人，等待整改 |
| processing | 整改中 | warning | 整改责任人正在落实整改措施 |
| pending_review | 待复查 | info | 整改完成，提交复查申请 |
| closed | 已闭环 | success | 复查通过，隐患治理完成闭环 |
| expired | 已超期 | danger | 超过整改期限仍未完成整改 |

### 关键流转规则（12条）
- 待登记 → 待整改：登记并分配责任人（乡镇主管/管理员）
- 待整改 → 整改中：整改人接受任务
- 整改中 → 待复查：提交整改完成（整改人）
- 待复查 → 已闭环：复查通过（复查人）
- 待复查 → 整改中：复查不通过（复查人）
- 已超期 → 整改中：继续整改（整改人）
- 已超期 → 待整改：申请延期（乡镇主管）
- 已闭环 → 待登记：隐患复发重新开启（管理员）

---

## 规则体系说明

### 规则配置文件
- **隐患治理规则**: [hazard-rule.json](file:///F:/deploy/hse-dashboard/server/config/hseRules/hazard-rule.json)
  - 隐患等级（4级）：一级(重大)/二级(较大)/三级(一般)/四级(轻微)
  - 状态机：6种状态 + 12条流转规则
  - 隐患来源（8类）：日常检查/专项检查/综合检查/风险生成/员工上报/上级督办/事故衍生/其他
  - 隐患类别（13类）：火灾爆炸/电气安全/机械伤害/高处坠落/坍塌倾覆/危险化学品/中毒窒息/车辆交通/淹溺风险/管理缺陷/培训不足/个体防护/其他
  - 时效规则：临期阈值7天，默认整改期限30天
  - 责任矩阵：严格对齐5层组织层级
  - 自动升级规则：超期≥7天/重复≥3次/复查不通过≥2次 自动升级等级

### 规则注册入口
- [hseRules/index.js](file:///F:/deploy/hse-dashboard/server/config/hseRules/index.js)

> **规则冻结声明：** 业务规则集中管理于 `config/hseRules`，`assessment_rule` 仅作为规则中心影子数据，不直接参与当前业务计算。

---

## 测试验证结果

**69 / 69 ✅ 全部通过**

测试项覆盖：
1. 规则配置文件（9项）
2. hazards 表字段（17项）
3. 动态筛选器配置（11项）
4. 统计卡片配置（15项）
5. 帮助知识库配置（12项）
6. 菜单与路由（4项）
7. API接口清单（1项，共25个API）

**相关文件:**
- 测试脚本: [test-hazard-module.js](file:///F:/deploy/hse-dashboard/server/test-hazard-module.js)

---

## 文件清单

| 文件 | 说明 |
|---|---|
| [hazards.js](file:///F:/deploy/hse-dashboard/server/routes/hazards.js) | 隐患治理后端主路由（含7个新增规则API） |
| [hazard-rule.json](file:///F:/deploy/hse-dashboard/server/config/hseRules/hazard-rule.json) | 隐患治理业务规则配置 |
| [index.js](file:///F:/deploy/hse-dashboard/server/config/hseRules/index.js) | 规则注册入口（新增隐患规则） |
| [hse-05-hazards.ts](file:///F:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/router/routes/modules/hse-05-hazards.ts) | 前端路由配置 |
| [init-hazard-module.js](file:///F:/deploy/hse-dashboard/server/init-hazard-module.js) | 模块初始化脚本（筛选器+卡片+帮助） |
| [migrate-hazard-fields.js](file:///F:/deploy/hse-dashboard/server/migrate-hazard-fields.js) | 数据库字段迁移脚本 |
| [test-hazard-module.js](file:///F:/deploy/hse-dashboard/server/test-hazard-module.js) | 测试验证脚本 |

---

**报告完成，等待审核。**
