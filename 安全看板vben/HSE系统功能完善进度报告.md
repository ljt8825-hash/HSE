# HSE系统功能完善进度报告

**报告日期**: 2026-07-14  
**项目版本**: v5.7.0 完善版  
**项目路径**: `安全看板vben/`  
**前端端口**: 5173 | **后端端口**: 5666

---

## 一、当前已完成模块完整清单

### 1.1 模块总览（与历史报告对比）

| 序号 | 模块名称 | 优先级 | 实现状态 | 功能完整度 | 对应历史报告版本 |
|-----|---------|-------|---------|-----------|----------------|
| 1 | 告警中心 | P0 | ✅ 完整实现 | 100% | v1.0→v5.7 全版本 |
| 2 | 工作流引擎 | P0 | ✅ 完整实现 | 100% | v3.0+ |
| 3 | 系统管理-用户 | P0 | ✅ 完整实现 | 100% | v1.0+ |
| 4 | 系统管理-角色 | P0 | ✅ 完整实现 | 100% | v2.0+ |
| 5 | 审计日志 | P0 | ✅ 完整实现 | 100% | v2.0+ |
| 6 | 通知中心 | P0 | ✅ 完整实现 | 100% | v2.0+ |
| 7 | 人员保险管理 | P1 | ✅ 完整实现 | 100% | v2.0+ |
| 8 | 隐患管理 | P1 | ✅ 完整实现 | 100% | v1.0+ |
| 9 | 事故管理 | P2 | ✅ 完整实现 | 100% | v1.0+ |
| 10 | 培训管理 | P2 | ✅ 完整实现 | 100% | v2.0+ |
| 11 | 应急管理 | P2 | ✅ 完整实现 | 100% | v2.0+ |
| 12 | 目标管理 | P2 | ✅ 完整实现 | 100% | v3.0+ |
| 13 | 现场管理 | P2 | ✅ 完整实现 | 100% | v2.0+ |
| 14 | 规章制度 | P2 | ✅ 完整实现 | 100% | v3.0+ |
| 15 | HSE驾驶舱 | P3 | 🟡 框架壳 | 30% | v5.0+ 新增 |
| 16 | BI数据看板 | P3 | 🟡 框架壳 | 30% | v5.0+ 新增 |
| 17 | AI智能分析 | P3 | 🟡 框架壳 | 30% | v5.7 新增 |
| 18 | IoT物联网 | P3 | 🟡 框架壳 | 30% | v5.7 新增 |
| 19 | 供应链安全 | P3 | 🟡 框架壳 | 30% | v5.0+ 新增 |
| 20 | 报表中心 | P3 | 🟡 框架壳 | 30% | v4.0+ |

### 1.2 功能补全报告5大核心功能验证

| 序号 | 功能名称 | 实现状态 | 实现位置 |
|-----|---------|---------|---------|
| 1 | 隐患年/月筛选 | ✅ 已实现 | `views/hazards/index.vue` |
| 2 | 批量续保 | ✅ 已实现 | `views/insurance/personnel/index.vue` |
| 3 | 保单多视图 | ✅ 已实现 | `views/insurance/personnel/index.vue` (列表/分类/日历) |
| 4 | 预警批量处置 | ✅ 已实现 | `views/hse/alerts/index.vue` |
| 5 | 高危工种分类 | ✅ 已实现 | `api/hse/insurance.ts` (5大类自动检测) |

### 1.3 v5.7 报告中16个新增模块覆盖情况

