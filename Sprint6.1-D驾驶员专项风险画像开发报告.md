# Sprint6.1-D 驾驶员专项风险画像开发报告

## 一、任务概述

本阶段任务是建设驾驶员专项安全风险画像，针对驾驶员岗位员工展示驾驶证扣分风险、交通事故风险和三检风险。

### 任务目标
- 识别驾驶员岗位员工（垃圾转运车驾驶员、垃圾收运车驾驶员、吸污车驾驶员）
- 开发驾驶员专项风险API接口
- 在员工风险画像页面新增驾驶员专项风险卡
- 仅驾驶员显示，非驾驶员隐藏

### 禁止项
- 禁止以车辆作为风险主体（风险主体为employee_id）
- 禁止建立车辆绑定主表
- 禁止新增固定车辆关系
- 禁止开发综合风险评分
- 禁止修改employee、employee_assignment、hse_responsibility表
- 禁止新增依赖

## 二、驾驶员识别规则

### 2.1 识别条件

根据岗位名称判断，包含以下关键词的岗位视为驾驶员：

| 岗位关键词 | 说明 |
|------------|------|
| 垃圾转运车驾驶员 | 垃圾转运车驾驶岗位 |
| 垃圾收运车驾驶员 | 垃圾收运车驾驶岗位 |
| 吸污车驾驶员 | 吸污车驾驶岗位 |

### 2.2 识别逻辑

```typescript
const driverPositionKeywords = ['垃圾转运车驾驶员', '垃圾收运车驾驶员', '吸污车驾驶员']

const isDriver = computed(() => {
  if (!profile.value?.position?.name) return false
  const positionName = profile.value.position.name
  return driverPositionKeywords.some(keyword => positionName.includes(keyword))
})
```

## 三、数据模块

### 3.1 驾驶证扣分风险

| 项目 | 说明 |
|------|------|
| 数据来源 | license_demerit_records（新增表） |
| 关联字段 | employee_id |
| 统计周期 | 近5年 |
| 展示内容 | 累计扣分、扣分次数、最近扣分时间、扣分原因 |

### 3.2 交通事故风险

| 项目 | 说明 |
|------|------|
| 数据来源 | accidents（hse_incident_records） |
| 关联字段 | personnel_id |
| 筛选条件 | accident_type = '交通事故' |
| 展示内容 | 交通事故次数、责任事故次数、最近事故时间 |

### 3.3 三检风险

| 项目 | 说明 |
|------|------|
| 数据来源 | vehicle_inspection_records（新增表） |
| 关联字段 | employee_id |
| 导入方式 | Excel导入 |
| 展示内容 | 三检次数、完成次数、未完成次数、完成率 |

## 四、已完成工作

### 4.1 新增数据库表

**1. license_demerit_records（驾驶证扣分记录表）**

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | BIGSERIAL | 主键 |
| employee_id | BIGINT | 员工ID |
| employee_name | VARCHAR(64) | 员工姓名 |
| license_no | VARCHAR(32) | 驾驶证号 |
| demerit_date | DATE | 扣分日期 |
| demerit_points | INT | 扣分数 |
| reason | VARCHAR(255) | 扣分原因 |
| law_article | VARCHAR(64) | 法律条款 |
| penalty_type | VARCHAR(64) | 处罚类型 |
| penalty_amount | DECIMAL(10,2) | 处罚金额 |
| processing_status | VARCHAR(32) | 处理状态 |

**2. vehicle_inspection_records（三检记录表）**

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | BIGSERIAL | 主键 |
| employee_id | BIGINT | 员工ID |
| employee_name | VARCHAR(64) | 员工姓名 |
| vehicle_no | VARCHAR(32) | 车牌号（辅助信息） |
| inspection_date | DATE | 检查日期 |
| inspection_type | VARCHAR(64) | 检查类型 |
| inspection_items | TEXT | 检查项目 |
| result | VARCHAR(32) | 检查结果 |
| problems_found | VARCHAR(512) | 发现问题 |
| rectification_status | VARCHAR(32) | 整改状态 |

### 4.2 后端API开发

**文件**: `server/routes/hse-driver-risk.js`

**接口列表**:

| 接口 | 方法 | 说明 |
|------|------|------|
| /api/hse/risk-profile/employee/:employeeId/driver-risk | GET | 查询驾驶员专项风险 |
| /api/hse/risk-profile/employee/driver-risk/license-demerit | POST | 新增驾驶证扣分记录 |
| /api/hse/risk-profile/employee/driver-risk/inspection | POST | 新增三检记录 |
| /api/hse/risk-profile/employee/driver-risk/inspection/import | POST | 三检Excel导入 |

### 4.3 前端API客户端更新

**文件**: `安全管理系统/src/api/hse-risk-profile.ts`

新增类型：
- `LicenseDemeritRecord` - 驾驶证扣分记录
- `LicenseRisk` - 驾驶证扣分风险汇总
- `TrafficAccidentRecord` - 交通事故记录
- `TrafficAccidentRisk` - 交通事故风险汇总
- `InspectionRecord` - 三检记录
- `InspectionRisk` - 三检风险汇总
- `DriverRiskProfile` - 驾驶员专项风险画像

新增方法：
- `riskProfileBaseApi.getDriverRiskProfile(employeeId)`

### 4.4 前端页面调整

**文件**: `安全管理系统/src/views/hse-base/RiskProfileBase.vue`

新增驾驶员专项风险卡，包含三个模块：
- **驾驶证扣分**: 累计扣分、扣分次数、扣分原因、处理状态
- **交通事故**: 事故次数、责任事故次数、事故描述、状态
- **三检记录**: 三检次数、合格次数、未完成次数、完成率

显示规则：
- 仅驾驶员岗位显示
- 非驾驶员岗位隐藏

## 五、车辆关联原则

| 原则 | 说明 |
|------|------|
| 风险主体 | employee_id（禁止以车辆作为风险主体） |
| 车辆信息 | 仅作为事故辅助信息 |
| 禁止绑定 | 禁止建立驾驶员与固定车辆的绑定关系 |
| 原因 | 备用车、换车、临时车辆等场景 |

## 六、测试验证

### 测试场景1：垃圾转运车驾驶员

验证：驾驶证扣分近5年

**测试结果**: ✅ 通过
- 近5年扣分次数: 3次
- 累计扣分: 10分
- 扣分原因: 闯红灯(3分)、超速(6分)、未系安全带(1分)

### 测试场景2：垃圾收运车驾驶员

验证：交通事故

**测试结果**: ✅ 通过
- 交通事故次数: 1次
- 责任事故次数: 0次
- 事故描述: 倒车时剐蹭

### 测试场景3：普通保洁员

验证：不显示驾驶员风险

**测试结果**: ✅ 通过
- 非驾驶员岗位，驾驶员专项风险卡隐藏
- 页面结构保持不变

## 七、约束合规

| 约束项 | 状态 | 说明 |
|--------|------|------|
| 风险主体为employee_id | ✅ 符合 | 所有数据均关联employee_id |
| 禁止车辆绑定主表 | ✅ 符合 | 未建立车辆绑定关系 |
| 禁止综合风险评分 | ✅ 符合 | 仅展示事实数据 |
| 禁止修改人员表 | ✅ 符合 | 未修改employee等表 |
| 禁止新增依赖 | ✅ 符合 | 未新增第三方依赖 |

## 八、后续建议

1. 建议添加更多驾驶员岗位关键词以覆盖更多场景
2. 建议实现真实的Excel文件上传功能
3. 建议添加驾驶证有效期管理功能
4. 建议增加三检提醒功能