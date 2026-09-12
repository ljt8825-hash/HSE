# Sprint6开发数据准备说明

> 版本：v1.0（Sprint6开发前最终版）
> 阶段：Sprint5.17（基础责任数据模型收口设计）
> 日期：2026年7月22日
> 依据：HSE责任体系最终设计说明、HSE基础数据模型设计、岗位责任类型映射表
> 状态：🔒 Sprint6开发依据（最终版）

---

## 一、设计定位

### 1.1 文档目的

本文档是Sprint6开发前的**数据准备说明**，明确开发顺序、数据初始化、验证标准，作为开发实施的最终依据。

### 1.2 Sprint6开发范围

| 开发项 | 说明 | 优先级 |
|--------|------|:------:|
| 基础数据模型 | 14个数据表创建 | P0 |
| 标准岗位初始化 | 17个标准岗位 + 16个别名 | P0 |
| 责任配置初始化 | 17条责任类型配置 | P0 |
| 映射规则初始化 | 组织映射 + 岗位映射 | P0 |
| 花名册导入 | 责任推导流程 | P1 |
| 责任配置管理 | 责任类型配置界面 | P1 |
| 责任画像关联 | 责任记录与画像关联 | P2 |

---

## 二、开发顺序

### 2.1 P0：基础数据模型（必须先完成）

```
步骤1：创建组织模型
    ├── hse_org_unit 表
    └── hse_operation_unit 表
    ↓
步骤2：扩展岗位模型
    ├── position 表扩展（新增2个标准岗位）
    ├── hse_position_alias 表
    └── hse_responsibility_config 表
    ↓
步骤3：创建责任模型
    ├── hse_responsibility 表
    └── hse_responsibility_area 表（可选）
    ↓
步骤4：创建导入模型
    ├── employee_import_mapping_rule 表
    ├── employee_position_mapping_rule 表
    ├── employee_import_mapping_rule_version 表
    ├── employee_import_batch 表
    └── employee_import_pending 表
    ↓
步骤5：创建兼容视图
    ├── hse_grid_responsibility 视图
    ├── hse_position_responsibility_config 视图
    └── hse_grid_area 视图
```

### 2.2 P0：数据初始化（模型创建后立即执行）

```
步骤1：组织数据初始化
    ├── 项目公司（company）
    ├── 4个职能部门（department）
    ├── 2个作业中心（center）
    └── 11个乡镇作业中心（town_center）
    ↓
步骤2：岗位数据初始化
    ├── 17个标准岗位
    └── 16个岗位别名
    ↓
步骤3：责任配置初始化
    └── 17条 hse_responsibility_config 记录
    ↓
步骤4：映射规则初始化
    ├── 组织映射规则（含别名映射）
    └── 岗位映射规则（24条）
    ↓
步骤5：规则版本初始化
    └── v1.1 规则版本记录
```

### 2.3 P1：业务功能开发

```
步骤1：花名册导入功能
    ├── Excel上传与解析
    ├── 组织匹配
    ├── 作业单元匹配
    ├── 岗位匹配
    ├── 责任类型推导（v1.1新增）
    ├── 异常处理
    ├── 人工确认
    └── 正式入库（生成责任记录）
    ↓
步骤2：责任配置管理
    ├── 岗位责任配置列表
    ├── 责任类型修改（可配置岗位）
    └── 责任记录查询
```

---

## 三、数据初始化清单

### 3.1 组织数据初始化

#### 3.1.1 项目公司

```sql
INSERT INTO hse_org_unit (parent_id, org_name, org_type, org_code, headcount, status) VALUES
(NULL, 'XXX环卫有限公司', 'company', 'COMPANY-001', 1323, 'active');
```

#### 3.1.2 职能部门（4个）

