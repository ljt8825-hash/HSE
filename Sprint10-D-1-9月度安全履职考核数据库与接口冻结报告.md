# Sprint10-D-1-9 月度安全履职考核数据库与接口冻结报告

> **文档性质**：最终冻结报告（后续开发唯一依据）
> **任务编号**：Sprint10-D-1-9
> **冻结日期**：2026-07-23
> **数据库类型**：PostgreSQL 15
> **关联任务**：Sprint10-D-1-3 ~ Sprint10-D-1-8（已完成）

---

## 一、冻结声明

本报告为 **月度安全履职考核模块** 的数据库结构、接口设计、前后端交互模型的**最终冻结文件**，自冻结之日起作为以下三项工作的**唯一依据**：

1. **PC端前端开发**（apps/web-antd/src/views/hse/assessment-monthly/）
2. **后端接口开发**（server/routes/assessment.js）
3. **数据库实施**（PostgreSQL 15 DDL 脚本）

任何对冻结内容的修改必须经过变更评审，并更新本报告版本号。未经评审的偏离一律不予接受。

---

## 二、业务范围冻结

### 2.1 月度考核对象（仅以下两类）

| 序号 | 考核对象 | 岗位来源 | 说明 |
| :--- | :--- | :--- | :--- |
| 1 | 乡镇作业中心经理（乡镇主管） | employee 表 position='乡镇作业中心经理' | 每个乡镇1人 |
| 2 | 管理员 | employee 表 position='管理员' | 各乡镇作业中心管理员 |

### 2.2 不纳入月度考核的岗位

其他所有岗位（含驾驶员、网格长、普通员工等）**进入年度HSE综合评价**，不在本月度考核模块范围内。

### 2.3 业务边界约束

| 约束编号 | 约束内容 |
| :--- | :--- |
| BIZ-001 | 仅考核乡镇作业中心经理与管理员两类岗位 |
| BIZ-002 | 三违责任传导仅1级（直属上级），禁止多级追溯 |
| BIZ-003 | 不修改 employee、employee_assignment、hse_responsibility 表 |
| BIZ-004 | 不新增车辆管理、不扩展环境管理模块 |
| BIZ-005 | 不修改员工风险模型、岗位权重、考核模型v1.1、指标字典v1.1、预警规则v1.1 |
| BIZ-006 | 所有规则读取 hse_warning_rule_version 表 |
| BIZ-007 | 数据库为 PostgreSQL 15，禁止切换 |

---

## 三、数据库模型冻结

### 3.1 冻结依据

- **设计文档**：《月度安全履职考核数据库设计.md》 v3.0
- **整合来源**：Sprint10-D-1-6（模块设计）、Sprint10-D-1-7（规则引擎与责任传导）、Sprint10-D-1-8（审核机制与版本管理）

### 3.2 核心表清单（8张）

| 序号 | 表名 | 用途 | 预估数据量 | 关键约束 |
| :--- | :--- | :--- | :--- | :--- |
| 1 | `hse_assessment_cycle` | 考核周期表 | 每年12条 | 周期编码唯一，状态机控制 |
| 2 | `hse_assessment_target` | 考核对象表 | 每年500-600条 | 冻结后触发器拦截修改 |
| 3 | `hse_assessment_metric` | 考核指标表 | 约30条（固定） | 指标编码唯一，分岗位权重 |
| 4 | `hse_assessment_score` | 评分记录表 | 每年5000+条 | 版本不可覆盖 |
| 5 | `hse_assessment_deduction` | 扣分明细表 | 每年10000+条 | 记录扣分来源与金额 |
| 6 | `hse_deduction_adjustment` | 扣分调整记录表 | 每年3000+条 | 版本追加，禁止UPDATE/DELETE |
| 7 | `hse_responsibility_chain` | 责任传导关系表 | 约100条 | 仅1级传导 |
| 8 | `hse_assessment_audit_log` | 考核审计日志表 | 每年50000+条 | 仅INSERT，禁止UPDATE/DELETE |

### 3.3 表关联关系

```
hse_assessment_cycle (1) ──► (N) hse_assessment_target
                                       │
                                       │ (1) ──► (N)
                                       ▼
                                hse_assessment_score
                                       │
                                       │ (1) ──► (N)
                                       ▼
                                hse_assessment_deduction
                                       │
                                       │ (1) ──► (N)
                                       ▼
                                hse_deduction_adjustment

hse_assessment_metric ──► hse_assessment_score (指标关联)

hse_responsibility_chain (独立，支持责任传导计算)

hse_assessment_audit_log (独立，记录所有操作)
```

