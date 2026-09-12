# HSE Sprint5.2 开发报告

## 项目概述
Sprint5.2 聚焦"员工安全画像与证书中心"，在Sprint5.1已实现的employee_certificate和employee_safety_profile基础上，新增position_safety_profile（岗位安全画像）和position_training_requirement（岗位培训要求）两个核心模型。

## 开发范围

### 1. position_safety_profile（岗位安全画像）
- 风险等级：low/medium/high/critical/unknown
- 风险评分：0-100分（自动计算）
- 风险因素：JSONB存储多维度风险项
- 必备证件分类：TEXT[]数组
- 特种作业资质要求：布尔标识
- 安全关键岗位标识：布尔标识
- 安全危害因素：JSONB存储危害列表
- 安全操作规程：文本
- 应急响应方案：文本
- PPE要求：JSONB存储防护装备列表
- 作业许可要求：布尔标识
- 巡检频率：daily/weekly/monthly/quarterly/yearly
- 风险评估日期：日期类型
- 评估方式：manual/auto/ai_assisted
- AI辅助分析字段（仅参考）

### 2. position_training_requirement（岗位培训要求）
- 培训类型：字符串
- 培训分类：safety/skill/special_operation/emergency/first_aid/induction
- 学时要求：小数类型
- 培训频率：daily/weekly/monthly/quarterly/yearly/once
- 考核要求：布尔标识
- 复训间隔（月）：整数
- 是否强制：布尔标识
- 适用岗位：多岗位支持

## 风险评定规则

### 岗位风险评分计算
```
基础分：0分
+30分：特种作业资质要求 (required_special_operation)
+25分：安全关键岗位 (required_safety_critical)
+15分：需要作业许可 (work_permit_required)
+10分：每个安全危害因素
+10分：每周/每日巡检 (inspection_frequency)
```

### 风险等级判定
- 0-20分：low（低风险）
- 21-40分：medium（中风险）
- 41-65分：high（高风险）
- 66分以上：critical（重大风险）

## API端点清单

### 岗位安全画像（8个端点）
| 方法 | 路径 | 功能 |
|------|------|------|
| GET | /position-safety-profiles/position/:position_id | 查询岗位画像（自动创建） |
| POST | /position-safety-profiles | 新增/更新岗位画像 |
| PUT | /position-safety-profiles/:id | 更新岗位画像 |
| GET | /position-safety-profiles/:id | 查询画像详情 |
| GET | /position-safety-profiles | 分页查询 |
| GET | /position-safety-profiles/stats | 统计 |
| POST | /position-safety-profiles/batch-assess | 批量风险评估 |
| DELETE | /position-safety-profiles/:id | 软删除 |

### 岗位培训要求（9个端点）
| 方法 | 路径 | 功能 |
|------|------|------|
| POST | /position-training-requirements | 新增培训要求 |
| PUT | /position-training-requirements/:id | 更新培训要求 |
| GET | /position-training-requirements/:id | 查询详情 |
| GET | /position-training-requirements | 分页查询 |
| GET | /position-training-requirements/position/:position_id | 查询岗位培训要求 |
| GET | /position-training-requirements/stats | 统计 |
| POST | /position-training-requirements/batch-import | 批量导入 |
| DELETE | /position-training-requirements/:id | 删除 |
| DELETE | /position-training-requirements/position/:position_id | 批量删除岗位培训要求 |

## 文件变更

### 新增文件
- `server/sql/hse_employee_master_v62_extension.sql` - v62数据库迁移脚本

### 修改文件
- `server/routes/hse-employee.js` - 扩展API（约600行新增）
- `server/__tests__/hse-employee.standalone.test.js` - 扩展测试用例

## 技术约束遵守情况

| 约束 | 状态 | 说明 |
|------|------|------|
| 所有关联使用employee_id | ✅ | 岗位画像和培训要求使用position_id关联 |
| 禁止新增人员表 | ✅ | 仅扩展position相关表 |
| 禁止修改Vben核心目录 | ✅ | 未修改前端核心代码 |
| 禁止修改auth/JWT | ✅ | 认证机制未变更 |
| 禁止新增npm依赖 | ✅ | 复用现有依赖 |
| AI字段仅辅助分析 | ✅ | ai_risk_analysis/ai_suggestion仅作参考 |

## 数据库迁移
- 版本：v62
- 方式：增量迁移，可重复执行
- 新增表：position_safety_profile、position_training_requirement
- 索引：各表均创建唯一性和查询索引

## 测试结果
- 总测试用例：156个
- 通过：156个
- 失败：0个

## 关键修复
1. **JSONB字段序列化**：修复了JavaScript数组直接传递给PostgreSQL JSONB字段导致的语法错误，改为使用JSON.stringify()转换
2. **培训频率参数**：修复了测试中使用无效频率值half_yearly的问题，改为quarterly
3. **风险等级校验**：扩展了风险等级验证列表，包含unknown值