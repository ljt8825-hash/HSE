# 提示词 14：事故/三检/维修/违章模块 vehicle_id 联动扫描

- 生成日期：2026-08-05 (GMT+8)
- 轮次：阶段14 — 车辆主数据联动（事故/三检/维修/违章）
- 前置轮次：执行报告-13（车辆主数据收敛完成）
- 本轮性质：**只读扫描与分析报告**（禁止修改任何代码文件、禁止连接数据库执行SQL、禁止运行测试以外的命令）

---

## 背景与前置结论

车辆主数据已在阶段13收敛：
- **唯一主入口**：`/api/insurance/vehicle`
- **车辆主键**：`vehicles.id`（BIGSERIAL），车牌`plate`为业务唯一键（部分唯一索引）
- **遗留接口**：`/api/vehicles`标记为`@deprecated`
- **有效止期口径**：`COALESCE(commercial_end, compulsory_end, insurance_end)`，使用Asia/Shanghai参数化业务日

前置探索已知结论（需你在代码中验证并深化）：

| 模块 | 路由文件 | SQL表 | vehicle_id | 实现完整度 |
|------|---------|-------|-----------|-----------|
| 事故 | `routes/accidents.js` | `accidents` | 有（`vehicle_id BIGINT`） | 高（完整CRUD+附件+版本） |
| 三检 | `routes/hse-driver-risk.js`（内嵌） | `hse_driver_inspection_records`（主）/`vehicle_inspection_records`（旧） | **无**（仅有`vehicle_no`文本） | 低（仅新增+导入，缺列表/详情/更新/删除） |
| 维修 | **不存在** | **无** | N/A | **零（未开发）** |
| 违章 | `routes/violations.js` | `violation_records` | **无**（仅有`vehicle_type_or_cleaner`文本） | 高（人员三违，完整CRUD+整改） |

---

## 你的任务

**本轮仅做只读代码扫描和分析，输出Markdown报告。禁止修改任何文件，禁止执行SQL，禁止写代码。**

请逐一完成以下四个模块的审计，并生成一份完整的扫描报告（保存为`docs/Codex/执行报告-14-四模块vehicle_id联动扫描.md`）。

---

## 审计清单（逐项执行并记录结论）

### 一、事故模块（accidents）深度审计

事故模块是唯一已有`vehicle_id`字段的模块，请逐项检查：

1. **vehicle_id字段使用正确性**
   - 检查`accidents`表DDL（在`init-tables.js`和路由文件中），确认`vehicle_id`字段类型、是否允许NULL、是否有外键约束
   - 检查所有INSERT语句：创建事故时`vehicle_id`是否为必填？是否有校验？空值/无效ID如何处理？
   - 检查所有UPDATE语句：更新事故时是否支持修改`vehicle_id`？修改后是否校验目标车辆存在？
   - 检查所有SELECT/列表查询：按车辆筛选事故时是否用`vehicle_id`而非车牌文本？列表返回是否包含车辆信息（车牌等）？
   - 检查`involved_vehicle`文本字段：它与`vehicle_id`的关系是什么？是否冗余？何时使用？

2. **数据一致性防护**
   - 删除车辆时（`DELETE /api/insurance/vehicle/:id`），是否同步处理关联事故？当前行为是级联软删、阻止删除、还是置空vehicle_id？
   - 是否存在"孤儿事故"风险（vehicle_id指向不存在/已删除车辆）？
   - 创建/更新时是否校验`vehicle_id`在`vehicles`表中存在且未删除？还是仅信任前端传入？
   - 是否有事务保证事故与关联数据（附件、版本记录）的原子性？

3. **鉴权与安全**
   - 事故CRUD接口的角色校验是否完整（admin/safety_manager）？
   - 列表查询是否有数据权限过滤（部门/人员范围）？
   - 错误处理是否安全（不泄漏SQL/连接信息）？

4. **事故类型区分**
   - 事故模块是否区分"交通事故"vs"工伤事故"vs"其他事故"？
   - 交通事故是否必须关联vehicle_id？非交通事故是否允许vehicle_id为空？
   - `accident_type`字段的枚举值有哪些？