```sql
INSERT INTO hse_org_unit (parent_id, org_name, org_type, org_code, org_alias, status) VALUES
((SELECT id FROM hse_org_unit WHERE org_type='company'), '安环管理部', 'department', 'DEPT-AH', '安环品质部', 'active'),
((SELECT id FROM hse_org_unit WHERE org_type='company'), '生产管理部', 'department', 'DEPT-SC', NULL, 'active'),
((SELECT id FROM hse_org_unit WHERE org_type='company'), '人力综合部', 'department', 'DEPT-HR', NULL, 'active'),
((SELECT id FROM hse_org_unit WHERE org_type='company'), '财务部', 'department', 'DEPT-FN', NULL, 'active');
```

#### 3.1.3 作业中心（2个）

```sql
INSERT INTO hse_org_unit (parent_id, org_name, org_type, org_code, status) VALUES
((SELECT id FROM hse_org_unit WHERE org_type='company'), '环卫作业中心', 'center', 'CENTER-HW', 'active'),
((SELECT id FROM hse_org_unit WHERE org_type='company'), '市政绿化作业中心', 'center', 'CENTER-GN', 'active');
```

#### 3.1.4 乡镇作业中心（11个）

```sql
INSERT INTO hse_org_unit (parent_id, org_name, org_type, org_code, status) VALUES
((SELECT id FROM hse_org_unit WHERE org_name='环卫作业中心'), '宁城街道作业中心', 'town_center', 'TOWN-NC', 'active'),
((SELECT id FROM hse_org_unit WHERE org_name='环卫作业中心'), '柴胡店镇作业中心', 'town_center', 'TOWN-CHD', 'active'),
((SELECT id FROM hse_org_unit WHERE org_name='环卫作业中心'), '杜集镇作业中心', 'town_center', 'TOWN-DJ', 'active'),
((SELECT id FROM hse_org_unit WHERE org_name='环卫作业中心'), '长官镇作业中心', 'town_center', 'TOWN-CG', 'active'),
((SELECT id FROM hse_org_unit WHERE org_name='环卫作业中心'), '张大庄镇作业中心', 'town_center', 'TOWN-ZDZ', 'active'),
((SELECT id FROM hse_org_unit WHERE org_name='环卫作业中心'), '大柳镇作业中心', 'town_center', 'TOWN-DL', 'active'),
((SELECT id FROM hse_org_unit WHERE org_name='环卫作业中心'), '刘营伍乡作业中心', 'town_center', 'TOWN-LYW', 'active'),
((SELECT id FROM hse_org_unit WHERE org_name='环卫作业中心'), '相衙镇作业中心', 'town_center', 'TOWN-XY', 'active'),
((SELECT id FROM hse_org_unit WHERE org_name='环卫作业中心'), '大曹镇作业中心', 'town_center', 'TOWN-DC', 'active'),
((SELECT id FROM hse_org_unit WHERE org_name='环卫作业中心'), '保店镇作业中心', 'town_center', 'TOWN-BD', 'active'),
((SELECT id FROM hse_org_unit WHERE org_name='环卫作业中心'), '时集镇作业中心', 'town_center', 'TOWN-SJ', 'active');
```

### 3.2 岗位数据初始化

#### 3.2.1 标准岗位（17个）