### 3.4 周期状态机（5状态）

```
not_started（未开始）
      │ 启动
      ▼
in_progress（进行中）
      │ 评分完成
      ▼
pending_review（待审核）
      │ 审核通过
      ▼
reviewed（已审核）
      │ 冻结
      ▼
frozen（已冻结） ◄──解冻──► reviewed
```

### 3.5 数据安全约束

| 约束类型 | 实现方式 | 说明 |
| :--- | :--- | :--- |
| **版本不可覆盖** | `hse_deduction_adjustment` 表仅INSERT | 每次调整生成新版本号 |
| **冻结锁定** | 触发器 `prevent_frozen_target_modify` | 冻结后拦截UPDATE/DELETE |
| **审计不可篡改** | `hse_assessment_audit_log` 触发器拦截UPDATE/DELETE | 仅允许INSERT |
| **软删除** | 所有表 `is_deleted` 字段 | 禁止物理删除业务数据 |
| **业务表只读** | 考核模块仅SELECT查询employee等业务表 | 不修改现有业务数据 |

### 3.6 索引策略

| 表 | 索引 | 用途 |
| :--- | :--- | :--- |
| `hse_assessment_cycle` | idx_cycle_code（唯一）、idx_year_month | 周期查询 |
| `hse_assessment_target` | idx_cycle_id、idx_employee_id、idx_township | 对象查询 |
| `hse_assessment_score` | idx_target_id、idx_metric_id | 评分查询 |
| `hse_assessment_deduction` | idx_target_id、idx_source、idx_review_status | 扣分查询 |
| `hse_deduction_adjustment` | idx_deduction_id、idx_version_no | 版本追溯 |
| `hse_assessment_audit_log` | idx_operator_id、idx_operation_time、idx_target_id | 审计查询 |

---

## 四、接口设计冻结

### 4.1 冻结依据

- **设计文档**：《月度安全履职考核API设计.md》 v1.0

### 4.2 接口规范

| 规范项 | 说明 |
| :--- | :--- |
| **基础路径** | `/api/v1/assessment` |
| **请求格式** | `application/json`（文件上传除外） |
| **响应格式** | 统一JSON结构（code/message/data/pagination） |
| **认证方式** | Bearer Token（JWT） |
| **分页参数** | `page`（页码，从1开始）、`page_size`（每页条数，默认20） |
| **排序参数** | `sort_by`、`sort_order`（asc/desc） |

### 4.3 接口分组总览（10组，共40个接口）

| 序号 | 接口组 | 路径前缀 | 接口数 | 主要权限 |
| :--- | :--- | :--- | :--- | :--- |
| 1 | 考核周期接口 | `/cycles` | 6 | VIEW、SCORE |
| 2 | 考核对象接口 | `/targets` | 5 | VIEW |
| 3 | 指标接口 | `/metrics` | 5 | VIEW |
| 4 | 自动评分接口 | `/scoring` | 3 | SCORE |
| 5 | 扣分审核接口 | `/deductions/review` | 4 | REVIEW |
| 6 | 调整接口 | `/deductions/adjust` | 3 | ADJUST |
| 7 | 冻结接口 | `/freeze` | 3 | FREEZE |
| 8 | 结果查询接口 | `/results` | 5 | VIEW |
| 9 | Excel导入接口 | `/import` | 3 | SCORE |
| 10 | Excel导出接口 | `/export` | 3 | FREEZE、VIEW |
| **合计** | — | — | **40** | — |

### 4.4 统一响应结构

```json
{
  "code": 200,
  "message": "success",
  "data": { ... },
  "pagination": {
    "page": 1,
    "page_size": 20,
    "total": 100
  }
}
```

### 4.5 统一错误码

| 错误码 | 含义 | 触发场景 |
| :--- | :--- | :--- |
| 200 | 成功 | 正常请求 |
| 400 | 请求参数错误 | 参数校验失败 |
| 401 | 未认证 | Token缺失或失效 |
| 403 | 无权限 | 角色/权限码不足 |
| 404 | 资源不存在 | 资源ID无效 |
| 409 | 状态冲突 | 周期状态前置条件不满足 |
| 422 | 业务规则冲突 | 职责分离校验失败 |
| 500 | 服务器错误 | 系统异常 |

---

## 五、页面交互设计冻结

### 5.1 页面清单（10个页面）