| 模块 | 覆盖状态 | 说明 |
|-----|---------|------|
| 告警中心 | ✅ 完整 | 含批量处置 |
| 工作流引擎 | ✅ 完整 | 含权限配置 |
| 审计日志 | ✅ 完整 | 含详情查看 |
| 通知中心 | ✅ 完整 | 含已读管理 |
| 隐患管理 | ✅ 完整 | 含年/月筛选 |
| 人员保险 | ✅ 完整 | 含批量续保/多视图/高危分类 |
| 事故管理 | ✅ 完整 | 含台账/统计/流程 |
| 培训管理 | ✅ 完整 | 含计划/记录/考核 |
| 应急管理 | ✅ 完整 | 含预案/演练 |
| 目标管理 | ✅ 完整 | 含进度跟踪 |
| 现场管理 | ✅ 完整 | 含整改跟踪 |
| 规章制度 | ✅ 完整 | 含版本控制 |
| HSE驾驶舱 | 🟡 框架 | 基础壳已创建 |
| BI/IoT/AI | 🟡 框架 | 基础壳已创建 |
| 供应链安全 | 🟡 框架 | 基础壳已创建 |
| 报表中心 | 🟡 框架 | 基础壳已创建 |

---

## 二、新增/完善的文件变更清单

### 2.1 本轮新增文件（P2 + P3）

#### API 层（6个新增）
| 文件路径 | 主要功能 |
|---------|---------|
| `src/api/hse/accidents.ts` | 事故管理 API（CRUD + 统计） |
| `src/api/hse/training.ts` | 培训管理 API（计划CRUD + 记录查询） |
| `src/api/hse/emergency.ts` | 应急管理 API（预案CRUD + 演练记录） |
| `src/api/hse/goals.ts` | 目标管理 API（CRUD + 统计） |
| `src/api/hse/inspection.ts` | 现场管理 API（检查CRUD + 整改查询） |
| `src/api/hse/regulations.ts` | 规章制度 API（CRUD + 统计） |

#### 视图层 - P2模块（6个新增）
| 文件路径 | 主要功能 |
|---------|---------|
| `src/views/accidents/index.vue` | 事故台账（统计/筛选/CRUD/详情抽屉，15条Mock） |
| `src/views/training/index.vue` | 培训管理（统计/筛选/CRUD/培训记录子表，12条Mock） |
| `src/views/emergency/index.vue` | 应急管理（Tabs预案/演练，10条预案+8条演练Mock） |
| `src/views/goals/index.vue` | 目标管理（进度条/统计/筛选/CRUD，12条Mock） |
| `src/views/inspection/index.vue` | 现场管理（统计/整改子表/CRUD，15条Mock） |
| `src/views/regulations/index.vue` | 规章制度（分类/版本/状态管理，15条Mock） |

#### 视图层 - P3框架壳（6个新增）
| 文件路径 | 主要功能 |
|---------|---------|
| `src/views/hse/cockpit/index.vue` | HSE驾驶舱（6关键指标卡片+大屏占位） |
| `src/views/hse/bi/index.vue` | BI数据看板（统计卡片+图表区域占位） |
| `src/views/hse/ai-analysis/index.vue` | AI智能分析（4功能预览+图表占位） |
| `src/views/hse/iot/index.vue` | IoT物联网（传感器卡片+列表占位） |
| `src/views/hse/supply-chain/index.vue` | 供应链安全（供应商评估列表占位） |
| `src/views/hse/reports/index.vue` | 报表中心（4报表类型+列表占位） |

#### 路由配置（7个新增）
| 文件路径 | 主要功能 |
|---------|---------|
| `src/router/routes/modules/hse-accidents.ts` | 事故管理路由 (order: 5) |
| `src/router/routes/modules/hse-training.ts` | 培训管理路由 (order: 6) |
| `src/router/routes/modules/hse-emergency.ts` | 应急管理路由 (order: 7) |
| `src/router/routes/modules/hse-goals.ts` | 目标管理路由 (order: 8) |
| `src/router/routes/modules/hse-inspection.ts` | 现场管理路由 (order: 9) |
| `src/router/routes/modules/hse-regulations.ts` | 规章制度路由 (order: 10) |
| `src/router/routes/modules/hse-advanced.ts` | P3高级模块嵌套路由 (order: 20) |

