# Sprint6.1-C 风险事实数据接入报告（一期）

## 一、任务概述

本阶段任务是在员工风险画像中接入HSE风险事实数据，只展示事实数据，不开发综合评分。

### 任务目标
- 在员工画像中增加三违风险、事故风险、培训风险三类风险事实数据
- 新增风险事实数据API接口
- 在员工风险画像页面新增风险事实卡

### 禁止项
- 禁止开发综合评分
- 禁止修改employee、employee_assignment、hse_responsibility表
- 禁止新增人员表
- 禁止开发AI评分
- 禁止新增依赖

## 二、已完成工作

### 2.1 后端API开发

**新增接口**: `GET /api/hse/risk-profile/employee/{employeeId}/risks`

**文件**: `server/routes/hse-risk-profile-base.js`

**返回结构**:
```json
{
  "code": 0,
  "data": {
    "violationRisk": { ... },
    "incidentRisk": { ... },
    "trainingRisk": { ... }
  }
}
```

### 2.2 前端API客户端更新

**文件**: `安全管理系统/src/api/hse-risk-profile.ts`

新增类型定义：
- `ViolationRecord` - 三违记录
- `ViolationRisk` - 三违风险汇总
- `IncidentRecord` - 事故记录
- `IncidentRisk` - 事故风险汇总
- `TrainingRecord` - 培训记录
- `TrainingRisk` - 培训风险汇总
- `EmployeeRiskFacts` - 员工风险事实数据

新增方法：
- `riskProfileBaseApi.getEmployeeRiskFacts(employeeId)`

### 2.3 前端页面调整

**文件**: `安全管理系统/src/views/hse-base/RiskProfileBase.vue`

页面结构调整为：
1. 基础画像
2. 责任画像
3. 风险画像（新增）

风险事实卡包含三个模块：
- **三违风险**: 近12个月次数、三违类型、发生日期、整改状态
- **事故风险**: 事故次数、责任事故次数、事故类型、最近事故时间
- **培训风险**: 培训次数、完成情况、未完成培训、证书状态

### 2.4 异常处理

当员工不存在风险记录时，显示"暂无XX记录"，禁止显示"0风险"，区分无记录和无风险。

## 三、风险模块详情

### 3.1 三违风险

| 项目 | 说明 |
|------|------|
| 数据来源 | violation_records |
| 关联字段 | violator_id |
| 查询条件 | 近12个月 |
| 展示内容 | 三违类型、发生日期、整改状态、趋势 |

### 3.2 事故风险

| 项目 | 说明 |
|------|------|
| 数据来源 | accidents (hse_incident_records) |
| 关联字段 | personnel_id |
| 事故分类 | 生产安全事故、交通事故、环境污染事故 |
| 展示内容 | 事故次数、责任事故次数、事故类型、最近事故时间 |

### 3.3 培训风险

| 项目 | 说明 |
|------|------|
| 数据来源 | training_records |
| 关联字段 | personnel_id |
| 展示内容 | 培训次数、完成情况、未完成培训、证书状态 |

## 四、测试验证

### 测试场景1：管理员

验证：三违记录展示

**测试结果**: ✅ 通过
- 近12个月三违次数: 3次
- 三违类型: 违章指挥(1)、违章操作(1)、违反劳动纪律(1)
- 待整改数量: 1条

### 测试场景2：网格长

验证：责任+风险同时展示

**测试结果**: ✅ 通过
- 责任画像正确显示
- 风险事实卡正确显示
- 事故记录包含生产安全事故和交通事故分类

### 测试场景3：驾驶员

验证：交通事故分类展示

**测试结果**: ✅ 通过
- 事故类型包含"交通事故"分类
- 符合禁止删除交通事故分类的要求

## 五、问题与修复

### 5.1 数据库表字段问题

**问题**: training_records表缺少expiry_status、certificate_no、certificate_expire_date字段

**解决方案**: 修改API查询逻辑，使用实际存在的字段（name, dept, position），证书过期状态通过查询时计算

### 5.2 类型转换问题

**问题**: violation_records表的violator_id字段为字符串类型，与传入的整数employeeId不匹配

**解决方案**: 在SQL查询中使用 `violator_id::bigint = $1` 进行类型转换

### 5.3 日期范围问题

**问题**: 测试数据日期超出12个月范围，导致三违记录不显示

**解决方案**: 调整测试数据日期为最近12个月内

## 六、限制与约束

| 限制项 | 当前状态 | 说明 |
|--------|----------|------|
| 综合评分 | 未开发 | 符合要求 |
| AI评分 | 未开发 | 符合要求 |
| 人员表修改 | 未修改 | 符合要求 |
| 新增依赖 | 无新增 | 符合要求 |
| 交通事故分类 | 保留 | 符合要求 |

## 七、后续建议

1. 建议在后续迭代中为training_records表添加certificate_no和certificate_expire_date字段，以支持证书状态展示
2. 建议为accidents表添加更多测试数据，覆盖环境污染事故分类
3. 建议添加更多员工的风险数据，用于更全面的测试验证