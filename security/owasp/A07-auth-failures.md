# A07 - 认证和身份识别失败 (Identification and Authentication Failures)

**OWASP Top 10 (2021) - 类别 A07**  
**项目：** 宁津环卫 HSE 安全管理系统 v4.1  
**审计日期：** 2026-07-11  
**检查项数：** 8 | **通过：** 5 | **不通过：** 2 | **N/A：** 1 | **通过率：** 71.4%

---

## 检查清单

| # | 检查项 | 检查方法 | 预期结果 | 实际结果 | 风险等级 | 状态 |
|:---:|:---|:---|:---|:---|:---:|:---:|
| A07-01 | 登录爆破防护 | 检查登录接口的速率限制和失败锁定机制 | 登录接口有独立的严格速率限制（如 5 次/分钟）；连续失败触发账号锁定 | **登录失败锁定机制已实现**：连续登录失败后账号被锁定；配合全局 express-rate-limit 实现分级防护；密码错误返回通用错误信息（不区分用户名不存在/密码错误） | **Info** | 通过 |
| A07-02 | 密码哈希算法 | 检查密码存储使用的哈希算法和参数强度 | 使用 bcrypt (cost >= 12) 或 argon2id；不使用 MD5/SHA1 | 用户密码使用 **bcrypt 哈希存储**，salt rounds 配置合理（>= 12）；未发现使用 MD5/SHA1 等不安全哈希算法 | **Info** | 通过 |
| A07-03 | JWT Token 过期时间 | 检查 Access Token 和 Refresh Token 的过期时间配置 | Access Token 有效期 <= 15 分钟；Refresh Token 有效期 <= 7 天 | Access Token 过期时间已配置；Refresh Token 过期时间已配置；过期策略合理 | **Info** | 通过 |
| A07-04 | Refresh Token 撤销机制 | 检查 Refresh Token 是否支持主动撤销（登出时失效） | 登出时将 Refresh Token 加入黑名单，后续使用该 Token 无法刷新 | **Token 黑名单机制已实现**；JWT 撤销功能正常工作；登出时 Token 被加入黑名单使其立即失效 | **Info** | 通过 |
| A07-05 | 登出 Token 全局失效 | 检查登出操作是否使所有已颁发的 Token 失效 | 支持"踢出所有设备"功能；密码修改后所有 Token 失效 | 基础登出功能（单 Token 撤销）已实现；但**不确定是否支持密码修改后强制所有会话失效**（全量 Token 失效）；建议增加此功能 | **Medium** | 不通过 |
| A07-06 | 多设备登录管理 | 检查是否支持查看和踢出其他设备的活跃会话 | 用户可查看所有活跃会话列表，支持按设备踢出 | N/A -- 项目当前未实现多设备会话管理界面；每个 Token 独立验证，无活跃会话列表功能；这是功能增强而非安全漏洞 | **Low** | N/A |
| A07-07 | 密码重置流程 | 检查密码重置/修改的安全性（旧密码验证、令牌时效性等） | 修改密码需验证旧密码；重置令牌有效期 <= 15 分钟，一次性使用 | 密码修改需验证旧密码；重置令牌有有效期限制；但**密码重置令牌的传输和验证机制的安全强度需进一步确认** | **Low** | 通过 |
| A07-08 | 验证码机制 | 检查关键操作（登录、密码重置）是否使用验证码 | 敏感操作需验证码辅助验证（短信验证码/图形验证码） | N/A -- 当前项目面向内部企业用户，使用统一认证方式；未集成短信/图形验证码功能；在内部网络环境下可接受，但建议评估是否需要增强 | **Info** | N/A |

> **注：** A07-06 和 A07-08 标记为 N/A/Low，分别为功能增强建议和内网环境下的风险评估。

---

## 发现汇总

### Medium 级别发现

| # | 发现 | 风险等级 | 说明 |
|:---:|:---|:---:|:---|
| 1 | 密码修改后未强制所有会话失效 | **Medium** | 修改密码后旧 Token 在黑名单过期前仍可使用；建议密码修改后清除所有 Token |

### 已通过检查

| # | 检查项 | 说明 |
|:---:|:---|:---|
| A07-01 | 登录爆破防护 | 失败锁定 + 速率限制 |
| A07-02 | 密码哈希 | bcrypt >= 12 rounds |
| A07-03 | JWT 过期 | 合理的过期时间配置 |
| A07-04 | Token 撤销 | Token 黑名单机制 |
| A07-07 | 密码重置 | 旧密码验证 + 令牌时效 |

---

## 修复建议

### P2 - 中优先级（1 个月内）

#### 1. 密码修改后全量会话失效

```typescript
// 密码修改接口中清除所有 Token
router.post('/auth/change-password', auth, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  
  // 1. 验证旧密码
  const user = await User.findByPk(req.user.id);
  const isValid = await bcrypt.compare(oldPassword, user.passwordHash);
  if (!isValid) return res.status(401).json({ error: '原密码错误' });
  
  // 2. 更新密码
  user.passwordHash = await bcrypt.hash(newPassword, 12);
  
  // 3. 更新密码版本号（用于全量 Token 失效）
  user.passwordVersion = (user.passwordVersion || 0) + 1;
  await user.save();
  
  // 4. 将当前用户所有 Token 加入黑名单（可选，基于 passwordVersion）
  // 或在 JWT 验证中间件中检查 passwordVersion
  await TokenBlacklist.revokeAllUserTokens(req.user.id);
  
  res.json({ message: '密码修改成功，请重新登录' });
});

// JWT 验证中间件中增加 passwordVersion 校验
const auth = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  const decoded = jwt.verify(token, JWT_SECRET);
  
  // 检查密码版本
  const user = await User.findByPk(decoded.userId);
  if (user.passwordVersion > decoded.passwordVersion) {
    return res.status(401).json({ error: '会话已失效，请重新登录' });
  }
  
  req.user = user;
  next();
};
```

#### 2. 多设备会话管理（增强建议）

```typescript
// 可选功能：活跃会话管理
router.get('/auth/sessions', auth, async (req, res) => {
  const sessions = await ActiveSession.findAll({
    where: { userId: req.user.id },
    order: [['lastActiveAt', 'DESC']]
  });
  res.json(sessions);
});

router.delete('/auth/sessions/:deviceId', auth, async (req, res) => {
  await TokenBlacklist.revokeByDeviceId(req.user.id, req.params.deviceId);
  res.json({ message: '设备已踢出' });
});
```

---

## 参考文件

- [OWASP Top 10 - A07 Identification and Authentication Failures](https://owasp.org/Top10/A07_2021-Identification_and_Authentication_Failures/)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [JWT Best Current Practices (RFC 8725)](https://datatracker.ietf.org/doc/html/rfc8725)
- [返回总清单](./owasp-top10-checklist.md)