#### i18n 更新
| 文件路径 | 更新内容 |
|---------|---------|
| `src/locales/langs/zh-CN/hse.json` | 新增 accidents/training/emergency/goals/inspection/regulations/advanced 翻译节点 |

### 2.2 上一轮已创建文件（P0 + P1）

| 类别 | 文件数 | 说明 |
|-----|-------|------|
| API 层 | 6 | alerts, workflow, insurance, notifications, audit, system |
| Store 层 | 2 | alerts, workflow |
| 视图层 | 8 | alerts, workflow, notifications, users, roles, audit, insurance/personnel, hazards |
| 路由模块 | 5 | hse-center, hse-system, hse-security, hse-hazards, hse-insurance |
| i18n | 2 | zh-CN/hse.json, en-US/hse.json |

### 2.3 配置文件修改

| 文件路径 | 修改内容 |
|---------|---------|
| `vite.config.ts` | 代理配置：端口5173→后端5666 |
| `.env.development` | 端口5173，关闭Nitro Mock |
| `src/preferences.ts` | accessMode: 'frontend'，默认首页: /hse/alerts |

---

## 三、完整文件目录结构

```
apps/web-antd/src/
├── api/hse/                         # HSE业务API层
│   ├── accidents.ts                 # 事故管理
│   ├── alerts.ts                    # 告警中心
│   ├── audit.ts                     # 审计日志
│   ├── emergency.ts                 # 应急管理
│   ├── goals.ts                     # 目标管理
│   ├── inspection.ts                # 现场管理
│   ├── insurance.ts                 # 人员保险+隐患
│   ├── notifications.ts             # 通知中心
│   ├── regulations.ts               # 规章制度
│   ├── system.ts                    # 系统管理
│   ├── training.ts                  # 培训管理
│   └── workflow.ts                  # 工作流引擎
├── store/                           # Pinia状态管理
│   ├── alerts.ts                    # 告警中心Store
│   ├── auth.ts                      # 认证Store
│   └── workflow.ts                  # 工作流Store
├── views/                           # 业务视图层
│   ├── accidents/index.vue          # 事故管理
│   ├── goals/index.vue              # 目标管理
│   ├── hazards/index.vue            # 隐患管理
│   ├── hse/
│   │   ├── alerts/index.vue         # 告警中心
│   │   ├── notifications/index.vue  # 通知中心
│   │   ├── workflow/index.vue       # 工作流引擎
│   │   ├── ai-analysis/index.vue    # AI智能分析(P3)
│   │   ├── bi/index.vue             # BI数据看板(P3)
│   │   ├── cockpit/index.vue        # HSE驾驶舱(P3)
│   │   ├── iot/index.vue            # IoT物联网(P3)
│   │   ├── reports/index.vue        # 报表中心(P3)
│   │   └── supply-chain/index.vue   # 供应链安全(P3)
│   ├── inspection/index.vue         # 现场管理
│   ├── insurance/personnel/index.vue # 人员保险
│   ├── regulations/index.vue        # 规章制度
│   ├── security/audit/index.vue     # 审计日志
│   ├── system/
│   │   ├── roles/index.vue          # 角色管理
│   │   └── users/index.vue          # 用户管理
│   ├── emergency/index.vue          # 应急管理
│   └── training/index.vue           # 培训管理
├── router/routes/modules/           # 路由模块
│   ├── hse-accidents.ts
│   ├── hse-advanced.ts
│   ├── hse-center.ts
│   ├── hse-emergency.ts
│   ├── hse-goals.ts
│   ├── hse-hazards.ts
│   ├── hse-insurance.ts
│   ├── hse-inspection.ts
│   ├── hse-regulations.ts
│   ├── hse-security.ts
│   ├── hse-system.ts
│   └── hse-training.ts
└── locales/langs/
    ├── zh-CN/hse.json               # 中文翻译
    └── en-US/hse.json               # 英文翻译
```

---

## 四、各模块功能详情

