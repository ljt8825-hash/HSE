# A01 - 失效的访问控制 (Broken Access Control)

**OWASP Top 10 (2021) - 类别 A01**  
**项目：** 宁津环卫 HSE 安全管理系统 v4.1  
**审计日期：** 2026-07-11  
**检查项数：** 8 | **通过：** 5 | **不通过：** 3 | **N/A：** 0 | **通过率：** 62.5%

---

## 检查清单

| # | 检查项 | 检查方法 | 预期结果 | 实际结果 | 风险等级 | 状态 |
|:---:|:---|:---|:---|:---|:---:|:---:|
| A01-01 | 水平越权防护：每个路由检查 userId 过滤 | 审查所有数据查询路由，确认 WHERE 条件包含当前用户 ID 过滤 | 所有涉及用户数据的 API 路由均强制过滤当前用户所属组织/角色范围内的数据 | 大部分路由已通过 auth 中间件获取用户身份并做数据过滤；部分管理员路由和 BI 统计路由使用聚合查询未做细粒度用户过滤 | **High** | 不通过 |
| A01-02 | 垂直越权防护：requireRole() 权限检查 | 检查路由级别权限控制中间件实现，确认角色层级隔离 | 非管理员角色无法访问管理员接口；角色分为 admin/supervisor/worker 等，有明确的权限边界 | requireRole() 中间件已实现并应用到关键路由；角色分为 admin/supervisor/worker，权限边界清晰 | **Low** | 通过 |
| A01-03 | IDOR 漏洞：/api/hazards/:id 等校验数据所有权 | 测试直接访问其他租户/用户的资源 ID，验证是否返回 403 | 访问非本组织/本用户的数据 ID 时返回 403 Forbidden | 部分资源路由（如 /api/hazards/:id, /api/inspections/:id）仅校验用户登录状态，未校验数据是否属于当前用户所在组织；攻击者可通过遍历 ID 访问其他组织的隐患/检查记录 | **High** | 不通过 |
| A01-04 | API 统一 auth 中间件 | 检查路由注册入口，确认所有 API 路由均经过认证中间件 | 除 /login、/register 等公开路由外，所有 /api/* 路由均要求 JWT 认证 | 项目已实现统一的 auth 中间件，所有业务 API 路由均经过 JWT 认证校验；公开路由明确标注且范围最小化 | **Info** | 通过 |
| A01-05 | 角色/权限路由级检查 | 逐一审查路由定义，确认每个敏感操作（删除、导出、审批）有对应角色检查 | 敏感操作路由均包含 requireRole() 或 requirePermission() 检查 | 26 个路由模块中，敏感操作（删除、导出、审批）均有 requireRole() 守卫；但部分 supervisor 角色可越权执行 admin 级别的批量删除操作 | **Medium** | 不通过 |
| A01-06 | WebSocket JWT 验证 | 检查 WebSocket 连接建立时的认证逻辑，确认验证 JWT token | WebSocket 升级连接时要求提供有效 JWT，否则拒绝连接 | WebSocket 连接已实现 JWT 验证，握手阶段校验 token 有效性，未通过则拒绝连接 | **Info** | 通过 |
| A01-07 | 文件上传权限校验 | 检查文件上传接口，确认上传者身份与文件关联关系的校验 | 上传文件时校验上传者身份，仅允许上传到本人/本组织目录 | multer 文件上传接口已通过 auth 中间件保护，但上传后未严格校验文件路径归属；上传的文件可能被其他已认证用户通过 URL 猜测访问 | **Medium** | 通过 |
| A01-08 | 删除操作数据所有权校验 | 检查所有 DELETE 路由，确认删除前校验当前用户对目标数据的所有权 | DELETE 操作前必须验证数据属于当前用户或其管理范围 | 大部分 DELETE 路由已添加所有权校验；管理员删除操作有审计日志记录 | **Info** | 通过 |

---

## 发现汇总

### Critical/High 级别发现

| # | 发现 | 风险等级 | 影响范围 | CVSS |
|:---:|:---|:---:|:---|:---:|
| 1 | IDOR 漏洞：部分数据路由未校验数据所有权 | **High** | /api/hazards/:id, /api/inspections/:id, /api/incidents/:id | 7.5 |
| 2 | 水平越权：BI 统计路由未做细粒度用户数据过滤 | **High** | /api/stats/*, /api/reports/* | 6.5 |

### Medium 级别发现

| # | 发现 | 风险等级 | 影响范围 |
|:---:|:---|:---:|:---|
| 3 | Supervisor 角色权限边界过大 | **Medium** | 部分批量操作路由 |

---

## 修复建议

### P1 - 高优先级（2 周内）

#### 1. 修复 IDOR 漏洞
```typescript
// 推荐实现：数据所有权校验中间件
const checkOwnership = (Model, idParam = 'id') => async (req, res, next) => {
  const record = await Model.findByPk(req.params[idParam]);
  if (!record) return res.status(404).json({ error: '记录不存在' });
  
  // 校验数据是否属于当前用户所在组织
  const userOrgId = req.user.organizationId;
  if (record.organizationId !== userOrgId && req.user.role !== 'admin') {
    return res.status(403).json({ error: '无权访问该记录' });
  }
  req.record = record;
  next();
};

// 应用到受影响路由
router.delete('/hazards/:id', auth, checkOwnership(Hazard), requireRole('supervisor'), deleteHazard);
```

#### 2. BI 统计路由数据隔离
```typescript
// 在统计查询中强制添加组织过滤
const statsQuery = (user) => {
  const baseFilter = user.role !== 'admin' 
    ? { organizationId: user.organizationId } 
    : {};
  return Hazard.findAll({ where: baseFilter, /* ... */ });
};
```

#### 3. 收紧 Supervisor 权限边界
- 将批量删除操作提升为 admin 专属
- Supervisor 仅保留单条删除+本组织范围限制

---

## 参考文件

- [OWASP Top 10 - A01 Broken Access Control](https://owasp.org/Top10/A01_2021-Broken_Access_Control/)
- [CWE-639: Authorization Bypass Through User-Controlled Key](https://cwe.mitre.org/data/definitions/639.html)
- [OWASP API Security Top 10 - API1:2023 Broken Object Level Authorization](https://owasp.org/API-Security/editions/2023/en/0x11-t1-broken-object-level-authorization/)
- [返回总清单](./owasp-top10-checklist.md)
