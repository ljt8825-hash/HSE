# Lighthouse 性能检测 — 宁津环卫 HSE 安全管理系统 v4.1

## 概述

本项目使用 [Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci) 对前端页面进行自动化性能基线检测，确保每次代码变更不会导致性能退化。

## 环境要求

| 依赖 | 版本要求 | 说明 |
|------|---------|------|
| Node.js | >= 22 | 运行 Lighthouse CI |
| Chrome / Chromium | >= 120 | 无头浏览器（CI 中自动使用 puppeteer 内置） |
| @lhci/cli | >= 0.13 | Lighthouse CI 命令行工具 |

## 安装

### 全局安装 Lighthouse CI

```bash
npm install -g @lhci/cli
```

### 验证安装

```bash
lhci --version
```

## 快速开始

### 1. 准备环境

确保前端开发服务器或预览服务器正在运行：

```bash
# 开发模式
cd 安全看板vben/apps/web-antd
pnpm dev --port 5666

# 或生产构建预览模式
cd 安全看板vben
pnpm build:antd
cd apps/web-antd
npx vite preview --port 5666
```

### 2. 配置认证 Token

对于需要登录的页面，必须提供认证 Token：

```bash
# 方式一：设置环境变量（推荐）
export LHCI_AUTH_TOKEN="你的认证token"

# 方式二：从浏览器获取
# 打开 DevTools -> Application -> Local Storage
# 复制 access_token 的值

# 方式三：通过 API 获取
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"your_password"}' \
  | jq -r '.token'
```

### 3. 运行 Lighthouse 检测

```bash
# 在项目根目录运行
lhci autorun --config=performance/lighthouse/lighthouse.config.js
```

### 4. 查看结果

报告输出到 `performance/reports/lighthouse/` 目录：

```bash
# HTML 报告（可视化，推荐）
open performance/reports/lighthouse/*.html

# JSON 报告（机器可读，用于 CI 解析）
cat performance/reports/lighthouse/*.json
```

## 高级用法

### 仅检测单个页面

```bash
lhci collect --url=http://localhost:5666/login \
  --config=performance/lighthouse/lighthouse.config.js
```

### 增加检测次数（更精确）

修改 `lighthouse.config.js` 中的 `numberOfRuns` 值：

```js
collect: {
  numberOfRuns: 5,  // 默认为 3
}
```

### 移动端检测

创建 `lighthouse.config.mobile.js`，修改预设：

```js
ci: {
  preset: 'mobile',  // 替换 desktop
  collect: {
    puppeteerLaunchOptions: {
      args: ['--no-sandbox', '--emulated-mobile-width=375'],
    },
  },
}
```

运行：

```bash
lhci autorun --config=performance/lighthouse/lighthouse.config.mobile.js
```

### 自定义断言阈值

编辑 `lighthouse.config.js` 的 `assert.assertions` 部分：

```js
assertions: {
  // 将性能阈值提高到 90
  'categories:performance': ['error', { minScore: 0.90 }],
  // 放宽 LCP 到 5s
  'largest-contentful-paint': ['warn', { maxNumericValue: 5000 }],
}
```

## 结果解读

### 核心指标说明

| 指标 | 含义 | 当前阈值 | 级别 |
|------|------|---------|------|
| **Performance** | 综合性能得分 (0-1) | >= 0.85 | warn |
| **Accessibility** | 无障碍性得分 (0-1) | >= 0.90 | error |
| **Best Practices** | 最佳实践得分 (0-1) | >= 0.90 | warn |
| **FCP** | 首次内容绘制时间 | < 2000ms | error |
| **LCP** | 最大内容绘制时间 | < 4000ms | error |
| **CLS** | 累积布局偏移量 | < 0.1 | error |
| **TBT** | 总阻塞时间 | < 600ms | error |
| **SI** | 速度指数 | < 4000ms | warn |

### 断言级别

- **error**: 未通过会阻断 CI 流水线，必须修复
- **warn**: 未通过会发出警告，不阻断流水线，但应关注

### 检测页面列表

| 页面 | 路径 | 需登录 | 优先级 |
|------|------|--------|--------|
| 登录页 | `/login` | 否 | critical |
| 安全概览 | `/dashboard/analytics` | 是 | critical |
| 实时告警 | `/threat/realtime` | 是 | high |
| 隐患列表 | `/vuln/list` | 是 | high |
| BI 大屏 | `/hse/bi` | 是 | medium |

完整配置见 `urls.json`。

## 常见问题

### Q: 需要登录的页面检测失败？

检查 Token 是否正确设置：

```bash
echo $LHCI_AUTH_TOKEN  # 确认环境变量已设置
```

Token 可能在测试期间过期，确保过期时间大于 24 小时。

### Q: CI 中 Lighthouse 步骤失败？

1. 确认前端构建成功（`pnpm build:antd`）
2. 确认 preview server 已启动并监听 5666 端口
3. 检查 `LHCI_AUTH_TOKEN` secret 是否已配置

### Q: 本地结果与 CI 结果不一致？

Lighthouse 结果受运行环境（CPU、内存、网络）影响。CI 环境资源有限，得分可能略低。

建议：以 CI 结果为准，本地结果作为辅助参考。

## 配置文件

| 文件 | 说明 |
|------|------|
| `lighthouse.config.js` | Lighthouse CI 主配置（断言、收集参数） |
| `urls.json` | 待检测 URL 列表及认证需求 |
| `README.md` | 本文件，使用说明 |