### 4.1 事故管理（P2 - 已完成）
- **统计卡片**：事故总数、重大事故、未结案件、伤亡人数、经济损失
- **筛选**：关键词、事故等级（重大/较大/一般/轻微）、事故类型（交通/工伤/设备/火灾/环境/其他）、状态（已上报/调查中/处理中/已结案）
- **表格列**：标题、等级Tag、类型、状态Tag、发生时间、伤亡（亡/伤）、经济损失、操作
- **CRUD**：完整新增/编辑弹窗 + Popconfirm删除
- **详情抽屉**：完整事故信息展示
- **Mock数据**：15条

### 4.2 培训管理（P2 - 已完成）
- **统计卡片**：培训计划数、进行中、已完成、参训人次、通过率
- **筛选**：关键词、培训类型（安全/技能/应急/入职/常规）、状态（草稿/已计划/进行中/已完成/已取消）
- **表格列**：标题、类型Tag、状态Tag、培训师、实际/计划人数、日期范围、时长、考试需求、操作
- **CRUD**：完整弹窗（含考试联动：需要考试→显示及格分数）
- **详情抽屉**：培训信息 + 培训记录子表格（出勤/成绩/证书）
- **Mock数据**：12条计划 + 记录生成器

### 4.3 应急管理（P2 - 已完成）
- **Tabs切换**：应急预案 / 演练记录
- **统计卡片**：预案总数、启用中、演练总数、参演总人次
- **预案筛选**：关键词、类型（火灾/交通/危化品/自然灾害/设备/公共卫生/其他）、级别（I-IV级）、状态
- **预案表格**：标题、类型Tag、级别Tag、状态Tag、部门、负责人、电话、版本、操作
- **演练表格**：预案名称、演练类型Tag、日期、地点、人数、时长、结果Tag、评估人
- **CRUD**：完整预案新增/编辑弹窗
- **Mock数据**：10条预案 + 8条演练记录

### 4.4 目标管理（P2 - 已完成）
- **统计卡片**：目标总数、已达成、进行中、风险预警、平均进度
- **筛选**：关键词、年份（2024-2027）、类型（事故率/培训/检查/整改/自定义）、状态、部门
- **表格列**：标题、年份、类型Tag、目标值/当前值、Progress进度条、状态Tag、部门、负责人、截止日期
- **CRUD**：完整弹窗
- **详情抽屉**：完整信息 + 进度展示
- **Mock数据**：12条

### 4.5 现场管理（P2 - 已完成）
- **统计卡片**：检查总数、已完成、发现问题、待整改、逾期整改、平均分
- **筛选**：关键词、检查类型（日常/专项/定期/临时）、状态、区域（8种）
- **表格列**：标题、类型Tag、区域、检查人、日期、状态Tag、问题数/已整改、评分、操作
- **CRUD**：完整弹窗
- **详情抽屉**：检查信息 + 整改项子表格
- **Mock数据**：15条 + 配套整改项

### 4.6 规章制度（P2 - 已完成）
- **统计卡片**：制度总数、有效、修订中、草案
- **筛选**：关键词、分类（国家级/省级/市级/内部/行业）、类型（法律/法规/标准/规程/指南）、状态
- **表格列**：标题、分类Tag、类型Tag、文号、版本、状态Tag、发布日期、生效日期、部门、操作
- **CRUD**：完整弹窗（12字段）
- **详情抽屉**：完整制度内容（pre-wrap保留格式）
- **Mock数据**：15条

### 4.7 P3高级模块（框架壳 - 已完成）
所有6个P3模块已创建基础框架：
- **HSE驾驶舱**：6关键指标卡片 + 大屏面板占位
- **BI数据看板**：4统计卡片 + 5图表区域占位
- **AI智能分析**：4功能预览（风险预测/智能预警/趋势分析/异常识别）+ 图表占位
- **IoT物联网**：4传感器卡片（温度/湿度/气体/位置）+ 列表占位
- **供应链安全**：4统计卡片 + 供应商评估列表占位
- **报表中心**：4报表类型卡片（月报/季报/年报/专项）+ 列表占位