| 序号 | 页面名称 | 路由路径 | 主要功能 | 关联接口组 |
| :--- | :--- | :--- | :--- | :--- |
| 1 | 月度考核首页 | `/hse/assessment-monthly/home` | 考核概览、待办事项、快捷入口 | 周期、结果查询 |
| 2 | 考核周期管理 | `/hse/assessment-monthly/cycles` | 创建/启动/查看周期 | 考核周期接口 |
| 3 | 考核对象列表 | `/hse/assessment-monthly/targets` | 查看/同步考核对象 | 考核对象接口 |
| 4 | 自动评分页面 | `/hse/assessment-monthly/scoring` | 触发评分、查看评分进度 | 自动评分接口 |
| 5 | 扣分审核页面 | `/hse/assessment-monthly/deduction-review` | 审核扣分明细 | 扣分审核接口 |
| 6 | 扣分调整页面 | `/hse/assessment-monthly/deduction-adjust` | 调整扣分、查看版本历史 | 调整接口 |
| 7 | 审核确认页面 | `/hse/assessment-monthly/result-review` | 终审确认考核结果 | 扣分审核接口 |
| 8 | 结果冻结页面 | `/hse/assessment-monthly/freeze` | 冻结/解冻考核结果 | 冻结接口 |
| 9 | Excel导出页面 | `/hse/assessment-monthly/export` | 导出正式月度考核表 | Excel导出接口 |
| 10 | Excel导入页面 | `/hse/assessment-monthly/import` | 导入辅助补录与历史数据 | Excel导入接口 |

### 5.2 前端目录结构（冻结）

```
apps/web-antd/src/
├── api/hse/
│   └── assessment-monthly.ts          # 月度考核API封装
├── views/hse/assessment-monthly/
│   ├── home/index.vue                 # 月度考核首页
│   ├── cycles/index.vue               # 考核周期管理
│   ├── targets/index.vue              # 考核对象列表
│   ├── scoring/index.vue              # 自动评分页面
│   ├── deduction-review/index.vue     # 扣分审核页面
│   ├── deduction-adjust/index.vue     # 扣分调整页面
│   ├── result-review/index.vue        # 审核确认页面
│   ├── freeze/index.vue               # 结果冻结页面
│   ├── export/index.vue               # Excel导出页面
│   └── import/index.vue               # Excel导入页面
├── router/routes/modules/
│   └── hse-assessment-monthly.ts      # 路由配置
└── store/hse/
    └── assessment-monthly.ts          # 状态管理
```

### 5.3 交互流程

```
用户登录
   │
   ▼
月度考核首页（概览 + 待办）
   │
   ├──► 考核周期管理 ──► 创建周期 ──► 启动周期
   │                                    │
   │                                    ▼
   ├──► 考核对象列表 ◄────────── 自动生成考核对象
   │                                    │
   │                                    ▼
   ├──► 自动评分页面 ──► 触发评分 ──► 生成扣分明细
   │                                    │
   │                                    ▼
   ├──► 扣分审核页面 ◄────────── 待审核扣分
   │         │                          │
   │         │ 驳回                      │ 调整
   │         ▼                          ▼
   │    扣分调整页面 ──► 新增调整版本
   │         │                          │
   │         │ 重新审核                  │
   │         ▼                          ▼
   ├──► 审核确认页面 ──► 终审通过
   │                                    │
   │                                    ▼
   ├──► 结果冻结页面 ──► 冻结结果
   │                                    │
   │                                    ▼
   ├──► Excel导出页面 ──► 导出正式月度考核表
   │
   └──► Excel导入页面 ──► 导入辅助补录/历史数据
```

---

## 六、权限模型冻结

### 6.1 冻结依据

- **设计文档**：《月度考核权限模型设计.md》 v1.0

### 6.2 5类核心权限

| 权限类型 | 权限码前缀 | 主要操作 | 允许角色 |
| :--- | :--- | :--- | :--- |
| **查看 VIEW** | `hse:assessment:view:*` | 查看周期/对象/指标/评分/扣分/调整/结果/审计日志 | 全部角色（按数据范围） |
| **评分 SCORE** | `hse:assessment:score:*` | 执行自动评分、录入主观评分、重新计算 | ADMIN/HSE-MGR/HSE-OP |
| **调整 ADJUST** | `hse:assessment:adjust:*` | 新增扣分调整、回滚版本、删除错误扣分 | ADMIN/HSE-MGR/HSE-OP |
| **审核 REVIEW** | `hse:assessment:review:*` | 审核扣分明细、审核考核结果、驳回审核 | ADMIN/HSE-MGR/HSE-OP/REVIEWER |
| **冻结 FREEZE** | `hse:assessment:freeze:*` | 冻结结果、解冻结果、导出冻结结果 | ADMIN/HSE-MGR（HSE-OP仅导出） |

