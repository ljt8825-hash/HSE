# HSE智能报告中心实施报告

## 一、项目概述

### 1.1 项目背景

本项目是宁津环卫HSE安全管理系统数字化升级的第七阶段，旨在建设HSE智能报告中心，实现安全报告的自动生成、预览和导出功能。基于已有的事件中心、风险闭环、智能工作流、安全统计中心和领导驾驶舱数据，构建完整的报告生成体系。

### 1.2 阶段目标

实现自动安全报告生成：

- **报告模板管理**：支持日报、周报、月报、年报四种模板
- **自动报告生成**：基于统计数据自动生成安全月报和年度安全总结
- **报告预览**：在线预览报告内容
- **报告导出**：支持PDF和Word格式导出
- **历史管理**：报告历史记录查询和管理

### 1.3 实施原则

严格遵守增量原则，**不修改已有业务表**，继续采用统计层架构实现。

---

## 二、数据库新增

### 2.1 报告模板表（hse_report_templates）

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | BIGSERIAL | 主键 |
| template_name | VARCHAR(128) | 模板名称 |
| report_type | VARCHAR(20) | 报告类型（daily/weekly/monthly/yearly） |
| content_config | JSONB | 内容配置（包含sections和format） |
| status | VARCHAR(20) | 状态（active/inactive） |
| created_by | BIGINT | 创建人ID |
| created_at | TIMESTAMPTZ | 创建时间 |
| updated_at | TIMESTAMPTZ | 更新时间 |

**索引：**
- `idx_hse_report_templates_type`：report_type
- `idx_hse_report_templates_status`：status

**默认模板数据：**

| 模板名称 | 类型 | 启用状态 |
|----------|------|----------|
| 安全日报模板 | daily | active |
| 安全周报模板 | weekly | active |
| 安全月报模板 | monthly | active |
| 年度安全总结模板 | yearly | active |

**content_config结构：**

```json
{
  "sections": [
    {"name": "安全总体情况", "enabled": true},
    {"name": "事故情况", "enabled": true},
    {"name": "隐患分析", "enabled": true},
    {"name": "风险变化", "enabled": true},
    {"name": "整改情况", "enabled": true},
    {"name": "重点关注问题", "enabled": true},
    {"name": "改进建议", "enabled": true}
  ],
  "format": {
    "header": true,
    "footer": true,
    "watermark": "安全月报",
    "summary": true,
    "comparison": true
  }
}
```

### 2.2 报告记录表（hse_reports）

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | BIGSERIAL | 主键 |
| report_name | VARCHAR(256) | 报告名称 |
| report_type | VARCHAR(20) | 报告类型 |
| report_period | VARCHAR(20) | 报告周期（唯一约束） |
| report_date | DATE | 报告日期 |
| report_data | JSONB | 报告数据（结构化数据） |
| report_html | TEXT | 报告HTML内容（用于预览和导出） |
| generated_by | BIGINT | 生成人ID |
| status | VARCHAR(20) | 状态（generated/exported/archived） |
| created_at | TIMESTAMPTZ | 创建时间 |

**唯一约束：** (report_type, report_period)

**索引：**
- `idx_hse_reports_type`：report_type
- `idx_hse_reports_period`：report_period
- `idx_hse_reports_date`：report_date
- `idx_hse_reports_status`：status

### 2.3 报告汇总视图

#### v_hse_monthly_report_summary

用于月报数据汇总，聚合月度统计表数据。

#### v_hse_yearly_report_summary

用于年报数据汇总，聚合年度统计表数据。

---

## 三、报告服务

### 3.1 服务功能

```javascript
reportService = {
  generateReport,       // 生成报告（支持四种类型）
  generateDailyReport,  // 生成日报数据
  generateWeeklyReport, // 生成周报数据
  generateMonthlyReport, // 生成月报数据
  generateYearlyReport,  // 生成年报数据
  generateSummary,      // 生成报告摘要
  generateSuggestions,  // 生成改进建议
  generateHtmlReport,   // 生成HTML报告
  getReportHistory,     // 查询历史报告
  getReportById,        // 获取报告详情
  deleteReport          // 删除报告
}
```