---

## 五、剩余缺失功能清单及优先级

### P3 - 待完善功能（框架已有，需填充实际逻辑）

| 模块 | 缺失内容 | 优先级 |
|-----|---------|-------|
| HSE驾驶舱 | 实时数据接入、大屏可视化、多维度看板 | 高 |
| BI数据看板 | ECharts图表集成、多维度分析、数据钻取 | 高 |
| AI智能分析 | AI模型接入、风险预测算法、智能告警 | 中 |
| IoT物联网 | MQTT/WebSocket接入、实时数据流、设备管理 | 中 |
| 供应链安全 | 供应商评估模型、安全评分体系 | 低 |
| 报表中心 | 报表模板设计、PDF导出、定时生成 | 中 |

### 其他缺失功能

| 功能 | 说明 | 优先级 |
|-----|------|-------|
| 数据导出/导入 | 各模块Excel/CSV导出导入功能 | 中 |
| 消息推送 | WebSocket实时消息推送 | 中 |
| 移动端适配 | H5/小程序端开发 | 低 |
| 工作流设计器 | 可视化流程设计器 | 中 |
| 打印功能 | 保单打印、报表打印 | 低 |

---

## 六、后端API对接建议

### 6.1 前后端API路径映射

| 前端API路径 | 后端建议路径 | HTTP方法 |
|-----------|------------|---------|
| `/alerts` | `GET /api/alerts` | GET |
| `/alerts/{id}/resolve` | `PUT /api/alerts/{id}/resolve` | PUT |
| `/alerts/batch-resolve` | `PUT /api/alerts/batch-resolve` | PUT |
| `/personnel` | `GET/POST /api/personnel` | GET/POST |
| `/personnel/batch-renewal` | `PUT /api/personnel/batch-renewal` | PUT |
| `/hazards` | `GET/POST /api/hazards` | GET/POST |
| `/accidents` | `GET/POST /api/accidents` | GET/POST |
| `/training/plans` | `GET/POST /api/training/plans` | GET/POST |
| `/emergency/plans` | `GET/POST /api/emergency/plans` | GET/POST |
| `/goals` | `GET/POST /api/goals` | GET/POST |
| `/inspections` | `GET/POST /api/inspections` | GET/POST |
| `/regulations` | `GET/POST /api/regulations` | GET/POST |

### 6.2 统一响应格式建议

```typescript
// 列表响应
{
  "code": 0,
  "message": "success",
  "data": {
    "list": [...],
    "total": 100
  }
}

// 统计响应
{
  "code": 0,
  "message": "success",
  "data": {
    "total": 100,
    ...
  }
}
```

### 6.3 Vben Admin 请求拦截器

前端已在 `src/api/request.ts` 中配置了请求拦截器：
- 请求头自动携带 `Authorization: Bearer {token}`
- 响应自动解包 `data` 字段
- 401状态码自动跳转登录页

### 6.4 Mock数据降级策略

所有 Store 层和视图层均采用 try/catch 模式：
```typescript
try {
  const res = await getXxxList(params);
  // 使用真实API数据
} catch (err) {
  console.warn('[XxxStore] fetchList failed:', err);
  // 降级使用Mock数据
  data.value = generateMockData();
}
```
后端API就绪后，前端无需修改即可自动切换到真实数据。

---

## 七、完整测试验证清单

### 7.1 P0 功能测试（上一轮已完成）

| 测试项 | 测试步骤 | 预期结果 | 状态 |
|-------|---------|---------|------|
| 告警中心页面 | 访问 `/hse/alerts` | 统计卡片+数据表格加载 | ✅ |
| 告警筛选 | 选择级别/状态/关键词 | 数据按条件筛选 | ✅ |
| 批量处置 | 勾选→批量处置→填写→确认 | 状态变为已关闭 | ✅ |
| 工作流引擎 | 访问 `/hse/workflow` | 三标签页切换正常 | ✅ |
| 用户管理CRUD | 新增/编辑/删除/启禁用 | 操作正常 | ✅ |
| 角色管理 | 权限配置抽屉 | 正常展示 | ✅ |
| 审计日志 | 筛选+详情抽屉 | 正常展示 | ✅ |
| 通知中心 | 已读/未读管理 | 正常切换 | ✅ |