5. **前端调用**
   - 搜索`安全看板vben/apps/web-antd/src`下前端代码，确认事故页面调用的是哪个API路径（`/api/accidents`还是其他）
   - 事故创建/编辑表单中车辆选择器是传车牌文本还是vehicle_id？

### 二、三检模块（inspection）深度审计

三检模块现状复杂（新旧两张表、无独立CRUD），请逐项检查：

1. **表结构与数据迁移**
   - `vehicle_inspection_records`（旧表）和`hse_driver_inspection_records`（新表）的字段差异是什么？
   - `init-risk-model-cleanup.js`中的迁移逻辑是否完整？是否有数据丢失风险？
   - 当前代码中哪些地方还在引用旧表？（搜索`vehicle_inspection_records`）
   - 新表`hse_driver_inspection_records`是否有`vehicle_id`字段？如果没有，车辆关联方式是什么（仅`vehicle_no`文本？）

2. **三检的业务定位**
   - 三检记录的主体是"驾驶员"还是"车辆"？（从表字段和接口参数判断）
   - `employee_id`字段存在吗？三检是否必须关联驾驶员？
   - `vehicle_no`字段是车牌号文本，是否需要升级为`vehicle_id`外键关联？
   - 三检的业务含义是什么？（出车前检查？定期检查？）是否需要按车辆查询历史三检记录？

3. **CRUD完整性**
   - 现有接口清单：POST新增、POST批量导入，还有吗？
   - 缺少的接口：GET列表（分页/筛选）、GET详情、PUT更新、DELETE删除——这些是否需要补齐？
   - 导入逻辑中车辆如何匹配？按车牌文本模糊匹配还是精确匹配？导入时是否能自动关联vehicle_id？

4. **统计接口问题**
   - `hse-driver-risk-center.js`引用旧表`vehicle_inspection_records`，是否会导致统计数据不准？
   - 三检统计口径是什么？按驾驶员还是按车辆？

### 三、维修模块（maintenance）评估

维修模块完全未开发，请基于代码库中的线索分析：

1. **需求线索**
   - 搜索"维修""保养""repair""maintenance"关键词，找出所有相关引用（包括前端菜单、SQL中的状态枚举、岗位字典等）
   - `vehicles.status`字段的枚举值中"维修中"/"停用"是如何触发的？是否有对应的维修工单流程？
   - 前端是否有维修管理相关的菜单/路由/页面文件？（搜索`src/views`和`src/router`）

2. **模块必要性评估**
   - 当前是否有任何业务逻辑依赖维修记录？
   - 如果需要开发维修模块，建议的数据模型是什么？（维修工单、维修项目、配件、费用、关联车辆vehicle_id、送修人、维修厂等）
   - 是否可以暂时不开发，仅保留车辆状态字段？还是需要在本轮补齐基础CRUD？

### 四、违章模块（violations）定性分析

违章模块实际是"三违"（人员安全违章），请确认：

1. **模块定性**
   - `violation_records`表的业务含义是什么？阅读表DDL和字段注释
   - `violation_type`字段枚举值有哪些？是否包含"交通违章"类型？
   - `vehicle_type_or_cleaner`字段的真实含义是什么？（从字段名看像是"车辆类型/保洁员"，可能不是交通违章关联）
   - 三违记录的主体是人员（`violator_id`关联employee），车辆是否需要作为关联维度？

2. **交通违章处理**
   - 交通违章是否通过事故模块（`accident_type='交通'`）来记录？
   - 是否需要单独的交通违章模块？还是交通违章纳入事故模块统一管理？
   - 如果三违模块不需要vehicle_id，明确记录"三违为人员维度违章，不需要车辆关联"的结论

---

## 报告输出要求

将审计结果写入`docs/Codex/执行报告-14-四模块vehicle_id联动扫描.md`，报告结构如下：