### 3.2 报告生成流程

```
┌─────────────────────┐
│  1. 用户选择类型和周期  │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│  2. 调用generateReport │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│  3. 根据类型调用对应方法 │
│  (日/周/月/年报)     │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│  4. 查询统计数据      │
│  (从统计层获取)       │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│  5. 生成结构化报告数据  │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│  6. 生成HTML报告     │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│  7. 写入数据库       │
│  INSERT ... ON CONFLICT │
└─────────────────────┘
```

### 3.3 报告内容结构

#### 月报内容

| 章节 | 内容说明 |
|------|----------|
| 安全总体情况 | 报告摘要、总体评价 |
| 事故情况 | 事故数量、分析 |
| 隐患分析 | 隐患数量、分析 |
| 风险变化 | 风险等级分布、变化趋势 |
| 整改情况 | 整改数量、完成率 |
| 重点关注问题 | 逾期任务、待处理事项 |
| 改进建议 | 自动生成的改进建议 |

#### 年报内容

在月报基础上增加：

| 章节 | 内容说明 |
|------|----------|
| 年度总结 | 全年工作总结 |
| 下年度计划 | 下一年度工作计划 |

### 3.4 改进建议生成算法

根据以下条件自动生成改进建议：

| 条件 | 建议内容 |
|------|----------|
| 事故数 > 0 | 加强事故原因分析，落实防范措施 |
| 隐患数 > 5 | 加大隐患排查力度 |
| 任务完成率 < 80% | 提高任务执行效率 |
| 逾期任务 > 0 | 加强逾期任务管控 |
| 整改完成率 < 90% | 加快整改进度 |

---

## 四、接口设计

### 4.1 接口列表

| 接口路径 | HTTP方法 | 功能描述 |
|----------|----------|----------|
| `/api/hse/report/generate` | POST | 生成报告 |
| `/api/hse/report/history` | GET | 历史报告查询 |
| `/api/hse/report/:id` | GET | 获取报告详情 |
| `/api/hse/report/:id` | DELETE | 删除报告 |
| `/api/hse/report/templates` | GET | 获取报告模板列表 |

### 4.2 生成报告接口

**路径：** `POST /api/hse/report/generate`

**请求参数：**

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| reportType | string | 是 | 报告类型（daily/weekly/monthly/yearly） |
| reportPeriod | string | 是 | 报告周期（如2026-07） |
| generatedBy | number | 否 | 生成人ID |

**返回示例：**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "id": 1,
    "reportName": "安全月报 - 2026-07",
    "reportType": "monthly",
    "reportPeriod": "2026-07",
    "reportData": { ... },
    "reportHtml": "<html>...</html>"
  }
}
```

### 4.3 历史报告查询接口

**路径：** `GET /api/hse/report/history`

**查询参数：**

| 参数名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| reportType | string | - | 按类型筛选 |
| page | number | 1 | 页码 |
| pageSize | number | 20 | 每页数量 |

**返回示例：**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "list": [...],
    "total": 100,
    "page": 1,
    "pageSize": 20
  }
}
```

---

## 五、前端实现

### 5.1 HSE报告中心页面

**页面路径：** `/hse/report/index`

**页面组成：**

```
┌─────────────────────────────────────────────────────┐
│  HSE智能报告中心                                     │  ← 顶部标题栏
├─────────────────────────────────────────────────────┤
│  [报告类型选择] [周期选择] [生成报告] [刷新列表]      │  ← 操作区域
├─────────────────────────────────────────────────────┤
│  报告预览区域（可选）                                 │  ← 预览面板
│  [导出PDF] [导出Word] [关闭预览]                     │
├─────────────────────────────────────────────────────┤
│  历史报告列表                                        │  ← 报告表格
│  名称 | 类型 | 周期 | 生成时间 | 状态 | 操作         │
└─────────────────────────────────────────────────────┘
```

### 5.2 功能模块