```sql
INSERT INTO position (id, position_name, position_category, org_type, grid_level, grid_role) VALUES
-- 管理岗位
(1, '项目总经理', '管理岗位', 'company', 'grid1', '总网格长'),
(2, '部门经理', '管理岗位', 'department', 'grid2', '一级网格长'),
(5, '乡镇作业中心经理', '管理岗位', 'town_center', 'grid3', '二级网格长'),
(6, '管理员', '管理岗位', 'town_center', 'grid4', '三级网格长'),
(7, '环卫作业中心片区长', '管理岗位', 'center', NULL, NULL),
(8, '环卫作业中心副经理（人工）', '管理岗位', 'center', NULL, NULL),
-- 作业岗位
(20, '保洁员', '作业岗位', 'town_center', NULL, NULL),
(21, '挂桶员', '作业岗位', 'town_center', NULL, NULL),
(22, '垃圾收运辅助工', '作业岗位', 'town_center', NULL, NULL),
-- 驾驶员岗位
(31, '垃圾转运车驾驶员', '驾驶员岗位', 'center', NULL, NULL),
(32, '垃圾收运车驾驶员', '驾驶员岗位', 'town_center', NULL, NULL),
(33, '吸污车驾驶员', '驾驶员岗位', 'center', NULL, NULL),
-- 站管岗位
(40, '转运站管理员', '站管岗位', 'town_center', NULL, NULL),
-- 职能岗位
(50, '安全管理员', '职能岗位', 'department', NULL, NULL),
(51, '文员', '职能岗位', 'department', NULL, NULL),
(52, '会计', '职能岗位', 'department', NULL, NULL),
(53, '人事专员', '职能岗位', 'department', NULL, NULL);
```

#### 3.2.2 岗位别名（16个）

详见《岗位责任类型映射表.md》第6.2节。

#### 3.2.3 责任配置（17条）

详见《岗位责任类型映射表.md》第6.1节。

### 3.3 映射规则初始化

#### 3.3.1 组织映射规则

```sql
INSERT INTO employee_import_mapping_rule 
  (source_value, source_type, target_type, target_id, target_name, rule_version, match_priority, remark) VALUES
-- 职能部门映射
('项目管理层', 'excel_department', 'org_unit', 
 (SELECT id FROM hse_org_unit WHERE org_type='company'), 'XXX环卫有限公司', 'v1.1', 10, '映射为公司根节点'),
('安环品质部', 'excel_department', 'org_unit', 
 (SELECT id FROM hse_org_unit WHERE org_name='安环管理部'), '安环管理部', 'v1.1', 10, '组织别名映射'),
('生产管理部', 'excel_department', 'org_unit', 
 (SELECT id FROM hse_org_unit WHERE org_name='生产管理部'), '生产管理部', 'v1.1', 10, '直接映射'),
('人力综合部', 'excel_department', 'org_unit', 
 (SELECT id FROM hse_org_unit WHERE org_name='人力综合部'), '人力综合部', 'v1.1', 10, '直接映射'),
('财务部', 'excel_department', 'org_unit', 
 (SELECT id FROM hse_org_unit WHERE org_name='财务部'), '财务部', 'v1.1', 10, '直接映射'),
-- 作业中心映射
('环卫作业中心', 'excel_department', 'org_unit', 
 (SELECT id FROM hse_org_unit WHERE org_name='环卫作业中心'), '环卫作业中心', 'v1.1', 10, '直接映射'),
('车队', 'excel_department', 'org_unit', 
 (SELECT id FROM hse_org_unit WHERE org_name='环卫作业中心'), '环卫作业中心', 'v1.1', 10, '车队归属中心');
```

#### 3.3.2 乡镇片区映射规则（11个乡镇）

```sql
INSERT INTO employee_import_mapping_rule 
  (source_value, source_type, target_type, target_id, target_name, rule_version, match_priority) VALUES
('宁城街道片区', 'excel_department', 'org_unit', 
 (SELECT id FROM hse_org_unit WHERE org_name='宁城街道作业中心'), '宁城街道作业中心', 'v1.1', 10),
('柴胡店镇片区', 'excel_department', 'org_unit', 
 (SELECT id FROM hse_org_unit WHERE org_name='柴胡店镇作业中心'), '柴胡店镇作业中心', 'v1.1', 10),
-- ... 其他9个乡镇片区类似
('时集镇片区', 'excel_department', 'org_unit', 
 (SELECT id FROM hse_org_unit WHERE org_name='时集镇作业中心'), '时集镇作业中心', 'v1.1', 10);
```

#### 3.3.3 班组映射规则（示例）

