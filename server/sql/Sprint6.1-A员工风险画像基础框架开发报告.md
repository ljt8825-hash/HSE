# Sprint6.1-A 员工风险画像基础框架开发报告

## 一、开发目标

基于 Sprint6.0 基础数据底座，建立员工 HSE 风险画像基础展示框架。第一阶段只实现员工基础画像，暂不开发风险评分计算。

## 二、开发内容

1. **后端 API**：`GET /api/hse/risk-profile/employee/{employeeId}`
2. **前端页面**：`/hse/risk-profile/employee`（员工风险画像）
3. **前端 API 封装补充**
4. **路由注册**

## 三、数据来源

- `employee`
- `hse_employee_relation`
- `hse_org_unit`
- `hse_operation_unit`
- `hse_responsibility`

## 四、画像展示内容

- **基础信息**：姓名、工号、组织、作业单元、岗位
- **责任信息**：责任类型、责任等级、责任角色、巡查频次

## 五、责任展示规则

- `grid_leader`：显示网格等级 + 网格角色 + 巡查频次
- `production_manager`：显示生产管理责任（不显示网格等级）
- `none`：不显示责任模块

## 六、测试结果

3 类场景全部通过：

- `grid_leader` 已覆盖
- `production_manager` 已覆盖
- `none` 已覆盖

边界测试通过：

- 员工不存在
- 非法参数

## 七、限制遵守

- 未修改 `employee` / `employee_assignment` / `hse_responsibility`
- 未新增人员表
- 未新增依赖
- 未修改权限框架

## 八、输出文件清单

1. `Sprint6.1-A员工风险画像基础框架开发报告.md`
2. `员工风险画像基础API接口文档.md`
3. `员工风险画像基础页面开发说明.md`
4. `Sprint6.1-A测试报告.md`