### 6.3 5个角色

| 角色编码 | 角色名称 | 数据范围 |
| :--- | :--- | :--- |
| ROLE-ADMIN | 系统管理员 | ALL 全部 |
| ROLE-HSE-MGR | HSE负责人 | ALL 全部 |
| ROLE-HSE-OP | HSE专员 | ALL 全部 |
| ROLE-REVIEWER | 审核人 | TOWNSHIP 本乡镇 |
| ROLE-EMPLOYEE | 考核对象 | SELF 本人 |

### 6.4 职责分离规则（关键约束）

| 规则编号 | 规则描述 | 校验位置 |
| :--- | :--- | :--- |
| SEP-001 | 扣分调整人与审核人不可为同一人 | 审核接口后端校验 |
| SEP-002 | 申诉处理人不可为原审核人 | 申诉处理接口校验 |
| SEP-003 | 结果冻结人不可为扣分调整人 | 冻结接口后端校验 |

### 6.5 权限码总数

共 **20个权限码**，详细清单见《月度考核权限模型设计.md》附录A。

---

## 七、Excel设计冻结

### 7.1 冻结依据

- **设计文档**：《月度考核Excel导入导出设计.md》

### 7.2 导出模板（正式月度考核表）

| 用途 | 触发条件 | 字段范围 |
| :--- | :--- | :--- |
| 导出正式月度考核表 | 周期状态为 `frozen` | 考核对象、岗位、乡镇、各指标得分、扣分明细、调整记录、最终得分、等级、排名 |

**导出字段清单**：

| 序号 | 字段 | 说明 |
| :--- | :--- | :--- |
| 1 | 考核周期 | 如"2026年5月" |
| 2 | 考核对象姓名 | 乡镇作业中心经理/管理员 |
| 3 | 岗位 | 经理/管理员 |
| 4 | 所属乡镇 | 如"津城街道" |
| 5 | 所属作业中心 | 如"一班" |
| 6-15 | 各考核指标得分 | 按指标字典顺序 |
| 16 | 扣分合计 | 自动汇总 |
| 17 | 调整后扣分 | 含调整记录 |
| 18 | 最终得分 | 100 - 调整后扣分 |
| 19 | 考核等级 | A/B/C/D/E |
| 20 | 乡镇排名 | 按得分降序 |
| 21 | 审核状态 | approved |
| 22 | 冻结时间 | 冻结操作时间 |
| 23 | 冻结人 | 冻结操作人 |

### 7.3 导入模板（辅助补录与历史数据）

| 用途 | 使用场景 | 字段范围 |
| :--- | :--- | :--- |
| 辅助补录 | 系统未自动采集的主观指标评分 | 考核对象ID、指标编码、评分值、评分人、评分原因 |
| 历史数据 | 导入2026年之前的纸质/Excel历史考核数据 | 周期、对象、指标、得分、扣分、等级 |

**导入校验规则**：

| 校验项 | 规则 |
| :--- | :--- |
| 考核对象存在性 | employee_id 必须存在于 employee 表 |
| 指标编码有效性 | metric_code 必须存在于 hse_assessment_metric 表 |
| 评分值范围 | 0 ≤ score ≤ base_score |
| 周期状态 | 仅 `in_progress` 状态周期允许导入 |
| 重复导入校验 | 同一对象+指标+周期不可重复导入 |
| 数据格式 | 严格按模板字段顺序与类型 |

---

## 八、责任传导模型冻结

### 8.1 冻结依据

- **设计文档**：《三违责任传导规则最终版.md》、《HSE责任传导模型设计.md》

### 8.2 传导规则

| 规则编号 | 规则描述 |
| :--- | :--- |
| RC-001 | 三违仅传导至**直属上级1级**，禁止多级追溯 |
| RC-002 | 传导扣分按三违等级计算：轻微1分、一般2分、严重5分 |
| RC-003 | 传导关系存储于 `hse_responsibility_chain` 表 |
| RC-004 | 传导扣分作为独立扣分明细记录，`source='responsibility_chain'` |
| RC-005 | 传导扣分同样需要经过审核流程 |

### 8.3 传导计算示例

