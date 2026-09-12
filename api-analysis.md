# HSE安全生产管理系统 API接口分析报告

## 分析日期
2026-07-21

---

## 一、接口清单

### 1.1 人员模块

| 接口 | 方法 | 路径 | 认证 | 权限 | 参数校验 |
|------|------|------|------|------|----------|
| 员工列表 | GET | /api/hse/employee/list | ✅ | admin/safety_manager | ⚠️ |
| 员工详情 | GET | /api/hse/employee/:id | ✅ | admin/safety_manager | ✅ |
| 新增员工 | POST | /api/hse/employee | ✅ | admin/safety_manager | ✅ |
| 更新员工 | PUT | /api/hse/employee/:id | ✅ | admin/safety_manager | ✅ |
| 删除员工 | DELETE | /api/hse/employee/:id | ✅ | admin/safety_manager | ✅ |
| 员工导入 | POST | /api/hse/employee/import | ✅ | admin/safety_manager | ✅ |
| 部门树 | GET | /api/hse/department/tree | ✅ | admin/safety_manager | ✅ |
| 新增部门 | POST | /api/hse/department | ✅ | admin/safety_manager | ✅ |
| 更新部门 | PUT | /api/hse/department/:id | ✅ | admin/safety_manager | ✅ |
| 岗位列表 | GET | /api/hse/position/list | ✅ | admin/safety_manager | ✅ |

### 1.2 隐患模块

| 接口 | 方法 | 路径 | 认证 | 权限 | 参数校验 |
|------|------|------|------|------|----------|
| 隐患列表 | GET | /api/hazards | ✅ | admin | ⚠️ |
| 隐患详情 | GET | /api/hazards/:id | ✅ | admin | ⚠️ |
| 新增隐患 | POST | /api/hazards | ✅ | admin | ⚠️ |
| 更新隐患 | PUT | /api/hazards/:id | ✅ | admin | ⚠️ |
| 删除隐患 | DELETE | /api/hazards/:id | ✅ | admin | ⚠️ |
| 创建整改 | POST | /api/hse/hazard/:id/rectification | ✅ | admin | ⚠️ |
| 更新整改 | PUT | /api/hse/rectification/:id | ✅ | admin | ⚠️ |
| 创建复查 | POST | /api/hse/rectification/:id/review | ✅ | admin | ⚠️ |

### 1.3 培训模块

| 接口 | 方法 | 路径 | 认证 | 权限 | 参数校验 |
|------|------|------|------|------|----------|
| 培训列表 | GET | /api/training | ✅ | admin | ⚠️ |
| 培训详情 | GET | /api/training/:id | ✅ | admin | ⚠️ |
| 新增培训 | POST | /api/training | ✅ | admin | ⚠️ |
| 更新培训 | PUT | /api/training/:id | ✅ | admin | ⚠️ |

### 1.4 标准化评价模块

| 接口 | 方法 | 路径 | 认证 | 权限 | 参数校验 |
|------|------|------|------|------|----------|
| 条款树 | GET | /api/hse/standard/tree | ✅ | admin/safety_manager | ✅ |
| 条款统计 | GET | /api/hse/standard/stats | ✅ | admin/safety_manager | ✅ |
| 条款详情 | GET | /api/hse/standard/:id | ✅ | admin/safety_manager | ✅ |
| 新增条款 | POST | /api/hse/standard | ✅ | admin/safety_manager | ✅ |
| 更新条款 | PUT | /api/hse/standard/:id | ✅ | admin/safety_manager | ✅ |
| 导入条款 | POST | /api/hse/standard/import | ✅ | admin/safety_manager | ✅ |
| 导出条款 | POST | /api/hse/standard/export | ✅ | admin/safety_manager | ✅ |
| 创建评价任务 | POST | /api/hse/evaluation/task | ✅ | admin/safety_manager | ✅ |
| 评价任务详情 | GET | /api/hse/evaluation/task/:id | ✅ | admin/safety_manager | ✅ |
| AI评价 | POST | /api/hse/evaluation/item/ai | ✅ | admin/safety_manager | ✅ |

### 1.5 文档模块

| 接口 | 方法 | 路径 | 认证 | 权限 | 参数校验 |
|------|------|------|------|------|----------|
| 文档列表 | GET | /api/hse/documents | ✅ | admin/safety_manager | ✅ |
| 上传文档 | POST | /api/hse/documents/upload | ✅ | admin/safety_manager | ✅ |
| AI分析 | POST | /api/hse/documents/:id/analyze | ✅ | admin/safety_manager | ✅ |

### 1.6 报告模块

