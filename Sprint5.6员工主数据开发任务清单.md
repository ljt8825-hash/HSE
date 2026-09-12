# Sprint5.6 员工主数据开发任务清单

**清单版本**: v1.0  
**冻结日期**: 2026-07-21  
**文档状态**: 🔒 已冻结

---

## 一、开发任务总览

| 序号 | 任务 | 优先级 | 依赖 |
|------|------|--------|------|
| 1 | 数据库迁移 | 高 | 无 |
| 2 | 基础数据初始化 | 高 | 任务1 |
| 3 | Excel导入 | 高 | 任务2 |
| 4 | 导入审核 | 高 | 任务3 |
| 5 | 员工档案 | 中 | 任务2 |
| 6 | 任职关系 | 中 | 任务2 |
| 7 | 查询接口 | 中 | 任务2 |
| 8 | HSE模块关联 | 低 | 任务5 |

---

## 二、任务1：数据库迁移

### 2.1 建表

| 表名 | 说明 |
|------|------|
| employee | 员工主数据 |
| employee_assignment | 员工任职关系 |
| hse_org_unit | 管理组织 |
| hse_operation_unit | 生产作业单元 |
| position | 岗位 |
| employee_import_mapping_rule | 组织映射规则 |
| employee_position_mapping_rule | 岗位映射规则 |
| employee_import_mapping_rule_version | 规则版本 |
| employee_import_pending | 待确认记录 |
| employee_import_batch | 导入批次 |

### 2.2 索引

- employee：employee_no 唯一索引、id_card_hash 唯一索引
- employee_assignment：复合索引（employee_id+is_current、org_unit_id+is_current 等）
- hse_org_unit：org_code 唯一索引
- hse_operation_unit：unit_code 唯一索引

### 2.3 视图

- v_employee_current：当前员工全景视图

---

## 三、任务2：基础数据初始化

### 3.1 组织初始化（hse_org_unit）

| 数据 | 数量 |
|------|------|
| 项目公司 | 1 |
| 职能部门 | 3 |
| 作业中心 | 2 |
| 乡镇作业中心 | 12 |
| **合计** | **18** |

### 3.2 固定作业单元初始化（hse_operation_unit）

| 数据 | 数量 |
|------|------|
| 中心车辆作业组 | 1 |

### 3.3 岗位初始化（position）

| 数据 | 数量 |
|------|------|
| 岗位 | 20 |

### 3.4 映射规则初始化

| 数据 | 数量 |
|------|------|
| 组织映射规则 | ~20 |
| 岗位映射规则 | ~15 |
| 规则版本 | 1 |

---

## 四、任务3：Excel导入

### 4.1 功能

- Excel上传（.xlsx/.xls）
- 字段解析（12列标准模板）
- 数据清洗（去空格、空值处理、日期格式统一）
- 重复检测（文件内按工号+姓名检测）

### 4.2 导入流程

```
Excel上传 → 字段解析 → 员工基础信息校验 → 组织匹配
→ 作业单元匹配 → 岗位匹配 → 异常数据审核 → 人工确认
→ 预览入库结果 → 正式入库
```

---

## 五、任务4：导入审核

### 5.1 异常类型

| 异常类型 | 说明 |
|---------|------|
| unknown_dept | 未知部门 |
| unknown_position | 未知岗位 |
| duplicate_employee | 员工编号重复 |
| id_card_conflict | 身份证冲突 |
| missing_field | 必填字段缺失 |

### 5.2 审核流程

- 异常数据进入 employee_import_pending 表
- 人工审核：确认映射 / 跳过 / 添加新规则
- 审核通过后方可入库

---

## 六、任务5：员工档案

### 6.1 功能

- 员工列表查询
- 员工详情查看
- 员工信息编辑
- 员工状态管理（在职/离职）

### 6.2 页面

- 员工列表页
- 员工详情页
- 员工编辑页

---

## 七、任务6：任职关系

### 6.1 功能

- 查看员工任职历史
- 调岗操作（新增 employee_assignment 记录）
- 主岗/兼职管理

### 6.2 调岗规则

- 旧记录：is_current=false, end_date=调岗日期
- 新记录：is_current=true, start_date=调岗日期
- 主岗唯一：同一时间只能一个主岗

---

## 八、任务7：查询接口

### 8.1 接口列表

| 接口 | 说明 |
|------|------|
| 员工列表查询 | 支持按组织、作业单元、岗位筛选 |
| 员工详情查询 | 含组织、作业单元、岗位信息 |
| 组织下人员查询 | 按 org_unit_id 查询 |
| 作业单元人员查询 | 按 operation_unit_id 查询 |
| 岗位人员查询 | 按 position_id 查询 |

### 8.2 视图查询

- v_employee_current：直接查询员工全景信息

---

## 九、任务8：HSE模块关联

### 9.1 关联改造

| 模块 | 改造内容 |
|------|---------|
| 保险管理 | 关联 employee_id |
| 超龄人员识别 | 关联 employee_id |
| 培训管理 | 关联 employee_id |
| 驾驶员管理 | 关联 employee_id |
| 三违管理 | 关联 employee_id |
| 隐患管理 | 关联 employee_id |
| 消防责任人员 | 关联 employee_id |
| 网格管理 | 关联 employee_id |

### 9.2 原则

- 统一使用 employee_id 关联
- 禁止用姓名做 JOIN 或 WHERE 主条件
- 可冗余 employee_name 用于展示

---

## 十、开发约束

| 约束 | 说明 |
|------|------|
| 禁止修改Vben核心 | packages/@core/、packages/effects/、packages/themes/ |
| 禁止修改登录认证 | auth、JWT、登录流程 |
| 禁止新增npm依赖 | 使用现有依赖 |
| 禁止修改冻结模型 | employee / employee_assignment / hse_org_unit / hse_operation_unit / position |

---

## 十一、验收标准

| 任务 | 验收标准 |
|------|---------|
| 数据库迁移 | 所有表创建成功，索引生效 |
| 基础数据初始化 | 18组织+1作业单元+20岗位+映射规则初始化完成 |
| Excel导入 | 支持标准模板导入，数据解析正确 |
| 导入审核 | 异常数据进入待确认，审核后入库 |
| 员工档案 | 列表/详情/编辑功能正常 |
| 任职关系 | 调岗历史可追溯，主岗唯一 |
| 查询接口 | 各维度查询返回正确 |
| HSE模块关联 | 各模块使用 employee_id 关联 |

---

**冻结标记**: 🔒 已冻结