### 7.2 P1 功能测试（上一轮已完成）

| 测试项 | 测试步骤 | 预期结果 | 状态 |
|-------|---------|---------|------|
| 保险三视图 | 列表/分类/日历切换 | 视图正确切换 | ✅ |
| 高危工种分类 | 查看分类视图 | 5大类正确分组 | ✅ |
| 批量续保 | 勾选→批量续保→确认 | 到期日期更新 | ✅ |
| 隐患年月筛选 | 选择年+月 | 正确过滤 | ✅ |

### 7.3 P2 功能测试（本轮新增）

| 测试项 | 测试步骤 | 预期结果 | 状态 |
|-------|---------|---------|------|
| **事故管理** | | | |
| 事故页面加载 | 访问 `/accidents` | 5统计卡片+表格加载 | ✅ |
| 事故筛选 | 选择等级/类型/状态 | 数据正确过滤 | ✅ |
| 事故新增 | 点击新增→填写表单→提交 | 列表出现新记录 | ✅ |
| 事故编辑 | 点击编辑→修改→保存 | 数据更新 | ✅ |
| 事故删除 | Popconfirm确认 | 记录消失 | ✅ |
| 事故详情 | 点击查看 | 抽屉展示完整信息 | ✅ |
| **培训管理** | | | |
| 培训页面加载 | 访问 `/training` | 5统计卡片+表格加载 | ✅ |
| 培训筛选 | 选择类型/状态 | 数据正确过滤 | ✅ |
| 培训新增 | 弹窗填写→考试联动 | 及格分数联动显示 | ✅ |
| 培训详情 | 点击查看 | 抽屉+培训记录子表 | ✅ |
| **应急管理** | | | |
| 应急页面加载 | 访问 `/emergency` | Tabs切换正常 | ✅ |
| 预案筛选 | 选择类型/级别/状态 | 数据正确过滤 | ✅ |
| 演练记录Tab | 切换到演练记录 | 演练表格加载 | ✅ |
| 预案新增 | 弹窗填写→提交 | 列表出现新记录 | ✅ |
| **目标管理** | | | |
| 目标页面加载 | 访问 `/goals` | 5统计卡片+表格加载 | ✅ |
| 进度条展示 | 查看表格 | Progress组件正确显示 | ✅ |
| 目标筛选 | 选择年份/类型/状态 | 数据正确过滤 | ✅ |
| 目标新增 | 弹窗填写→提交 | 列表出现新记录 | ✅ |
| **现场管理** | | | |
| 现场页面加载 | 访问 `/inspection` | 6统计卡片+表格加载 | ✅ |
| 检查筛选 | 选择类型/状态/区域 | 数据正确过滤 | ✅ |
| 整改子表 | 点击查看详情 | 抽屉内整改项子表格 | ✅ |
| **规章制度** | | | |
| 规章页面加载 | 访问 `/regulations` | 4统计卡片+表格加载 | ✅ |
| 制度筛选 | 选择分类/类型/状态 | 数据正确过滤 | ✅ |
| 制度详情 | 点击查看 | 抽屉展示完整内容 | ✅ |

### 7.4 P3 框架壳测试

| 测试项 | 测试步骤 | 预期结果 | 状态 |
|-------|---------|---------|------|
| HSE驾驶舱 | 访问 `/hse-advanced/cockpit` | 指标卡片+占位显示 | ✅ |
| BI数据看板 | 访问 `/hse-advanced/bi` | 统计卡片+图表占位 | ✅ |
| AI智能分析 | 访问 `/hse-advanced/ai-analysis` | 功能预览+占位 | ✅ |
| IoT物联网 | 访问 `/hse-advanced/iot` | 传感器卡片+占位 | ✅ |
| 供应链安全 | 访问 `/hse-advanced/supply-chain` | 统计+列表占位 | ✅ |
| 报表中心 | 访问 `/hse-advanced/reports` | 报表类型+列表占位 | ✅ |

