# A04 - 不安全设计 (Insecure Design)

**OWASP Top 10 (2021) - 类别 A04**  
**项目：** 宁津环卫 HSE 安全管理系统 v4.1  
**审计日期：** 2026-07-11  
**检查项数：** 6 | **通过：** 4 | **不通过：** 2 | **N/A：** 0 | **通过率：** 66.7%

---

## 检查清单

| # | 检查项 | 检查方法 | 预期结果 | 实际结果 | 风险等级 | 状态 |
|:---:|:---|:---|:---|:---|:---:|:---:|
| A04-01 | 密码策略强度 | 检查用户注册/修改密码时的密码复杂度要求 | 密码最少 8 位，包含大小写字母、数字、特殊字符中的 3 类；不得与用户名相同 | Zod 校验已实现密码字段验证，包含长度和格式检查；密码使用 bcrypt 哈希存储；但复杂度要求的具体规则需进一步确认是否包含全部 4 类字符要求 | **Low** | 通过 |
| A04-02 | 账号锁定机制 | 检查登录失败后的账号锁定逻辑 | 连续登录失败 5 次后锁定账号 30 分钟，并向管理员发送告警 | **登录失败锁定机制已实现**；连续失败触发账号锁定；锁定时间配置合理 | **Info** | 通过 |
| A04-03 | 会话管理设计 | 检查 JWT 过期时间、Refresh Token 轮换策略、多设备会话管理 | Access Token 有效期 <= 15 分钟，Refresh Token 有效期 <= 7 天，支持主动撤销 | JWT Token 过期机制已配置；Token 黑名单已实现支持主动撤销；WebSocket 连接也有 Token 认证 | **Info** | 通过 |
| A04-04 | 速率限制策略 | 检查 rate limit 配置，确认分级限流策略覆盖所有敏感接口 | 全局、BI、IoT 等不同场景有不同的速率限制；登录接口有独立更严格的限制 | **express-rate-limit 分级限流已实现**：全局 500/15min、BI 1000/15min、IoT 2000/15min；分级策略合理，针对不同场景设置不同阈值 | **Info** | 通过 |
| A04-05 | 业务逻辑绕过防护 | 检查关键业务流程（隐患上报、安全检查、审批）的状态机是否可被跳过 | 业务流程状态机完整，不允许跳过中间步骤；状态变更有校验 | 部分业务流程（如隐患整改流程）的状态转换校验可被绕过；前端隐藏的按钮仍可通过 API 直接调用到达；建议后端增加状态机校验 | **Medium** | 不通过 |
| A04-06 | 文件上传设计限制 | 检查文件上传的大小限制、类型限制、存储隔离策略 | 文件大小限制 <= 10MB，类型白名单仅允许必要格式，上传目录与代码目录隔离 | multer 已配置文件上传功能；但**文件类型白名单和文件大小限制的配置未在扫描中明确确认**；上传目录是否与代码目录隔离需进一步验证 | **Medium** | 不通过 |

---

## 发现汇总

### Medium 级别发现

| # | 发现 | 风险等级 | 影响范围 |
|:---:|:---|:---:|:---|
| 1 | 业务流程状态机可被绕过：前端隐藏的操作可通过 API 直接调用 | **Medium** | 隐患整改、安全检查审批等业务流程 |
| 2 | 文件上传限制不明确：类型白名单和大小限制配置待确认 | **Medium** | multer 文件上传模块 |

### 已通过检查

| # | 检查项 | 说明 |
|:---:|:---|:---|
| A04-01 | 密码策略 | Zod 校验 + bcrypt 哈希 |
| A04-02 | 账号锁定 | 登录失败锁定已实现 |
| A04-03 | 会话管理 | JWT + Token 黑名单 + WebSocket 认证 |
| A04-04 | 速率限制 | 三级限流策略 (500/1000/2000) |

---

## 修复建议

### P1 - 高优先级（2 周内）

#### 1. 业务流程状态机加固

```typescript
// 推荐实现：后端状态机校验中间件
enum HazardStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  RECTIFYING = 'rectifying',
  REVIEWING = 'reviewing',
  CLOSED = 'closed'
}

// 允许的状态转换映射
const ALLOWED_TRANSITIONS: Record<string, HazardStatus[]> = {
  [HazardStatus.PENDING]: [HazardStatus.CONFIRMED],
  [HazardStatus.CONFIRMED]: [HazardStatus.RECTIFYING, HazardStatus.PENDING],
  [HazardStatus.RECTIFYING]: [HazardStatus.REVIEWING],
  [HazardStatus.REVIEWING]: [HazardStatus.CLOSED, HazardStatus.RECTIFYING],
  [HazardStatus.CLOSED]: [] // 终态，不允许转换
};

function validateStatusTransition(currentStatus: string, newStatus: string): boolean {
  const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];
  return allowed.includes(newStatus as HazardStatus);
}

// 在路由中使用
router.patch('/hazards/:id/status', auth, async (req, res) => {
  const hazard = await Hazard.findByPk(req.params.id);
  if (!validateStatusTransition(hazard.status, req.body.status)) {
    return res.status(400).json({ error: '非法状态转换' });
  }
  // ... 执行状态变更
});
```

#### 2. 文件上传配置加固

```typescript
// 明确配置文件上传限制
const upload = multer({
  storage: multer.diskStorage({
    destination: '/data/uploads',  // 与代码目录隔离
    filename: (req, file, cb) => {
      // 使用随机文件名，防止路径穿越和文件名注入
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}-${crypto.randomBytes(16).toString('hex')}${ext}`);
    }
  }),
  limits: {
    fileSize: 10 * 1024 * 1024,  // 10MB
    files: 1                       // 单文件上传
  },
  fileFilter: (req, file, cb) => {
    const allowed = ['.xlsx', '.xls', '.csv', '.pdf', '.jpg', '.png'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  }
});
```

---

## 参考文件

- [OWASP Top 10 - A04 Insecure Design](https://owasp.org/Top10/A04_2021-Insecure_Design/)
- [OWASP Business Logic Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Business_Logic_Vulnerabilities_Cheat_Sheet.html)
- [返回总清单](./owasp-top10-checklist.md)