| 接口 | 方法 | 路径 | 认证 | 权限 | 参数校验 |
|------|------|------|------|------|----------|
| 报告列表 | GET | /api/hse/reports | ✅ | admin/safety_manager | ✅ |
| 生成报告 | POST | /api/hse/reports/generate | ✅ | admin/safety_manager | ✅ |
| 报告详情 | GET | /api/hse/reports/:id | ✅ | admin/safety_manager | ✅ |

### 1.7 批量导入模块

| 接口 | 方法 | 路径 | 认证 | 权限 | 参数校验 |
|------|------|------|------|------|----------|
| 创建任务 | POST | /api/hse/batch-import/task | ✅ | admin/safety_manager | ✅ |
| 任务详情 | GET | /api/hse/batch-import/task/:id | ✅ | admin/safety_manager | ✅ |
| 确认导入 | POST | /api/hse/batch-import/task/:id/confirm | ✅ | admin/safety_manager | ✅ |
| 重试任务 | POST | /api/hse/batch-import/task/:id/retry | ✅ | admin/safety_manager | ✅ |

### 1.8 其他模块

| 模块 | 接口数 | 认证 | 权限 | 参数校验 |
|------|--------|------|------|----------|
| 事故管理 | 4 | ✅ | admin | ⚠️ |
| 应急管理 | 3 | ✅ | admin | ⚠️ |
| 风险管控 | 4 | ✅ | admin | ⚠️ |
| 保险管理 | 5 | ✅ | admin | ⚠️ |
| 通知管理 | 3 | ✅ | admin | ⚠️ |
| 告警管理 | 4 | ✅ | admin | ⚠️ |
| 工作流管理 | 5 | ✅ | admin | ⚠️ |
| AI服务 | 3 | ✅ | admin | ✅ |
| BI统计 | 4 | ✅ | admin | ✅ |

---

## 二、REST规范检查

### 2.1 HTTP方法使用

| 方法 | 使用情况 | 说明 |
|------|----------|------|
| GET | ✅ | 查询资源 |
| POST | ✅ | 创建资源 |
| PUT | ✅ | 更新资源 |
| DELETE | ✅ | 删除资源 |
| PATCH | ❌ | 未使用 |

### 2.2 路径命名

| 规范 | 状态 | 说明 |
|------|------|------|
| 小写字母 | ✅ | 所有路径使用小写 |
| 连字符分隔 | ✅ | 使用连字符（如 hse-employee） |
| 名词复数 | ⚠️ | 部分使用单数（如 /api/hazards 是复数，/api/training 是单数） |
| 版本控制 | ❌ | 无API版本控制 |

### 2.3 分页参数

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 分页支持 | ⚠️ | 部分接口支持，部分不支持 |
| 页码参数 | ⚠️ | 使用 page 和 pageSize |
| 最大限制 | ❌ | 无最大限制 |
| 默认分页 | ⚠️ | 部分接口默认不分页 |

### 2.4 响应格式

| 格式 | 状态 | 说明 |
|------|------|------|
| 统一响应结构 | ✅ | 使用 { code, message, data } |
| 成功响应 | ✅ | code: 200 |
| 错误响应 | ✅ | code: 非200 |
| 错误信息 | ⚠️ | 部分错误信息不够友好 |

---

## 三、参数校验分析

### 3.1 校验方式

| 校验方式 | 使用情况 | 说明 |
|----------|----------|------|
| Zod校验 | ⚠️ | 仅标准化评价、文档、报告模块使用 |
| 手动校验 | ⚠️ | 部分接口使用手动校验 |
| 无校验 | ❌ | 部分接口缺少校验 |

### 3.2 校验完整性

| 校验类型 | 状态 | 说明 |
|----------|------|------|
| 必填校验 | ⚠️ | 部分接口缺少必填校验 |
| 格式校验 | ⚠️ | 部分接口缺少格式校验（如邮箱、手机号） |
| 长度校验 | ⚠️ | 部分接口缺少长度校验 |
| 类型校验 | ⚠️ | 部分接口缺少类型校验 |
| 数值范围 | ⚠️ | 部分接口缺少数值范围校验 |

### 3.3 缺少校验的接口

| 模块 | 接口 | 缺少的校验 |
|------|------|----------|
| 隐患 | POST /api/hazards | description必填、hazard_date格式 |
| 隐患 | PUT /api/hazards/:id | status枚举校验 |
| 培训 | POST /api/training | title必填、training_date格式 |
| 事故 | POST /api/accidents | title必填、accident_date格式 |
| 应急 | POST /api/emergency | title必填 |
| 保险 | POST /api/insurance | employee_id必填、expire_date格式 |

---

## 四、权限控制分析

### 4.1 认证方式