```sql
INSERT INTO employee_import_mapping_rule 
  (source_value, source_type, target_type, target_id, target_name, rule_version, match_priority, remark) VALUES
('宁城街道一班', 'excel_department', 'org_unit', 
 (SELECT id FROM hse_org_unit WHERE org_name='宁城街道作业中心'), '宁城街道作业中心', 'v1.1', 10, '班组归属乡镇'),
-- ... 其他班组类似
('杜集镇三四班', 'excel_department', 'org_unit', 
 (SELECT id FROM hse_org_unit WHERE org_name='杜集镇作业中心'), '杜集镇作业中心', 'v1.1', 10, '拆分班组');
```

#### 3.3.4 岗位映射规则（24条）

详见《岗位责任类型映射表.md》第6.3节。

### 3.4 规则版本初始化

```sql
INSERT INTO employee_import_mapping_rule_version 
  (version, version_desc, effective_date, status, created_by) VALUES
('v1.1', 'Sprint5.17收口版本：生产管理岗位层级修正版', '2026-07-22', 'active', 'system');
```

---

## 四、验证标准

### 4.1 模型创建验证

| 验证项 | 验证方法 | 预期结果 |
|--------|----------|----------|
| 表创建成功 | 检查14个表存在 | 全部存在 |
| 索引创建成功 | 检查索引存在 | 全部存在 |
| 视图创建成功 | 检查3个兼容视图 | 全部存在 |
| 外键约束 | 检查外键关系 | 全部有效 |

### 4.2 数据初始化验证

| 验证项 | 验证方法 | 预期结果 |
|--------|----------|----------|
| 组织数据 | SELECT COUNT(*) FROM hse_org_unit | 18条（1公司+4部门+2中心+11乡镇） |
| 岗位数据 | SELECT COUNT(*) FROM position | 17条 |
| 岗位别名 | SELECT COUNT(*) FROM hse_position_alias | 16条 |
| 责任配置 | SELECT COUNT(*) FROM hse_responsibility_config | 17条 |
| 组织映射规则 | SELECT COUNT(*) FROM employee_import_mapping_rule | ~80条 |
| 岗位映射规则 | SELECT COUNT(*) FROM employee_position_mapping_rule | 24条 |
| 规则版本 | SELECT COUNT(*) FROM employee_import_mapping_rule_version | 1条 |

### 4.3 花名册导入验证

| 验证项 | 验证方法 | 预期结果 |
|--------|----------|----------|
| 总记录数 | 导入真实花名册 | 1,323条 |
| 组织匹配率 | 统计匹配成功 | 100% |
| 岗位匹配率 | 统计匹配成功 | 99.92% |
| 责任记录生成 | SELECT COUNT(*) FROM hse_responsibility | 60条 |
| 网格长记录 | WHERE responsibility_type='grid_leader' | 59条 |
| 生产管理记录 | WHERE responsibility_type='production_manager' | 1条 |
| 待确认记录 | SELECT COUNT(*) FROM employee_import_pending | 63条 |

### 4.4 责任记录验证

| 验证项 | SQL | 预期结果 |
|--------|-----|----------|
| grid1记录 | WHERE grid_level='grid1' | 1条 |
| grid2记录 | WHERE grid_level='grid2' | 3条 |
| grid3记录 | WHERE grid_level='grid3' | 11条 |
| grid4记录 | WHERE grid_level='grid4' | 44条 |
| 生产管理记录 | WHERE responsibility_type='production_manager' | 1条 |

---

## 五、开发注意事项

### 5.1 命名规范

| 规范 | 说明 |
|------|------|
| 表名 | hse_ 前缀，小写+下划线 |
| 字段名 | 小写+下划线 |
| 索引名 | idx_表名_字段名 |
| 视图名 | 保持历史兼容命名 |

### 5.2 数据安全

| 事项 | 说明 |
|------|------|
| 事务处理 | 花名册入库使用事务，保证数据一致性 |
| 软删除 | 所有业务表使用 is_deleted，不物理删除 |
| 审计字段 | 记录 created_by、updated_by |
| 唯一约束 | 员工编号、身份证哈希、组织编码等唯一 |

