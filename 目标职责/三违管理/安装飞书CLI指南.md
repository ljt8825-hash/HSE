# 飞书 CLI 完整安装指南

## 📌 当前状态

✅ 已创建日报和周报生成工具
⚠️ Node.js 已安装但需要重启使环境变量生效
❌ 飞书 CLI 尚未安装

## 🔧 安装步骤

### 第一步：重启电脑

重启电脑是最简单的方式，让 Node.js 的环境变量生效。

### 第二步：验证 Node.js 安装

重启后，打开新的 PowerShell 终端，运行：

```powershell
node --version
npm --version
```

如果显示版本号，说明 Node.js 已就绪。

### 第三步：安装飞书 CLI

在 PowerShell 中运行：

```powershell
npm install -g @larksuite/cli
```

### 第四步：验证安装

```powershell
lark-cli --version
```

### 第五步：初始化配置

```powershell
lark-cli config init --new
```

按照提示输入：
- App ID: `<FEISHU_APP_ID>`（您提供的 App ID，从环境变量读取）
- App Secret: [您的 App Secret]（从飞书开放平台获取）

### 第六步：授权访问

```powershell
lark-cli auth login --domain base
```

## 📝 使用示例

安装完成后，您可以：

### 1. 查看多维表格
```powershell
lark-cli base +base-get --base-token <您的base-token>
```

### 2. 列出表格
```powershell
lark-cli base +table-list --base-token <您的base-token>
```

### 3. 读取记录
```powershell
lark-cli base +record-list --base-token <您的base-token> --table-name "表格名称"
```

## ⚡ 快速开始脚本

我已经为您创建了日报和周报生成工具：

### 生成日报
```powershell
# 生成今日日报
python generate_daily_report.py

# 生成指定日期的日报
python generate_daily_report_by_date.py 2026/6/4
```

### 生成周报
```powershell
python generate_weekly_summary.py
```

## 📞 获取帮助

如果遇到问题，请运行：

```powershell
lark-cli --help
```

或查看飞书开放平台文档。