```
员工A发生1次严重三违
   │
   ▼
查询 hse_responsibility_chain 表 → 员工A的直属上级为员工B
   │
   ▼
在 hse_assessment_deduction 表为员工B新增扣分记录：
   - deduction_amount: 5
   - source: 'responsibility_chain'
   - source_ref: 员工A的三违记录ID
   - review_status: 'pending'
```

---

## 九、审计日志冻结

### 9.1 审计范围

所有5类权限操作（VIEW/SCORE/ADJUST/REVIEW/FREEZE）均写入 `hse_assessment_audit_log` 表。

### 9.2 审计字段

| 字段 | 记录内容 |
| :--- | :--- |
| `operation_type` | VIEW / SCORE / ADJUST / REVIEW / FREEZE |
| `target_table` | 被操作的表名 |
| `target_id` | 被操作的记录ID |
| `operator_id` | 操作人ID |
| `operator_name` | 操作人姓名 |
| `operator_role` | 操作时角色 |
| `operation_detail` | 操作详情JSON（修改前后值） |
| `operation_reason` | 操作原因（调整/审核/解冻必填） |
| `operation_time` | 操作时间 |
| `ip_address` | 操作IP |

### 9.3 审计日志保存策略

| 日志类型 | 保存期限 | 说明 |
| :--- | :--- | :--- |
| 修改/审核/调整/冻结日志 | 永久 | 作为审计依据，不可删除 |
| 查看日志 | 1年 | 仅供运维排查使用 |
| 导出日志 | 3年 | 追踪数据外流 |
| 权限变更日志 | 永久 | 安全审计依据 |

---

## 十、技术约束冻结

### 10.1 数据库约束

| 约束 | 说明 |
| :--- | :--- |
| 数据库类型 | PostgreSQL 15，禁止切换 |
| 字符编码 | UTF-8 |
| 时区 | Asia/Shanghai |
| 主键策略 | BIGSERIAL 自增 |
| 时间字段 | TIMESTAMPTZ 带时区 |
| 软删除 | 所有业务表 `is_deleted` 字段 |
| 触发器 | 冻结锁定、审计日志不可篡改 |

### 10.2 后端约束

| 约束 | 说明 |
| :--- | :--- |
| 后端框架 | Node.js + Express（现有生态） |
| 不引入新依赖 | 使用 Node.js 原生 ws 或现有 express 生态 |
| 生产端口 | 5666 |
| 认证 | JWT Bearer Token |
| 日志 | Winston |
| 校验 | Zod |
| 测试 | Jest + supertest |

### 10.3 前端约束

| 约束 | 说明 |
| :--- | :--- |
| 前端框架 | Vite + Vue 3 + TypeScript |
| UI框架 | Ant Design Vue + useVbenForm/useVbenVxeGrid |
| 状态管理 | Pinia |
| 路由 | Vue Router（meta.authority 必须为 string[]） |
| 目录结构 | 遵循 vben-admin v5.7.0 规范 |
| 业务代码隔离 | 所有HSE代码放在 src/api/hse/、src/views/hse/、src/components/hse/、src/store/hse/、src/router/routes/modules/hse.ts |
| 不修改Vben核心 | 禁止修改 packages/@core/、packages/effects/、packages/themes/ |
| 不创建自定义组件 | 仅在现有 components/hse/ 和 layouts/ 内调整 |
| 主题统一 | 通过 Vben 主题配置系统调整，禁止单组件覆盖样式 |

---

## 十一、交付物清单

### 11.1 本次冻结交付文档

| 序号 | 文档名称 | 版本 | 状态 |
| :--- | :--- | :--- | :--- |
| 1 | 《月度安全履职考核数据库设计.md》 | v3.0 | ✅ 已冻结 |
| 2 | 《月度安全履职考核API设计.md》 | v1.0 | ✅ 已冻结 |
| 3 | 《月度考核权限模型设计.md》 | v1.0 | ✅ 已冻结 |
| 4 | 《Sprint10-D-1-9月度安全履职考核数据库与接口冻结报告.md》 | v1.0 | ✅ 本文档 |

### 11.2 关联已冻结文档（前置任务产出）

