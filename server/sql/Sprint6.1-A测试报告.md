# Sprint6.1-A 测试报告

## 一、测试目标

验证员工风险画像基础框架 API 和页面数据正确性。

## 二、测试环境

- 本地 Node.js
- PostgreSQL
- Express

## 三、测试方法

直接调用路由处理函数，绕过 JWT 认证。

## 四、测试用例与结果

| 用例 | 输入 | 预期 | 结果 |
|------|------|------|------|
| 网格长员工画像 | employeeId=3866（张万恒） | 返回 grid_leader，含 grid_level / grid_role / inspection_frequency | 通过 |
| 生产管理责任员工画像 | employeeId=5360（验证_城区东片片区长） | 返回 production_manager，不含 grid_level / grid_role / inspection_frequency | 通过 |
| 非责任岗位员工画像 | employeeId=3868（武志刚，驾驶员） | responsibility 为 null | 通过 |
| 员工不存在 | employeeId=999999 | code=1，msg=员工不存在 | 通过 |
| 非法参数 | employeeId=abc | code=1，msg=employeeId 参数错误 | 通过 |

## 五、测试结论

所有用例通过，基础画像框架开发完成。

## 六、覆盖率

- grid_leader 场景：已覆盖
- production_manager 场景：已覆盖
- none 场景：已覆盖