```markdown
# 执行报告 14：事故/三检/维修/违章模块 vehicle_id 联动扫描

## 一、总体结论
（四模块整体状态：哪些需要整改、哪些保持现状、哪些需要新建、优先级排序）

## 二、事故模块审计
### 2.1 vehicle_id字段使用现状
（字段定义、INSERT/UPDATE/SELECT使用情况、involved_vehicle与vehicle_id关系）
### 2.2 数据一致性风险
（孤儿记录、删除行为、校验逻辑、事务完整性）
### 2.3 鉴权与安全
（角色校验、数据权限、错误处理）
### 2.4 事故类型与车辆关联
（交通事故vs工伤事故、vehicle_id是否必填）
### 2.5 前端调用情况
（API路径、车辆选择器传值方式）
### 2.6 需要修复的问题清单（P0/P1/P2分级）

## 三、三检模块审计
### 3.1 表结构与新旧表混用问题
（两张表字段对比、迁移完整性、旧表引用点）
### 3.2 业务定位与vehicle_id需求
（三检主体是驾驶员还是车辆、是否需要vehicle_id外键）
### 3.3 CRUD缺口
（现有接口清单、缺失接口清单、补齐优先级）
### 3.4 导入逻辑车辆匹配
（当前按车牌文本匹配的问题、改进建议）
### 3.5 统计接口旧表引用问题
（driver-risk-center引用旧表的影响）
### 3.6 需要修复/新建的问题清单（P0/P1/P2分级）

## 四、维修模块评估
### 4.1 现有线索汇总
（状态枚举、岗位字典、前端菜单、所有相关引用）
### 4.2 模块必要性结论
（是否需要在本轮开发、还是后续轮次、或暂不开发）
### 4.3 如果开发，建议数据模型（可选）

## 五、违章模块定性
### 5.1 模块业务定性
（三违=人员安全违章，非交通违章）
### 5.2 vehicle_id需求结论
（是否需要添加vehicle_id、交通违章如何处理）
### 5.3 需要修复的问题清单（如有）

## 六、跨模块共性问题
（鉴权不一致、错误处理不统一、事务模式差异等）

## 七、下阶段建议
（按优先级排列需要整改的事项，明确哪些在本轮修复、哪些留待后续）

## 八、禁止操作确认
（确认本轮未修改任何文件、未执行SQL、未连接真实数据库）
```

---

## 工作约束（严格遵守）

1. **只读原则**：本轮是扫描轮次，禁止修改任何`.js`/`.ts`/`.vue`/`.sql`文件。唯一允许写入的是报告文件`执行报告-14-四模块vehicle_id联动扫描.md`。
2. **禁止连接数据库**：不得创建任何数据库连接，不得执行任何SQL语句。所有表结构信息从代码中读取（`init-tables.js`、路由文件中的`CREATE TABLE IF NOT EXISTS`、SQL文件等）。
3. **禁止运行会修改数据的命令**：可以运行`node --check`做语法检查，可以运行`npm test`做只读测试验证，但不得运行任何迁移脚本、种子数据脚本或开发服务器。
4. **禁止删除/覆盖用户文件**：所有发现只记录在报告中，不做任何代码修改。
5. **Grep/Read限制**：使用Grep和Read工具搜索和阅读代码，不要使用Task子代理做修改操作。
6. **中文输出**：报告全文使用中文。

---

## 参考文件路径（关键入口）

- 事故路由：`server/routes/accidents.js`
- 违章路由：`server/routes/violations.js`
- 三检路由：`server/routes/hse-driver-risk.js`、`server/routes/hse-driver-risk-center.js`
- 三检旧表迁移：`server/init-risk-model-cleanup.js`、`server/init-driver-tables.js`
- 表初始化：`server/init-tables.js`
- 路由挂载：`server/app.js`
- 前端API：`安全看板vben/apps/web-antd/src/api/`
- 前端页面：`安全看板vben/apps/web-antd/src/views/`
- 前端路由：`安全看板vben/apps/web-antd/src/router/`
- 车辆主数据入口（参考）：`server/routes/insurance.js`（搜索`/vehicle`路由段）
- 前序报告参考：`docs/Codex/执行报告-13-车辆主数据联动扫描与收敛.md`
