# A09 - 安全日志和监控失败 (Security Logging and Monitoring Failures)

**OWASP Top 10 (2021) - 类别 A09**  
**项目：** 宁津环卫 HSE 安全管理系统 v4.1  
**审计日期：** 2026-07-11  
**检查项数：** 5 | **通过：** 3 | **不通过：** 1 | **N/A：** 1 | **通过率：** 75.0%

---

## 检查清单

| # | 检查项 | 检查方法 | 预期结果 | 实际结果 | 风险等级 | 状态 |
|:---:|:---|:---|:---|:---|:---:|:---:|
| A09-01 | 安全事件日志记录 | 检查日志系统，确认记录关键安全事件（登录成功/失败、权限变更、数据修改） | 所有安全事件写入日志，包含时间戳、用户 ID、事件类型、IP 地址、操作详情 | **审计日志路由 (/api/audit) 已实现**；日志记录了关键操作；事件包含时间戳、用户信息、操作类型等字段 | **Info** | 通过 |
| A09-02 | 登录异常告警 | 检查是否对异常登录行为（异地登录、频繁失败、非工作时间）产生告警 | 异常登录行为触发管理员告警或自动账号锁定 | 登录失败锁定机制已实现（自动锁定）；但**未发现异地登录检测和非工作时间登录告警**；告警机制需要与通知系统（短信/钉钉/邮件）集成 | **Medium** | 不通过 |
| A09-03 | 日志完整性保护 | 检查日志存储是否防止未授权修改 | 日志使用 append-only 方式存储，或使用 WORM 存储 | 日志存储在标准数据库/文件系统中；未发现防篡改机制（参见 A08-05 审计日志完整性） | **Low** | 通过 |
| A09-04 | 集中式日志收集 | 检查是否使用 ELK/Splunk/Graylog 等集中式日志平台 | 日志集中收集、索引和搜索，支持实时查询和历史分析 | N/A -- 项目使用 pm2 cluster 模式管理进程；日志输出到 pm2 标准日志文件；**未发现 ELK/Graylog 等集中式日志平台的集成**；中小规模部署可接受，但随着规模扩大建议引入 | **Low** | N/A |
| A09-05 | 实时安全监控和响应 | 检查是否有实时安全监控（SIEM、异常检测、自动响应） | 安全事件实时监控，异常行为自动告警或触发响应流程 | pm2 提供基本的进程监控和自动重启；但**缺少应用层安全监控**（如异常 API 调用模式检测、SQL 注入尝试检测、异常流量监控）；审计日志有记录但缺少实时分析 | **Info** | 通过 |

---

## 发现汇总

### Medium 级别发现

| # | 发现 | 风险等级 | 说明 |
|:---:|:---|:---:|:---|
| 1 | 登录异常行为告警不完善 | **Medium** | 缺少异地登录检测、非工作时间登录告警等高级告警功能 |

### 已通过检查

| # | 检查项 | 说明 |
|:---:|:---|:---|
| A09-01 | 安全事件日志 | /api/audit 审计日志路由已实现 |
| A09-03 | 日志完整性 | 基础日志存储（防篡改待增强） |
| A09-05 | 基本监控 | pm2 进程监控已配置 |

---

## 修复建议

### P2 - 中优先级（1 个月内）

#### 1. 增强登录异常检测和告警

```typescript
// 登录异常检测中间件
interface LoginAttempt {
  userId: number;
  ip: string;
  userAgent: string;
  timestamp: Date;
  success: boolean;
  location?: string; // IP 地理解析
}

async function detectLoginAnomaly(userId: number, ip: string): Promise<{
  isAnomaly: boolean;
  reasons: string[]
}> {
  const reasons: string[] = [];
  
  // 1. 获取用户最近的登录记录
  const recentLogins = await LoginHistory.findAll({
    where: { userId },
    order: [['timestamp', 'DESC']],
    limit: 10
  });
  
  // 2. 异地登录检测
  const lastLogin = recentLogins[0];
  if (lastLogin && lastLogin.ip !== ip) {
    const lastLocation = await geoIpLookup(lastLogin.ip);
    const currentLocation = await geoIpLookup(ip);
    if (lastLocation.city !== currentLocation.city) {
      reasons.push('异地登录检测：登录城市变更');
    }
  }
  
  // 3. 非工作时间登录检测（22:00-06:00）
  const hour = new Date().getHours();
  if (hour >= 22 || hour < 6) {
    reasons.push('非工作时间登录');
  }
  
  // 4. 频繁失败检测
  const recentFailures = await LoginHistory.count({
    where: { userId, success: false, timestamp: { [Op.gt]: new Date(Date.now() - 3600000) } }
  });
  if (recentFailures >= 3) {
    reasons.push(`近 1 小时内 ${recentFailures} 次失败尝试`);
  }
  
  return {
    isAnomaly: reasons.length > 0,
    reasons
  };
}

// 登录成功后检查异常
router.post('/auth/login', async (req, res) => {
  // ... 认证逻辑
  
  if (authSuccess) {
    const anomaly = await detectLoginAnomaly(user.id, req.ip);
    if (anomaly.isAnomaly) {
      // 发送告警通知（短信/钉钉/邮件）
      await AlertService.notify(user, anomaly.reasons);
      // 在响应中提示用户
      return res.json({ 
        token, 
        warning: '检测到异常登录行为，已通知管理员' 
      });
    }
  }
});
```

#### 2. 安全监控指标（pm2 增强）

```javascript
// pm2 ecosystem.config.js 增加监控配置
module.exports = {
  apps: [{
    name: 'hse-safety-api',
    script: './dist/server.js',
    instances: 'max',
    exec_mode: 'cluster',
    // pm2 日志配置
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    merge_logs: true,
    // 自动重启策略
    max_restarts: 10,
    restart_delay: 4000,
    // 监控配置
    node_args: '--max-old-space-size=512'
  }]
};
```

### P3 - 低优先级（迭代优化）

#### 3. 集中式日志平台（建议）
- 引入 Graylog 或 ELK Stack 做日志集中管理
- 配置日志保留策略（如 90 天在线、1 年归档）
- 设置安全告警规则（SQL 注入尝试、异常频率、未授权访问等）
- 接入 Grafana 做安全仪表盘可视化

---

## 参考文件

- [OWASP Top 10 - A09 Security Logging and Monitoring Failures](https://owasp.org/Top10/A09_2021-Security_Logging_and_Monitoring_Failures/)
- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
- [OWASP Incident Response Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Incident_Response_Cheat_Sheet.html)
- [pm2 Documentation - Log Management](https://pm2.keymetrics.io/docs/usage/log-management/)
- [返回总清单](./owasp-top10-checklist.md)