| 认证方式 | 状态 | 说明 |
|----------|------|------|
| JWT Token | ✅ | 所有接口需认证 |
| Token过期处理 | ✅ | 返回401错误 |
| Token刷新 | ⚠️ | 未实现刷新机制 |

### 4.2 角色权限

| 角色 | 权限范围 | 状态 |
|------|----------|------|
| admin | 所有模块 | ✅ |
| safety_manager | 人员、标准化评价、文档、报告 | ✅ |
| 普通用户 | 只读 | ⚠️ |

### 4.3 缺少权限控制的接口

| 模块 | 接口 | 当前权限 | 建议权限 |
|------|------|----------|----------|
| 隐患 | 所有接口 | admin | admin/safety_manager |
| 培训 | 所有接口 | admin | admin/safety_manager |
| 事故 | 所有接口 | admin | admin/safety_manager |
| 应急 | 所有接口 | admin | admin/safety_manager |
| 保险 | 所有接口 | admin | admin/safety_manager |
| 通知 | 所有接口 | admin | admin/safety_manager |
| 告警 | 所有接口 | admin | admin/safety_manager |

### 4.4 数据隔离

| 隔离级别 | 状态 | 说明 |
|----------|------|------|
| 集团级隔离 | ❌ | 未实现 |
| 区域级隔离 | ❌ | 未实现 |
| 企业级隔离 | ❌ | 未实现 |

---

## 五、错误处理分析

### 5.1 错误格式

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 统一错误格式 | ✅ | 使用 error 中间件 |
| 错误码 | ✅ | 返回错误码 |
| 错误信息 | ⚠️ | 部分错误信息不够友好 |
| 堆栈信息 | ❌ | 生产环境不应返回堆栈 |

### 5.2 异常捕获

| 检查项 | 状态 | 说明 |
|--------|------|------|
| try-catch | ⚠️ | 部分接口缺少异常捕获 |
| 数据库异常 | ⚠️ | 部分接口未处理数据库异常 |
| 文件操作异常 | ⚠️ | 部分上传接口未处理文件异常 |
| 网络异常 | ⚠️ | AI调用缺少网络异常处理 |

### 5.3 常见错误处理问题

| 问题类型 | 影响接口 | 说明 |
|----------|----------|------|
| 空值引用 | 隐患模块 | 未检查数据库返回是否为空 |
| 参数类型错误 | 培训模块 | 未校验参数类型 |
| 文件上传失败 | 文档模块 | 未处理上传失败情况 |
| AI调用超时 | AI模块 | 超时处理不完善 |

---

## 六、日志记录分析

### 6.1 日志类型

| 日志类型 | 状态 | 说明 |
|----------|------|------|
| 操作日志 | ✅ | 使用 auditLog 记录 |
| 错误日志 | ⚠️ | 部分接口缺少错误日志 |
| 性能日志 | ❌ | 无性能日志 |
| 访问日志 | ❌ | 无访问日志 |

### 6.2 日志完整性

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 操作记录 | ✅ | 记录创建、更新、删除操作 |
| 操作人 | ✅ | 记录操作人信息 |
| 操作时间 | ✅ | 记录操作时间 |
| 操作对象 | ✅ | 记录操作对象ID |
| 操作详情 | ⚠️ | 部分操作缺少详情 |

---

## 七、安全分析

### 7.1 安全隐患

| 隐患类型 | 状态 | 说明 |
|----------|------|------|
| SQL注入 | ✅ | 使用参数化查询 |
| XSS攻击 | ⚠️ | 部分接口未对输出进行转义 |
| CSRF攻击 | ✅ | 使用JWT认证，无需CSRF |
| 文件上传漏洞 | ⚠️ | 部分上传接口缺少文件类型校验 |
| 敏感信息泄露 | ⚠️ | 部分接口返回敏感信息 |

### 7.2 安全建议

| 建议 | 优先级 | 说明 |
|------|--------|------|
| 文件类型白名单 | P0 | 限制上传文件类型 |
| 输出转义 | P1 | 对用户输入进行HTML转义 |
| 敏感信息脱敏 | P1 | 身份证号、手机号脱敏返回 |
| API限流 | P2 | 防止暴力攻击 |

---

## 八、接口质量评分

| 维度 | 评分 | 说明 |
|------|------|------|
| REST规范 | 75/100 | 基本符合，缺少版本控制 |
| 参数校验 | 60/100 | 部分接口缺少校验 |
| 权限控制 | 65/100 | 部分接口缺少角色控制 |
| 错误处理 | 70/100 | 基本完善，部分接口缺少异常捕获 |
| 日志记录 | 70/100 | 操作日志完善，缺少性能日志 |
| 安全性 | 75/100 | 基本安全，部分需要增强 |

**综合评分：70/100**

---

**分析日期**：2026-07-21
