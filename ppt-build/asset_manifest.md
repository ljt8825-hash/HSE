# Asset Manifest — 素材清单

> 规范：每条素材标注 `状态`。真实存在的文件给**绝对路径**；不存在的标注生成方式。
> 状态枚举：`已存在文件` / `已存在目录` / `需生成(浏览器截图)` / `需生成(图表)` / `需AI出图` / `可选品牌资产`

## A. 真实截图（仅此 2 张，可直接用）
| 用途 | 状态 | 路径 |
|---|---|---|
| 阶段一 原型回顾 | 已存在文件 | `F:\deploy\hse-dashboard\安全管理系统\screenshot_light_initial.png` |
| 阶段四 事故模块列宽拖拽 | 已存在文件 | `F:\deploy\hse-dashboard\accidents_drag_header.png` |

> 除上述 2 张外，**当前无其它系统界面真实截图**。任何驾驶舱/首页/移动端界面图均不得声称已存在。

## B. 证据文档（均为已存在文件，可作引用/摘录/溯源）
### B1 时间线与版本
- `F:\deploy\hse-dashboard\CHANGELOG.md` （[1.0.0]2026-06-20 / [2.0.0]2026-07-07 / [3.0.0]2026-07-10 生产就绪）
- `F:\deploy\hse-dashboard\原稿.docx` （修改时间 2026-06-21 20:34，起点证据）
- `F:\deploy\hse-dashboard\当前系统功能地图.md` （2026-07-24，系统目标/规模来源）

### B2 阶段一·看板期
- `F:\deploy\hse-dashboard\安全管理系统\kanban-prototype.html`
- `F:\deploy\hse-dashboard\安全管理系统\任务管理界面.html`
- `F:\deploy\hse-dashboard\安全管理系统\DataEngine.js`
- `F:\deploy\hse-dashboard\安全管理系统\navigation_routes.js`
- `F:\deploy\hse-dashboard\安全管理系统\index_original.html`
- `F:\deploy\hse-dashboard\安全管理系统\index.html`

### B3 阶段二·HTML 巨型原型期
- `F:\deploy\hse-dashboard\安全管理系统\objectives_module.js` （156KB，巨型原型铁证）
- `F:\deploy\hse-dashboard\安全管理系统\hazard_module.js`
- `F:\deploy\hse-dashboard\安全管理系统\traffic_2026_module.js`
- `F:\deploy\hse-dashboard\安全管理系统\现场管理模块.js`
- `F:\deploy\hse-dashboard\安全管理系统\frontend-refactor-report-step1.md` ~ `step5.md` （HTML→Vue 重构决策）

### B4 阶段三·Vben 初期（恢复官方基线）
- `F:\deploy\hse-dashboard\Vben_Admin_Restore_to_Official_Report.md` （第14行 Git 铁证；1.1 概述「与官方显著偏离」）
- `F:\deploy\hse-dashboard\Vben_Admin_Final_Project_Status.md`
- `F:\deploy\hse-dashboard\Vben_Admin_Post_Restore_Optimization_Report.md`
- `F:\deploy\hse-dashboard\TRAE_Work_CN_质量保障与测试体系_提示词.md`
- `F:\deploy\hse-dashboard\TRAE_Work_CN_安全加固与审计_提示词.md`
- `F:\deploy\hse-dashboard\TRAE_Work_CN_可观测性平台搭建_提示词.md`
- `F:\deploy\hse-dashboard\TRAE_Work_CN_性能压测与优化_提示词.md`
- `F:\deploy\hse-dashboard\TRAE_Work_CN_E2E测试补全_提示词.md`

### B5 阶段四·Vben 中期（AI 进化）
- `F:\deploy\hse-dashboard\AI报告生成设计.md`
- `F:\deploy\hse-dashboard\HSE AI分析模型设计.md`
- `F:\deploy\hse-dashboard\项目公司风险智能分析模型设计.md`
- `F:\deploy\hse-dashboard\项目公司HSE知识库设计方案.md`
- `F:\deploy\hse-dashboard\AI Prompt版本管理设计.md`

### B6 踩坑证据
- 副本地狱：`F:\deploy\hse-dashboard\车辆安全风险管理设计.md` + `车辆安全风险管理设计-v1.2.md`；`交通安全风险管理设计.md` + `-v1.1/-v1.2/-v1.3.md`；`考核模型最终冻结报告.md` + `v1.1.md`；`集团HSE考核指标字典.md` + `v1.1.md`；`驾驶员安全行为风险设计-v1.1.md`/`-v1.2.md`；`hse-employee-master-data-design.md` + `-v1.1-final`/`-v1.2-freeze`/`-v2.0-final.md`；`batch-import-design.md` + `-v1.1`/`-v1.2-final.md`；`员工花名册导入验证报告-v1.0.md`/`-v1.1.md`
- 备份目录（已存在目录）：`F:\deploy\hse-dashboard\_backup_packages_20260714092939\`、`_temp_clean\`、`backups\`、`.归档_20260630\`、`安全管理系统\backups\`、`安全管理系统\.trash\`
- 自造轮子/偏离：`Vben_Admin_Restore_to_Official_Report.md` 1.1 概述；`F:\deploy\hse-dashboard\2026-07-07_变更记录文档.md`（JSX/Naive UI 基础错误）
- 功能重复：`F:\deploy\hse-dashboard\功能重复与合并分析报告.md`、`左侧栏重复功能分析.md`、`旧功能到新业务模块映射表.md`、`业务归属待确认清单.md`

### B7 可选品牌资产
- `F:\deploy\hse-dashboard\北控城市服务图标.jpg` （可选，封面/页脚）
- `F:\deploy\hse-dashboard\北控城市服务logo.ai` （可选，高清矢量）

## C. 需生成 / 需 AI 出图（严禁声称已存在）
| 素材 | 状态 | 说明 / 来源 |
|---|---|---|
| 系统功能架构图（PC 10 菜单 + 移动 6 模块 + HSE 闭环） | 需生成(图表) | 基于 `当前系统功能地图.md` 提取，建议下游用 diagram 生成 |
| 四阶段时间线大图（动画底图） | 需生成(图表) | 基于 `CHANGELOG.md` + 阶段报告，建议 SVG/HTML |
| 首页驾驶舱 / 风险分析页截图 | 需生成(浏览器截图) 或 需AI出图 | 无真实截图；若环境可起 `安全看板vben` 则浏览器截图，否则 AI 出概念图并标注「示意」 |
| 移动端 6 模块界面 | 需生成(浏览器截图) 或 需AI出图 | 同上 |
| 白嫖策略双杠杆流动示意图 | 需AI出图 或 需生成(图表) | 同软件轮换 + 跨软件切换的流向，P16 用 |
| 文件副本地狱堆叠可视化 | 需生成(图表) | 可用 B6 真实副本清单做「文件树堆叠」可视化 |
| 踩坑→根因映射图 | 需生成(图表) | P13 用 |
| AI 协作分工三角色图 | 需生成(图表) | P14 用 |
| 提示词 v1→vn 演进图 | 需生成(图表) | P15 用 |
| CTA 收束背景图 | 需AI出图 | P19 用，氛围图 |

## D. 下游渲染指引
- 所有 `已存在文件` 路径可直接 `Read` 取内容（摘录关键句/数字），不要整篇贴。
- 真实截图仅 2 张，优先放在 P6、P9（或 P20 回顾）。
- 标注 `需生成`/`需AI出图` 的，由 guizang / frontend-slides 在渲染阶段解决；视频位见 `video_slots.json`。
- 任何页面不得出现未被本 manifest 列出的「假截图」路径。