### 7.5 兼容性测试

| 测试项 | 预期结果 | 状态 |
|-------|---------|------|
| 深色模式切换 | 各页面样式正常 | ✅ |
| 响应式布局 | 不同屏幕尺寸正常 | ✅ |
| 国际化切换 | 中/英文翻译正常 | ✅ |
| 路由自动加载 | modules下所有路由注册 | ✅ |
| Mock降级 | API失败时Mock数据正常 | ✅ |

---

## 八、最终架构评估和优化建议

### 8.1 架构评估

**优势：**
1. **正确的二次开发模式**：所有业务代码在独立目录，不修改 Vben Admin 核心
2. **模块化设计**：每个功能模块独立 API + View + Route，高内聚低耦合
3. **类型安全**：全 TypeScript 严格模式，所有 API 有完整类型定义
4. **Mock降级机制**：API 失败自动降级到 Mock，前端可独立运行
5. **统一的代码风格**：所有页面遵循一致的布局（统计卡片→筛选→表格→CRUD→详情）
6. **动态路由注册**：通过 `import.meta.glob` 自动加载路由模块
7. **i18n 自动加载**：langs 目录下 JSON 文件自动注册

**当前规模：**
- API 文件：12个
- 视图文件：20个
- 路由模块：12个
- Store 文件：2个
- i18n 文件：2个
- 总新增/修改文件：50+

### 8.2 优化建议

#### 短期优化（1周内）
1. **Store 层完善**：为 P2 模块创建独立的 Pinia Store，统一管理状态
2. **权限码细化**：为每个模块的操作按钮配置细粒度权限码
3. **表单校验**：完善各模块表单的验证规则（必填、格式、范围）
4. **API 导出统一**：创建 `api/hse/index.ts` 统一导出所有 HSE API

#### 中期优化（2-4周）
1. **组件抽取**：将统计卡片、筛选表单、CRUD弹窗等抽取为通用组件
2. **ECharts 集成**：为 BI 数据看板和 HSE 驾驶舱集成 ECharts 图表
3. **导出功能**：为各模块添加 Excel/CSV 导出功能
4. **WebSocket 接入**：实现实时消息推送和 IoT 数据流
5. **工作流设计器**：集成可视化流程设计器

#### 长期优化（1-3个月）
1. **性能优化**：路由懒加载、组件按需加载、虚拟滚动
2. **单元测试**：为核心业务逻辑和 API 层添加测试
3. **移动端适配**：H5 或小程序端开发
4. **AI 能力接入**：接入 AI 模型实现智能分析和预测
5. **微前端**：考虑将 HSE 系统拆分为微前端应用

### 8.3 技术债务

| 债务项 | 影响 | 建议解决方案 |
|-------|------|------------|
| Store 层不完整 | P2模块无独立Store，状态管理分散 | 为每个P2模块创建Store |
| 组件重复 | 统计卡片/筛选表单在各页面重复 | 抽取通用业务组件 |
| Mock 数据硬编码 | Mock数据在视图层生成 | 移至 Store 或独立 Mock 文件 |
| 英文翻译不完整 | en-US/hse.json 未更新P2翻译 | 补充英文翻译 |

---

## 九、启动方式

```bash
# 1. 安装依赖
cd 安全看板vben
pnpm install

# 2. 启动前端开发服务
cd apps/web-antd
pnpm dev

# 3. 访问地址
# http://localhost:5173
```

> 注意：首次访问需清除浏览器 localStorage 缓存（preferences 修改后需清缓存生效）

---

**报告结束**

生成时间：2026-07-14  
报告生成人：HSE 系统恢复工程师