| 序号 | 文档名称 | 来源任务 |
| :--- | :--- | :--- |
| 1 | 《HSE前端实际功能清单.md》 | Sprint10-D-1-3 |
| 2 | 《HSE系统模块边界冻结清单.md》 | Sprint10-D-1-5 |
| 3 | 《月度安全履职考核业务流程设计.md》 | Sprint10-D-1-6 |
| 4 | 《月度安全履职考核功能设计.md》 | Sprint10-D-1-6 |
| 5 | 《月度安全履职考核指标模型.md》 | Sprint10-D-1-6 |
| 6 | 《月度安全履职评分计算模型.md》 | Sprint10-D-1-6 |
| 7 | 《三违责任传导规则最终版.md》 | Sprint10-D-1-7 |
| 8 | 《HSE责任传导模型设计.md》 | Sprint10-D-1-7 |
| 9 | 《月度考核人工审核流程设计.md》 | Sprint10-D-1-8 |
| 10 | 《考核扣分版本管理设计.md》 | Sprint10-D-1-8 |
| 11 | 《月度考核审核数据库设计.md》 | Sprint10-D-1-8 |
| 12 | 《月度考核Excel导入导出设计.md》 | Sprint10-D-1-8 |

---

## 十二、后续开发指引

### 12.1 数据库实施顺序

```
步骤1：执行 hse_assessment_cycle 建表 + 触发器
步骤2：执行 hse_assessment_target 建表 + 触发器
步骤3：执行 hse_assessment_metric 建表 + 初始化30条指标数据
步骤4：执行 hse_assessment_score 建表
步骤5：执行 hse_assessment_deduction 建表
步骤6：执行 hse_deduction_adjustment 建表 + 触发器（禁UPDATE/DELETE）
步骤7：执行 hse_responsibility_chain 建表 + 初始化传导关系
步骤8：执行 hse_assessment_audit_log 建表 + 触发器（禁UPDATE/DELETE）
步骤9：创建索引
步骤10：初始化权限码（20个）与角色权限映射
```

### 12.2 后端接口开发顺序

```
阶段1：考核周期接口（6个） + 考核对象接口（5个）
阶段2：指标接口（5个）
阶段3：自动评分接口（3个） + 规则引擎实现
阶段4：扣分审核接口（4个） + 调整接口（3个）
阶段5：冻结接口（3个）
阶段6：结果查询接口（5个）
阶段7：Excel导入接口（3个） + 导出接口（3个）
```

### 12.3 前端开发顺序

```
阶段1：月度考核首页 + 考核周期管理
阶段2：考核对象列表 + 自动评分页面
阶段3：扣分审核页面 + 扣分调整页面
阶段4：审核确认页面 + 结果冻结页面
阶段5：Excel导出页面 + Excel导入页面
```

### 12.4 联调与验收

```
1. 数据库DDL执行验证
2. 后端接口单元测试（Jest + supertest）
3. 前端页面联调
4. 权限矩阵验证（5角色 × 5权限）
5. 职责分离规则验证（SEP-001/002/003）
6. 冻结锁定验证（触发器拦截）
7. 审计日志完整性验证
8. Excel导入导出验证
9. 端到端业务流程验证（创建→评分→调整→审核→冻结→导出）
```

---

## 十三、冻结确认

| 确认项 | 确认内容 | 状态 |
| :--- | :--- | :--- |
| 业务范围 | 仅乡镇作业中心经理 + 管理员 | ✅ 已冻结 |
| 数据库模型 | 8张核心表 + 触发器 + 索引 | ✅ 已冻结 |
| 接口设计 | 10组40个RESTful接口 | ✅ 已冻结 |
| 页面交互 | 10个页面 + 目录结构 + 交互流程 | ✅ 已冻结 |
| 权限模型 | 5类权限 + 5个角色 + 20个权限码 | ✅ 已冻结 |
| Excel设计 | 导出正式表 + 导入辅助补录/历史数据 | ✅ 已冻结 |
| 责任传导 | 仅1级传导 + 独立扣分记录 | ✅ 已冻结 |
| 审计日志 | 5类操作全记录 + 不可篡改 | ✅ 已冻结 |
| 技术约束 | PostgreSQL 15 + Vben Admin v5.7.0 | ✅ 已冻结 |

---

**冻结声明**：

本报告自 2026-07-23 起生效，作为月度安全履职考核模块**后续开发的唯一依据**。任何偏离本报告的实现均视为无效，必须回退至本报告定义的范围。

后续 Sprint10-D-2（数据库实施）、Sprint10-D-3（后端接口开发）、Sprint10-D-4（前端页面开发）均以本报告为基线，不得擅自扩大或缩小范围。

---

**文档版本**：v1.0
**冻结日期**：2026-07-23
**所属项目**：HSE Dashboard Sprint10-D-1-9
**冻结人**：HSE系统设计组

*文档结束*