#### 5.2.1 报告类型选择

支持四种报告类型：

| 类型 | 选择方式 |
|------|----------|
| 日报 | 日期选择器 |
| 周报 | 文本输入（格式：2026-W01） |
| 月报 | 月份选择器 |
| 年报 | 年份选择器 |

#### 5.2.2 报告预览

- 内嵌HTML预览
- 支持格式化展示
- 显示完整报告内容

#### 5.2.3 报告导出

**PDF导出：**
- 通过打印预览实现
- 用户选择"另存为PDF"

**Word导出：**
- 生成.doc格式文件
- 直接下载

#### 5.2.4 历史报告管理

| 操作 | 说明 |
|------|------|
| 预览 | 查看报告详情 |
| 导出 | 导出为PDF/Word |
| 删除 | 删除报告（带确认） |

---

## 六、测试验证

### 6.1 测试结果

| 测试项 | 结果 |
|--------|------|
| hse_report_templates 表存在 | ✓ 通过 |
| hse_reports 表存在 | ✓ 通过 |
| v_hse_monthly_report_summary 视图存在 | ✓ 通过 |
| v_hse_yearly_report_summary 视图存在 | ✓ 通过 |
| 报告模板查询 | ✓ 通过 |
| 月报模板存在 | ✓ 通过 |
| 月报生成 | ✓ 通过 |
| 年报生成 | ✓ 通过 |
| 历史报告查询 | ✓ 通过 |
| 报告详情查询 | ✓ 通过 |

**测试结论：** 所有10项测试全部通过，报告中心功能正常。

### 6.2 测试数据

- 月报生成：成功生成2026年7月安全月报（3305字符HTML）
- 年报生成：成功生成2026年度安全总结报告

---

## 七、实施文件清单

### 7.1 后端文件

| 文件路径 | 说明 |
|----------|------|
| `server/routes/hse-report.js` | 报告中心路由 |
| `server/services/reportService.js` | 报告服务 |
| `server/app.js` | 路由注册（新增引用） |
| `server/sql/hse_report_v52_migration.sql` | SQL迁移脚本 |

### 7.2 前端文件

| 文件路径 | 说明 |
|----------|------|
| `安全看板vben/apps/web-antd/src/api/hse/report.ts` | 报告API接口定义 |
| `安全看板vben/apps/web-antd/src/views/hse/report/index.vue` | 报告中心页面 |
| `安全看板vben/apps/web-antd/src/router/routes/modules/hse-report.ts` | 路由配置 |

### 7.3 测试文件

| 文件路径 | 说明 |
|----------|------|
| `server/test/hse-report-test.js` | 报告测试脚本 |
| `server/test/migrate-report.js` | 迁移测试脚本 |

---

## 八、总结

### 8.1 完成内容

1. **数据库层**：新增2张表（报告模板、报告记录）+ 2个视图
2. **报告服务**：完整的报告生成服务，支持四种报告类型
3. **接口层**：5个接口（生成、历史、详情、删除、模板）
4. **前端层**：HSE报告中心页面，支持生成、预览、导出
5. **测试验证**：编写测试脚本，验证所有功能正常

### 8.2 核心亮点

**自动化报告生成：**
- 根据统计数据自动生成报告
- 支持日报/周报/月报/年报
- 自动生成摘要和改进建议

**多样化输出：**
- HTML预览
- PDF导出（通过打印）
- Word导出（直接下载）

**模板化设计：**
- 四种默认模板
- 可配置的内容章节
- 可自定义格式

**数据持久化：**
- 报告内容完整保存
- 支持历史查询
- 支持重复生成覆盖

### 8.3 后续建议

1. **定时任务**：配置每月/每年自动生成报告
2. **邮件推送**：报告生成后自动发送邮件通知
3. **模板定制**：支持用户自定义报告模板
4. **图表插入**：在报告中插入统计图表
5. **数据对比**：增加同比/环比数据对比
6. **审批流程**：报告审批和发布流程

---

**版本：** v5.2  
**日期：** 2026-07-11  
**状态：** 已完成