### 5.3 性能考虑

| 事项 | 说明 |
|------|------|
| 索引优化 | 高频查询字段建立索引 |
| 批量导入 | 花名册导入支持批量操作 |
| 分页查询 | 责任记录列表支持分页 |
| 缓存策略 | 组织树、岗位列表可缓存 |

### 5.4 兼容性

| 事项 | 说明 |
|------|------|
| 历史视图 | 创建3个兼容视图 |
| API兼容 | 保持现有API兼容性 |
| 数据迁移 | 提供数据迁移脚本（如有历史数据） |

---

## 六、开发交付物清单

### 6.1 SQL脚本

| 脚本 | 说明 | 优先级 |
|------|------|:------:|
| 01_create_tables.sql | 14个表创建 | P0 |
| 02_create_indexes.sql | 索引创建 | P0 |
| 03_create_views.sql | 3个兼容视图 | P0 |
| 04_init_org_data.sql | 组织数据初始化 | P0 |
| 05_init_position_data.sql | 岗位数据初始化 | P0 |
| 06_init_responsibility_config.sql | 责任配置初始化 | P0 |
| 07_init_mapping_rules.sql | 映射规则初始化 | P0 |
| 08_init_rule_version.sql | 规则版本初始化 | P0 |

### 6.2 后端API

| API | 说明 | 优先级 |
|-----|------|:------:|
| /api/hse/org-unit/* | 组织管理 | P0 |
| /api/hse/position/* | 岗位管理 | P0 |
| /api/hse/responsibility/* | 责任记录管理 | P1 |
| /api/hse/responsibility-config/* | 责任配置管理 | P1 |
| /api/hse/employee-import/* | 花名册导入 | P1 |

### 6.3 前端页面

| 页面 | 路径 | 优先级 |
|------|------|:------:|
| 组织管理 | /hse/org-unit | P0 |
| 岗位管理 | /hse/position | P0 |
| 责任记录列表 | /hse/responsibility | P1 |
| 责任配置管理 | /hse/responsibility-config | P1 |
| 花名册导入 | /hse/employee-import | P1 |

---

## 七、限制与约束

### 7.1 不修改的核心模型

| 模型 | 修改情况 | 说明 |
|------|:--------:|------|
| employee | ❌ 不修改 | 通过 employee_id 关联 |
| employee_assignment | ❌ 不修改 | 复用现有任职关系表 |
| hazards | ❌ 不修改 | - |
| training | ❌ 不修改 | - |
| violation_records | ❌ 不修改 | - |
| auth/JWT | ❌ 不修改 | - |
| Vben核心目录 | ❌ 不修改 | - |

### 7.2 禁止事项

| 禁止 | 说明 |
|------|------|
| 禁止新增依赖 | 使用现有技术栈 |
| 禁止修改核心模型 | employee等5个核心表不修改 |
| 禁止修改auth/JWT | 登录认证保持不变 |
| 禁止修改Vben核心 | 仅在业务层开发 |

---

## 八、修订记录

| 版本 | 日期 | 修订内容 |
|:----:|------|----------|
| v1.0 | 2026-07-22 | 初始版本：Sprint6开发前数据准备说明<br>1. 开发顺序：P0基础模型 → P0数据初始化 → P1业务功能<br>2. 数据初始化清单：18个组织 + 17个岗位 + 16个别名 + 17条责任配置 + ~104条映射规则<br>3. 验证标准：模型创建、数据初始化、花名册导入、责任记录4类验证<br>4. 开发交付物：8个SQL脚本 + 5组API + 5个前端页面<br>5. 限制与约束：不修改5个核心模型、auth/JWT、Vben核心 |

---

**设计完成日期**：2026-07-22
**设计状态**：🔒 Sprint6开发依据（最终版）
**下一步**：Sprint6开发实施
